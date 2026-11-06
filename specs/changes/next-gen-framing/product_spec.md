# Next-gen framing: a simpler Prism (Product spec)

- **Status**: Draft for review
- **Phase**: Product → UI/UX (prototype on `feat/next-gen-framing`)
- **Decided in**: Sean / Rajitha weekly and follow-up, 2026-11-03 (decisions D2 and D7)
- **Roadmap**: Q4 2026, *Next-gen framing* ([roadmap.md](../../main/roadmap.md))
- **Builds on**: [Prism instances](../prism-instances/product_spec.md)

## Problem & goals

Prism grew a tool for every idea: a benchmark browser, a workload catalog, a schema explorer, a results store, regressions. People who come to compare serving stacks have to work out which of five tools to open, and contributors don't know where their runs go. Sean put the direction plainly: *"the leaderboard is for consumers, the results store is for everybody else."* He also asked us to *"get at least the new visual framing out there, even if you chop a bunch of it off"*, so the team can start building on it.

1. **Two front doors, not five tools.** The Leaderboard (for people choosing a stack) and the Results Store (for people producing, checking and approving results) lead the navigation.
2. **Retire three tools from view.** The benchmark browser, workload catalog and schema explorer stop appearing in Prism's navigation, Home and pages.
3. **Keep every journey reachable.** *Validate an optimization* moves from the benchmark browser to Results Store Compare. Nothing a persona needs goes missing.
4. **Don't break anyone's links, and don't delete code yet.** Upstream is still building the benchmark browser, so its fate is Jason's call. Until then the retired routes keep working for old links and share links.

## Personas & entry points

| Persona | Before | After |
| :--- | :--- | :--- |
| Choosing a stack (consumer, customer) | Leaderboard | Leaderboard (unchanged) |
| Validating an optimization (feature developer) | Benchmark browser | Results Store Compare, from Home's *Validate an optimization* |
| Catching a regression (stack operator) | Tools → Regressions | Regressions, top-level |
| Contributing results (EPAM engineer, internal teammate) | Submit a run / Upload runs → Tools → Results store | Same buttons, and Results store is top-level |
| Checking the report format | Schema explorer | *Report format* on GitHub (linked from Home and Methodology) |
| Finding a workload | Workload catalog | Not in Prism for now. Sean will rebuild the catalog in the new pattern later. |

## Requirements

| # | Requirement |
| :--- | :--- |
| F1 | The site header reads **Leaderboard · Results store · Well-lit paths · Regressions · Docs**. There's no Tools menu. |
| F2 | Nothing in Prism links to the benchmark browser, workload catalog or schema explorer: not the header, footer, mobile menu, Home, Methodology, the Leaderboard drawer, Results Store Compare or the well-lit path pages. |
| F3 | Their routes (`?view=benchmark-browser`, `workload-catalog`, `schema-explorer`) and the legacy `benchmark-comparison` link still open, so bookmarks and share links keep working. |
| F4 | Home's toolkit has four cards, one per job: *See the latest top-performing stacks* (Leaderboard), *Catch a regression* (Regressions), *Validate an optimization* (Results store), and *Submit a run* / *Upload runs*. The line under the hero repeats the three non-Leaderboard jobs. |
| F5 | *Validate an optimization* opens Results Store Browse with a short note on how to compare: tick a run and a baseline from the same setup, then Compare (or use a sweep's *Compare with…*). The note goes away once a comparison opens or the person dismisses it, and the address bar doesn't keep it. |
| F6 | Home's *How it works* steps say what happens without tool names. llm-d Prism: **Run → Review → Compare** (no "workloads from the catalog", and "Review" so "validate" only means validating an optimization). Internal Prism keeps Run → Mark official → Compare. |
| F7 | The Results Store's *Home* button goes Home. (It used to go to the previous view, and to the benchmark browser on a direct visit.) |
| F8 | The footer follows the navigation: Explore lists Home, every top-level view, *How we measure* and the submit link. |

## Non-goals (this change)

- Deleting the three tools' code, or moving the benchmark browser's time series, tag filters and share links into Results Store discovery. That's the open decision with Jason (upstream is still building `Dashboard.jsx`).
- Renaming *Well-lit paths* to *Reports*, admin pinning and report storage (Phase 2).
- Rebuilding the workload catalog (Sean, later).
- Changing the agent skills under `users/`. They still mention the benchmark browser, and its route still works.

## Success criteria

- A first-time visitor can name where to go for each job from the header alone.
- No click path inside Prism reaches the three retired tools; their old URLs still open.
- The Friday review (Sean, Jason) agrees the framing is the base to build on.
