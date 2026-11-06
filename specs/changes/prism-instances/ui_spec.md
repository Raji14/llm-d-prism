# Prism instances: UI/UX implementation spec

- **Status**: Prototype on `feat/prism-instances`
- **Product spec**: [product_spec.md](product_spec.md)
- **Design**: [design.md](design.md)

## The two Homes at a glance

| Element | llm-d Prism (`public` + `llm-d`) | Internal Prism (`internal` + `prism`) |
| :--- | :--- | :--- |
| Header mark | llm-d logotype · divider · "Prism" | Prism mark · "Prism" · site-name chip (for example "Google Cloud") |
| Browser tab | "Prism · llm-d inference benchmarks" | "Prism · Google Cloud" ("Prism · inference benchmarks" without a site name) |
| Favicon | Prism mark (unchanged, same on every instance) | Prism mark (unchanged, same on every instance) |
| Hero line | "…on validated, reproducible runs…" | "…on the runs your team marks Official… Results stay on this Prism." |
| Freshness pill, with results | "N published results across M models · updated …" → Leaderboard | "N official results across M models · updated …" → Leaderboard |
| Freshness pill, empty | "The community leaderboard is open · Submit the first verified run" → Submit | "No official results yet · Upload runs and mark one official" → Results store |
| Header and footer CTA | "Submit a run" | "Upload runs" |
| Toolkit submit card | Submit · "Submit a run" · upload, pass the schema checks, ranked after review | Upload · "Upload runs" · an approver marks a result Official, then it ranks here |
| How it works | Run → Validate → Compare | Run → Mark official → Compare |
| Well-lit paths intro | "llm-d is an open-source, Kubernetes-native stack…" | "These come from llm-d's well-lit paths…" |
| Roadmap line | "Next on the roadmap: …" | "Next on llm-d's roadmap: …" |
| Footer tagline | "…for the llm-d community. Apache-2.0." | "Inference benchmarks for your team, on open-source Prism." |

Everything else is the same on both: navigation, the Leaderboard, the journeys, the agent skills.

Brand-driven rows (header mark, favicon, tab, paths intro, roadmap line) follow `PRISM_BRAND`. Publish-rule rows (hero line, pill, CTA, submit card, steps) follow `PRISM_INSTANCE`. A public Prism that isn't llm-d's, for example, gets the Prism mark with the public copy.

## Results Store, side by side

The same screens and steps on both; only the words, and who approves, change (`copyFor()` in `src/components/ResultsStore/instance.js`).

| Element | llm-d Prism (public) | Internal Prism |
| :--- | :--- | :--- |
| Store badge | "Public store" | The instance's name ("Google Cloud"), else "Internal" |
| Upload button (store header, site header, My work) | "Submit a run" | "Upload runs" |
| Publish verb, contributor | "Submit for review" | "Request official" ("Request official for this sweep" on a run page) |
| Publish verb, approver | "Submit for review" (own runs) | "Mark official" ("Mark sweep official") |
| After changes are asked for | "Submit again" | "Request again" |
| Steps strip (publish dialog, My work) | 1. Submit a run → 2. Curate the result → 3. Submit for review | 1. Upload runs → 2. Curate the result → 3. Mark official / Request official |
| Signed out | Sign in to submit (or save for review in this browser) | "Sign in to mark it official, or to ask an approver to" |
| Approvers' tab | Review queue | Approval queue |
| Queue item | Submission: DCO line, "Listed in the store once approved" | Request: "Becomes Official once you approve it, for everyone on this Prism" |
| Approve panel | Attribution · DCO sign-off · Visibility → "Confirm & publish" | Requested by · Approver · Who sees it → "Confirm & mark official" |
| After approving | "Approved … and published it." · See it on the Leaderboard · Undo approval | "Approved … and marked it official." · See it on the Leaderboard · Undo approval |
| Result page lineage | "Approved by @x on …" | "Requested by @a · Marked official by @b on …" |
| Leaderboard drawer | "Approved by @x on … · submitted by @a" · Open in Results Store → (that result) | "Marked official by @b on … · requested by @a" · Open in Results Store → (that result) |
| Upload page | "Submit benchmarks": upload → validation → Attribution & DCO → submit | "Upload runs": upload → check & preview → Save to My work. No DCO, no "community", no "public" |
| Header pill (approvers, outside the store) | "Review queue · N": results waiting here plus the server's run queue | "Approval queue · N": requests waiting here |

Dev preview bar: Role only (Contributor / Admin). There's no instance switch; each Prism is its own entry point, as in production. Nothing links to the classic Results Store.

The Leaderboard link appears only when the result ranks there (Official on internal, listed Published on public, with something measurable to rank). The link opens the Leaderboard on that result's model and workload with its drawer open.

## Elements

### Brand lockup (`BrandLockup` in `src/components/ui/BrandMarks.jsx`)
- `llm-d`: the llm-d logotype image (alt "llm-d"), a 1px divider, and the "Prism" wordmark. Same as today.
- `prism`: the Prism mark (`/favicon.png`, decorative), the "Prism" wordmark, and an optional site-name chip (neutral `Badge`).
- The home link's accessible name is "{display name} home": "llm-d Prism home", "Google Cloud Prism home", "Prism home".

### Pinned reports
- The cards are the built-in well-lit path reports, in the order `PRISM_PINNED_REPORTS` lists them. Unknown ids are skipped, duplicates count once, and there are at most four.
- The grid adapts to one to four cards, as it does today. With no pinned cards, the section keeps its intro and says no reports are pinned yet.

### Document
- The title and favicon are set before the first render, from the same profile, so the wrong brand never flashes.
- `<html data-prism-instance="…" data-prism-brand="…">` for styling hooks and tests.

### Dev preview (dev server only)
`?instance=internal|public`, `?brand=llm-d|prism`, `?site=<name>`, `?pinned=<ids>`. They survive navigation because Prism keeps unrecognized URL parameters. Production builds ignore them.

## Accessibility
- The Prism mark is decorative (empty alt). The wordmark and the link name carry the meaning.
- The site-name chip uses the neutral Badge tone, which meets 4.5:1.
- The copy changes don't alter heading structure or focus order.
