# HYDRAX — Sports Intelligence by JD

Personal sports research terminal with black and neon-white theme. **No automatic betting.**

## Apps
- Home: https://juandiegoiscreating.github.io/hydrax-live/
- Intelligence: https://juandiegoiscreating.github.io/hydrax-live/hydrax-quantum-final.html
- Bet Tracker: https://juandiegoiscreating.github.io/hydrax-live/tracker.html

Intelligence is passwordless; Supabase secrets stay server-side. The bet registry is authenticated and user-specific.

## Release status — HYDRAX v13 (2026-11-19)
- **Backend:** Supabase Edge Function deployment revision 14, model cache schema v13, with current-market quote validation before returning any ranked selections. Snapshots are never silently promoted to fresh picks.
- **Quotes:** prices older than 30 minutes, future-dated beyond two minutes, from earlier dates, or for started events are filtered when a response is delivered; the daily free-provider request quota may produce an empty valid response.
- **ESPN schedule parser:** recognizes completion at competition or event status; handles Los Angeles / LA alias variants. These are correctness fixes, not evidence of predictive accuracy.
- **Tracker:** auto-configures the current Supabase public client key on a fresh browser, retains login for private data, uses black/white neon UI and tracks simulated free capital from configured starting capital (default $400), net settled profit and stakes pending. A tracking unit defaults to $25. Capital settings are stored **per browser** and are not sportsbook account balances.
- **Verification:** GitHub Actions checks the front-end JavaScript, tracker module, stale-quote invariants, backtest script syntax, GET API health, an NBA research POST, and deterministic Edge Function self-tests. An eight-sport one-time smoke exercised all sport endpoints; a zero-event response is not evidence that a sport is permanently unavailable.
- **Limitations:** full source coverage, holdout calibration, injury/lineup status, point-in-time sportsbook history and historical EV/ROI are not verified. Model indicators remain **NOT VALIDATED**; no direct betting automation.

## Sport-by-sport model readiness
- NBA and NCAAB: experimental recent score-margin probability simulations. No confirmed injuries/lineups.
- NFL and NCAAF: experimental score-margin simulations using separate football variance assumptions; uncalibrated.
- MLB: experimental form model; lacks starting pitcher, bullpen and lineup factors.
- ATP and WTA: 2026 season results Elo research from an attributed public, noncommercial match archive. No verified surface, fitness or serve/return adjustments.
- UFC: fight-card matching when ESPN data is accessible. No calibrated independent fighter predictions yet.
- All eight tabs provide ranked market options when events and sufficiently recent odds exist. Zero options are possible without matches or usable quotes.

**Production confidence remains NOT VALIDATED.** Ten-thousand Monte Carlo draws are sampling, NOT statistical validation. Up to five ranked options per sport are displayed based on market pricing and possible payout, with an optional experimental statistical signal. Bookmakers below -400 are filtered. This is not validated positive EV. Automatic betting is disabled.

## Reproducible backtest research

Run with Node 22+:
HYDRAX_SPORT=NBA node scripts/hydrax-backtest.mjs

The script attempts public ESPN daily historical completed-scoreboard lookups, derives each prediction ONLY from earlier results, then computes Brier score, a 50/50 baseline and calibration bins. If the source fails or sample is inadequate, it declares unavailable or insufficient sample. It cannot validate historical betting ROI or EV without point-in-time historical sportsbook lines and does not prove model reliability.

## Data sources
- Odds: https://the-odds-api.com (server-side only; cached per sport; quotes may move).
- Team results / UFC cards: https://www.espn.com public unofficial JSON endpoints (may be unavailable).
- Tennis data: https://github.com/Aneeshers/tennis-sackmann-archive based on Jeff Sackmann tennis archive, CC BY-NC-SA 4.0. Attribute and respect noncommercial/share-alike usage.

Injuries and starting lineups remain unverified; a provider response is not a verified injury adjustment. All picks remain experimental until independent validation. Manual review before any wager remains essential.

## Code map
- index.html: home.
- hydrax-quantum-final.html: research UI.
- tracker.html: authenticated bet ledger; keep its existing RLS.
- supabase/functions/hydrax-public-intelligence/index.ts: server logic.
- scripts/hydrax-backtest.mjs: retrospective evaluation script.
- .github/workflows/hydrax-quality.yml: frontend syntax and public API smoke.

### Release criteria still unfulfilled
Required for validated betting suggestions: historical pre-match odds and point-in-time statistics; verified starting lineups and injury statuses; stable source coverage; independent model holdout test with sufficient sample, appropriate calibration and uncertainty; truthful EV ranking with capital safety guardrails. Do not present unvalidated picks as validated opportunities.

## HYDRAX ranked-play preferences (2026-11-18)
- Show up to five ranked selections per sport when fresh bookmaker prices and games are available.
- Favor moneylines priced **-400 or longer** (do not include -401, -450, etc.). No artificial upper limit on positive underdog prices; extreme longshots show very high loss risk.
- The user wants choices to wager on. HYDRAX does not invent games, odds or validated probabilities and never claims guaranteed wins.
- Show possible profit and total return for a tracking unit of $25; this is an illustration, not a staking instruction.
- Ranking is market-driven, optionally adjusted by an explicitly unvalidated statistical model. Unverified EV, data freshness and number of cross-book references must remain visible.
- If the selected sport has no current market opportunities, show the actual limitation rather than fabricate a bet; suggest other sports.
- Bet registration and execution remain strictly manual; user consent is required for any bet-tracker mutation and HYDRAX does not place wagers.
