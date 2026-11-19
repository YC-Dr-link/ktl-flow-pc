"""Checks for regressions when changing the distributed offline HTML."""
import base64
import hashlib
from pathlib import Path
import re
import shutil
import subprocess


HTML = Path(__file__).resolve().parents[1] / "m4m5.html"


def test_inline_content_matches_browser_csp():
    html = HTML.read_text(encoding="utf-8")
    for tag in ("script", "style"):
        body = re.search(rf"<{tag}>([\s\S]*?)</{tag}>", html).group(1)
        digest = base64.b64encode(hashlib.sha256(body.encode()).digest()).decode()
        assert f"{tag}-src 'sha256-{digest}'" in html


def test_no_embedded_sample_or_template():
    html = HTML.read_text(encoding="utf-8")
    assert not re.search(r"[A-Za-z0-9+/]{500,}={0,2}", html)
    assert 'id="sampleBtn"' not in html
    assert 'id="templateInput"' in html


def test_distributed_javascript_syntax(tmp_path):
    script = re.search(r"<script>([\s\S]*?)</script>", HTML.read_text(encoding="utf-8")).group(1)
    target = tmp_path / "app.js"
    target.write_text(script, encoding="utf-8")
    node = shutil.which("node")
    assert node, "Install Node.js to run the JavaScript syntax check"
    subprocess.run([node, "--check", str(target)], check=True, capture_output=True)
