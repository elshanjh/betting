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
  let lo = 0.6, hi = 6, g;
  for (let i = 0; i < 22; i++) {
    const T = (lo + hi) / 2;
    let a = 0.02, b = 0.98;
    for (let j = 0; j < 22; j++) {
      const sp = (a + b) / 2;
      g = grid(T * sp, T * (1 - sp));
      const r = hda(g);
      if (r[0] - r[2] < ph - pa) a = sp; else b = sp;
    }
    if (hda(g)[1] > pd) lo = T; else hi = T;
  }
  return g;
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

export function selLabel(home, away, k) {
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
  const g = fitGrid(o);
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
    return outcome(l.k, m.sh, m.sa);
  });
  if (new Set(legs.map((l) => l.m)).size !== legs.length) return { status: 'void', res, odds: 1 };
  if (res.includes('lost')) return { status: 'lost', res, odds: 0 };
  if (res.includes('open')) return { status: 'open', res, odds: 0 };
  const live = legs.filter((l, i) => res[i] === 'won').map((l) => l.o);
  if (!live.length) return { status: 'void', res, odds: 1 };
  return { status: 'won', res, odds: comboOdds(live) };
}
