"""Create one offline HTML from editable sources, using only Python's standard library."""
import argparse
import base64
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def render():
    template = (ROOT / "src/index.template.html").read_text(encoding="utf-8")
    parts = {"STYLE": "styles.css", "SCRIPT": "app.js"}
    hashes = {}
    for key, name in parts.items():
        text = (ROOT / "src" / name).read_text(encoding="utf-8")
        hashes[key] = base64.b64encode(hashlib.sha256(text.encode()).digest()).decode()
        template = template.replace("{{" + key + "}}", text)
    policy = (f"default-src 'none'; script-src 'sha256-{hashes['SCRIPT']}'; "
              f"style-src 'sha256-{hashes['STYLE']}'; connect-src 'none'; "
              "form-action 'none'; base-uri 'none'")
    return template.replace("{{POLICY}}", policy)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check the committed artifact without writing")
    args = parser.parse_args()
    output = ROOT / "index.html"
    html = render()
    if args.check:
        if not output.is_file() or output.read_text(encoding="utf-8") != html:
            parser.exit(1, "index.html is stale; run python build.py\n")
        print("build: up to date")
    else:
        output.write_text(html, encoding="utf-8", newline="\n")
        print("build: index.html")
