// Pure maths: live prices and live settlement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { livePrices, liveOutcome, judge } from '../public/markets.js';

const o = { h: 2.1, d: 3.4, a: 3.6 };

test('live prices follow score and clock', () => {
  const start = livePrices(o, 0, 0, 1), late = livePrices(o, 1, 0, 80);
  assert.ok(Math.abs(start['lv:1x2:h'] - 2.1) < 0.2, 'kickoff prices are close to pre-match');
  assert.ok(late['lv:1x2:h'] < 1.15, 'a late lead makes the leader a big favourite');
  assert.ok(late['lv:ng:n'] < start['lv:ng:n'], 'no more goals gets likelier as time runs out');
  assert.equal(late['lv:ou:0.5:o'], undefined, 'settled lines are not offered');
  assert.ok(late['lv:ou:1.5:o'] > 1);
});

test('live settlement and the unseen-goal check', () => {
  const m = { status: 'final', sh: 2, sa: 1, goals: [{ s: 'h', t: 600 }, { s: 'a', t: 3000 }, { s: 'h', t: 4000 }] };
  const L = (k, sc, t) => liveOutcome({ k, sc, t }, m);
  assert.equal(L('lv:ng:a', [1, 0], 1200), 'won');
  assert.equal(L('lv:ng:h', [1, 0], 1200), 'lost');
  assert.equal(L('lv:ng:n', [2, 1], 4500), 'won');
  assert.equal(L('lv:1x2:h', [1, 1], 3600), 'won');
  assert.equal(L('lv:ou:2.5:o', [1, 1], 3600), 'won');
  assert.equal(L('lv:ng:h', [0, 0], 550), 'void', 'goal 50s after the bet: may have been seen on TV');
  assert.equal(L('lv:1x2:h', [0, 0], 700), 'void', 'bet recorded 0-0 after the 600s goal');
  assert.equal(liveOutcome({ k: 'lv:ng:h', sc: [1, 0], t: 1200 }, { ...m, goals: null }), 'void', 'next goal needs a timeline');
  assert.equal(liveOutcome({ k: 'lv:1x2:h', sc: [1, 0], t: 1200 }, { ...m, goals: null }), 'won');
  const j = judge([{ m: 'x', k: 'lv:ng:a', o: 3, sc: [1, 0], t: 1200 }], { x: m });
  assert.deepEqual([j.status, j.odds], ['won', 3]);
});

test('a multi-bet mixing live and pre-match picks settles on both', () => {
  const live = { status: 'final', sh: 2, sa: 1, goals: [{ s: 'h', t: 600, h: 1 }, { s: 'a', t: 3000, h: 2 }, { s: 'h', t: 4000, h: 2 }] };
  const pre = { status: 'final', sh: 0, sa: 0, goals: [] };
  const legs = [{ m: 'L', k: 'lv:ng:a', o: 3, sc: [1, 0], t: 1200 }, { m: 'P', k: '1x2:d', o: 3.2 }];
  assert.deepEqual(judge(legs, { L: live, P: pre }).status, 'won');
  assert.equal(judge(legs, { L: live, P: pre }).odds, 9.6);
  assert.equal(judge(legs, { L: live, P: { ...pre, status: 'scheduled' } }).status, 'open');
  assert.equal(judge([legs[0], { m: 'P', k: '1x2:h', o: 2 }], { L: live, P: pre }).status, 'lost');
});
