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
  espn.js          scores of matches in play, polled from ESPN
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
2. **Build > Authentication > Get started > Sign-in method**: enable **Google**,
   then **Add new provider > Email/Password** and enable it too, so friends
   without a Google account can sign up with any email.
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
the `firebase-adminsdk-…` service account (or **Grant access** and paste its
email) and add the roles **Service Usage Consumer**, **Cloud Datastore Index
Admin**, **Firebase Rules Admin** and **Firebase Hosting Admin**. The Deploy
log's "Check permissions" step names the account and what is missing.

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
- **Daily coins** reset at 00:00 on each player's own phone clock. The app
  stores the player's UTC offset and keeps it up to date (travel, summer
  time); the rules make sure a time zone change never allows a second claim
  on the same day. Players who joined before this default to UTC+4.

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

About 45 competitions are loaded, grouped in the league picker: the top five
leagues plus Turkey's Süper Lig, the three European cups, national-team
tournaments (World Cup, Euros, Nations League, qualifiers, friendlies, Copa
América, AFCON, Asian Cup), more European leagues, domestic cups, and MLS,
Brazil, Argentina, Mexico, Saudi Arabia and the Libertadores. Competitions
with no games in the next week simply don't show up.

The list lives in `public/leagues.js`. To add a competition, find its slug in
an ESPN URL such as `espn.com/soccer/league/_/name/tur.1` and add a row.

- **Club odds** are DraftKings prices from ESPN's scoreboard feed.
- **National-team odds**: ESPN often has no bookmaker price for these, so the
  app calculates them from [World Football Elo ratings](https://www.eloratings.net)
  (home advantage included). Those matches carry an "Elo odds" tag.

ESPN's feed and eloratings.net are free and need no key, but neither is an
official API, so they could change. If that happens the sync job fails
loudly in the Actions tab, and only `scripts/sync.mjs` needs updating.

## Markets, languages, favourites

- **Per match** (tap `+N` on a row): Main (double chance, draw no bet, total
  goals, both teams to score), **Players** (anytime and first goalscorer),
  Goals, **Halves** (half-time result, half-time/full-time, goals per half,
  highest scoring half) and Score (correct score, winning margin, handicaps).
- **Goalscorer prices** come from each squad's season stats on ESPN (goals,
  appearances, position, injuries), cached a day in `teams/`, shared out of the
  team's expected goals. A player who doesn't play is refunded. Club
  competitions only.
- Half and goalscorer markets settle from the goal timeline ESPN publishes;
  if that timeline doesn't add up, those picks are refunded.
- **English / Azerbaijani**: the EN/AZ switch in the top bar. Strings live in
  `public/i18n.js` (keyed by the English text), including the roasts.
- **Favourite teams**: up to 5, from the account menu or the stars in a
  match's markets. Their matches show first in Sports, and the
  league picker gets a "Your teams" option.
- Team logos and national flags come from ESPN.

## Live scores

Matches being played show the score and a running clock on the Sports page
(under "Show live and recent results") and in My bets. The browser fetches
them straight from ESPN, every 15 seconds on My bets and every 45 seconds
elsewhere. There is no live betting: betting on a match closes at kickoff.

## Multi-bets

Tap prices on different matches to fill the bet slip (side panel on a
computer, the green bar at the bottom on a phone). One pick makes a single;
2 to 6 picks make a multi-bet: the odds multiply and every pick has to win.
A lost pick settles the whole bet as lost right away; a called-off match
counts as odds 1. There is always a confirmation before a bet is placed.
Six is the limit because the security rules check every pick, and Firestore
caps how much work one rule check can do.

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

- Push notifications to phones when bets settle (Firebase Cloud Messaging;
  needs a Web Push key from the Firebase console).
- Private leagues: a `groups` collection and a join code.
- Weekly or monthly seasons with a reset and a champion.
- App Store / Play Store versions with Capacitor. Not needed to use it on a
  phone, and simulated-gambling apps get extra scrutiny in store review.
