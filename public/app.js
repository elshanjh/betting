import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, connectAuthEmulator }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, collection, doc, query, where, orderBy, limit, onSnapshot, setDoc, updateDoc,
  writeBatch, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, DAILY_COINS, DAY_OFFSET_HOURS } from './config.js';
import { markets, selLabel } from './markets.js';

const $ = (id) => document.getElementById(id);
const S = {
  user: null, authed: false, me: null, meLoaded: false, players: [], matches: [], matchesLoaded: false,
  myBets: [], feed: [], openBets: [], league: 'all', open: null, exp: null, busy: false,
};
const last = {};
const subs = [];

function paint(id, html) { if (last[id] !== html) { last[id] = html; $(id).innerHTML = html; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function fmtDay(d) { return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); }
function fmtTime(d) { return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
// Must match today() in firestore.rules.
const DAY_MS = 86400000, OFFSET_MS = DAY_OFFSET_HOURS * 3600000;
function claimDay(now = Date.now()) { return Math.floor((now + OFFSET_MS) / DAY_MS); }
function nextClaimAt() { return (claimDay() + 1) * DAY_MS - OFFSET_MS; }
function matchMap() { const o = {}; S.matches.forEach((m) => { o[m.id] = m; }); return o; }
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
const extraCount = markets('', '').reduce((n, g) => n + g.sels.length, 0);

/* ---------- firebase ---------- */
// Local testing: http://localhost:5000/?emulator talks to `firebase emulators:start`.
const emulator = location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator');
const configured = emulator || !String(firebaseConfig.apiKey).includes('PASTE');
let auth, db;
if (configured) {
  const app = initializeApp(emulator ? { apiKey: 'demo', projectId: 'demo-stakes', authDomain: 'localhost' } : firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  if (emulator) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
  }
}

function signIn() {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch((e) => {
    // Popups are blocked in some installed home-screen apps; fall back to a redirect.
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') signInWithRedirect(auth, provider);
    else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast('Sign-in failed. Try again.');
  });
}

function failed(e, msg) {
  console.error(e);
  toast(e && e.code === 'permission-denied' && msg ? msg : 'Could not save that. Check your connection and try again.');
}

async function join(name) {
  name = name.trim().slice(0, 20);
  if (!name) { toast('Pick a name first.'); return; }
  try {
    await setDoc(doc(db, 'players', S.user.uid), { name, coins: 0, lastClaimDay: 0, won: 0, lost: 0, joined: serverTimestamp() });
    toast('You are in. Claim your first ' + DAILY_COINS + ' coins.');
  } catch (e) { failed(e); }
}

async function claim() {
  if (S.busy || !S.me || S.me.lastClaimDay >= claimDay()) return;
  S.busy = true;
  try {
    await updateDoc(doc(db, 'players', S.user.uid), { coins: S.me.coins + DAILY_COINS, lastClaimDay: claimDay() });
    toast('+' + DAILY_COINS + ' coins. Good luck.');
  } catch (e) { failed(e, 'Already claimed today. Come back tomorrow.'); }
  S.busy = false;
}

async function place() {
  const o = S.open;
  if (!o || S.busy) return;
  const stake = Math.floor(Number(o.stake));
  const m = matchMap()[o.mid];
  if (!m || m.status !== 'scheduled' || ms(m.ko) <= Date.now()) { toast('This match has kicked off. Betting is closed.'); return; }
  if (!(stake >= 1)) { toast('Enter a stake of at least 1 coin.'); return; }
  if (stake > S.me.coins) { toast('You only have ' + S.me.coins + ' coins.'); return; }
  const odds = m.p[o.k], label = selLabel(m.home, m.away, o.k);
  const betRef = doc(collection(db, 'bets'));
  const b = writeBatch(db);
  b.set(betRef, {
    uid: S.user.uid, name: S.me.name, matchId: m.id, key: o.k, label, fixture: m.home + ' v ' + m.away,
    stake, odds, status: 'open', placed: serverTimestamp(),
  });
  b.update(doc(db, 'players', S.user.uid), { coins: S.me.coins - stake, lastBet: betRef.id });
  S.busy = true;
  try {
    await b.commit();
    S.open = null;
    toast(stake + ' coins on ' + label + '.');
  } catch (e) { failed(e, 'Bet not accepted. The price may have just changed, check it and try again.'); }
  S.busy = false;
  renderMatches();
}

function listen() {
  const uid = S.user.uid;
  const since = Timestamp.fromMillis(Date.now() - 4 * DAY_MS);
  subs.push(onSnapshot(query(collection(db, 'matches'), where('ko', '>=', since), orderBy('ko'), limit(400)), (snap) => {
    S.matches = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((m) => m.p && m.ko && m.home && m.away);
    S.matchesLoaded = true;
    renderMatches();
  }, (e) => { console.error(e); S.matchesLoaded = true; renderMatches(); }));

  subs.push(onSnapshot(collection(db, 'players'), (snap) => {
    S.players = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const mine = S.players.find((p) => p.id === uid) || null;
    if (mine || !snap.metadata.fromCache) S.meLoaded = true;
    S.me = mine;
    renderAll();
  }, (e) => { console.error(e); S.meLoaded = true; renderAll(); }));

  let seen = null;
  subs.push(onSnapshot(query(collection(db, 'bets'), where('uid', '==', uid), orderBy('placed', 'desc'), limit(60)), (snap) => {
    S.myBets = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    // Tell the player when their bets settle while the app is open.
    if (seen) {
      let won = 0, lost = 0;
      S.myBets.forEach((b) => {
        if (seen[b.id] === 'open' && b.status === 'won') won += b.payout || 0;
        if (seen[b.id] === 'open' && b.status === 'lost') lost++;
      });
      if (won) toast('Results are in. You won ' + won + ' coins.');
      else if (lost) toast('Results are in. No winners this time.');
    }
    seen = {};
    S.myBets.forEach((b) => { seen[b.id] = b.status; });
    renderMe();
  }, (e) => console.error(e)));

  subs.push(onSnapshot(query(collection(db, 'bets'), orderBy('placed', 'desc'), limit(15)), (snap) => {
    S.feed = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    renderBoard();
  }, (e) => console.error(e)));

  subs.push(onSnapshot(query(collection(db, 'bets'), where('status', '==', 'open'), limit(1000)), (snap) => {
    S.openBets = snap.docs.map((d) => d.data());
    renderBoard();
  }, (e) => console.error(e)));
}

/* ---------- rendering ---------- */
function renderWallet() {
  const me = S.me;
  let h;
  if (!configured) h = '<small>Add your Firebase config to public/config.js.</small>';
  else if (!S.authed) h = '<small>Loading…</small>';
  else if (!S.user) h = '<div><small>Sign in to get your coins</small></div><button class="btn" id="signInBtn">Sign in with Google</button>';
  else if (!S.meLoaded) h = '<small>Loading your coins…</small>';
  else if (!me) {
    const first = esc(((S.user.displayName || '').split(' ')[0] || '').slice(0, 20));
    h = '<form class="join" id="joinForm"><label for="nameIn"><small>Your name on the table</small></label><input type="text" id="nameIn" maxlength="20" autocomplete="nickname" value="' + first + '" placeholder="e.g. Rauf"><button class="btn" type="submit">Join the game</button></form>';
  } else {
    const claimed = (me.lastClaimDay || 0) >= claimDay();
    let sub;
    if (claimed) {
      const mins = Math.max(1, Math.round((nextClaimAt() - Date.now()) / 60000));
      sub = 'Next ' + DAILY_COINS + ' coins in ' + (mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm');
    } else sub = 'Today\'s ' + DAILY_COINS + ' coins are waiting';
    h = '<div><div class="coins num"><span class="coin" aria-hidden="true"></span>' + (me.coins || 0) + '</div><small>' + esc(me.name) + ' · ' + sub + '</small></div>'
      + (claimed ? '' : '<button class="btn gold" id="claimBtn">Claim ' + DAILY_COINS + ' coins</button>');
  }
  paint('wallet', h);
  $('signOut').hidden = !S.user;
}

function fixtureCard(m, now, mine) {
  const ko = new Date(ms(m.ko)), open = m.status === 'scheduled' && ko.getTime() > now, fin = m.status === 'final';
  const sel = S.open && S.open.mid === m.id ? S.open.k : null;
  let stakeH = '';
  if (sel && open) {
    const coins = S.me ? S.me.coins : 0;
    stakeH = '<div class="stake"><label for="stakeIn">Stake on <b>' + esc(selLabel(m.home, m.away, sel)) + '</b> @ ' + m.p[sel].toFixed(2) + '</label>'
      + '<input type="number" id="stakeIn" min="1" max="' + coins + '" step="1" inputmode="numeric" value="' + S.open.stake0 + '">'
      + [10, 25, 50].map((a) => '<button class="chip" data-amt="' + a + '"' + (a > coins ? ' disabled' : '') + '>' + a + '</button>').join('')
      + '<button class="chip" data-amt="' + coins + '">All in</button>'
      + '<span class="ret">Returns <b class="num" id="retOut"></b></span>'
      + '<button class="btn ghost" data-cancel="1">Cancel</button><button class="btn" data-place="1"' + (S.busy ? ' disabled' : '') + '>Place bet</button></div>';
  }
  let h = '<article class="fx"><div><div class="fx-meta"><b>' + esc(fmtTime(ko)) + '</b><span>' + esc(m.lg) + '</span>'
    + (fin ? '<span>Full time</span>' : m.status === 'void' ? '<span>Called off, stakes returned</span>' : !open ? '<span>Kicked off, result pending</span>' : '') + '</div>'
    + '<div class="teams">' + esc(m.home) + '<i>v</i>' + esc(m.away) + '</div></div>';
  if (fin) h += '<div class="score num">' + m.sh + ' – ' + m.sa + '</div>';
  else {
    h += '<div class="odds">' + ['h', 'd', 'a'].map((p) => {
      const k = '1x2:' + p, name = selLabel(m.home, m.away, k);
      return '<button data-mid="' + esc(m.id) + '" data-k="' + k + '" aria-pressed="' + (sel === k) + '"' + (open ? '' : ' disabled')
        + ' aria-label="' + esc(name) + ' at ' + m.p[k].toFixed(2) + '"><span>' + (p === 'h' ? '1' : p === 'd' ? 'X' : '2') + '</span><b class="num">' + m.p[k].toFixed(2) + '</b></button>';
    }).join('') + '</div>';
  }
  if (mine.length) h += '<div class="yours">Your bets: ' + mine.map((b) => b.stake + ' on ' + esc(b.label) + ' @ ' + Number(b.odds).toFixed(2)).join(' · ') + '</div>';
  if (sel && sel.startsWith('1x2:')) h += stakeH;
  if (open) {
    const exp = S.exp === m.id;
    h += '<button class="more" data-more="' + esc(m.id) + '" aria-expanded="' + exp + '">' + (exp ? 'Hide extra bets' : '+ ' + extraCount + ' more bets on this match') + '</button>';
    if (exp) {
      h += '<div class="mk">' + markets(m.home, m.away).map((g) => {
        let has = false;
        const gh = '<div><h4>' + esc(g.name) + '</h4><div class="sels">' + g.sels.map((s) => {
          if (s[0] === sel) has = true;
          return '<button data-mid="' + esc(m.id) + '" data-k="' + esc(s[0]) + '" aria-pressed="' + (s[0] === sel) + '" aria-label="' + esc(s[2]) + '"><span>' + esc(s[1]) + '</span><b class="num">' + Number(m.p[s[0]]).toFixed(2) + '</b></button>';
        }).join('') + '</div>' + (has ? stakeH : '') + '</div>';
        return gh;
      }).join('') + '</div>';
    }
  }
  return h + '</article>';
}

function renderMatches() {
  const now = Date.now();
  const leagues = [];
  S.matches.forEach((m) => { if (!leagues.includes(m.lg)) leagues.push(m.lg); });
  paint('chips', leagues.length < 2 ? '' : ['all'].concat(leagues.sort()).map((l) =>
    '<button class="chip" data-league="' + esc(l) + '" aria-pressed="' + (S.league === l) + '">' + (l === 'all' ? 'All' : esc(l)) + '</button>').join(''));
  const list = S.matches.filter((m) => S.league === 'all' || m.lg === S.league);
  const myOpen = {};
  S.myBets.forEach((b) => { if (b.status === 'open') (myOpen[b.matchId] = myOpen[b.matchId] || []).push(b); });
  let h = '';
  if (!S.user) h = '<div class="empty">Sign in to see this week\'s matches.</div>';
  else if (!S.matchesLoaded) h = '<div class="empty">Loading this week\'s matches…</div>';
  else if (!list.length) h = '<div class="empty">No fixtures loaded right now. New matches are added before each matchday.</div>';
  else {
    const up = list.filter((m) => m.status === 'scheduled' && ms(m.ko) > now);
    const wait = list.filter((m) => m.status === 'scheduled' && ms(m.ko) <= now);
    const done = list.filter((m) => m.status === 'final' || m.status === 'void').reverse().slice(0, 10);
    let cur = '';
    up.forEach((m) => {
      const d = new Date(ms(m.ko)), k = dayKey(d);
      if (k !== cur) { cur = k; h += '<div class="day">' + esc(fmtDay(d)) + '</div>'; }
      h += fixtureCard(m, now, myOpen[m.id] || []);
    });
    if (!up.length) h += '<div class="empty">Every loaded match has kicked off. The next round appears here soon.</div>';
    if (wait.length) { h += '<div class="day">In play or waiting for the result</div>'; wait.forEach((m) => { h += fixtureCard(m, now, myOpen[m.id] || []); }); }
    if (done.length) { h += '<div class="day">Recent results</div>'; done.forEach((m) => { h += fixtureCard(m, now, []); }); }
  }
  paint('matches', h);
  const inp = $('stakeIn');
  if (inp && S.open) { if (String(inp.value) !== String(S.open.stake)) inp.value = S.open.stake; updateReturn(); }
}

function updateReturn() {
  const out = $('retOut');
  if (!out || !S.open) return;
  const m = matchMap()[S.open.mid], st = Math.floor(Number(S.open.stake));
  out.textContent = m && st >= 1 ? Math.round(st * m.p[S.open.k]) + ' coins' : '–';
}

function betRow(b) {
  const right = b.status === 'open' ? '<span class="num">' + Math.round(b.stake * b.odds) + '</span>'
    : b.status === 'won' ? '<span class="num won-n">+' + b.payout + '</span>'
    : b.status === 'lost' ? '<span class="num lost-n">−' + b.stake + '</span>' : '<span class="num">' + b.stake + '</span>';
  return '<div class="row"><div class="t">' + esc(b.label) + ' <span class="num">@ ' + Number(b.odds).toFixed(2) + '</span></div>'
    + '<div class="s">' + esc(b.fixture) + (b.score ? ' · ' + esc(b.score) : '') + ' · staked ' + b.stake + ' <span class="pill ' + b.status + '">' + (b.status === 'void' ? 'refunded' : b.status) + '</span></div>'
    + '<div class="r">' + right + '</div></div>';
}

function renderMine() {
  const bets = S.myBets;
  let h;
  if (!S.me) h = '<div class="empty">Join the game, claim your coins, then tap a price next to a match.</div>';
  else if (!bets.length) h = '<div class="empty">No bets yet. Tap a price next to a match to place your first one.</div>';
  else {
    const open = bets.filter((b) => b.status === 'open'), old = bets.filter((b) => b.status !== 'open');
    h = '';
    if (open.length) h += '<h3>Open · pays if it wins</h3><div class="slip">' + open.map(betRow).join('') + '</div>';
    if (old.length) h += '<h3' + (open.length ? ' style="margin-top:12px"' : '') + '>Settled</h3><div class="slip">' + old.map(betRow).join('') + '</div>';
  }
  paint('mine', h);
}

function renderBoard() {
  const inplay = {};
  S.openBets.forEach((b) => { inplay[b.uid] = (inplay[b.uid] || 0) + b.stake; });
  const ps = S.players.slice().sort((a, b) => (b.coins || 0) - (a.coins || 0) || String(a.name).localeCompare(String(b.name)));
  const uid = S.user && S.user.uid;
  paint('board', !ps.length ? '<div class="empty">Everyone who joins shows up here, ranked by coins.</div>'
    : '<table><thead><tr><th>#</th><th>Player</th><th>W–L</th><th>In play</th><th>Coins</th></tr></thead><tbody>'
      + ps.map((p, i) => '<tr' + (p.id === uid ? ' class="me"' : '') + '><td class="num">' + (i + 1) + '</td><td>' + esc(p.name || 'Player') + (p.id === uid ? ' (you)' : '')
        + '</td><td class="num">' + (p.won || 0) + '–' + (p.lost || 0) + '</td><td class="num">' + (inplay[p.id] || 0) + '</td><td class="c num">' + (p.coins || 0) + '</td></tr>').join('')
      + '</tbody></table>');
  paint('feed', S.feed.length ? '<div class="slip">' + S.feed.map((b) =>
    '<div class="row"><div class="t">' + esc(b.name || 'Player') + ' · ' + b.stake + ' on ' + esc(b.label) + '</div>'
    + '<div class="s">' + esc(b.fixture) + ' <span class="pill ' + b.status + '">' + (b.status === 'void' ? 'refunded' : b.status) + '</span></div>'
    + '<div class="r num">' + Number(b.odds).toFixed(2) + '</div></div>').join('') + '</div>'
    : '<div class="empty">Nobody has placed a bet yet.</div>');
}

function renderMe() { renderWallet(); renderMatches(); renderMine(); }
function renderAll() { renderMe(); renderBoard(); }

/* ---------- events ---------- */
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  $('app').dataset.tab = b.dataset.tab;
  Array.from($('tabs').children).forEach((x) => x.setAttribute('aria-selected', x === b));
});
$('wallet').addEventListener('submit', (e) => { e.preventDefault(); const i = $('nameIn'); if (i) join(i.value); });
$('wallet').addEventListener('click', (e) => {
  if (e.target.id === 'claimBtn') claim();
  if (e.target.id === 'signInBtn') signIn();
});
$('signOut').addEventListener('click', () => signOut(auth));
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('[data-league]');
  if (!b) return;
  S.league = b.dataset.league;
  renderMatches();
});
$('matches').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.more) {
    S.exp = S.exp === t.dataset.more ? null : t.dataset.more;
    if (S.open && !S.open.k.startsWith('1x2:')) S.open = null;
    renderMatches();
  } else if (t.dataset.k) {
    if (!S.me) { toast('Join the game first.'); const n = $('nameIn'); if (n) n.focus(); return; }
    if (!S.me.coins) { toast((S.me.lastClaimDay || 0) >= claimDay() ? 'You are out of coins until tomorrow.' : 'Claim your ' + DAILY_COINS + ' coins first.'); return; }
    const st = Math.min(25, S.me.coins);
    S.open = { mid: t.dataset.mid, k: t.dataset.k, stake: st, stake0: st };
    renderMatches();
    const i = $('stakeIn');
    if (i) { i.focus(); i.select(); }
  } else if (t.dataset.amt && S.open) {
    S.open.stake = S.open.stake0 = Number(t.dataset.amt);
    renderMatches();
  } else if (t.dataset.cancel) { S.open = null; renderMatches(); }
  else if (t.dataset.place) place();
});
$('matches').addEventListener('input', (e) => { if (e.target.id === 'stakeIn' && S.open) { S.open.stake = e.target.value; updateReturn(); } });
$('matches').addEventListener('keydown', (e) => { if (e.target.id === 'stakeIn' && e.key === 'Enter') { e.preventDefault(); place(); } });

/* ---------- boot ---------- */
if (!configured) { S.authed = true; renderAll(); }
else {
  onAuthStateChanged(auth, (user) => {
    subs.splice(0).forEach((u) => u());
    Object.assign(S, { user, authed: true, me: null, meLoaded: false, players: [], matches: [], matchesLoaded: false, myBets: [], feed: [], openBets: [], open: null });
    if (user) listen();
    renderAll();
  });
  setInterval(() => { if (S.me) renderWallet(); if (!S.open) renderMatches(); }, 30000);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
