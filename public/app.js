import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, signOut, connectAuthEmulator,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, collection, doc, query, where, orderBy, limit, onSnapshot, setDoc, updateDoc,
  writeBatch, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, DAILY_COINS, DAY_OFFSET_HOURS } from './config.js';
import { markets, halfMarkets, liveMarkets, comboOdds, matchOutcome, liveOutcome, MAX_LEGS } from './markets.js';
import { LEAGUES, GROUPS, BY_SLUG, flagOf } from './leagues.js';
import { t, mk, short, label, sass, getLang, setLang } from './i18n.js';

const $ = (id) => document.getElementById(id);
const PAGE = 12;
const S = {
  user: null, authed: false, me: null, meLoaded: false, players: [], matches: [], matchesLoaded: false,
  myBets: [], feed: [], openBets: [], busy: false, live: {},
  league: 'all', day: 'all', q: '', shown: PAGE, showDone: false, exp: null, cat: 'main',
  slip: load('fs_slip', []), stake: 25, sheet: false, confirmOdds: 0,
  myLimit: 50, myMore: false, mineFilter: 'all', authMode: 'login', favDraft: [],
};
let mySub = null;
const last = {};
const subs = [];

function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
function paint(id, html) { if (last[id] !== html) { last[id] = html; $(id).innerHTML = html; } }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
// Browsers often lack Azerbaijani date names, so those are spelled out here.
const AZ_MON = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'];
const AZ_DAY = ['Bazar', 'Bazar ertəsi', 'Çərşənbə axşamı', 'Çərşənbə', 'Cümə axşamı', 'Cümə', 'Şənbə'];
function fmtDay(d) { return getLang() === 'az' ? AZ_DAY[d.getDay()] + ', ' + d.getDate() + ' ' + AZ_MON[d.getMonth()] : d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }); }
function fmtTime(d) { return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
function fmtWhen(x) { const d = new Date(ms(x) || Date.now()); return (getLang() === 'az' ? d.getDate() + ' ' + AZ_MON[d.getMonth()] : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })) + ', ' + fmtTime(d); }
function ms(x) { return x && x.toMillis ? x.toMillis() : 0; }
const fmtOdds = (o) => (o >= 100 ? Math.round(o) : Number(o).toFixed(2));
// Must match today() in firestore.rules.
const DAY_MS = 86400000, OFFSET_MS = DAY_OFFSET_HOURS * 3600000;
function claimDay(now = Date.now()) { return Math.floor((now + OFFSET_MS) / DAY_MS); }
function nextClaimAt() { return (claimDay() + 1) * DAY_MS - OFFSET_MS; }
function matchMap() { const o = {}; S.matches.forEach((m) => { o[m.id] = m; }); return o; }
const legsOf = (b) => b.legs || [{ m: b.matchId, k: b.key, o: b.odds, label: b.label, fx: b.fixture }];
const isOpen = (m, now = Date.now()) => m && m.status === 'scheduled' && ms(m.ko) > now;
const favs = () => (S.me && S.me.favs) || [];
const isFav = (team) => favs().includes(team);
const lgName = (m) => t(m.lg);
let toastT;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3600); }

function logo(url, name) {
  const init = esc(String(name || '?').trim().charAt(0).toUpperCase());
  return url ? '<img class="lg-img" src="' + esc(url) + '" alt="" loading="lazy" width="20" height="20" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{className:\'lg-ph\',textContent:\'' + init + '\'}))">'
    : '<span class="lg-ph">' + init + '</span>';
}

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
    else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') toast(t('Sign-in failed. Try again.'));
  });
}

const AUTH_ERR = {
  'auth/invalid-credential': 'Wrong email or password.', 'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email. Sign up instead?', 'auth/email-already-in-use': 'That email already has an account. Log in instead.',
  'auth/weak-password': 'Password needs at least 6 characters.', 'auth/invalid-email': "That email doesn't look right.",
  'auth/missing-password': 'Type a password.', 'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Try again.', 'auth/operation-not-allowed': "Email sign-in isn't switched on in Firebase yet.",
};

async function emailAuth(email, pass) {
  email = email.trim();
  if (!email) { toast(t('Type your email.')); return; }
  try {
    if (S.authMode === 'reset') {
      await sendPasswordResetEmail(auth, email);
      toast(t('If that email has an account, a reset link is on its way. Check spam too.'));
      S.authMode = 'login'; renderMatches();
    } else if (S.authMode === 'signup') await createUserWithEmailAndPassword(auth, email, pass);
    else await signInWithEmailAndPassword(auth, email, pass);
  } catch (e) {
    if (S.authMode === 'reset' && e.code === 'auth/user-not-found') { toast(t('If that email has an account, a reset link is on its way. Check spam too.')); return; }
    toast(t(AUTH_ERR[e.code] || "That didn't work. Try again."));
  }
}

function authCard() {
  const m = S.authMode;
  const title = m === 'signup' ? t('Create an account') : m === 'reset' ? t('Reset your password') : t('Log in');
  return '<div class="auth"><h2>' + t('Join the game') + '</h2><p>' + t('Sign in to get 100 free coins a day and bet on real matches with your friends.') + '</p>'
    + '<button class="btn gbtn" id="signInBtn">' + t('Continue with Google') + '</button>'
    + '<div class="or"><span>' + t('or with email') + '</span></div>'
    + '<form id="authForm" novalidate><h3>' + title + '</h3>'
    + '<label>' + t('Email') + '<input type="email" id="authEmail" autocomplete="email" inputmode="email" required></label>'
    + (m === 'reset' ? '' : '<label>' + t('Password') + '<input type="password" id="authPass" autocomplete="' + (m === 'signup' ? 'new-password' : 'current-password') + '" minlength="6" required>'
      + (m === 'signup' ? '<small>' + t('At least 6 characters.') + '</small>' : '') + '</label>')
    + '<button class="btn" type="submit">' + (m === 'signup' ? t('Sign up') : m === 'reset' ? t('Send reset link') : t('Log in')) + '</button>'
    + '<div class="auth-links">'
    + (m === 'login' ? '<button type="button" class="linkish" data-mode="signup">' + t('No account? Sign up') + '</button><button type="button" class="linkish" data-mode="reset">' + t('Forgot password?') + '</button>'
      : '<button type="button" class="linkish" data-mode="login">' + t('Have an account? Log in') + '</button>')
    + '</div></form></div>';
}

function failed(e, msg) {
  console.error(e);
  toast(e && e.code === 'permission-denied' && msg ? msg : t('Could not save that. Check your connection and try again.'));
}

async function join(name) {
  name = name.trim().slice(0, 20);
  if (!name) { toast(t('Pick a name first.')); return; }
  try {
    await setDoc(doc(db, 'players', S.user.uid), { name, coins: 0, lastClaimDay: 0, won: 0, lost: 0, joined: serverTimestamp() });
    toast(t('You are in. Claim your first {n} coins.', { n: DAILY_COINS }));
  } catch (e) { failed(e); }
}

async function claim() {
  if (S.busy || !S.me || S.me.lastClaimDay >= claimDay()) return;
  S.busy = true;
  try {
    await updateDoc(doc(db, 'players', S.user.uid), { coins: S.me.coins + DAILY_COINS, lastClaimDay: claimDay() });
    toast(sass.claim());
  } catch (e) { failed(e, t('Already claimed today. Come back tomorrow.')); }
  S.busy = false;
}

/* ---------- language ---------- */
function applyLang(lang, persist) {
  setLang(lang);
  document.documentElement.lang = getLang();
  save('fs_lang', getLang());
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.lang === getLang()));
  $('foot').textContent = getLang() === 'az' ? t('FOOTER') : '1 = home win, X = draw, 2 = away win. Tap prices from different matches to build a multi-bet (up to 6 picks): every pick has to win, and the odds multiply. Club odds are DraftKings prices via ESPN; national-team odds without a bookmaker price come from World Football Elo ratings. Goalscorer markets are based on season stats. Coins have no value and cannot be bought, sold or cashed out.';
  Object.keys(last).forEach((k) => delete last[k]);
  if (persist && S.me && S.me.lang !== getLang()) updateDoc(doc(db, 'players', S.user.uid), { lang: getLang() }).catch(() => {});
  renderAll();
}

/* ---------- bet slip ---------- */
function setSlip(slip) { S.slip = slip; save('fs_slip', slip); renderSlip(); renderMatches(); renderLive(); }

function toggleLeg(mid, k) {
  const live = k.startsWith('lv:');
  if (live || S.slip.some((l) => l.live)) {
    const same = S.slip.length === 1 && S.slip[0].m === mid && S.slip[0].k === k;
    if (same) { setSlip([]); return; }
    if (S.slip.length && (live || S.slip[0].live)) toast(t('Live bets are singles, so your slip now holds just this pick.'));
    setSlip([live ? { m: mid, k, live: true } : { m: mid, k }]);
    return;
  }
  const i = S.slip.findIndex((l) => l.m === mid);
  if (i >= 0 && S.slip[i].k === k) { setSlip(S.slip.filter((_, j) => j !== i)); return; }
  if (i >= 0) { const s = S.slip.slice(); s[i] = { m: mid, k }; setSlip(s); toast(t('Swapped your pick for this match. One pick per match.')); return; }
  if (S.slip.length >= MAX_LEGS) { toast(t('Max {n} picks. Even we have limits.', { n: MAX_LEGS })); return; }
  setSlip(S.slip.concat({ m: mid, k }));
}

function slipState() {
  const mm = matchMap(), now = Date.now();
  const legs = S.slip.map((l) => {
    if (l.live) {
      const lv = S.live[l.m], fresh = lv && now - ms(lv.at) < 55e3;
      const ok = !!(lv && !lv.done && !lv.susp && fresh && lv.p && lv.p[l.k] != null);
      return { ...l, lv, ok, o: ok ? lv.p[l.k] : null, label: lv ? label(l.k, lv.home, lv.away) : t('Live match ended'),
        fx: lv ? lv.home + ' v ' + lv.away + ' · ' + lv.sh + '-' + lv.sa + ' ' + (lv.shown || '') : '',
        why: !lv || lv.done ? t('match over, remove it') : lv.susp ? t('suspended right now') : !fresh ? t('waiting for live data') : t('market closed') };
    }
    const m = mm[l.m];
    const ok = isOpen(m, now) && m.p && m.p[l.k] != null;
    return { ...l, match: m, ok, o: ok ? m.p[l.k] : null, label: m ? label(l.k, m.home, m.away, m.pl) : t('Match no longer listed, remove it'), fx: m ? m.home + ' v ' + m.away : '' };
  });
  const good = legs.filter((l) => l.ok);
  return { legs, good, bad: legs.length - good.length, live: legs.some((l) => l.live), odds: good.length ? comboOdds(good.map((l) => l.o)) : 0 };
}

function confirmPlace() {
  const st = slipState(), stake = Math.floor(Number(S.stake));
  if (!S.me) { toast(t('Join the game first.')); return; }
  if (!st.legs.length) return;
  if (st.bad) { toast(st.live ? t('Betting on this match is paused right now. Try again in a moment.') : t('Remove the picks that are closed first.')); return; }
  if (!(stake >= 1)) { toast(t('Enter a stake of at least 1 coin.')); return; }
  if (stake > S.me.coins) { toast(S.me.coins ? t('You only have {n} coins.', { n: S.me.coins }) : sass.broke()); return; }
  const ret = Math.round(stake * st.odds);
  S.confirmOdds = st.odds;
  $('confirmTitle').textContent = st.live ? t('Place this live bet?') : st.legs.length > 1 ? t('Place this {n}-pick multi-bet?', { n: st.legs.length }) : t('Place this bet?');
  $('confirmBody').innerHTML = '<ul>' + st.legs.map((l) => '<li><b>' + esc(l.label) + '</b> @ ' + fmtOdds(l.o) + '<br>' + esc(l.fx) + '</li>').join('') + '</ul>'
    + '<div class="sum"><span>' + t('Stake') + '</span><b class="num">' + stake + '</b><span>' + t('Odds') + '</span><b class="num">' + fmtOdds(st.odds) + '</b><span>' + t('Returns if it wins') + '</span><b class="num">' + ret + '</b></div>'
    + (st.legs.length > 1 ? '<small>' + t("Every pick has to win. One miss and it's gone.") + '</small>' : '')
    + (st.live ? '<small>' + t('Live odds move fast. If a goal goes in within 2 minutes of your bet, it is refunded.') + '</small>' : '');
  $('confirmDlg').returnValue = '';
  $('confirmDlg').showModal();
}

async function place() {
  const st = slipState(), stake = Math.floor(Number(S.stake));
  if (S.busy || !st.legs.length || !(stake >= 1) || stake > S.me.coins) return;
  if (st.bad) { toast(st.live ? t('Betting on this match is paused right now. Try again in a moment.') : t('A pick just closed. Check your slip.')); return; }
  if (st.odds !== S.confirmOdds) { toast(t('Odds moved to {o}. Check and confirm again.', { o: fmtOdds(st.odds) })); return; }
  const legs = st.legs.map((l) => {
    const leg = { m: l.m, k: l.k, o: l.o, label: l.label.slice(0, 120), fx: (l.live ? l.lv.home + ' v ' + l.lv.away : l.fx).slice(0, 120) };
    if (l.live) { leg.sc = [l.lv.sh, l.lv.sa]; leg.t = l.lv.clk; }
    return leg;
  });
  const betRef = doc(collection(db, 'bets'));
  const b = writeBatch(db);
  const bet = { uid: S.user.uid, name: S.me.name, legs, mids: legs.map((l) => l.m), stake, odds: st.odds, status: 'open', placed: serverTimestamp() };
  if (st.live) bet.live = true;
  b.set(betRef, bet);
  b.update(doc(db, 'players', S.user.uid), { coins: S.me.coins - stake, lastBet: betRef.id });
  S.busy = true;
  renderSlip();
  try {
    await b.commit();
    setSlip([]);
    openSheet(false);
    toast(sass.place(legs.length));
  } catch (e) { failed(e, st.live ? t('Live bet not accepted: the odds just moved or betting paused. Try again.') : t('Bet not accepted. A price may have just changed or a match kicked off. Check your slip and try again.')); }
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
  const paid = won.reduce((s, b) => s + (b.payout || 0), 0), gain = paid - won.reduce((s, b) => s + b.stake, 0), loss = lost.reduce((s, b) => s + b.stake, 0);
  let emoji, title, msg;
  if (won.length && gain >= loss) { emoji = '🤑'; title = t('You won {n} coins', { n: paid }); msg = sass.win(paid); }
  else if (lost.length) { emoji = won.length ? '😬' : '🤡'; title = won.length ? t('Net {n} coins', { n: gain - loss }) : t('You lost {n} coins', { n: loss }); msg = sass.lose(loss); }
  else { emoji = '🙃'; title = t('Refunded'); msg = sass.void(refunded.reduce((s, b) => s + b.stake, 0)); }
  $('resultEmoji').textContent = emoji;
  $('resultTitle').textContent = title;
  $('resultMsg').textContent = msg;
  $('resultList').innerHTML = fresh.slice(0, 6).map((b) => {
    const legs = legsOf(b);
    const what = legs.length > 1 ? t('{n}-pick multi', { n: legs.length }) : esc(legLabel(legs[0]));
    return '<div>' + what + ': ' + (b.status === 'won' ? '+' + b.payout : b.status === 'lost' ? '−' + b.stake : t('refunded')) + '</div>';
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
    renderLeagues(); renderMatches(); renderSlip(); renderLive();
  }, (e) => { console.error(e); S.matchesLoaded = true; renderMatches(); }));

  subs.push(onSnapshot(collection(db, 'players'), (snap) => {
    S.players = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const mine = S.players.find((p) => p.id === uid) || null;
    if (mine || !snap.metadata.fromCache) S.meLoaded = true;
    const first = !S.me && mine;
    S.me = mine;
    if (first && mine.lang && mine.lang !== getLang() && !load('fs_lang', null)) applyLang(mine.lang);
    renderAll();
  }, (e) => { console.error(e); S.meLoaded = true; renderAll(); }));

  listenMine();

  subs.push(onSnapshot(query(collection(db, 'live'), where('done', '==', false)), (snap) => {
    const o = {};
    snap.docs.forEach((d) => { o[d.id] = { ...d.data(), id: d.id }; });
    S.live = o;
    renderLive(); renderSlip(); renderMatches(); renderMine();
  }, (e) => console.error(e)));

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

/* ---------- account and favourites ---------- */
function allTeams() {
  const set = new Set();
  S.matches.forEach((m) => { set.add(m.home); set.add(m.away); });
  return [...set].sort((a, b) => a.localeCompare(b));
}
function renderFavDraft() {
  $('favCount').textContent = t('{n} of 5', { n: S.favDraft.length });
  $('favList').innerHTML = S.favDraft.length ? S.favDraft.map((f, i) => '<span class="fav-chip">⭐ ' + esc(f) + ' <button type="button" data-rmfav="' + i + '" aria-label="' + esc(t('Remove from favourites')) + '">×</button></span>').join('')
    : '<small class="muted">' + t('No favourites yet.') + '</small>';
}
function addFavDraft(name) {
  name = String(name || '').trim();
  if (!name || S.favDraft.includes(name)) return;
  if (S.favDraft.length >= 5) { toast(t('Max 5 favourite teams. Commitment issues?')); return; }
  S.favDraft.push(name.slice(0, 60));
  renderFavDraft();
}
function openAccount() {
  if (!S.user) return;
  const google = S.user.providerData.some((p) => p.providerId === 'google.com');
  $('accountWho').textContent = t('Signed in as {who}', { who: (S.user.email || S.user.displayName || '') + (google ? ' (Google)' : '') });
  $('accountName').value = S.me ? S.me.name : '';
  $('accountName').parentElement.hidden = !S.me;
  $('favList').parentElement.hidden = !S.me;
  $('accountSave').hidden = !S.me;
  S.favDraft = favs().slice();
  renderFavDraft();
  $('teamList').innerHTML = allTeams().map((n) => '<option value="' + esc(n) + '">').join('');
  $('favIn').value = '';
  $('accountDlg').showModal();
}
async function saveFavs(list) {
  try { await updateDoc(doc(db, 'players', S.user.uid), { favs: list }); } catch (e) { failed(e); }
}
async function toggleFav(team) {
  if (!S.me) { toast(t('Join the game first.')); return; }
  const f = favs().slice(), i = f.indexOf(team);
  if (i >= 0) f.splice(i, 1);
  else { if (f.length >= 5) { toast(t('Max 5 favourite teams. Commitment issues?')); return; } f.push(team); }
  await saveFavs(f);
}
$('favAdd').addEventListener('click', () => { addFavDraft($('favIn').value); $('favIn').value = ''; });
$('favIn').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addFavDraft($('favIn').value); $('favIn').value = ''; } });
$('favList').addEventListener('click', (e) => { const b = e.target.closest('[data-rmfav]'); if (b) { S.favDraft.splice(Number(b.dataset.rmfav), 1); renderFavDraft(); } });
$('accountDlg').addEventListener('close', async () => {
  const v = $('accountDlg').returnValue;
  if (v === 'logout') { setSlip([]); await signOut(auth); toast(t('Logged out. Your coins will miss you. Probably.')); return; }
  if (v === 'save' && S.me) {
    const name = $('accountName').value.trim().slice(0, 20);
    try {
      if (name && name !== S.me.name) { await updateDoc(doc(db, 'players', S.user.uid), { name }); toast(t('You are "{name}" now. Same bad bets, new name.', { name })); }
      if (JSON.stringify(S.favDraft) !== JSON.stringify(favs())) { await saveFavs(S.favDraft); if (!name || name === S.me.name) toast(t('Saved.')); }
    } catch (e) { failed(e); }
  }
});

/* ---------- rendering ---------- */
function renderWallet() {
  const me = S.me;
  let h;
  if (!configured || !S.authed) h = '<small>' + t('Loading…') + '</small>';
  else if (!S.user) h = '<small>' + t('Not signed in yet') + '</small>';
  else if (!S.meLoaded) h = '<small>' + t('Loading your coins…') + '</small>';
  else if (!me) {
    const first = esc(((S.user.displayName || '').split(' ')[0] || (S.user.email || '').split('@')[0].replace(/[^\p{L}\p{N}._ -]/gu, '') || '').slice(0, 20));
    h = '<form class="join" id="joinForm"><input type="text" id="nameIn" maxlength="20" autocomplete="nickname" value="' + first + '" placeholder="' + esc(t('Your name on the table')) + '" aria-label="' + esc(t('Your name on the table')) + '"><button class="btn" type="submit">' + t('Join the game') + '</button></form>';
  } else {
    const claimed = (me.lastClaimDay || 0) >= claimDay();
    let sub;
    if (claimed) {
      const mins = Math.max(1, Math.round((nextClaimAt() - Date.now()) / 60000));
      sub = t('Next {n} coins in {t}', { n: DAILY_COINS, t: mins >= 60 ? Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm' : mins + 'm' });
    } else sub = t("Today's {n} coins are waiting", { n: DAILY_COINS });
    h = '<div class="bal" title="' + esc(me.name + ' · ' + sub) + '"><span class="coin" aria-hidden="true"></span><b class="num">' + (me.coins || 0) + '</b></div>'
      + (claimed ? '' : '<button class="btn gold" id="claimBtn">+' + DAILY_COINS + '</button>');
  }
  paint('wallet', h);
  $('acctBtn').hidden = !S.user;
}

function renderLeagues() {
  const now = Date.now(), count = {};
  S.matches.forEach((m) => { if (isOpen(m, now)) count[m.sk] = (count[m.sk] || 0) + 1; });
  const total = Object.values(count).reduce((a, b) => a + b, 0);
  if (S.league === 'fav' && !favs().length) S.league = 'all';
  if (S.league !== 'all' && S.league !== 'fav' && !count[S.league]) S.league = 'all';
  const opt = (val, icon, name, n) => '<button type="button" role="option" data-lg="' + esc(val) + '" aria-selected="' + (S.league === val) + '">'
    + icon + '<span class="ddl-n">' + esc(name) + '</span>' + (n != null ? '<span class="ddl-c">' + n + '</span>' : '') + '</button>';
  let h = opt('all', '<span class="fl-e">⚽</span>', t('All leagues'), total);
  if (favs().length) h += opt('fav', '<span class="fl-e">⭐</span>', t('Your teams'));
  GROUPS.forEach((g) => {
    const ls = LEAGUES.filter((l) => l.group === g && count[l.slug]);
    if (ls.length) h += '<div class="ddl-g">' + esc(t(g)) + '</div>' + ls.map((l) => opt(l.slug, flagOf(l.slug), t(l.name), count[l.slug])).join('');
  });
  const other = Object.keys(count).filter((x) => !BY_SLUG[x]);
  if (other.length) h += '<div class="ddl-g">' + t('Other') + '</div>' + other.map((x) => opt(x, flagOf(x), x, count[x])).join('');
  paint('leagueMenu', h);
  const L = BY_SLUG[S.league];
  paint('leagueBtn', S.league === 'all' ? '<span class="fl-e">⚽</span><span class="ddl-n">' + t('All leagues') + ' (' + total + ')</span>'
    : S.league === 'fav' ? '<span class="fl-e">⭐</span><span class="ddl-n">' + t('Your teams') + '</span>'
    : flagOf(S.league) + '<span class="ddl-n">' + esc(L ? t(L.name) : S.league) + ' (' + (count[S.league] || 0) + ')</span>');
}

function openLeagues(on) {
  $('leagueMenu').hidden = !on;
  $('leagueBtn').setAttribute('aria-expanded', on);
  if (on) { const cur = $('leagueMenu').querySelector('[aria-selected=true]'); if (cur) { cur.scrollIntoView({ block: 'nearest' }); cur.focus(); } }
}

function inDay(m) {
  if (S.day === 'all') return true;
  const d = new Date(ms(m.ko)), now = new Date();
  if (S.day === 'today') return dayKey(d) === dayKey(now);
  if (S.day === 'tomorrow') { now.setDate(now.getDate() + 1); return dayKey(d) === dayKey(now); }
  if (S.day === 'weekend') { const wd = d.getDay(), soon = ms(m.ko) - Date.now() < 7 * DAY_MS; return soon && (wd === 0 || wd === 6 || (wd === 5 && d.getHours() >= 17)); }
  return true;
}

function crowd() {
  const c = {}, me = S.user && S.user.uid;
  S.openBets.forEach((b) => { if (b.uid === me) return; new Set(legsOf(b).map((l) => l.m)).forEach((m) => { (c[m] = c[m] || new Set()).add(b.uid); }); });
  return c;
}

const extraCount = (m) => Object.keys(m.p || {}).length - 3;

function teamLine(m, side) {
  const name = side === 'h' ? m.home : m.away, url = side === 'h' ? m.hl : m.al;
  return '<div class="tm">' + logo(url, name) + '<span class="tn">' + esc(name) + '</span>' + (isFav(name) ? '<span class="star on" aria-label="' + esc(t('Favourite')) + '">★</span>' : '') + '</div>';
}

function oddBtn(mid, k, o, text, sel, disabled, aria) {
  return '<button class="ob" data-mid="' + esc(mid) + '" data-k="' + esc(k) + '" aria-pressed="' + (sel === k) + '"' + (disabled ? ' disabled' : '')
    + ' aria-label="' + esc(aria) + '"><span>' + esc(text) + '</span><b class="num">' + (o != null ? fmtOdds(o) : '–') + '</b></button>';
}

// The extra markets of a match, by category.
function marketTabs(m, sel) {
  const g = markets(m.home, m.away), half = halfMarkets(m.home, m.away);
  const pick = (idx) => idx.map((i) => g[i]).filter(Boolean);
  const cats = [['main', 'Main', pick([0, 1, 2, 3])], ['goals', 'Goals', pick([4, 5, 12, 13, 10, 8, 9])], ['halves', 'Halves', half], ['score', 'Score', pick([14, 11, 6, 7])]];
  const hasPl = m.pl && Object.keys(m.pl).length;
  if (hasPl) cats.splice(1, 0, ['players', 'Players', null]);
  const cat = cats.find((c) => c[0] === S.cat) ? S.cat : 'main';
  let h = '<div class="mk"><div class="mk-tabs" role="tablist">' + cats.map((c) => '<button role="tab" data-cat="' + c[0] + '" aria-selected="' + (c[0] === cat) + '">' + t(c[1]) + '</button>').join('') + '</div>';
  h += '<div class="mk-fav">' + ['h', 'a'].map((s) => { const n = s === 'h' ? m.home : m.away, on = isFav(n);
    return '<button class="favbtn' + (on ? ' on' : '') + '" data-fav="' + esc(n) + '">' + (on ? '★ ' : '☆ ') + esc(n) + '</button>'; }).join('') + '</div>';
  if (cat === 'players') {
    const rows = Object.entries(m.pl).map(([id, x]) => ({ id, ...x, any: m.p['sc:' + id], first: m.p['fg:' + id] })).filter((x) => x.any);
    h += ['h', 'a'].map((s) => {
      const rs = rows.filter((x) => x.s === s).sort((a, b) => a.any - b.any);
      if (!rs.length) return '';
      return '<div class="pl-team"><h4>' + logo(s === 'h' ? m.hl : m.al, s === 'h' ? m.home : m.away) + esc(s === 'h' ? m.home : m.away) + '</h4>'
        + '<div class="pl-head"><span>' + t('Player') + '</span><span>' + t('Anytime') + '</span><span>' + t('First') + '</span></div>'
        + rs.map((x) => '<div class="pl-row"><span class="pl-n">' + esc(x.n) + '</span>'
          + oddBtn(m.id, 'sc:' + x.id, x.any, '', sel, false, label('sc:' + x.id, m.home, m.away, m.pl))
          + (x.first ? oddBtn(m.id, 'fg:' + x.id, x.first, '', sel, false, label('fg:' + x.id, m.home, m.away, m.pl)) : '<span></span>') + '</div>').join('') + '</div>';
    }).join('');
  } else {
    const groups = cats.find((c) => c[0] === cat)[2];
    h += groups.map((gr) => {
      const sels = gr.sels.filter((s) => m.p[s[0]] != null);
      if (!sels.length) return '';
      return '<div class="mk-g"><h4>' + esc(mk(gr.name, m.home, m.away)) + '</h4><div class="sels">'
        + sels.map((s) => oddBtn(m.id, s[0], m.p[s[0]], short(s[1]), sel, false, label(s[0], m.home, m.away, m.pl))).join('') + '</div></div>';
    }).join('');
  }
  return h + '</div>';
}

function fixtureRow(m, now, mine, friends) {
  const open = isOpen(m, now), fin = m.status === 'final', lv = S.live[m.id];
  const inSlip = S.slip.find((l) => !l.live && l.m === m.id), sel = inSlip ? inSlip.k : null;
  let h = '<article class="fx' + (S.exp === m.id ? ' exp' : '') + '"><div class="fx-row">'
    + '<div class="fx-time">' + (lv ? '<span class="clock">' + esc(lv.status === 'STATUS_HALFTIME' ? t('HT') : lv.shown || lv.min + "'") + '</span>' : '<b>' + esc(fmtTime(new Date(ms(m.ko)))) + '</b>')
    + (m.src === 'elo' && open ? '<span class="tag" title="' + esc(t('No bookmaker price yet; odds from World Football Elo ratings')) + '">Elo</span>' : '') + '</div>'
    + '<div class="fx-teams">' + teamLine(m, 'h') + teamLine(m, 'a') + '</div>';
  if (fin) h += '<div class="fx-score num">' + m.sh + '<br>' + m.sa + '</div>';
  else if (lv) h += '<div class="fx-score num live">' + lv.sh + '<br>' + lv.sa + '</div>';
  h += '<div class="odds">' + (fin ? '' : ['h', 'd', 'a'].map((p) => oddBtn(m.id, '1x2:' + p, m.p['1x2:' + p], p === 'h' ? '1' : p === 'd' ? 'X' : '2', sel, !open, label('1x2:' + p, m.home, m.away))).join('')) + '</div>';
  h += open ? '<button class="more" data-more="' + esc(m.id) + '" aria-expanded="' + (S.exp === m.id) + '">' + (S.exp === m.id ? '−' : '+' + extraCount(m)) + '</button>' : '<span></span>';
  h += '</div>';
  const notes = [];
  if (friends) notes.push('<span class="crowd">👥 ' + (friends === 1 ? t('1 friend on this') : t('{n} friends on this', { n: friends })) + '</span>');
  if (mine.length) notes.push('<span>' + t('Your open bets here: {n}', { n: mine.length }) + '</span>');
  if (sel && !sel.startsWith('1x2:')) notes.push('<span>' + t('In your slip:') + ' <b>' + esc(label(sel, m.home, m.away, m.pl)) + '</b> @ ' + fmtOdds(m.p[sel]) + '</span>');
  if (m.status === 'void') notes.push('<span>' + t('Called off, stakes returned') + '</span>');
  else if (!open && !fin && !lv) notes.push('<span>' + t('Kicked off, result pending') + '</span>');
  if (notes.length) h += '<div class="fx-notes">' + notes.join('') + '</div>';
  if (open && S.exp === m.id) h += marketTabs(m, sel);
  return h + '</article>';
}

function leagueHead(sk, lg) {
  return '<div class="lg-head">' + flagOf(sk) + esc(t(lg)) + '</div>';
}

function renderMatches() {
  document.querySelector('.filters').hidden = !S.user;
  const now = Date.now(), q = S.q.trim().toLowerCase();
  const F = favs();
  const base = S.matches.filter((m) => !q || (m.home + ' ' + m.away).toLowerCase().includes(q));
  const list = base.filter((m) => S.league === 'all' || (S.league === 'fav' ? F.includes(m.home) || F.includes(m.away) : m.sk === S.league));
  const myOpen = {};
  S.myBets.forEach((b) => { if (b.status === 'open') new Set(legsOf(b).map((l) => l.m)).forEach((x) => { (myOpen[x] = myOpen[x] || []).push(b); }); });
  const fr = crowd();
  const row = (m) => fixtureRow(m, now, myOpen[m.id] || [], fr[m.id] ? fr[m.id].size : 0);
  let h = '';
  if (!configured) h = '<div class="empty">' + t('Waiting for the Firebase config.') + '</div>';
  else if (!S.user) h = authCard();
  else if (!S.matchesLoaded) h = '<div class="empty">' + t("Loading this week's matches…") + '</div>';
  else {
    // Favourite teams' next matches on top (unless already filtering to them).
    if (F.length && S.league === 'all') {
      const fav = base.filter((m) => isOpen(m, now) && inDay(m) && (F.includes(m.home) || F.includes(m.away))).slice(0, 6);
      if (fav.length) h += '<section class="block fav-block"><div class="block-h">⭐ ' + t('Your teams') + '</div>' + fav.map(row).join('') + '</section>';
    }
    const up = list.filter((m) => isOpen(m, now) && inDay(m));
    const wait = list.filter((m) => m.status === 'scheduled' && ms(m.ko) <= now);
    const done = list.filter((m) => m.status === 'final' || m.status === 'void').reverse().slice(0, 20);
    let curDay = '', curLg = '';
    up.slice(0, S.shown).forEach((m) => {
      const d = new Date(ms(m.ko)), k = dayKey(d);
      if (k !== curDay) { if (curDay) h += '</section>'; curDay = k; curLg = ''; h += '<section class="block"><div class="block-h">' + esc(fmtDay(d)) + '</div>'; }
      if (m.sk !== curLg) { curLg = m.sk; h += leagueHead(m.sk, m.lg); }
      h += row(m);
    });
    if (curDay) h += '</section>';
    if (up.length > S.shown) h += '<button class="more-btn" data-showmore="1">' + t('Show more games ({n} more)', { n: up.length - S.shown }) + '</button>';
    if (!up.length) h += '<div class="empty">' + (q ? t('No upcoming match for "{q}".', { q: esc(S.q) }) : t('No upcoming matches here. Try another league or day.')) + '</div>';
    if (wait.length || done.length) {
      h += '<button class="more-btn" data-showdone="1" aria-expanded="' + S.showDone + '">' + (S.showDone ? t('Hide live and recent results') : t('Show live and recent results ({n})', { n: wait.length + done.length })) + '</button>';
      if (S.showDone) {
        if (wait.length) h += '<section class="block"><div class="block-h">' + t('In play or waiting for the result') + '</div>' + wait.map(row).join('') + '</section>';
        if (done.length) h += '<section class="block"><div class="block-h">' + t('Recent results') + '</div>' + done.map(row).join('') + '</section>';
      }
    }
  }
  paint('matches', h);
}

function liveCard(lv) {
  const sel = S.slip.find((l) => l.live && l.m === lv.id);
  const fresh = Date.now() - ms(lv.at) < 55e3, closed = lv.min >= 85;
  let h = '<article class="lv' + (lv.susp || !fresh ? ' susp' : '') + '"><div class="lv-head"><span>' + (L ? L.flag + ' ' : '') + esc(t(lv.lg)) + '</span>'
    + '<span class="clock">' + esc(lv.status === 'STATUS_HALFTIME' ? t('HT') : lv.shown || lv.min + "'") + '</span></div>'
    + '<div class="lv-score"><span class="tm">' + logo(lv.hl, lv.home) + '<span class="tn">' + esc(lv.home) + '</span></span><b>' + lv.sh + ' – ' + lv.sa + '</b><span class="tm away"><span class="tn">' + esc(lv.away) + '</span>' + logo(lv.al, lv.away) + '</span></div>';
  if (lv.susp || !fresh) h += '<div class="susp-note">' + (closed ? t('Live betting closed for the last minutes.') : !fresh ? t('Waiting for live data…') : '⚽ ' + t('Something happened. Betting paused for a moment.')) + '</div>';
  if (!closed) {
    h += '<div class="mkts">' + liveMarkets(lv.home, lv.away, lv.p || {}).map((g) => '<div><h4>' + esc(t(g.name)) + '</h4><div class="sels">'
      + g.sels.map((s) => oddBtn(lv.id, s[0], lv.p[s[0]], short(s[1]), sel ? sel.k : null, false, label(s[0], lv.home, lv.away))).join('') + '</div></div>').join('') + '</div>';
  }
  return h + '</article>';
}

function renderLive() {
  const F = favs();
  const list = Object.values(S.live).sort((a, b) => (F.includes(b.home) || F.includes(b.away)) - (F.includes(a.home) || F.includes(a.away)) || ms(a.ko) - ms(b.ko));
  const badge = $('liveCount');
  badge.hidden = !list.length; badge.textContent = list.length;
  let h;
  if (!S.user) h = '<div class="empty">' + t('Sign in to bet live.') + '</div>';
  else if (!list.length) {
    const next = S.matches.filter((m) => isOpen(m)).sort((a, b) => ms(a.ko) - ms(b.ko))[0];
    h = '<div class="empty">' + t('No match is live right now.') + (next ? ' ' + t('Next kickoff: {m}, {w}.', { m: '<b>' + esc(next.home) + ' v ' + esc(next.away) + '</b>', w: esc(fmtWhen(next.ko)) }) : '') + ' ' + t('Live matches show up here with live odds, next goal and more.') + '</div>';
  } else h = '<div class="list">' + list.map(liveCard).join('') + '</div>';
  paint('live', h);
}

function renderSlip() {
  const st = slipState(), n = st.legs.length;
  let h = '<div class="slip-head"><h2>' + t('Bet slip') + (n ? ' <span class="badge">' + n + '</span>' : '') + '</h2><div>'
    + (n ? '<button class="linkish" data-clear="1">' + t('Clear') + '</button> ' : '')
    + '<button class="btn ghost slip-close" data-closeslip="1" aria-label="' + esc(t('Close')) + '">' + t('Close') + '</button></div></div>';
  if (!n) h += '<div class="empty">' + t('Tap prices to add picks. Picks from different matches make a multi-bet: the odds multiply, and every pick has to win.') + '</div>';
  else {
    h += '<div class="slip-legs">' + st.legs.map((l, i) => '<div class="leg' + (l.ok ? '' : ' bad') + '"><div class="t">' + esc(l.label) + '</div>'
      + '<div class="s">' + (l.live ? '<span class="livetag">' + t('LIVE') + '</span> ' : '') + (l.ok ? esc(l.fx) : l.live ? esc(l.fx) + ' · ' + l.why : (l.match ? esc(l.fx) + ' · ' + t('closed, remove it') : '')) + '</div>'
      + '<div class="o num">' + (l.ok ? fmtOdds(l.o) : '–') + '</div><button class="x" data-rm="' + i + '" aria-label="×">×</button></div>').join('') + '</div>';
    const coins = S.me ? S.me.coins : 0, stake = Math.floor(Number(S.stake));
    h += '<div class="slip-total"><span>' + (n > 1 ? t('{n}-pick multi odds', { n }) : t('Odds')) + '</span><b class="num">' + (st.good.length ? fmtOdds(st.odds) : '–') + '</b></div>'
      + '<div class="slip-stake"><label for="stakeIn">' + t('Stake') + '</label><input type="number" id="stakeIn" min="1" step="1" inputmode="numeric" value="' + esc(S.stake) + '">'
      + [10, 25, 50].map((a) => '<button class="chip" data-amt="' + a + '"' + (a > coins ? ' disabled' : '') + '>' + a + '</button>').join('')
      + '<button class="chip" data-amt="' + coins + '"' + (coins ? '' : ' disabled') + '>' + t('All in') + '</button></div>'
      + '<div class="slip-ret">' + t('Returns') + ' <b class="num" id="retOut">' + (stake >= 1 && st.good.length ? Math.round(stake * st.odds) + ' ' + t('coins') : '–') + '</b></div>'
      + '<button class="btn slip-place" data-place="1"' + (S.busy || (st.bad && !st.live) || !S.me ? ' disabled' : '') + '>' + (S.busy ? t('Placing…') : !S.me ? t('Join the game to bet') : t('Place bet')) + '</button>';
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
  if (n) bar.innerHTML = '<span>🧾 ' + t('Bet slip') + ' <span class="badge">' + n + '</span></span><span class="num">@ ' + (st.good.length ? fmtOdds(st.odds) : '–') + ' ›</span>';
}

const ICON = { open: '⏳', won: '✅', lost: '❌', void: '↩️' };
const WORD = { open: 'Waiting', won: 'Won', lost: 'Lost', void: 'Refunded' };

// Label of a placed leg in the current language when the match is known.
function legLabel(l) {
  const m = S.matches.find((x) => x.id === l.m);
  if (m) return label(l.k, m.home, m.away, m.pl);
  const lv = S.live[l.m];
  if (lv) return label(l.k, lv.home, lv.away);
  const fx = String(l.fx || '').split(' v ');
  if (fx.length === 2 && !/^(sc|fg|lv:sc)/.test(l.k)) return label(l.k, fx[0], fx[1]);
  return l.label;
}

// Per-pick state: from settlement when it ran, else from the live match.
function legState(b, l, i, mm) {
  const m = mm[l.m];
  let st = (b.res && b.res[i]) || 'open';
  if (st === 'open' && m && m.status === 'final') st = l.k.startsWith('lv:') ? liveOutcome(l, m) : matchOutcome(l.k, m);
  if (st === 'open' && m && m.status === 'void') st = 'void';
  const lv = S.live[l.m];
  const started = m && m.status === 'scheduled' && ms(m.ko) <= Date.now();
  const score = m && m.status === 'final' ? m.sh + '-' + m.sa : lv ? lv.sh + '-' + lv.sa + ' ' + (lv.shown || '') : started ? t('playing') : m && st === 'open' ? fmtWhen(m.ko) : '';
  return { st, score };
}

function betCard(b, mm) {
  const legs = legsOf(b), st = b.status;
  const title = legs.length > 1 ? t('{n}-pick multi', { n: legs.length }) : esc(legLabel(legs[0]));
  const right = st === 'open' ? Math.round(b.stake * b.odds) + '<small>' + t('to win') + '</small>'
    : st === 'won' ? '<span class="won-n">+' + b.payout + '</span><small>' + t('paid') + '</small>'
    : st === 'lost' ? '<span class="lost-n">−' + b.stake + '</span><small>' + t('lost') + '</small>'
    : b.stake + '<small>' + t('refunded') + '</small>';
  let h = '<article class="bet ' + st + '"><div class="ico" title="' + t(WORD[st]) + '">' + ICON[st] + '</div>'
    + '<div class="t">' + title + ' <span class="num">@ ' + fmtOdds(b.odds) + '</span></div>'
    + '<div class="r num">' + right + '</div>'
    + '<div class="s">' + t(WORD[st]) + ' · ' + t('staked {n}', { n: b.stake }) + ' · ' + esc(fmtWhen(b.placed)) + '</div>';
  h += '<div class="legs-mini">' + legs.map((l, i) => {
    const x = legState(b, l, i, mm);
    return '<span class="lg ' + x.st + '">' + ICON[x.st] + ' <span>' + (legs.length > 1 ? esc(legLabel(l)) + ' @ ' + fmtOdds(l.o) + ' · ' : '') + esc(l.fx) + '</span><em>' + esc(x.score || b.score || '') + '</em></span>';
  }).join('') + '</div>';
  return h + '</article>';
}

function renderMine() {
  const bets = S.myBets, mm = matchMap();
  const open = bets.filter((b) => b.status === 'open').length;
  const badge = $('openCount');
  badge.hidden = !open; badge.textContent = open;
  let h;
  if (!S.me) h = '<div class="empty">' + t('Join the game, claim your coins, then tap a price next to a match.') + '</div>';
  else if (!bets.length) h = '<div class="empty">' + t('No bets yet. Tap prices on the Sports tab to fill your bet slip.') + '</div>';
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
      + '<div class="stat"><small>' + t('Record') + '</small><b class="num">' + w + '–' + l + '</b></div>'
      + '<div class="stat"><small>' + t('Win rate') + '</small><b class="num">' + (w + l ? Math.round((100 * w) / (w + l)) + '%' : '–') + '</b></div>'
      + '<div class="stat"><small>' + t(S.myMore ? 'Profit (shown)' : 'Profit') + '</small><b class="num ' + (net > 0 ? 'won-n' : net < 0 ? 'lost-n' : '') + '">' + (net > 0 ? '+' : '') + net + '</b></div>'
      + '<div class="stat"><small>' + t('Biggest win') + '</small><b class="num">' + (best ? '+' + best : '–') + '</b></div></div>';
    if (S.mineFilter !== 'all' && !n[S.mineFilter]) S.mineFilter = 'all';
    h += '<div class="chips" id="mineFilter">' + ['all', 'open', 'won', 'lost', 'void'].filter((k) => k === 'all' || n[k]).map((k) =>
      '<button class="chip" data-mf="' + k + '" aria-pressed="' + (S.mineFilter === k) + '">' + (k === 'all' ? t('All') : ICON[k] + ' ' + t(WORD[k])) + ' (' + n[k] + ')</button>').join('') + '</div>';
    const list = bets.filter((b) => S.mineFilter === 'all' || b.status === S.mineFilter);
    h += '<div class="bets">' + list.map((b) => betCard(b, mm)).join('') + '</div>';
    if (S.myMore) h += '<button class="more-btn" data-older="1">' + t('Load older bets') + '</button>';
  }
  paint('mine', h);
}

function renderBoard() {
  const inplay = {};
  S.openBets.forEach((b) => { inplay[b.uid] = (inplay[b.uid] || 0) + b.stake; });
  const ps = S.players.slice().sort((a, b) => (b.coins || 0) - (a.coins || 0) || String(a.name).localeCompare(String(b.name)));
  const uid = S.user && S.user.uid;
  paint('board', !ps.length ? '<div class="empty">' + t('Everyone who joins shows up here, ranked by coins.') + '</div>'
    : '<table><thead><tr><th>#</th><th>' + t('Player') + '</th><th>' + t('W–L') + '</th><th>' + t('In play') + '</th><th>' + t('Coins') + '</th></tr></thead><tbody>'
      + ps.map((p, i) => '<tr' + (p.id === uid ? ' class="me"' : '') + '><td class="num">' + (i + 1) + '</td><td>' + (i === 0 && p.coins ? '👑 ' : '') + esc(p.name || 'Player') + (p.id === uid ? ' ' + t('(you)') : '')
        + (!p.coins && !inplay[p.id] ? ' <span class="broke">💸 ' + t('broke') + '</span>' : '')
        + '</td><td class="num">' + (p.won || 0) + '–' + (p.lost || 0) + '</td><td class="num">' + (inplay[p.id] || 0) + '</td><td class="c num">' + (p.coins || 0) + '</td></tr>').join('')
      + '</tbody></table>');
  paint('feed', S.feed.length ? '<div class="slip-list">' + S.feed.map((b) => {
    const legs = legsOf(b), what = legs.length > 1 ? t('a {n}-pick multi', { n: legs.length }) : esc(legLabel(legs[0]));
    return '<div class="row"><div class="t">' + t('{name} · {n} on {what}', { name: esc(b.name || 'Player'), n: b.stake, what }) + '</div>'
      + '<div class="s">' + (legs.length > 1 ? legs.map((l) => esc(legLabel(l))).join(', ') : esc(legs[0].fx)) + ' <span class="pill ' + b.status + '">' + ICON[b.status] + '</span></div>'
      + '<div class="r num">' + fmtOdds(b.odds) + '</div></div>';
  }).join('') + '</div>' : '<div class="empty">' + t('Nobody has placed a bet yet.') + '</div>');
}

function renderAll() { renderWallet(); renderLeagues(); renderMatches(); renderLive(); renderSlip(); renderMine(); renderBoard(); }

/* ---------- events ---------- */
function showTab(tab) {
  $('app').dataset.tab = tab;
  Array.from($('tabs').children).forEach((x) => x.setAttribute('aria-selected', x.dataset.tab === tab));
}
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  showTab(b.dataset.tab);
  window.scrollTo({ top: 0 });
});
document.querySelector('.lang').addEventListener('click', (e) => { const b = e.target.closest('[data-lang]'); if (b) applyLang(b.dataset.lang, true); });
$('wallet').addEventListener('submit', (e) => { e.preventDefault(); const i = $('nameIn'); if (i) join(i.value); });
$('wallet').addEventListener('click', (e) => { if (e.target.closest('#claimBtn')) claim(); });
$('acctBtn').addEventListener('click', openAccount);
$('leagueBtn').addEventListener('click', () => openLeagues($('leagueMenu').hidden));
$('leagueMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lg]');
  if (!b) return;
  S.league = b.dataset.lg; S.shown = PAGE;
  openLeagues(false); renderLeagues(); renderMatches();
  $('leagueBtn').focus();
});
document.addEventListener('click', (e) => { if (!$('leagueMenu').hidden && !e.target.closest('#leagueDd')) openLeagues(false); });
$('leagueDd').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { openLeagues(false); $('leagueBtn').focus(); return; }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  if ($('leagueMenu').hidden) { openLeagues(true); return; }
  const items = [...$('leagueMenu').querySelectorAll('[data-lg]')], i = items.indexOf(document.activeElement);
  const next = items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
  if (next) next.focus();
});
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
  const b = e.target.closest('button');
  if (!b) return;
  if (b.id === 'signInBtn') { signIn(); return; }
  if (b.dataset.mode) {
    const email = $('authEmail') ? $('authEmail').value : '';
    S.authMode = b.dataset.mode; renderMatches();
    if ($('authEmail')) { $('authEmail').value = email; $('authEmail').focus(); }
    return;
  }
  if (b.dataset.more) { S.exp = S.exp === b.dataset.more ? null : b.dataset.more; renderMatches(); }
  else if (b.dataset.cat) { S.cat = b.dataset.cat; renderMatches(); }
  else if (b.dataset.fav) toggleFav(b.dataset.fav);
  else if (b.dataset.showmore) { S.shown += PAGE; renderMatches(); }
  else if (b.dataset.showdone) { S.showDone = !S.showDone; renderMatches(); }
  else if (b.dataset.k) {
    if (!S.me) { toast(t('Join the game first.')); const n = $('nameIn'); if (n) n.focus(); return; }
    toggleLeg(b.dataset.mid, b.dataset.k);
  }
});
$('live').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b) return;
  if (!S.me) { toast(t('Join the game first.')); return; }
  toggleLeg(b.dataset.mid, b.dataset.k);
  if (window.innerWidth < 900 && S.slip.length) openSheet(true);
});
$('mine').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.mf) { S.mineFilter = b.dataset.mf; renderMine(); }
  else if (b.dataset.older) { S.myLimit += 50; listenMine(); }
});
$('slip').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.rm) setSlip(S.slip.filter((_, i) => i !== Number(b.dataset.rm)));
  else if (b.dataset.clear) setSlip([]);
  else if (b.dataset.closeslip) openSheet(false);
  else if (b.dataset.amt) { S.stake = Number(b.dataset.amt); renderSlip(); }
  else if (b.dataset.place) confirmPlace();
});
$('slip').addEventListener('input', (e) => {
  if (e.target.id !== 'stakeIn') return;
  S.stake = e.target.value;
  const st = slipState(), stake = Math.floor(Number(S.stake));
  $('retOut').textContent = stake >= 1 && st.good.length ? Math.round(stake * st.odds) + ' ' + t('coins') : '–';
});
$('slip').addEventListener('keydown', (e) => { if (e.target.id === 'stakeIn' && e.key === 'Enter') { e.preventDefault(); confirmPlace(); } });
$('slipBar').addEventListener('click', () => openSheet(true));
$('scrim').addEventListener('click', () => openSheet(false));
$('confirmDlg').addEventListener('close', () => { if ($('confirmDlg').returnValue === 'ok') place(); });

/* ---------- boot ---------- */
applyLang(load('fs_lang', null) || ((navigator.language || '').toLowerCase().startsWith('az') ? 'az' : 'en'));
if (!configured) { S.authed = true; renderAll(); }
else {
  onAuthStateChanged(auth, (user) => {
    subs.splice(0).forEach((u) => u());
    if (mySub) { mySub(); mySub = null; }
    Object.assign(S, { live: {}, user, authed: true, authMode: 'login', me: null, meLoaded: false, players: [], matches: [], matchesLoaded: false, myBets: [], feed: [], openBets: [], myLimit: 50 });
    if (user) listen(); else showTab('matches');
    renderAll();
  });
  setInterval(() => { if (S.me) renderWallet(); renderMatches(); renderLive(); renderSlip(); }, 15000);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
