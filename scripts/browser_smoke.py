"""Exercise the built application in Chromium under a GitHub Pages project path.

Playwright serves only the distribution files via its request fixture. This
checks that a published static artifact works without a backend or an origin
root fallback. No browser requests leave the test.
"""
import argparse
import math
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect, sync_playwright


PROJECT = Path(__file__).resolve().parents[1]
BASE = "https://ventlab.test/ventlab/"


def check_browser(browser, width, height, screenshots):
    context = browser.new_context(viewport={"width": width, "height": height}, device_scale_factor=1)
    failures = []
    dist = PROJECT / "web/dist"

    def serve(route):
        path = unquote(urlsplit(route.request.url).path)
        if not route.request.url.startswith(BASE):
            failures.append("Unexpected request " + route.request.url)
            return route.abort()
        f = (dist / (path[len('/ventlab/'):] or "index.html")).resolve()
        if not f.is_relative_to(dist) or not f.is_file():
            failures.append("Missing static asset " + path)
            return route.fulfill(status=404)
        route.fulfill(path=f, content_type=mimetypes.guess_type(f.name)[0] or "application/octet-stream")

    context.route("**/*", serve)
    p = context.new_page()
    p.on("pageerror", lambda error: failures.append(str(error)))
    p.on("console", lambda msg: failures.append(msg.text) if msg.type == "error" else None)
    p.goto(BASE)
    nav = p.get_by_role("navigation")
    p.get_by_role("heading", name="CO₂ trajectory").wait_for()
    p.evaluate("document.fonts.ready")

    def fits():
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Horizontal overflow"

    def snap(name):
        fits()
        if screenshots:
            p.screenshot(path=screenshots / f"{name}-{width}.png", animations="disabled")

    snap("designer")
    p.get_by_role("slider", name="Air-change rate").press("ArrowRight")
    expect(p.get_by_text("Settings changed · run to apply")).to_be_visible()
    p.get_by_role("button", name="Run simulation").click()
    expect(p.locator(".instrument-stats")).to_contain_text("1.90")
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
    if width > 800:
        snap("validation")
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
    p.get_by_label("Volume (m³, optional)").fill("21.87")
    p.get_by_role("button", name="Load recording").click()
    expect(p.locator(".metadata")).to_contain_text("custom")
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
    fits()
    p.reload()
    expect(p.get_by_role("heading", name="Methods & evidence")).to_be_visible()
    assert not failures, failures
    context.close()
    print(f"{width}×{height}: designer, map, blind comparisons, abstention, explorer, CSV upload, ledger, deep link and assets passed; zero console/page errors")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--chromium", help="Optional system Chromium executable")
    parser.add_argument("--screenshots", type=Path)
    args = parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium)
        for size in [(1440, 1000), (390, 844)]:
            check_browser(browser, *size, args.screenshots)
        browser.close()
