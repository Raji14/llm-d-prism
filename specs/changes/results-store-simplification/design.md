# Simplified Result Store — Engineering Design

- **Status**: Implemented on `prism3.0`
- **Backend Modules**: [`server/stores/`](../../../server/stores/index.ts) (`schema.ts`, `registry.ts`, `storage.ts`, `baselines.ts`, `routes.ts`, `stores.test.ts`), mounted in [`server/server.js`](../../../server/server.js)

---

## 1. Logical Store Registry (`server/stores/registry.ts`)

A deployment configures 1–9 logical stores via `PRISM_STORES` (JSON array or path to JSON file). When unset, the server synthesizes backward-compatible defaults from `PRISM_INSTANCE`, `SITE_NAME`, `PRISM_CONNECT_PUBLIC_STORE`, and `DEFAULT_BUCKETS`.

```ts
StoreConfig {
  id: string;            // lowercase slug
  name: string;          // e.g. "llm-d", "Google Cloud", "Result store"
  description: string;
  brand: 'llm-d' | 'none';
  defaultTarget: boolean;
  governance: {
    readAccess: 'anyone' | 'authenticated' | 'members';
    writeAccess: 'authenticated' | 'members' | 'approvers';
    approvalRequired: boolean;
    dcoRequired: boolean;
    approverOrg?: string;
  };
  storage: { type: 'local'; dir?: string } | { type: 'gcs'; bucket: string; prefix?: string };
}
```

- `toPublicStoreSummary()` strips `storage` before returning stores to clients — bucket names and filesystem paths never leak to the UI.
- `listAccessibleStores(caller)` filters configured stores strictly by caller permissions (`canRead`).

## 2. Unified Result & Artifact Schemas (`server/stores/schema.ts`)

- **Minimum-friction Result input (`CreateResultInputSchema`)**: requires `title` plus at least one entry in `metrics[]` or `sweep[]`. When `sweep[]` is provided without `metrics[]`, `deriveMetricsFromSweep()` computes `output_tok_s_at_ttft_2s`, `peak_output_tok_s`, and `best_ttft_ms`.
- **Immutability invariant**: `PATCH /api/stores/:storeId/results/:id` validates against strict `PatchResultInputSchema`, allowing metadata/variable/lineage edits and `sweep` point inclusion toggles while keeping measured numeric values immutable.
- **Artifact input (`CreateArtifactInputSchema`)**: supports `kind: 'blocks'` (`markdown`, `delta-summary`, `sweep-chart`, `metrics-table`, `fleet-topology`) and `kind: 'html'` (≤ 512 KB, rendered sandboxed client-side), collecting all referenced `resultIds` for provenance.

## 3. Baseline Discovery Engine (`server/stores/baselines.ts`)

`rankBaselines(candidate, pool)` scores candidates across all stores readable by the caller using:
1. Explicit `lineage.baselineId` link (+200)
2. Same `lineage.experimentGroup` (+50) and `domain` (+40)
3. Published status (+30), matching `model` (+25), `workload` (+20), `fleet.nodes` (+20), `hardware` (+15)
4. Variable overlap + single-variable A/B test bonus (+18 when exactly 1 variable differs)
5. Overlapping metric keys (+15) so before/after deltas can be computed automatically.

## 4. Agent-Native REST API (`server/stores/routes.ts`)

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/schemas`, `/api/schemas/result.json`, `/api/schemas/artifact.json` | Runtime JSON Schema discovery for agents. |
| `GET /api/stores` | Lists logical stores accessible to caller with capabilities & counts. |
| `GET /api/stores/results`, `GET /api/stores/:storeId/results` | Federated or single-store query (`domain`, `status`, `model`, `hardware`, `workload`, `minNodes`, `experimentGroup`, `tag`, `own`, `q`, `sort`, `limit`). |
| `POST /api/stores/:storeId/results` | Ingest/publish result; returns structured `400 ValidationError` issues on schema errors. |
| `GET /api/stores/:storeId/results/:id`, `PATCH ...`, `DELETE ...` | Read, edit mutable metadata/toggles, or remove result. |
| `POST /api/stores/:storeId/results/:id/status` | Governance transitions (`publish`, `submit_for_review`, `approve`, `request_changes`, `decline`, `retract`, `reopen`). |
| `GET /api/stores/:storeId/results/:id/baselines` | Federated ranked baseline discovery with variable diffs. |
| `GET /api/stores/artifacts`, `POST /api/stores/:storeId/artifacts`, `DELETE ...` | List, publish/upsert, or delete declarative or HTML artifacts. |
| `GET /api/artifacts/:storeId/:slug` & `GET /artifacts/:storeId/:slug` | Hydrated artifact + referenced results JSON; browser path negotiates `Accept: application/json` vs. SPA HTML. |

## 5. Verification

- Backend unit tests: `npx tsx server/stores/stores.test.ts`
- Frontend client/branding/delta unit tests: `npx tsx src/components/ResultsStore/storeClient.test.js`
- Type-check & production build: `npm run type-check && npm run build`
