# Browser verification

The Playwright journeys exercise the built application under the GitHub Pages project prefix `/ventlab/`. Run them from the repository root after a production build. The default route fixture serves only files present in `web/dist/` and rejects requests outside the project. A desktop viewport is 1440 × 1000 and a narrow viewport is 390 × 844, each at device scale factor 1.

```sh
(cd web && npm ci && npm run build)
python -m pip install playwright==1.62.0
python -m playwright install --with-deps chromium firefox webkit
npm install --prefix /tmp/ventlab-a11y --no-audit --no-fund axe-core@4.11.0
python scripts/browser_smoke.py --engines chromium firefox webkit \
  --axe-script /tmp/ventlab-a11y/node_modules/axe-core/axe.min.js \
  --report /tmp/ventlab-qa.json --screenshots /tmp/ventlab-screens
```

Without `--engines`, the check uses Chromium. `--chromium /path/to/chromium` selects an installed system Chromium. `--url https://giandegruccio.github.io/ventlab/` exercises the live origin and loads its assets over the network. Use `--phase2` only to compare the original four Phase 2 workflows on a corresponding build. A successful Phase 3 run also requires the ensemble worker, guide and comparisons. The process exits nonzero for launch failures, broken assertions, browser errors, HTTP failures or axe violations. The optional report records individual timings, accessibility rules requiring further review and any errors.

## Scope

Each run checks the first Tab stop and skip-to-main focus, keyboard traversal of workspace links, parameter adjustment, reset, series visibility, arrow-key chart inspection, the guided equilibrium example, shared map coordinate and residual-scale readouts, both planning modes, the feasible choices under time and resource constraints, and a paired rerun. It also checks blind inference before revealing airflow, suppressed comparisons, occupied-window abstention, selection resets, local CSV import through a fitted and scored window, the complete archive ledger, and refresh on a hash route.

The axe scan covers WCAG 2 and 2.1 Level A/AA automated rules at six states: initial Designer, guided paired comparison, constrained robust ranking, blind reference reveal, CSV mapping, and Methods with an open archive ledger. Keyboard and layout checks supplement the scans. Narrow viewports are browser emulations. Physical devices, assistive technology with human users, Safari itself, and user studies remain untested.

Navigation timing samples come from fresh browser contexts on the same managed Linux host without explicit CPU or bandwidth throttling. The fixture resolves files from disk and routes them through Playwright. FCP is the browser's first contentful paint. The observed default-planner time includes Playwright waiting for the document, plot, fonts, and strategy control; simulation time includes the automated click and display assertion. Single observations describe this run and do not predict field latency or percentiles.
