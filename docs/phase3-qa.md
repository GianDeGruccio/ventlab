# Browser verification

The Playwright journeys exercise the built application under the GitHub Pages project prefix `/ventlab/`. Run them from the repository root after a production build. The default route fixture serves only files present in `web/dist/` and rejects requests outside the project. A desktop viewport is 1440 × 1000 and a narrow viewport is 390 × 844, each at device scale factor 1.

```sh
(cd web && npm ci && npm run build)
python -m pip install playwright==1.62.0
python -m playwright install --with-deps chromium firefox webkit
python scripts/browser_smoke.py --engines chromium firefox webkit \
  --axe-script web/node_modules/axe-core/axe.min.js \
  --report /tmp/ventlab-qa.json --screenshots /tmp/ventlab-screens
```

Without `--engines`, the check uses Chromium. `--chromium /path/to/chromium` selects an installed system Chromium. `--url https://giandegruccio.github.io/ventlab/` exercises the live origin and loads its assets over the network. Use `--phase2` only to compare the original four Phase 2 workflows on a corresponding build. A successful Phase 3 run also requires the ensemble worker, guide and comparisons. The process exits nonzero for launch failures, broken assertions, browser errors, HTTP failures or axe violations. The optional report records individual timings, accessibility rules requiring further review and any errors.

## Scope

Each run checks the first Tab stop and skip-to-main focus, keyboard traversal of workspace links, parameter adjustment, reset, series visibility, arrow-key chart inspection, the guided equilibrium example, shared map coordinate and residual-scale readouts, both planning modes, the feasible choices under time and resource constraints, and a paired rerun. It also checks blind inference before revealing airflow, suppressed comparisons, occupied-window abstention, selection resets, local CSV import through a fitted and scored window, the complete archive ledger, and refresh on a hash route.

The axe scan covers WCAG 2 and 2.1 Level A/AA automated rules at six states: initial Designer, guided paired comparison, constrained robust ranking, blind reference reveal, CSV mapping, and Methods with an open archive ledger. Keyboard and layout checks supplement the scans. Narrow viewports are browser emulations. Physical devices, assistive technology with human users, Safari itself, and user studies remain untested.

Navigation timing samples come from fresh browser contexts on the same managed Linux host without explicit CPU or bandwidth throttling. The fixture resolves files from disk and routes them through Playwright. FCP is the browser's first contentful paint. The observed default-planner time includes Playwright waiting for the document, plot, fonts, and strategy control; simulation time includes the automated click and display assertion. Single observations describe this run and do not predict field latency or percentiles.

## Review results

The [PR verification run](https://github.com/GianDeGruccio/ventlab/actions/runs/45581058649) passed 19 Python tests, 49 TypeScript tests and the production build. It served the built assets under the project prefix and exercised the complete journeys in each cell below. Every cell completed six axe scans. The checks reported zero violations, page errors, console errors or missing fixture assets.

| Browser engine on Linux | 1440 × 1000 | 390 × 844 |
|---|---|---|
| Chromium 151.0.7922.34 | Passed | Passed |
| Firefox 153.0 | Passed | Passed |
| WebKit 26.5 | Passed | Passed |

On the local review host, single observations on desktop and narrow Chromium and WebKit ranged from 0.67–2.62 s to the first usable strategy control and 87–267 ms from applying a rate change to observing the updated simulation. These observations include browser and test-driver work. The [stress study](stress-protocol.md#computational-cost) separately reports planner-only timings. Axe left some color-contrast checks for manual review. A human screen-reader evaluation and physical-device testing remain open.

## Screenshots

| Workflow | Desktop | Narrow viewport |
|---|---|---|
| Designer entry and two competing fits | [Desktop designer](screenshots/phase3/designer-1440.png) | [Mobile designer](screenshots/phase3/designer-390.png) |
| Guided empty-room comparison | [Paired trajectories](screenshots/phase3/comparison-1440.png) | [Paired trajectories](screenshots/phase3/comparison-390.png) |
| One parameter pair across two experiments | [Linked residual maps](screenshots/phase3/paired-maps-1440.png) | [Linked residual maps](screenshots/phase3/paired-maps-390.png) |
| Stress evidence in Methods | [Policy comparison](screenshots/phase3/evidence-1440.png) | [Policy comparison](screenshots/phase3/evidence-390.png) |
| Blind analysis and mechanical reference | [Retrospective measurement](screenshots/phase3/validation-1440.png) | [Retrospective measurement](screenshots/phase3/validation-390.png) |
