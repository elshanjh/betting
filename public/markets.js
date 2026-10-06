// Shared betting maths. Used by the app (to show prices and labels) and by
// scripts/sync.mjs (to publish prices and settle bets), so a price and the
// rule that settles it always come from the same code.
//
// Every price beyond 1X2 comes from one Poisson goals model fitted to the
// bookmaker 1X2 prices of the match.

const MARGIN = 0.93; // payout ratio for the derived markets (7% house edge)

function pois(l) {
  const a = [Math.exp(-l)];
  for (let i = 1; i < 10; i++) a[i] = (a[i - 1] * l) / i;
  return a;
}

function grid(lh, la) {
  const H = pois(lh), A = pois(la), g = [];
  let t = 0;
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    const p = H[i] * A[j];
    g.push([i, j, p]);
    t += p;
  }
  g.forEach((c) => { c[2] /= t; });
  return g;
}

function hda(g) {
  let h = 0, d = 0, a = 0;
  g.forEach((c) => { if (c[0] > c[1]) h += c[2]; else if (c[0] < c[1]) a += c[2]; else d += c[2]; });
  return [h, d, a];
}

// Find home/away goal rates whose home-draw-away split matches the 1X2 odds.
function fitGrid(o) {
  let ph = 1 / o.h, pd = 1 / o.d, pa = 1 / o.a;
  const s = ph + pd + pa;
  ph /= s; pd /= s; pa /= s;
  let lo = 0.6, hi = 6, g, lh, la;
  for (let i = 0; i < 22; i++) {
    const T = (lo + hi) / 2;
    let a = 0.02, b = 0.98;
    for (let j = 0; j < 22; j++) {
      const sp = (a + b) / 2;
      lh = T * sp; la = T * (1 - sp);
      g = grid(lh, la);
      const r = hda(g);
      if (r[0] - r[2] < ph - pa) a = sp; else b = sp;
    }
    if (hda(g)[1] > pd) lo = T; else hi = T;
  }
  return { g, lh, la };
}

// 'won' | 'lost' | 'void' for selection key k given the final score h-a.
export function outcome(k, h, a) {
  const p = k.split(':'), t = h + a, r = h > a ? 'h' : h < a ? 'a' : 'd';
  let w, d, s, n;
  switch (p[0]) {
    case '1x2': w = r === p[1]; break;
    case 'dc': w = p[1] === '1x' ? r !== 'a' : p[1] === '12' ? r !== 'd' : r !== 'h'; break;
    case 'dnb': if (r === 'd') return 'void'; w = r === p[1]; break;
    case 'ou': w = p[2] === 'o' ? t > +p[1] : t < +p[1]; break;
    case 'btts': w = (h > 0 && a > 0) === (p[1] === 'y'); break;
    case 'tth': w = p[2] === 'o' ? h > +p[1] : h < +p[1]; break;
    case 'tta': w = p[2] === 'o' ? a > +p[1] : a < +p[1]; break;
    case 'hc': d = h + (+p[1]) - a; w = (d > 0 ? 'h' : d < 0 ? 'a' : 'd') === p[2]; break;
    case 'oe': w = (t % 2 === 1) === (p[1] === 'o'); break;
    case 'tg': w = p[1] === '5+' ? t >= 5 : t === +p[1]; break;
    case 'cs':
      if (p[1] === 'other') w = h > 3 || a > 3;
      else { s = p[1].split('-'); w = h === +s[0] && a === +s[1]; }
      break;
    case 'rou': w = r === p[1] && (p[2] === 'o' ? t > 2.5 : t < 2.5); break;
    case 'rbt': w = r === p[1] && ((h > 0 && a > 0) === (p[2] === 'y')); break;
    case 'wtn': w = p[1] === 'h' ? (h > a && a === 0) : (a > h && h === 0); break;
    case 'mg':
      if (p[1] === 'd') w = h === a;
      else { d = p[1][0] === 'h' ? h - a : a - h; n = p[1].slice(1); w = n === '3+' ? d >= 3 : d === +n; }
      break;
    default: return 'void';
  }
  return w ? 'won' : 'lost';
}

// Market groups for a match: [{ name, sels: [[key, shortLabel, longLabel]] }]
export function markets(home, away) {
  const H = home, A = away, L = [];
  let x;
  const M = (name, sels) => L.push({ name, sels });
  M('Double chance', [['dc:1x', '1X', H + ' or draw'], ['dc:12', '12', H + ' or ' + A], ['dc:x2', 'X2', 'Draw or ' + A]]);
  M('Draw no bet', [['dnb:h', '1', H + ' (draw no bet)'], ['dnb:a', '2', A + ' (draw no bet)']]);
  x = [];
  [0.5, 1.5, 2.5, 3.5, 4.5].forEach((n) => { x.push(['ou:' + n + ':o', 'Over ' + n, 'Over ' + n + ' goals'], ['ou:' + n + ':u', 'Under ' + n, 'Under ' + n + ' goals']); });
  M('Total goals', x);
  M('Both teams to score', [['btts:y', 'Yes', 'Both teams to score'], ['btts:n', 'No', 'Both teams to score: no']]);
  [['tth', H], ['tta', A]].forEach((t) => {
    x = [];
    [0.5, 1.5, 2.5].forEach((n) => { x.push([t[0] + ':' + n + ':o', 'Over ' + n, t[1] + ' over ' + n + ' goals'], [t[0] + ':' + n + ':u', 'Under ' + n, t[1] + ' under ' + n + ' goals']); });
    M(t[1] + ' goals', x);
  });
  [-1, 1].forEach((n) => {
    const hs = (n > 0 ? '+' : '') + n, as = (n > 0 ? '' : '+') + (-n);
    M('Handicap: ' + H + ' ' + hs, [['hc:' + n + ':h', '1', H + ' ' + hs + ' handicap'], ['hc:' + n + ':d', 'X', 'Handicap draw (' + H + ' ' + hs + ')'], ['hc:' + n + ':a', '2', A + ' ' + as + ' handicap']]);
  });
  x = [];
  [['h', '1', H], ['d', 'X', 'Draw'], ['a', '2', A]].forEach((r) => {
    x.push(['rou:' + r[0] + ':o', r[1] + ' + Over 2.5', r[2] + ' and over 2.5 goals'], ['rou:' + r[0] + ':u', r[1] + ' + Under 2.5', r[2] + ' and under 2.5 goals']);
  });
  M('Result and total goals', x);
  x = [];
  [['h', '1', H], ['d', 'X', 'Draw'], ['a', '2', A]].forEach((r) => {
    x.push(['rbt:' + r[0] + ':y', r[1] + ' + Yes', r[2] + ' and both teams score'], ['rbt:' + r[0] + ':n', r[1] + ' + No', r[2] + ' and not both teams score']);
  });
  M('Result and both teams to score', x);
  M('Win to nil', [['wtn:h', '1', H + ' to win to nil'], ['wtn:a', '2', A + ' to win to nil']]);
  M('Winning margin', [['mg:h1', '1 by 1', H + ' to win by 1'], ['mg:h2', '1 by 2', H + ' to win by 2'], ['mg:h3+', '1 by 3+', H + ' to win by 3 or more'], ['mg:d', 'Draw', 'Winning margin: draw'],
    ['mg:a1', '2 by 1', A + ' to win by 1'], ['mg:a2', '2 by 2', A + ' to win by 2'], ['mg:a3+', '2 by 3+', A + ' to win by 3 or more']]);
  M('Exact number of goals', ['0', '1', '2', '3', '4', '5+'].map((n) => ['tg:' + n, n, n === '5+' ? '5 or more goals in the match' : 'Exactly ' + n + ' goals in the match']));
  M('Odd or even goals', [['oe:o', 'Odd', 'Odd number of goals'], ['oe:e', 'Even', 'Even number of goals']]);
  x = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) x.push(['cs:' + i + '-' + j, i + '-' + j, 'Correct score ' + i + '-' + j]);
  x.push(['cs:other', 'Other', 'Any other score']);
  M('Correct score', x);
  return L;
}

export function selLabel(home, away, k, pl) {
  if (k.startsWith('lv:')) return liveLabel(home, away, k);
  if (k.startsWith('sc:') || k.startsWith('fg:')) {
    const n = (pl && pl[k.slice(3)] && pl[k.slice(3)].n) || 'Player';
    return k.startsWith('sc:') ? n + ' to score' : n + ' to score first';
  }
  if (TIMELINE.has(k.split(':')[0])) {
    let out = k;
    halfMarkets(home, away).forEach((g) => g.sels.forEach((s) => { if (s[0] === k) out = s[2]; }));
    return out;
  }
  if (k === '1x2:h') return home;
  if (k === '1x2:a') return away;
  if (k === '1x2:d') return 'Draw';
  let out = k;
  markets(home, away).forEach((g) => g.sels.forEach((s) => { if (s[0] === k) out = s[2]; }));
  return out;
}

// All prices for a match, keyed by selection: { '1x2:h': 2.1, 'ou:2.5:o': 1.85, ... }
// The sync job stores this map on each match; the security rules only accept
// a bet whose odds equal the stored price.
export function priceMap(home, away, o) {
  const p = { '1x2:h': o.h, '1x2:d': o.d, '1x2:a': o.a };
  const { g } = fitGrid(o);
  markets(home, away).forEach((grp) => grp.sels.forEach((s) => {
    let w = 0, v = 0;
    g.forEach((c) => { const r = outcome(s[0], c[0], c[1]); if (r === 'won') w += c[2]; else if (r === 'void') v += c[2]; });
    const prob = v < 1 ? w / (1 - v) : 0;
    p[s[0]] = prob > 0 ? Math.min(101, Math.max(1.01, Math.round((MARGIN * 100) / prob) / 100)) : 101;
  }));
  return p;
}

// 1X2 odds from an Elo rating difference (home minus away, home advantage
// already included), for matches without bookmaker prices. Fits the same
// goals model so the result's expected score matches Elo's win expectancy.
export function eloOdds(dr) {
  const we = 1 / (Math.pow(10, -dr / 400) + 1), T = 2.6;
  let a = 0.02, b = 0.98, r;
  for (let j = 0; j < 30; j++) {
    const sp = (a + b) / 2;
    r = hda(grid(T * sp, T * (1 - sp)));
    if (r[0] + r[1] / 2 < we) a = sp; else b = sp;
  }
  const odd = (p) => Math.min(51, Math.max(1.01, Math.round((MARGIN * 100) / p) / 100));
  return { h: odd(r[0]), d: odd(r[1]), a: odd(r[2]) };
}

export const MAX_LEGS = 6; // firestore.rules checks at most 6 legs
export const MAX_ODDS = 1000;

// Combined price of a multi-bet: the product of its legs, capped.
export function comboOdds(odds) {
  return Math.min(MAX_ODDS, Math.round(odds.reduce((x, o) => x * o, 1) * 100) / 100);
}

// Result of a bet given its legs and the matches they are on.
// Returns { status: 'open'|'won'|'lost'|'void', res: [...per leg], odds }.
// A lost leg loses the bet at once; a void leg counts as odds 1; two legs on
// the same match make the whole bet void (refund).
export function judge(legs, matches) {
  const res = legs.map((l) => {
    const m = matches[l.m];
    if (!m || m.status === 'scheduled') return 'open';
    if (m.status === 'void') return 'void';
    return l.k.startsWith('lv:') ? liveOutcome(l, m) : matchOutcome(l.k, m);
  });
  if (new Set(legs.map((l) => l.m)).size !== legs.length) return { status: 'void', res, odds: 1 };
  if (res.includes('lost')) return { status: 'lost', res, odds: 0 };
  if (res.includes('open')) return { status: 'open', res, odds: 0 };
  const live = legs.filter((l, i) => res[i] === 'won').map((l) => l.o);
  if (!live.length) return { status: 'void', res, odds: 1 };
  return { status: 'won', res, odds: comboOdds(live) };
}

/* ---------- live betting ---------- */
// Live prices come from the same goals model: the pre-match goal rates,
// scaled to the time left, added to the current score.

export const LIVE_CLOSE_MIN = 85; // no live bets from this minute on

export function livePrices(o, sh, sa, min) {
  const { lh, la } = fitGrid(o);
  const t = Math.max(0.01, (94 - Math.min(min, 93)) / 94); // share of the match left, incl. stoppage time
  const g = grid(lh * t, la * t).map(([i, j, p]) => [sh + i, sa + j, p]);
  const out = {};
  const odd = (p) => (p >= 0.0099 ? Math.min(101, Math.max(1.01, Math.round((MARGIN * 100) / p) / 100)) : null);
  const put = (k, p) => { const v = odd(p); if (v && v > 1.01) out[k] = v; };
  const P = (f) => g.reduce((s, c) => s + (f(c[0], c[1]) ? c[2] : 0), 0);
  put('lv:1x2:h', P((h, a) => h > a)); put('lv:1x2:d', P((h, a) => h === a)); put('lv:1x2:a', P((h, a) => h < a));
  put('lv:dc:1x', P((h, a) => h >= a)); put('lv:dc:12', P((h, a) => h !== a)); put('lv:dc:x2', P((h, a) => h <= a));
  const none = Math.exp(-(lh + la) * t), share = lh / (lh + la);
  put('lv:ng:h', (1 - none) * share); put('lv:ng:n', none); put('lv:ng:a', (1 - none) * (1 - share));
  const tot = sh + sa;
  [0.5, 1.5, 2.5].forEach((d) => { const L = tot + d; put('lv:ou:' + L + ':o', P((h, a) => h + a > L)); put('lv:ou:' + L + ':u', P((h, a) => h + a < L)); });
  if (!(sh > 0 && sa > 0)) { put('lv:btts:y', P((h, a) => h > 0 && a > 0)); put('lv:btts:n', P((h, a) => !(h > 0 && a > 0))); }
  return out;
}

// Groups to show for a live match: [{ name, sels: [[key, short]] }], only keys with a price.
export function liveMarkets(home, away, p) {
  const G = [
    ['Match result', [['lv:1x2:h', '1'], ['lv:1x2:d', 'X'], ['lv:1x2:a', '2']]],
    ['Next goal', [['lv:ng:h', home], ['lv:ng:n', 'No more goals'], ['lv:ng:a', away]]],
    ['Total goals', Object.keys(p).filter((k) => k.startsWith('lv:ou:')).sort((x, y) => parseFloat(x.split(':')[2]) - parseFloat(y.split(':')[2]) || (x < y ? -1 : 1))
      .map((k) => [k, (k.endsWith(':o') ? 'Over ' : 'Under ') + k.split(':')[2]])],
    ['Double chance', [['lv:dc:1x', '1X'], ['lv:dc:12', '12'], ['lv:dc:x2', 'X2']]],
    ['Both teams to score', [['lv:btts:y', 'Yes'], ['lv:btts:n', 'No']]],
  ];
  return G.map(([name, sels]) => ({ name, sels: sels.filter((s) => p[s[0]] != null) })).filter((g) => g.sels.length);
}

function liveLabel(home, away, k) {
  const p = k.split(':');
  const side = (x) => (x === 'h' ? home : x === 'a' ? away : 'Draw');
  let s;
  if (p[1] === '1x2') s = side(p[2]);
  else if (p[1] === 'dc') s = p[2] === '1x' ? home + ' or draw' : p[2] === '12' ? home + ' or ' + away : 'Draw or ' + away;
  else if (p[1] === 'ng') s = p[2] === 'n' ? 'No more goals' : 'Next goal: ' + side(p[2]);
  else if (p[1] === 'ou') s = (p[3] === 'o' ? 'Over ' : 'Under ') + p[2] + ' goals';
  else if (p[1] === 'btts') s = 'Both teams to score: ' + (p[2] === 'y' ? 'yes' : 'no');
  else s = k;
  return s + ' (live)';
}

// A live pick records the score (sc) and match clock in seconds (t) it was
// placed at. Live data can lag the TV by a minute or so, so if the goal
// timeline shows any goal up to LIVE_GRACE seconds after t that the pick's
// score doesn't include, the pick is void (refund): it may have been placed
// by someone who had already seen that goal.
// `m.goals` is [{ s: 'h'|'a', t: seconds }] or null when ESPN gave no timeline.
export const LIVE_GRACE = 120;
export function liveOutcome(l, m) {
  const goals = m.goals ? m.goals.slice().sort((x, y) => x.t - y.t) : null;
  const k = l.k.split(':');
  if (goals) {
    const by = goals.filter((g) => g.t <= l.t + LIVE_GRACE);
    const before = goals.filter((g) => g.t <= l.t), h = before.filter((g) => g.s === 'h').length;
    if (h !== l.sc[0] || before.length - h !== l.sc[1] || by.length !== before.length) return 'void';
  }
  if (k[1] === 'ng') {
    if (!goals) return 'void';
    const next = goals[l.sc[0] + l.sc[1]];
    return (next ? next.s : 'n') === k[2] ? 'won' : 'lost';
  }
  return outcome(k.slice(1).join(':'), m.sh, m.sa);
}

/* ---------- halves and goalscorers ---------- */
// These need the goal timeline to settle: m.goals = [{ s: 'h'|'a', t, h: half, p: playerId, og }].
const H1 = 0.45; // share of goals scored in the first half

export function halfMarkets(home, away) {
  const R = [['h', '1', home], ['d', 'X', 'Draw'], ['a', '2', away]];
  return [
    { name: 'Half-time result', sels: R.map(([k, s, l]) => ['ht:' + k, s, l + ' at half-time']) },
    { name: 'Half-time / full-time', sels: R.flatMap(([a, sa, la]) => R.map(([b, sb, lb]) => ['htft:' + a + b, sa + '/' + sb, la + ' at half-time, ' + lb + ' at full-time'])) },
    { name: '1st half goals', sels: [0.5, 1.5].flatMap((n) => [['h1ou:' + n + ':o', 'Over ' + n, '1st half over ' + n + ' goals'], ['h1ou:' + n + ':u', 'Under ' + n, '1st half under ' + n + ' goals']]) },
    { name: '2nd half goals', sels: [0.5, 1.5].flatMap((n) => [['h2ou:' + n + ':o', 'Over ' + n, '2nd half over ' + n + ' goals'], ['h2ou:' + n + ':u', 'Under ' + n, '2nd half under ' + n + ' goals']]) },
    { name: 'Highest scoring half', sels: [['hsh:1', '1st', 'More goals in the 1st half'], ['hsh:2', '2nd', 'More goals in the 2nd half'], ['hsh:e', 'Equal', 'Same number of goals in both halves']] },
  ];
}

// Result of a half/scorer key from the halves' scores and the timeline.
function timelineOutcome(k, m) {
  const goals = m.goals;
  const p = k.split(':');
  if (p[0] === 'sc' || p[0] === 'fg') {
    if (!goals) return 'void';
    const real = goals.filter((g) => !g.og).sort((x, y) => x.t - y.t);
    const hit = p[0] === 'sc' ? real.some((g) => g.p === p[1]) : !!(real[0] && real[0].p === p[1]);
    if (hit) return 'won';
    if (m.played && !m.played.includes(p[1])) return 'void'; // didn't play: refund
    return 'lost';
  }
  if (!goals || goals.some((g) => !g.h)) return 'void';
  const c = (half, s) => goals.filter((g) => g.h === half && g.s === s).length;
  const h1 = c(1, 'h'), a1 = c(1, 'a'), h2 = c(2, 'h'), a2 = c(2, 'a');
  const r = (x, y) => (x > y ? 'h' : x < y ? 'a' : 'd');
  let w;
  switch (p[0]) {
    case 'ht': w = r(h1, a1) === p[1]; break;
    case 'htft': w = r(h1, a1) + r(m.sh, m.sa) === p[1]; break;
    case 'h1ou': w = p[2] === 'o' ? h1 + a1 > +p[1] : h1 + a1 < +p[1]; break;
    case 'h2ou': w = p[2] === 'o' ? h2 + a2 > +p[1] : h2 + a2 < +p[1]; break;
    case 'hsh': w = (h1 + a1 > h2 + a2 ? '1' : h1 + a1 < h2 + a2 ? '2' : 'e') === p[1]; break;
    default: return 'void';
  }
  return w ? 'won' : 'lost';
}

const TIMELINE = new Set(['ht', 'htft', 'h1ou', 'h2ou', 'hsh', 'sc', 'fg']);
// Any pre-match key, settled against a finished match.
export function matchOutcome(k, m) {
  return TIMELINE.has(k.split(':')[0]) ? timelineOutcome(k, m) : outcome(k, m.sh, m.sa);
}

export function halfPrices(o) {
  const { lh, la } = fitGrid(o);
  const g1 = grid(lh * H1, la * H1), g2 = grid(lh * (1 - H1), la * (1 - H1));
  const acc = {};
  const add = (k, p) => { acc[k] = (acc[k] || 0) + p; };
  const r = (x, y) => (x > y ? 'h' : x < y ? 'a' : 'd');
  for (const [i, j, p1] of g1) {
    if (p1 < 1e-7) continue;
    add('ht:' + r(i, j), p1);
    [0.5, 1.5].forEach((n) => add('h1ou:' + n + ':' + (i + j > n ? 'o' : 'u'), p1));
    for (const [k, l, p2] of g2) {
      const p = p1 * p2;
      if (p < 1e-9) continue;
      add('htft:' + r(i, j) + r(i + k, j + l), p);
      add('hsh:' + (i + j > k + l ? '1' : i + j < k + l ? '2' : 'e'), p);
    }
  }
  for (const [k, l, p2] of g2) [0.5, 1.5].forEach((n) => add('h2ou:' + n + ':' + (k + l > n ? 'o' : 'u'), p2));
  const out = {};
  for (const [k, p] of Object.entries(acc)) if (p > 0.004) out[k] = Math.min(101, Math.max(1.01, Math.round(((k.startsWith('htft') ? 0.9 : MARGIN) * 100) / p) / 100));
  return out;
}

// Goalscorer prices from season stats. squads: { h: [...], a: [...] } with
// { id, n, pos: 'G'|'D'|'M'|'F', apps, goals, inj }. Returns { p, pl }.
const PRIOR = { F: 0.38, M: 0.13, D: 0.045, G: 0 };
export function scorerPrices(o, squads, perTeam = 8) {
  const { lh, la } = fitGrid(o);
  const p = {}, pl = {};
  const tot = lh + la, anyGoal = 1 - Math.exp(-tot);
  for (const [side, lam] of [['h', lh], ['a', la]]) {
    const sq = (squads[side] || []).filter((x) => x.pos !== 'G' && !x.inj);
    if (!sq.length) continue;
    const games = Math.max(1, ...sq.map((x) => x.apps || 0));
    const w = sq.map((x) => {
      const rate = ((x.goals || 0) + (PRIOR[x.pos] ?? 0.1) * 4) / ((x.apps || 0) + 4);
      const play = Math.min(1, ((x.apps || 0) + 0.5) / (games + 1));
      return { x, w: rate * play, play };
    });
    const sum = w.reduce((s, y) => s + y.w, 0);
    if (!sum) continue;
    w.filter((y) => y.play >= 0.3).sort((a, b) => b.w - a.w).slice(0, perTeam).forEach(({ x, w: wi }) => {
      const xg = (lam * wi) / sum;
      const any = 1 - Math.exp(-xg), first = (xg / tot) * anyGoal;
      const odd = (q) => Math.min(101, Math.max(1.05, Math.round((0.88 * 100) / q) / 100));
      if (any < 0.01) return;
      p['sc:' + x.id] = odd(any);
      if (first >= 0.01) p['fg:' + x.id] = odd(first);
      pl[x.id] = { n: x.n, s: side };
    });
  }
  return { p, pl };
}
