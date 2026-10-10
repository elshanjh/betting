// Live engine: while matches are being played, polls ESPN every 20 seconds
// and keeps a `live/{matchId}` document per match with the score, clock and
// live prices, suspends betting around goals and late in the game, and
// settles bets the moment a match ends. Started by .github/workflows/live.yml;
// stays up while a match is live or kicks off within 7 hours (idle in
// between), then hands over to a fresh run. Exits when nothing is near.
//
// Env: FIREBASE_SERVICE_ACCOUNT, LIVE_GROUPS (comma list of league groups
// from public/leagues.js; default below), MAX_MINUTES (default 320).

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { livePrices, LIVE_CLOSE_MIN } from '../public/markets.js';
import { LEAGUES } from '../public/leagues.js';
import { appendFileSync } from 'node:fs';
import { parse, settle, playedIds } from './lib.mjs';

const env = process.env;
const API = env.ESPN_BASE || 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const GROUPS = (env.LIVE_GROUPS || 'Top leagues,European cups,National teams,More Europe').split(',').map((s) => s.trim());
const SLUGS = new Set(LEAGUES.filter((l) => GROUPS.includes(l.group)).map((l) => l.slug));
const TICK = Number(env.TICK_SECONDS || 20) * 1000;
// Stay up this long before a kickoff. GitHub's schedule can skip runs for
// hours, so one run should carry on into the next match rather than exit.
const LEAD = 90 * 60e3;
const IDLE_TICK = 60e3; // between matches: check once a minute, no ESPN calls
const SPAN = 3 * 3600e3; // a match can't still be live this long after kickoff
const GOAL_PAUSE = 60e3; // betting suspended this long after a goal
const DEADLINE = Date.now() + Number(env.MAX_MINUTES || 320) * 60e3;
const ONCE = env.LIVE_ONCE === '1'; // tests: a single tick

const DONE = new Set(['STATUS_FULL_TIME', 'STATUS_FINAL', 'STATUS_FINAL_AET', 'STATUS_FINAL_PEN']);
const OFF = new Set(['STATUS_POSTPONED', 'STATUS_CANCELED', 'STATUS_ABANDONED', 'STATUS_FORFEIT']);

initializeApp(env.FIREBASE_SERVICE_ACCOUNT ? { credential: cert(JSON.parse(env.FIREBASE_SERVICE_ACCOUNT)) }
  : env.FIRESTORE_EMULATOR_HOST ? { projectId: env.GCLOUD_PROJECT || 'demo-stakes' } : { credential: applicationDefault() });
const db = getFirestore();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scoreboard(slug) {
  // A request that never answers once froze a run for 4 hours: always time out.
  const res = await fetch(API + '/' + slug + '/scoreboard', { headers: { 'user-agent': 'Mozilla/5.0 friendly-stakes' }, signal: AbortSignal.timeout(12e3) });
  if (!res.ok) throw new Error(slug + ' HTTP ' + res.status);
  return (await res.json()).events || [];
}

// Model minute 1..93 from ESPN's clock; first-half stoppage stays at 45.
function minuteOf(e) {
  if (e.status === 'STATUS_HALFTIME') return 45;
  const m = Math.floor(e.clock / 60) + 1;
  return e.period <= 1 ? Math.min(45, m) : Math.max(46, Math.min(93, m));
}

const lastWritten = {};
const goalAt = {};

async function tick(watch) {
  const now = Date.now();
  const bySlug = {};
  watch.forEach((m) => { if (m.ko.toMillis() <= now + 60e3) (bySlug[m.sk] = bySlug[m.sk] || []).push(m); });
  let ended = false;
  for (const [slug, ms] of Object.entries(bySlug)) {
    let events;
    try { events = new Map((await scoreboard(slug)).map((ev) => { const e = parse(slug, ev); return [e && e.id, e]; })); } catch (err) { console.error(err.message); continue; }
    for (const m of ms) {
      const e = events.get(m.id);
      if (!e) continue;
      const ref = db.doc('live/' + m.id);
      if (e.state === 'in') {
        const min = minuteOf(e), score = e.sh + '-' + e.sa;
        const prev = lastWritten[m.id];
        if (prev && prev.score !== score) goalAt[m.id] = now;
        const susp = min >= LIVE_CLOSE_MIN || now - (goalAt[m.id] || 0) < GOAL_PAUSE;
        const p = livePrices(m.o, e.sh, e.sa, min);
        const doc = { sk: m.sk, lg: m.lg, home: m.home, away: m.away, hl: m.hl || '', al: m.al || '', ko: m.ko, sh: e.sh, sa: e.sa, min, clk: e.clock, shown: e.shown, status: e.status, susp, p, done: false };
        const sig = JSON.stringify([score, min, susp, e.status, e.shown]);
        // Rewrite at least every 40s so the freshness check in the rules passes.
        if (!prev || prev.sig !== sig || now - prev.at > 40e3) {
          await ref.set({ ...doc, at: FieldValue.serverTimestamp() });
          lastWritten[m.id] = { sig, score, at: now };
          if (!prev) console.log('live: ' + m.home + ' v ' + m.away);
        }
      } else if (e.state === 'post' || OFF.has(e.status)) {
        if (DONE.has(e.status) && Number.isInteger(e.sh) && Number.isInteger(e.sa)) {
          await db.doc('matches/' + m.id).update({ status: 'final', sh: e.sh, sa: e.sa, goals: e.goals, played: await playedIds(API, slug, m.id.replace('espn_', '')), settled: false });
          console.log('final: ' + m.home + ' ' + e.sh + '-' + e.sa + ' ' + m.away);
        } else if (OFF.has(e.status)) {
          await db.doc('matches/' + m.id).update({ status: 'void', settled: false });
          console.log('void: ' + m.home + ' v ' + m.away + ' (' + e.status + ')');
        } else continue; // e.g. extra time pending: wait
        await ref.set({ done: true, sh: e.sh, sa: e.sa, status: e.status, susp: true, at: FieldValue.serverTimestamp() }, { merge: true });
        m.status = 'gone';
        ended = true;
      }
    }
  }
  if (ended) await settle(db);
}

async function candidates() {
  const now = Date.now();
  const snap = await db.collection('matches')
    .where('ko', '>=', Timestamp.fromMillis(now - SPAN)).where('ko', '<=', Timestamp.fromMillis(now + LEAD)).get();
  return snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((m) => m.status === 'scheduled' && SLUGS.has(m.sk) && m.o);
}

// Next kickoff the engine cares about within the horizon, or null. A small
// read (at most 40 docs), done every half hour while idle.
const HORIZON = 7 * 3600e3;
async function nextKickoff() {
  const now = Date.now();
  const snap = await db.collection('matches').where('ko', '>=', Timestamp.fromMillis(now)).orderBy('ko').limit(40).get();
  const m = snap.docs.map((d) => d.data()).find((x) => x.status === 'scheduled' && SLUGS.has(x.sk) && x.o);
  return m && m.ko.toMillis() <= now + HORIZON ? m.ko.toMillis() : null;
}

// GitHub starts scheduled runs hours late, so on match days the workflow
// starts its own next run (see live.yml) when this one ends.
function handOver(again) {
  console.log(again ? 'more matches soon: next run will take over' : 'no match soon: stopping until the next scheduled run');
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, 'again=' + again + '\n');
}

async function main() {
  // Old live docs: tidy up anything finished more than a day ago.
  const old = await db.collection('live').where('at', '<', Timestamp.fromMillis(Date.now() - 864e5)).get();
  await Promise.all(old.docs.map((d) => d.ref.delete()));

  let watch = [], loaded = 0, next = null, nextAt = 0;
  while (Date.now() < DEADLINE) {
    if (Date.now() - loaded > 5 * 60e3) { watch = await candidates(); loaded = Date.now(); }
    watch = watch.filter((m) => m.status === 'scheduled');
    if (!watch.length) {
      if (Date.now() - nextAt > 30 * 60e3) { next = await nextKickoff(); nextAt = Date.now(); }
      // A match later today: wait here for it rather than exit.
      if (!next || ONCE) { console.log('nothing live or about to start'); break; }
      await sleep(IDLE_TICK);
      continue;
    }
    const started = watch.some((m) => m.ko.toMillis() <= Date.now() + 60e3);
    // Watchdog: a tick that hangs is abandoned and the loop carries on.
    if (started) {
      await Promise.race([tick(watch), sleep(90e3).then(() => console.error('tick took over 90s, moving on'))])
        .catch((e) => console.error('tick failed: ' + e.message));
    }
    if (ONCE) break;
    await sleep(started ? TICK : IDLE_TICK);
  }
  console.log('live engine stopping');
  if (!ONCE) handOver(watch.length > 0 || (await nextKickoff()) != null);
}

main().catch((e) => { console.error(e); process.exit(1); });
