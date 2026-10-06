// End-to-end test of scripts/sync.mjs against the Firestore emulator and a
// fake Odds API. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const run = promisify(execFile);
const H = 3600e3;
let server, base, oddsCalls = 0;

const db = getFirestore(initializeApp({ projectId: 'demo-stakes' }, 'sync-test'));

const ev = (id, ko, status, home, away, sh, sa, ml) => ({
  id, date: new Date(ko).toISOString(),
  competitions: [{
    date: new Date(ko).toISOString(), status: { type: { name: status } },
    competitors: [{ homeAway: 'home', score: String(sh), team: { displayName: home } }, { homeAway: 'away', score: String(sa), team: { displayName: away } }],
    odds: ml ? [{ moneyline: { home: { close: { odds: ml[0] } }, draw: { close: { odds: ml[1] } }, away: { close: { odds: ml[2] } } } }] : [],
  }],
});
let events = [];

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('content-type', 'application/json');
    if (url.pathname === '/eng.1/scoreboard') {
      oddsCalls++;
      const d = url.searchParams.get('dates');
      res.end(JSON.stringify({ events: events.filter((e) => e.date.slice(0, 10).replace(/-/g, '') === d) }));
    } else { res.statusCode = 404; res.end('{}'); }
  });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());

const sync = () => run('node', ['scripts/sync.mjs'], {
  env: { ...process.env, ESPN_BASE: base, LEAGUES: 'eng.1', GCLOUD_PROJECT: 'demo-stakes' },
});

test('loads fixtures with converted odds and all derived prices', async () => {
  const now = Date.now();
  events = [
    ev('1', now + 48 * H, 'STATUS_SCHEDULED', 'Arsenal', 'Chelsea', 0, 0, ['+110', '+240', '+260']),
    ev('2', now + 50 * H, 'STATUS_SCHEDULED', 'Leeds', 'Fulham', 0, 0, null), // no odds yet
  ];
  await sync();
  const m = (await db.doc('matches/espn_1').get()).data();
  assert.deepEqual(m.o, { h: 2.1, d: 3.4, a: 3.6 });
  assert.equal(m.lg, 'Premier League');
  assert.equal(m.status, 'scheduled');
  assert.ok(Object.keys(m.p).length > 80);
  assert.equal((await db.doc('matches/espn_2').get()).exists, false, 'fixtures without odds are skipped');
  assert.equal(oddsCalls, 11, 'one request per day, 3 back and 7 ahead');
});

test('settles finished matches and pays winners', async () => {
  const now = Date.now(), base = { sk: 'eng.1', lg: 'Premier League', status: 'scheduled', o: { h: 2, d: 3, a: 4 }, p: {} };
  await db.doc('matches/espn_10').set({ ...base, home: 'Spurs', away: 'Everton', ko: Timestamp.fromMillis(now - 3 * H) });
  await db.doc('matches/espn_11').set({ ...base, home: 'Leeds', away: 'Wolves', ko: Timestamp.fromMillis(now - 70 * H) });
  await db.doc('matches/espn_12').set({ ...base, home: 'Hull', away: 'Derby', ko: Timestamp.fromMillis(now - 5 * H) });
  await db.doc('matches/espn_13').set({ ...base, home: 'Stoke', away: 'Wigan', ko: Timestamp.fromMillis(now - 1 * H) });
  await db.doc('players/p1').set({ name: 'P1', coins: 0, won: 0, lost: 0, lastClaimDay: 0 });
  const mk = (id, matchId, key, stake, odds) => db.doc('bets/' + id).set({ uid: 'p1', matchId, key, stake, odds, status: 'open', label: key, fixture: 'x' });
  await mk('b1', 'espn_10', '1x2:h', 10, 2.0);    // wins 20
  await mk('b2', 'espn_10', 'ou:2.5:o', 10, 1.9); // 2-1 is 3 goals: wins 19
  await mk('b3', 'espn_10', 'btts:n', 10, 2.0);   // loses
  await mk('b4', 'espn_10', 'dnb:a', 10, 3.0);    // loses
  await mk('b5', 'espn_11', '1x2:h', 7, 2.0);     // no result after 60h: refund 7
  await mk('b6', 'espn_12', '1x2:a', 5, 3.0);     // postponed: refund 5
  await mk('b7', 'espn_13', '1x2:a', 4, 3.0);     // still playing: stays open
  events = [
    ev('10', now - 3 * H, 'STATUS_FULL_TIME', 'Spurs', 'Everton', 2, 1),
    ev('12', now - 5 * H, 'STATUS_POSTPONED', 'Hull', 'Derby', 0, 0),
    ev('13', now - 1 * H, 'STATUS_SECOND_HALF', 'Stoke', 'Wigan', 0, 1),
  ];

  await sync();

  const m = (await db.doc('matches/espn_10').get()).data();
  assert.equal(m.status, 'final'); assert.equal(m.sh, 2); assert.equal(m.sa, 1); assert.equal(m.settled, true);
  assert.equal((await db.doc('matches/espn_11').get()).data().status, 'void');
  assert.equal((await db.doc('matches/espn_12').get()).data().status, 'void');
  assert.equal((await db.doc('matches/espn_13').get()).data().status, 'scheduled');
  const st = async (id) => (await db.doc('bets/' + id).get()).data();
  assert.equal((await st('b1')).status, 'won'); assert.equal((await st('b1')).payout, 20);
  assert.equal((await st('b2')).status, 'won');
  assert.equal((await st('b3')).status, 'lost');
  assert.equal((await st('b4')).status, 'lost');
  assert.equal((await st('b5')).status, 'void');
  assert.equal((await st('b6')).status, 'void');
  assert.equal((await st('b7')).status, 'open');
  const p = (await db.doc('players/p1').get()).data();
  assert.equal(p.coins, 20 + 19 + 7 + 5);
  assert.equal(p.won, 2); assert.equal(p.lost, 2);

  await sync(); // running again pays nothing twice
  assert.equal((await db.doc('players/p1').get()).data().coins, 51);
});
