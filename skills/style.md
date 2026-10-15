---
name: style
description: The UI/style contract for Prism 2.0. Read before ANY change that adds or modifies JSX markup, Tailwind classes, colors, or chart styling — and to scaffold a new dashboard from benchmark results.
---

# Prism Style Contract (Prism 2.0)

Every UI change in Prism goes through this contract. It exists so that humans and
agents produce the same UI the same way: primitives from `src/components/ui/`,
colors from theme tokens, charts from the shared chart layer, and app-wide
navigation from `src/components/layout/`. If you follow this file, a new
dashboard needs zero visual review round-trips on basics.

## When to use

- Adding or modifying any JSX markup, Tailwind classes, colors, or chart styling.
- Creating a new dashboard or page (see the recipe at the bottom).
- Reviewing a PR that touches `src/components/`, `src/theme/`, or `src/index.css`.

## Changing this contract

This file (and the `src/components/ui/` API it governs) changes only with
approval from one of **@seanhorgan** or **@raji14**. Changes to
`specs/main/roadmap.md` require one of **@seanhorgan** or **@jjk-g**. The full
pipeline and its approval gates are documented in
`specs/main/dashboard-pipeline.md`.

## The rules

1. **Use the primitives.** Buttons, badges/status chips, modals, form fields,
   panels, stat/KPI cards, empty states, spinners, page headers, toggle groups,
   chart containers/axes/tooltips, brand marks come from `src/components/ui/`.
   Never re-implement one inline. If a variant you need is missing, extend the
   primitive (new `variant`/`tone`/`size`) in the same PR — don't fork it.
2. **Colors come from tokens or the chart palette. No hex literals.**
   - No `#rrggbb` anywhere in `src/components/` outside `src/components/ui/`
     (the single exception is the `CERT_THEME` block in `CertificateModal.jsx`,
     which styles a downloadable export artifact, not themed UI).
   - **Brand accent is `accent-*`** (`text-accent-600`, `bg-accent-50`,
     `border-accent-200`, `ring-accent-500/20`…). Never `orange-*`, `cyan-*`,
     or any other hue for brand chrome. See **Brand accent** below.
   - Neutrals are warm `zinc-*` (or the `theme-*` semantic tokens). Never
     `slate-*`/`gray-*`/`stone-*`/`neutral-*` in new code.
   - Status hues are fixed: `emerald` = success, `amber` = warning, `red` =
     danger, `sky` = info. Use them through `Badge`/`StatusChip` tones.
   - Chart series colors come from `CHART_SERIES`/`seriesColor()`; chart
     chrome (grid, crosshair, outlines, selection) from `getChartTheme()`,
     `gridProps()`, `cursorProps()`. Literal hex only via `resolveSeriesColor()`
     for canvas/PNG export.
3. **Typography comes from the scale.** No arbitrary `text-[Npx]`,
   `tracking-[…]` or `font-['…']` values. Use the tokens and composite
   utilities in **Typography scale** below.
4. **Extract on second use.** Markup repeated in two places becomes a primitive
   (or a variant of one) in `src/components/ui/` in the same PR. Never
   copy-paste styled JSX between components.
5. **Unified editorial light theme across the entire app.** Prism 2.0 is locked
   to `data-theme="light"` on `<html>`. Every page shares the editorial,
   architectural visual language established on `PrismHome`:
   - Pure `#ffffff` canvas and warm `zinc` (`zinc-50` / `zinc-100` / `zinc-200`)
     surfaces with crisp hairline borders (`border-zinc-200` / `border-theme-border`).
   - Controls: `rounded-full` pill buttons (`bg-zinc-900 text-white hover:bg-zinc-700`
     primary; `border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50`
     secondary), `rounded-full` badges, and `rounded-full` segmented controls.
   - Decoration is reserved for `PrismHome` and limited to three sanctioned
     pieces: the hero's faint dot grid (`bg-[radial-gradient(...)]` masked to
     the top of the section), the `FrontierRays` curve fan (hero corners in
     `text-accent-600`, dark band in `text-white`), and the dark band's single
     `bg-accent-500/15 blur-[120px]` glow. All are `pointer-events-none`,
     `aria-hidden` and must never sit behind body text. Everywhere else:
     **no** dot grids, **no** blur blobs, **no** neon, and **no** secondary
     fixed/sticky navbar bars underneath `SiteHeader`.
6. **Class composition uses `cn()`** from `src/utils/cn.js` — never template
   literals with `${}` for conditional classes.
7. **Behavior-free styling changes.** A style refactor never changes state,
   props, data flow, or copy. If you need both, separate the commits.

## Brand accent (`accent-*`)

The accent is the **llm-d brand plum** (`#7f317f`, sampled from the llm-d
logotype) so Prism reads as part of the llm-d family. It is defined **once** as
an 11-step ramp in the `@theme` block of `src/index.css`
(`--color-accent-50 … --color-accent-950`), which gives you the full Tailwind
utility family: `text-accent-600`, `bg-accent-50`, `border-accent-200`,
`ring-accent-500/20`, `from-accent-500`, `stroke-accent-500`, `accent-accent-600`
(form controls) and so on.

| Use | Utility | Contrast |
|---|---|---|
| Kickers, links, active nav indicator, icons on white | `text-accent-600` / `bg-accent-600` | 7.9 : 1 on white |
| Decorative strokes, dots, hero curves | `text-accent-500` / `stroke-accent-500` | 4.6 : 1 on white |
| Tinted chips / selected rows | `bg-accent-50 border-accent-200 text-accent-700` | — |
| Accent text on the dark `.surface-keep` band | `text-accent-400` / `text-accent-300` | 7.0 : 1 on zinc-950 |
| Hover on solid accent | `hover:bg-accent-700` | — |

> The ramp lives on `:root`, so — unlike `slate-*`/hue utilities — it is **not**
> inverted by the light/dark remap. `text-accent-600` renders identically inside
> `.surface-light` and legacy dark-first subtrees.

**Re-skinning the accent** is a one-place change: edit the ramp in
`src/index.css` (and `FALLBACKS['--color-accent-600']` in
`src/components/ui/charts/theme.js`). Nothing else in `src/` names the hue.

Accent vs. chart palette: the accent is deliberately *UI chrome*, never a data
series. It sits closest to the `pink` chart token (`#863267`, slot 7 — the
least-used series), the same relationship the previous orange accent had with
the `orange`/`amber` chart tokens.

## Typography scale

Fonts are `Geist` (`font-sans`, body/UI), `Geist Mono` (`font-mono`, metrics and
specs — always with `tabular-nums`), and `Bricolage Grotesque` (`font-display`,
titles and KPI numbers). Never spell these out as `font-['…']`.

| Token / utility | Value | Use |
|---|---|---|
| `text-micro` | 11px / 16px | kickers, metadata rows, badge `sm` |
| `text-tiny` | 10px / 14px | table headers, chips, axis-adjacent labels, badge `xs` |
| `tracking-kicker` | `0.14em` | uppercase labels |
| `tracking-display` | `-0.03em` | display titles, KPI numbers |
| `kicker` | `text-micro font-semibold uppercase tracking-kicker` | section eyebrows (pair with `text-accent-600` or `text-zinc-500`) |
| `label-caps` | `text-tiny font-semibold uppercase tracking-wider` | table/column headers, field labels |
| `display-title` | `font-display font-bold tracking-display` | page titles, panel headings, KPI values |

Nothing smaller than `text-tiny` is allowed (8–9px fails legibility). Uppercase
labels are always `font-semibold` — never `font-bold`/`font-extrabold`.
Standard Tailwind sizes (`text-xs` … `text-6xl`) cover everything else; the
only sanctioned arbitrary sizes are the responsive hero/display steps on
`PrismHome` and `PageHeader` (`text-[28px]`, `text-[36px]`, `text-[40px]`,
`text-[84px]`) and the 15px home-page body step.

## Theme engine & surface classes

Prism 2.0 is locked to **light mode** (`<html class="dark" data-theme="light">`),
backed by generated CSS variable remaps in `src/theme/palette.generated.css`
(built from `src/theme/chartPalette.json` via `node scripts/generate_theme_css.mjs`):

- **Default (remapped) views**: Under `:root[data-theme="light"] body`,
  Tailwind v4 neutral families (`slate`, `gray`, `zinc`, `neutral`, `stone`) are
  mapped to warm `zinc` shades so legacy `bg-slate-950` / `bg-slate-900` classes
  render as `#ffffff` / `#fafafa` warm-zinc surfaces with dark `#09090b` ink.
  Hue shades are inverted (`TO_LIGHT`: 400 → 700, 600 → 400, …) so legacy
  dark-first `text-emerald-400` stays legible on white.
- **Light-first subtrees (`.surface-light`)**: Surfaces authored directly with
  natural light classes (`bg-white`, `text-zinc-900`, `border-zinc-200`) carry
  `className="surface-light"` so they receive identity Tailwind variables.
  Only apply `.surface-light` to subtrees authored entirely with light-first
  classes (`PrismHome`, `SiteHeader`, `SiteFooter`, `PageHeader`, `WellLitHeader`,
  and light-first filter/card sections).
- **Intentional dark bands (`.surface-keep`)**: Inside a `.surface-light`
  container, add `surface-keep` to any section that should remain dark (such as
  the dark "How it works" band on `PrismHome`).
- **Not remapped**: `accent-*`, `theme-*` and the `--cvd-*` chart tokens are
  defined on `:root` and render the same everywhere.

### Semantic theme tokens

Defined in `src/index.css` and `src/theme/palette.generated.css` (values are
warm zinc, deliberately one unit off the Tailwind v3 hexes so the legacy
chart-hex redirects never re-map them):

| Tailwind class | CSS variable | Use for |
|---|---|---|
| `bg-theme-bg` | `--bg-primary` | Page background (`#ffffff`) |
| `bg-theme-card` | `--bg-card` | Cards, panels, modals, tooltips (`#ffffff`) |
| `border-theme-border` | `--border-color` | All hairline borders (`#e4e4e6`, safe in both `.surface-light` and remapped subtrees) |
| `text-theme-text` | `--text-primary` | Headings, values, primary ink (`#18181a`) |
| `text-theme-muted` | `--text-muted` | Secondary/label ink (`#71717b`) |
| (js) `getChartTheme()` | `--chart-grid`, `--chart-axis`, `--chart-surface`, `--text-*`, `--color-accent-600` | Chart grid, axis, surface, ink and accent |
| — | `--brand-accent`, `--brand-accent-hover`, `--brand-accent-bg` | Aliases of `accent-600/700/50` for non-Tailwind CSS |

## Global application shell & navigation

All views render inside the shared Prism 2.0 shell in `src/App.jsx`:

1. **`SiteHeader` (`src/components/layout/SiteHeader.jsx`)**: Sticky `h-16` top
   bar (`max-w-6xl`) outside `<main>` with:
   - `llm-d` logotype + vertical divider + `Prism` wordmark (links to `home`),
   - Top-level links and click-to-open dropdown menus defined in
     `src/components/layout/navigation.js` (`Leaderboard`, `Well-lit paths ▾`,
     `Tools ▾`, `Docs ↗`) with an active `bg-accent-500` indicator bar,
   - GitHub repo link and the `Submit a run` CTA, a `Button href variant="secondary"`
     (outline pill) so a view's own primary action stays the only filled button in view,
   - Responsive mobile drawer (`md:hidden`).
2. **Scroll container (`<main>`)**: `flex-1 min-h-0 overflow-y-auto flex flex-col`.
   Individual views must use `min-h-full` (never `min-h-screen` or `h-screen`) on
   their root element and must NOT add left sidebar padding (`pl-24` / `pl-28`)
   or secondary fixed top bars.
3. **`SiteFooter` (`src/components/layout/SiteFooter.jsx`)**: Rendered at the
   bottom of `<main>` across every view (`max-w-6xl`) with `Explore` (including
   `How we measure`), `Well-lit paths`, `Tools`, and `Project` link columns plus
   the oversized `Prism` watermark.
4. **Code splitting**: `PrismHome` is the only view in the entry chunk; every
   other view is `React.lazy` inside one `<Suspense fallback={<LoadingState size="md" />}>`.
   Register new views the same way, and import primitives by file
   (`./ui/Button.jsx`) from entry-chunk code, since `./ui` re-exports chart code.

## Primitive quick reference

All from `import { ... } from './ui'` (or the relative path to `src/components/ui`).

| Primitive | Key props | Replaces |
|---|---|---|
| `Button` | `variant: primary\|secondary\|ghost\|danger\|dangerOutline\|outline\|link\|inverse\|inverseOutline`, `size: xs\|sm\|md\|lg\|icon`, `isLoading`, `href` | hand-rolled `<button className="px-4 py-2 …">` and button-styled `<a>`s. `href` renders an `<a>` (open-in-new-tab works; disabled → `aria-disabled`). `lg` = `h-12` hero CTA. `inverse` / `inverseOutline` = filled / outline on dark (`bg-zinc-950`) bands |
| `Badge` | `tone: neutral\|brand\|success\|info\|warning\|danger\|violet`, `size: xs\|sm\|md` | ad-hoc chip spans |
| `StatusChip` | `status: staged\|processing\|in_review\|approved\|verified\|community_validated\|sample\|rejected\|…` (auto tone+label+dot) | status color ternaries. `sample` marks illustrative data that must never pass as measured |
| `Modal` | `isOpen, onClose, title, subtitle, size: sm\|md\|lg\|xl, footer, closeOnBackdrop, closeOnEscape` | `fixed inset-0` overlays |
| `Input/Select/Textarea/Checkbox/Label` | `error`, standard DOM props | ad-hoc form field styling |
| `Panel` | `title, kicker, subtitle, actions, padding: none\|sm\|md`, `titleAs` (default `h3`), `kickerAs` (default `div`) | ad-hoc panel shells. `titleAs="h2"` when the panel heads a top-level section of the page; `kickerAs="h2"` when the kicker is its only label |
| `StatCard` | `icon, title, value, details[], onClick, active` | KPI cards (clickable = filter card) |
| `EmptyState` | `icon, title, message, action` | "No data" markup |
| `Spinner` / `LoadingState` | `size` / `label, fullPage` | inline `animate-spin` loaders; `fullPage` = pre-data dashboard shell |
| `PageHeader` | `kicker, title, subtitle, badge, onNavigateBack, actions, children` | editorial in-flow page hero with `HeroCurvesBg` |
| `WellLitHeader` | `kicker, title, subtitle, badgeText, onNavigateBack, customShare, children` | editorial hero for Well-lit Path dashboards |
| `HeroCurvesBg` | `className` | subtle accent perspective-fan SVG backdrop |
| `SectionLabel` | `tone: accent\|muted`, `children` | section kicker (`kicker` utility + accent color) |
| `GoogleMark` | `className, title` | the Google "G" next to GCP machine types (fixed brand colors, exempt from theme redirect) |
| `ShareLinkButton` | — (copies URL + "Link copied!" toast) | per-dashboard share buttons |
| `ToggleGroup` | `options[{value,label}], value, onChange, fullWidth`, `aria-label` or `aria-labelledby` | `rounded-full` metric/mode pill selectors (`bg-zinc-900 text-white` active). Always name the group: two unnamed groups side by side sound the same to a screen reader |
| `Tabs` / `TabPanel` | `tabs[{value,label,count?,icon?}], value, onChange, ariaLabel, idBase` / `idBase, value` | page-section underline tabs (Results store). Active = `text-accent-700 font-semibold` + 3px `bg-accent-600` bar + filled count; baseline is an inset shadow so the bar isn't clipped when the row scrolls. Pass one `useId()` as `idBase` to both and render the selected tab's content in the `TabPanel` |
| `Switch` | `checked, onChange, label, aria-label, disabled` | on/off settings that apply immediately (e.g. *Show in Browse*): `role="switch"` track + knob, `bg-accent-600` when on, `label` = visible state text. Never a ghost button that reads "Shown"/"Hidden" |
| `StatPills` | `options[], active[], onToggle` | `rounded-full` stat/percentile visibility multi-toggles |
| `FactCell` | `label, value, title` | scenario-card label + mono value cells |
| `InlineSelect` | `value, onChange, options[{value,label,display?}], label` | a filter written as a word in a sentence ("Show me the **fastest** way to serve **any model**…"); dashed `accent-400` underline, native `<select>` overlay for a11y. `display` = text in the sentence, `label` = text in the menu (e.g. with run counts) |

## Chart rules & accessible CVD palette

- Wrap every chart in `ChartContainer` (`title`, filter controls in `actions`,
  one row above the plot).
- Axes: `ChartXAxis` / `ChartYAxis` (theme-aware). Grid: `<CartesianGrid {...gridProps()} />`.
  Crosshair: `<Tooltip cursor={cursorProps()} />`. Mark outlines / halos:
  `getChartTheme().surface`. Selected mark: `getChartTheme().accent`.
  Marks *on* a Pareto frontier share the frontier line's `CHART_STATUS.warning`
  outline — so "selected" and "frontier" are never the same hue.
  De-emphasised / "other": `getChartTheme().muted`.
- **Axis domain and ticks**: Prefer including zero on linear scales for a proper baseline. Ticks must be normalized (even, clean distributions). Extend domains slightly beyond the max data point (e.g. 5% upper padding) so data marks are not clipped at the outer edges of the plot. Use `getAxisConfig(minVal, maxVal, isLog, options)` from `./ui` to compute domains and ticks, and configure sufficient margins (e.g., `left: 60`, `bottom: 45`).
- **Accessible, colorblind-safe 7-series palette (`src/theme/chartPalette.json`)**:
  - `CHART_SERIES` exports 7 canonical sentinel hexes in fixed order:
    `[green #10b981, sky #0ea5e9, amber #f59e0b, purple #8b5cf6, pink #ec4899, blue #3b82f6, orange #f97316]`.
  - At render time, `src/theme/palette.generated.css` redirects SVG
    `fill`/`stroke`/`stop-color` attributes and inline swatch styles to the
    light theme's `--cvd-*` tokens:
    green `#0e825e`, sky `#0095b6`, amber `#b6811c`, purple `#895ee3`,
    pink `#863267`, blue `#1c3bb5`, orange `#b54a07`.
  - Every token satisfies **WCAG 1.4.11 non-text contrast ≥ 3.0:1** against
    both page and chart surfaces, and all 21 pairwise combinations maintain
    **OKLab perceptual distance ×100 ≥ 9.3** across normal vision, protanopia,
    deuteranopia, and tritanopia (Machado 2009 simulation).
  - Run `python3 scripts/validate_chart_palette.py` after any edit to
    `src/theme/chartPalette.json`, then regenerate CSS with
    `node scripts/generate_theme_css.mjs`.
  - Assign series colors by entity, never by rank. More than 7 series → fold
    into "Other" or use small multiples. Use `resolveSeriesColor(index, theme)`
    when a non-SVG consumer (e.g. `<canvas>`) needs the resolved hex literal.
- Status colors in charts come from `CHART_STATUS` and are reserved for state —
  never used as an extra series color; always paired with a label.
- **One axis.** Never two y-scales on one chart.
- **Canonical metric selectors**:
  - Latency: `NTPOT | TPOT | TTFT | ITL | E2E` (`ntpot | tpot | ttft | itl | e2e`).
  - Throughput: `Output | Input | Total | QPS` (`output | input | total | qps`).
  - Stats: `Mean | P50 | P90 | P99`.
- **Stat bars are opacity-encoded, not single-select**: `P50`/`Mean` = 1,
  `P90` = 0.6, `P99` = 0.35, controlled by `StatPills`.
- **Collapsible chart filters**: When a chart has more than one control group,
  put a `Filters` toggle in `ChartContainer` `actions`.
- **Bar marks**: `radius={[6, 6, 0, 0]}`, `isAnimationActive={false}`,
  `barCategoryGap="25%"`; `<Tooltip {...tooltipProps()} />`.
- Tooltips: build on `ChartTooltip` + `ChartTooltipRow`.
- ≥2 series → render a `ChartLegend` directly below the plot inside `ChartContainer`.
  Point *state* encodings drawn as strokes (frontier, selected) get a legend entry
  with `variant: 'outline'` (ring swatch) so the outline colors are explained.

## Well-lit path dashboard anatomy

A "well-lit path" dashboard shares the editorial layout across Intelligent
routing, Prefix cache offloading, Agentic serving, and Prefill/Decode
disaggregation:

1. **Header**: Open with `<WellLitHeader>` (which wraps `<PageHeader>` with
   `kicker="Well-lit path"`, `badgeText="Guided path"`, `title`, `subtitle`,
   and optional `children` below the title block for the architectural overview
   and interactive optimization selector cards).
2. **Page root & content container** (`min-h-full`, `bg-white`, `mx-auto max-w-6xl px-4 sm:px-6`):
   ```jsx
   <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans relative overflow-x-hidden">
     <WellLitHeader title="..." subtitle="..." onNavigateBack={onNavigateBack}>
       {/* Overview + Optimization cards */}
     </WellLitHeader>
     <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8 relative z-10">
       {/* Scenario/Outcomes/Action 12-col row -> ChartContainers -> Results table */}
     </div>
   </div>
   ```
3. **Section order**: `WellLitHeader` (with Overview + Selectable optimizations +
   Upcoming/Roadmap) → Scenario/Outcomes/Action 12-col row (`rounded-3xl border border-zinc-200 bg-white`) →
   `ChartContainer`s → Results table.
4. **PrismHome entry**: Add the path to the `paths` group of `NAV` in
   `src/components/layout/navigation.js` (Home reads its title, description and
   badge from there). A headline number goes in `src/utils/wellLitProofs.js`,
   computed from the dashboard's data in `src/utils/wellLitPathData.js`, never
   typed in; it then gets a card in `PROOF_CARDS` in `src/components/PrismHome.jsx`
   (layer kicker, plain-SVG mini chart drawn from `proof.points`, legend and
   unit) and a `PathProof` card with its full sweep in MethodologyPage's
   `#paths` section. No defensible number → no Home card; link the path in
   the band's "Also live" footnote instead.

## Recipe: new dashboard from benchmark results

1. **Spec first.** Create `specs/changes/<name>/` (`product_spec.md`,
   `ui_spec.md`, `design.md`).
2. **Data in.** Add a server endpoint or scanner returning normalized run objects.
3. **Scaffold the component** at `src/components/<Name>Dashboard.jsx` using
   `WellLitHeader` or `PageHeader`, `ChartContainer`, `ChartXAxis`, `ChartYAxis`,
   `gridProps`, and `seriesColor`.
4. **Register the view** in `src/App.jsx` and add it to `NAV` in
   `src/components/layout/navigation.js`.
5. **Self-check** against the checklist below, then `npx vite build` and
   `python3 scripts/validate_chart_palette.py`.

## Review checklist (ratchet)

Run on every UI PR — these greps must return nothing for changed files outside
`src/components/ui/`:

```bash
# hex literals, raw overlays, inline spinners
git diff main --name-only -- 'src/components/*.jsx' 'src/components/**/*.jsx' | grep -v '^src/components/ui/' | \
  xargs grep -nE '#[0-9a-fA-F]{6}|fixed inset-0|animate-spin' -- 2>/dev/null
# off-contract color / typography
grep -rnE '\b(orange|cyan)-[0-9]{2,3}\b|text-\[(8|9|9\.5|10|10\.5|11|12|13)px\]|tracking-\[|font-\[' src/components src/App.jsx
# template-literal class conditionals
grep -rnE 'className=\{`' src/components
```

- [ ] No new hex literals or inline `animate-spin` outside `src/components/ui/`.
- [ ] No `orange-*` / `cyan-*`: brand chrome is `accent-*`.
- [ ] No arbitrary `text-[Npx]` / `tracking-[…]` / `font-['…']` — use `text-micro`, `text-tiny`, `kicker`, `label-caps`, `display-title`, `font-display|sans|mono`.
- [ ] No new `fixed inset-0` DIALOGS outside `src/components/ui/` — dialogs use `Modal`.
- [ ] No template-literal class conditionals where `cn()` fits.
- [ ] New repeated markup extracted into `src/components/ui/`.
- [ ] Charts: fixed-order CVD palette, one axis, `ChartContainer` shell, `cursorProps()`/`getChartTheme()` for chrome, tooltip on the shared shell, legend present for ≥2 series.
- [ ] Matches the editorial light theme (`PageHeader`/`WellLitHeader`, `max-w-6xl`, `rounded-3xl` panels, `rounded-full` pill buttons).
