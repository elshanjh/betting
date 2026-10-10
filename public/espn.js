// Live scores straight from ESPN's public scoreboard, polled by the browser
// like SofaScore or FotMob do. Scores, the match clock and goal scorers come
// from here; live odds still come from the live engine's `live/` documents,
// because the security rules only accept those prices.

const API = 'https://site.api.espn.com/apis/site/v2/sports/soccer/';
const RUNNING = new Set(['STATUS_IN_PROGRESS', 'STATUS_FIRST_HALF', 'STATUS_SECOND_HALF', 'STATUS_OVERTIME', 'STATUS_EXTRA_TIME']);

// One scoreboard into { id: state }. Only the fields the app shows.
export function parseBoard(json, now) {
  const out = {};
  (json.events || []).forEach((ev) => {
    const c = ev.competitions && ev.competitions[0];
    if (!c) return;
    const home = c.competitors.find((x) => x.homeAway === 'home'), away = c.competitors.find((x) => x.homeAway === 'away');
    if (!home || !away) return;
    const st = c.status || ev.status || {}, type = st.type || {};
    // Goals and red cards in match order: { g: goal or red, s: 'h'|'a', min, name }.
    const evs = [];
    (c.details || []).forEach((d) => {
      if (!(d.scoringPlay && !d.shootout) && !d.redCard) return;
      const who = d.athletesInvolved && d.athletesInvolved[0];
      evs.push({ g: !d.redCard, s: d.team && String(d.team.id) === String(home.team.id) ? 'h' : 'a', min: String((d.clock && d.clock.displayValue) || '').replace(/'\+/, '+'),
        name: who ? who.shortName || who.displayName || '' : '', og: !!d.ownGoal, pen: !!d.penaltyKick });
    });
    out['espn_' + ev.id] = {
      state: type.state, status: type.name, sh: parseInt(home.score, 10) || 0, sa: parseInt(away.score, 10) || 0,
      clock: Number(st.clock) || 0, shown: st.displayClock || '', period: st.period || 0, at: now, evs,
    };
  });
  return out;
}

// The clock ticks on locally between polls (capped, so a dead feed stops it).
export function clockText(e, now, HT) {
  if (!e) return '';
  if (e.status === 'STATUS_HALFTIME') return HT;
  if (!RUNNING.has(e.status)) return e.shown.replace(/'\+/, '+');
  const sec = e.clock + Math.min(180e3, Math.max(0, now - e.at)) / 1000;
  const min = Math.floor(sec / 60) + 1;
  const end = e.period <= 1 ? 45 : e.period === 2 ? 90 : e.period === 3 ? 105 : 120;
  return min > end ? end + '+' + (min - end) + "'" : min + "'";
}

export async function fetchBoard(slug) {
  const res = await fetch(API + slug + '/scoreboard', { signal: AbortSignal.timeout(10e3), cache: 'no-store' });
  if (!res.ok) throw new Error(slug + ' HTTP ' + res.status);
  return parseBoard(await res.json(), Date.now());
}
