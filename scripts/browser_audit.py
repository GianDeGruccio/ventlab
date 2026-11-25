"""Playwright QA for the static distribution or a deployed GitHub Pages project."""
import mimetypes
import time
from urllib.parse import unquote, urlsplit

from playwright.sync_api import expect


FIXTURE = "https://ventlab.test/ventlab/"


def bind_fixture(context, directory, failures):
    root = directory.resolve()

    def serve(route):
        url = route.request.url
        if not url.startswith(FIXTURE):
            failures.append("Unexpected request " + url)
            return route.abort()
        relative = unquote(urlsplit(url).path[len("/ventlab/"):])
        asset = (root / (relative or "index.html")).resolve()
        if not asset.is_relative_to(root) or not asset.is_file():
            failures.append("Missing static asset " + relative)
            return route.fulfill(status=404)
        route.fulfill(path=asset, content_type=mimetypes.guess_type(asset.name)[0] or "application/octet-stream")

    context.route("**/*", serve)


def timings(page):
    """Single navigation timing sample, in ms from navigationStart in this browser."""
    return page.evaluate("""() => {
      const n = performance.getEntriesByType('navigation')[0]
      const paint = performance.getEntriesByName('first-contentful-paint')[0]
      return {
        domContentLoadedMs: n?.domContentLoadedEventEnd ?? null,
        loadMs: n?.loadEventEnd ?? null,
        firstContentfulPaintMs: paint?.startTime ?? null,
        fontsAndChartObservedMs: performance.now(),
      }
    }""")


def audit_accessibility(page, script, name):
    """Run the specified local axe bundle in-page. Keep evidence for failed and manual rules."""
    if not page.evaluate("Boolean(window.axe)"):
        page.add_script_tag(path=str(script))
    return page.evaluate("""async name => {
      const result = await axe.run(document, {
        runOnly: {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa']},
      })
      return {name, version: axe.version, passRules: result.passes.length,
        needsManualReview: result.incomplete.map(r => ({id:r.id, nodes:r.nodes.length})),
        violations: result.violations.map(r => ({id:r.id, impact:r.impact,
          nodes:r.nodes.map(n => ({target:n.target, summary:n.failureSummary}))}))}
    }""", name)


def keyboard_skip(page):
    """Exercise actual sequential tab navigation and the main-content skip destination."""
    page.keyboard.press("Tab")
    skip = page.get_by_role("link", name="Skip to workspace")
    if not skip.evaluate("node => node === document.activeElement"):
        raise AssertionError("First Tab did not focus the skip link")
    page.keyboard.press("Enter")
    if not page.locator("main").evaluate("node => node === document.activeElement"):
        raise AssertionError("Skip link did not focus the workspace")
    page.locator("nav a").first.focus()
    nav = page.locator("nav a")
    for i in range(1, nav.count()):
        page.keyboard.press("Tab")
        if not nav.nth(i).evaluate("node => node === document.activeElement"):
            raise AssertionError(f"Workspace navigation link {i + 1} is unreachable with Tab")


def phase3_journey(page, report, audit, snap):
    """Run the guided ambiguity demo, compare matched maps and constrain a planner."""
    before_after = page.get_by_role("heading", name="Before & after")
    strategy = page.get_by_label("Measurement strategy", exact=True)
    guide_start = time.perf_counter()
    page.get_by_role("button", name="Start guided demo").click()
    page.get_by_role("button", name="Inspect the map").press("Enter")
    page.get_by_role("button", name="Compare an empty room").press("Enter")
    expect(before_after).to_be_focused()
    pair = page.locator(".paired")
    expect(pair.get_by_text("True rate (h⁻¹)", exact=True)).to_be_visible()
    expect(pair.get_by_text("Absolute rate error (h⁻¹)", exact=True)).to_be_visible()
    maps = pair.get_by_role("img", name="Residual surface", exact=False)
    expect(maps).to_have_count(2)
    maps.nth(0).press("ArrowRight")
    readouts = pair.locator(".map-readout")
    expect(readouts.nth(1)).to_contain_text("RMSE")
    def probe(i):
        return readouts.nth(i).inner_text().split(" · RMSE ")[0]
    assert probe(0) == probe(1), "Paired maps disagree on the selected physical coordinates"
    previous = probe(1)
    maps.nth(1).press("ArrowUp")
    assert probe(0) == probe(1) and previous != probe(1), "Second map did not update the first"
    scales = pair.locator(".scale-key").all_inner_texts()
    assert len(scales) == 2 and scales[0] == scales[1], "Paired residual scales disagree"
    report["guidedComparisonObservedMs"] = round(1000 * (time.perf_counter() - guide_start), 2)
    page.get_by_role("heading", name="Paired CO₂ trajectories").scroll_into_view_if_needed()
    snap("comparison")
    audit("guided comparison")
    page.get_by_role("button", name="Finish demo").click()
    expect(page.get_by_role("button", name="Finish demo")).to_have_count(0)

    page.get_by_role("button", name="Start guided demo").click()
    strategy.select_option("baseline")
    page.get_by_role("button", name="Run comparison").click()
    expect(before_after).to_be_visible()
    expect(page.get_by_role("heading", name="Read the new decay")).to_have_count(0)

    page.get_by_role("button", name="Reset experiment").click()
    page.get_by_role("button", name="Configured scenario").click()
    expect(strategy.locator('option[value="baseline"]')).to_have_count(0)
    strategy.select_option("precision")
    page.get_by_role("button", name="Run comparison").click()
    expect(before_after).to_be_visible()
    page.get_by_role("button", name="Robust ensemble").click()
    expect(before_after).to_have_count(0)
    expect(strategy.locator('option[value="baseline"]')).to_have_count(1)
    page.get_by_text("Planning constraints", exact=True).click()
    page.get_by_role("slider", name="Maximum observation time").press("Home")
    for label in ("Allow an empty room", "Allow lower sensor noise", "Allow supply measurement"):
        page.get_by_label(label, exact=True).uncheck()
    expect(strategy.locator("option")).to_have_count(1)
    expect(strategy).to_have_value("baseline")
    page.get_by_text("Inspect ranking & assumptions", exact=True).click()
    audit("constrained robust ranking")
    page.get_by_label("Allow an empty room").check()
    strategy.select_option("empty")
    page.get_by_role("button", name="Run comparison").click()
    expect(before_after).to_be_visible()
    expect(pair).to_contain_text("Observe an empty room")
