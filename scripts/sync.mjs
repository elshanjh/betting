// Pulls fixtures, odds and final scores from ESPN's public scoreboard feed
// (odds there are DraftKings prices), writes them to Firestore, and settles
// every open bet on finished matches. No API key needed. Runs on a schedule
// from .github/workflows/sync.yml and is safe to run as often as you like.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (or use GOOGLE_APPLICATION_CREDENTIALS)
//   LEAGUES                   comma list of ESPN league slugs (default below)
//   DAYS_AHEAD                how far ahead to load fixtures (default 7)

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { priceMap, outcome } from '../public/markets.js';

const env = process.env;
const API = env.ESPN_BASE || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const LEAGUES = (env.LEAGUES || 'eng.1,esp.1,ita.1,ger.1,fra.1,uefa.champions').split(',').map((s) => s.trim()).filter(Boolean);
const DAYS_AHEAD = Number(env.DAYS_AHEAD || 7);
const DAYS_BACK = 3;
const VOID_AFTER_MS = 60 * 3600e3; // no result 60h after kickoff: refund

const NAMES = {
  'eng.1': 'Premier League', 'esp.1': 'La Liga', 'ita.1': 'Serie A', 'ger.1': 'Bundesliga', 'fra.1': 'Ligue 1',
  'uefa.champions': 'Champions League', 'uefa.europa': 'Europa League', 'uefa.europa.conf': 'Conference League',
  'tur.1': 'Süper Lig', 'ned.1': 'Eredivisie', 'por.1': 'Primeira Liga', 'eng.2': 'Championship',
};
const DONE = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN']);
const OFF = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_ABANDONED', 'STATUS_FORFEIT']);

initializeApp(env.FIREBASE_SERVICE_ACCOUNT ? { credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) }
  : env.FIRESTORE_EMULATOR_HOST ? { projectId: env.GCLOUD_PROJECT || 'demo-stakes' } : { credential: applicationDefault() });
const db = getFirestore();

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

async function day(league, date) {
  const res = await fetch(API + '/' + league + '/scoreboard?dates=' + date);
  if (!res.ok) throw new Error(league + ' ' + date + ' -> HTTP ' + res.status);
  return (await res.json()).events || [];
}

// American odds ("-265", "+390", 250) to decimal (1.38, 4.9, 3.5).
function dec(x) {
  const n = Number(String(x).replace('+', ''));
  if (!Number.isFinite(n) || (n > -100 && n < 100)) return null;
  return Math.round((n > 0 ? 1 + n / 100 : 1 + 100 / -n) * 100) / 100;
}

function odds(c) {
  const o = (c.odds || [])[0];
  if (!o) return null;
  const ml = o.moneyline || {};
  const pick = (side, fallback) => dec(ml[side]?.close?.odds ?? ml[side]?.open?.odds ?? fallback);
  const r = { h: pick('home', o.homeTeamOdds?.moneyLine), d: pick('draw', o.drawOdds?.moneyLine), a: pick('away', o.awayTeamOdds?.moneyLine) };
  return r.h && r.d && r.a ? r : null;
}

function parse(league, ev) {
  const c = ev.competitions?.[0];
  if (!c) return null;
  const home = c.competitors.find((x) => x.homeAway === 'home'), away = c.competitors.find((x) => x.homeAway === 'away');
  if (!home || !away) return null;
  return {
    id: 'espn_' + ev.id, league, ko: Date.parse(c.date || ev.date), status: c.status?.type?.name,
    home: home.team.displayName, away: away.team.displayName,
    sh: parseInt(home.score, 10), sa: parseInt(away.score, 10), o: odds(c),
  };
}

async function syncLeague(league, stored) {
  const now = Date.now(), events = new Map();
  for (let d = -DAYS_BACK; d <= DAYS_AHEAD; d++) {
    for (const ev of await day(league, ymd(now + d * 864e5))) {
      const e = parse(league, ev);
      if (e) events.set(e.id, e);
    }
  }
  let fixtures = 0;
  const batch = db.batch();
  for (const e of events.values()) {
    const m = stored.get(e.id);
    // New or still-open fixture: publish/refresh its odds until kickoff.
    if (e.ko > now && e.status === 'STATUS_SCHEDULED' && e.o && (!m || m.status === 'scheduled')) {
      batch.set(db.doc('matches/' + e.id), {
        sk: league, lg: NAMES[league] || league, home: e.home, away: e.away, ko: Timestamp.fromMillis(e.ko),
        status: 'scheduled', o: e.o, p: priceMap(e.home, e.away, e.o), updated: FieldValue.serverTimestamp(),
      });
      fixtures++;
    }
  }
  await batch.commit();

  // Results for matches we have that kicked off.
  for (const m of stored.values()) {
    if (m.sk !== league || m.status !== 'scheduled' || m.ko.toMillis() > now) continue;
    const e = events.get(m.id);
    if (e && DONE.has(e.status) && Number.isInteger(e.sh) && Number.isInteger(e.sa)) {
      await db.doc('matches/' + m.id).update({ status: 'final', sh: e.sh, sa: e.sa, settled: false });
      console.log('final: ' + m.home + ' ' + e.sh + '-' + e.sa + ' ' + m.away);
    } else if ((e && OFF.has(e.status)) || now - m.ko.toMillis() > VOID_AFTER_MS) {
      await db.doc('matches/' + m.id).update({ status: 'void', settled: false });
      console.log('void: ' + m.home + ' v ' + m.away + ' (' + (e ? e.status : 'no result') + ')');
    }
  }
  console.log(league + ': ' + fixtures + ' fixtures with odds');
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
  const since = Timestamp.fromMillis(Date.now() - (DAYS_BACK + 1) * 864e5);
  const snap = await db.collection('matches').where('ko', '>=', since).get();
  const stored = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
  let failed = 0;
  for (const league of LEAGUES) {
    try { await syncLeague(league, stored); } catch (e) { failed++; console.error(league + ': ' + e.message); }
  }
  await settle();
  await db.doc('meta/sync').set({ ranAt: Date.now(), source: 'espn' });
  if (failed === LEAGUES.length) throw new Error('every league failed; is the ESPN feed down or changed?');
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
