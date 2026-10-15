"""Search OKLCH lightness/chroma per hue to maximise the worst-case pairwise
separation (normal + protan + deutan + tritan) subject to >=3:1 contrast on
the theme's chart surfaces. Prints a palette to paste into validate_chart_palette.py."""
import math, random, itertools, sys
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from validate_chart_palette import contrast, dist, SURFACES

def oklch_to_hex(L, C, h):
    a, b = C * math.cos(math.radians(h)), C * math.sin(math.radians(h))
    l_ = L + 0.3963377774*a + 0.2158037573*b
    m_ = L - 0.1055613458*a - 0.0638541728*b
    s_ = L - 0.0894841775*a - 1.2914855480*b
    l, m, s = l_**3, m_**3, s_**3
    r = 4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    bb = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    out = []
    for c in (r, g, bb):
        if c < -0.001 or c > 1.001: return None
        c = min(max(c, 0), 1)
        c = 12.92*c if c <= 0.0031308 else 1.055*c**(1/2.4) - 0.055
        out.append(round(c*255))
    return '#%02x%02x%02x' % tuple(out)

HUES = {'blue': 262, 'sky': 225, 'green': 160, 'amber': 70, 'orange': 40, 'purple': 300, 'pink': 350}
KINDS = ('normal', 'protan', 'deutan', 'tritan')

def score(cols):
    return min(dist(cols[a], cols[b], k) for a, b in itertools.combinations(cols, 2) for k in KINDS)

def search(mode, iters=40000, seed=7):
    rnd = random.Random(seed)
    Lr = (0.38, 0.66) if mode == 'light' else (0.62, 0.92)
    def rand_col(h):
        for _ in range(200):
            L, C = rnd.uniform(*Lr), rnd.uniform(0.06, 0.20)
            hx = oklch_to_hex(L, C, h)
            if hx and min(contrast(hx, s) for s in SURFACES[mode]) >= 3.2: return hx
        return None
    best = None
    cur = {k: rand_col(h) for k, h in HUES.items()}
    best, bs = dict(cur), score(cur)
    for i in range(iters):
        k = rnd.choice(list(HUES))
        cand = dict(best); c = rand_col(HUES[k])
        if not c: continue
        cand[k] = c
        s = score(cand)
        if s > bs: best, bs = cand, s
    return best, bs

if __name__ == '__main__':
    for mode in ('light', 'dark'):
        pal, s = search(mode)
        print(mode, f'worst={s:.1f}', pal)
