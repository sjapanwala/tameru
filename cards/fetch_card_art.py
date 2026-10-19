"""
Download every image linked in a Dynalist export and build a manifest your app can read.

Usage:
  1. Open the Dynalist doc -> top-right menu -> Export -> "Plain text" (or OPML) -> Download as file
  2. python fetch_card_art.py export.txt ./card-art
  3. Upload ./card-art (images + manifest.json) to your storage (R2, S3, Supabase, etc.)

Requires: pip install requests
"""

import json
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

import requests

# Matches markdown images ![alt](url) and bare image URLs
MD_IMG = re.compile(r"!\[([^\]]*)\]\((https?://[^)\s]+)\)")
BARE_IMG = re.compile(r"(https?://\S+\.(?:png|jpe?g|webp|gif))", re.I)


def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text).strip().lower()
    return re.sub(r"[\s_-]+", "-", text)[:80] or "card"


def parse_export(path: Path):
    """Yield (label, url, context_path) for each image in the export.

    The label comes from the image alt text, or else the nearest line of text
    above it (Dynalist items are usually 'Bank - Card name' followed by the image).
    context_path is the chain of parent items, e.g. ['Canada', 'RBC'].
    """
    stack = []  # (indent, text)
    seen = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        if not raw.strip():
            continue
        indent = len(raw) - len(raw.lstrip())
        line = raw.strip().lstrip("-*• ").strip()

        while stack and stack[-1][0] >= indent:
            stack.pop()

        found = MD_IMG.findall(line) or [("", u) for u in BARE_IMG.findall(line)]
        text_only = MD_IMG.sub("", line)
        text_only = BARE_IMG.sub("", text_only).strip()

        for alt, url in found:
            if url in seen:
                continue
            seen.add(url)
            label = alt.strip() or text_only or (stack[-1][1] if stack else "")
            yield label, url, [t for _, t in stack]

        if text_only:
            stack.append((indent, text_only))


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (card-art-fetcher)"

    manifest, used = [], set()
    for label, url, context in parse_export(src):
        ext = Path(urlparse(url).path).suffix.lower() or ".png"
        name = slugify(" ".join(context[-1:] + [label]))
        base, n = name, 2
        while name in used:
            name, n = f"{base}-{n}", n + 1
        used.add(name)
        filename = f"{name}{ext}"

        try:
            r = session.get(url, timeout=30)
            r.raise_for_status()
            (out / filename).write_bytes(r.content)
            manifest.append({
                "id": name,
                "label": label,
                "group": context,
                "file": filename,
                "source": url,
            })
            print(f"ok   {filename}")
        except Exception as e:
            print(f"FAIL {url}  ({e})")
        time.sleep(0.3)  # be polite to the image host

    (out / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"\n{len(manifest)} images saved to {out}/, manifest.json written")


if __name__ == "__main__":
    main()
