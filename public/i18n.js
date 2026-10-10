// English / Azerbaijani. UI strings are keyed by their English text; bet
// labels are built from the market key so they follow the chosen language.
let L = 'en';
export const getLang = () => L;
export const setLang = (x) => { L = x === 'az' ? 'az' : 'en'; };

const AZ = {
  // navigation and common
  'Sports': 'İdman', 'Live': 'Canlı', 'My bets': 'Mərclərim', 'Table': 'Cədvəl', 'Live now': 'İndi canlı',
  'League': 'Liqa', 'All days': 'Bütün günlər', 'Today': 'Bu gün', 'Tomorrow': 'Sabah', 'Weekend': 'Həftəsonu',
  'Search a team': 'Komanda axtar', 'Latest bets': 'Son mərclər', 'Cancel': 'Ləğv et', 'Yes, place it': 'Bəli, təsdiqlə',
  'Your account': 'Hesabın', 'Name on the table': 'Cədvəldəki adın', 'Favourite teams': 'Sevimli komandalar',
  'Type a team, e.g. Qarabağ': 'Komanda yaz, məs. Qarabağ', 'Add': 'Əlavə et', 'Their matches show first in Sports and Live.': 'Onların oyunları İdman və Canlı bölmələrində birinci göstərilir.',
  'Log out': 'Çıxış', 'Close': 'Bağla', 'Save': 'Yadda saxla', 'I accept my fate': 'Taleyimlə barışıram',
  'All leagues': 'Bütün liqalar', 'Your teams': 'Komandaların', 'Show more games ({n} more)': 'Daha çox oyun ({n} daha)',
  'Show live and recent results ({n})': 'Canlı və son nəticələri göstər ({n})', 'Hide live and recent results': 'Canlı və son nəticələri gizlət',
  'In play or waiting for the result': 'Oynanılır və ya nəticə gözlənilir', 'Recent results': 'Son nəticələr',
  'No upcoming matches here. Try another league or day.': 'Burada yaxın oyun yoxdur. Başqa liqa və ya gün seç.',
  'No upcoming match for "{q}".': '"{q}" üçün yaxın oyun yoxdur.', "Loading this week's matches…": 'Bu həftənin oyunları yüklənir…',
  'Waiting for the Firebase config.': 'Firebase ayarları gözlənilir.', 'Elo odds': 'Elo əmsalı',
  'No bookmaker price yet; odds from World Football Elo ratings': 'Bukmeker əmsalı hələ yoxdur; əmsallar World Football Elo reytinqindən',
  '{n} friends on this': '{n} dost bu oyunda', '1 friend on this': '1 dost bu oyunda', 'Full time': 'Oyun bitdi',
  'Called off, stakes returned': 'Ləğv olundu, mərclər qaytarıldı', 'Kicked off, result pending': 'Başlayıb, nəticə gözlənilir',
  'Your open bets here: {n}': 'Bu oyunda açıq mərclərin: {n}', 'In your slip:': 'Kuponunda:', 'Less': 'Az göstər',
  'Main': 'Əsas', 'Goals': 'Qollar', 'Halves': 'Hissələr', 'Players': 'Oyunçular', 'Score': 'Hesab',
  'Player': 'Oyunçu', 'Anytime': 'Qol vurar', 'First': 'İlk qol', 'Add to favourites': 'Sevimlilərə əlavə et', 'Remove from favourites': 'Sevimlilərdən çıxar',
  'Favourite': 'Sevimli',
  // pages
  'Back': 'Geri', 'Profile': 'Profil', 'Language': 'Dil', 'Save name': 'Adı yadda saxla', 'Find your team': 'Komandanı tap',
  'Tap a team to add it. Up to 5.': 'Əlavə etmək üçün komandaya toxun. 5-ə qədər.', 'Showing {n} of {m}. Type to find more.': '{m} komandadan {n} göstərilir. Digərləri üçün axtar.',
  'Bet placed!': 'Mərc qəbul olundu!', '+{n} coins': '+{n} sikkə',
  'bets': 'mərc', 'Hide': 'Gizlət', '{n} more bets': '{n} əlavə mərc',
  'Bet details': 'Mərcin detalları', 'Bet not found.': 'Mərc tapılmadı.', 'Placed': 'Qoyulub', 'Picks': 'Seçimlər', 'Paid': 'Ödənildi',
  'Next {n} coins in': 'Növbəti {n} sikkəyə qalıb', 'at 00:00 your time': 'sənin saatınla 00:00-da', 'Rank': 'Yer', 'See all my bets': 'Bütün mərclərim',
  'Pick a league, then tap a team. Up to 5.': 'Liqa seç, sonra komandaya toxun. 5-ə qədər.',
  // wallet and account
  'Loading…': 'Yüklənir…', 'Not signed in yet': 'Hələ daxil olmamısan', 'Loading your coins…': 'Sikkələrin yüklənir…',
  'Your name on the table': 'Cədvəldəki adın', 'Join the game': 'Oyuna qoşul', 'Claim {n}': '{n} götür',
  'Next {n} coins in {t}': 'Növbəti {n} sikkə {t} sonra', "Today's {n} coins are waiting": 'Bugünkü {n} sikkən səni gözləyir',
  'Signed in as {who}': '{who} kimi daxil olmusan', 'You are "{name}" now. Same bad bets, new name.': 'İndi adın "{name}". Mərclər eyni dərəcədə pis, ad yeni.',
  'Logged out. Your coins will miss you. Probably.': 'Çıxış etdin. Sikkələrin darıxacaq. Yəqin ki.',
  'Max 5 favourite teams. Commitment issues?': 'Ən çox 5 sevimli komanda. Bağlılıq problemin var?',
  'Saved.': 'Yadda saxlanıldı.', '{n} of 5': '{n} / 5', 'No favourites yet.': 'Hələ sevimli yoxdur.',
  // sign in
  'Sign in to get 100 free coins a day and bet on real matches with your friends.': 'Daxil ol, hər gün 100 pulsuz sikkə al və dostlarınla real oyunlara mərc et.',
  'Continue with Google': 'Google ilə davam et', 'or with email': 'və ya e-poçt ilə', 'Create an account': 'Hesab yarat',
  'Reset your password': 'Şifrəni sıfırla', 'Log in': 'Daxil ol', 'Email': 'E-poçt', 'Password': 'Şifrə',
  'At least 6 characters.': 'Ən azı 6 simvol.', 'Sign up': 'Qeydiyyat', 'Send reset link': 'Sıfırlama linki göndər',
  'No account? Sign up': 'Hesabın yoxdur? Qeydiyyatdan keç', 'Forgot password?': 'Şifrəni unutmusan?', 'Have an account? Log in': 'Hesabın var? Daxil ol',
  'Wrong email or password.': 'E-poçt və ya şifrə səhvdir.', 'No account with that email. Sign up instead?': 'Bu e-poçtla hesab yoxdur. Qeydiyyatdan keçək?',
  'That email already has an account. Log in instead.': 'Bu e-poçtla hesab artıq var. Daxil ol.', 'Password needs at least 6 characters.': 'Şifrə ən azı 6 simvol olmalıdır.',
  "That email doesn't look right.": 'Bu e-poçt düzgün görünmür.', 'Type a password.': 'Şifrəni yaz.', 'Too many tries. Wait a minute and try again.': 'Çox cəhd oldu. Bir dəqiqə gözlə və yenidən yoxla.',
  'No connection. Try again.': 'İnternet yoxdur. Yenidən yoxla.', "Email sign-in isn't switched on in Firebase yet.": 'E-poçtla giriş Firebase-də hələ aktiv deyil.',
  "That didn't work. Try again.": 'Alınmadı. Yenidən yoxla.', 'Type your email.': 'E-poçtunu yaz.',
  'If that email has an account, a reset link is on its way. Check spam too.': 'Bu e-poçtla hesab varsa, sıfırlama linki göndərildi. Spam qovluğunu da yoxla.',
  'Sign-in failed. Try again.': 'Giriş alınmadı. Yenidən yoxla.', 'Pick a name first.': 'Əvvəlcə ad seç.',
  'You are in. Claim your first {n} coins.': 'Oyundasan. İlk {n} sikkəni götür.', 'Already claimed today. Come back tomorrow.': 'Bu gün artıq götürmüsən. Sabah gəl.',
  'Could not save that. Check your connection and try again.': 'Yadda saxlamaq alınmadı. İnterneti yoxla və yenidən cəhd et.',
  'Join the game first.': 'Əvvəlcə oyuna qoşul.', 'Sign in to bet live.': 'Canlı mərc üçün daxil ol.',
  // slip
  'Bet slip': 'Kupon', 'Clear': 'Təmizlə', 'Odds': 'Əmsal', '{n}-pick multi odds': '{n} seçimli ekspress əmsalı', 'Stake': 'Məbləğ',
  'All in': 'Hamısı', 'Returns': 'Qazanc', 'Place bet': 'Mərc et', 'Placing…': 'Göndərilir…', 'Join the game to bet': 'Mərc üçün oyuna qoşul',
  'Tap prices to add picks. Picks from different matches make a multi-bet: the odds multiply, and every pick has to win.': 'Seçim əlavə etmək üçün əmsala toxun. Fərqli oyunlardan seçimlər ekspress olur: əmsallar vurulur və hər seçim qalib gəlməlidir.',
  'closed, remove it': 'bağlanıb, sil', 'Match no longer listed, remove it': 'Oyun artıq siyahıda yoxdur, sil', 'LIVE': 'CANLI',
  'match over, remove it': 'oyun bitib, sil', 'suspended right now': 'hazırda dayandırılıb', 'waiting for live data': 'canlı məlumat gözlənilir', 'market closed': 'bazar bağlıdır',
  'Live match ended': 'Canlı oyun bitdi', 'coins': 'sikkə',
  'Swapped your pick for this match. One pick per match.': 'Bu oyun üçün seçimin dəyişdirildi. Hər oyuna bir seçim.',
  'Max {n} picks. Even we have limits.': 'Ən çox {n} seçim. Bizim də limitimiz var.',
  'Remove the picks that are closed first.': 'Əvvəlcə bağlanmış seçimləri sil.', 'Enter a stake of at least 1 coin.': 'Ən azı 1 sikkə məbləğ yaz.',
  'You only have {n} coins.': 'Cəmi {n} sikkən var.', 'Place this bet?': 'Bu mərci təsdiqləyirsən?', 'Place this live bet?': 'Bu canlı mərci təsdiqləyirsən?',
  'Place this {n}-pick multi-bet?': 'Bu {n} seçimli ekspressi təsdiqləyirsən?', 'Returns if it wins': 'Qalib gəlsə qazanc',
  "Every pick has to win. One miss and it's gone.": 'Hər seçim qalib gəlməlidir. Biri səhv olsa, hamısı gedir.',
  'Live odds move fast. If a goal goes in within 2 minutes of your bet, it is refunded.': 'Canlı əmsallar tez dəyişir. Mərcindən sonra 2 dəqiqə ərzində qol olsa, mərc qaytarılır.',
  'Betting on this match is paused right now. Try again in a moment.': 'Bu oyuna mərclər hazırda dayandırılıb. Bir azdan yenidən yoxla.',
  'A pick just closed. Check your slip.': 'Bir seçim indicə bağlandı. Kuponunu yoxla.', 'Odds moved to {o}. Check and confirm again.': 'Əmsal {o} oldu. Yoxla və yenidən təsdiqlə.',
  'Live bet not accepted: the odds just moved or betting paused. Try again.': 'Canlı mərc qəbul olunmadı: əmsal dəyişdi və ya mərclər dayandı. Yenidən yoxla.',
  'Bet not accepted. A price may have just changed or a match kicked off. Check your slip and try again.': 'Mərc qəbul olunmadı. Əmsal dəyişmiş və ya oyun başlamış ola bilər. Kuponu yoxla və yenidən cəhd et.',
  // results popup
  'You won {n} coins': '{n} sikkə qazandın', 'You lost {n} coins': '{n} sikkə uduzdun', 'Net {n} coins': 'Yekun {n} sikkə', 'Refunded': 'Qaytarıldı',
  '{n}-pick multi': '{n} seçimli ekspress', 'refunded': 'qaytarıldı',
  // live
  'Live betting closed for the last minutes.': 'Son dəqiqələrdə canlı mərclər bağlıdır.', 'Waiting for live data…': 'Canlı məlumat gözlənilir…',
  'Something happened. Betting paused for a moment.': 'Nəsə baş verdi. Mərclər bir anlıq dayandırılıb.',
  'No match is live right now.': 'Hazırda canlı oyun yoxdur.', 'Next kickoff: {m}, {w}.': 'Növbəti oyun: {m}, {w}.',
  'Live matches show up here with live odds, next goal and more.': 'Canlı oyunlar burada canlı əmsallar, növbəti qol və digər bazarlarla görünür.',
  'HT': 'FS', 'FT': 'Bitdi', 'Info': 'Məlumat', 'Goal!': 'Qol!', 'o.g.': 'öz qapısına', 'pen': 'pen', 'Live odds for this match are not open yet.': 'Bu oyun üçün canlı əmsallar hələ açılmayıb.',
  // my bets
  'Waiting': 'Gözləyir', 'Won': 'Qazandı', 'Lost': 'Uduzdu', 'All': 'Hamısı', 'Record': 'Nəticə', 'Win rate': 'Qələbə faizi', 'Profit': 'Mənfəət',
  'Profit (shown)': 'Mənfəət (göstərilən)', 'Biggest win': 'Ən böyük qələbə', 'to win': 'qazanc', 'paid': 'ödənildi', 'lost': 'uduzuldu',
  'staked {n}': 'məbləğ {n}', 'Load older bets': 'Köhnə mərcləri yüklə', 'Join the game, claim your coins, then tap a price next to a match.': 'Oyuna qoşul, sikkələrini götür, sonra oyunun yanındakı əmsala toxun.',
  'No bets yet. Tap prices on the Sports tab to fill your bet slip.': 'Hələ mərc yoxdur. Kuponu doldurmaq üçün İdman bölməsində əmsallara toxun.',
  'playing': 'oynanılır',
  // table
  'Everyone who joins shows up here, ranked by coins.': 'Qoşulan hər kəs burada sikkəyə görə sıralanır.', 'W–L': 'Q–M', 'In play': 'Oyunda',
  'Coins': 'Sikkə', 'broke': 'müflis', '(you)': '(sən)', 'Nobody has placed a bet yet.': 'Hələ heç kim mərc etməyib.',
  '{name} · {n} on {what}': '{name} · {n} sikkə: {what}', 'a {n}-pick multi': '{n} seçimli ekspress',
  // footer
  'FOOTER': '1 = ev sahibi qalib, X = heç-heçə, 2 = qonaq qalib. Fərqli oyunlardan əmsallara toxunaraq ekspress yığ (6 seçimə qədər): hər seçim qalib gəlməlidir, əmsallar vurulur. Klub əmsalları ESPN vasitəsilə DraftKings-dəndir; bukmeker əmsalı olmayan millilər üçün əmsallar World Football Elo reytinqindəndir. Qolçu bazarları mövsüm statistikasına əsaslanır. Sikkələrin dəyəri yoxdur, alına, satıla və ya nağdlaşdırıla bilməz.',
  // league groups and generic league names
  'Top leagues': 'Top liqalar', 'European cups': 'Avrokuboklar', 'National teams': 'Millilər', 'More Europe': 'Digər Avropa', 'Domestic cups': 'Ölkə kubokları', 'Rest of the world': 'Dünyanın qalanı', 'Other': 'Digər',
  'International friendlies': 'Yoldaşlıq oyunları', 'World Cup': 'Dünya çempionatı', 'European Championship': 'Avropa çempionatı', 'Nations League': 'Millətlər Liqası',
  'World Cup qualifiers: Europe': 'DÇ seçmə: Avropa', 'Euro qualifiers': 'AÇ seçmə', 'World Cup qualifiers: South America': 'DÇ seçmə: Cənubi Amerika',
  'World Cup qualifiers: Africa': 'DÇ seçmə: Afrika', 'World Cup qualifiers: Asia': 'DÇ seçmə: Asiya', 'World Cup qualifiers: CONCACAF': 'DÇ seçmə: KONKAKAF',
  'Africa Cup of Nations': 'Afrika Millətlər Kuboku', 'Asian Cup': 'Asiya Kuboku', 'Champions League': 'Çempionlar Liqası', 'Europa League': 'Avropa Liqası', 'Conference League': 'Konfrans Liqası',
  // market group names
  'Double chance': 'İkiqat şans', 'Draw no bet': 'Heç-heçədə geri qaytarma', 'Total goals': 'Ümumi qollar', 'Both teams to score': 'Hər iki komanda qol vurar',
  'Result and total goals': 'Nəticə və ümumi qollar', 'Result and both teams to score': 'Nəticə və hər iki komanda qol vurar', 'Win to nil': 'Quru hesabla qələbə',
  'Winning margin': 'Qalibiyyət fərqi', 'Exact number of goals': 'Dəqiq qol sayı', 'Odd or even goals': 'Qol sayı: tək/cüt', 'Correct score': 'Dəqiq hesab',
  'Half-time result': 'Birinci hissənin nəticəsi', 'Half-time / full-time': 'Fasilə / oyunun sonu', '1st half goals': '1-ci hissənin qolları', '2nd half goals': '2-ci hissənin qolları',
  'Highest scoring half': 'Daha çox qol vurulan hissə', 'Match result': 'Oyunun nəticəsi', 'Next goal': 'Növbəti qol',
  'Anytime goalscorer': 'Qol vuracaq oyunçu', 'First goalscorer': 'İlk qolu vuracaq oyunçu',
};

export function t(s, v) {
  let out = (L === 'az' && AZ[s]) || s;
  if (v) for (const k of Object.keys(v)) out = out.split('{' + k + '}').join(v[k]);
  return out;
}

// Market group names, some of which contain a team name.
export function mk(name, home, away) {
  if (name === home + ' goals' || name === away + ' goals') return L === 'az' ? name.slice(0, -6) + ' qolları' : name;
  const h = /^Handicap: (.*) ([+-]\d)$/.exec(name);
  if (h) return (L === 'az' ? 'Fora: ' : 'Handicap: ') + h[1] + ' ' + h[2];
  return t(name);
}

// Short button labels: "Over 2.5", "Yes", "1 by 2", "1 + Over 2.5"...
export function short(s) {
  if (L !== 'az') return s;
  return s.replace(/\bOver\b/g, 'Çox').replace(/\bUnder\b/g, 'Az').replace(/\bYes\b/g, 'Bəli').replace(/\bNo more goals\b/g, 'Qol olmayacaq')
    .replace(/^No$/, 'Xeyr').replace(/\+ No$/, '+ Xeyr').replace(/^Draw$/, 'Heç-heçə').replace(/^Odd$/, 'Tək').replace(/^Even$/, 'Cüt').replace(/^Other$/, 'Digər')
    .replace(/^1st$/, '1-ci').replace(/^2nd$/, '2-ci').replace(/^Equal$/, 'Bərabər').replace(/ by (\d\+?)$/, ' ($1 fərq)');
}

const AZL = {
  draw: 'Heç-heçə', or: 'və ya', and: 'və', dnb: '(heç-heçədə qaytarılır)', over: 'Çox', under: 'Az', goals: 'qol', btts: 'Hər iki komanda qol vurar', bttsNo: 'Hər iki komanda qol vurmaz',
  hc: 'fora', hcDraw: 'Fora heç-heçə', nil: 'quru hesabla qalib', by: 'qol fərqlə qalib', marginDraw: 'Qalibiyyət fərqi: heç-heçə', exactly: 'Oyunda düz {n} qol', fivePlus: 'Oyunda 5 və daha çox qol',
  odd: 'Tək sayda qol', even: 'Cüt sayda qol', cs: 'Dəqiq hesab', csOther: 'Digər hesab', ht: 'Birinci hissə: {r}', htft: '1-ci hissə {a}, oyunun sonu {b}',
  h1: '1-ci hissə', h2: '2-ci hissə', hsh1: '1-ci hissədə daha çox qol', hsh2: '2-ci hissədə daha çox qol', hshE: 'Hər iki hissədə bərabər qol',
  sc: '{p} qol vurar', fg: '{p} ilk qolu vurar', ng: 'Növbəti qol: {t}', ngN: 'Daha qol olmayacaq', live: ' (canlı)',
};
const ENL = {
  draw: 'Draw', or: 'or', and: 'and', dnb: '(draw no bet)', over: 'Over', under: 'Under', goals: 'goals', btts: 'Both teams to score', bttsNo: 'Both teams to score: no',
  hc: 'handicap', hcDraw: 'Handicap draw', nil: 'to win to nil', by: 'to win by', marginDraw: 'Winning margin: draw', exactly: 'Exactly {n} goals in the match', fivePlus: '5 or more goals in the match',
  odd: 'Odd number of goals', even: 'Even number of goals', cs: 'Correct score', csOther: 'Any other score', ht: '{r} at half-time', htft: '{a} at half-time, {b} at full-time',
  h1: '1st half', h2: '2nd half', hsh1: 'More goals in the 1st half', hsh2: 'More goals in the 2nd half', hshE: 'Same number of goals in both halves',
  sc: '{p} to score', fg: '{p} to score first', ng: 'Next goal: {t}', ngN: 'No more goals', live: ' (live)',
};

// Long label for any selection key, in the current language.
export function label(k, home, away, pl) {
  const W = L === 'az' ? AZL : ENL, f = (s, v) => Object.keys(v).reduce((o, x) => o.split('{' + x + '}').join(v[x]), s);
  const live = k.startsWith('lv:'), p = (live ? k.slice(3) : k).split(':');
  const R = (x) => (x === 'h' ? home : x === 'a' ? away : W.draw);
  const ou = (n, side) => (L === 'az' ? (side === 'o' ? W.over : W.under) + ' ' + n + ' ' + W.goals : (side === 'o' ? W.over : W.under) + ' ' + n + ' ' + W.goals);
  let s;
  switch (p[0]) {
    case '1x2': s = R(p[1]); break;
    case 'dc': s = p[1] === '1x' ? home + ' ' + W.or + ' ' + W.draw.toLowerCase() : p[1] === '12' ? home + ' ' + W.or + ' ' + away : W.draw + ' ' + W.or + ' ' + away; break;
    case 'dnb': s = R(p[1]) + ' ' + W.dnb; break;
    case 'ou': s = ou(p[1], p[2]); break;
    case 'btts': s = p[1] === 'y' ? W.btts : W.bttsNo; break;
    case 'tth': case 'tta': s = (p[0] === 'tth' ? home : away) + ': ' + ou(p[1], p[2]); break;
    case 'hc': { const n = +p[1], hs = (n > 0 ? '+' : '') + n, as = (n > 0 ? '' : '+') + -n;
      s = p[2] === 'h' ? home + ' ' + hs + ' ' + W.hc : p[2] === 'a' ? away + ' ' + as + ' ' + W.hc : W.hcDraw + ' (' + home + ' ' + hs + ')'; break; }
    case 'rou': s = R(p[1]) + ' ' + W.and + ' ' + ou('2.5', p[2]).toLowerCase(); break;
    case 'rbt': s = R(p[1]) + ' ' + W.and + ' ' + (p[2] === 'y' ? W.btts : W.bttsNo).toLowerCase(); break;
    case 'wtn': s = R(p[1]) + ' ' + W.nil; break;
    case 'mg': s = p[1] === 'd' ? W.marginDraw : R(p[1][0]) + ' ' + (L === 'az' ? p[1].slice(1) + ' ' + W.by : W.by + ' ' + (p[1].slice(1) === '3+' ? '3 or more' : p[1].slice(1))); break;
    case 'tg': s = p[1] === '5+' ? W.fivePlus : f(W.exactly, { n: p[1] }); break;
    case 'oe': s = p[1] === 'o' ? W.odd : W.even; break;
    case 'cs': s = p[1] === 'other' ? W.csOther : W.cs + ' ' + p[1]; break;
    case 'ht': s = f(W.ht, { r: R(p[1]) }); break;
    case 'htft': s = f(W.htft, { a: R(p[1][0]), b: R(p[1][1]) }); break;
    case 'h1ou': case 'h2ou': s = (p[0] === 'h1ou' ? W.h1 : W.h2) + ': ' + ou(p[1], p[2]).toLowerCase(); break;
    case 'hsh': s = p[1] === '1' ? W.hsh1 : p[1] === '2' ? W.hsh2 : W.hshE; break;
    case 'sc': case 'fg': s = f(p[0] === 'sc' ? W.sc : W.fg, { p: (pl && pl[p[1]] && pl[p[1]].n) || '?' }); break;
    case 'ng': s = p[1] === 'n' ? W.ngN : f(W.ng, { t: R(p[1]) }); break;
    default: s = k;
  }
  return s + (live ? W.live : '');
}

// The app's attitude, in both languages. {n} is a number of coins.
const SASS = {
  en: {
    win: ['You won {n} coins! Redeemable for one return ticket to February 30th.', '+{n} coins. Your bank has been notified. They laughed.', 'Congratulations! {n} coins, accepted nowhere on planet Earth.',
      "You won {n} coins. Don't quit your day job. Seriously. Don't.", 'Even a broken clock is right twice a day. Enjoy your {n} coins.', "{n} coins! Collect your prize at the counter that doesn't exist.",
      'Big win! {n} coins. Your landlord still wants real money.', 'You won {n}. The bookies will survive. Probably.', '{n} pretend coins! Tonight you dine on imaginary steak.',
      'Luck 1, skill 0. Here are your {n} coins.', "You won {n} coins. Screenshot it, it won't happen again.", 'You won {n} coins and absolutely zero respect.'],
    lose: ['You lost {n} coins. Good thing they were fake. Unlike your confidence.', '{n} coins gone. Your financial advisor has blocked your number.', 'The bookies thank you for your generous donation of {n} coins.',
      'Lost {n}. Have you tried betting on the other team? Like, always?', 'That bet aged like milk in the sun.', '{n} coins left you for someone who actually watches football.',
      'Your prediction skills: legendary. Legendarily bad.', "Lost again. At least you're consistent.", 'Bold of you to think that would work.',
      'You lost {n} coins. The good news: there is no good news.', 'Ouch. Your bet slip is now officially a bookmark.', 'Your coins have filed for divorce. You lost {n}.'],
    void: ["Match called off. Here are your {n} coins back. Even football didn't want your bet.", 'Refunded {n} coins. The universe saved you from yourself this time.'],
    claim: ['+100 coins. Your daily pity money has arrived.', 'Here are 100 coins. Try not to lose them all before lunch.', "100 free coins. The only income you'll see today.", 'Daily allowance received. Spend it irresponsibly.'],
    broke: ["You're broke. Come back tomorrow for your pity coins.", '0 coins. Impressive work, honestly.', 'Wallet empty. Have you considered a career in not betting?'],
    place: ['The bookies are already celebrating.', 'Locked in. No refunds for bad decisions.', 'Bold. Brave. Probably wrong.', "We've queued the sad music, just in case.", "Done. May the odds be ever in your favour. They won't be."],
    multi: ["A {n}-pick multi? You really enjoy losing, don't you.", '{n} picks. Bookmakers love people like you.'],
  },
  az: {
    win: ['{n} sikkə qazandın! Mükafatın: 30 fevrala gediş-dönüş bileti.', '+{n} sikkə. Bankına xəbər verdik. Güldülər.', 'Təbriklər! {n} sikkə, dünyanın heç bir yerində keçmir.',
      '{n} sikkə qazandın. İşindən çıxma. Ciddi deyirəm.', 'Xarab saat da gündə iki dəfə düz göstərir. {n} sikkən mübarək.', '{n} sikkə! Mükafatını mövcud olmayan kassadan al.',
      'Böyük qələbə! {n} sikkə. Ev sahibi yenə də real pul istəyir.', '{n} qazandın. Bukmekerlər sağ qalacaq. Yəqin ki.', '{n} xəyali sikkə! Bu axşam xəyali kabab yeyirsən.',
      'Şans 1, bacarıq 0. Al, {n} sikkən.', '{n} sikkə qazandın. Şəklini çək, bir də olmayacaq.', '{n} sikkə qazandın, hörmət isə sıfır.'],
    lose: ['{n} sikkə uduzdun. Yaxşı ki, saxtadır. Özünə inamın kimi deyil.', '{n} sikkə getdi. Maliyyə məsləhətçin nömrəni bloka atdı.', 'Bukmekerlər {n} sikkəlik səxavətli ianən üçün təşəkkür edir.',
      '{n} uduzdun. Heç o biri komandaya qoymağı yoxlamısan? Həmişə?', 'Bu mərc günün altında qalan süd kimi turşudu.', '{n} sikkən səni futbola həqiqətən baxan birinə görə tərk etdi.',
      'Proqnoz bacarığın əfsanəvidir. Əfsanəvi dərəcədə pis.', 'Yenə uduzdun. Heç olmasa ardıcılsan.', 'Bunun alınacağını düşünmək cəsarət idi.',
      '{n} sikkə uduzdun. Yaxşı xəbər: yaxşı xəbər yoxdur.', 'Ah. Kuponun artıq rəsmi olaraq əlfəcindir.', 'Sikkələrin boşanma ərizəsi verdi. {n} uduzdun.'],
    void: ['Oyun ləğv olundu. {n} sikkən geri qayıtdı. Futbol belə sənin mərcini istəmədi.', '{n} sikkə qaytarıldı. Kainat bu dəfə səni özündən xilas etdi.'],
    claim: ['+100 sikkə. Gündəlik təsəlli pulun gəldi.', 'Al, 100 sikkə. Naharadək hamısını uduzmamağa çalış.', '100 pulsuz sikkə. Bu gün görəcəyin yeganə gəlir.', 'Gündəlik xərclik gəldi. Məsuliyyətsizcəsinə xərclə.'],
    broke: ['Müflis oldun. Təsəlli sikkələri üçün sabah gəl.', '0 sikkə. Təsirli işdir, düzü.', 'Pulqabı boşdur. Heç mərc etməmək haqda düşünmüsən?'],
    place: ['Bukmekerlər artıq bayram edir.', 'Təsdiqləndi. Pis qərarlar geri qaytarılmır.', 'Cəsarətli. Qəhrəmancasına. Yəqin ki, səhv.', 'Hər ehtimala qarşı kədərli musiqini hazırladıq.', 'Hazırdır. Qoy şans səninlə olsun. Olmayacaq.'],
    multi: ['{n} seçimli ekspress? Uduzmağı həqiqətən sevirsən.', '{n} seçim. Bukmekerlər səndən xoşlanır.'],
  },
};
const pick = (list, n) => list[Math.floor(Math.random() * list.length)].split('{n}').join(n);
export const sass = {
  win: (n) => pick(SASS[L].win, n), lose: (n) => pick(SASS[L].lose, n), void: (n) => pick(SASS[L].void, n),
  claim: () => pick(SASS[L].claim, ''), broke: () => pick(SASS[L].broke, ''),
  place: (legs) => (legs >= 4 ? pick(SASS[L].multi, legs) : pick(SASS[L].place, '')),
};
