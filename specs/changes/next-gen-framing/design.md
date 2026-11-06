# Next-gen framing: engineering design

- **Status**: Implemented on `feat/next-gen-framing`. No backend or schema change.
- **Product and UI**: [product_spec.md](product_spec.md) · [ui_spec.md](ui_spec.md)

## What changes

Client only. The server, the results store APIs, storage and deploy settings don't change.

| File | Change |
| :--- | :--- |
| `src/components/layout/navigation.js` | `NAV` is now Leaderboard, Results store (`also: ['submit-benchmarks']`), Well-lit paths, Regressions. The `tools` group and its icons are gone. The header and mobile menu already render `NAV` generically. |
| `src/components/layout/SiteFooter.jsx` | Explore lists every top-level `NAV` entry with a `view`. The Tools column is removed, and the grid drops a column. |
| `src/components/PrismHome.jsx` | Four-card `TOOLKIT`. Cards can carry `params`. `COMPARE = { view: 'results-store', params: { intent: 'compare' } }`. `heroJobsFrom` takes every non-Leaderboard card. `MORE_TOOLS` is removed. llm-d Prism's step copy changes. |
| `src/App.jsx` | `handleNavigate('results-store', { intent: 'compare' })` writes `intent=compare` (same branch as `curve` and `tab`, so the store opens fresh, not where it was left). The store's `onNavigateBack` is `handleNavigate('home')`. |
| `src/components/ResultsStore.jsx` | `compareHint` state from `readParam('intent') === 'compare'`. `nav.openCompare` clears it. The URL sync deletes `intent`. The note renders above Browse. `openInBrowser` and its `setSelectedBenchmarks` use are removed. |
| `src/components/ResultsStore/CompareView.jsx` | The benchmark browser footnote and the `onOpenInBrowser` prop are removed. |
| `src/components/Leaderboard/RecipeDetailDrawer.jsx` | The *View in Explorer* link is removed. |
| `src/components/MethodologyPage.jsx` | The *Explore the schema* button is removed. |
| `src/components/AgenticWorkloadsDashboard.jsx` | The harness link is an external `<a>` to `kubernetes-sigs/inference-perf`. The unused `onNavigate` prop is dropped. |

## Retired routes stay routable

`App.jsx` keeps rendering `Dashboard` (`benchmark-browser`), `WorkloadCatalog` and `SchemaExplorer`, plus the legacy `benchmark-comparison` → `benchmark-browser` mapping and the benchmark browser's own share links (`useDashboardState.generateShareUrl`). Deleting them is a separate change, after the decision with Jason. Upstream is still developing `Dashboard.jsx` (time series #151, tag filters #160, Pareto fix #175), so a deletion here would collide with that work during the merge.

`LeftNavigation.jsx` still lists the three tools, but nothing imports it. It's left as is, to be deleted with the tools.

## Why `intent=compare` and not a deep link into Compare

A Results Store comparison is defined by its items (`?compare=<encoded runs>`), and there's no empty Compare screen to land on. The person still has to pick their run and baseline, so the entry point is Browse with instructions, using the existing banner pattern. A dedicated "pick a baseline" screen can come later if people get stuck.

## Testing

- `scratch/framing.mjs`: a browser walk on llm-d Prism and Internal Prism (nav, footer, toolkit, steps, compare note, Home button, removed links, retired URLs).
- Regression walks: Results Store (`rs_fixes.mjs`), Leaderboard (`lb_after.mjs`), both Homes (`home_instances.mjs`).
- Unit tests, lint on changed files, and `npm run build`.

## Rollout

Ship to a separate preview service (for example `prism-next` from `deploy/preview.env`), not `main`, for the Friday review. Merging goes through the integration branch from `upstream/main` with the other Phase 1 PRs.

## Follow-ups

- Decide the benchmark browser's fate with Jason: delete it, or fold its time series, tag filters and share links into Results Store discovery.
- Delete `WorkloadCatalog.jsx`, `SchemaExplorer.jsx` and `LeftNavigation.jsx` once the routes go.
- Update the agent skills under `users/` that still point at the benchmark browser.
