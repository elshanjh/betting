// Pulls fixtures, odds and final scores from ESPN's public scoreboard feed
// (odds there are DraftKings prices), writes them to Firestore, and settles
// open bets. National-team matches without bookmaker odds get prices from
// World Football Elo ratings (eloratings.net). No API keys needed. Runs on a
// schedule from .github/workflows/sync.yml and is safe to run at any time.
//
// Env:
//   FIREBASE_SERVICE_ACCOUNT  service account JSON (or use GOOGLE_APPLICATION_CREDENTIALS)
//   LEAGUES                   optional comma list of ESPN slugs; default: all in public/leagues.js
//   DAYS_AHEAD                how far ahead to load fixtures (default 7)

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { priceMap, eloOdds } from '../public/markets.js';
import { parse, settle } from './lib.mjs';
import { LEAGUES, BY_SLUG } from '../public/leagues.js';

const env = process.env;
const API = env.ESPN_BASE || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const ELO = env.ELO_BASE || 'https://www.eloratings.net';
const SLUGS = env.LEAGUES ? env.LEAGUES.split(',').map((s) => s.trim()).filter(Boolean) : LEAGUES.map((l) => l.slug);
const DAYS_AHEAD = Number(env.DAYS_AHEAD || 7);
const DAYS_BACK = 3;
const VOID_AFTER_MS = 60 * 3600e3; // no result 60h after kickoff: refund

const DONE = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN']);
const OFF = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_ABANDONED', 'STATUS_FORFEIT']);

initializeApp(env.FIREBASE_SERVICE_ACCOUNT ? { credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) }
  : env.FIRESTORE_EMULATOR_HOST ? { projectId: env.GCLOUD_PROJECT || 'demo-stakes' } : { credential: applicationDefault() });
const db = getFirestore();

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

async function get(url, type = 'json') {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 friendly-stakes' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return type === 'json' ? res.json() : res.text();
    } catch (e) {
      if (i >= 2) throw new Error(url + ': ' + e.message);
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/* ---------- odds ---------- */

// World Football Elo, loaded once per run when a national-team match needs it.
const norm = (s) => s.normalize('NFKD').replace(/[^\x00-\x7f]/g, '').toLowerCase().replace(/[^a-z]/g, '');
const ALIASES = {
  turkiye: 'turkey', republicofireland: 'ireland', bosniaherzegovina: 'bosniaandherzegovina', korearepublic: 'southkorea',
  cotedivoire: 'ivorycoast', capeverdeislands: 'capeverde', congodr: 'drcongo', chinapr: 'china', iriran: 'iran', usa: 'unitedstates',
};
let eloP;
function elo() {
  eloP ??= (async () => {
    const [world, teams] = await Promise.all([get(ELO + '/World.tsv', 'text'), get(ELO + '/en.teams.tsv', 'text')]);
    const rating = {}, byName = {};
    world.split('\n').forEach((l) => { const p = l.split('\t'); if (p[2]) rating[p[2]] = Number(p[3]); });
    teams.split('\n').forEach((l) => { const p = l.split('\t'); p.slice(1).forEach((n) => { if (n) byName[norm(n)] = p[0]; }); });
    return (name) => { const k = norm(name); return rating[byName[ALIASES[k] || k]]; };
  })();
  return eloP;
}

async function modelOdds(e) {
  const r = await elo();
  const h = r(e.home), a = r(e.away);
  if (!h || !a) return null;
  return eloOdds(h - a + (e.neutral ? 0 : 100));
}

/* ---------- ESPN ---------- */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function syncLeague(slug, stored) {
  const L = BY_SLUG[slug] || { slug, name: slug, nat: false };
  const now = Date.now(), events = new Map();
  const add = (list) => list.forEach((ev) => { const e = parse(slug, ev); if (e) events.set(e.id, e); });

  // The undated call returns the current round plus the league's calendar,
  // so we only fetch days that actually have games.
  const cur = await get(API + '/' + slug + '/scoreboard');
  add(cur.events || []);
  const cal = cur.leagues?.[0]?.calendarType === 'day' ? (cur.leagues[0].calendar || []).map((d) => d.slice(0, 10).replace(/-/g, '')) : null;
  const from = ymd(now), to = ymd(now + DAYS_AHEAD * 864e5);
  const dates = new Set();
  if (cal) cal.filter((d) => d >= from && d <= to).forEach((d) => dates.add(d));
  else for (let d = 0; d <= DAYS_AHEAD; d++) dates.add(ymd(now + d * 864e5));
  const pending = [...stored.values()].filter((m) => m.sk === slug && m.status === 'scheduled' && m.ko.toMillis() <= now);
  pending.forEach((m) => { dates.add(ymd(m.ko.toMillis())); dates.add(ymd(m.ko.toMillis() - 864e5)); });
  for (const d of dates) add((await get(API + '/' + slug + '/scoreboard?dates=' + d)).events || []);

  // Fixtures: publish or refresh until kickoff, only writing what changed.
  let fixtures = 0, written = 0;
  const batch = db.batch();
  for (const e of events.values()) {
    if (!(e.ko > now) || e.status !== 'STATUS_SCHEDULED') continue;
    const m = stored.get(e.id);
    if (m && m.status !== 'scheduled') continue;
    let o = e.o, src = 'book';
    if (!o && L.nat) { o = await modelOdds(e); src = 'elo'; }
    if (!o) continue;
    fixtures++;
    const doc = { sk: slug, lg: L.name, home: e.home, away: e.away, ko: Timestamp.fromMillis(e.ko), status: 'scheduled', o, src };
    if (m && m.ko.toMillis() === e.ko && same(m.o, o) && m.home === e.home && m.away === e.away && m.lg === L.name && m.src === src) continue;
    batch.set(db.doc('matches/' + e.id), { ...doc, p: priceMap(e.home, e.away, o), updated: FieldValue.serverTimestamp() });
    written++;
  }
  await batch.commit();

  // Results for matches that kicked off.
  for (const m of pending) {
    const e = events.get(m.id);
    if (e && DONE.has(e.status) && Number.isInteger(e.sh) && Number.isInteger(e.sa)) {
      await db.doc('matches/' + m.id).update({ status: 'final', sh: e.sh, sa: e.sa, goals: e.goals, settled: false });
      console.log('final: ' + m.home + ' ' + e.sh + '-' + e.sa + ' ' + m.away);
    } else if ((e && OFF.has(e.status)) || now - m.ko.toMillis() > VOID_AFTER_MS) {
      await db.doc('matches/' + m.id).update({ status: 'void', settled: false });
      console.log('void: ' + m.home + ' v ' + m.away + ' (' + (e ? e.status : 'no result') + ')');
    }
  }
  if (fixtures || pending.length) console.log(slug + ': ' + fixtures + ' fixtures, ' + written + ' updated, ' + pending.length + ' awaiting result');
}

/* ---------- main ---------- */

async function main() {
  const since = Timestamp.fromMillis(Date.now() - (DAYS_BACK + 1) * 864e5);
  const snap = await db.collection('matches').where('ko', '>=', since).get();
  const stored = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
  let failed = 0;
  const queue = [...SLUGS];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const slug = queue.shift();
      try { await syncLeague(slug, stored); } catch (e) { failed++; console.error(slug + ': ' + e.message); }
    }
  }));
  await settle(db);
  await db.doc('meta/sync').set({ ranAt: Date.now(), source: 'espn', failed });
  if (failed > SLUGS.length / 2) throw new Error(failed + ' of ' + SLUGS.length + ' leagues failed; is the ESPN feed down or changed?');
  console.log('done (' + failed + ' leagues failed)');
}

main().catch((e) => { console.error(e); process.exit(1); });
