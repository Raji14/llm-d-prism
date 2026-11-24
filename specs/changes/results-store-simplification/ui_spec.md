# Simplified Result Store — UI/UX Specification

- **Status**: Implemented on `prism3.0`
- **Entry & Modules**: [`src/components/ResultsStore.jsx`](../../../src/components/ResultsStore.jsx), [`src/components/ResultsStore/storeClient.js`](../../../src/components/ResultsStore/storeClient.js), [`IngestDialog.jsx`](../../../src/components/ResultsStore/IngestDialog.jsx), [`ResultDetailView.jsx`](../../../src/components/ResultsStore/ResultDetailView.jsx), [`UnifiedCompareView.jsx`](../../../src/components/ResultsStore/UnifiedCompareView.jsx), [`ArtifactsTab.jsx`](../../../src/components/ResultsStore/ArtifactsTab.jsx)
- **Style Contract**: Follows [`skills/style.md`](../../../skills/style.md) (editorial light theme, `src/components/ui/` primitives, `accent-*` + warm `zinc-*` tokens, zero hex literals).

---

## 1. Navigation & Conceptual Simplification

| Retired / Moved | Replacement |
| :--- | :--- |
| `ClassicResultsStore.jsx` (`?classic=1`, 1,529 LOC) | Deleted. |
| `SourcesTab.jsx` (raw GCS/S3 bucket & IAM UI, 361 LOC) | Deleted from Result Store UI; storage backends live in server store config. |
| `DashboardsTab.jsx` (`Watches & reports`, 1,756 LOC) | Nightly regression tracking links to top-level **Regressions**; Reports become **Artifacts**. |
| `MyWorkTab.jsx` (6-section browser-storage to-do list, 473 LOC) | Inline `Mine` and `Status` filters in **Explore**. |
| Binary `PRISM_INSTANCE` copy (`Official` vs `Published`) | Unified terminology (`Publish`, `In review`, `Published`) driven by store governance. |

## 2. Store Selector & Context-Dependent Branding

- **Flat store selector**: Rendered above the tab bar **only** when the caller has access to 2+ stores (`All stores` + each accessible store pill). Hidden when only 1 store exists. No "Public" or "Private" grouping boxes.
- **Branding rules** (`storeHeaderBranding` in [`storeClient.js`](../../../src/components/ResultsStore/storeClient.js)):
  - **Public `llm-d` store** (single-store or explicitly selected): shows `llm-d` logotype badge.
  - **Internal / custom store**: no `llm-d` branding; displays `"Result store"` (or `"<Name> result store"`).
  - **Federated multi-store view (`All stores`)**: neutral `"Result store"` header; individual store pills and rows carry the `llm-d` mark only on the `llm-d` store.
- **Top-level `SiteHeader`**: stays neutral (`Prism` + org badge) whenever multiple stores or a non-`llm-d` store are active; shows `llm-d` mark only when the deployment's primary/only store is `llm-d`.

## 3. Tabs & Screens

1. **Explore** (`?tab=explore`, default)
   - Compact filter strip: free-text search, **Stack layer / domain** (`Serving`, `Routing`, `KV-cache & storage`, `Protocol`, `End-to-end`, `Custom`), **Scale** (`All scales`, `Fleet (8+ nodes)`, `Multi-node`, `Single node`), **Status**, **Sort** (`Newest`, `Largest fleet`, `Top metric`), and `Mine`.
   - Quiet link to top-level **Regressions** for nightly regression tracking.
   - Row list with store badge (in multi-store view), domain badge, fleet node badge (`128 nodes`), primary metric + operating point, and 1-click **Compare** (auto-pairs with top-ranked baseline).
   - Sticky bulk toolbar on selection: **Compare before / after**, **Publish as Artifact**, **Clear**.
2. **Artifacts** (`?tab=artifacts`, deep-linked via `?artifact=<storeId>/<slug>` or `/artifacts/<storeId>/<slug>`)
   - Two uncluttered sections: **Curated well-lit paths** (pinned) and **Team & agent artifacts**.
   - **Artifact Viewer**: renders declarative blocks (`markdown`, `delta-summary`, `sweep-chart`, `metrics-table`, `fleet-topology`) hydrated from live store Results, or renders `kind: 'html'` safely inside `<iframe sandbox="allow-scripts">` with clickable backing Result provenance pills.
   - **Artifact Builder**: opens from Artifacts or 1-click from Compare; supports declarative blocks, sandboxed HTML, optional Well-Lit Path curation (approvers), and copyable `POST /api/stores/:storeId/artifacts` JSON for agents.
3. **Review queue** (`?tab=review`, conditional)
   - Shown only when the caller can approve on an approval-gated store or pending items exist. Lists pending results across stores with **Inspect**, **Request changes**, and **Approve**.
4. **Detail Screens**
   - **Result Detail (`ResultDetailView.jsx`)**: metrics KPI cards, optional `CurveChart` sweep, **Before / after baseline discovery** panel (ranked matches across all accessible stores), experimental variables, reproducible evidence, and governance actions.
   - **Before / After Compare (`UnifiedCompareView.jsx`)**: baseline selector, "What changed" variable-diff notice, unified metric delta table with directional `(better)`/`(worse)` verdicts, optional `CurveChart` sweep overlay, variable diff matrix, Markdown export, and 1-click **Publish as Artifact**.
   - **Ingest Modal (`IngestDialog.jsx`)**: target store picker, 3 modes (**Structured entry** with fleet/storage/protocol starter templates, **Upload JSON / YAML** supporting `brv02` & Result JSON, and **Agent / CLI API** with copyable `curl` + `/api/schemas/result.json`).
