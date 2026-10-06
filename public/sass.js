// The app's attitude. {n} is replaced with a number of coins.
const WIN = [
  'You won {n} coins! Redeemable for one return ticket to February 30th.',
  '+{n} coins. Your bank has been notified. They laughed.',
  'Congratulations! {n} coins, accepted nowhere on planet Earth.',
  'You won {n} coins. Don\'t quit your day job. Seriously. Don\'t.',
  'Even a broken clock is right twice a day. Enjoy your {n} coins.',
  '{n} coins! Collect your prize at the counter that doesn\'t exist.',
  'Big win! {n} coins. Your landlord still wants real money.',
  'You won {n}. The bookies will survive. Probably.',
  'Winner! {n} coins. Your mum still isn\'t impressed.',
  '{n} pretend coins! Tonight you dine on imaginary steak.',
  'Luck 1, skill 0. Here are your {n} coins.',
  'You won {n} coins. Screenshot it, it won\'t happen again.',
  '{n} coins! Your prize: a lifetime supply of nothing.',
  'You won {n} coins and absolutely zero respect.',
];
const LOSE = [
  'You lost {n} coins. Good thing they were fake. Unlike your confidence.',
  '{n} coins gone. Your financial advisor has blocked your number.',
  'The bookies thank you for your generous donation of {n} coins.',
  'Lost {n}. Have you tried betting on the other team? Like, always?',
  'That bet aged like milk in the sun.',
  '{n} coins left you for someone who actually watches football.',
  'Your prediction skills: legendary. Legendarily bad.',
  'Lost again. At least you\'re consistent.',
  '{n} coins down. Paul the Octopus is turning in his tank.',
  'Bold of you to think that would work.',
  'You lost {n} coins. The good news: there is no good news.',
  'Ouch. Your bet slip is now officially a bookmark.',
  '{n} coins? Gone. Reduced to atoms.',
  'Your coins have filed for divorce. You lost {n}.',
];
const VOID = [
  'Match called off. Here are your {n} coins back. Even football didn\'t want your bet.',
  'Refunded {n} coins. The universe saved you from yourself this time.',
];
const CLAIM = [
  '+100 coins. Your daily pity money has arrived.',
  'Here are 100 coins. Try not to lose them all before lunch.',
  '100 free coins. The only income you\'ll see today.',
  'Daily allowance received. Spend it irresponsibly.',
  '100 coins credited. Your future losses thank you.',
];
const BROKE = [
  'You\'re broke. Come back tomorrow for your pity coins.',
  '0 coins. Impressive work, honestly.',
  'Wallet empty. Have you considered a career in not betting?',
];
const PLACE = [
  'Bet placed. The bookies are already celebrating.',
  'Locked in. No refunds for bad decisions.',
  'Bold. Brave. Probably wrong.',
  'Bet placed. We\'ve queued the sad music, just in case.',
  'Done. May the odds be ever in your favour. They won\'t be.',
];
const BIG_MULTI = [
  'A {n}-pick multi? You really enjoy losing, don\'t you.',
  '{n} picks. Bookmakers love people like you.',
];

const pick = (list, n) => list[Math.floor(Math.random() * list.length)].replace(/\{n\}/g, n);

export const sass = {
  win: (n) => pick(WIN, n),
  lose: (n) => pick(LOSE, n),
  void: (n) => pick(VOID, n),
  claim: () => pick(CLAIM, ''),
  broke: () => pick(BROKE, ''),
  place: (legs) => (legs >= 4 ? pick(BIG_MULTI, legs) : pick(PLACE, '')),
};
