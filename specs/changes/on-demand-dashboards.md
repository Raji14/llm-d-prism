# Spec: On-Demand Dynamic Dashboards in Prism

## 1. Executive Summary & Overview

Prism is a powerful comparison interface for distributed LLM inference performance, but adding new guides (e.g., Prefix Cache Offloading, PD Disagg) currently requires manual codebase changes, writing React components, creating custom backend endpoints, and deploying a new app version. 

To empower both **human field engineers** (such as Customer Engineers and Solutions Architects) and **autonomous AI agents** (such as automated benchmark analyzers, regression detectors, optimization evaluators, or coding assistants) to quickly create, share, and manage tailored benchmarks and customized visualizations, we propose **On-Demand Dynamic Dashboards**. This feature allows authenticated users and autonomous agents to:
1. Build a custom dashboard through a visual UI builder (for humans) or programmatically via a declarative JSON API schema (for autonomous agents).
2. Select benchmark runs directly from the Results Store or embed custom JSON data.
3. Configure standard visual blocks (Markdown explanation, Bar Charts, Scatter Plots, Metrics Tables) matching Prism's aesthetics.
4. Publish and share the dashboard using a short, clean, namespaced URL: `https://prism.llm-d.ai/<github-username>/<dashboard-shortname>`.

All dashboards are publicly readable by default. Writing, updating, or deleting a dashboard configuration requires authentication via GitHub OAuth (or GitHub Personal Access Tokens/App tokens for agents) and is scoped to the owner's username namespace.

---

## 2. Business Impact & Success Metrics

### 2.1. Business Impact Metrics
*   **Time-to-Share Acceleration**: Reduces the time to build and publish a custom performance study from days (requiring a PR and deployment) to minutes for human engineers, and to seconds for autonomous agents.
*   **Agentic Automation & CI/CD Integration**: Enables autonomous AI agents (such as regression analyzers, nightly evaluation pipelines, and coding assistants) to automatically generate, publish, and share interactive performance proof-points without human intervention.
*   **Customer Engagement & Adoption**: Enables CEs and AI assistants to deliver highly interactive, reproducible performance proofs directly to customers and engineering teams. Measured by counting active shared links, unique visitors, and programmatic API reads.
*   **Content Volume**: Encourages crowdsourced guides and automated evaluation reports from the broader `llm-d` developer and agent community.

### 2.2. Functional Success Metrics
*   Human users can log in, select datasets, arrange layout blocks, and save a dashboard in under 5 minutes.
*   Autonomous agents can construct, validate, and publish a dashboard configuration via the API in under 5 seconds.
*   Shared URLs are short, human-readable, load in under 2 seconds for browser viewers, and support HTTP content negotiation for machine-readable JSON retrieval by agents.
*   Modification or deletion is securely restricted to the dashboard creator (human or agent namespace).
*   API endpoints return structured, machine-readable validation errors, enabling agents to self-correct invalid configurations on zero-human-in-the-loop retries.
*   **API Parity**: 100% of dashboard creation, modification, and deletion workflows can be executed programmatically without browser automation.

---

## 3. User Journeys & Stories (CUJs)

### CUJ 1: Create and Publish a Custom Dashboard
*   **User Role**: Customer Engineer / Autonomous AI Agent
*   **Goal**: Create and publish a custom dashboard showcasing TPU v6e performance benefits for Qwen2.5-72B vs. an A100 baseline to share with a customer or engineering team.
*   **Human Workflow (UI Builder)**:
    1. Log in to Prism via GitHub.
    2. Click **Create Dashboard**.
    3. Add a **Markdown Block** for introduction and key takeaways.
    4. Click **Add Dataset** and search/select relevant run UUIDs from the Results Store (e.g., Qwen2.5-72B runs on TPU and A100).
    5. Add a **Bar Chart Block** to compare TTFT and throughput.
    6. Add a **Pareto Frontier Scatter Plot** to show cost vs. throughput.
    7. Enter metadata: Title ("Qwen2.5 TPU v6e Optimization Study"), Shortname (`qwen-tpu-eval`).
    8. Click **Publish**. The app displays the link: `https://prism.llm-d.ai/seanhorgan/qwen-tpu-eval`.
*   **Autonomous Agent Workflow (REST API / CLI)**:
    1. Authenticate to the Prism API using a GitHub Personal Access Token (PAT) or GitHub App token via the `X-Prism-Github-Token` header.
    2. Query the Results Store API (`GET /api/results`) or search relevant run UUIDs for Qwen2.5-72B on TPU v6e and A100.
    3. Programmatically assemble a declarative JSON payload conforming to the Dashboard Configuration Schema, including metadata, datasets (`run-id` references), and layout blocks (`markdown`, `bar-chart`, `scatter-plot`).
    4. Send an authenticated `POST /api/dashboards/qwen-tpu-eval` request with the JSON payload.
    5. If validation errors occur, inspect the structured JSON error response (e.g., invalid block property or shortname regex mismatch), self-correct the payload, and retry.
    6. Upon `200 OK` / `201 Created`, output and share the generated URL `https://prism.llm-d.ai/<agent-namespace>/qwen-tpu-eval` with the user or downstream CI/CD workflow.

### CUJ 2: Share and Access a Namespaced URL
*   **User Role**: Customer / Stakeholder / Autonomous AI Agent
*   **Goal**: View, inspect, or analyze the evaluation results shared by a CE or another agent.
*   **Human Workflow (Browser)**:
    1. Click the link `https://prism.llm-d.ai/seanhorgan/qwen-tpu-eval` in an email or chat.
    2. The page loads the custom layout, displaying the interactive charts and tables using the selected datasets.
    3. The viewer does *not* need to log in to read the dashboard.
    4. The user can interact with the charts (tooltips, zoom) and inspect raw data.
*   **Autonomous Agent Workflow (Programmatic Inspection)**:
    1. Receive a namespaced dashboard URL (`https://prism.llm-d.ai/:username/:shortname`) from a chat prompt, PR comment, or automated report.
    2. Request the dashboard URL with the `Accept: application/json` header (or query the unauthenticated REST endpoint `GET /api/dashboards/:username/:shortname`) to retrieve the raw JSON configuration directly without rendering HTML or scraping the DOM.
    3. Parse the layout blocks, markdown narrative, and dataset references (`id`, `source`, `type`).
    4. Optionally query the Results Store API using the extracted run UUIDs to analyze raw underlying metrics, verify optimization claims, or generate a synthesized summary for the user.

### CUJ 3: Edit or Delete an Existing Dashboard
*   **User Role**: Dashboard Creator (Customer Engineer / Autonomous AI Agent)
*   **Goal**: Update the shared dashboard with fresh benchmark runs or delete it when it is no longer relevant.
*   **Human Workflow (UI Builder)**:
    1. Visit `https://prism.llm-d.ai/seanhorgan/qwen-tpu-eval` while logged in.
    2. Click **Edit Dashboard** (only visible to the author).
    3. Update the content/datasets and click **Save**.
    4. Or, click **Delete Dashboard** to remove the configuration from storage.
*   **Autonomous Agent Workflow (REST API / CLI)**:
    1. **To update**: Fetch the existing dashboard configuration via `GET /api/dashboards/:username/:shortname`, modify the JSON payload (e.g., appending new run UUIDs from a nightly regression evaluation or updating the markdown findings), and submit an authenticated `POST /api/dashboards/:shortname` request to overwrite the stored configuration.
    2. **To delete**: Send an authenticated `DELETE /api/dashboards/:shortname` request using `X-Prism-Github-Token` to permanently remove the dashboard configuration from storage.

---

## 4. Technical & Functional Requirements

### 4.1. Routing, SPA Fallback & Content Negotiation

To support clean URLs like `https://prism.llm-d.ai/:username/:dashboardShortname`, the routing system must handle path parsing without colliding with standard app views while supporting both human browsers and automated agents.

#### 4.1.1. Path Resolution Strategy
The frontend application will parse the URL path (`window.location.pathname`).
*   **Static Views**: If the first segment matches a registered static view (e.g. `schema-explorer`, `workload-catalog`, `manage-benchmarks`), render that view.
*   **Dynamic Namespaces**: If the path matches `/:username/:shortname`, treat it as a request to load a dynamic dashboard.
    *   *Alternative (Recommended for collision safety)*: Use a `/u/` prefix: `/u/:username/:shortname`. This guarantees that future static routes (e.g., a new tab `/leaderboard`) never conflict with user namespaces (e.g., a user named `leaderboard`).
*   **SPA Support**: The Express server's catch-all route `app.get('*')` already serves `index.html`, allowing client-side resolution of these paths for browser clients.

#### 4.1.2. Content Negotiation for Machine-Readable Access
To enable autonomous agents to inspect dashboards directly from standard shared URLs without path rewriting:
*   When a request to `/:username/:shortname` or `/u/:username/:shortname` includes an `Accept: application/json` header or `?format=json` query parameter, the backend server MUST bypass the SPA `index.html` fallback and return the raw Dashboard Configuration JSON from GCS.
*   This allows autonomous agents and scripts to consume shared dashboard links natively without scraping DOM content.

---

### 4.2. Storage & API Contract

Dashboard configurations are stored as JSON files in GCS under a scoped prefix:
`gs://<bucket_name>/dashboards/<github-username>/<shortname>.json`

#### 4.2.1. Dashboard Configuration Schema
A dashboard configuration defines the layout blocks, text, and datasets.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "PrismDynamicDashboard",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "enum": ["1.0"]
    },
    "metadata": {
      "type": "object",
      "properties": {
        "title": { "type": "string" },
        "description": { "type": "string" },
        "author": { "type": "string" },
        "created_at": { "type": "string", "format": "date-time" },
        "updated_at": { "type": "string", "format": "date-time" }
      },
      "required": ["title", "author"]
    },
    "datasets": {
      "type": "array",
      "description": "List of run IDs and data sources used in this dashboard",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "description": "Unique key to reference in charts" },
          "type": { "type": "string", "enum": ["run-id", "gcs-path", "raw-json"] },
          "source": { "type": "string", "description": "Run UUID or GCS path" }
        },
        "required": ["id", "type", "source"]
      }
    },
    "layout": {
      "type": "array",
      "description": "Ordered list of visual blocks rendering the dashboard",
      "items": {
        "type": "object",
        "properties": {
          "type": { "type": "string", "enum": ["markdown", "bar-chart", "scatter-plot", "table"] },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "config": {
            "type": "object",
            "properties": {
              "dataset_id": { "type": "string" },
              "x_axis": { "type": "string" },
              "y_axis": { "type": "string" },
              "height": { "type": "integer", "default": 400 }
            }
          },
          "content": { "type": "string", "description": "Used by markdown type for content body" }
        },
        "required": ["type"]
      }
    }
  },
  "required": ["version", "metadata", "datasets", "layout"]
}
```

*   **Runtime Schema Discovery**: The Dashboard Configuration Schema MUST be publicly hosted and accessible via `GET /api/schemas/dashboard.json` (or `/api/dashboards/schema.json`) so autonomous agents can dynamically fetch schema rules and validate payloads at runtime.

#### 4.2.2. API Endpoints

*   **`GET /api/dashboards/:username/:shortname`**
    *   **Public Access**: True
    *   **Description**: Resolves and returns the JSON configuration from GCS.
    *   **Error Responses**: `404 Not Found` if the configuration file doesn't exist.

*   **`POST /api/dashboards/:shortname`**
    *   **Public Access**: False (Requires GitHub OAuth via `X-Prism-Github-Token`)
    *   **Request Body**: The Dashboard Configuration JSON payload.
    *   **Description**: Validates the payload structure and writes it to `gs://<bucket>/dashboards/<username>/<shortname>.json`.
    *   **Authentication & Agent Credentials**: The `X-Prism-Github-Token` header accepts standard GitHub OAuth tokens, GitHub Personal Access Tokens (PATs), or GitHub App installation tokens, enabling autonomous agents to authenticate seamlessly.
    *   **Structured Validation Error Responses**: When a payload fails JSON schema validation, the endpoint MUST return HTTP `400 Bad Request` with a machine-readable JSON error payload containing exact property paths, failure codes, and descriptive error messages (e.g., `{"error": "ValidationError", "issues": [{"path": ["layout", 0, "type"], "message": "Invalid block type"}]}`). This enables autonomous agents to programmatically diagnose and self-correct invalid configurations without human intervention.
    *   **Rules**:
        *   `<username>` is extracted from the GitHub token.
        *   `<shortname>` must be alphanumeric, lowercase, and hyphenated (regex: `^[a-z0-9-]+$`).
        *   Overwrites existing dashboards if they belong to the authenticated user (idempotent upsert behavior).

*   **`DELETE /api/dashboards/:shortname`**
    *   **Public Access**: False (Requires GitHub OAuth or Agent PAT via `X-Prism-Github-Token`)
    *   **Description**: Deletes `gs://<bucket>/dashboards/<username>/<shortname>.json`.

---

### 4.3. UI Builder & Visual Blocks

To maintain design alignment with Prism, the UI builder and API schema provide pre-approved components. Every block configurable in the UI Builder corresponds 1:1 to declarative JSON properties in the `layout` array, ensuring complete parity between UI-based creation and agent-authored JSON configurations.

1.  **Markdown / Content Block**: Renders sanitized HTML from markdown text, enabling explanations, callouts, and narratives.
2.  **Bar Chart Block**: Displays side-by-side or stacked comparisons for metrics like throughput and TTFT across selected configurations.
3.  **Scatter Plot Block**: Reuses the core Prism chart engine to display multi-axis relationships (e.g. Latency vs. Throughput) with optional Pareto frontiers.
4.  **Comparison Table Block**: High-density grid rendering key statistics (e.g., TTFT P50/P90, TPOT, QPS) for all selected datasets.

---

### 4.4. Autonomous Agent Support & Programmatic Contract

To ensure autonomous AI agents can operate as first-class users across the entire lifecycle, implementations MUST adhere to the following programmatic contract:
1.  **100% Programmatic Parity**: Every dashboard capability—creating layouts, selecting datasets, configuring charts, modifying markdown narratives, and deleting dashboards—MUST be fully achievable via REST API endpoints without browser automation or UI-only state.
2.  **Zero-Human-in-the-Loop Error Recovery**: All API error responses (schema validation failures, missing dataset IDs, authorization errors) MUST provide structured JSON error details so agents can self-correct payloads autonomously.
3.  **Runtime Schema Discoverability**: Agents MUST be able to query `GET /api/schemas/dashboard.json` to inspect block types, required metadata fields, and valid enum values at runtime.
4.  **Direct URL Interoperability**: Namespaced dashboard URLs act as dual-purpose endpoints—rendering an interactive web application for humans while serving structured JSON to agents via HTTP content negotiation (`Accept: application/json`).

---

## 5. Security & Access Control

*   **Namespace Scoping**: The GCS prefix `/dashboards/<username>/` serves as the authorization boundary. Both human users and autonomous agents can only write/delete files under their own GitHub username prefix.
*   **Agent Token Security**: Autonomous agents authenticating via GitHub PATs or GitHub App tokens operate strictly within their assigned username namespace, preventing cross-tenant or cross-user modifications.
*   **Markdown Sanitization**: All user- or agent-supplied Markdown content must be sanitized on render in the frontend (e.g., using `dompurify` and `marked`) to prevent Cross-Site Scripting (XSS) vulnerabilities.
*   **Validation**: The API server will validate dashboard configs against the JSON Schema to prevent corrupted configurations from breaking the rendering engine.

---

## 6. Open Questions & Future Considerations

*   **Agent Attribution & Badging**: Should dashboards authored or updated by autonomous AI agents display a visual badge (e.g., "Generated by AI Agent" or "Automated Nightly Benchmark") to clearly differentiate automated reports from human-curated studies?
*   **Ephemeral / Scratchpad Dashboards for Agents**: Should we support an optional TTL or expiration timestamp (`expires_at`) in dashboard metadata so that agents generating short-lived scratchpad dashboards during debugging or CI/CD runs do not permanently consume GCS storage?
*   **Agentic Run Validation**: Should the backend API optionally validate that referenced run UUIDs (`id` / `source`) exist in the Results Store when an agent submits a dashboard config, warning the agent early if a UUID is mistyped or missing?
*   **Dynamic Data Updates**: If a dataset references a run ID, what happens if that run is retracted or deleted? Should the dashboard report an error, omit the run, or fall back gracefully?
*   **Collaborative Editing**: Should we allow multiple GitHub usernames to edit the same dashboard? (e.g., using GitHub teams or a shared namespace like `/org/llm-d/`).
*   **Custom CSS / Layout Innovation**: How much flexibility should we give CEs and agents to customize colors or override default Tailwind styles? (Standardizing styling aligns with Prism principles, but too much rigidity may block innovation).
*   **Stateful Sharing within Custom Dashboards**: If a user or agent filters a custom dashboard, should we persist those filter states in the URL (e.g. `https://prism.llm-d.ai/u/seanhorgan/qwen-tpu-eval?model=xyz`)?
