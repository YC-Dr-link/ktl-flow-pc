"""Offline tests for the M4/M5-based shell. Only in-memory synthetic input is used."""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def browser():
    with sync_playwright() as playwright:
        instance = playwright.chromium.launch(channel=os.environ.get("KTL_BROWSER_CHANNEL"), headless=True)
        yield instance
        instance.close()


@pytest.fixture
def page(browser, tmp_path):
    standalone = tmp_path / "index.html"
    shutil.copyfile(ROOT / "index.html", standalone)
    context = browser.new_context(offline=True, viewport={"width": 1280, "height": 900})
    page = context.new_page()
    errors, network = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: network.append(request.url))
    page.goto(standalone.as_uri())
    yield page
    assert errors == []
    assert all(url == standalone.as_uri() for url in network)
    context.close()


def synthetic_files(count=6):
    return [{"name": f"synthetic-{i}.csv", "mimeType": "text/csv", "buffer": b"synthetic preview"} for i in range(count)]


def test_build_is_reproducible_and_has_no_embedded_samples():
    subprocess.run([sys.executable, "build.py", "--check"], cwd=ROOT, check=True)
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    assert not re.search(r"[A-Za-z0-9+/]{300,}={0,2}", html)
    assert "base64:" not in html
    assert "sampleBtn" not in html


def test_single_file_opens_offline_with_hashed_policy(page):
    assert page.title() == "유속계 정도검사 M4·M5"
    assert page.locator("#results").is_hidden()
    assert page.locator("details.slot").count() == 6
    assert page.locator("[src], link[href]").count() == 0
    policy = page.locator('meta[http-equiv="Content-Security-Policy"]').get_attribute("content")
    assert "connect-src 'none'" in policy and "sha256-" in policy
    assert "unsafe-inline" not in policy
    assert page.locator("#saveBtn").is_disabled()


@pytest.mark.parametrize("count", [1, 6, 7])
def test_file_selection_never_claims_classification_or_calculation(page, count):
    page.locator("#fileInput").set_input_files(synthetic_files(count))
    assert page.locator("#fileList li").count() == count
    assert page.locator("#results").is_visible()
    assert page.locator("#fileCount").inner_text().startswith(f"선택 {count}개")
    assert page.get_by_text("아직 계산하지 않았습니다", exact=True).is_visible()
    assert page.locator(".slot-file").all_text_contents() == ["미배정 · 내용 판별 연결 전"] * 6
    assert page.locator("#saveBtn").is_disabled()
    page.locator("#fileInput").set_input_files(synthetic_files(2))
    assert page.locator("#fileList li").count() == 2


def test_drop_then_keyboard_reset(page):
    page.locator("#drop").evaluate("""el => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['synthetic preview'], 'synthetic.csv', {type:'text/csv'}));
        el.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:transfer}));
    }""")
    assert page.locator("#fileList li").count() == 1
    page.locator("#resetBtn").focus()
    page.keyboard.press("Enter")
    assert page.locator("#fileList li").count() == 0
    assert page.locator("#results").is_hidden()
    assert page.locator("#resetBtn").is_disabled()
    assert page.locator("#fileInput").evaluate("el => document.activeElement === el")


def test_file_names_render_as_text_and_reload_clears_state(page):
    payload = synthetic_files(1)
    payload[0]["name"] = '<img src=x onerror="alert(1)">.csv'
    page.locator("#fileInput").set_input_files(payload)
    assert page.locator("#fileList img").count() == 0
    assert "<img" in page.locator("#fileList").inner_text()
    page.locator("#qrBox summary").click()
    page.locator("#qr-input").fill("synthetic QR preview")
    page.reload()
    assert page.locator("#qr-input").input_value() == ""
    assert page.locator("#fileList li").count() == 0
    assert page.evaluate("localStorage.length") == 0


@pytest.mark.parametrize("width", [1280, 800, 390])
def test_layout_preserves_visual_and_keyboard_order(page, width):
    page.set_viewport_size({"width": width, "height": 900})
    page.locator("#fileInput").set_input_files(synthetic_files())
    expected = "results" if width <= 1100 else "rail"
    assert page.locator("#app").evaluate("el => el.firstElementChild.id || el.firstElementChild.className") == expected
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.set_viewport_size({"width": 1280 if width <= 1100 else 800, "height": 900})
    expected = "rail" if width <= 1100 else "results"
    assert page.locator("#app").evaluate("el => el.firstElementChild.id || el.firstElementChild.className") == expected
