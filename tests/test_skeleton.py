"""Browser smoke tests for the standalone, offline issue #1 skeleton."""
import os
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        channel = os.environ.get("KTL_BROWSER_CHANNEL")
        instance = playwright.chromium.launch(channel=channel, headless=True)
        yield instance
        instance.close()


@pytest.fixture
def page(browser):
    context = browser.new_context(offline=True, viewport={"width": 1280, "height": 800})
    page = context.new_page()
    page.failures = []
    page.network = []
    page.on("pageerror", lambda error: page.failures.append(str(error)))
    page.on("request", lambda request: page.network.append(request.url))
    page.goto((Path(__file__).resolve().parents[1] / "index.html").as_uri())
    yield page
    assert page.failures == []
    assert all(url.startswith("file:") for url in page.network)
    context.close()


def test_file_opens_offline_without_other_assets(page):
    assert page.title() == "KTL 유속계 실험 PC 도구"
    assert page.locator("html").get_attribute("lang") == "ko"
    assert page.locator("section:visible").get_attribute("id") == "pc-01"
    assert page.get_by_text("실행 뼈대입니다.").is_visible()
    assert page.locator("[src], link[href]").count() == 0
    assert "connect-src 'none'" in page.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")


def test_sequential_navigation_and_boundaries(page):
    assert page.locator("#previous").is_disabled()
    for number in range(2, 5):
        page.locator("#next").click()
        assert page.locator("section:visible").get_attribute("id") == f"pc-{number:02}"
        assert page.locator('[aria-current="step"]').count() == 1
        assert page.locator("h2:focus").count() == 1
        assert page.locator("#screen-status").inner_text().startswith(f"{number} / 4")
    assert page.locator("#next").is_disabled()
    for number in range(3, 0, -1):
        page.locator("#previous").click()
        assert page.locator("section:visible").get_attribute("id") == f"pc-{number:02}"
    assert page.locator("#previous").is_disabled()


def test_direct_keyboard_navigation_and_unimplemented_actions(page):
    for index in (3, 1, 2, 0):
        step = page.locator(f'[data-step="{index}"]')
        step.focus()
        page.keyboard.press("Enter")
        assert step.get_attribute("aria-current") == "step"
        assert page.locator("section:visible button").is_disabled()


def test_preview_input_stays_in_memory_only(page):
    page.locator("#qr-input").fill("synthetic preview")
    page.locator("#next").click()
    page.locator("#previous").click()
    assert page.locator("#qr-input").input_value() == "synthetic preview"
    page.reload()
    assert page.locator("#qr-input").input_value() == ""
    assert page.evaluate("localStorage.length") == 0


@pytest.mark.parametrize("width,height", [(800, 480), (390, 844)])
def test_layout_does_not_overflow_horizontally(page, width, height):
    page.set_viewport_size({"width": width, "height": height})
    for index in range(4):
        page.locator(f'[data-step="{index}"]').click()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
