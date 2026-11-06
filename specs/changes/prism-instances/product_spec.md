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

### Results Store on each instance (added 2026-11-05)

Sean's feedback on the CUJs: the same journey on every instance, with only the front door and the words changing. Upload, then who's notified, then whose queue, then any one allow-listed maintainer approves, lineage is recorded, and you can go and see it.

| # | Requirement |
| :--- | :--- |
| R9 | The same journey on both: upload runs → curate a result → get it approved → see it on the Leaderboard. On Internal Prism, people who can't approve **Request official**; it waits in the **Approval queue**, and any one approver marks it Official. On llm-d Prism, contributors **Submit for review**; it waits in the **Review queue**. Nobody approves their own request. |
| R10 | One set of verbs per instance, everywhere a step is named. llm-d Prism: *Submit a run* / *Submit for review*. Internal Prism: *Upload runs* / *Request official* / *Mark official*. |
| R11 | After an approval or *Mark official*, Prism offers **See it on the Leaderboard**, opening that result's row and drawer. The drawer says who approved it and when, and who asked or submitted it. |
| R12 | Internal Prism's upload page says "Upload runs", never "community review", and has no Attribution & DCO step. (The server's submit route never required a DCO.) |
| R13 | Approvers belong to each instance: its admin allowlist, plus llm-d's org admins on llm-d Prism only (or an org the deployment names). |
| R14 | Approvers see what's waiting for them from anywhere in Prism (a queue pill in the site header). |
| R15 | The store's badge carries the instance's name ("Google Cloud"), the same identity as the site header. No instance switch on the page, and no links to the classic Results Store. |

## Non-goals (this change)

- Renaming "Well-lit paths" to "Reports", and storing reports per instance. That's Phase 2, following the report-storage recommendation (code in the repo, content in each instance's private storage).
- Server-side enforcement of the instance's publish rule ([Results Store design §6.3](../results-store-ui/design.md)).
- Server storage for results, requests and approvals. Until it exists they're saved in the browser, and every screen says so; the approval flow only works across people once it lands.
- Email or chat notifications. The header pill is v1.
- Per-instance forks, features that only one instance turns on, or syncing data between instances.

## Success criteria

- One build deploys as llm-d Prism or Internal Prism by changing only its config file.
- A reviewer can open both Homes side by side on the dev server.
- prism.llm-d.ai looks the same after this ships.
- On both entry points, a contributor can take a sweep to an approver and the approver can take it to the Leaderboard, with both names on the result.
