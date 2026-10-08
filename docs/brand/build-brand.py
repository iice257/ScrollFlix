"""Builds the monochrome ScrollFlix brand set from the traced mark (mark-trace.svg) and DM Sans 950.

Usage: python -I build-brand.py <DMSans.ttf> <fonttools-path> <out-dir>
"""
import re
import sys

font_path, ft_path, out = sys.argv[1:4]
sys.path.insert(0, ft_path)
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

here = __file__.rsplit('\\', 1)[0].rsplit('/', 1)[0]
src = open(f'{here}/mark-trace.svg').read()
d = re.search(r'<path fill="url\(#g\)" d="([^"]+)"', src).group(1)

# --- mark bounds -------------------------------------------------------------
nums = [float(n) for n in re.findall(r'-?\d+\.?\d*', d)]
xs, ys = nums[0::2], nums[1::2]
mx0, mx1, my0, my1 = min(xs), max(xs), min(ys), max(ys)
mw, mh = mx1 - mx0, my1 - my0


def mark_defs(uid, stops, hi_color):
    # fitted from the source: light falls from the top, lower tiles sink into the background
    s = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in stops)
    return (
        f'<linearGradient id="g{uid}" gradientUnits="userSpaceOnUse" x1="{mx0 + mw * 0.55:.1f}" y1="{my0:.1f}" '
        f'x2="{mx0 + mw * 0.45:.1f}" y2="{my1:.1f}">{s}</linearGradient>'
        f'<radialGradient id="h{uid}" gradientUnits="userSpaceOnUse" cx="{mx0 + mw * 0.6:.1f}" cy="{my0 + mh * 0.2:.1f}" r="{mw * 0.34:.1f}">'
        f'<stop offset="0" stop-color="{hi_color}" stop-opacity=".9"/><stop offset="1" stop-color="{hi_color}" stop-opacity="0"/></radialGradient>'
    )


DARK_STOPS = [(0, '#FFFFFF'), (0.45, '#B9B9B9'), (0.8, '#4A4A4A'), (1, '#161616')]
LIGHT_STOPS = [(0, '#0B0B0B'), (0.45, '#3A3A3A'), (0.8, '#9A9A9A'), (1, '#E4E4E4')]


def mark_group(uid, light):
    stops, hi = (LIGHT_STOPS, '#000000') if light else (DARK_STOPS, '#FFFFFF')
    defs = mark_defs(uid, stops, hi)
    body = f'<path fill="url(#g{uid})" d="{d}"/>'
    if not light:
        body += f'<path fill="url(#h{uid})" d="{d}"/>'
    return defs, body


# --- wordmark outlines -------------------------------------------------------
vf = TTFont(font_path)
inst = instancer.instantiateVariableFont(vf, {'wght': 950, 'opsz': 40})
gs, cmap, hmtx = inst.getGlyphSet(), inst.getBestCmap(), inst['hmtx']
upm = inst['head'].unitsPerEm
TEXT = 'ScrollFlix'
TRACK = -0.05 * upm
pen_d, x, bx0, bx1, by0, by1 = [], 0.0, 1e9, -1e9, 1e9, -1e9
for ch in TEXT:
    name = cmap[ord(ch)]
    sp = SVGPathPen(gs)
    gs[name].draw(TransformPen(sp, (1, 0, 0, -1, x, 0)))
    pen_d.append(sp.getCommands())
    bp = BoundsPen(gs)
    gs[name].draw(bp)
    if bp.bounds:
        bx0, bx1 = min(bx0, x + bp.bounds[0]), max(bx1, x + bp.bounds[2])
        by0, by1 = min(by0, -bp.bounds[3]), max(by1, -bp.bounds[1])
    x += hmtx[name][0] + TRACK
text_d = ''.join(pen_d)
tw, th = bx1 - bx0, by1 - by0
cap = -gs[cmap[ord('F')]].width * 0  # placeholder to keep API parity
bp = BoundsPen(gs)
gs[cmap[ord('F')]].draw(bp)
cap_h = bp.bounds[3]


def svg(w, h, inner, bg=None):
    r = f'<rect width="{w:.1f}" height="{h:.1f}" fill="{bg}"/>' if bg else ''
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" fill="none">{r}{inner}</svg>'


def write(name, content):
    open(f'{out}/{name}', 'w', encoding='utf-8').write(content)


for theme, light in (('dark', False), ('light', True)):
    ink = '#0A0A0A' if light else '#FFFFFF'
    defs, body = mark_group(theme[0], light)

    # mark only (tight, 4% pad)
    pad = mw * 0.04
    write(f'mark-{theme}.svg', svg(mw + 2 * pad, mh + 2 * pad,
          f'<defs>{defs}</defs><g transform="translate({pad - mx0:.1f} {pad - my0:.1f})">{body}</g>'))

    # horizontal: wordmark cap height = 0.40 * mark height, vertically centred on the mark
    k = (mh * 0.40) / cap_h
    gap = mh * 0.26
    W = mw + gap + tw * k
    ty = (mh + cap_h * k) / 2 + 0  # baseline
    inner = (f'<defs>{defs}</defs><g transform="translate({-mx0:.1f} {-my0:.1f})">{body}</g>'
             f'<path fill="{ink}" transform="translate({mw + gap - bx0 * k:.1f} {ty:.1f}) scale({k:.5f})" d="{text_d}"/>')
    write(f'logo-horizontal-{theme}.svg', svg(W, mh, inner))

    # stacked: wordmark width = 1.0 * mark width
    k2 = mw * 1.0 / tw
    gap2 = mh * 0.12
    H = mh + gap2 + cap_h * k2
    inner = (f'<defs>{defs}</defs><g transform="translate({-mx0:.1f} {-my0:.1f})">{body}</g>'
             f'<path fill="{ink}" transform="translate({-bx0 * k2:.1f} {mh + gap2 + cap_h * k2:.1f}) scale({k2:.5f})" d="{text_d}"/>')
    write(f'logo-stacked-{theme}.svg', svg(mw, H, inner))

# --- favicon / app icon: white mark on near-black ----------------------------
defs, body = mark_group('f', False)
S = 512
scale = S * 0.64 / mw
ox, oy = (S - mw * scale) / 2 - mx0 * scale, (S - mh * scale) / 2 - my0 * scale
icon_inner = f'<defs>{defs}</defs><g transform="translate({ox:.1f} {oy:.1f}) scale({scale:.4f})">{body}</g>'
write('favicon.svg', svg(S, S, f'<rect width="{S}" height="{S}" rx="{S * 0.22:.0f}" fill="#0A0A0A"/>' + icon_inner))
write('app-icon-square.svg', svg(S, S, icon_inner, '#0A0A0A'))  # full-bleed square for apple-touch-icon
print('mark', round(mw), 'x', round(mh), 'text', round(tw), 'x', round(th), 'cap', cap_h)
