"""Faithful trace of the GridFlix globe mark: tiles -> smoothed bezier paths, with a fitted gradient."""
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

SRC = r'C:/Users/0/Downloads/scrollflix (gridflix logos).png'
OUT = sys.argv[1]
BOX = (690, 50, 910, 250)  # crop of "02. Full screen logo" symbol
S = 6                      # upscale factor

im = Image.open(SRC).convert('RGB').crop(BOX)
big = im.resize((im.width * S, im.height * S), Image.LANCZOS)
rgb = np.asarray(big).astype(np.float32)
g = rgb[..., 1]
gi = Image.fromarray(g.astype(np.uint8))

# local-adaptive threshold so dim lower tiles still segment from the black gaps
lmax = np.asarray(gi.filter(ImageFilter.MaxFilter(91)).filter(ImageFilter.GaussianBlur(22))).astype(np.float32)
mask = (g > 6 + 0.4 * (lmax - 6)) & (lmax > 17) & (g > 10)
mask = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5))
mask = np.asarray(mask) > 127

H, W = mask.shape
lab = np.zeros((H, W), np.int32)
comps = []
for y in range(H):
    row = mask[y]
    for x in np.nonzero(row & (lab[y] == 0))[0]:
        if lab[y, x]:
            continue
        n = len(comps) + 1
        q = deque([(y, x)]); lab[y, x] = n; pts = []
        while q:
            cy, cx = q.popleft(); pts.append((cy, cx))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not lab[ny, nx]:
                    lab[ny, nx] = n; q.append((ny, nx))
        comps.append(pts)

MIN_AREA = (6 * S) ** 2
def solid(p):
    a=np.array(p); h=np.ptp(a[:,0])+1; w=np.ptp(a[:,1])+1
    return len(p)/(h*w)
keep = [i + 1 for i, p in enumerate(comps) if len(p) >= MIN_AREA and solid(p) > 0.2 and rgb[lab == i + 1][:, 1].mean() > 18]
for n in keep:
    ys_, xs_ = np.nonzero(lab == n)
    print(n, 'c=(%.0f,%.0f)' % (xs_.mean()/S, ys_.mean()/S), 'G=%.1f' % rgb[lab == n][:, 1].mean(), 'solid=%.2f' % solid(comps[n-1]))


def boundary(n):
    """Moore-neighbour contour of component n (outer boundary), as float (x,y) points."""
    m = lab == n
    ys, xs = np.nonzero(m)
    start = (ys.min(), xs[ys == ys.min()].min())
    dirs = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
    cur = start; prev_d = 6; out = [cur]
    while True:
        for k in range(8):
            d = (prev_d + 6 + k) % 8
            ny, nx = cur[0] + dirs[d][0], cur[1] + dirs[d][1]
            if 0 <= ny < H and 0 <= nx < W and m[ny, nx]:
                cur = (ny, nx); prev_d = d; break
        else:
            break
        if cur == start and len(out) > 8:
            break
        out.append(cur)
        if len(out) > 200000:
            break
    return np.array([(x, y) for y, x in out], np.float32)


def smooth(pts, win):
    n = len(pts); k = win // 2
    ext = np.concatenate([pts[-k:], pts, pts[:k]])
    ker = np.ones(win) / win
    return np.stack([np.convolve(ext[:, i], ker, 'valid') for i in range(2)], 1)


def resample(pts, step):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(np.vstack([pts, pts[:1]]), axis=0).T))]
    total = d[-1]; n = max(8, int(total / step))
    t = np.linspace(0, total, n, endpoint=False)
    full = np.vstack([pts, pts[:1]])
    return np.stack([np.interp(t, d, full[:, i]) for i in range(2)], 1)


def catmull(pts):
    n = len(pts); p = lambda i: pts[i % n]
    s = f'M{p(0)[0]:.1f} {p(0)[1]:.1f}'
    for i in range(n):
        p0, p1, p2, p3 = p(i - 1), p(i), p(i + 1), p(i + 2)
        c1 = p1 + (p2 - p0) / 6; c2 = p2 - (p3 - p1) / 6
        s += f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}'
    return s + 'Z'


paths, cents, vals = [], [], []
for n in keep:
    b = boundary(n)
    b = smooth(b, 9)
    b = resample(b, 3.2 * S)  # ~2.2 source px between anchors keeps the real corner radius
    b = smooth(b, 3) if False else b
    paths.append(catmull(b / S))
    ys, xs = np.nonzero(lab == n)
    cents.append((xs.mean() / S, ys.mean() / S))
    vals.append(rgb[lab == n].mean(0))

# fit colour vs position -> one global gradient (so tiles fade like the source)
A = np.array([[1, x, y] for x, y in cents]); gv = np.array([v[1] for v in vals])
coef, *_ = np.linalg.lstsq(A, gv, rcond=None)
print('tiles', len(keep), 'fit G = %.1f + %.3f x + %.3f y' % tuple(coef))
hi = np.array(sorted(vals, key=lambda v: -v[1])[:3]).mean(0)
lo = np.array(sorted(vals, key=lambda v: v[1])[:3]).mean(0)
hexc = lambda c: '#%02X%02X%02X' % tuple(int(max(0, min(255, v))) for v in c)
print('hi', hexc(hi), 'lo', hexc(lo))

w, h = im.width, im.height
bx = np.array([p for p in cents])
x0, y0 = bx.min(0); x1, y1 = bx.max(0)
dx, dy = coef[1], coef[2]
nrm = np.hypot(dx, dy)
ux, uy = -dx / nrm, -dy / nrm
proj = bx @ np.array([ux, uy])
cx, cy = bx.mean(0)
t0, t1 = proj.min() - 8, proj.max() + 8
gx1, gy1 = ux * t1, uy * t1
gx0, gy0 = ux * t0, uy * t0
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" fill="none">
<defs><linearGradient id="g" gradientUnits="userSpaceOnUse" x1="{gx0:.1f}" y1="{gy0:.1f}" x2="{gx1:.1f}" y2="{gy1:.1f}">
<stop offset="0" stop-color="{hexc(hi)}"/><stop offset="1" stop-color="{hexc(lo)}"/></linearGradient>
<radialGradient id="h" gradientUnits="userSpaceOnUse" cx="{w*0.60:.1f}" cy="{h*0.25:.1f}" r="{w*0.30:.1f}"><stop offset="0" stop-color="#1CF4E2" stop-opacity=".85"/><stop offset="1" stop-color="#1CF4E2" stop-opacity="0"/></radialGradient></defs>
<path fill="url(#g)" d="{''.join(paths)}"/>
<path fill="url(#h)" d="{''.join(paths)}"/></svg>'''
open(OUT, 'w').write(svg)
print('wrote', OUT, len(svg), 'bytes')
