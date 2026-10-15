# Prism 2.0 — UI/UX Specification

> Visual tokens (accent ramp, typography scale, surface classes, chart palette)
> are normative in `skills/style.md`. This spec describes the home page and
> global chrome in terms of those tokens.

## 1. Global Chrome (`SiteHeader` & `SiteFooter`)

- **Top Header (`SiteHeader.jsx`)**: Sticky `h-16` bar shared across all views.
  - Left: `llm-d` logotype + vertical divider + `Prism` wordmark (navigates to `home`), followed by `Leaderboard`, `Well-lit paths ▾` dropdown, `Tools ▾` dropdown, and external `Docs ↗`.
  - Right: `GitHub` link and an **outline** `Submit a run` pill (`Button variant="secondary"`), so it never competes with a page's own primary action (on Home, *Compare serving stacks*). The mobile drawer keeps a primary `Submit a run`.
  - Active section indicator: `bg-accent-500` bottom bar on the active top-level item or dropdown trigger.
- **Page heroes (`PageHeader`, `WellLitHeader`)**: In-flow editorial heroes beneath `SiteHeader` (kicker in `kicker text-accent-600`, `display-title` headline, subtle `HeroCurvesBg` accent fan). No secondary sticky bars; no repeated `llm-d | Prism` brand mark.
- **Footer (`SiteFooter.jsx`)**: `max-w-6xl` link directory (`Explore` incl. *How we measure*, `Well-lit paths`, `Tools`, `Project`) + cropped `Prism` wordmark. Two columns on phones (brand block full width), five from `md`.

## 2. Home Page (`PrismHome.jsx`)

> [!IMPORTANT]
> **Design rule for the fold:** everything above the fold is *static per page-load* — no controls, no content that re-flows on interaction, and nothing whose validity depends on a filter combination. The home page states what Prism is, proves it with one number per well-lit path, and routes people deeper. Interactive exploration lives on the Leaderboard.

1. **Centered hero** (no text-left / visual-right split), set on the page's only decoration: a faint dot grid masked to the top of the section and two mirrored `FrontierRays` curve fans in the upper corners (`text-accent-600`, masked so they never run behind the headline). All decoration is `pointer-events-none` / `aria-hidden`.
   - **Freshness pill** counts only *verified, non-sample* runs (`summarizeVerified(submittedRuns)`): `N verified runs across M models · updated <date> →` (leaderboard). With none it invites the first: `The community leaderboard is open · Submit the first verified run →`. The illustrative seed recipes never feed a count, date or version.
   - Headline `Find the inference stack that wins on your workload.` (`font-display text-[40px] sm:text-6xl`, accent gradient on *your*).
   - Subhead (`max-w-3xl text-lg sm:text-xl text-zinc-600`, one sentence, 2 lines on desktop): ranks model, accelerator and serving-stack combinations on validated, reproducible runs, comparing throughput per chip, latency and cost.
   - CTAs (`Button href size="lg"`): **Compare serving stacks →** (primary) and **How we measure** (secondary, `methodology`).
   - Jobs line: muted links *Catch a regression · Validate an optimization · Submit a run* for the personas who aren't choosing a stack. The `·` separators show from `sm` only, so a wrapped line never starts with one.
2. **Well-lit paths, measured (`ProofBand`, `id="paths"`)**, directly under the hero inside the same section. Header: kicker *Well-lit paths, measured* (no brand name: `kicker` uppercases it to "LLM-D"), a one-line explanation of llm-d (linked to llm-d.ai) and *Where these numbers come from →* (`methodology#paths`, so it doesn't repeat the hero's *How we measure*).
   - **Four proof cards** (`sm:grid-cols-2 lg:grid-cols-4`, `rounded-2xl border bg-white p-5 shadow-sm`), one per live well-lit path (`PROOF_CARDS`). Each card: layer kicker (*Routing* / *KV cache* / *Multi-turn* / *Serving*) + badge from `NAV` (P/D shows `Preview`), path title as a stretched link to the guide (`min-h-[2.75rem]` so hero numbers align across all 4 columns), the headline (`display-title text-4xl`, "up to" prefix only when the proof is the best of a sweep), claim, conditions, and a **plain-SVG mini chart of the sweep behind the number** pinned to the card's bottom edge (no chart library in the entry chunk):
     | Card | Chart | Data |
     |---|---|---|
     | Intelligent routing | paired bars per QPS: K8s Service (`zinc-200`) vs. llm-d gateway (`accent-500`); caption *p99 TTFT, lower is better* | `ROUTING_PROOF.points` — includes the 1 QPS loss |
     | Prefix cache offloading | paired bars per context length: HBM only vs. with offload | `PREFIX_CACHE_PROOF.points` |
     | Agentic serving | paired bars per concurrency (`10c`–`60c`): K8s Service vs. Combined stack | `AGENTIC_PROOF.points` |
     | Prefill/decode disaggregation | one bar per split, best split in `accent-500`, even split in `zinc-400`, others `zinc-200` | `PD_PROOF.points` |
     Axis labels are HTML under the SVG (the SVG uses `preserveAspectRatio="none"`, so no text lives inside it); each chart has a two-swatch legend and a unit line.
   - Footnote: *Next on the roadmap: Wide expert parallelism.*
   - **Proof rules** (`src/utils/wellLitProofs.js`, shared with the methodology page): Routing = best p99-TTFT ratio vs. a Kubernetes Service (best of sweep → "up to"); prefix cache = range of best-tier throughput gains over HBM-only vLLM across context lengths; agentic serving = total throughput gain of combined optimizations over a Kubernetes Service across concurrency levels; P/D = best split vs. an **even** split of the same replicas (never vs. the weakest split).
3. **Toolkit ("What brings you to Prism?")**: six job cards (`lg:grid-cols-3`), outlined icon tiles, tool name as kicker — Choose a serving stack (Leaderboard), Catch a regression (Regressions), Validate an optimization (Benchmark browser), Submit a run, Find a realistic workload (Workload catalog), Check the report format (Schema explorer). Tools without a card are listed in an *Also in the toolkit* line derived from `NAV`. No decoration.
4. **How it works (`.surface-keep` `bg-zinc-950` band)**: 3-step pipeline (`Run`, `Validate`, `Compare`), CTAs `Submit a run` (`Button variant="inverse"`) and `Report format ↗` (`inverseOutline`), and `SKILL.md` links for coding agents. Decoration: white `FrontierRays` masked to the right third and one `bg-accent-500/15 blur-[120px]` glow low on the band, both behind the content layer.

> [!NOTE]
> The former interactive hero (sentence builder, objective podium, frontier chart, scope relaxation, `HeroEmpty`) was removed from Home because it re-flowed on every click and was only as good as the sparsest filter combination. The sentence survives on the Leaderboard (below).

## 2b. Leaderboard (`Leaderboard/LeaderboardDashboard.jsx`)

1. **The question as a sentence (`LeaderboardAsk.jsx`)** — replaces the Model/Hardware/Stack/Sort dropdowns and the Spotlight category tabs:
   `Show me the [fastest | most responsive | smoothest | cheapest | most upvoted] way to serve [any model | <family>] for [any workload | Chat | RAG / long context | Code | Reasoning | Batch] on [any accelerator | H100 | A100 | L4 | TPU v6e | TPU v5e | …] with [any stack | llm-d | vLLM | SGLang | TensorRT-LLM].`
   - Vocabulary lives in `src/utils/leaderboardFacets.js`. *Fastest* = **throughput per chip** (`tokens_per_sec_per_chip`); legacy `?sort=tokens_per_sec` links map to it. Accelerator options are extended with any id present in the data, so no run is unreachable.
   - Deep links `?sort=&model=&workload=&hardware=&engine=` round-trip; `App.handleNavigate` clears them when leaving the leaderboard ↔ recipe-comparison flow.
   - When *any model* spans several model families, a muted line notes that per-chip ranking favours small models.
2. **Sample disclosure**: while any illustrative seed recipe is on screen, a calm one-line notice (`StatusChip status="sample"`, `role="note"`) explains them and links *How we measure*. It doesn't repeat *Submit a run*, which already sits in the page header, and it's hidden on empty states (they carry their own call to action). Sample rows carry a `Sample` chip in the spotlight, table and chart tooltip. The page subtitle never says "validated" while samples are shown.
3. **One empty state**: when nothing matches, a single `EmptyState` replaces spotlight + chart + table. A workload with no runs yet (RAG, Batch) invites the first submission.
4. **Spotlight (`LeaderboardSummaryCards`)**: always the #1 of the sentence's objective; throughput is shown per chip with the cluster total as detail.
5. **Table (`LeaderboardTable`)**: follows the objective order until a header is clicked; per-chip throughput column; CSV adds `tokens_per_sec_per_chip`, `workload_class`, `verification_status`. Ten columns fit the `max-w-6xl` container from 1280px up: contributor credit is a third line in the model cell (no Contributor column) and the Compare header is screen-reader-only (each checkbox has its own `aria-label`). Cost is labelled *per 1M tokens*, not output tokens, everywhere (table, comparison, sizing wizard): `pricingEngine` divides by total tokens/s.
6. **Pareto chart (`ParetoCurveChart`)**: per-chip throughput by default; the frontier is computed for the plotted points and axes; with no explicit selection the #1 for the current objective is outlined in the accent; points on the frontier share the frontier line's amber; both states are explained in the legend via `ChartLegend`'s `variant: 'outline'` swatch. Frontier points are badged *Frontier* in the tooltip, never "SOTA": the frontier is relative to the current filters and axes. Linear axes use rounded bounds and ticks (0, 500, 1k…).

## 2c. How we measure (`MethodologyPage.jsx`, view `methodology`)

`PageHeader` + sticky on-page nav (`lg`). Sections: *Runs and recipes* · *Validation* (status chips: Verified, Community validated, Sample) · *Ranking* (per chip, objectives table, cost per 1M tokens from GCP list prices over input + output tokens, Pareto frontier, model-size caveat) · *Workload classes* (`WORKLOADS[].rule`) · *Well-lit path numbers* (each Home proof with its baseline and **every** point of the sweep, including routing's loss at 1 QPS) · *Sample data* (+ *Submit a run*). Linked from the Home hero, the proof band (`#paths`), the footer and the leaderboard's sample notice.
- Section deep links (`?view=methodology#paths`) scroll to the section on mount, from a fresh load or in-app navigation.
- Sweep tables fit a 390px phone without hiding a column: compact type and cells below `sm`, wrapping headers, units kept in the cells. A column whose value is the same on every row (the prefix cache's best tier) becomes a note instead.

## 3. Theme & CVD-Safe Chart Palette

- **Single light theme (`data-theme="light"`)**, locked; no runtime toggle.
- **Brand accent**: llm-d plum `#7f317f` exposed as the `accent-*` ramp (see `skills/style.md` → *Brand accent*).
- **7-series CVD-validated palette (`src/theme/chartPalette.json`)**:
  - Light: green `#0e825e`, sky `#0095b6`, amber `#b6811c`, purple `#895ee3`, pink `#863267`, blue `#1c3bb5`, orange `#b54a07`.
  - All series and status tokens satisfy WCAG 1.4.11 ≥ 3:1 contrast on the chart surface and maintain OKLab×100 pairwise distance ≥ 9.3 across normal, protan, deutan, and tritan vision.
