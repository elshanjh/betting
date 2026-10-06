# Friendly Stakes

Bet on real football fixtures with pretend coins. Everyone claims 100 free
coins a day, bets on real matches at real bookmaker odds, and climbs the
table. Coins can't be bought or cashed out.

It's a web app that installs on a phone like a normal app ("Add to Home
Screen"). It runs entirely on free tiers:

| Piece | What it does | Cost |
|---|---|---|
| **Firebase Hosting** | serves the app at `https://<project>.web.app` | free |
| **Firebase Auth** | Google sign-in, one account per person | free |
| **Cloud Firestore** | players, bets, fixtures, live leaderboard | free (Spark plan) |
| **ESPN scoreboard feed** | real fixtures, DraftKings odds, final scores | free, no key |
| **GitHub Actions** | every hour: load odds, fetch results, pay out winners | free |

No Cloud Functions are used, so you never need the paid Blaze plan.

```
public/            the app (no build step)
  app.js           UI + Firestore reads/writes
  markets.js       odds model + settlement rules (shared with the sync job)
  config.js        your Firebase config goes here
scripts/sync.mjs   odds + results + settlement (runs in GitHub Actions)
firestore.rules    anti-cheat: players can't give themselves coins
test/              rule tests + sync tests (npm test)
```

## Setup (about 20 minutes)

### 1. Firebase project (in the browser)

1. Go to <https://console.firebase.google.com>, **Create a project**. You can
   turn Google Analytics off.
2. **Build > Authentication > Get started > Sign-in method > Google > Enable.**
3. **Build > Firestore Database > Create database.** Pick a location near you
   (for example `eur3` for Europe) and start in **production mode**.

### 2. Connect GitHub to Firebase

1. In Firebase: **Project settings > Service accounts > Generate new private
   key**. A JSON file downloads. **Never commit this file**; it can do
   anything to your project.
2. In GitHub: **repo Settings > Secrets and variables > Actions > New
   repository secret**, name it `FIREBASE_SERVICE_ACCOUNT` and paste the whole
   content of the JSON file.

### 3. Deploy and load matches (in GitHub, no computer needed)

1. **Actions tab > Deploy > Run workflow.** It fills in the web config,
   uploads the app, the security rules and the database index, and prints the
   link: `https://<your-project-id>.web.app`. After this, every push to `main`
   deploys by itself.
2. **Actions tab > Sync odds and results > Run workflow** to load fixtures
   right away. After that it runs by itself every hour. Odds and scores come
   from ESPN's public feed, so there is no API key to get.

If Deploy fails with a permission error, open
<https://console.cloud.google.com/iam-admin/iam>, select your project, edit
the `firebase-adminsdk-…` service account and add the role **Firebase Admin**.

### 4. Invite your friends

Send them the `web.app` link. They sign in with Google, pick a name and claim
their coins. To install it like an app:

- **iPhone:** open in Safari > Share > **Add to Home Screen**
- **Android:** open in Chrome > menu > **Install app**

## How it works

- **Odds.** The 1X2 prices are DraftKings' moneyline odds as shown on ESPN,
  converted to decimal. Matches without odds yet appear once ESPN has them. The 81 extra markets (goals, both teams to score,
  correct score, handicaps…) come from a Poisson goals model fitted to those
  prices, with a 7% margin. All prices are stored on the match, so the app
  and the security rules use exactly the same numbers.
- **Betting closes at kickoff.** Odds refresh every hour until then. A bet
  keeps the price it was placed at.
- **Settlement.** Once ESPN shows the match as finished, the job
  marks the match final and pays every winning bet `stake × odds`. Draw no
  bet refunds on a draw. A match with no result 60 hours after kickoff
  and any postponed or abandoned match are refunded. Champions League
  knockout ties settle on the score after extra time.
- **Daily coins** reset at midnight UTC+4. To use another time zone change
  `DAY_OFFSET_HOURS` in `public/config.js` **and** `DAY_OFFSET_MS` in
  `firestore.rules`, then push to `main` (it deploys by itself).

### Anti-cheat

Anyone can open the browser console, so the app itself is not trusted. The
Firestore rules only let a player:

- join with 0 coins,
- add exactly 100 coins once per day,
- pay for a bet, and only in the same write that creates the bet, at the
  exact published price, before kickoff, with no more coins than they have,
- change their name.

Results and payouts are written only by the sync job. `npm test` checks all
of this against the Firestore emulator.

## Leagues and the data source

Default leagues: Premier League, La Liga, Serie A, Bundesliga, Ligue 1 and
Champions League. To change them, set `LEAGUES` in
`.github/workflows/sync.yml` to a comma list of ESPN slugs, for example
`eng.1,eng.2,tur.1,uefa.europa`. The slug is the part of an ESPN URL like
`espn.com/soccer/league/_/name/eng.1`.

ESPN's feed is free and unlimited but unofficial: it is what espn.com uses
itself, not a documented API, so ESPN could change it. If that happens the
sync job fails loudly in the Actions tab, and only `scripts/sync.mjs` needs
updating.

## Local development

```bash
npm test                                          # rule + sync tests (needs Java)
npx firebase emulators:start --only auth,firestore,hosting --project demo-stakes
# then open http://localhost:5000/?emulator
```

In emulator mode Google sign-in shows a fake account picker, and the database
starts empty. To fill it with fixtures, run the sync job against the emulator:
`FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-stakes npm run sync`.

## Ideas for later

- Push notifications when bets settle (Firebase Cloud Messaging).
- Private leagues: a `groups` collection and a join code.
- Accumulators (multi-bets).
- App Store / Play Store versions with Capacitor. Not needed to use it on a
  phone, and simulated-gambling apps get extra scrutiny in store review.
