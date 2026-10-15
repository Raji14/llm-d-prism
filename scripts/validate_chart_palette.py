"""Validate the Prism 2.0 chart palette: WCAG non-text contrast (>=3:1) against
light and dark chart surfaces, plus pairwise separation under simulated
protanopia / deuteranopia / tritanopia (Machado et al. 2009, severity 1.0),
measured as OKLab distance (deltaE_ok * 100)."""
import itertools, math, sys

def hex2rgb(h):
    h = h.lstrip('#'); return [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
def lin(c): return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def delin(c):
    c = min(max(c, 0), 1); return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
def lum(h): r, g, b = map(lin, hex2rgb(h)); return 0.2126 * r + 0.7152 * g + 0.0722 * b
def contrast(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
M = {
    'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
    'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
    'tritan': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
}
def sim(h, kind):
    rgb = list(map(lin, hex2rgb(h)))
    if kind == 'normal': return rgb
    m = M[kind]; return [sum(m[i][j] * rgb[j] for j in range(3)) for i in range(3)]
def oklab(rgb):
    r, g, b = [min(max(c, 0), 1) for c in rgb]
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l, m, s = [x ** (1/3) for x in (l, m, s)]
    return (0.2104542553*l + 0.7936177850*m - 0.0040720468*s,
            1.9779984951*l - 2.4285922050*m + 0.4505937099*s,
            0.0259040371*l + 0.7827717662*m - 0.8086757660*s)
def dist(a, b, kind):
    A, B = oklab(sim(a, kind)), oklab(sim(b, kind)); return 100 * math.dist(A, B)

import json, os
_JSON = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src', 'theme', 'chartPalette.json')
_DATA = json.load(open(_JSON))
PALETTE = {k: (v['light']['base'], v['dark']['base']) for k, v in _DATA['tokens'].items()}
SURFACES = {'light': ['#ffffff', '#f6f7f9'], 'dark': ['#0b1120', '#0f172a', '#020617']}

def main():
    ok = True
    for mode, idx in (('light', 0), ('dark', 1)):
        print(f'== {mode}')
        cols = {k: v[idx] for k, v in PALETTE.items()}
        for k, c in cols.items():
            cr = min(contrast(c, s) for s in SURFACES[mode])
            flag = '' if cr >= 3 else '  <-- FAIL 3:1'
            ok &= cr >= 3
            print(f'  {k:7s} {c}  min contrast {cr:4.2f}{flag}')
        for kind in ('normal', 'protan', 'deutan', 'tritan'):
            pairs = sorted(((dist(cols[a], cols[b], kind), a, b) for a, b in itertools.combinations(cols, 2)))
            worst = ', '.join(f'{a}/{b}={d:.1f}' for d, a, b in pairs[:3])
            print(f'  {kind:7s} worst pairs: {worst}')
    print('CONTRAST OK' if ok else 'CONTRAST FAILURES')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
