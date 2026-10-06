import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, collection, doc, query, where, orderBy, limit, onSnapshot, setDoc, updateDoc,
  writeBatch, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, DAILY_COINS, DAY_OFFSET_HOURS } from './config.js';
import { markets, selLabel, comboOdds, outcome, MAX_LEGS } from './markets.js';
import { LEAGUES, GROUPS, BY_SLUG } from './leagues.js';
import { sass } from './sass.js';

const $ = (id) => document.getElementById(id);
const PAGE = 10;
const S = {
  user: null, authed: false, me: null, meLoaded: false, players: [], matches: [], matchesLoaded: false,
  myBets: [], feed: [], openBets: [], busy: false,
  league: 'all', day: 'all', q: '', shown: PAGE, showDone: false, exp: null,
  slip: load('fs_slip', []), stake: 25, sheet: false,
  myLimit: 50, myMore: false, mineFilter: 'all', authMode: 'login',
};
let mySub = null;
const last = {};
const subs = [];

function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
function paint(id, html) { if (last[id] !== html) { last[id] = html; $(id).innerHTML = html; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function fmtDay(d) { return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); }
function fmtTime(d) { return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
function ms(t) { return t && t.toMillis ? t.toMillis() : 0; }
const fmtOdds = (o) => (o >= 100 ? Math.round(o) : Number(o).toFixed(2));
// Must match today() in firestore.rules.
const DAY_MS = 86400000, OFFSET_MS = DAY_OFFSET_HOURS * 3600000;
function claimDay(now = Date.now()) { return Math.floor((now + OFFSET_MS) / DAY_MS); }
function nextClaimAt() { return (claimDay() + 1) * DAY_MS - OFFSET_MS; }
function matchMap() { const o = {}; S.matches.forEach((m) => { o[m.id] = m; }); return o; }
const legsOf = (b) => b.legs || [{ m: b.matchId, k: b.key, o: b.odds, label: b.label, fx: b.fixture }];
const isOpen = (m, now = Date.now()) => m && m.status === 'scheduled' && ms(m.ko) > now;
let toastT;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3600); }
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

const AUTH_ERR = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email. Sign up instead?',
  'auth/email-already-in-use': 'That email already has an account. Log in instead.',
  'auth/weak-password': 'Password needs at least 6 characters.',
  'auth/invalid-email': 'That email doesn\'t look right.',
  'auth/missing-password': 'Type a password.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Try again.',
  'auth/operation-not-allowed': 'Email sign-in isn\'t switched on in Firebase yet.',
};

async function emailAuth(email, pass) {
  email = email.trim();
  if (!email) { toast('Type your email.'); return; }
  try {
    if (S.authMode === 'reset') {
      await sendPasswordResetEmail(auth, email);
      toast('If that email has an account, a reset link is on its way. Check spam too.');
      S.authMode = 'login'; renderMatches();
    } else if (S.authMode === 'signup') {
      await createUserWithEmailAndPassword(auth, email, pass);
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
  } catch (e) {
    if (S.authMode === 'reset' && e.code === 'auth/user-not-found') { toast('If that email has an account, a reset link is on its way.'); return; }
    toast(AUTH_ERR[e.code] || 'That didn\'t work. Try again.');
  }
}

function authCard() {
  const m = S.authMode;
  const title = m === 'signup' ? 'Create an account' : m === 'reset' ? 'Reset your password' : 'Log in';
  return '<div class="auth"><h2>Join the game</h2><p>Sign in to get 100 free coins a day and bet on real matches with your friends.</p>'
    + '<button class="btn gbtn" id="signInBtn">Continue with Google</button>'
    + '<div class="or"><span>or with email</span></div>'
    + '<form id="authForm" novalidate><h3>' + title + '</h3>'
    + '<label>Email<input type="email" id="authEmail" autocomplete="email" inputmode="email" required></label>'
    + (m === 'reset' ? '' : '<label>Password<input type="password" id="authPass" autocomplete="' + (m === 'signup' ? 'new-password' : 'current-password') + '" minlength="6" required>'
      + (m === 'signup' ? '<small>At least 6 characters.</small>' : '') + '</label>')
    + '<button class="btn" type="submit">' + (m === 'signup' ? 'Sign up' : m === 'reset' ? 'Send reset link' : 'Log in') + '</button>'
    + '<div class="auth-links">'
    + (m === 'login' ? '<button type="button" class="linkish" data-mode="signup">No account? Sign up</button><button type="button" class="linkish" data-mode="reset">Forgot password?</button>'
      : '<button type="button" class="linkish" data-mode="login">Have an account? Log in</button>')
    + '</div></form></div>';
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
    toast(sass.claim());
  } catch (e) { failed(e, 'Already claimed today. Come back tomorrow.'); }
  S.busy = false;
}

/* ---------- bet slip ---------- */
function setSlip(slip) { S.slip = slip; save('fs_slip', slip); renderSlip(); renderMatches(); }

function toggleLeg(mid, k) {
  const i = S.slip.findIndex((l) => l.m === mid);
  if (i >= 0 && S.slip[i].k === k) { setSlip(S.slip.filter((_, j) => j !== i)); return; }
  if (i >= 0) { const s = S.slip.slice(); s[i] = { m: mid, k }; setSlip(s); toast('Swapped your pick for this match. One pick per match.'); return; }
  if (S.slip.length >= MAX_LEGS) { toast('Max ' + MAX_LEGS + ' picks. Even we have limits.'); return; }
  setSlip(S.slip.concat({ m: mid, k }));
}

function slipState() {
  const mm = matchMap(), now = Date.now();
  const legs = S.slip.map((l) => {
    const m = mm[l.m];
    const ok = isOpen(m, now) && m.p && m.p[l.k] != null;
    return { ...l, match: m, ok, o: ok ? m.p[l.k] : null, label: m ? selLabel(m.home, m.away, l.k) : 'Match no longer listed', fx: m ? m.home + ' v ' + m.away : '' };
  });
  const good = legs.filter((l) => l.ok);
  return { legs, good, bad: legs.length - good.length, odds: good.length ? comboOdds(good.map((l) => l.o)) : 0 };
}

function confirmPlace() {
  const st = slipState(), stake = Math.floor(Number(S.stake));
  if (!S.me) { toast('Join the game first.'); return; }
  if (!st.legs.length) return;
  if (st.bad) { toast('Remove the picks that are closed first.'); return; }
  if (!(stake >= 1)) { toast('Enter a stake of at least 1 coin.'); return; }
  if (stake > S.me.coins) { toast(S.me.coins ? 'You only have ' + S.me.coins + ' coins.' : sass.broke()); return; }
  const ret = Math.round(stake * st.odds);
  $('confirmTitle').textContent = st.legs.length > 1 ? 'Place this ' + st.legs.length + '-pick multi-bet?' : 'Place this bet?';
  $('confirmBody').innerHTML = '<ul>' + st.legs.map((l) => '<li><b>' + esc(l.label) + '</b> @ ' + fmtOdds(l.o) + '<br>' + esc(l.fx) + '</li>').join('') + '</ul>'
    + '<div class="sum"><span>Stake</span><b class="num">' + stake + '</b><span>Odds</span><b class="num">' + fmtOdds(st.odds) + '</b><span>Returns if it wins</span><b class="num">' + ret + '</b></div>'
    + (st.legs.length > 1 ? '<small>Every pick has to win. One miss and it\'s gone.</small>' : '');
  $('confirmDlg').returnValue = '';
  $('confirmDlg').showModal();
}

async function place() {
  const st = slipState(), stake = Math.floor(Number(S.stake));
  if (S.busy || !st.legs.length || st.bad || !(stake >= 1) || stake > S.me.coins) return;
  const legs = st.legs.map((l) => ({ m: l.m, k: l.k, o: l.o, label: l.label.slice(0, 120), fx: l.fx.slice(0, 120) }));
  const betRef = doc(collection(db, 'bets'));
  const b = writeBatch(db);
  b.set(betRef, { uid: S.user.uid, name: S.me.name, legs, mids: legs.map((l) => l.m), stake, odds: st.odds, status: 'open', placed: serverTimestamp() });
  b.update(doc(db, 'players', S.user.uid), { coins: S.me.coins - stake, lastBet: betRef.id });
  S.busy = true;
  renderSlip();
  try {
    await b.commit();
    setSlip([]);
    openSheet(false);
    toast(sass.place(legs.length));
  } catch (e) { failed(e, 'Bet not accepted. A price may have just changed or a match kicked off. Check your slip and try again.'); }
  S.busy = false;
  renderSlip();
}

function openSheet(on) {
  S.sheet = on;
  $('slip').classList.toggle('open', on);
  $('scrim').hidden = !on;
  renderSlipBar();
}

/* ---------- results popup ---------- */
// Bets settled since this device last looked are shown once, with feeling.
function checkResults() {
  if (!S.myBets.length) return;
  const key = 'fs_seen_' + S.user.uid;
  const seen = load(key, null);
  const settled = S.myBets.filter((b) => b.status !== 'open');
  if (seen === null) { save(key, settled.map((b) => b.id)); return; } // first visit on this device
  const fresh = settled.filter((b) => !seen.includes(b.id));
  if (!fresh.length || $('resultDlg').open) return;
  save(key, seen.concat(fresh.map((b) => b.id)).slice(-300));
  const won = fresh.filter((b) => b.status === 'won'), lost = fresh.filter((b) => b.status === 'lost'), refunded = fresh.filter((b) => b.status === 'void');
  const gain = won.reduce((s, b) => s + (b.payout || 0) - b.stake, 0), loss = lost.reduce((s, b) => s + b.stake, 0);
  const net = gain - loss;
  let emoji, title, msg;
  if (won.length && net >= 0) { emoji = '🤑'; title = 'You won ' + won.reduce((s, b) => s + (b.payout || 0), 0) + ' coins'; msg = sass.win(won.reduce((s, b) => s + (b.payout || 0), 0)); }
  else if (lost.length) { emoji = won.length ? '😬' : '🤡'; title = won.length ? 'Net ' + net + ' coins' : 'You lost ' + loss + ' coins'; msg = sass.lose(loss); }
  else { emoji = '🙃'; title = 'Refunded'; msg = sass.void(refunded.reduce((s, b) => s + b.stake, 0)); }
  $('resultEmoji').textContent = emoji;
  $('resultTitle').textContent = title;
  $('resultMsg').textContent = msg;
  $('resultList').innerHTML = fresh.slice(0, 6).map((b) => {
    const legs = legsOf(b);
    const what = legs.length > 1 ? legs.length + '-pick multi' : esc(legs[0].label);
    return '<div>' + what + ': ' + (b.status === 'won' ? '+' + b.payout : b.status === 'lost' ? '−' + b.stake : 'refunded') + '</div>';
  }).join('');
  $('resultDlg').showModal();
}

/* ---------- data ---------- */
function listen() {
  const uid = S.user.uid;
  const since = Timestamp.fromMillis(Date.now() - 3 * DAY_MS);
  subs.push(onSnapshot(query(collection(db, 'matches'), where('ko', '>=', since), orderBy('ko'), limit(1500)), (snap) => {
    S.matches = snap.docs.map((d) => ({ ...d.data(), id: d.id })).filter((m) => m.p && m.ko && m.home && m.away);
    S.matchesLoaded = true;
    renderLeagues(); renderMatches(); renderSlip();
  }, (e) => { console.error(e); S.matchesLoaded = true; renderMatches(); }));

  subs.push(onSnapshot(collection(db, 'players'), (snap) => {
    S.players = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const mine = S.players.find((p) => p.id === uid) || null;
    if (mine || !snap.metadata.fromCache) S.meLoaded = true;
    S.me = mine;
    renderAll();
  }, (e) => { console.error(e); S.meLoaded = true; renderAll(); }));

  listenMine();

  subs.push(onSnapshot(query(collection(db, 'bets'), orderBy('placed', 'desc'), limit(15)), (snap) => {
    S.feed = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    renderBoard();
  }, (e) => console.error(e)));

  subs.push(onSnapshot(query(collection(db, 'bets'), where('status', '==', 'open'), limit(1000)), (snap) => {
    S.openBets = snap.docs.map((d) => d.data());
    renderBoard(); renderMatches();
  }, (e) => console.error(e)));
}

// Own bets, newest first; "Load older bets" raises the limit.
function listenMine() {
  if (mySub) mySub();
  mySub = onSnapshot(query(collection(db, 'bets'), where('uid', '==', S.user.uid), orderBy('placed', 'desc'), limit(S.myLimit + 1)), (snap) => {
    const all = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    S.myMore = all.length > S.myLimit;
    S.myBets = all.slice(0, S.myLimit);
    renderMine(); renderMatches();
    if (!snap.metadata.fromCache) checkResults();
  }, (e) => console.error(e));
}

/* ---------- rendering ---------- */
function renderWallet() {
  const me = S.me;
  let h;
  if (!configured) h = '<small>Add your Firebase config to public/config.js.</small>';
  else if (!S.authed) h = '<small>Loading…</small>';
  else if (!S.user) h = '<small>Not signed in yet</small>';
  else if (!S.meLoaded) h = '<small>Loading your coins…</small>';
  else if (!me) {
    const first = esc(((S.user.displayName || '').split(' ')[0] || (S.user.email || '').split('@')[0].replace(/[^\p{L}\p{N}._ -]/gu, '') || '').slice(0, 20));
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

function renderLeagues() {
  const now = Date.now(), count = {};
  S.matches.forEach((m) => { if (isOpen(m, now)) count[m.sk] = (count[m.sk] || 0) + 1; });
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  let h = '<option value="all">⚽ All leagues (' + total + ')</option>';
  GROUPS.forEach((g) => {
    const ls = LEAGUES.filter((l) => l.group === g && count[l.slug]);
    if (ls.length) h += '<optgroup label="' + esc(g) + '">' + ls.map((l) => '<option value="' + l.slug + '">' + l.flag + ' ' + esc(l.name) + ' (' + count[l.slug] + ')</option>').join('') + '</optgroup>';
  });
  const other = Object.keys(count).filter((s) => !BY_SLUG[s]);
  if (other.length) h += '<optgroup label="Other">' + other.map((s) => '<option value="' + esc(s) + '">' + esc(s) + ' (' + count[s] + ')</option>').join('') + '</optgroup>';
  if (S.league !== 'all' && !count[S.league]) S.league = 'all';
  const sel = $('league');
  if (last.league !== h) { last.league = h; sel.innerHTML = h; }
  sel.value = S.league;
}

function inDay(m) {
  if (S.day === 'all') return true;
  const d = new Date(ms(m.ko)), t = new Date();
  if (S.day === 'today') return dayKey(d) === dayKey(t);
  if (S.day === 'tomorrow') { t.setDate(t.getDate() + 1); return dayKey(d) === dayKey(t); }
  if (S.day === 'weekend') { const wd = d.getDay(), soon = ms(m.ko) - Date.now() < 7 * DAY_MS; return soon && (wd === 0 || wd === 6 || (wd === 5 && d.getHours() >= 17)); }
  return true;
}

function crowd() {
  const c = {}, me = S.user && S.user.uid;
  S.openBets.forEach((b) => { if (b.uid === me) return; new Set(legsOf(b).map((l) => l.m)).forEach((m) => { (c[m] = c[m] || new Set()).add(b.uid); }); });
  return c;
}

function fixtureCard(m, now, mine, friends) {
  const ko = new Date(ms(m.ko)), open = isOpen(m, now), fin = m.status === 'final';
  const inSlip = S.slip.find((l) => l.m === m.id), sel = inSlip ? inSlip.k : null;
  const L = BY_SLUG[m.sk];
  let h = '<article class="fx"><div><div class="fx-meta"><b>' + esc(fmtTime(ko)) + '</b><span>' + (L ? L.flag + ' ' : '') + esc(m.lg) + '</span>'
    + (m.src === 'elo' && open ? '<span class="tag" title="No bookmaker price yet; odds from World Football Elo ratings">Elo odds</span>' : '')
    + (friends ? '<span class="crowd">👥 ' + friends + (friends === 1 ? ' friend' : ' friends') + ' on this</span>' : '')
    + (fin ? '<span>Full time</span>' : m.status === 'void' ? '<span>Called off, stakes returned</span>' : !open ? '<span>Kicked off, result pending</span>' : '') + '</div>'
    + '<div class="teams">' + esc(m.home) + '<i>v</i>' + esc(m.away) + '</div></div>';
  if (fin) h += '<div class="score num">' + m.sh + ' – ' + m.sa + '</div>';
  else {
    h += '<div class="odds">' + ['h', 'd', 'a'].map((p) => {
      const k = '1x2:' + p;
      return '<button data-mid="' + esc(m.id) + '" data-k="' + k + '" aria-pressed="' + (sel === k) + '"' + (open ? '' : ' disabled')
        + ' aria-label="' + esc(selLabel(m.home, m.away, k)) + ' at ' + m.p[k].toFixed(2) + '"><span>' + (p === 'h' ? '1' : p === 'd' ? 'X' : '2') + '</span><b class="num">' + m.p[k].toFixed(2) + '</b></button>';
    }).join('') + '</div>';
  }
  if (mine.length) h += '<div class="yours">Your open bets here: ' + mine.length + '</div>';
  if (sel && !sel.startsWith('1x2:')) h += '<div class="yours">In your slip: <b>' + esc(selLabel(m.home, m.away, sel)) + '</b> @ ' + fmtOdds(m.p[sel]) + '</div>';
  if (open) {
    const exp = S.exp === m.id;
    h += '<button class="more" data-more="' + esc(m.id) + '" aria-expanded="' + exp + '">' + (exp ? 'Hide extra bets' : '+ ' + extraCount + ' more bets on this match') + '</button>';
    if (exp) {
      h += '<div class="mk">' + markets(m.home, m.away).map((g) => '<div><h4>' + esc(g.name) + '</h4><div class="sels">' + g.sels.map((s) =>
        '<button data-mid="' + esc(m.id) + '" data-k="' + esc(s[0]) + '" aria-pressed="' + (s[0] === sel) + '" aria-label="' + esc(s[2]) + '"><span>' + esc(s[1]) + '</span><b class="num">' + fmtOdds(m.p[s[0]]) + '</b></button>').join('') + '</div></div>').join('') + '</div>';
    }
  }
  return h + '</article>';
}

function renderMatches() {
  document.querySelector('.filters').hidden = !S.user;
  const now = Date.now(), q = S.q.trim().toLowerCase();
  const list = S.matches.filter((m) => (S.league === 'all' || m.sk === S.league) && (!q || (m.home + ' ' + m.away).toLowerCase().includes(q)));
  const myOpen = {};
  S.myBets.forEach((b) => { if (b.status === 'open') new Set(legsOf(b).map((l) => l.m)).forEach((m) => { (myOpen[m] = myOpen[m] || []).push(b); }); });
  const fr = crowd();
  let h = '';
  if (!configured) h = '<div class="empty">Waiting for the Firebase config.</div>';
  else if (!S.user) h = authCard();
  else if (!S.matchesLoaded) h = '<div class="empty">Loading this week\'s matches…</div>';
  else {
    const up = list.filter((m) => isOpen(m, now) && inDay(m));
    const wait = list.filter((m) => m.status === 'scheduled' && ms(m.ko) <= now);
    const done = list.filter((m) => m.status === 'final' || m.status === 'void').reverse().slice(0, 20);
    const card = (m) => fixtureCard(m, now, myOpen[m.id] || [], fr[m.id] ? fr[m.id].size : 0);
    let cur = '';
    up.slice(0, S.shown).forEach((m) => {
      const d = new Date(ms(m.ko)), k = dayKey(d);
      if (k !== cur) { cur = k; h += '<div class="day">' + esc(fmtDay(d)) + '</div>'; }
      h += card(m);
    });
    if (up.length > S.shown) h += '<button class="more-btn" data-showmore="1">Show more games (' + (up.length - S.shown) + ' more)</button>';
    if (!up.length) h += '<div class="empty">' + (q ? 'No upcoming match for "' + esc(S.q) + '".' : 'No upcoming matches here. Try another league or day.') + '</div>';
    if (wait.length || done.length) {
      h += '<button class="more-btn" data-showdone="1" aria-expanded="' + S.showDone + '">' + (S.showDone ? 'Hide' : 'Show') + ' live and recent results (' + (wait.length + done.length) + ')</button>';
      if (S.showDone) {
        if (wait.length) { h += '<div class="day">In play or waiting for the result</div>'; wait.forEach((m) => { h += card(m); }); }
        if (done.length) { h += '<div class="day">Recent results</div>'; done.forEach((m) => { h += card(m); }); }
      }
    }
  }
  paint('matches', h);
}

function renderSlip() {
  const st = slipState(), n = st.legs.length;
  let h = '<div class="slip-head"><h2>Bet slip' + (n ? ' (' + n + ')' : '') + '</h2><div>'
    + (n ? '<button class="linkish" data-clear="1">Clear</button> ' : '')
    + '<button class="btn ghost slip-close" data-closeslip="1" aria-label="Close bet slip">Close</button></div></div>';
  if (!n) h += '<div class="empty">Tap prices to add picks. Picks from different matches make a multi-bet: the odds multiply, and every pick has to win.</div>';
  else {
    h += '<div class="slip-legs">' + st.legs.map((l, i) => '<div class="leg' + (l.ok ? '' : ' bad') + '"><div class="t">' + esc(l.label) + '</div>'
      + '<div class="s">' + (l.ok ? esc(l.fx) : (l.match ? esc(l.fx) + ' · closed, remove it' : 'Match no longer listed, remove it')) + '</div>'
      + '<div class="o num">' + (l.ok ? fmtOdds(l.o) : '–') + '</div><button class="x" data-rm="' + i + '" aria-label="Remove ' + esc(l.label) + '">×</button></div>').join('') + '</div>';
    const coins = S.me ? S.me.coins : 0, stake = Math.floor(Number(S.stake));
    h += '<div class="slip-total"><span>' + (n > 1 ? n + '-pick multi odds' : 'Odds') + '</span><b class="num">' + (st.good.length ? fmtOdds(st.odds) : '–') + '</b></div>'
      + '<div class="slip-stake"><label for="stakeIn">Stake</label><input type="number" id="stakeIn" min="1" step="1" inputmode="numeric" value="' + esc(S.stake) + '">'
      + [10, 25, 50].map((a) => '<button class="chip" data-amt="' + a + '"' + (a > coins ? ' disabled' : '') + '>' + a + '</button>').join('')
      + '<button class="chip" data-amt="' + coins + '"' + (coins ? '' : ' disabled') + '>All in</button></div>'
      + '<div class="slip-ret">Returns <b class="num" id="retOut">' + (stake >= 1 && st.good.length ? Math.round(stake * st.odds) + ' coins' : '–') + '</b></div>'
      + '<button class="btn slip-place" data-place="1"' + (S.busy || st.bad || !S.me ? ' disabled' : '') + '>' + (S.busy ? 'Placing…' : !S.me ? 'Join the game to bet' : 'Place bet') + '</button>';
  }
  const el = $('slip');
  if (last.slip !== h) {
    const focused = document.activeElement && document.activeElement.id === 'stakeIn';
    last.slip = h; el.innerHTML = h;
    if (focused && $('stakeIn')) $('stakeIn').focus();
  }
  renderSlipBar();
}

function renderSlipBar() {
  const st = slipState(), n = st.legs.length, bar = $('slipBar');
  bar.hidden = !n || S.sheet;
  if (n) bar.innerHTML = '<span>🧾 Bet slip · ' + n + (n === 1 ? ' pick' : ' picks') + '</span><span class="num">@ ' + (st.good.length ? fmtOdds(st.odds) : '–') + ' ›</span>';
}

const ICON = { open: '⏳', won: '✅', lost: '❌', void: '↩️' };
const WORD = { open: 'Waiting', won: 'Won', lost: 'Lost', void: 'Refunded' };
function fmtWhen(t) {
  const d = new Date(ms(t) || Date.now());
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + fmtTime(d);
}

// Per-pick state: from settlement when it ran, else from the live match.
function legState(b, l, i, mm) {
  const m = mm[l.m];
  let st = (b.res && b.res[i]) || 'open';
  if (st === 'open' && m && m.status === 'final') st = outcome(l.k, m.sh, m.sa);
  if (st === 'open' && m && m.status === 'void') st = 'void';
  const live = m && m.status === 'scheduled' && ms(m.ko) <= Date.now();
  const score = m && m.status === 'final' ? m.sh + '-' + m.sa : live ? 'playing' : m && st === 'open' ? fmtWhen(m.ko) : '';
  return { st, score };
}

function betCard(b, mm) {
  const legs = legsOf(b), st = b.status;
  const title = legs.length > 1 ? legs.length + '-pick multi' : esc(legs[0].label);
  const right = st === 'open' ? Math.round(b.stake * b.odds) + '<small>to win</small>'
    : st === 'won' ? '<span class="won-n">+' + b.payout + '</span><small>paid</small>'
    : st === 'lost' ? '<span class="lost-n">−' + b.stake + '</span><small>lost</small>'
    : b.stake + '<small>refunded</small>';
  let h = '<article class="bet ' + st + '"><div class="ico" title="' + WORD[st] + '" aria-label="' + WORD[st] + '">' + ICON[st] + '</div>'
    + '<div class="t">' + title + ' <span class="num">@ ' + fmtOdds(b.odds) + '</span></div>'
    + '<div class="r num">' + right + '</div>'
    + '<div class="s">' + WORD[st] + ' · staked ' + b.stake + ' · ' + esc(fmtWhen(b.placed)) + '</div>';
  h += '<div class="legs-mini">' + legs.map((l, i) => {
    const x = legState(b, l, i, mm);
    return '<span class="lg ' + x.st + '">' + ICON[x.st] + ' <span>' + (legs.length > 1 ? esc(l.label) + ' @ ' + fmtOdds(l.o) + ' · ' : '') + esc(l.fx) + '</span><em>' + esc(x.score || b.score || '') + '</em></span>';
  }).join('') + '</div>';
  return h + '</article>';
}

function renderMine() {
  const bets = S.myBets, mm = matchMap();
  const open = bets.filter((b) => b.status === 'open').length;
  const badge = $('openCount');
  badge.hidden = !open; badge.textContent = open;
  let h;
  if (!S.me) h = '<div class="empty">Join the game, claim your coins, then tap a price next to a match.</div>';
  else if (!bets.length) h = '<div class="empty">No bets yet. Tap prices on the Fixtures tab to fill your bet slip.</div>';
  else {
    const n = { all: bets.length, open: 0, won: 0, lost: 0, void: 0 };
    let staked = 0, back = 0, best = 0;
    bets.forEach((b) => {
      n[b.status]++;
      if (b.status !== 'open') { staked += b.stake; back += b.payout || 0; }
      if (b.status === 'won') best = Math.max(best, b.payout - b.stake);
    });
    const w = S.me.won || 0, l = S.me.lost || 0, net = back - staked;
    h = '<div class="stats">'
      + '<div class="stat"><small>Record</small><b class="num">' + w + '–' + l + '</b></div>'
      + '<div class="stat"><small>Win rate</small><b class="num">' + (w + l ? Math.round((100 * w) / (w + l)) + '%' : '–') + '</b></div>'
      + '<div class="stat"><small>Profit' + (S.myMore ? ' (shown)' : '') + '</small><b class="num ' + (net > 0 ? 'won-n' : net < 0 ? 'lost-n' : '') + '">' + (net > 0 ? '+' : '') + net + '</b></div>'
      + '<div class="stat"><small>Biggest win</small><b class="num">' + (best ? '+' + best : '–') + '</b></div>'
      + '</div>';
    h += '<div class="chips" id="mineFilter">' + ['all', 'open', 'won', 'lost', 'void'].filter((k) => k === 'all' || n[k]).map((k) =>
      '<button class="chip" data-mf="' + k + '" aria-pressed="' + (S.mineFilter === k) + '">' + (k === 'all' ? 'All' : ICON[k] + ' ' + WORD[k]) + ' (' + n[k] + ')</button>').join('') + '</div>';
    if (S.mineFilter !== 'all' && !n[S.mineFilter]) S.mineFilter = 'all';
    const list = bets.filter((b) => S.mineFilter === 'all' || b.status === S.mineFilter);
    h += '<div class="bets">' + list.map((b) => betCard(b, mm)).join('') + '</div>';
    if (S.myMore) h += '<button class="more-btn" data-older="1">Load older bets</button>';
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
      + ps.map((p, i) => '<tr' + (p.id === uid ? ' class="me"' : '') + '><td class="num">' + (i + 1) + '</td><td>' + (i === 0 && p.coins ? '👑 ' : '') + esc(p.name || 'Player') + (p.id === uid ? ' (you)' : '')
        + (!p.coins && !inplay[p.id] ? ' <span class="broke" title="Broke">💸 broke</span>' : '')
        + '</td><td class="num">' + (p.won || 0) + '–' + (p.lost || 0) + '</td><td class="num">' + (inplay[p.id] || 0) + '</td><td class="c num">' + (p.coins || 0) + '</td></tr>').join('')
      + '</tbody></table>');
  paint('feed', S.feed.length ? '<div class="slip">' + S.feed.map((b) => {
    const legs = legsOf(b);
    return '<div class="row"><div class="t">' + esc(b.name || 'Player') + ' · ' + b.stake + ' on ' + (legs.length > 1 ? 'a ' + legs.length + '-pick multi' : esc(legs[0].label)) + '</div>'
      + '<div class="s">' + (legs.length > 1 ? legs.map((l) => esc(l.label)).join(', ') : esc(legs[0].fx)) + ' <span class="pill ' + b.status + '">' + (b.status === 'void' ? 'refunded' : b.status) + '</span></div>'
      + '<div class="r num">' + fmtOdds(b.odds) + '</div></div>';
  }).join('') + '</div>' : '<div class="empty">Nobody has placed a bet yet.</div>');
}

function renderAll() { renderWallet(); renderMatches(); renderSlip(); renderMine(); renderBoard(); }

/* ---------- events ---------- */
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  $('app').dataset.tab = b.dataset.tab;
  Array.from($('tabs').children).forEach((x) => x.setAttribute('aria-selected', x === b));
  const top = $('tabs').getBoundingClientRect().top + window.scrollY;
  if (window.scrollY > top) window.scrollTo({ top });
});
$('wallet').addEventListener('submit', (e) => { e.preventDefault(); const i = $('nameIn'); if (i) join(i.value); });
$('wallet').addEventListener('click', (e) => {
  if (e.target.id === 'claimBtn') claim();
  if (e.target.id === 'signInBtn') signIn();
});
$('signOut').addEventListener('click', () => signOut(auth));
$('league').addEventListener('change', (e) => { S.league = e.target.value; S.shown = PAGE; renderMatches(); });
$('days').addEventListener('click', (e) => {
  const b = e.target.closest('[data-day]');
  if (!b) return;
  S.day = b.dataset.day; S.shown = PAGE;
  Array.from($('days').children).forEach((x) => x.setAttribute('aria-pressed', x === b));
  renderMatches();
});
$('search').addEventListener('input', (e) => { S.q = e.target.value; S.shown = PAGE; renderMatches(); });
$('matches').addEventListener('submit', (e) => {
  if (e.target.id !== 'authForm') return;
  e.preventDefault();
  emailAuth($('authEmail').value, $('authPass') ? $('authPass').value : '');
});
$('matches').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.id === 'signInBtn') { signIn(); return; }
  if (t.dataset.mode) {
    const email = $('authEmail') ? $('authEmail').value : '';
    S.authMode = t.dataset.mode; renderMatches();
    if ($('authEmail')) { $('authEmail').value = email; $('authEmail').focus(); }
    return;
  }
  if (t.dataset.more) { S.exp = S.exp === t.dataset.more ? null : t.dataset.more; renderMatches(); }
  else if (t.dataset.showmore) { S.shown += PAGE; renderMatches(); }
  else if (t.dataset.showdone) { S.showDone = !S.showDone; renderMatches(); }
  else if (t.dataset.k) {
    if (!S.me) { toast('Join the game first.'); const n = $('nameIn'); if (n) n.focus(); return; }
    toggleLeg(t.dataset.mid, t.dataset.k);
  }
});
$('mine').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.mf) { S.mineFilter = t.dataset.mf; renderMine(); }
  else if (t.dataset.older) { S.myLimit += 50; listenMine(); }
});
$('slip').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.rm) setSlip(S.slip.filter((_, i) => i !== Number(t.dataset.rm)));
  else if (t.dataset.clear) setSlip([]);
  else if (t.dataset.closeslip) openSheet(false);
  else if (t.dataset.amt) { S.stake = Number(t.dataset.amt); renderSlip(); }
  else if (t.dataset.place) confirmPlace();
});
$('slip').addEventListener('input', (e) => {
  if (e.target.id !== 'stakeIn') return;
  S.stake = e.target.value;
  const st = slipState(), stake = Math.floor(Number(S.stake));
  $('retOut').textContent = stake >= 1 && st.good.length ? Math.round(stake * st.odds) + ' coins' : '–';
});
$('slip').addEventListener('keydown', (e) => { if (e.target.id === 'stakeIn' && e.key === 'Enter') { e.preventDefault(); confirmPlace(); } });
$('slipBar').addEventListener('click', () => openSheet(true));
$('scrim').addEventListener('click', () => openSheet(false));
$('confirmDlg').addEventListener('close', () => { if ($('confirmDlg').returnValue === 'ok') place(); });

/* ---------- boot ---------- */
renderSlip();
if (!configured) { S.authed = true; renderAll(); }
else {
  onAuthStateChanged(auth, (user) => {
    subs.splice(0).forEach((u) => u());
    if (mySub) { mySub(); mySub = null; }
    S.myLimit = 50;
    Object.assign(S, { user, authed: true, authMode: 'login', me: null, meLoaded: false, players: [], matches: [], matchesLoaded: false, myBets: [], feed: [], openBets: [] });
    if (user) listen();
    renderAll();
  });
  setInterval(() => { if (S.me) renderWallet(); renderMatches(); renderSlip(); }, 30000);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
