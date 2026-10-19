#!/usr/bin/env python3
"""
Remove sample names / card numbers printed in the bottom-left corner of card art.

For every id in cards/card-art/redactions.json ("bottomLeft"), this:
  1. finds the printed text in the bottom-left corner (pixels that stand out from
     their row's typical colour, so gradients and patterns aren't mistaken for text),
  2. covers it with a patch of the same card's background taken from just above
     (so patterns continue instead of being smeared),
  3. matches the patch's colour to its new surroundings and feathers the edges.

Cleaned images go to cards/card-art/clean/<id>.(png|jpeg) with clean/index.json; originals are never modified.
Per-card tweaks can go in redactions.json "overrides": { "<id>": { "from": "above" | "right", "pad": 10 } }.

Usage: python3 scripts/clean-card-art.py [--preview out.jpg]
Needs Pillow and numpy.
"""

import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), '..', 'cards', 'card-art')
# Where the text sits, as fractions of the card (measured across all flagged cards).
REGION = (0.0, 0.76, 0.50, 0.97)  # x0, y0, x1, y1


def luminance(a):
    return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114


def text_box(img, pad):
    """Bounding box (x0, y0, x1, y1) of printed text inside REGION, or None."""
    h, w = img.shape[:2]
    rx0, ry0, rx1, ry1 = int(REGION[0] * w), int(REGION[1] * h), int(REGION[2] * w), int(REGION[3] * h)
    lum = luminance(img[ry0:ry1, rx0:rx1].astype(np.float32))
    bg = np.median(lum, axis=1, keepdims=True)  # per-row background copes with vertical gradients
    dev = np.abs(lum - bg)
    mad = np.median(np.abs(lum - bg), axis=1, keepdims=True)
    mask = dev > np.maximum(45, mad * 5)  # textured backgrounds raise the bar
    # Ignore specks: keep rows/cols with a few hits.
    rows = np.where(mask.sum(axis=1) >= 3)[0]
    cols = np.where(mask.sum(axis=0) >= 2)[0]
    if len(rows) == 0 or len(cols) == 0:
        return None
    # Text is one band: take the longest run of consecutive rows.
    runs, start = [], rows[0]
    for a, b in zip(rows, rows[1:]):
        if b != a + 1 and b - a > 4:
            runs.append((start, a))
            start = b
    runs.append((start, rows[-1]))
    # The printed line is the lowest band of reasonable height (art sits above it).
    min_h = max(4, int(h * 0.012))
    tall = [r for r in runs if r[1] - r[0] + 1 >= min_h] or runs
    y0, y1 = max(tall, key=lambda r: r[0])
    band = mask[y0:y1 + 1]
    cols = np.where(band.sum(axis=0) >= 1)[0]
    x0, x1 = cols[0], cols[-1]
    return (
        max(0, rx0 + x0 - pad),
        max(0, ry0 + y0 - pad),
        min(w, rx0 + x1 + pad + 1),
        min(h, ry0 + y1 + pad + 1),
    )


def ring_mean(img, box, width):
    x0, y0, x1, y1 = box
    h, w = img.shape[:2]
    X0, Y0, X1, Y1 = max(0, x0 - width), max(0, y0 - width), min(w, x1 + width), min(h, y1 + width)
    outer = img[Y0:Y1, X0:X1].astype(np.float32)
    m = np.ones(outer.shape[:2], bool)
    m[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = False
    return outer[m].mean(axis=0)


def feather(h, w, f, left=True, bottom=True):
    """Alpha that is 1 inside and fades to 0 over f px at the edges (optionally not at left/bottom)."""
    y = np.arange(h)
    x = np.arange(w)
    ys = np.minimum(y, h - 1 - y if bottom else np.full(h, f))[:, None]
    xs = np.minimum(x if left else np.full(w, f), w - 1 - x)[None, :]
    return np.clip(np.minimum(ys, xs) / max(1, f), 0, 1)


def clean(path, opts):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)
    rgb = a[..., :3].astype(np.float32)
    h, w = rgb.shape[:2]
    pad = int(opts.get('pad', max(6, w * 0.012)))
    if 'box' in opts:  # [x0, y0, x1, y1] as fractions of the card
        fx0, fy0, fx1, fy1 = opts['box']
        box = (int(fx0 * w), int(fy0 * h), int(fx1 * w), int(fy1 * h))
    else:
        box = text_box(rgb, pad)
    if box is None:
        return im, None
    if opts.get('method') == 'label':
        return im, box  # the app covers it with a label; the image stays as is
    x0, y0, x1, y1 = box
    bh, bw = y1 - y0, x1 - x0
    f = max(4, int(min(bh, bw) * 0.25))
    # Grow the pasted area by the feather so the whole text sits under full opacity.
    gx0, gy0, gx1, gy1 = max(0, x0 - f), max(0, y0 - f), min(w, x1 + f), min(h, y1 + f)
    gh, gw = gy1 - gy0, gx1 - gx0
    if opts.get('from') == 'above':
        # Copy a patch from just above, colour-matched (for strongly patterned strips).
        sy0 = max(0, gy0 - gh - 4)
        src = rgb[sy0:sy0 + gh, gx0:gx1].copy()
        src += ring_mean(rgb, (gx0, gy0, gx1, gy1), f) - ring_mean(rgb, (gx0, sy0, gx1, sy0 + gh), f)
    else:
        # Rebuild each row from the background just left and right of the text:
        # the bottom strip of a card is usually plain or a smooth gradient.
        k = 3  # average a few columns on each side to ignore noise
        lx = max(0, gx0 - k)
        rx = min(w, gx1 + k)
        left = rgb[gy0:gy1, lx:max(lx + 1, gx0)].mean(axis=1) if gx0 > 0 else rgb[gy0:gy1, gx1:rx].mean(axis=1)
        right = rgb[gy0:gy1, gx1:rx].mean(axis=1) if gx1 < w else left
        t = np.linspace(0, 1, gw)[None, :, None]
        src = left[:, None, :] * (1 - t) + right[:, None, :] * t
        # Smooth across rows so neighbouring rows don't streak.
        kernel = np.ones(5) / 5
        for c in range(3):
            col = np.apply_along_axis(lambda v: np.convolve(np.pad(v, 2, mode='edge'), kernel, mode='valid'), 0, src[..., c])
            src[..., c] = col
    alpha = feather(gh, gw, f, left=gx0 > 0, bottom=gy1 < h)[..., None]  # no fade against the card's own edge
    rgb[gy0:gy1, gx0:gx1] = rgb[gy0:gy1, gx0:gx1] * (1 - alpha) + np.clip(src, 0, 255) * alpha
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return Image.fromarray(a), box


def main():
    manifest = {e['id']: e for e in json.load(open(os.path.join(ROOT, 'manifest.json')))}
    red = json.load(open(os.path.join(ROOT, 'redactions.json')))
    overrides = red.get('overrides', {})
    out_dir = os.path.join(ROOT, 'clean')
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    pairs = []
    index = {}
    for cid in red.get('bottomLeft', []):
        entry = manifest.get(cid)
        if not entry:
            print(f'skip {cid}: not in manifest')
            continue
        opts = overrides.get(cid, {})
        before = Image.open(os.path.join(ROOT, entry['file'])).convert('RGBA')
        after, box = clean(os.path.join(ROOT, entry['file']), opts)
        if box is None:
            print(f'{cid}: no text found, left alone')
            continue
        bw, bh = before.size
        frac = [round(box[0] / bw, 4), round(box[1] / bh, 4), round(box[2] / bw, 4), round(box[3] / bh, 4)]
        if opts.get('method') == 'label':
            # The label is filled with the card's own colour just around the text.
            rgb = np.array(before.convert('RGB')).astype(np.float32)
            pad = max(4, int(bw * 0.01))
            ring = ring_mean(rgb, box, pad)
            index[cid] = {'method': 'label', 'box': frac, 'color': '#%02x%02x%02x' % tuple(int(round(v)) for v in np.clip(ring, 0, 255))}
        else:
            # Keep the original format so cleaned copies stay the same size as the art.
            ext = os.path.splitext(entry['file'])[1].lower()
            jpeg = ext in ('.jpg', '.jpeg')
            dest = os.path.join(out_dir, cid + ('.jpeg' if jpeg else '.png'))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            if jpeg:
                after.convert('RGB').save(dest, quality=90, optimize=True, progressive=True)
            else:
                after.save(dest, optimize=True)
            index[cid] = {'method': 'clean', 'file': os.path.relpath(dest, ROOT).replace(os.sep, '/'), 'box': frac}
        print(f"{cid}: {index[cid]['method']} {frac}")
        pairs.append((cid, before, after))
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'index.json'), 'w') as fh:
        json.dump(index, fh, indent=2, sort_keys=True)
    if preview:
        W, H = 360, round(360 / 1.586)
        sheet = Image.new('RGB', (W * 2 + 12, (H + 6) * len(pairs)), 'white')
        for i, (_, b, a) in enumerate(pairs):
            sheet.paste(b.convert('RGB').resize((W, H)), (0, i * (H + 6)))
            sheet.paste(a.convert('RGB').resize((W, H)), (W + 12, i * (H + 6)))
        sheet.save(preview, quality=85)


if __name__ == '__main__':
    main()
