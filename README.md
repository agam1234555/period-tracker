# Cycle (period tracker PWA)

React + TypeScript + Vite, `vite-plugin-pwa`, IndexedDB via Dexie. All data stays on the device.

## Run
    npm install
    npm test          # 109 tests: TS engine vs Python reference, blend, forecast glue
    npm run dev       # http://localhost:5173
    npm run build     # production build + service worker (dist/)
    npm run preview   # test the installable PWA build locally

## Layout
- `src/engine/analyze.ts`  prediction engine (pure TS). Port of Phase 1 `analyze()`.
- `src/engine/analyze.test.ts` golden tests + pinned Phase 1 behaviour.
- `src/engine/__fixtures__/golden.json` generated from the Python reference.
- `python/analyze.py` the Python reference engine (single source for backtests).
- `scripts/make_golden.py` regenerates fixtures: `npm run golden` (needs Python 3).
- `src/engine/blend.ts` weighting of cycle-length vs ovulation prediction + range rule (settings in `DEFAULT_CONFIG`). Python reference: `python/blend_ref.py`; fixtures `__fixtures__/blend_fixtures.json`.
- `src/engine/forecast.ts` glue the UI calls: `forecast(days, today)`. Rebuilds the per-user error track from the logs on every call (replay), so edits/undo can never leave stale state.
- `src/db.ts` Dexie storage: `loadDays()`, `saveDay()`.
- `src/App.tsx` + `src/ui/` real UI: forecast card, month calendar (period / predicted / fertile / ovulation), day editor (period, flow, LH, basal temp), undo.
- `research/` Phase 1 backtest script and results workbook (evidence behind the engine constants).

## Status
Stage 1 done: forecast, calendar, period/flow/LH/temperature logging, undo, offline install.
Stage 2 (not built): symptom + mood logging, insights, backup/restore + reminder, LH as a third predictor in the blend.

## Changing the engine (rule)
1. Edit `python/analyze.py` and `src/engine/analyze.ts` together.
2. `npm run golden`, then `npm test`. Any failing case = the two copies disagree.
3. Rerun the Colab backtest (`phase1_all_in_one.py`) if the change affects predictions.

## Deploy
- Cloudflare Pages: build command `npm run build`, output `dist`.
- GitHub Pages: build with `BASE_PATH=/your-repo-name/ npm run build`.

## Engine inputs to remember
`analyze()` returns `lenPred`, `lenHw`, `ovPred` (days since last start). When ovulation is confirmed, `proj[0]` is the
OVULATION forecast, so never feed `proj[0]` into the blend as the cycle-length prediction; use `lenPred`/`lenHw`.
