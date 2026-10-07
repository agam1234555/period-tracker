# Cycle (period tracker PWA)

React + TypeScript + Vite, `vite-plugin-pwa`, IndexedDB via Dexie. All data stays on the device.

## Run
    npm install
    npm test          # full suite: TS engine vs Python reference, blend, forecast, UI logic
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
- `src/db.ts` Dexie storage (`loadDays`, `saveDays` in one transaction, meta values).
- `src/App.tsx` + `src/ui/` the UI: forecast card, start/end period bar, month calendar with markers, collapsible day editor (period, flow, symptoms, mood, optional temperature and LH), insights card, undo.
- `src/periodLogging.ts` start/end period logic (tap once to start, once to end; days between are filled).
- `src/symptoms.ts` fixed symptom checklist + 1-5 mood. Keys are stored in data and must never be renamed.
- `src/insights.ts` where symptoms and mood fall in the cycle (reads logs only; never feeds the forecast).
- `src/backup.ts`, `src/backupReminder.ts`, `src/persist.ts` export/restore, reminder rule, storage persistence request.
- `research/` Phase 1 backtest script and results workbook (evidence behind the engine constants).

## Status
Built: forecast, calendar, start/end period logging, flow, symptoms, mood, insights, backup/restore, offline install.
Temperature and LH are optional extras for the few people who measure them; the forecast works from period dates alone.
Not planned: LH as a third predictor (most people do not measure LH, so it would serve a small group).
Ideas for later: three-state LH field, symptom severity, a "merge tags" style cleanup if free text is ever added.

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
