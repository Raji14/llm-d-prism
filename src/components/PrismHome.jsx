import React, { useMemo } from 'react';
import { ArrowRight, ArrowUpRight, Activity, BarChart2, Blocks, Bot, FileCode, Trophy, UploadCloud } from 'lucide-react';
import { cn } from '../utils/cn';
import { normalizeLeaderboardEntry } from '../utils/leaderboardData.js';
import { AGENTIC_PROOF, PD_PROOF, PREFIX_CACHE_PROOF, ROUTING_PROOF } from '../utils/wellLitProofs.js';
import { Badge } from './ui/Badge.jsx';
import { Button } from './ui/Button.jsx';
import { DOCS_URL, METHODOLOGY, NAV, REPO_URL, SUBMIT } from './layout/navigation';

const LEADERBOARD = 'model-leaderboard';
const REPORT_FORMAT_URL = 'https://github.com/llm-d/llm-d-benchmark/blob/main/benchmark_report';
// MethodologyPage section that publishes the full sweeps behind each proof.
const PROOFS_ANCHOR = 'paths';

const hrefFor = (view, params = {}) => `?${new URLSearchParams({ view, ...params }).toString()}`;

// Path titles, descriptions and badges come from the shared nav model, so a
// renamed or re-badged path updates here without editing this file.
const PATH_ITEMS = NAV.find((n) => n.id === 'paths')?.items || [];
const pathItem = (view) => PATH_ITEMS.find((p) => p.view === view) || { label: view, view };

// ---------- Well-lit paths, measured ----------
// One card per llm-d well-lit path whose guide data supports a headline number
// (src/utils/wellLitProofs.js). Each card also draws the sweep behind its
// number so the figure is a chart, not a slogan.
const PROOF_CARDS = [
    {
        path: 'inference-scheduling',
        layer: 'Routing',
        proof: ROUTING_PROOF,
        chart: 'paired',
        unit: 'p99 TTFT, lower is better',
        axis: (p) => `${p.qps} QPS`,
        legend: ['K8s Service', 'llm-d gateway'],
    },
    {
        path: 'prefix-cache-offloading',
        layer: 'KV cache',
        proof: PREFIX_CACHE_PROOF,
        chart: 'paired',
        unit: 'Throughput by context length',
        axis: (p) => `${p.size}`,
        legend: ['HBM only', 'With offload'],
    },
    {
        path: 'agentic-serving',
        layer: 'Multi-turn',
        proof: AGENTIC_PROOF,
        chart: 'paired',
        unit: 'Throughput by concurrency',
        axis: (p) => `${p.concurrency}c`,
        legend: ['K8s Service', 'Combined stack'],
    },
    {
        path: 'pd-disaggregation',
        layer: 'Serving',
        proof: PD_PROOF,
        chart: 'splits',
        unit: 'Throughput by prefill : decode split',
        axis: (p) => `${p.prefill}:${p.decode}`,
        legend: ['Even split', 'Best split'],
    },
];

// What's next on the roadmap.
const NEXT_UP = 'Wide expert parallelism';

// "What brings you here?": one card per job, so every persona in
// users/README.md finds its entry point without reading the rest of the page.
const TOOLKIT = [
    {
        view: LEADERBOARD,
        kicker: 'Leaderboard',
        title: 'See the latest top-performing stacks',
        body: 'Compare the freshest benchmark runs across models, accelerators and stack components, ranked at your target latency.',
        icon: Trophy,
    },
    {
        view: 'regressions-analysis',
        kicker: 'Regressions',
        title: 'Catch a regression',
        body: 'Track nightly well-lit path runs against their history and spot the release that slipped.',
        icon: Activity,
    },
    {
        view: 'benchmark-browser',
        kicker: 'Benchmark browser',
        title: 'Validate an optimization',
        body: 'Plot your runs against established baselines across hardware and configs, on any axis.',
        icon: BarChart2,
    },
    {
        view: SUBMIT.view,
        kicker: 'Submit',
        title: SUBMIT.label,
        body: 'Upload a Benchmark Report v0.2, pass the schema checks, and get ranked after review.',
        icon: UploadCloud,
    },
    {
        view: 'workload-catalog',
        kicker: 'Workload catalog',
        title: 'Find a realistic workload',
        body: 'Start from production-shaped traffic profiles instead of synthetic prompts.',
        icon: Blocks,
    },
    {
        view: 'schema-explorer',
        kicker: 'Schema explorer',
        title: 'Check the report format',
        body: 'Browse every field of Benchmark Report v0.2 before you instrument a run.',
        icon: FileCode,
    },
];

// The non-leaderboard jobs, repeated under the hero CTAs for the personas
// who aren't choosing a stack.
const HERO_JOBS = TOOLKIT.filter((c) => ['regressions-analysis', 'benchmark-browser', SUBMIT.view].includes(c.view));

// Tools without a card, read from the shared nav model so a new tool shows up
// on Home without editing this file.
const MORE_TOOLS = (NAV.find((n) => n.id === 'tools')?.items || []).filter(
    (t) => !TOOLKIT.some((c) => c.view === t.view)
);

const STEPS = [
    { n: '01', title: 'Run', body: 'Benchmark with inference-perf and real-world workloads from the catalog.' },
    { n: '02', title: 'Validate', body: 'Reports are schema-checked against Benchmark Report v0.2, then peer-reviewed.' },
    { n: '03', title: 'Compare', body: 'Verified runs rank on the leaderboard, and anyone can reproduce them from the recipe.' },
];

const AGENT_ROLES = [
    { id: 'config-tuner', label: 'Config tuner' },
    { id: 'llm-d-stack-operator', label: 'Stack operator' },
    { id: 'llm-d-feature-developer', label: 'Feature developer' },
    { id: 'benchmark-developer', label: 'Benchmark developer' },
];

const fmtDate = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What the freshness pill may claim: only runs that passed review. Never the
// illustrative seed recipes, never uploads still waiting for validation. The
// inclusion rule matches buildLeaderboardDataset's for uploaded runs.
function summarizeVerified(runs) {
    const verified = (Array.isArray(runs) ? runs : [])
        .filter((raw) => raw && (raw.tokens_per_sec || raw.tps || raw.ttft))
        .map((raw) => ({ raw, run: normalizeLeaderboardEntry(raw) }))
        .filter(({ run }) => run && !run.is_sample && run.verification_status === 'verified');
    return {
        count: verified.length,
        models: new Set(verified.map(({ run }) => run.model_family)).size,
        // Only a date the run itself carries; normalization would default to now.
        updated: fmtDate(verified.map(({ raw }) => raw.created_at).filter(Boolean).sort().pop()),
    };
}

function SectionHeader({ eyebrow, title, body }) {
    return (
        <div className="mb-8 max-w-2xl">
            <p className="kicker text-accent-600">{eyebrow}</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-display text-zinc-900 md:text-4xl">{title}</h2>
            {body && <p className="mt-3 text-base leading-relaxed text-zinc-600">{body}</p>}
        </div>
    );
}

// Decorative "performance frontier" field: a fan of throughput/latency curves
// rising to the right, echoing the Pareto charts users will find inside.
function FrontierRays({ className, tone = 'text-accent-600', count = 16, points = true, aspect = 'xMaxYMin slice' }) {
    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 1440 760"
            preserveAspectRatio={aspect}
            className={cn('pointer-events-none absolute inset-0 h-full w-full', tone, className)}
        >
            {Array.from({ length: count }, (_, i) => (
                <path
                    key={i}
                    d={`M${520 + 34 * i} 760 C${640 + 34 * i} ${471 - 9 * i} ${850 + 34 * i} ${228 - 11 * i} 1440 ${198 - 15 * i}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeOpacity={0.06 + i * 0.012}
                />
            ))}
            {points &&
                [[1100, 250], [1190, 182], [1290, 129], [980, 330]].map(([cx, cy]) => (
                    <circle key={cx} cx={cx} cy={cy} r="3.5" className="fill-white" stroke="currentColor" strokeOpacity="0.7" strokeWidth="1.5" />
                ))}
        </svg>
    );
}

// ---------- Mini charts ----------
// Plain SVG, no chart library: this file is in the entry chunk. Bars only,
// labels are HTML underneath so nothing stretches with preserveAspectRatio.
const CHART_H = 64;
const GROUP_W = 48;
const barH = (v, max) => Math.max(2, (v / max) * (CHART_H - 6));

// Two bars per group: baseline in grey, llm-d in accent.
function PairedBars({ groups }) {
    const max = Math.max(...groups.flatMap((g) => [g.baseline, g.optimized]));
    return (
        <svg aria-hidden="true" viewBox={`0 0 ${groups.length * GROUP_W} ${CHART_H}`} preserveAspectRatio="none" className="h-16 w-full">
            {groups.map((g, i) => {
                const x = i * GROUP_W;
                const hb = barH(g.baseline, max);
                const ho = barH(g.optimized, max);
                return (
                    <g key={g.key}>
                        <rect x={x + 10} y={CHART_H - hb} width={12} height={hb} rx="1.5" className="fill-zinc-200" />
                        <rect x={x + 26} y={CHART_H - ho} width={12} height={ho} rx="1.5" className="fill-accent-500" />
                    </g>
                );
            })}
            <line x1="0" x2={groups.length * GROUP_W} y1={CHART_H - 0.5} y2={CHART_H - 0.5} className="stroke-zinc-200" />
        </svg>
    );
}

// One bar per sweep point; the reference and best points carry the colour.
function SplitBars({ groups }) {
    const max = Math.max(...groups.map((g) => g.value));
    return (
        <svg aria-hidden="true" viewBox={`0 0 ${groups.length * GROUP_W} ${CHART_H}`} preserveAspectRatio="none" className="h-16 w-full">
            {groups.map((g, i) => {
                const h = barH(g.value, max);
                return (
                    <rect
                        key={g.key}
                        x={i * GROUP_W + 14}
                        y={CHART_H - h}
                        width={20}
                        height={h}
                        rx="1.5"
                        className={cn(g.isBest ? 'fill-accent-500' : g.isReference ? 'fill-zinc-400' : 'fill-zinc-200')}
                    />
                );
            })}
            <line x1="0" x2={groups.length * GROUP_W} y1={CHART_H - 0.5} y2={CHART_H - 0.5} className="stroke-zinc-200" />
        </svg>
    );
}

function ProofChart({ card }) {
    const { proof } = card;
    const groups =
        card.chart === 'splits'
            ? proof.points.map((p) => ({ key: p.split, label: card.axis(p), value: p.total, isBest: p.isBest, isReference: p.isReference }))
            : proof.points.map((p) => ({ key: card.axis(p), label: card.axis(p), baseline: p.baseline, optimized: p.optimized }));
    const Chart = card.chart === 'splits' ? SplitBars : PairedBars;
    return (
        <figure className="mt-auto pt-6">
            <Chart groups={groups} />
            <div className="mt-1.5 grid text-center text-xs tabular-nums text-zinc-600 font-medium" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
                {groups.map((g) => (
                    <span key={g.key} className="truncate">
                        {g.label}
                    </span>
                ))}
            </div>
            <figcaption className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600">
                <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className={cn('h-2 w-2 rounded-sm', card.chart === 'splits' ? 'bg-zinc-400' : 'bg-zinc-300')} />
                    {card.legend[0]}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-2 w-2 rounded-sm bg-accent-500" />
                    {card.legend[1]}
                </span>
                <span className="basis-full text-zinc-500">{card.unit}</span>
            </figcaption>
        </figure>
    );
}

function ProofCard({ card, go }) {
    const item = pathItem(card.path);
    const { proof } = card;
    return (
        <li className="group relative flex min-w-0 flex-col rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs transition-colors hover:border-zinc-300 hover:shadow-sm">
            <div className="flex items-center gap-2">
                <p className="kicker text-zinc-600 font-semibold">{card.layer}</p>
                {item.badge && <Badge tone="warning" size="xs">{item.badge}</Badge>}
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-zinc-400 transition group-hover:text-accent-600 motion-safe:group-hover:translate-x-0.5" />
            </div>
            {/* Stretched link: the whole card opens the guide. */}
            <a
                href={hrefFor(item.view)}
                onClick={(e) => go(e, item.view)}
                className="mt-1 min-h-[2.75rem] text-base font-semibold leading-snug text-zinc-900 after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent-500"
            >
                {item.label}
            </a>
            <p className="mt-4 flex items-baseline gap-1.5">
                {proof.upTo && <span className="text-sm text-zinc-600">up to</span>}
                <span className="display-title text-4xl tabular-nums text-zinc-900">{proof.metric}</span>
            </p>
            <p className="mt-2 text-sm font-medium text-zinc-800">{proof.claim}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600">{proof.context}</p>
            <ProofChart card={card} />
        </li>
    );
}

function ProofBand({ go }) {
    const cards = PROOF_CARDS.filter((c) => c.proof);
    return (
        <div id="paths" className="mt-14 scroll-mt-20 text-left sm:mt-16">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-10">
                <div className="max-w-2xl">
                    <p className="kicker text-accent-600">Well-lit paths, measured</p>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">
                        <a
                            href={DOCS_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 transition-colors hover:decoration-accent-400"
                        >
                            llm-d
                        </a>{' '}
                        is an open-source, Kubernetes-native stack for distributed LLM inference. Its well-lit paths are
                        tested deployment recipes, one per layer, each benchmarked in its guide.
                    </p>
                </div>
                <a
                    href={`${hrefFor(METHODOLOGY.view)}#${PROOFS_ANCHOR}`}
                    onClick={(e) => go(e, METHODOLOGY.view, { hash: PROOFS_ANCHOR })}
                    className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-zinc-700 transition-colors hover:text-accent-700"
                >
                    Where these numbers come from
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition group-hover:text-accent-600 motion-safe:group-hover:translate-x-0.5" />
                </a>
            </div>

            {cards.length > 0 && (
                <ul
                    className={cn(
                        'mt-6 grid gap-4',
                        cards.length === 2 && 'sm:grid-cols-2',
                        cards.length === 3 && 'md:grid-cols-3',
                        cards.length >= 4 && 'sm:grid-cols-2 lg:grid-cols-4'
                    )}
                >
                    {cards.map((card) => (
                        <ProofCard key={card.path} card={card} go={go} />
                    ))}
                </ul>
            )}

            <p className="mt-4 text-xs leading-relaxed text-zinc-600">
                Next on the roadmap: <span className="font-semibold text-zinc-800">{NEXT_UP}</span>.
            </p>
        </div>
    );
}

const PrismHome = ({ onNavigate, submittedRuns }) => {
    const verified = useMemo(() => summarizeVerified(submittedRuns), [submittedRuns]);

    // In-app navigation for plain clicks; modified clicks (new tab / window)
    // fall through to the href.
    const go = (e, view, params) => {
        if (e && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
        e?.preventDefault();
        onNavigate?.(view, params);
    };

    // Freshness pill: what the community leaderboard holds right now. Until a
    // verified run lands it invites the first one; sample entries never count.
    const pill = verified.count
        ? {
              view: LEADERBOARD,
              text: `${plural(verified.count, 'verified run')} across ${plural(verified.models, 'model')}`,
              detail: verified.updated ? `updated ${verified.updated}` : null,
          }
        : { view: SUBMIT.view, text: 'The community leaderboard is open', detail: 'Submit the first verified run' };

    return (
        <div className="surface-light min-h-full bg-theme-bg text-zinc-900 font-sans antialiased overflow-x-hidden">
            {/* ============ HERO + WELL-LIT PATHS ============ */}
            <section className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgb(24_24_27/0.08)_1px,transparent_1.2px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_25%,transparent_80%)]" />
                <FrontierRays points={false} className="opacity-80 [mask-image:radial-gradient(ellipse_34%_58%_at_100%_0%,#000_15%,transparent_75%)]" />
                <FrontierRays points={false} className="-scale-x-100 opacity-80 [mask-image:radial-gradient(ellipse_34%_58%_at_100%_0%,#000_15%,transparent_75%)]" />

                <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16 md:pb-20">
                    <div className="text-center">
                        <a
                            href={hrefFor(pill.view)}
                            onClick={(e) => go(e, pill.view)}
                            className="group inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200/90 bg-white py-1 pl-3 pr-2.5 text-xs font-medium text-zinc-700 shadow-xs transition-colors hover:border-zinc-300 hover:text-zinc-900"
                        >
                            <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-500" />
                            <span className="truncate">
                                {pill.text}
                                {pill.detail && <span className="hidden font-medium text-zinc-600 sm:inline"> · {pill.detail}</span>}
                            </span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition group-hover:text-zinc-700 motion-safe:group-hover:translate-x-0.5" />
                        </a>

                        <h1 className="mx-auto mt-6 max-w-4xl font-display text-[40px] font-semibold leading-[1.04] tracking-display text-zinc-900 sm:text-6xl">
                            Find the inference stack that wins on{' '}
                            <span className="bg-gradient-to-r from-accent-700 via-accent-600 to-accent-500 bg-clip-text text-transparent">your</span>{' '}
                            workload.
                        </h1>

                        <p className="mx-auto mt-6 max-w-3xl text-lg leading-relaxed text-zinc-700 [text-wrap:balance] sm:text-xl">
                            Prism ranks model, accelerator and serving-stack combinations on validated, reproducible runs,
                            comparing throughput per chip, latency and cost.
                        </p>

                        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
                            <Button href={hrefFor(LEADERBOARD)} onClick={(e) => go(e, LEADERBOARD)} size="lg" className="group">
                                Compare serving stacks
                                <ArrowRight className="h-4 w-4 motion-safe:transition-transform group-hover:translate-x-0.5" />
                            </Button>
                            <Button
                                href={hrefFor(METHODOLOGY.view)}
                                onClick={(e) => go(e, METHODOLOGY.view)}
                                size="lg"
                                variant="secondary"
                            >
                                {METHODOLOGY.label}
                            </Button>
                        </div>

                        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-zinc-600 sm:gap-x-2">
                            {HERO_JOBS.map((job, i) => (
                                <React.Fragment key={job.view}>
                                    {i > 0 && <span aria-hidden="true" className="hidden text-zinc-300 sm:inline">·</span>}
                                    <a
                                        href={hrefFor(job.view)}
                                        onClick={(e) => go(e, job.view)}
                                        className="font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-accent-700 hover:decoration-accent-400"
                                    >
                                        {job.title}
                                    </a>
                                </React.Fragment>
                            ))}
                        </p>
                    </div>

                    <ProofBand go={go} />
                </div>
            </section>

            {/* ============ TOOLKIT ============ */}
            <section className="border-t border-zinc-200/80 bg-zinc-100/50">
                <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
                    <SectionHeader
                        eyebrow="Toolkit"
                        title="What brings you to Prism?"
                        body="Pick the job you're doing. Each card opens the right view."
                    />
                    <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
                        {TOOLKIT.map((card) => {
                            const Icon = card.icon;
                            return (
                                <li key={card.view}>
                                    <a
                                        href={hrefFor(card.view)}
                                        onClick={(e) => go(e, card.view)}
                                        className="group flex h-full flex-col rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-xs transition-colors hover:border-zinc-300 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 sm:p-6"
                                    >
                                        <span className="flex items-center justify-between">
                                            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition-colors group-hover:border-accent-200 group-hover:bg-accent-50 group-hover:text-accent-600">
                                                <Icon className="h-5 w-5" strokeWidth={1.75} />
                                            </span>
                                            <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:text-accent-600 motion-safe:group-hover:translate-x-0.5" />
                                        </span>
                                        <span className="kicker mt-5 text-zinc-600 font-semibold">{card.kicker}</span>
                                        <span className="mt-1.5 text-base font-semibold tracking-tight text-zinc-900 sm:text-lg">{card.title}</span>
                                        <span className="mt-1.5 text-sm leading-relaxed text-zinc-600">{card.body}</span>
                                    </a>
                                </li>
                            );
                        })}
                    </ul>
                    {MORE_TOOLS.length > 0 && (
                        <p id="tools" className="mt-6 scroll-mt-20 text-sm text-zinc-600">
                            Also in the toolkit:{' '}
                            {MORE_TOOLS.map((t, i) => (
                                <React.Fragment key={t.view}>
                                    {i > 0 && ', '}
                                    <a
                                        href={hrefFor(t.view)}
                                        onClick={(e) => go(e, t.view)}
                                        className="font-medium text-zinc-800 underline decoration-zinc-300 underline-offset-2 transition-colors hover:text-accent-700 hover:decoration-accent-400"
                                    >
                                        {t.label}
                                    </a>
                                    {t.desc && <span className="text-zinc-600"> ({t.desc.toLowerCase()})</span>}
                                </React.Fragment>
                            ))}
                            .
                        </p>
                    )}
                </div>
            </section>

            {/* ============ HOW IT WORKS ============ */}
            <section className="surface-keep relative overflow-hidden bg-zinc-950 text-white">
                <FrontierRays tone="text-white" points={false} aspect="none" className="opacity-60 [mask-image:linear-gradient(90deg,transparent_35%,#000_85%)]" />
                <div className="pointer-events-none absolute -bottom-40 left-1/3 h-[380px] w-[640px] rounded-full bg-accent-500/15 blur-[120px]" />
                <div className="relative mx-auto grid max-w-6xl gap-14 px-4 py-20 sm:px-6 md:py-24 lg:grid-cols-[0.9fr_1.1fr]">
                    <div>
                        <p className="kicker text-accent-400">How it works</p>
                        <h2 className="mt-3 font-display text-3xl font-semibold tracking-display md:text-4xl">Every number has a run behind it.</h2>
                        <p className="mt-4 max-w-md text-base leading-relaxed text-zinc-300">
                            One validated pipeline powers the UI and agent workflows, so people and their agents work from
                            the same source of truth.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Button href={hrefFor(SUBMIT.view)} onClick={(e) => go(e, SUBMIT.view)} variant="inverse" size="md">
                                <UploadCloud className="h-4 w-4" /> {SUBMIT.label}
                            </Button>
                            <Button href={REPORT_FORMAT_URL} target="_blank" rel="noopener noreferrer" variant="inverseOutline" size="md">
                                Report format <ArrowUpRight className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Agent-ready */}
                        <div className="mt-10 max-w-md rounded-2xl border border-white/10 p-5">
                            <div className="flex items-center gap-2 text-sm font-semibold">
                                <Bot className="h-4 w-4 text-accent-400" /> Use Prism from your agent
                            </div>
                            <p className="mt-1.5 text-sm text-zinc-300">
                                Each role ships as a <code className="font-mono text-zinc-200">SKILL.md</code> your coding agent can load.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                {AGENT_ROLES.map((r) => (
                                    <Button
                                        key={r.id}
                                        href={`${REPO_URL}/tree/main/users/${r.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        variant="inverseOutline"
                                        size="xs"
                                        className="text-zinc-200"
                                    >
                                        {r.label} <ArrowUpRight className="h-3 w-3 text-zinc-400" />
                                    </Button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <ol className="grid gap-px self-start overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-3 lg:grid-cols-1">
                        {STEPS.map((s) => (
                            <li key={s.n} className="flex gap-5 bg-zinc-950 p-6">
                                <span className="pt-0.5 font-mono text-sm text-accent-400">{s.n}</span>
                                <div>
                                    <h3 className="text-base font-semibold">{s.title}</h3>
                                    <p className="mt-1.5 text-sm leading-relaxed text-zinc-300">{s.body}</p>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>
        </div>
    );
};

export default PrismHome;
