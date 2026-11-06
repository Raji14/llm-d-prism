# Prism instances: engineering design

- **Status**: Implemented on `feat/prism-instances`. No backend schema change.
- **Product and UI**: [product_spec.md](product_spec.md) · [ui_spec.md](ui_spec.md)
- **Builds on**: [Results Store design §6.3](../results-store-ui/design.md) (the server knows its instance)

## Runtime configuration

| Variable | Values | Default | Read by |
| :--- | :--- | :--- | :--- |
| `PRISM_INSTANCE` | `internal`, `public` | `public` | client (`readInstanceMode`), `GET /api/config` |
| `PRISM_BRAND` | `llm-d`, `prism` | `prism` | client (`readBrand`), `GET /api/config`, server (`githubAdminOrg`) |
| `SITE_NAME` | free text | none | client (`readSiteName`), `GET /api/config` (existing) |
| `PRISM_PINNED_REPORTS` | report ids, space-separated | every built-in report | client (`readPinnedReports`) |
| `PRISM_GITHUB_ADMIN_ORG` | a GitHub org name | `llm-d` when `PRISM_BRAND=llm-d`, else none | server only (`githubAdminOrg` in `server/oauth.ts`) |

**Delivery.** `server/server.js` already rewrites `index.html` on every page request to inject `window.env` (today, `GOOGLE_API_KEY`). It now injects the first four variables above too, and escapes `<` so a value can't close the script tag. The values are there synchronously at boot, so the header and tab title show the right brand on first paint. `GET /api/config` also returns `instance` and `brand`.

**Resolution order** (client, `src/config/site.js`): the dev-only URL preview, then `window.env`, then `VITE_PRISM_INSTANCE` / `VITE_PRISM_BRAND` (build time, kept for compatibility), then the default. A value that isn't allowed falls through to the next source.

`src/components/ResultsStore/instance.js` re-exports `readInstanceMode` from `src/config/site.js`, so the Results Store, Leaderboard and Compare follow the same rule with no import changes.

**Who approves.** Approvers are admins: the GitHub handles in `prism-iam/github-admin-allowlist.txt` in the instance's IAM bucket (the first of `DEFAULT_BUCKETS`, see `server/iam.ts`), plus the admins of `githubAdminOrg()`. That's the llm-d org on llm-d Prism, as before, and no org anywhere else unless the deployment names one. Before this change every deployment made llm-d's org admins approvers, including internal ones.

## Files

- `src/config/site.js` (new): instance, brand, site name, pinned reports, display name, document title, and `applySiteToDocument()`.
- `src/main.jsx`: calls `applySiteToDocument()` before rendering.
- `src/components/ui/BrandMarks.jsx`: `PrismMark`, `BrandLockup`.
- `src/components/layout/SiteHeader.jsx`, `SiteFooter.jsx`, `navigation.js` (`submitFor(instance)`). The header also shows approvers a queue pill (`useWaitingForApprover`).
- `src/components/PrismHome.jsx`: copy per instance and brand, pinned reports.
- `src/hooks/useDashboardData.jsx`: the tab title follows the same rule once `/api/config` loads.
- Results Store, same journey on both instances (see [ui_spec.md](ui_spec.md#results-store-side-by-side)):
  - `ResultsStore/instance.js`: one verb set per instance and `copyFor(instance, { canApprove, siteName })`.
  - `ResultsStore/WorkspaceProvider.jsx`: `requestOfficial`, `publishRuns(…, { request })`; approving on internal marks a result Official and keeps `requestedBy`; undo restores the instance's status.
  - `ResultsStore.jsx`, `CurveEditor.jsx`, `PublishDialog.jsx`, `MyWorkTab.jsx`, `ReviewQueueTab.jsx`, `BrowseTab.jsx`, `RunDetail.jsx`: Request official, the Approval queue, "See it on the Leaderboard", no instance switch in the dev preview bar, no classic-view links.
  - `DataConnections/SubmitValidationPage.jsx`: internal always stages (no Attribution & DCO step) and never says community or public.
- Leaderboard: `utils/leaderboardSources.js` (`lineageOf`, `leaderboardLinkFor`), `RecipeDetailDrawer.jsx` (approver line, link back to the result), `LeaderboardDashboard.jsx` (a `recipe` link scopes to that result's model and workload), `App.jsx` (`results-store` takes `curve` and `tab`).
- `src/utils/resultsWorkspace.js` (new): the workspace key and a dependency-free count of what's waiting, for the header.
- `server/server.js`: injects the variables; `/api/config` adds `instance` and `brand`.
- `server/oauth.ts`: `githubAdminOrg()`; org roles are only looked up where this Prism trusts an org.
- `deploy.sh`: `--instance`, `--brand`, `--pinned-reports` and `--github-admin-org` flags. It passes `PRISM_*` to Cloud Run and saves them with the config.
- `deploy/prod.env`: `PRISM_INSTANCE="public"`, `PRISM_BRAND="llm-d"`, `PRISM_GITHUB_ADMIN_ORG="llm-d"`.
- `deploy/internal.env.example` (new): a starting point for Internal Prism.

## Backend and schema

No schema change and no new routes. The server passes environment variables through to the page, and `server/oauth.ts` decides which GitHub org (if any) grants roles. Results, requests and approvals are still saved in the browser until the server-side result entity exists ([Results Store design](../results-store-ui/design.md)); that's the next step for the approval flow to work across people.

## Rollout

1. `deploy/prod.env` sets `PRISM_BRAND="llm-d"` and `PRISM_GITHUB_ADMIN_ORG="llm-d"` in the same change, so prism.llm-d.ai keeps its logo and its approvers when this merges.
2. Internal Prism: copy `deploy/internal.env.example` to a private config file, fill in the project, buckets, `PUBLIC_URL` and OAuth secrets, then run `./deploy.sh --config <file>`.
3. **Front door.** `ALLOW_UNAUTHENTICATED="false"` makes Cloud Run demand a Google identity token with `run.invoker` on every request. Browsers don't send one, so on its own it locks people out instead of asking them to sign in. Put Identity-Aware Proxy (or a load balancer with IAP) in front, grant access there, and use that URL as `PUBLIC_URL`. GitHub sign-in inside Prism records who uploaded, asked and approved; it doesn't keep anyone out.
4. **Approvers.** List them in `prism-iam/github-admin-allowlist.txt` in the instance's bucket. llm-d's org admins aren't approvers on Internal Prism unless `PRISM_GITHUB_ADMIN_ORG` names an org.
5. **Behavior change for other deployments.** A deployment that doesn't set `PRISM_BRAND=llm-d` (or `PRISM_GITHUB_ADMIN_ORG`) no longer makes llm-d org admins approvers, or org members contributors. Add them to that deployment's allowlists if they should keep access. Local dev servers too: set `PRISM_BRAND=llm-d` or use the dev preview's Role switch.
6. Analytics: the example clears `GA_TRACKING_ID`. Otherwise `deploy.sh` defaults to llm-d's property, and internal traffic would land there.

## Testing

- `npx tsx src/config/site.test.js`: resolution order, invalid values, pinned-id parsing, titles.
- `npx tsx src/components/ResultsStore/instance.test.js`: one verb set per instance, the request verbs, the badge name, no "public" or "community" on internal.
- `npx tsx src/utils/leaderboardSources.test.js`: lineage on entries, `leaderboardLinkFor` only for results that rank, the header's waiting count.
- `npx tsx server/oauth.test.ts`: which org's admins approve on which Prism.
- Browser checks: llm-d Prism and Internal Prism through an injected `window.env`, the dev preview parameters, and the production build served by `server/server.js` with real environment variables. The Results Store journey end to end on both entry points: request, approve, see it on the Leaderboard, lineage in the drawer, the header pill, the internal upload page.
- `deploy.sh` run with a stubbed `gcloud` to confirm the variables it sends to Cloud Run and that a bad org name is refused.

## Follow-ups

- Server storage for results, requests and approvals, so the approval flow works across people and machines (Results Store design, P0).
- High-resolution or SVG artwork for the Prism mark. The original is 32×32.
- Server-rendered `<title>` and Open Graph tags per brand, for link previews.
- Server enforcement of the instance's publish rule (Results Store design §6.3).
- Notifications beyond the header pill (email or chat webhook), if Sean wants them.
- Delete the classic Results Store (`?classic=1`, unlinked) once server submissions are fully covered by the next-gen store.
