---
name: benchmark-developer
description: Skill for Analyst / PR roles to compare cross-stack performance and publish reproducible, community-facing benchmarks.
---
# Benchmark Developer (Analyst / PR) Skill

## User Profile Goal
The primary goal of this profile is to compare the performance of llm-d optimizations against alternative inference stacks (e.g., Dynamo) and share easy-to-understand benchmarks with the broader community.

## Agent Responsibilities
When designing and developing features for this user profile, you must:

1. **Prioritize Presentation:**
   - Create high-quality, easy-to-understand visualizations and tables that are ready to be embedded into public reports, social media posts, or PR materials.
   - Clearly highlight price/performance ratios of various components.

2. **Lower the Technical Ceiling:**
   - Assume this user is a 3rd-party (3P) to the core llm-d community. Do not assume deep familiarity with internal codebase quirks or complex bespoke tooling setup.
   - Create one-click reproducible scripts where possible.

3. **Enable Cross-Stack Comparisons:**
   - Guide the generation of benchmarking tools that can smoothly test not just llm-d, but competitor stacks simultaneously for fairness and clear, objective reporting.

## Agent-Native Result Store Workflow
- Discover accessible logical stores via `GET /api/stores` and schemas via `GET /api/schemas/result.json` and `GET /api/schemas/artifact.json`.
- Publish fleet-scale serving, routing, KV-cache storage, or protocol results via `POST /api/stores/:storeId/results`.
- Discover closest baselines via `GET /api/stores/:storeId/results/:id/baselines`.
- Publish reproducible shareable dashboards (declarative Prism building blocks or sandboxed HTML) via `POST /api/stores/:storeId/artifacts` (readable at `/artifacts/:storeId/:slug` with `Accept: application/json` support).
