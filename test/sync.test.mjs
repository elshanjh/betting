// End-to-end test of scripts/sync.mjs against the Firestore emulator and a
// fake ESPN + Elo feed. Run with: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const run = promisify(execFile);
const H = 3600e3;
let server, base, calls = [];
const feeds = { 'eng.1': [], 'uefa.nations': [] };

const db = getFirestore(initializeApp({ projectId: 'demo-stakes' }, 'sync-test'));
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

const ev = (id, ko, status, home, away, sh, sa, ml) => ({
  id, date: new Date(ko).toISOString(),
  competitions: [{
    date: new Date(ko).toISOString(), status: { type: { name: status } },
    competitors: [{ homeAway: 'home', score: String(sh), team: { displayName: home } }, { homeAway: 'away', score: String(sa), team: { displayName: away } }],
    odds: ml ? [{ moneyline: { home: { close: { odds: ml[0] } }, draw: { close: { odds: ml[1] } }, away: { close: { odds: ml[2] } } } }] : [null],
  }],
});

before(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    calls.push(url.pathname + url.search);
    if (url.pathname === '/World.tsv') return res.end('1\t1\tES\t2100\n2\t2\tTR\t1800\n');
    if (url.pathname === '/en.teams.tsv') return res.end('ES\tSpain\nTR\tTurkey\n');
    const slug = url.pathname.split('/')[1], list = feeds[slug] || [], d = url.searchParams.get('dates');
    res.setHeader('content-type', 'application/json');
    if (!d) {
      const days = [...new Set(list.map((e) => ymd(Date.parse(e.date))))].map((x) => x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6) + 'T07:00Z');
      return res.end(JSON.stringify({ events: [], leagues: [{ calendarType: 'day', calendar: days }] }));
    }
    res.end(JSON.stringify({ events: list.filter((e) => ymd(Date.parse(e.date)) === d) }));
  });
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => server.close());

const sync = () => run('node', ['scripts/sync.mjs'], {
  env: { ...process.env, ESPN_BASE: base, ELO_BASE: base, LEAGUES: 'eng.1,uefa.nations', GCLOUD_PROJECT: 'demo-stakes' },
});

test('loads bookmaker odds, Elo odds for national teams, and only fetches game days', async () => {
  const now = Date.now();
  feeds['eng.1'] = [
    ev('1', now + 48 * H, 'STATUS_SCHEDULED', 'Arsenal', 'Chelsea', 0, 0, ['+110', '+240', '+260']),
    ev('2', now + 50 * H, 'STATUS_SCHEDULED', 'Leeds', 'Fulham', 0, 0, null), // club match, no odds yet
  ];
  feeds['uefa.nations'] = [
    ev('3', now + 26 * H, 'STATUS_SCHEDULED', 'Türkiye', 'Spain', 0, 0, null),
    ev('4', now + 26 * H, 'STATUS_SCHEDULED', 'Atlantis', 'Spain', 0, 0, null), // no rating
  ];
  await sync();
  const m = (await db.doc('matches/espn_1').get()).data();
  assert.deepEqual(m.o, { h: 2.1, d: 3.4, a: 3.6 });
  assert.equal(m.src, 'book');
  assert.equal(m.lg, 'Premier League');
  assert.ok(Object.keys(m.p).length > 80);
  assert.equal((await db.doc('matches/espn_2').get()).exists, false, 'club fixtures without odds are skipped');
  const n = (await db.doc('matches/espn_3').get()).data();
  assert.equal(n.src, 'elo');
  assert.ok(n.o.a < n.o.h, 'Spain (2100) is favourite away at Turkey (1800 + home advantage)');
  assert.equal((await db.doc('matches/espn_4').get()).exists, false);
  assert.ok(calls.filter((c) => c.startsWith('/eng.1/')).length <= 3, 'undated call + one per game day');

  const before = (await db.doc('matches/espn_1').get()).updateTime;
  await sync();
  assert.ok((await db.doc('matches/espn_1').get()).updateTime.isEqual(before), 'unchanged fixtures are not rewritten');
});

test('settles singles, multi-bets and old-style bets', async () => {
  const now = Date.now(), base = { sk: 'eng.1', lg: 'Premier League', status: 'scheduled', o: { h: 2, d: 3, a: 4 }, p: {} };
  const ko = (h) => Timestamp.fromMillis(now - h * H);
  await db.doc('matches/espn_10').set({ ...base, home: 'Spurs', away: 'Everton', ko: ko(3) });   // ends 2-1
  await db.doc('matches/espn_11').set({ ...base, home: 'Leeds', away: 'Wolves', ko: ko(70) });   // no result: void
  await db.doc('matches/espn_12').set({ ...base, home: 'Hull', away: 'Derby', ko: ko(5) });      // postponed: void
  await db.doc('matches/espn_13').set({ ...base, home: 'Stoke', away: 'Wigan', ko: ko(1) });     // still playing
  await db.doc('matches/espn_14').set({ ...base, home: 'Bolton', away: 'Bury', ko: ko(4) });     // ends 0-0
  await db.doc('players/p1').set({ name: 'P1', coins: 0, won: 0, lost: 0, lastClaimDay: 0 });
  const mk = (id, stake, legs) => db.doc('bets/' + id).set({
    uid: 'p1', stake, odds: 1, status: 'open',
    legs: legs.map(([m, k, o]) => ({ m: 'espn_' + m, k, o, label: k, fx: 'x' })), mids: legs.map(([m]) => 'espn_' + m),
  });
  await mk('b1', 10, [[10, '1x2:h', 2.0]]);                     // wins 20
  await mk('b2', 10, [[10, 'ou:2.5:o', 1.9]]);                  // 3 goals: wins 19
  await mk('b3', 10, [[10, 'btts:n', 2.0]]);                    // loses
  await mk('b4', 7, [[11, '1x2:h', 2.0]]);                      // refund 7
  await mk('b5', 10, [[10, '1x2:h', 2.0], [14, '1x2:d', 3.0]]); // multi: both win, 10 * 6 = 60
  await mk('b6', 10, [[10, '1x2:h', 2.0], [12, '1x2:a', 3.0]]); // multi with a void leg: 10 * 2 = 20
  await mk('b7', 10, [[14, '1x2:h', 2.0], [13, '1x2:a', 3.0]]); // first leg lost: lost now, though leg 2 is still playing
  await mk('b8', 10, [[10, '1x2:h', 2.0], [13, '1x2:a', 3.0]]); // leg 1 won, leg 2 playing: stays open
  await mk('b9', 10, [[10, '1x2:h', 2.0], [10, 'ou:2.5:o', 1.9]]); // two legs on one match: refund 10
  await db.doc('bets/old').set({ uid: 'p1', matchId: 'espn_10', key: '1x2:a', stake: 5, odds: 4, status: 'open', label: 'x', fixture: 'x' }); // loses
  feeds['eng.1'] = [
    ev('10', now - 3 * H, 'STATUS_FULL_TIME', 'Spurs', 'Everton', 2, 1),
    ev('12', now - 5 * H, 'STATUS_POSTPONED', 'Hull', 'Derby', 0, 0),
    ev('13', now - 1 * H, 'STATUS_SECOND_HALF', 'Stoke', 'Wigan', 0, 1),
    ev('14', now - 4 * H, 'STATUS_FULL_TIME', 'Bolton', 'Bury', 0, 0),
  ];
  feeds['uefa.nations'] = [];

  await sync();

  const st = async (id) => (await db.doc('bets/' + id).get()).data();
  const expect = { b1: ['won', 20], b2: ['won', 19], b3: ['lost', 0], b4: ['void', 7], b5: ['won', 60], b6: ['won', 20], b7: ['lost', 0], b9: ['void', 10], old: ['lost', 0] };
  for (const [id, [status, payout]] of Object.entries(expect)) {
    const b = await st(id);
    assert.equal(b.status, status, id + ' status');
    assert.equal(b.payout, payout, id + ' payout');
  }
  const b8 = await st('b8');
  assert.equal(b8.status, 'open');
  assert.deepEqual(b8.res, ['won', 'open']);
  assert.equal((await db.doc('matches/espn_13').get()).data().status, 'scheduled');
  const p = (await db.doc('players/p1').get()).data();
  assert.equal(p.coins, 20 + 19 + 7 + 60 + 20 + 10);
  assert.equal(p.won, 4); assert.equal(p.lost, 3);

  await sync(); // running again pays nothing twice
  assert.equal((await db.doc('players/p1').get()).data().coins, 136);

  // The last leg finishes: b8 pays 10 * 2 * 3 = 60.
  feeds['eng.1'] = [ev('13', now - 1 * H, 'STATUS_FULL_TIME', 'Stoke', 'Wigan', 0, 1)];
  await sync();
  assert.equal((await st('b8')).status, 'won');
  assert.equal((await db.doc('players/p1').get()).data().coins, 196);
});
