"""Verify VentLab core journeys at desktop and mobile widths against a static build or a live Pages URL."""
import argparse
import json
import math
import time
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

from browser_audit import FIXTURE, audit_accessibility, bind_fixture, keyboard_skip, phase3_journey, timings


PROJECT = Path(__file__).resolve().parents[1]


def check_browser(context, engine, width, args, report):
    failures = report["errors"]
    screenshots = args.screenshots
    if screenshots and len(args.engines) > 1:
        screenshots = screenshots / engine
    if screenshots:
        screenshots.mkdir(parents=True, exist_ok=True)
    if not args.url:
        bind_fixture(context, args.dist, failures)
    p = context.new_page()
    p.set_default_timeout(12000)
    p.on("pageerror", lambda error: failures.append(str(error)))
    p.on("console", lambda msg: failures.append(msg.text) if msg.type == "error" else None)
    p.on("response", lambda response: failures.append(f"HTTP {response.status} {response.url}")
         if response.status >= 400 else None)
    p.goto(args.url or FIXTURE, wait_until="load", timeout=30000)
    nav = p.get_by_role("navigation")
    p.get_by_role("heading", name="CO₂ trajectory").wait_for()
    p.evaluate("document.fonts.ready")
    p.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")
    report["navigation"] = timings(p)
    if not args.phase2:
        p.get_by_label("Measurement strategy", exact=True).wait_for(timeout=30000)
        report["defaultPlannerReadyObservedMs"] = round(p.evaluate("performance.now()"), 2)
    keyboard_skip(p)
    p.get_by_role("link", name="VentLab home").focus()
    p.evaluate("scrollTo(0,0)")

    def download_report(label, filename):
        with p.expect_download() as save:
            p.get_by_role("button", name=label, exact=True).click()
        assert save.value.suggested_filename == filename
        return json.loads(save.value.path().read_text())

    def audit(name):
        if args.axe_script:
            report["accessibility"].append(audit_accessibility(p, args.axe_script, name))

    def fits():
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Horizontal overflow"

    def snap(name):
        fits()
        if screenshots:
            p.screenshot(path=screenshots / f"{name}-{width}.png", animations="disabled")

    snap("designer")
    audit("designer")
    if screenshots and width > 800:
        p.locator(".analysis-grid").screenshot(path=screenshots / "measurement-design.png")

    p.get_by_role("slider", name="Air-change rate").press("ArrowRight")
    expect(p.get_by_text("Settings changed · run to apply")).to_be_visible()
    start = time.perf_counter()
    p.get_by_role("button", name="Run simulation").click()
    expect(p.locator(".instrument-stats")).to_contain_text("1.90")
    report["applySimulationObservedMs"] = round(1000 * (time.perf_counter() - start), 2)
    p.get_by_text("Sensor & occupancy settings").click()
    p.get_by_label("Measured supply CO₂").check()
    p.get_by_role("button", name="Run simulation").click()
    expect(p.get_by_text("Measure supply CO₂", exact=True)).to_have_count(0)
    p.get_by_role("button", name="Reset experiment").click()
    expect(p.locator(".instrument-stats")).to_contain_text("1.80")
    legend = p.get_by_role("button", name="Alternative fit")
    legend.click()
    expect(legend).to_have_attribute("aria-pressed", "false")
    p.get_by_role("img", name="Residual surface", exact=False).press("ArrowRight")
    expect(p.locator(".map-readout")).to_contain_text("RMSE")

    if not args.phase2:
        phase3_journey(p, report, audit, snap)
        simulation = download_report("Download experiment report", "ventlab-simulation-report.json")
        assert simulation["executedComparison"]["after"]["configuration"]["occupancy"] == 0
        assert simulation["plannedSelection"]["selected"] == "empty"
    nav.get_by_text("Blind validation").click()
    expect(p.get_by_role("heading", name="Blind validation", exact=True)).to_be_visible()
    period = p.get_by_label("Occupancy period")
    period.wait_for()
    expect(p.get_by_role("button", name="Reveal mechanical reference")).to_have_count(0)
    p.get_by_role("button", name="Run both estimators").click()
    p.get_by_role("button", name="Reveal mechanical reference").click()
    expect(p.locator(".reference")).to_contain_text("negative flow")
    period.select_option("1")
    expect(p.locator(".results")).to_have_count(0)
    p.get_by_role("button", name="Run both estimators").click()
    expect(p.locator(".results")).to_contain_text("unknown generation")
    period.select_option("2")
    p.get_by_role("button", name="Run both estimators").click()
    p.get_by_role("button", name="Reveal mechanical reference").click()
    expect(p.locator(".reference")).to_contain_text("1.30 h⁻¹")
    expect(p.locator(".result-stats")).to_contain_text("1.51 h⁻¹")
    p.get_by_role("button", name="Occupancy", exact=True).click()
    expect(p.get_by_role("button", name="Recorded count")).to_be_visible()
    p.get_by_role("button", name="CO₂", exact=True).click()
    p.evaluate("scrollTo(0, 0)")
    audit("blind reference revealed")
    snap("validation")
    if not args.phase2:
        p.get_by_role("button", name="Plan my next measurement").click()
        expect(p.get_by_role("heading", name="From the recording")).to_be_visible()
        real = download_report("Download recording report", "ventlab-recording-report.json")
        assert real["source"]["file"] == "ventilation_test.csv"
        assert abs(real["estimator"]["results"]["rate_ach"] - 1.51) < 0.01
        assert "proposedRepeat" in real and real["proposedRepeat"] is None
        p.evaluate("scrollTo(0,0)")
        snap("recording-window")
        nav.get_by_text("Blind validation").click()
    p.get_by_label("Session", exact=True).select_option("1")
    expect(p.locator(".results")).to_have_count(0)

    nav.get_by_text("Data explorer").click()
    expect(p.get_by_role("heading", name="Data explorer", exact=True)).to_be_visible()
    p.get_by_label("Recording", exact=True).select_option("training_data_1.csv")
    expect(p.locator(".metadata")).to_contain_text("Unmeasured")
    p.get_by_label("Session", exact=True).select_option("1")
    p.get_by_text("Import a local CSV").click()
    p.get_by_label("CSV file").set_input_files({"name":"custom.csv", "mimeType":"text/csv",
        "buffer":("time,co2,people,flow_lps\n"+"".join(
            f"{60*i},{420+600*math.exp(-2*i/60)},0,7\n" for i in range(31))).encode()})
    audit("CSV column mapping")
    p.get_by_label("Volume (m³, optional)").fill("21.87")
    p.get_by_role("button", name="Load recording").click()
    expect(p.locator(".metadata")).to_contain_text("custom")
    if not args.phase2:
        p.get_by_role("button", name="Plan my next measurement").click()
        expect(p.get_by_label("Assumed room sensor noise (SD) (ppm)")).to_have_value("")
        expect(p.get_by_label("Starting room CO₂ (ppm)")).to_have_value("1020")
        p.get_by_label("Assumed room sensor noise (SD) (ppm)").fill("12")
        p.get_by_role("button", name="Evaluate repeat strategies").click()
        strategy = p.get_by_label("Measurement strategy", exact=True)
        strategy.select_option("precision")
        plan = download_report("Download experiment report", "ventlab-recording-report.json")
        assert plan["source"]["file"] == "custom.csv" and plan["source"]["role"] == "custom"
        assert plan["proposedRepeat"]["decision"]["selected"] == "precision"
        assert plan["proposedRepeat"]["assumptions"]["noise"] == 12 and plan["afterMeasurement"] is None
        assert abs(plan["estimator"]["results"]["rate_ach"] - 2) < 1e-6
        expect(p.get_by_role("button", name="Configured scenario")).to_have_count(0)
        audit("recording-based repeat plan")
        p.locator(".recording-plan-results").scroll_into_view_if_needed()
        snap("repeat-plan")
        p.get_by_label("Assumed room sensor noise (SD) (ppm)").fill("13")
        expect(strategy).to_have_count(0)
    nav.get_by_text("Blind validation").click()
    expect(p.get_by_role("heading", name="Blind validation", exact=True)).to_be_visible()
    p.get_by_role("button", name="Run both estimators").click()
    expect(p.locator(".result-stats")).to_contain_text("2.00 h⁻¹")
    p.get_by_role("button", name="Reveal mechanical reference").click()
    expect(p.locator(".reference")).to_contain_text("1.15 h⁻¹")
    p.get_by_role("button", name="Full benchmark").click()
    p.get_by_text("Browse all 340 reported periods").click()
    p.get_by_role("button", name="Next").click()
    expect(p.locator(".pager")).to_contain_text("Page 2 of 2")
    p.get_by_label("Ledger recording").select_option("training_data_2.csv")
    expect(p.locator(".pager")).to_contain_text("Page 1 of 7")
    expect(p.get_by_role("heading", name="Prospective synthetic evaluation")).to_be_visible()
    if not args.phase2:
        stress = p.get_by_role("heading", name="Independent synthetic stress test")
        expect(stress).to_be_visible()
        p.get_by_text("Case results and planning policies", exact=True).click()
        expect(p.get_by_role("table", name="Robust strategy versus unchanged design")).to_be_visible()
        assert p.get_by_role("link", name="All paired outcomes").evaluate(
            "async el => {const r=await fetch(el.href); return r.ok && (await r.json()).evaluation.cases.length > 0}"
        ), "Full synthetic evaluation download failed"
        p.get_by_label("Stress case", exact=True).select_option("Drifting source and fan")
        p.get_by_label("Outcome", exact=True).select_option("inside")
        expect(p.locator(".policy-chart tr").filter(has_text="Robust ensemble")).to_contain_text("0 / 32")
        p.get_by_text("Why precision can mislead").click()
        p.get_by_label("Stress case", exact=True).select_option("")
        p.get_by_label("Outcome", exact=True).select_option("rateMAE")
        expect(p.locator(".policy-chart")).to_contain_text("1.106")
        if width < 640:
            p.locator(".policy-chart").evaluate("table => table.scrollIntoView({block:'center'})")
        else:
            stress.scroll_into_view_if_needed()
        snap("evidence")
    fits()
    audit("methods and open archive ledger")
    p.reload()
    expect(p.get_by_role("heading", name="Methods & evidence")).to_be_visible()
    report["journeyPassed"] = True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engines", nargs="+", choices=("chromium", "firefox", "webkit"), default=["chromium"])
    parser.add_argument("--chromium", help="Optional system Chromium executable")
    parser.add_argument("--webkit", help="Optional Playwright-compatible WebKit executable")
    parser.add_argument("--url", help="Test this real project URL instead of the isolated static artifact fixture")
    parser.add_argument("--dist", type=Path, default=PROJECT / "web/dist")
    parser.add_argument("--axe-script", type=Path, help="Local axe-core/axe.min.js for WCAG 2.1 A/AA checks")
    parser.add_argument("--report", type=Path, help="Write per-viewport measurements and accessibility findings as JSON")
    parser.add_argument("--screenshots", type=Path)
    parser.add_argument("--phase2", action="store_true", help="Run original journeys only, e.g. for a Phase 2 deployment")
    args = parser.parse_args()
    if not args.url and not (args.dist / "index.html").is_file():
        parser.error("Build the static application before running the fixture")
    if args.axe_script and not args.axe_script.is_file():
        parser.error("Pass the path to a local axe.min.js bundle for accessibility checks")
    runs = []
    with sync_playwright() as pw:
        for engine in args.engines:
            executable = args.chromium if engine == "chromium" else args.webkit if engine == "webkit" else None
            try:
                browser = getattr(pw, engine).launch(executable_path=executable, timeout=22000)
            except Exception as exc:
                runs.append({"engine": engine, "errors": [str(exc)]})
                continue
            try:
                for width, height in [(1440, 1000), (390, 844)]:
                    r = {"engine": engine, "version": browser.version, "viewport": [width, height],
                         "target": args.url or FIXTURE, "accessibility": [], "errors": [], "journeyPassed": False}
                    runs.append(r)
                    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
                    try:
                        check_browser(context, engine, width, args, r)
                    except Exception as exc:
                        r["errors"].append(str(exc))
                    finally:
                        context.close()
                    print(f"{engine} {r['version']} {width}×{height} journeys={r['journeyPassed']} "
                          f"violations={sum(len(x['violations']) for x in r['accessibility'])} "
                          f"errors={r['errors']}", flush=True)
            finally:
                browser.close()
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(runs, indent=2) + "\n")
    return int(any(r["errors"] or any(a["violations"] for a in r.get("accessibility", [])) for r in runs))


if __name__ == "__main__":
    raise SystemExit(main())
