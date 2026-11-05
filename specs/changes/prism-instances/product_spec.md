# Prism instances: llm-d Prism and Internal Prism (Product spec)

- **Status**: Draft for review
- **Phase**: Product → UI/UX (prototype on `feat/prism-instances`)
- **Decided in**: Sean / Rajitha weekly and follow-up, 2026-11-03
- **Roadmap**: Q4 2026, *Prism instances* ([roadmap.md](../../main/roadmap.md))

## Problem & goals

Prism already runs in more than one place: llm-d's public site, an internal Prism at Google, and IBM's own. Today every copy looks like llm-d's. The llm-d logo is hardcoded, Home talks about "the community leaderboard", and the internal/public difference is a build-time flag that `deploy.sh` never sets, so every deployment comes up public.

1. **One codebase, separate instances.** Each audience gets its own Cloud Run service and URL. Nothing switches between them at runtime, and instances don't talk to each other.
2. **Same journeys everywhere.** Compare serving stacks, catch a regression, validate an optimization, publish a result. Only two things change: the front door (who can get in) and the publish rule (Official on an internal instance, Published on a public one).
3. **Prism has its own identity.** Only llm-d Prism wears the llm-d logo. Every other Prism shows Prism's own mark, so a private deployment obviously feels like *your* Prism.
4. **Set at deploy time, not in code.** A deployer sets the instance, brand, display name and pinned reports with parameters. No fork, no per-instance branch.

## Personas & entry flows

- **Community visitor or external submitter** (for example, an EPAM engineer) on llm-d Prism: lands on Home, compares stacks, or submits a run for review.
- **Internal engineer** on Internal Prism: uploads runs. An approver marks a result Official, and it ranks on that instance's leaderboard. Nothing is made public from here.
- **Deployer or admin**: stands up an instance with `deploy.sh` and a config file, and later picks the reports pinned to that instance's Home.

## Requirements

| # | Requirement |
| :--- | :--- |
| R1 | `PRISM_INSTANCE` (`internal` or `public`) is read from the deployment at runtime, not only at build time. |
| R2 | `PRISM_BRAND` picks the logo. `llm-d` shows llm-d's logotype. Anything else, or nothing, shows Prism's own mark (the original rainbow prism). |
| R3 | `SITE_NAME` names the instance next to the Prism mark (for example, "Google Cloud") and in the browser tab. |
| R4 | Home keeps one layout. Only the copy that depends on the publish rule changes per instance: the hero line, the freshness pill, the submit card and the steps. |
| R5 | Internal Prism never says "public" or "community leaderboard". |
| R6 | `PRISM_PINNED_REPORTS` chooses which reports Home shows, in order, up to four. With no value, Home shows every built-in report. |
| R7 | The production llm-d deploy keeps today's look: llm-d logo, current copy. |
| R8 | On the dev server only, URL parameters preview any combination, so both Homes can be reviewed from one server. |

## Non-goals (this change)

- Renaming "Well-lit paths" to "Reports", and storing reports per instance. That's Phase 2, following the report-storage recommendation (code in the repo, content in each instance's private storage).
- Server-side enforcement of the instance's publish rule ([Results Store design §6.3](../results-store-ui/design.md)).
- Per-instance forks, features that only one instance turns on, or syncing data between instances.

## Success criteria

- One build deploys as llm-d Prism or Internal Prism by changing only its config file.
- A reviewer can open both Homes side by side on the dev server.
- prism.llm-d.ai looks the same after this ships.
