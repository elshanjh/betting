// 1. Firebase web config. Leave the placeholders: the Deploy workflow fills
//    them in from your project. (Or paste it yourself from Firebase console >
//    Project settings > Your apps.) Not secret; the security rules protect the data.
export const firebaseConfig = {
  apiKey: 'PASTE_ME',
  authDomain: 'PASTE_ME.firebaseapp.com',
  projectId: 'PASTE_ME',
  storageBucket: 'PASTE_ME.appspot.com',
  messagingSenderId: 'PASTE_ME',
  appId: 'PASTE_ME',
};

// 2. Coins everyone can claim once per day.
//    If you change it, change the 100 in firestore.rules too.
export const DAILY_COINS = 100;

// 3. The daily claim resets at 00:00 on each player's own phone clock. This
//    offset (hours from UTC) is only used for players who joined before time
//    zones were stored. If you change it, change the 240 in firestore.rules too.
export const DAY_OFFSET_HOURS = 4;
