# Prism 2.0 — Home, Global Light/Dark Theme & Accessible Chart System (Product Spec)

## Problem & Goals

1. **First-10-seconds value clarity**: First-time visitors and returning practitioners need to immediately see what Prism can answer for their workload without parsing dense marketing copy or a static split hero.
2. **Fair, apples-to-apples ranking**: Comparing 1-chip and 32-chip runs by raw cluster throughput misleads users; rankings must normalize throughput per accelerator and guard against comparing across different model sizes.
3. **Unified light-default experience with dark mode**: Users requested the clean light aesthetic across every Prism view (not only the home page), paired with a first-class light/dark theme toggle and consistent global header/footer navigation.
4. **Accessible, colorblind-safe data visualization**: Chart series and status colors must meet WCAG 1.4.11 non-text contrast (≥ 3:1) on both light and dark chart surfaces and remain distinguishable under protanopia, deuteranopia, and tritanopia.
5. **Market llm-d with numbers it can defend**: Prism lives in the llm-d project, so Home leads with llm-d's well-lit paths and the headline number each guide measured. Every number is computed from the guide's own data, states its conditions, and links to the full sweep (including the losing points) on the methodology page.
6. **Never pass illustrative data off as measured**: The seed recipes are illustrative. They carry a `Sample` status on the Leaderboard, never feed Home's counts, dates or versions, and the Leaderboard says so until verified community runs replace them.

## Target Personas & Entry Flows

- **Config Tuners** (`users/config-tuner`): Open the Leaderboard from the hero CTA or toolkit card, then use the Leaderboard's sentence ("Show me the **best throughput per chip** for **chat** on **any accelerator**…") and side-by-side Recipe Comparison.
- **Stack Operators** (`users/llm-d-stack-operator`): Jump straight to the Nightly Regression Tracker (`regressions-analysis`) from the hero's job links or the toolkit.
- **Feature Developers** (`users/llm-d-feature-developer`): Jump to the Benchmark Browser (`benchmark-browser`) or a Well-lit Path guide from its proof card on Home (`inference-scheduling`, `prefix-cache-offloading`, `agentic-serving`, `pd-disaggregation`).
- **Benchmark Developers** (`users/benchmark-developer`): Stage and publish Benchmark Report v0.2 bundles via `submit-benchmarks` and `results-store`.
- **Skeptics and evaluators** (anyone deciding whether to trust a number): `How we measure` (`methodology`) explains runs, validation, ranking, workload classes, the well-lit path sweeps and the sample data.
