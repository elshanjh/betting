// Security rule tests. Run with: npm test (starts the Firestore emulator).
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, collection, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { priceMap as basePrices, halfPrices, scorerPrices } from '../public/markets.js';
const SQ = { h: Array.from({ length: 12 }, (_, i) => ({ id: 'h' + i, n: 'H' + i, pos: 'FMD'[i % 3], apps: 5, goals: i % 3 })), a: Array.from({ length: 12 }, (_, i) => ({ id: 'a' + i, n: 'A' + i, pos: 'FMD'[i % 3], apps: 5, goals: i % 2 })) };
const priceMap = (h, a, o) => ({ ...basePrices(h, a, o), ...halfPrices(o), ...scorerPrices(o, SQ).p });

const DAY = Math.floor((Date.now() + 4 * 3600e3) / 864e5);
let env;

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-stakes', firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
});
after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const o = { h: 2.1, d: 3.4, a: 3.6 };
    await setDoc(doc(db, 'matches/m1'), { home: 'Arsenal', away: 'Chelsea', lg: 'Premier League', status: 'scheduled', ko: Timestamp.fromMillis(Date.now() + 864e5), o, p: priceMap('Arsenal', 'Chelsea', o) });
    await setDoc(doc(db, 'matches/m2'), { home: 'Inter', away: 'Milan', lg: 'Serie A', status: 'scheduled', ko: Timestamp.fromMillis(Date.now() - 3600e3), o, p: priceMap('Inter', 'Milan', o) });
    for (let i = 3; i <= 10; i++) await setDoc(doc(db, 'matches/m' + i), { home: 'Arsenal', away: 'Chelsea', lg: 'X', status: 'scheduled', ko: Timestamp.fromMillis(Date.now() + 864e5), o, p: priceMap('Arsenal', 'Chelsea', o) });
    await setDoc(doc(db, 'players/alice'), { name: 'Alice', coins: 100, lastClaimDay: DAY - 1, won: 0, lost: 0, joined: Timestamp.now() });
    await setDoc(doc(db, 'players/bob'), { name: 'Bob', coins: 50, lastClaimDay: DAY, won: 0, lost: 0, joined: Timestamp.now() });
  });
});

const as = (uid) => env.authenticatedContext(uid).firestore();

const P = priceMap('Arsenal', 'Chelsea', { h: 2.1, d: 3.4, a: 3.6 });

// Places a bet with the given legs ([matchId, key, odds?]) in one batch.
function bet(db, uid, coinsBefore, { legs = [['m1', '1x2:h']], stake = 10, coinsAfter, mids, odds = 2 } = {}) {
  const L = legs.map(([m, k, o]) => ({ m, k, o: o ?? P[k] ?? 2, label: k, fx: 'A v B' }));
  const ref = doc(collection(db, 'bets'));
  const b = writeBatch(db);
  b.set(ref, { uid, name: 'x', legs: L, mids: mids ?? L.map((l) => l.m), stake, odds, status: 'open', placed: serverTimestamp() });
  b.update(doc(db, 'players', uid), { coins: coinsAfter ?? coinsBefore - stake, lastBet: ref.id });
  return b.commit();
}

test('signed-out users cannot read', async () => {
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'matches/m1')));
});

test('join with 0 coins only', async () => {
  const fields = { name: 'Carl', lastClaimDay: 0, won: 0, lost: 0, joined: serverTimestamp() };
  await assertFails(setDoc(doc(as('carl'), 'players/carl'), { ...fields, coins: 1000 }));
  await assertFails(setDoc(doc(as('carl'), 'players/dave'), { ...fields, coins: 0 }));
  await assertSucceeds(setDoc(doc(as('carl'), 'players/carl'), { ...fields, coins: 0 }));
});

test('daily claim: exactly 100, once a day', async () => {
  const db = as('alice');
  await assertFails(updateDoc(doc(db, 'players/alice'), { coins: 300, lastClaimDay: DAY }));
  await assertFails(updateDoc(doc(db, 'players/alice'), { coins: 200, lastClaimDay: DAY + 1 }));
  await assertSucceeds(updateDoc(doc(db, 'players/alice'), { coins: 200, lastClaimDay: DAY }));
  await assertFails(updateDoc(doc(as('bob'), 'players/bob'), { coins: 150, lastClaimDay: DAY }));
});

test('cannot edit someone else or set coins directly', async () => {
  await assertFails(updateDoc(doc(as('bob'), 'players/alice'), { coins: 0 }));
  await assertFails(updateDoc(doc(as('alice'), 'players/alice'), { coins: 5000 }));
  await assertFails(updateDoc(doc(as('alice'), 'players/alice'), { won: 9 }));
});

test('rename', async () => {
  await assertSucceeds(updateDoc(doc(as('alice'), 'players/alice'), { name: 'Ali' }));
  await assertFails(updateDoc(doc(as('alice'), 'players/alice'), { name: '' }));
});

test('valid bets go through: singles, extra markets, multi-bets', async () => {
  await assertSucceeds(bet(as('alice'), 'alice', 100, { stake: 10 }));
  await assertSucceeds(bet(as('alice'), 'alice', 90, { legs: [['m1', 'cs:2-1']], stake: 20 }));
  await assertSucceeds(bet(as('alice'), 'alice', 70, { legs: [['m1', '1x2:h'], ['m3', 'btts:y'], ['m4', 'ou:2.5:o']], stake: 30 }));
  await assertSucceeds(bet(as('alice'), 'alice', 40, { legs: [3, 4, 5, 6, 7, 8].map((i) => ['m' + i, '1x2:d']), stake: 10 }));
  await assertSucceeds(bet(as('alice'), 'alice', 30, { legs: [['m3', 'sc:h0'], ['m4', 'htft:hh'], ['m5', 'fg:a0'], ['m6', 'hsh:2'], ['m7', 'ht:d'], ['m8', 'h2ou:0.5:o']], stake: 10 }));
});

test('bad bets are rejected', async () => {
  const db = as('alice');
  await assertFails(bet(db, 'alice', 100, { legs: [['m1', '1x2:h', 50]] }));                  // made-up odds
  await assertFails(bet(db, 'alice', 100, { legs: [['m1', '1x2:h'], ['m3', '1x2:a', 50]] })); // made-up odds on leg 2
  await assertFails(bet(db, 'alice', 100, { stake: 150 }));                                  // more than you have
  await assertFails(bet(db, 'alice', 100, { stake: 10, coinsAfter: 100 }));                 // stake not paid
  await assertFails(bet(db, 'alice', 100, { stake: 0 }));
  await assertFails(bet(db, 'alice', 100, { legs: [['m2', '1x2:h']] }));                     // kicked off
  await assertFails(bet(db, 'alice', 100, { legs: [['m1', '1x2:h'], ['m2', '1x2:h']] }));    // one leg kicked off
  await assertFails(bet(db, 'alice', 100, { legs: [['m1', 'nope', 2]] }));
  await assertFails(bet(db, 'alice', 100, { legs: [] }));
  await assertFails(bet(db, 'alice', 100, { legs: [1, 3, 4, 5, 6, 7, 8].map((i) => ['m' + i, '1x2:d']) })); // 7 legs
  await assertFails(bet(db, 'alice', 100, { legs: [['m1', '1x2:h']], mids: ['m3'] }));       // mids must match legs
  await assertFails(bet(as('bob'), 'alice', 100));                                           // on someone else's wallet
});

test('bet alone, without paying, is rejected', async () => {
  const db = as('alice');
  await assertFails(setDoc(doc(db, 'bets/b1'), { uid: 'alice', name: 'x', legs: [{ m: 'm1', k: '1x2:h', o: P['1x2:h'], label: 'A', fx: 'A v B' }], mids: ['m1'], stake: 10, odds: 2.1, status: 'open', placed: serverTimestamp() }));
});

test('nobody can settle bets or edit matches from the app', async () => {
  const db = as('alice');
  await assertSucceeds(bet(db, 'alice', 100));
  await assertFails(setDoc(doc(db, 'matches/m3'), { home: 'x' }));
  await assertFails(updateDoc(doc(db, 'matches/m1'), { status: 'final' }));
});

/* ---------- live bets ---------- */
async function seedLive(over = {}) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'live/m2'), {
    home: 'Inter', away: 'Milan', sh: 1, sa: 0, min: 60, clk: 3540, susp: false, done: false,
    p: { 'lv:1x2:h': 1.4, 'lv:ng:a': 3.1 }, at: Timestamp.now(), ...over,
  }));
}
function liveBet(db, { k = 'lv:1x2:h', o = 1.4, sc = [1, 0], t = 3540, live = true, extra = [] } = {}) {
  const ref = doc(collection(db, 'bets'));
  const legs = [{ m: 'm2', k, o, label: 'x', fx: 'Inter v Milan', sc, t }, ...extra];
  const b = writeBatch(db);
  const bet = { uid: 'alice', name: 'x', legs, mids: legs.map((l) => l.m), stake: 10, odds: o, status: 'open', placed: serverTimestamp() };
  if (live !== null) bet.live = live;
  b.set(ref, bet);
  b.update(doc(db, 'players/alice'), { coins: 90, lastBet: ref.id });
  return b.commit();
}

test('live bets at the live price go through', async () => {
  await seedLive();
  await assertSucceeds(liveBet(as('alice')));
});

test('bad live bets are rejected', async () => {
  await seedLive();
  const db = as('alice');
  await assertFails(liveBet(db, { o: 5 }));                      // wrong price
  await assertFails(liveBet(db, { sc: [0, 0] }));                // wrong score
  await assertFails(liveBet(db, { t: 3000 }));                   // wrong clock
  await assertFails(liveBet(db, { k: '1x2:h', o: 1.4 }));        // not a live market
  await assertFails(liveBet(db, { k: 'lv:1x2:h', o: 1.4, sc: [0, 0] })); // live pick with stale score
  await assertFails(liveBet(db, { extra: [{ m: 'm1', k: '1x2:h', o: 9, label: 'x', fx: 'x' }] })); // multi with a made-up pre-match price
  await seedLive({ susp: true });
  await assertFails(liveBet(db));                                // suspended
  await seedLive({ at: Timestamp.fromMillis(Date.now() - 120e3) });
  await assertFails(liveBet(db));                                // stale live data
  await seedLive({ done: true });
  await assertFails(liveBet(db));                                // match over
});

test('favourite teams: up to 5 names, and the language', async () => {
  const db = as('alice');
  await assertSucceeds(updateDoc(doc(db, 'players/alice'), { favs: ['Galatasaray', 'Arsenal', 'Qarabağ', 'Real Madrid', 'Azerbaijan'] }));
  await assertFails(updateDoc(doc(db, 'players/alice'), { favs: ['a', 'b', 'c', 'd', 'e', 'f'] }));
  await assertFails(updateDoc(doc(db, 'players/alice'), { favs: [42] }));
  await assertFails(updateDoc(doc(db, 'players/alice'), { favs: ['Arsenal'], coins: 1000 }));
  await assertSucceeds(updateDoc(doc(db, 'players/alice'), { lang: 'az' }));
  await assertFails(updateDoc(doc(db, 'players/alice'), { lang: 'xx' }));
});

test('daily claim resets at 00:00 in the player\'s own time zone', async () => {
  const now = Date.now();
  const day = (tz) => Math.floor((now + tz * 60000) / 864e5);
  // Tallinn-ish (UTC+3) and New York-ish (UTC-4) players, both unclaimed today.
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'players/tal'), { name: 'T', coins: 0, lastClaimDay: day(180) - 1, won: 0, lost: 0, tz: 180 });
    await setDoc(doc(ctx.firestore(), 'players/ny'), { name: 'N', coins: 0, lastClaimDay: day(-240) - 1, won: 0, lost: 0, tz: -240 });
  });
  await assertFails(updateDoc(doc(as('tal'), 'players/tal'), { coins: 100, lastClaimDay: day(240) === day(180) ? day(180) + 1 : day(240) })); // someone else's "today"
  await assertSucceeds(updateDoc(doc(as('tal'), 'players/tal'), { coins: 100, lastClaimDay: day(180) }));
  await assertFails(updateDoc(doc(as('tal'), 'players/tal'), { coins: 200, lastClaimDay: day(180) }));
  await assertSucceeds(updateDoc(doc(as('ny'), 'players/ny'), { coins: 100, lastClaimDay: day(-240) }));
});

test('changing time zone never buys a second claim', async () => {
  const now = Date.now();
  const day = (tz) => Math.floor((now + tz * 60000) / 864e5);
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'players/tr'), { name: 'X', coins: 100, lastClaimDay: day(-720), won: 0, lost: 0, tz: -720 }));
  const db = as('tr');
  // Claimed today at UTC-12; jump to UTC+14 without carrying the claim over: denied.
  await assertFails(updateDoc(doc(db, 'players/tr'), { tz: 840 }));
  // Carrying it over is the only allowed move, and then there's nothing to claim.
  await assertSucceeds(updateDoc(doc(db, 'players/tr'), { tz: 840, lastClaimDay: day(840) }));
  await assertFails(updateDoc(doc(db, 'players/tr'), { coins: 200, lastClaimDay: day(840) }));
  await assertFails(updateDoc(doc(db, 'players/tr'), { tz: 5000 }));
});

test('new players store their time zone', async () => {
  const fields = { name: 'Z', coins: 0, lastClaimDay: 0, won: 0, lost: 0, joined: serverTimestamp() };
  await assertSucceeds(setDoc(doc(as('z1'), 'players/z1'), { ...fields, tz: 180 }));
  await assertFails(setDoc(doc(as('z2'), 'players/z2'), { ...fields, tz: 'Europe/Tallinn' }));
});

test('live and pre-match picks combine in one multi-bet', async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    for (let i = 3; i <= 8; i++) await setDoc(doc(ctx.firestore(), 'live/m' + i), {
      home: 'A', away: 'B', sh: 0, sa: 1, min: 30, clk: 1790, susp: false, done: false, p: { 'lv:1x2:h': 4.5, 'lv:ng:a': 2.2 }, at: Timestamp.now(),
    });
  });
  const L = (i, k = 'lv:ng:a', o = 2.2) => ({ m: 'm' + i, k, o, label: 'x', fx: 'A v B', sc: [0, 1], t: 1790 });
  const go = (legs, stake = 10, before = 100) => {
    const db = as('alice'), ref = doc(collection(db, 'bets')), b = writeBatch(db);
    b.set(ref, { uid: 'alice', name: 'x', legs, mids: legs.map((l) => l.m), stake, odds: 2, status: 'open', live: true, placed: serverTimestamp() });
    b.update(doc(db, 'players/alice'), { coins: before - stake, lastBet: ref.id });
    return b.commit();
  };
  await assertSucceeds(go([L(3)], 10, 100));                                                         // single live
  await assertSucceeds(go([L(4), { m: 'm1', k: '1x2:h', o: P['1x2:h'], label: 'x', fx: 'x' }], 10, 90)); // live + pre-match
  await assertSucceeds(go([3, 4, 5, 6, 7, 8].map((i) => L(i)), 10, 80));                                // six live picks, the most rule work
  // a stale live price in a mix is refused
  await assertFails(go([L(3, 'lv:1x2:h', 9.9), { m: 'm1', k: '1x2:h', o: P['1x2:h'], label: 'x', fx: 'x' }], 10, 70));
});
