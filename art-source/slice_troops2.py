"""Extract 12 troops from Troops2.png via whole-sheet matte + figure detection.
Figures are detected as large alpha components, clustered into 3 rows by
centroid, merged when x-ranges overlap (detached wings/weapons), then named
left-to-right per row (dup variants skipped)."""
import os
import numpy as np
from PIL import Image, ImageDraw
from collections import deque
from rembg import remove, new_session

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SESSION = new_session('u2net')
sheet = Image.open(os.path.join(ROOT, 'art-source', 'Troops2.png')).convert('RGBA')
W, H = sheet.size

cut = remove(sheet, session=SESSION)
out = np.array(cut)
mask = out[:, :, 3] > 35

def components(m):
    h, w = m.shape
    seen = np.zeros_like(m, dtype=bool)
    comps = []
    idxs = np.argwhere(m)
    for sy, sx in idxs:
        if seen[sy, sx]:
            continue
        q = deque([(sy, sx)])
        seen[sy, sx] = True
        comp = [(sy, sx)]
        while q:
            y, x = q.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < h and 0 <= nx < w and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    q.append((ny, nx))
                    comp.append((ny, nx))
        if len(comp) > 1200:  # ignore label text and dust
            comps.append(comp)
    return comps

comps = components(mask)
boxes = []
for c in comps:
    ys, xs = zip(*c)
    boxes.append({'x1': min(xs), 'x2': max(xs), 'y1': min(ys), 'y2': max(ys),
                  'cy': sum(ys) / len(ys), 'cx': sum(xs) / len(xs), 'n': len(c)})
print('raw figures:', len(boxes))

# cluster into 3 rows by centroid y (sheet thirds with slack)
rows = [[], [], []]
for b in boxes:
    rows[min(2, int(b['cy'] / (H / 3.0)))].append(b)

def merge_row(row):
    row.sort(key=lambda b: b['x1'])
    merged = []
    for b in row:
        if merged and b['x1'] < merged[-1]['x2'] - 8:  # overlapping x-range: same figure
            m0 = merged[-1]
            m0['x1'] = min(m0['x1'], b['x1']); m0['x2'] = max(m0['x2'], b['x2'])
            m0['y1'] = min(m0['y1'], b['y1']); m0['y2'] = max(m0['y2'], b['y2'])
            m0['n'] += b['n']
        else:
            merged.append(dict(b))
    return merged

rows = [merge_row(r) for r in rows]
print('row figure counts:', [len(r) for r in rows])

NAMES = [
    ['runt', 'sprinter', 'swarmling', 'brute', None],       # 5th = brute variant, skip
    ['winged', 'phantom', 'regenerator', 'shellback', None],  # 5th = shellback variant
    ['splitter', 'healer', 'juggernaut', 'wyvern'],
]

results = {}
for ri, row in enumerate(rows):
    names = NAMES[ri]
    for ci, b in enumerate(row):
        if ci >= len(names) or names[ci] is None:
            continue
        uid = names[ci]
        pad = 4
        crop = out[max(0, b['y1'] - pad):min(H, b['y2'] + pad), max(0, b['x1'] - pad):min(W, b['x2'] + pad)].copy()
        # harden alpha inside the figure
        cm = crop[:, :, 3] > 35
        crop[:, :, 3] = np.where(cm, np.maximum(crop[:, :, 3], 235), 0)
        side = max(crop.shape[0], crop.shape[1])
        canvas = np.zeros((side, side, 4), dtype=np.uint8)
        canvas[(side - crop.shape[0]) // 2:(side - crop.shape[0]) // 2 + crop.shape[0],
               (side - crop.shape[1]) // 2:(side - crop.shape[1]) // 2 + crop.shape[1]] = crop
        img = Image.fromarray(canvas)
        if side > 256:
            img = img.resize((256, 256), Image.LANCZOS)
        img.save(os.path.join(ROOT, 'www', 'assets', 'enemies', uid + '.png'))
        results[uid] = img
        print('ok', uid, img.size)

m = Image.new('RGBA', (6 * 130, 2 * 140 + 10), (255, 0, 255, 255))
d = ImageDraw.Draw(m)
for i, (uid, img) in enumerate(results.items()):
    im = img.copy()
    im.thumbnail((115, 115))
    m.paste(im, ((i % 6) * 130 + 6, (i // 6) * 140 + 6), im)
    d.text(((i % 6) * 130 + 6, (i // 6) * 140 + 124), uid, fill=(0, 0, 0, 255))
m.save(os.path.join(ROOT, '_troops2_montage.png'))
print('done', len(results), 'of 12')
