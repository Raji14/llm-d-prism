# Prism instances: engineering design

- **Status**: Implemented on `feat/prism-instances`. No backend schema change.
- **Product and UI**: [product_spec.md](product_spec.md) · [ui_spec.md](ui_spec.md)
- **Builds on**: [Results Store design §6.3](../results-store-ui/design.md) (the server knows its instance)

## Runtime configuration

| Variable | Values | Default | Read by |
| :--- | :--- | :--- | :--- |
| `PRISM_INSTANCE` | `internal`, `public` | `public` | client (`readInstanceMode`), `GET /api/config` |
| `PRISM_BRAND` | `llm-d`, `prism` | `prism` | client (`readBrand`), `GET /api/config` |
| `SITE_NAME` | free text | none | client (`readSiteName`), `GET /api/config` (existing) |
| `PRISM_PINNED_REPORTS` | report ids, space-separated | every built-in report | client (`readPinnedReports`) |

**Delivery.** `server/server.js` already rewrites `index.html` on every page request to inject `window.env` (today, `GOOGLE_API_KEY`). It now injects the four variables above too, and escapes `<` so a value can't close the script tag. The values are there synchronously at boot, so the header and tab title show the right brand on first paint. `GET /api/config` also returns `instance` and `brand`.

**Resolution order** (client, `src/config/site.js`): the dev-only URL preview, then `window.env`, then `VITE_PRISM_INSTANCE` / `VITE_PRISM_BRAND` (build time, kept for compatibility), then the default. A value that isn't allowed falls through to the next source.

`src/components/ResultsStore/instance.js` re-exports `readInstanceMode` from `src/config/site.js`, so the Results Store, Leaderboard and Compare follow the same rule with no import changes.

## Files

- `src/config/site.js` (new): instance, brand, site name, pinned reports, display name, document title, and `applySiteToDocument()`.
- `src/main.jsx`: calls `applySiteToDocument()` before rendering.
- `src/components/ui/BrandMarks.jsx`: `PrismMark`, `BrandLockup`.
- `src/components/layout/SiteHeader.jsx`, `SiteFooter.jsx`, `navigation.js` (`submitFor(instance)`).
- `src/components/PrismHome.jsx`: copy per instance and brand, pinned reports.
- `src/hooks/useDashboardData.jsx`: the tab title follows the same rule once `/api/config` loads.
- `server/server.js`: injects the variables; `/api/config` adds `instance` and `brand`.
- `deploy.sh`: `--instance`, `--brand` and `--pinned-reports` flags. It passes `PRISM_*` to Cloud Run and saves them with the config.
- `deploy/prod.env`: `PRISM_INSTANCE="public"`, `PRISM_BRAND="llm-d"`.
- `deploy/internal.env.example` (new): a starting point for Internal Prism.

## Backend and schema

No schema change and no new routes. The server only passes environment variables through to the page.

## Rollout

1. `deploy/prod.env` sets `PRISM_BRAND="llm-d"` in the same change, so prism.llm-d.ai keeps its logo when this merges. Without it, the public site would show the Prism mark.
2. Internal Prism: copy `deploy/internal.env.example` to a private config file, fill in the project, buckets, `PUBLIC_URL` and OAuth secrets, then run `./deploy.sh --config <file>`.
3. Analytics: the example clears `GA_TRACKING_ID`. Otherwise `deploy.sh` defaults to llm-d's property, and internal traffic would land there.

## Testing

- `npx tsx src/config/site.test.js`: resolution order, invalid values, pinned-id parsing, titles.
- Browser checks: llm-d Prism and Internal Prism through an injected `window.env`, the dev preview parameters, and the production build served by `server/server.js` with real environment variables.
- `deploy.sh` run with a stubbed `gcloud` to confirm the variables it sends to Cloud Run.

## Follow-ups

- High-resolution or SVG artwork for the Prism mark. The original is 32×32.
- Server-rendered `<title>` and Open Graph tags per brand, for link previews.
- Server enforcement of the instance's publish rule (Results Store design §6.3).
