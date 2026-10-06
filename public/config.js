// 1. Paste your Firebase web config here (Firebase console > Project settings >
//    Your apps > Web app > SDK setup and configuration > Config).
//    These values are not secret; the security rules protect the data.
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

// 3. The hour offset from UTC at which the "day" starts for the daily claim.
//    4 = the claim resets at midnight in UTC+4 (Baku, Dubai, Tbilisi).
//    If you change it, change DAY_OFFSET_MS in firestore.rules too.
export const DAY_OFFSET_HOURS = 4;
