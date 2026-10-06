// Pulls fixtures + odds and final scores from The Odds API (the-odds-api.com),
// writes them to Firestore, and settles every open bet on finished matches.
// Runs on a schedule from .github/workflows/sync.yml. Safe to run as often as
// you like: it keeps track of API credits and only calls the API when needed.
//
// Env:
//   ODDS_API_KEY              required, from the-odds-api.com
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (or use GOOGLE_APPLICATION_CREDENTIALS)
//   LEAGUES                   comma list of Odds API sport keys (default below)
//   ODDS_REFRESH_HOURS        how often to refresh odds per league (default 12)
//   DAYS_AHEAD                how far ahead to load fixtures (default 7)
//   MIN_CREDITS_FOR_ODDS      stop refreshing odds below this many credits, so
//                             results can still be fetched (default 40)

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { priceMap, outcome } from '../public/markets.js';

const env = process.env;
const API = env.ODDS_API_BASE || 'https://api.the-odds-api.com/v4';
const KEY = env.ODDS_API_KEY;
const LEAGUES = (env.LEAGUES || 'soccer_epl,soccer_spain_la_liga,soccer_italy_serie_a').split(',').map((s) => s.trim()).filter(Boolean);
const ODDS_REFRESH_MS = Number(env.ODDS_REFRESH_HOURS || 12) * 3600e3;
const DAYS_AHEAD = Number(env.DAYS_AHEAD || 7);
const MIN_CREDITS_FOR_ODDS = Number(env.MIN_CREDITS_FOR_ODDS || 40);
const RESULT_AFTER_MS = 105 * 60e3; // ask for a result this long after kickoff
const VOID_AFTER_MS = 60 * 3600e3; // no result 60h after kickoff: refund

const NAMES = {
  soccer_epl: 'Premier League', soccer_spain_la_liga: 'La Liga', soccer_italy_serie_a: 'Serie A',
  soccer_germany_bundesliga: 'Bundesliga', soccer_france_ligue_one: 'Ligue 1',
  soccer_uefa_champs_league: 'Champions League', soccer_uefa_europa_league: 'Europa League',
  soccer_turkey_super_league: 'Süper Lig', soccer_netherlands_eredivisie: 'Eredivisie',
  soccer_portugal_primeira_liga: 'Primeira Liga',
};

initializeApp(env.FIREBASE_SERVICE_ACCOUNT ? { credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) }
  : env.FIRESTORE_EMULATOR_HOST ? { projectId: env.GCLOUD_PROJECT || 'demo-stakes' } : { credential: applicationDefault() });
const db = getFirestore();
const metaRef = db.doc('meta/sync');
let credits = null;

async function api(path, params) {
  const qs = new URLSearchParams({ apiKey: KEY, dateFormat: 'iso', ...params });
  const res = await fetch(API + path + '?' + qs);
  const left = res.headers.get('x-requests-remaining');
  if (left != null) credits = Number(left);
  if (!res.ok) throw new Error(path + ' -> HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return res.json();
}

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

// Median price per outcome across all bookmakers.
function consensus(ev) {
  const h = [], d = [], a = [];
  (ev.bookmakers || []).forEach((bk) => (bk.markets || []).forEach((mk) => {
    if (mk.key !== 'h2h') return;
    mk.outcomes.forEach((o) => {
      if (o.name === ev.home_team) h.push(o.price);
      else if (o.name === ev.away_team) a.push(o.price);
      else if (o.name === 'Draw') d.push(o.price);
    });
  }));
  if (!h.length || !d.length || !a.length) return null;
  const r = (x) => Math.round(x * 100) / 100;
  return { h: r(median(h)), d: r(median(d)), a: r(median(a)) };
}

async function refreshOdds(sport, meta) {
  const now = Date.now();
  const events = await api('/sports/' + sport + '/odds', {
    regions: 'eu', markets: 'h2h', oddsFormat: 'decimal',
    commenceTimeFrom: iso(now), commenceTimeTo: iso(now + DAYS_AHEAD * 864e5),
  });
  let n = 0;
  const batch = db.batch();
  for (const ev of events) {
    const ko = Date.parse(ev.commence_time);
    if (!(ko > now)) continue; // never touch a match after kickoff
    const o = consensus(ev);
    if (!o) continue;
    batch.set(db.doc('matches/' + ev.id), {
      sk: sport, lg: NAMES[sport] || ev.sport_title || sport, home: ev.home_team, away: ev.away_team,
      ko: Timestamp.fromMillis(ko), status: 'scheduled', o, p: priceMap(ev.home_team, ev.away_team, o),
      updated: FieldValue.serverTimestamp(),
    });
    n++;
  }
  await batch.commit();
  meta.oddsAt[sport] = now;
  console.log(sport + ': ' + n + ' fixtures updated');
}

async function fetchResults(sport, pending) {
  const scores = await api('/sports/' + sport + '/scores', { daysFrom: 3 });
  const byId = new Map(scores.map((s) => [s.id, s]));
  const now = Date.now();
  for (const m of pending) {
    const s = byId.get(m.id);
    if (s && s.completed && s.scores) {
      const g = (team) => { const x = s.scores.find((y) => y.name === team); return x ? parseInt(x.score, 10) : NaN; };
      const sh = g(m.home), sa = g(m.away);
      if (Number.isInteger(sh) && Number.isInteger(sa)) {
        await db.doc('matches/' + m.id).update({ status: 'final', sh, sa, settled: false });
        console.log('final: ' + m.home + ' ' + sh + '-' + sa + ' ' + m.away);
        continue;
      }
    }
    if (now - m.ko.toMillis() > VOID_AFTER_MS) {
      await db.doc('matches/' + m.id).update({ status: 'void', settled: false });
      console.log('void (no result): ' + m.home + ' v ' + m.away);
    }
  }
}

async function settle() {
  const snap = await db.collection('matches').where('settled', '==', false).get();
  for (const md of snap.docs) {
    const m = md.data();
    const bets = await db.collection('bets').where('matchId', '==', md.id).where('status', '==', 'open').get();
    let batch = db.batch(), ops = 0;
    for (const bd of bets.docs) {
      const b = bd.data();
      const res = m.status === 'void' ? 'void' : outcome(b.key, m.sh, m.sa);
      const payout = res === 'won' ? Math.round(b.stake * b.odds) : res === 'void' ? b.stake : 0;
      const upd = { status: res, payout, settledAt: FieldValue.serverTimestamp() };
      if (m.status === 'final') upd.score = m.sh + '-' + m.sa;
      batch.update(bd.ref, upd);
      const pu = { coins: FieldValue.increment(payout) };
      if (res === 'won') pu.won = FieldValue.increment(1);
      if (res === 'lost') pu.lost = FieldValue.increment(1);
      batch.update(db.doc('players/' + b.uid), pu);
      if ((ops += 2) >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    batch.update(md.ref, { settled: true });
    await batch.commit();
    console.log('settled ' + bets.size + ' bets on ' + m.home + ' v ' + m.away);
  }
}

async function main() {
  if (!KEY) throw new Error('ODDS_API_KEY is not set');
  const metaSnap = await metaRef.get();
  const meta = { oddsAt: {}, ...(metaSnap.exists ? metaSnap.data() : {}) };
  credits = meta.credits ?? null;
  const now = Date.now();

  // 1. Results first: they matter more than fresh odds when credits run low.
  const recent = await db.collection('matches').where('ko', '>=', Timestamp.fromMillis(now - 4 * 864e5)).get();
  const pending = recent.docs.map((d) => ({ ...d.data(), id: d.id }))
    .filter((m) => m.status === 'scheduled' && m.ko.toMillis() <= now - RESULT_AFTER_MS);
  for (const sport of new Set(pending.map((m) => m.sk))) {
    try { await fetchResults(sport, pending.filter((m) => m.sk === sport)); } catch (e) { console.error(e.message); }
  }

  // 2. Pay out.
  await settle();

  // 3. Odds, each league at most every ODDS_REFRESH_HOURS.
  for (const sport of LEAGUES) {
    if (now - (meta.oddsAt[sport] || 0) < ODDS_REFRESH_MS) continue;
    if (credits != null && credits < MIN_CREDITS_FOR_ODDS) { console.log('skipping odds for ' + sport + ': only ' + credits + ' API credits left'); continue; }
    try { await refreshOdds(sport, meta); } catch (e) { console.error(e.message); }
  }

  meta.credits = credits;
  meta.ranAt = now;
  await metaRef.set(meta);
  console.log('done. API credits left: ' + (credits ?? 'unknown'));
}

main().catch((e) => { console.error(e); process.exit(1); });
