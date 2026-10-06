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
let server, base, scores = [], oddsCalls = 0;

const db = getFirestore(initializeApp({ projectId: 'demo-stakes' }, 'sync-test'));

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    res.setHeader('x-requests-remaining', '400');
    res.setHeader('content-type', 'application/json');
    if (url.pathname.endsWith('/odds')) {
      oddsCalls++;
      const ko = new Date(Date.now() + 48 * H).toISOString();
      const bk = (h, d, a) => ({ markets: [{ key: 'h2h', outcomes: [{ name: 'Arsenal', price: h }, { name: 'Chelsea', price: a }, { name: 'Draw', price: d }] }] });
      res.end(JSON.stringify([
        { id: 'ev1', sport_title: 'EPL', commence_time: ko, home_team: 'Arsenal', away_team: 'Chelsea', bookmakers: [bk(2.0, 3.4, 3.8), bk(2.1, 3.5, 3.6), bk(2.2, 3.3, 3.5)] },
        { id: 'live', sport_title: 'EPL', commence_time: new Date(Date.now() - H).toISOString(), home_team: 'Arsenal', away_team: 'Chelsea', bookmakers: [bk(2, 3, 4)] },
      ]));
    } else if (url.pathname.endsWith('/scores')) {
      res.end(JSON.stringify(scores));
    } else { res.statusCode = 404; res.end('[]'); }
  });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());

const sync = () => run('node', ['scripts/sync.mjs'], {
  env: { ...process.env, ODDS_API_KEY: 'test', ODDS_API_BASE: base, LEAGUES: 'soccer_epl', GCLOUD_PROJECT: 'demo-stakes' },
});

test('loads fixtures with consensus odds and all derived prices', async () => {
  await sync();
  const m = (await db.doc('matches/ev1').get()).data();
  assert.deepEqual(m.o, { h: 2.1, d: 3.4, a: 3.6 });
  assert.equal(m.lg, 'Premier League');
  assert.equal(m.status, 'scheduled');
  assert.ok(Object.keys(m.p).length > 80);
  assert.equal((await db.doc('matches/live').get()).exists, false, 'matches already kicked off are skipped');
  await sync();
  assert.equal(oddsCalls, 1, 'odds are not refetched within the refresh window');
});

test('settles finished matches and pays winners', async () => {
  const ko = Timestamp.fromMillis(Date.now() - 3 * H);
  await db.doc('matches/done').set({ sk: 'soccer_epl', lg: 'Premier League', home: 'Spurs', away: 'Everton', ko, status: 'scheduled', o: { h: 2, d: 3, a: 4 }, p: {} });
  await db.doc('matches/gone').set({ sk: 'soccer_epl', lg: 'Premier League', home: 'Leeds', away: 'Wolves', ko: Timestamp.fromMillis(Date.now() - 70 * H), status: 'scheduled', o: { h: 2, d: 3, a: 4 }, p: {} });
  await db.doc('players/p1').set({ name: 'P1', coins: 0, won: 0, lost: 0, lastClaimDay: 0 });
  const mk = (id, matchId, key, stake, odds) => db.doc('bets/' + id).set({ uid: 'p1', matchId, key, stake, odds, status: 'open', label: key, fixture: 'x' });
  await mk('b1', 'done', '1x2:h', 10, 2.0);    // wins 20
  await mk('b2', 'done', 'ou:2.5:o', 10, 1.9); // 2-1 is 3 goals: wins 19
  await mk('b3', 'done', 'btts:n', 10, 2.0);   // loses
  await mk('b4', 'done', 'dnb:a', 10, 3.0);    // loses
  await mk('b5', 'gone', '1x2:h', 7, 2.0);     // no result: refund 7
  scores = [{ id: 'done', completed: true, scores: [{ name: 'Everton', score: '1' }, { name: 'Spurs', score: '2' }] }];

  await sync();

  const m = (await db.doc('matches/done').get()).data();
  assert.equal(m.status, 'final'); assert.equal(m.sh, 2); assert.equal(m.sa, 1); assert.equal(m.settled, true);
  assert.equal((await db.doc('matches/gone').get()).data().status, 'void');
  const st = async (id) => (await db.doc('bets/' + id).get()).data();
  assert.equal((await st('b1')).status, 'won'); assert.equal((await st('b1')).payout, 20);
  assert.equal((await st('b2')).status, 'won');
  assert.equal((await st('b3')).status, 'lost');
  assert.equal((await st('b4')).status, 'lost');
  assert.equal((await st('b5')).status, 'void');
  const p = (await db.doc('players/p1').get()).data();
  assert.equal(p.coins, 20 + 19 + 7);
  assert.equal(p.won, 2); assert.equal(p.lost, 2);

  await sync(); // running again pays nothing twice
  assert.equal((await db.doc('players/p1').get()).data().coins, 46);
});
