# HYDRAX — Sports Intelligence by JD

Personal sports research terminal with black and neon-white theme. **No automatic betting.**

## Apps
- Home: https://juandiegoiscreating.github.io/hydrax-live/
- Intelligence: https://juandiegoiscreating.github.io/hydrax-live/hydrax-quantum-final.html
- Bet Tracker: https://juandiegoiscreating.github.io/hydrax-live/tracker.html

Intelligence is passwordless; Supabase secrets stay server-side. The bet registry is authenticated and user-specific.

## Sport-by-sport model readiness
- NBA and NCAAB: experimental recent score-margin probability simulations. No confirmed injuries/lineups.
- NFL and NCAAF: experimental score-margin simulations using separate football variance assumptions; uncalibrated.
- MLB: experimental form model; lacks starting pitcher, bullpen and lineup factors.
- ATP and WTA: 2026 season results Elo research from an attributed public, noncommercial match archive. No verified surface, fitness or serve/return adjustments.
- UFC: fight-card matching when ESPN data is accessible. No calibrated independent fighter predictions yet.
- All eight tabs show matchups or reliable NO BET/source-unavailable states, not fabricated picks.

**Production confidence remains NOT VALIDATED.** Ten-thousand Monte Carlo draws are sampling, NOT statistical validation. No actionable EV/risk ranking, staking or automatic betting is enabled.

## Reproducible backtest research

Run with Node 22+:
HYDRAX_SPORT=NBA node scripts/hydrax-backtest.mjs

The script attempts public ESPN daily historical completed-scoreboard lookups, derives each prediction ONLY from earlier results, then computes Brier score, a 50/50 baseline and calibration bins. If the source fails or sample is inadequate, it declares unavailable or insufficient sample. It cannot validate historical betting ROI or EV without point-in-time historical sportsbook lines and does not prove model reliability.

## Data sources
- Odds: https://the-odds-api.com (server-side only; cached per sport; quotes may move).
- Team results / UFC cards: https://www.espn.com public unofficial JSON endpoints (may be unavailable).
- Tennis data: https://github.com/Aneeshers/tennis-sackmann-archive based on Jeff Sackmann tennis archive, CC BY-NC-SA 4.0. Attribute and respect noncommercial/share-alike usage.

Injuries and starting lineups remain unverified; a provider response is not a verified injury adjustment. All research remains NO BET until independently validated.

## Code map
- index.html: home.
- hydrax-quantum-final.html: research UI.
- tracker.html: authenticated bet ledger; keep its existing RLS.
- supabase/functions/hydrax-public-intelligence/index.ts: server logic.
- scripts/hydrax-backtest.mjs: retrospective evaluation script.
- .github/workflows/hydrax-quality.yml: frontend syntax and public API smoke.

### Release criteria still unfulfilled
Required for validated betting suggestions: historical pre-match odds and point-in-time statistics; verified starting lineups and injury statuses; stable source coverage; independent model holdout test with sufficient sample, appropriate calibration and uncertainty; truthful EV ranking with capital safety guardrails. Do not present unvalidated picks as validated opportunities.
