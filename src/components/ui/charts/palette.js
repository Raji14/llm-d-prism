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

// The single categorical palette for every chart in Prism 2.0.
//
// Source of truth: src/theme/chartPalette.json, validated by
// scripts/validate_chart_palette.py — every token clears 3:1 against the chart
// surface in BOTH themes, and the worst-case pair stays separable under
// simulated protanopia, deuteranopia and tritanopia.
//
// The values below are canonical *keys*, not the rendered colors.
// src/theme/palette.generated.css redirects each key (in SVG fill / stroke /
// stop-color and inline background/border/color) to the active theme's token
// (var(--cvd-*)), so module-level constants built from these stay correct
// when the user flips light/dark. Use resolveSeriesColor() only when you need
// the literal hex (canvas, exports).
//
// Rules (see skills/style.md):
//  - Assign hues in this fixed order; never cycle or randomize.
//  - Color follows the entity: a series keeps its color when filters change.
//  - More than 7 series? Fold the tail into "Other" or split into small
//    multiples; do not invent an 8th hue.
//  - Never encode meaning by color alone: pair with labels, shape or dash.
import palette from '../../../theme/chartPalette.json';

export const CHART_SERIES = [
    '#10b981', // green  — brand; baseline / primary series
    '#0ea5e9', // sky
    '#f59e0b', // amber
    '#8b5cf6', // purple
    '#ec4899', // pink
    '#3b82f6', // blue
    '#f97316', // orange
];
const SERIES_TOKENS = ['green', 'sky', 'amber', 'purple', 'pink', 'blue', 'orange'];

export function seriesColor(index) {
    return CHART_SERIES[index % CHART_SERIES.length];
}

// Status colors for chart marks that encode state (pass/fail bands, threshold
// lines). Reserved for state — never used as "series 8". Always pair with a
// label or icon; never state by color alone.
export const CHART_STATUS = {
    good: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
    neutral: '#64748b',
};

const currentTheme = () =>
    typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

// Literal hex for the active theme (for canvas/PNG export, where CSS can't reach).
export function resolveSeriesColor(index, theme = currentTheme()) {
    const token = SERIES_TOKENS[index % SERIES_TOKENS.length];
    return palette.tokens[token][theme].base;
}
