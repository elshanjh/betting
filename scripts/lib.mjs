// Shared by sync.mjs (hourly) and live.mjs (during matches).
import { FieldValue } from 'firebase-admin/firestore';
import { judge } from '../public/markets.js';

// Half from ESPN's display clock: "45'+2'" is still the 1st half.
function halfOf(display) {
  const d = String(display || ''), m = parseInt(d, 10);
  if (!Number.isFinite(m)) return 0;
  if (m <= 45 || d.startsWith("45'+")) return 1;
  if (m <= 90 || d.startsWith("90'+")) return 2;
  return 3; // extra time
}

// Goal timeline [{ s: 'h'|'a', t: seconds, h: half, p: scorer id, og }] from
// ESPN's match details, or null when it can't be trusted (doesn't add up).
function goalsOf(c, homeId, sh, sa) {
  const d = (c.details || []).filter((x) => x.scoringPlay);
  if (!d.length) return sh === 0 && sa === 0 ? [] : null;
  const mk = (flipOwn) => d.map((x) => {
    let s = x.team?.id === homeId ? 'h' : 'a';
    if (flipOwn && x.ownGoal) s = s === 'h' ? 'a' : 'h';
    const g = { s, t: Number(x.clock?.value) || 0, h: halfOf(x.clock?.displayValue), og: !!x.ownGoal };
    const who = x.athletesInvolved?.[0]?.id;
    if (who) g.p = String(who);
    return g;
  });
  for (const flip of [false, true]) {
    const g = mk(flip), h = g.filter((x) => x.s === 'h').length;
    if (h === sh && g.length - h === sa) return g;
  }
  return null;
}

export function parse(league, ev) {
  const c = ev.competitions?.[0];
  if (!c) return null;
  const home = c.competitors.find((x) => x.homeAway === 'home'), away = c.competitors.find((x) => x.homeAway === 'away');
  if (!home || !away) return null;
  const st = c.status || ev.status || {};
  const sh = parseInt(home.score, 10), sa = parseInt(away.score, 10);
  return {
    id: 'espn_' + ev.id, league, ko: Date.parse(c.date || ev.date), status: st.type?.name, state: st.type?.state, neutral: !!c.neutralSite,
    home: home.team.displayName, away: away.team.displayName, sh, sa,
    hid: String(home.team.id || ''), aid: String(away.team.id || ''), hl: home.team.logo || '', al: away.team.logo || '',
    clock: Number(st.clock) || 0, shown: st.displayClock || '', period: st.period || 0,
    goals: Number.isInteger(sh) && Number.isInteger(sa) ? goalsOf(c, home.team.id, sh, sa) : null,
    o: bookOdds(c),
  };
}

// American odds ("-265", "+390", 250) to decimal (1.38, 4.9, 3.5).
function dec(x) {
  const n = Number(String(x).replace('+', ''));
  if (!Number.isFinite(n) || (n > -100 && n < 100)) return null;
  return Math.round((n > 0 ? 1 + n / 100 : 1 + 100 / -n) * 100) / 100;
}

function bookOdds(c) {
  const o = (c.odds || [])[0];
  if (!o) return null;
  const ml = o.moneyline || {};
  const pick = (side, fallback) => dec(ml[side]?.close?.odds ?? ml[side]?.open?.odds ?? fallback);
  const r = { h: pick('home', o.homeTeamOdds?.moneyLine), d: pick('draw', o.drawOdds?.moneyLine), a: pick('away', o.awayTeamOdds?.moneyLine) };
  return r.h && r.d && r.a ? r : null;
}

// Ids of players who started or came on, from the match summary; null if unknown.
export async function playedIds(api, slug, eventId) {
  try {
    const res = await fetch(api + '/' + slug + '/summary?event=' + eventId, { headers: { 'user-agent': 'Mozilla/5.0 friendly-stakes' }, signal: AbortSignal.timeout(15e3) });
    if (!res.ok) return null;
    const ids = [];
    ((await res.json()).rosters || []).forEach((t) => (t.roster || []).forEach((x) => { if (x.starter || x.subbedIn) ids.push(String(x.athlete?.id)); }));
    return ids.length ? ids : null;
  } catch (e) { return null; }
}

const legsOf = (b) => b.legs || [{ m: b.matchId, k: b.key, o: b.odds, label: b.label, fx: b.fixture }];

// Settles every open bet touching a match that finished or was called off.
export async function settle(db) {

  const snap = await db.collection('matches').where('settled', '==', false).get();
  const cache = {};
  const match = async (id) => {
    if (!(id in cache)) { const d = await db.doc('matches/' + id).get(); cache[id] = d.exists ? d.data() : null; }
    return cache[id];
  };
  for (const md of snap.docs) {
    const [a, b] = await Promise.all([
      db.collection('bets').where('mids', 'array-contains', md.id).where('status', '==', 'open').get(),
      db.collection('bets').where('matchId', '==', md.id).where('status', '==', 'open').get(), // bets from before multi-bets
    ]);
    const docs = [...a.docs, ...b.docs];
    let batch = db.batch(), ops = 0, done = 0;
    for (const bd of docs) {
      const bet = bd.data(), legs = legsOf(bet), ms = {};
      for (const l of legs) ms[l.m] = await match(l.m);
      const j = judge(legs, ms);
      if (j.status === 'open') { batch.update(bd.ref, { res: j.res }); ops++; continue; }
      const payout = j.status === 'won' ? Math.round(bet.stake * j.odds) : j.status === 'void' ? bet.stake : 0;
      const upd = { status: j.status, res: j.res, payout, settledAt: FieldValue.serverTimestamp() };
      if (legs.length === 1 && ms[legs[0].m]?.status === 'final') upd.score = ms[legs[0].m].sh + '-' + ms[legs[0].m].sa;
      batch.update(bd.ref, upd);
      const pu = { coins: FieldValue.increment(payout) };
      if (j.status === 'won') pu.won = FieldValue.increment(1);
      if (j.status === 'lost') pu.lost = FieldValue.increment(1);
      batch.update(db.doc('players/' + bet.uid), pu);
      ops += 2; done++;
      if (ops >= 400) { await batch.commit(); batch = db.batch(); ops = 0; }
    }
    batch.update(md.ref, { settled: true });
    await batch.commit();
    const m = md.data();
    console.log('settled ' + done + ' of ' + docs.length + ' bets touching ' + m.home + ' v ' + m.away);
  }
}
