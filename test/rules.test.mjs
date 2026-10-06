// Security rule tests. Run with: npm test (starts the Firestore emulator).
import { test, before, beforeEach, after } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch, collection, serverTimestamp, Timestamp, getDoc } from 'firebase/firestore';
import { priceMap } from '../public/markets.js';

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
  await assertSucceeds(bet(as('alice'), 'alice', 40, { legs: [3, 4, 5, 6, 7, 8].map((i) => ['m' + i, '1x2:d']), stake: 40 }));
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
