// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Generates src/theme/palette.generated.css — the Prism 2.0 theme engine.
//
//   node scripts/generate_theme_css.mjs
//
// Prism 2.0 ships a single light theme (<html data-theme="light">); the dark
// blocks below are retained for the engine but unused at runtime.
//
// 1. Palette remap. Legacy dashboards were authored dark-first (bg-slate-950,
//    text-slate-300…). Under data-theme="light" every Tailwind neutral family
//    is mapped onto warm zinc on a white canvas and hue shades are inverted
//    (TO_LIGHT) so those classes render as a legible light UI. Surfaces
//    authored light-first carry `.surface-light` and get the identity palette.
//    The brand `accent-*` ramp is defined on :root in src/index.css and is
//    deliberately NOT part of this remap, so it renders identically everywhere.
// 2. Chart palette. Chart series colors are resolved from
//    src/theme/chartPalette.json (colorblind-validated, >=3:1 on the chart
//    surface). The CHART_SERIES sentinel hexes used in SVG fill/stroke/stop-color
//    attributes are redirected to the matching --cvd-* token, so every recharts
//    chart follows the palette without per-file edits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const v4css = fs.readFileSync(path.join(ROOT, 'node_modules/tailwindcss/theme.css'), 'utf8');
const v3src = fs.readFileSync(path.join(ROOT, 'scripts/vendor/tw3-colors.js'), 'utf8');
const chart = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/theme/chartPalette.json'), 'utf8'));

const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
const NEUTRALS = ['slate', 'gray', 'zinc', 'neutral', 'stone'];
const HUES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'];

// --- Tailwind v4 variables (what utilities resolve through) ---
const v4 = {};
for (const m of v4css.matchAll(/--color-([a-z]+)-(\d+):\s*([^;]+);/g)) {
    (v4[m[1]] ||= {})[m[2]] = m[3].trim();
}
// --- Tailwind v3 hex literals (what legacy chart code hard-codes) ---
const v3 = {};
for (const m of v3src.matchAll(/\n\s{4}([a-z]+): \{([^}]+)\}/g)) {
    const fam = m[1];
    for (const s of m[2].matchAll(/(\d+): "(#[0-9a-f]{6})"/gi)) (v3[fam] ||= {})[s[1]] = s[2].toLowerCase();
}

// Dark-first -> light. Hue text shades land on >=4.5:1 steps; solid fills land
// on mid steps so former white-on-color text (now dark) stays legible.
const TO_LIGHT = { 50: '950', 100: '950', 200: '900', 300: '800', 400: '700', 500: '600', 600: '400', 700: '300', 800: '200', 900: '100', 950: '50' };
// Light-first -> dark. Body/muted text shades land on >=4.5:1 steps on the dark page.
const TO_DARK = { 50: '950', 100: '900', 200: '800', 300: '700', 400: '500', 500: '400', 600: '300', 700: '200', 800: '100', 900: '50', 950: '50' };

// Surfaces need a little more than a pure mirror: light cards should be white
// on a soft page, dark cards a step above the page.
const LIGHT_SURFACE = { page: '#f6f7f9', card: '#ffffff', ink: '#18181b' };
const DARK_SURFACE = { page: '#0b0d12', ink: '#f4f4f5' };

// In light-first surfaces, adjust neutral steps 400-600 so secondary text,
// kickers, and subtle metadata maintain accessible contrast (>=4.5:1 / 7:1) on white/light canvases.
const SURFACE_LIGHT_NEUTRALS = {
    400: 'oklch(55.2% 0.016 285.938)', // zinc-500 step (~#71717a, >=4.5:1 contrast for small text)
    500: 'oklch(44.2% 0.017 285.786)', // zinc-600 step (~#52525b, >=7:1 contrast for secondary labels)
    600: 'oklch(37% 0.013 285.805)',   // zinc-700 step (~#3f3f46, >=9.5:1 contrast for body text)
};

function remapBlock(map, { neutralOverrides = {}, white, black }) {
    const out = [];
    for (const fam of [...NEUTRALS, ...HUES]) {
        if (!v4[fam]) continue;
        for (const s of SHADES) {
            const override = NEUTRALS.includes(fam) ? neutralOverrides[s] : undefined;
            const srcFam = NEUTRALS.includes(fam) ? 'zinc' : fam;
            out.push(`  --color-${fam}-${s}: ${override || v4[srcFam][map[s]]};`);
        }
    }
    out.push(`  --color-white: ${white};`, `  --color-black: ${black};`);
    return out.join('\n');
}
function identityBlock(neutralOverrides = {}) {
    const out = [];
    for (const fam of [...NEUTRALS, ...HUES]) {
        if (!v4[fam]) continue;
        for (const s of SHADES) {
            const override = NEUTRALS.includes(fam) ? neutralOverrides[s] : undefined;
            out.push(`  --color-${fam}-${s}: ${override || v4[fam][s]};`);
        }
    }
    out.push('  --color-white: #fff;', '  --color-black: #000;');
    return out.join('\n');
}

// --- chart tokens ---
function tokenVars(mode) {
    const lines = [];
    for (const [name, t] of Object.entries(chart.tokens)) {
        const v = t[mode];
        lines.push(`  --cvd-${name}: ${v.base};`, `  --cvd-${name}-soft: ${v.soft};`, `  --cvd-${name}-strong: ${v.strong};`);
    }
    for (const [k, v] of Object.entries(chart.neutral[mode])) lines.push(`  --cvd-${k}: ${v};`);
    return lines.join('\n');
}
const tierOf = (shade) => (+shade <= 300 ? 'soft' : +shade >= 700 ? 'strong' : null);

const attrRules = [];
const styleRules = [];
const seen = new Set();
const rgbOf = (h) => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`;
const redirect = (hex, value, { inline = true } = {}) => {
    const h = hex.toLowerCase();
    if (seen.has(h)) return;
    seen.add(h);
    attrRules.push(
        `svg [fill="${h}" i]{fill:${value}}`,
        `svg [stroke="${h}" i]{stroke:${value}}`,
        `svg [stop-color="${h}" i]{stop-color:${value}}`
    );
    // Legend swatches / chips set colors via inline style; browsers serialize
    // those as rgb(), so match that form. Inline styles need !important.
    if (inline) {
        const rgb = rgbOf(h);
        styleRules.push(
            `[style*="background-color: ${rgb}"]{background-color:${value}!important}`,
            `[style*="border-color: ${rgb}"]{border-color:${value}!important}`,
            `[style*="; color: ${rgb}"],[style^="color: ${rgb}"]{color:${value}!important}`
        );
    }
};
for (const [fam, token] of Object.entries(chart.families)) {
    for (const s of SHADES) {
        const hex = v3[fam]?.[s];
        if (!hex || +s < 200 || +s > 900) continue;
        const tier = tierOf(s);
        redirect(hex, `var(--cvd-${token}${tier ? `-${tier}` : ''})`);
    }
}
for (const [hex, token] of Object.entries(chart.extraHex)) redirect(hex, `var(--cvd-${token})`);
// Neutral chart ink (axes, ticks, grids) follows the remapped neutral scale.
for (const fam of NEUTRALS) for (const s of SHADES) if (v3[fam]?.[s]) redirect(v3[fam][s], `var(--color-${fam}-${s})`, { inline: false });

const css = `/* GENERATED by scripts/generate_theme_css.mjs — do not edit by hand. */

/* ---------- Light theme: dark-first app surfaces (incl. portals) ---------- */
:root[data-theme="light"] body {
${remapBlock(TO_LIGHT, { neutralOverrides: { 950: LIGHT_SURFACE.page, 900: LIGHT_SURFACE.card }, white: LIGHT_SURFACE.ink, black: '#ffffff' })}
}

/* ---------- Light-first surfaces (site header, footer, home) ---------- */
:root[data-theme="light"] .surface-light,
.surface-light .surface-keep {
${identityBlock(SURFACE_LIGHT_NEUTRALS)}
}
:root[data-theme="dark"] .surface-light {
${remapBlock(TO_DARK, { neutralOverrides: { 50: '#101217', 100: '#16181d' }, white: DARK_SURFACE.page, black: '#ffffff' })}
}
:root[data-theme="dark"] .surface-light .surface-keep {
${identityBlock()}
}

/* ---------- Semantic tokens ----------
   Values are deliberately 1 unit off the Tailwind v3 hexes so the legacy
   chart-hex redirects below never re-map an already theme-resolved color. */
:root[data-theme="light"] {
  --bg-primary: ${LIGHT_SURFACE.page};
  --bg-secondary: #eff1f4;
  --bg-card: #ffffff;
  --border-color: #e2e4e8;
  --text-primary: #18181b;
  --text-secondary: #3f3f46;
  --text-muted: #52525b;
  --chart-surface: #ffffff;
  --chart-grid: #e2e4e8;
  --chart-axis: #52525b;
${tokenVars('light')}
}
:root[data-theme="dark"] {
  --bg-primary: #020618;
  --bg-secondary: #0f172b;
  --bg-card: #090d17;
  --border-color: #1e293c;
  --text-primary: #f8fafd;
  --text-secondary: #94a3b9;
  --text-muted: #8391a8;
  --chart-surface: #0f172b;
  --chart-grid: #1e293c;
  --chart-axis: #94a3b9;
${tokenVars('dark')}
}

/* ---------- Legacy chart hex -> colorblind-safe tokens ---------- */
${attrRules.join('\n')}
${styleRules.join('\n')}
`;

const outPath = path.join(ROOT, 'src/theme/palette.generated.css');
fs.writeFileSync(outPath, css);
console.log(`wrote ${path.relative(ROOT, outPath)} (${(css.length / 1024).toFixed(1)} KB, ${seen.size} chart hex redirects)`);
