import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBoard, clockText } from '../public/espn.js';

const board = { events: [{ id: '7', competitions: [{
  status: { clock: 2830, displayClock: "45'+3'", period: 1, type: { name: 'STATUS_FIRST_HALF', state: 'in' } },
  competitors: [{ homeAway: 'home', score: '1', team: { id: '10' } }, { homeAway: 'away', score: '1', team: { id: '20' } }],
  details: [
    { scoringPlay: true, clock: { displayValue: "12'" }, team: { id: '10' }, athletesInvolved: [{ shortName: 'A. Home' }] },
    { yellowCard: true, clock: { displayValue: "30'" }, team: { id: '20' }, athletesInvolved: [{ shortName: 'B. Card' }] },
    { scoringPlay: true, ownGoal: true, clock: { displayValue: "45'+1'" }, team: { id: '10' }, athletesInvolved: [{ shortName: 'C. Oops' }] },
    { redCard: true, clock: { displayValue: "44'" }, team: { id: '20' }, athletesInvolved: [{ shortName: 'D. Off' }] },
  ],
}] }] };

test('parses score, clock and goal/red card events', () => {
  const e = parseBoard(board, 1000).espn_7;
  assert.equal(e.state, 'in'); assert.equal(e.sh, 1); assert.equal(e.sa, 1); assert.equal(e.at, 1000);
  assert.deepEqual(e.evs.map((x) => [x.g, x.s, x.min, x.name, x.og]), [
    [true, 'h', "12'", 'A. Home', false], [true, 'h', "45+1'", 'C. Oops', true], [false, 'a', "44'", 'D. Off', false]]);
});

test('clock runs on locally, with stoppage time and a cap', () => {
  const e = { status: 'STATUS_SECOND_HALF', clock: 3000, period: 2, at: 0, shown: "51'" };
  assert.equal(clockText(e, 0, 'HT'), "51'");
  assert.equal(clockText(e, 120e3, 'HT'), "53'");
  assert.equal(clockText({ ...e, clock: 5500 }, 0, 'HT'), "90+2'");
  assert.equal(clockText(e, 3600e3, 'HT'), "54'"); // feed died: stops 3 minutes on
  assert.equal(clockText({ ...e, clock: 2750, period: 1 }, 0, 'HT'), "45+1'");
  assert.equal(clockText({ ...e, status: 'STATUS_HALFTIME' }, 0, 'HT'), 'HT');
  assert.equal(clockText({ ...e, status: 'STATUS_FULL_TIME', shown: "90'+4'" }, 0, 'HT'), "90+4'");
});
