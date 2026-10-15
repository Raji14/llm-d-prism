# Prism 2.0 — Technical Design

## Architecture Overview

1. **Pre-paint Theme Bootstrap (`index.html` + `src/theme/useTheme.js`)**:
   - Inline `<script>` in `index.html` reads `localStorage['prism-theme']` (default `'light'`) and optional `?theme=light|dark` query override, setting `document.documentElement.dataset.theme`, `style.colorScheme`, and keeping `.dark` on `<html>` before first paint.
   - `useTheme()` dispatches and listens to `prism-theme-change` on `window` so `App` re-renders and Recharts axis/grid helpers (`getChartTheme()`, `gridProps()`) recompute immediately without unmounting views.

2. **CSS Variable Remap Engine (`scripts/generate_theme_css.mjs` → `src/theme/palette.generated.css`)**:
   - Reads Tailwind v4's `@theme` variables, Tailwind v3 color hexes (`scripts/vendor/tw3-colors.js`), and `src/theme/chartPalette.json`.
   - Emits `:root[data-theme="light"] body` variable inversions for dark-first legacy dashboards (`slate/gray/zinc/neutral` 950→`#f5f7fa`, 900→`#ffffff`, `white`→dark ink, chromatic shades inverted for contrast).
   - Emits `.surface-light` identity overrides in light mode and dark inversions under `:root[data-theme="dark"] .surface-light`, plus `.surface-light .surface-keep` identity preservation for intentional dark sections.
   - Emits attribute and inline-style redirects mapping legacy SVG `fill`/`stroke`/`stop-color` hexes and inline `rgb(...)` swatch styles to `--cvd-*` CSS variables.

3. **Palette Validation (`scripts/validate_chart_palette.py`)**:
   - Verifies WCAG 1.4.11 contrast (≥ 3.0:1) against page and chart surfaces in both themes and computes minimum pairwise OKLab×100 Euclidean distance under Machado (2009) protanopia, deuteranopia, and tritanopia matrices.

4. **One source per number (`src/utils/`)**:
   - `wellLitPathData.js`: the routing, prefix-cache and P/D benchmark data the well-lit path dashboards plot. The dashboards import it rather than embedding it.
   - `wellLitProofs.js`: derives each path's headline (`ROUTING_PROOF`, `PREFIX_CACHE_PROOF`, `PD_PROOF`) from that data, with its conditions and full sweep. Home's proof cards show the headline with a mini chart of the sweep; MethodologyPage shows the full sweep. A proof is `null` when the data can't support a defensible number.
   - `leaderboardFacets.js`: the Leaderboard vocabulary (objectives, workload classes and their classification rules, accelerator and engine options). Home's chips, the Leaderboard sentence and MethodologyPage read the same lists, so a chip always lands on a filter the Leaderboard understands.
   - `leaderboardData.js`: normalizes entries with `is_sample`, `tokens_per_sec_per_chip` and `workload_class`. Seed recipes get `verification_status: 'sample'`; a declared accelerator wins over one parsed from free text.

5. **Code splitting (`src/App.jsx`)**:
   - `PrismHome` stays in the entry chunk; every other view is `React.lazy` behind one `<Suspense fallback={<LoadingState size="md" />}>`, so the Recharts-heavy dashboards load on demand (entry chunk 1.62 MB → 541 KB, 428 → 166 KB gzip).
   - Entry-chunk code imports primitives by file (`./ui/Button.jsx`), because `./ui/index.js` re-exports chart code.
   - Follow-up: `loadAllData` still runs at startup for every view, including Home, which needs only the submitted runs. Deferring it means untangling `fetchConfig` (analytics, site name) from the connection-restore logic in `useDashboardData`.

6. **Navigation params (`src/App.jsx`)**:
   - `LEADERBOARD_PARAMS` (`workload`, `hardware`, `engine`, `sort`, `q`, `ttft_sla`, `tpot_sla`) are cleared when the view changes, except between `model-leaderboard` and `recipe-comparison` (one flow), so a filter never leaks into another view (e.g. `workload` is also the Workload Catalog's iframe id).
   - `onNavigate(view, { hash })` appends an in-page anchor; the target view scrolls to it on mount (MethodologyPage).
