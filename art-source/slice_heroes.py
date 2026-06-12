"""Slice art-source/Heroes.png: 5 hero cards (rembg), brute on white (rembg),
icon / splash / feature graphic (plain crops)."""
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHEET = os.path.join(ROOT, 'art-source', 'Heroes.png')
OUT_HEROES = os.path.join(ROOT, 'www', 'assets', 'heroes')
OUT_ENEMIES = os.path.join(ROOT, 'www', 'assets', 'enemies')
RESOURCES = os.path.join(ROOT, 'resources')
STORE = os.path.join(ROOT, 'store-assets')
DEBUG = os.path.join(ROOT, '_debug_sprites')
for d in (STORE, DEBUG):
    os.makedirs(d, exist_ok=True)

SESSION = new_session('u2net')

# fractional boxes measured on the 600x328 preview
HERO_CELLS = {
    'aldric': (0.095, 0.10, 0.165, 0.34),
    'lyra':   (0.265, 0.10, 0.165, 0.34),
    'magnus': (0.437, 0.10, 0.165, 0.34),
    'mercy':  (0.608, 0.10, 0.165, 0.34),
    'korg':   (0.780, 0.10, 0.165, 0.34),
}
BRUTE_BOX = (0.085, 0.515, 0.19, 0.19)
ICON_BOX = (0.085, 0.715, 0.13, 0.225)
SPLASH_BOX = (0.275, 0.585, 0.275, 0.36)
FEATURE_BOX = (0.570, 0.535, 0.405, 0.40)


def components(mask):
    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps = []
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]:
            continue
        q = deque([(sy, sx)])
        seen[sy, sx] = True
        comp = [(sy, sx)]
        while q:
            y, x = q.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
                    comp.append((ny, nx))
        comps.append(comp)
    return comps


def find_card(arr):
    """Bounding box of dark navy card frame; None if no card."""
    rgb = arr[:, :, :3].astype(int)
    bright = rgb.mean(axis=2)
    dark = (bright < 95) & (rgb[:, :, 2] > rgb[:, :, 0] + 8)
    comps = components(dark)
    if not comps:
        return None
    best = max(comps, key=len)
    if len(best) < arr.shape[0] * arr.shape[1] * 0.01:
        return None
    ys, xs = zip(*best)
    y1, y2, x1, x2 = min(ys), max(ys), min(xs), max(xs)
    frame = np.zeros(arr.shape[:2], dtype=bool)
    frame[list(ys), list(xs)] = True
    midy = (y1 + y2) // 2
    t = 0
    while x1 + t < x2 and frame[midy, x1 + t]:
        t += 1
    inset = max(6, t + 4)
    return (y1 + inset, y2 - inset, x1 + inset, x2 - inset)


def crop_box(sheet, frac):
    W, H = sheet.size
    x0, y0, fw, fh = frac
    return sheet.crop((int(x0 * W), int(y0 * H), min(W, int((x0 + fw) * W)), min(H, int((y0 + fh) * H))))


def matte(img, alpha_thr=30):
    cut = remove(img, session=SESSION)
    out = np.array(cut)
    h, w = out.shape[:2]
    mask = out[:, :, 3] > alpha_thr
    comps = components(mask)
    if not comps:
        return None
    big = max(len(c) for c in comps)
    keep = np.zeros((h, w), dtype=bool)
    for c in comps:
        if len(c) >= big * 0.05:
            ys, xs = zip(*c)
            keep[list(ys), list(xs)] = True
    out[:, :, 3] = np.where(keep, out[:, :, 3], 0)
    ys, xs = np.nonzero(keep)
    pad = 3
    crop = out[max(0, ys.min() - pad):min(h, ys.max() + pad), max(0, xs.min() - pad):min(w, xs.max() + pad)]
    side = max(crop.shape[0], crop.shape[1])
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    oy, ox = (side - crop.shape[0]) // 2, (side - crop.shape[1]) // 2
    canvas[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    img2 = Image.fromarray(canvas)
    if side > 256:
        img2 = img2.resize((256, 256), Image.LANCZOS)
    return img2


sheet = Image.open(SHEET).convert('RGBA')
results = {}

# heroes: card interior -> matte
for uid, frac in HERO_CELLS.items():
    card = crop_box(sheet, frac)
    card = card.resize((card.width // 2, card.height // 2), Image.LANCZOS)
    arr = np.array(card)
    rect = find_card(arr)
    if rect and rect[1] - rect[0] > 20 and rect[3] - rect[2] > 20:
        interior = Image.fromarray(arr[rect[0]:rect[1], rect[2]:rect[3]])
    else:
        interior = card
    print(uid, 'card', card.size, 'rect', rect)
    img = matte(interior)
    if img is None:
        print('FAILED', uid)
        continue
    img.save(os.path.join(OUT_HEROES, uid + '.png'))
    results[uid] = img
    print('ok', uid, img.size)

# brute: white background, matte directly
brute = matte(crop_box(sheet, BRUTE_BOX))
if brute is not None:
    brute.save(os.path.join(OUT_ENEMIES, 'brute.png'))
    results['brute'] = brute
    print('ok brute', brute.size)

# icon / splash / feature: plain crops, save full-res
icon = crop_box(sheet, ICON_BOX)
side = max(icon.size)
sq = Image.new('RGBA', (side, side), (12, 17, 24, 255))
sq.paste(icon, ((side - icon.width) // 2, (side - icon.height) // 2))
sq.resize((1024, 1024), Image.LANCZOS).convert('RGB').save(os.path.join(DEBUG, 'icon_candidate.png'))

splash = crop_box(sheet, SPLASH_BOX)
canvas = Image.new('RGB', (2732, 2732), (12, 17, 24))
sw = 1400
sh = int(splash.height * sw / splash.width)
canvas.paste(splash.resize((sw, sh), Image.LANCZOS).convert('RGB'), ((2732 - sw) // 2, (2732 - sh) // 2))
canvas.save(os.path.join(DEBUG, 'splash_candidate.png'))

feature = crop_box(sheet, FEATURE_BOX)
feature.resize((1024, int(feature.height * 1024 / feature.width)), Image.LANCZOS).convert('RGB').save(os.path.join(DEBUG, 'feature_candidate.png'))

# debug montage of cutouts
cols = 6
cell = 200
m = Image.new('RGBA', (cols * cell, cell + 20), (255, 0, 255, 255))
d = ImageDraw.Draw(m)
for i, (uid, img) in enumerate(results.items()):
    im2 = img.copy()
    im2.thumbnail((cell - 20, cell - 20))
    m.paste(im2, ((i % cols) * cell + 10, 10), im2)
    d.text(((i % cols) * cell + 10, cell - 8), uid, fill=(0, 0, 0, 255))
m.save(os.path.join(DEBUG, 'heroes_montage.png'))
print('done')
