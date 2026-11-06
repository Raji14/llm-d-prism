# Next-gen framing: UI/UX implementation spec

- **Status**: Prototype on `feat/next-gen-framing`
- **Product spec**: [product_spec.md](product_spec.md)
- **Design**: [design.md](design.md)

## Navigation

| Where | Before | After |
| :--- | :--- | :--- |
| Site header (desktop) | Leaderboard · Well-lit paths ▾ · Tools ▾ · Docs ↗ | Leaderboard · **Results store** · Well-lit paths ▾ · **Regressions** · Docs ↗ |
| Tools menu | Benchmark browser, Results store, Regressions, Workload catalog, Schema explorer | Removed |
| Mobile menu | Same groups as the header | Same as the header: two top-level links added, Tools group gone |
| Active state | Results store highlighted Tools | *Results store* is underlined on the store and on the upload page (`submit-benchmarks`), which is the journey's first step |
| Footer | Explore · Well-lit paths · Tools · Project | Explore (Home, Leaderboard, Results store, Regressions, How we measure, Submit a run / Upload runs) · Well-lit paths · Project |

The header's right side doesn't change: GitHub, the approver's queue pill, and *Submit a run* / *Upload runs*.

## Home

| Element | Before | After |
| :--- | :--- | :--- |
| Toolkit cards | Six: Leaderboard, Regressions, Benchmark browser (*Validate an optimization*), Submit, Workload catalog, Schema explorer | Four, in one row on desktop (`lg:grid-cols-4`): **Leaderboard** · *See the latest top-performing stacks*; **Regressions** · *Catch a regression*; **Results store** · *Validate an optimization*; **Submit** · *Submit a run* (Internal Prism: **Upload** · *Upload runs*) |
| *Validate an optimization* body | "Plot your runs against established baselines across hardware and configs, on any axis." | "Put your runs next to a baseline from the same setup, and see what changed at the same latency target." |
| Card icon | `BarChart2` | `GitCompare` |
| Line under the hero | Catch a regression · Validate an optimization · Submit a run | Same words; *Validate an optimization* now opens Results Store Compare |
| "Also in the toolkit: Results store (…)" | Shown | Removed (no Tools group left to list) |
| How it works, llm-d Prism | **Run**: "Benchmark with inference-perf and real-world workloads from the catalog." · **Validate**: "…schema-checked…, then peer-reviewed." · **Compare**: "Verified runs rank…" | **Run**: "Benchmark your stack with inference-perf, using traffic shaped like the workload you serve." · **Review**: "Prism checks each report against Benchmark Report v0.2, then a maintainer approves it." · **Compare**: "Approved runs rank on the leaderboard, and anyone can reproduce them from the recipe." |
| How it works, Internal Prism | Run → Mark official → Compare | Unchanged |

## Results Store

- **Compare note.** Reached from Home's *Validate an optimization* (`?view=results-store&intent=compare`). An accent note above Browse, styled like the existing *Pick runs to add to…* banner:
  > **Validate an optimization:** tick your run and a baseline from the same setup, then choose **Compare**. Prism checks the setups match and shows the difference at the same latency target. Each sweep also has **Compare with…**  [Got it]
  - It's hidden while the *Add to result* banner shows.
  - It disappears when a comparison opens, or on *Got it*.
  - The store removes `intent` from the address bar after reading it, so a reload or a shared link doesn't bring it back.
- **Compare screen.** The footnote *"Need every metric and percentile? Open these runs in the Benchmark browser"* is removed.
- **Home button** (page header, top left). It always goes Home.

## Other pages

| Page | Removed or changed |
| :--- | :--- |
| Methodology, *Runs and recipes* | *Explore the schema →* removed. *Report format ↗* (GitHub) stays. |
| Leaderboard drawer, *Environment, provenance & Git traceability* | *View in Explorer →* removed (it opened the benchmark browser). *Report v0.2 JSON* stays. Results Store entries keep *Open in Results Store →* in their lineage note. |
| Agentic serving, *Test harness* | *inference-perf ↗* opens the inference-perf repository on GitHub instead of the workload catalog. |

## Retired views

`benchmark-browser`, `workload-catalog` and `schema-explorer` still render when opened by URL, with their own page headers and a *Home* button. Nothing links to them, and no nav item is highlighted on them.

## Verification

`scratch/framing.mjs` (browser, both instances) checks the nav order, the footer, the four cards, the steps, the compare note and its cleanup, the Home button, the removed links, and that the retired URLs still open.
