// The live engine against the Firestore emulator and a fake ESPN feed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const run = promisify(execFile);
let server, base, event = null;
const db = getFirestore(initializeApp({ projectId: 'demo-stakes' }, 'live-test'));

const ev = (state, status, clock, period, sh, sa, goals) => ({
  id: '50', date: new Date(Date.now() - 1800e3).toISOString(),
  competitions: [{
    status: { clock, displayClock: Math.floor(clock / 60) + "'", period, type: { name: status, state } },
    competitors: [{ homeAway: 'home', score: String(sh), team: { id: '1', displayName: 'Arsenal' } }, { homeAway: 'away', score: String(sa), team: { id: '2', displayName: 'Chelsea' } }],
    details: goals.map(([team, t]) => ({ scoringPlay: true, team: { id: team }, clock: { value: t } })),
  }],
});

before(async () => {
  server = createServer((req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ events: event ? [event] : [] })); });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());

const live = () => run('node', ['scripts/live.mjs'], { env: { ...process.env, ESPN_BASE: base, LIVE_ONCE: '1', GCLOUD_PROJECT: 'demo-stakes' } });

test('publishes live score and prices, then settles at full time', async () => {
  await db.doc('matches/espn_50').set({ sk: 'eng.1', lg: 'Premier League', home: 'Arsenal', away: 'Chelsea', status: 'scheduled', ko: Timestamp.fromMillis(Date.now() - 1800e3), o: { h: 2.1, d: 3.4, a: 3.6 }, p: {} });
  event = ev('in', 'STATUS_FIRST_HALF', 1800, 1, 1, 0, [['1', 900]]);
  await live();
  const lv = (await db.doc('live/espn_50').get()).data();
  assert.equal(lv.sh, 1); assert.equal(lv.min, 31); assert.equal(lv.clk, 1800);
  assert.equal(lv.susp, false); assert.equal(lv.done, false);
  assert.ok(lv.p['lv:ng:a'] > 1 && lv.p['lv:1x2:h'] < 2.1);

  await db.doc('players/p9').set({ name: 'P9', coins: 0, won: 0, lost: 0, lastClaimDay: 0 });
  await db.doc('bets/lb1').set({ uid: 'p9', stake: 10, odds: 3, status: 'open', live: true, mids: ['espn_50'], legs: [{ m: 'espn_50', k: 'lv:ng:a', o: 3, sc: [1, 0], t: 1800, label: 'x', fx: 'x' }] });
  await db.doc('bets/lb2').set({ uid: 'p9', stake: 10, odds: 2, status: 'open', live: true, mids: ['espn_50'], legs: [{ m: 'espn_50', k: 'lv:1x2:h', o: 2, sc: [1, 0], t: 1800, label: 'x', fx: 'x' }] });

  event = ev('post', 'STATUS_FULL_TIME', 5400, 2, 1, 1, [['1', 900], ['2', 3000]]);
  await live();
  const m = (await db.doc('matches/espn_50').get()).data();
  assert.equal(m.status, 'final'); assert.deepEqual(m.goals, [{ s: 'h', t: 900 }, { s: 'a', t: 3000 }]);
  assert.equal((await db.doc('live/espn_50').get()).data().done, true);
  assert.equal((await db.doc('bets/lb1').get()).data().status, 'won');
  assert.equal((await db.doc('bets/lb2').get()).data().status, 'lost');
  assert.equal((await db.doc('players/p9').get()).data().coins, 30);
});
