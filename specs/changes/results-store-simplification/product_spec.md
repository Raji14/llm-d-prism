# Simplified Result Store: Agent-Native, Fleet-Scale Multi-Store Experience (Product Spec)

- **Status**: Implemented on `prism3.0`
- **Phase**: Product → UI/UX → Engineering (complete)
- **Decided in**: Sean / Rajitha sync, 2026-11-24
- **Replaces / Simplifies**: Binary `public`/`internal` isolation in [`prism-instances/product_spec.md`](../prism-instances/product_spec.md) and browser-only workspace complexity in [`results-store-ui/ui_spec.md`](../results-store-ui/ui_spec.md)

---

## 1. Problem & Strategic Positioning

The previous Results Store accumulated **~14,000 LOC**, 5 top-level tabs (`Browse`, `My work`, `Watches & reports`, `Review queue`, `Sources`), 6+ competing domain nouns, a 1,529-line legacy `?classic=1` view, and a rigid deployment-level `public` vs. `internal` split. Meanwhile, curated state lived only in `localStorage`, buckets leaked into the UI via `SourcesTab`, and non-serving or fleet-scale experiments lacked a clean home.

This change realigns the Result Store around five requirements:

1. **Fleet-scale, cross-layer source of truth**: Home for the best optimizations across **serving**, **routing**, **KV-cache & storage**, **agent-to-inference protocols**, and **end-to-end** stacks spanning hundreds of nodes — not just single-node demos.
2. **Agent-native by design**: Humans and agents share the same structured REST API (`/api/stores`, `/api/stores/:id/results`, `/api/stores/:id/artifacts`) with runtime JSON Schema discovery (`/api/schemas/*`) and machine-readable validation errors.
3. **Iterative before/after loop**: Today’s published "after" becomes tomorrow’s discoverable "before." Baseline discovery, variable diffs, and metric deltas work natively across all domains.
4. **Low cognitive burden & curated well-lit paths**: Collapse 6+ nouns and 5 tabs into **3 primitives** (`Store`, `Result`, `Artifact`) and **2 primary tabs** (`Explore`, `Artifacts`, plus a conditional `Review queue` for approvers). Composable building blocks let teams publish new artifacts and promote curated well-lit paths without clutter.
5. **Logical multi-store architecture with context-dependent branding**: Deployments configure a single-digit list of logical stores (1–9) decoupled from storage buckets. Permissions control visibility — no rigid "Public" vs. "Private" UI boxes.

---

## 2. Resolved Design Decisions (2026-11-24)

| Decision | Resolution |
| :--- | :--- |
| **Multi-store connection model** | Deployment-configured list of 1–9 logical stores (`PRISM_STORES` or synthesized defaults), with **federated read** across all stores the user can access and **explicit target-store selection** on publish. |
| **Cross-store visibility & branding** | Top-level site chrome stays neutral (`Prism` + optional org name) unless the deployment’s primary/only store is the public `llm-d` store. Inside the Result Store, only the `llm-d` store carries `llm-d` branding; internal/custom stores default to neutral **"Result store"** (or custom org name). |
| **Artifact format for agents & humans** | Hybrid: **declarative Prism building blocks** (`markdown`, `delta-summary`, `sweep-chart`, `metrics-table`, `fleet-topology`) as the curated well-lit path, plus a **sandboxed HTML escape hatch** (`<iframe sandbox="allow-scripts">`) backed by immutable Result IDs. |
| **Minimum non-serving benchmark schema** | 5-field minimum envelope (`title`, `domain`, `metrics[]` or `sweep[]`, `variables{}`, `evidence[]`) plus optional `fleet{}` and `lineage{}` so storage, protocol, and fleet-scale benchmarks drop in with zero friction while Compare computes automatic before/after deltas. |

---

## 3. Core User & Agent Journeys

1. **Benchmarker / Agent ingests a result**: Calls `POST /api/stores/:storeId/results` (or uses **Add result** in UI) targeting their accessible store (e.g., internal `Google Cloud` store or public `llm-d` store).
2. **Feature developer / Agent runs before/after loop**: Opens a Result or calls `GET /api/stores/:storeId/results/:id/baselines` → Prism ranks the closest baselines across all accessible stores → Compare shows exact variable diffs and signed metric deltas.
3. **Engineer / Agent publishes an Artifact**: Turns a comparison or published Result into a declarative block dashboard or sandboxed HTML visualization via UI (**Publish as Artifact**) or `POST /api/stores/:storeId/artifacts`, shareable at `/artifacts/:storeId/:slug` (HTML for browsers, JSON for `Accept: application/json`).
4. **Approver curates a Well-Lit Path**: Reviews submissions in the unified **Review queue** (shown only for approval-gated stores) and pins standout Artifacts as curated Well-Lit Paths.
