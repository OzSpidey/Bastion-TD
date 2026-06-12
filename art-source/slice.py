"""Slice Towers.png / Troops.png sheets into transparent per-unit sprites.

v4: crop each card interior (inside the dark frame), then let rembg (U2Net)
matte the unit out. Post-process: keep large/central alpha components,
crop, center on a square canvas."""
import os
from collections import deque

import numpy as np
from PIL import Image, ImageDraw
from rembg import remove, new_session

ROOT = r"C:/Users/Client/desktop/Bastion-TD"
TOWERS_SHEET = os.path.join(ROOT, "www/assets/towers/Towers.png")
TROOPS_SHEET = os.path.join(ROOT, "www/assets/towers/Troops.png")
OUT_TOWERS = os.path.join(ROOT, "www/assets/towers")
OUT_ENEMIES = os.path.join(ROOT, "www/assets/enemies")
DEBUG = os.path.join(ROOT, "_debug_sprites")
os.makedirs(DEBUG, exist_ok=True)

SESSION = new_session("u2net")

TOWER_CELLS = {}
tower_ids = ["gunner", "cannon", "frost", "tesla", "venom", "sniper", "missile", "bank", "beacon"]
xs = [0.010, 0.322, 0.634]
ys = [0.022, 0.362, 0.688]
for i, tid in enumerate(tower_ids):
    TOWER_CELLS[tid] = (xs[i % 3], ys[i // 3], 0.305, 0.330)

TROOP_CELLS = {}
troop_small = ["runt", "sprinter", "swarmling", "brute", "winged", "phantom",
               "regenerator", "shellback", "splitter"]
xs = [0.010, 0.240, 0.470]
ys = [0.018, 0.335, 0.658]
for i, tid in enumerate(troop_small):
    TROOP_CELLS[tid] = (xs[i % 3], ys[i // 3], 0.222, 0.315)
TROOP_CELLS["juggernaut"] = (0.676, 0.018, 0.320, 0.470)
TROOP_CELLS["wyvern"] = (0.676, 0.480, 0.320, 0.505)


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
    rgb = arr[:, :, :3].astype(int)
    bright = rgb.mean(axis=2)
    dark = (bright < 95) & (rgb[:, :, 2] > rgb[:, :, 0] + 8)
    comps = components(dark)
    if not comps:
        return None
    best = max(comps, key=len)
    ys2, xs2 = zip(*best)
    y1, y2, x1, x2 = min(ys2), max(ys2), min(xs2), max(xs2)
    frame = np.zeros(arr.shape[:2], dtype=bool)
    frame[list(ys2), list(xs2)] = True
    midy = (y1 + y2) // 2
    t = 0
    while x1 + t < x2 and frame[midy, x1 + t]:
        t += 1
    inset = max(6, t + 4)
    return (y1 + inset, y2 - inset, x1 + inset, x2 - inset)


def extract(sheet, frac, central_filter, scale_down=2):
    W, H = sheet.size
    x0, y0, fw, fh = frac
    box = (int(x0 * W), int(y0 * H), min(W, int((x0 + fw) * W)), min(H, int((y0 + fh) * H)))
    card = sheet.crop(box)
    card = card.resize((card.width // scale_down, card.height // scale_down), Image.LANCZOS)
    arr = np.array(card.convert("RGBA"))
    rect = find_card(arr)
    if rect is None:
        return None
    y1, y2, x1, x2 = rect
    interior = Image.fromarray(arr[y1:y2, x1:x2])

    cut = remove(interior, session=SESSION)
    out = np.array(cut)
    h, w = out.shape[:2]
    mask = out[:, :, 3] > 30
    comps = components(mask)
    if not comps:
        return None
    big = max(len(c) for c in comps)
    keep = np.zeros((h, w), dtype=bool)
    for c in comps:
        if len(c) < big * 0.04:
            continue  # sparkles, dust
        if central_filter and len(c) < big * 0.5:
            ys2, xs2 = zip(*c)
            cy, cx = sum(ys2) / len(ys2), sum(xs2) / len(xs2)
            # side decorations on tower cards: drop medium off-center blobs
            if cx < w * 0.18 or cx > w * 0.82:
                continue
        ys2, xs2 = zip(*c)
        keep[list(ys2), list(xs2)] = True
    out[:, :, 3] = np.where(keep, out[:, :, 3], 0)

    ys2, xs2 = np.nonzero(keep)
    if len(ys2) == 0:
        return None
    pad = 3
    yy1, yy2 = max(0, ys2.min() - pad), min(h, ys2.max() + pad)
    xx1, xx2 = max(0, xs2.min() - pad), min(w, xs2.max() + pad)
    crop = out[yy1:yy2, xx1:xx2]
    side = max(crop.shape[0], crop.shape[1])
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    oy, ox = (side - crop.shape[0]) // 2, (side - crop.shape[1]) // 2
    canvas[oy:oy + crop.shape[0], ox:ox + crop.shape[1]] = crop
    img = Image.fromarray(canvas)
    if side > 256:
        img = img.resize((256, 256), Image.LANCZOS)
    return img


def run(sheet_path, cells, out_dir, central_filter):
    sheet = Image.open(sheet_path).convert("RGBA")
    results = {}
    for uid, frac in cells.items():
        img = extract(sheet, frac, central_filter)
        if img is None:
            print("FAILED:", uid)
            continue
        img.save(os.path.join(out_dir, uid + ".png"))
        results[uid] = img
        print("ok", uid, img.size)
    return results


def montage(results, path):
    cols = 6
    n = len(results)
    rows = (n + cols - 1) // cols
    cell = 200
    m = Image.new("RGBA", (cols * cell, rows * cell + 20), (255, 0, 255, 255))
    d = ImageDraw.Draw(m)
    for i, (uid, img) in enumerate(results.items()):
        im = img.copy()
        im.thumbnail((cell - 20, cell - 20))
        x, y = (i % cols) * cell, (i // cols) * cell
        m.paste(im, (x + 10, y + 10), im)
        d.text((x + 10, y + cell - 12), uid, fill=(0, 0, 0, 255))
    m.save(path)


t = run(TOWERS_SHEET, TOWER_CELLS, OUT_TOWERS, central_filter=True)
e = run(TROOPS_SHEET, TROOP_CELLS, OUT_ENEMIES, central_filter=False)
montage(t, os.path.join(DEBUG, "towers_montage.png"))
montage(e, os.path.join(DEBUG, "troops_montage.png"))
print("done")
