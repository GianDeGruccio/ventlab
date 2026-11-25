# VentLab browser application

## A first experiment

Open **Experiment designer**. The teal trace is the configured model, white points are seeded observations, and the dashed trace is an alternative fit with a different ventilation rate and total CO₂ source. Adjust a parameter and select **Run simulation**. The settings panel distinguishes edited inputs from the inputs used for the current plot. **Reset experiment** restores the original conditions and noise realization.

To see a structural ambiguity, set the supply to 420 ppm, initial concentration to 520 ppm, rate to 2 h⁻¹, occupancy to one person and generation to 200 ppm/h/person. Select measured supply and zero sensor noise. Run the simulation. Generation exactly balances removal, so distinct source/rate pairs can reproduce a flat trace. Inspect the map with the pointer or arrow keys. The alternative fit and ranking are recomputed for each applied design. [Model, cost assumptions and expected-width criterion](design-study.md)

## Blind empirical comparison

Open **Blind validation**, choose a source file and session, then select an occupancy period or adjust the inclusive start and end. The shaded interval marks the selection. Switch between CO₂ and occupancy to inspect the observations. **Run both estimators** records the physics and log-linear fits, sensor-perturbation span, flags and abstention reasons. **Reveal mechanical reference** calculates the comparison separately. Changing the selected interval clears both the fits and the revealed reference.

For contrasting examples, use the first test session. Its first zero-occupancy period contains negative supply readings, so the mechanical comparison is unavailable. The next occupied period abstains because generation is unknown. The following zero-occupancy period at 09:31 gives a nominal estimate of 1.51 h⁻¹ and a 1.30 h⁻¹ reference, with a fit-residual warning. **Methods → Browse all 340 reported periods** includes all three recordings. The complete ledger, metrics, audit and findings are downloadable. Public source files are accessible to a technically knowledgeable user. “Blind” describes the separation of selection and inference from the optional comparison in the workflow. [Retrospective findings](../reports/findings.md)

## Explore or import measurements

**Data explorer** exposes each file’s sessions, measurement columns, source role, sample count, room volume and supply-sensor availability. The interactive traces cover room/supply CO₂ and recorded occupancy. Select **Import a local CSV** for a file up to 4 MiB. Each column needs a unique heading. Map time (elapsed seconds or ISO date-time), room CO₂ (ppm) and measured occupancy. Supply CO₂ and supply flow (L/s) are optional. Enter a positive volume in m³ to enable mechanical ACH comparisons on custom files. An imported recording is available in the Blind Validation selector for the current browser session. Reloading clears it.

The three bundled files split at every deviation from their nominal 60-second cadence. Custom data split at non-increasing timestamps and gaps greater than five times their median positive interval. This heuristic can divide or join experimental sessions differently from a field log. Supply and room observations with missing or invalid concentrations lead to abstention. User files, mappings and inference results stay in memory. After initial static assets and any selected bundled data have loaded, computation uses no network services.

## Architecture and operation

| Source | Responsibility |
|---|---|
| `web/src/physics.ts` | Unit-explicit propagation, rate fitting, baseline, diagnostics, seven-scenario sensitivity |
| `web/src/design.ts`, `web/benchmark.ts` | Seeded constant-source experiments, profiled residual surface, strategy ranking, separate evaluation seeds |
| `web/src/recordings.ts` | Local CSV validation, session and occupancy bounds, separate reference storage and post-fit scoring |
| `web/src/Designer.tsx`, `RecordLab.tsx`, `Methods.tsx` | Experiment, empirical workflows and complete results |
| `web/src/Chart.tsx`, `style.css` | D3 scales and paths, keyboard and pointer inspection, responsive styling |
| `web/vite.config.ts` | Relative static assets, original data and reports, bundled license notices |

The source data and archived Phase 1 reports stay in their original repository locations. Vite emits byte-preserved static assets and loads a selected recording on demand. Fonts are served with the application. The browser uses React, TypeScript and D3. The original Python implementation remains the numerical reference.

## Reproduce and verify

From the repository root, with Python 3.12 and Node.js 24 available, run:

```sh
python -m pip install -r requirements.txt
python -m unittest discover -s tests -v
python -m scripts.phase2_fixtures
cd web
npm ci
npm test
npm run benchmark
npm run build
cd ..
python -m pip install playwright==1.62.0
python -m playwright install chromium
python scripts/browser_smoke.py
```

The browser test opens the actual built HTML, scripts, CSS, fonts and data in Chromium. Its request fixture serves the distribution under a `/ventlab/` project path, rejects outside requests and records runtime and console errors. Use `--chromium /path/to/chromium` to select an installed executable and `--screenshots docs/screenshots` to capture the reviewed layouts. The original synthetic benchmark is in `reports/phase2-synthetic.json`. Python fixtures and the seeded benchmark can be regenerated independently. [Parity tolerances and observed errors](parity.md)

### Phase 2 verification

- All 19 Python tests and 30 Vitest tests passed. The 340 archived window statuses and warnings matched. The maximum nominal rate difference across 136 fits was 4.96 × 10⁻⁷ h⁻¹ when rounded upward.
- The production build passed TypeScript checking and Vite bundling. Chromium exercised 1440 × 1000 and 390 × 844 layouts, parameter changes, scenario recalculation, keyboard map inspection, custom uploads, reference reveal/reset, failure cases, session navigation, benchmark pagination and hash-route reloads. Both runs completed without console or page errors or detected horizontal document overflow.
- Retrospective and synthetic evidence have separate denominators and interpretations. In nine common empirical evaluation windows the physics estimator had MAE 0.68 h⁻¹ and the conventional baseline 0.38 h⁻¹. In six synthetic evaluation cases, the recommendation minimized observed mean width in four and improved average rate error in five. The true-rate containment count fell from 159 to 152 out of 192 trials. [Synthetic results and failures](design-study.md)

## GitHub Pages

The build output is `web/dist/`. Relative asset URLs and hash routes support hosting under `/ventlab/` without rewrite rules. The repository workflow validates a pull request and builds the static distribution. After the reviewed changes are merged, a maintainer can select **GitHub Actions** under **Settings → Pages** and manually run **Validate and build VentLab** on `main` to publish the verified artifact. The deployment job requires `pages: write` and `id-token: write` and runs only on a manual dispatch from `main`. [Deployment workflow](../.github/workflows/ventlab-pages.yml)

## Limits and follow-up

The study uses one experimental room, previously examined test sessions, and a mechanical reference that can differ from effective room ventilation. The synthetic study uses independent Gaussian noise, a constant source and rate, and bounded calibration error. Narrower spans can accompany larger errors. Empirical confidence calibration, prospective multi-room evaluation, and validation of rankings against measurements with independently known sources remain open. Unit conversion beyond the stated CSV units, saved experiments across reloads and visualizations for additional environmental channels are deferred. Browser verification covers Chromium at two viewport sizes. Safari, Firefox, screen-reader usability and live Pages hosting need separate verification.

Original VentLab code uses the repository MIT license. Mikala, Xu and Huotari’s source dataset uses CC BY 4.0. The Methods page links the dataset and the production build distributes software and font notices. OpenAI Codex assisted with implementing the application, drafting documentation and writing tests. Numerical results come from the reference and browser computations. [Software license](../LICENSE) · [Data attribution](../NOTICE.md)
