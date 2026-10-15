// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// "How we measure": what a run is, how it's validated and ranked, and where
// every number on Home comes from. The proof tables read the same functions
// as Home's stack panel (src/utils/wellLitProofs.js) and the leaderboard's
// vocabulary (src/utils/leaderboardFacets.js), so this page can't drift from
// the numbers it explains.
import React, { useEffect } from 'react';
import { ArrowRight, ArrowUpRight, UploadCloud } from 'lucide-react';
import { cn } from '../utils/cn';
import { OBJECTIVES, WORKLOADS } from '../utils/leaderboardFacets.js';
import { AGENTIC_PROOF, PD_PROOF, PREFIX_CACHE_PROOF, ROUTING_PROOF, shortModelName } from '../utils/wellLitProofs.js';
import { PageHeader } from './ui/PageHeader.jsx';
import { Button } from './ui/Button.jsx';
import { Badge, StatusChip } from './ui/Badge.jsx';
import { NAV, SUBMIT } from './layout/navigation';

const REPORT_FORMAT_URL = 'https://github.com/llm-d/llm-d-benchmark/blob/main/benchmark_report';

const SECTIONS = [
    { id: 'runs', label: 'Runs and recipes' },
    { id: 'validation', label: 'Validation' },
    { id: 'ranking', label: 'Ranking' },
    { id: 'workloads', label: 'Workload classes' },
    { id: 'paths', label: 'Well-lit path numbers' },
    { id: 'samples', label: 'Sample data' },
];

const LOWER_IS_BETTER = new Set(['ttft_p50', 'itl_p50', 'cost_per_1m']);

const STATUSES = [
    { status: 'verified', meaning: 'Passed the Benchmark Report v0.2 schema check and peer review.' },
    { status: 'community_validated', meaning: 'Passed the schema check; peer review is still pending.' },
    { status: 'sample', meaning: 'Illustrative entry that ships with the UI. Never counts as a verified result.' },
];

const PATH_ITEMS = NAV.find((n) => n.id === 'paths')?.items || [];

const num = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const ratio = (r) => `${r.toFixed(2)}×`;

function Section({ id, kicker, title, children }) {
    return (
        <section id={id} className="scroll-mt-24">
            <p className="kicker text-accent-600">{kicker}</p>
            <h2 className="mt-2 font-display text-2xl font-semibold tracking-display text-zinc-900 sm:text-3xl">{title}</h2>
            <div className="mt-4 space-y-4 text-base leading-relaxed text-zinc-600">{children}</div>
        </section>
    );
}

// Compact below sm (smaller type, tighter cells, wrapping headers) so a sweep
// fits a phone without hiding its last column, usually the gain.
function Table({ columns, rows, caption }) {
    return (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-xs sm:text-sm">
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead className="bg-zinc-50/90 border-b border-zinc-200">
                    <tr>
                        {columns.map((c) => (
                            <th
                                key={c.label}
                                scope="col"
                                className={cn(
                                    'label-caps px-2 py-2.5 align-bottom text-zinc-700 font-semibold max-sm:first:pl-3 max-sm:last:pr-3 sm:whitespace-nowrap sm:px-4',
                                    c.numeric && 'text-right'
                                )}
                            >
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                    {rows.map((row) => (
                        <tr key={row.key} className={cn(row.highlight && 'bg-accent-50/60')}>
                            {row.cells.map((cell, i) => (
                                <td
                                    key={columns[i].label}
                                    className={cn(
                                        'px-2 py-2.5 align-top text-zinc-800 max-sm:first:pl-3 max-sm:last:pr-3 sm:px-4',
                                        columns[i].numeric && 'whitespace-nowrap text-right font-mono tabular-nums',
                                        i === 0 && 'whitespace-nowrap font-medium text-zinc-900'
                                    )}
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// One well-lit path: its Home headline, what it's measured against, and every
// point of the sweep, so the headline can be checked against the rest.
function PathProof({ view, proof, columns, rows, notes, onNavigate }) {
    const item = PATH_ITEMS.find((p) => p.view === view);
    const title = item?.label || view;
    return (
        <div className="rounded-3xl border border-zinc-200/90 bg-white p-4 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <h3 className="text-lg font-semibold text-zinc-900">{title}</h3>
                {item?.badge && <Badge tone="warning" size="xs">{item.badge}</Badge>}
                <a
                    href={`?view=${view}`}
                    onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                        e.preventDefault();
                        onNavigate?.(view);
                    }}
                    className="group inline-flex basis-full items-center gap-1 text-sm font-medium text-zinc-700 transition-colors hover:text-accent-700 sm:ml-auto sm:basis-auto"
                >
                    Open the guide
                    <ArrowRight className="h-3.5 w-3.5 text-zinc-400 transition group-hover:text-accent-600" />
                </a>
            </div>
            {proof ? (
                <>
                    <p className="mt-3 text-sm text-zinc-600 font-semibold">On Home</p>
                    <p className="mt-0.5 text-base text-zinc-900">
                        <span className="font-semibold">
                            {proof.upTo && 'up to '}
                            {proof.metric}
                        </span>{' '}
                        {proof.claim}
                    </p>
                    <p className="mt-1 text-sm text-zinc-600">Measured against: {proof.baseline}.</p>
                    <div className="mt-4">
                        <Table columns={columns} rows={rows} caption={`${title} benchmark sweep`} />
                    </div>
                </>
            ) : (
                <p className="mt-3 text-sm text-zinc-600">
                    The guide&apos;s data can&apos;t support a headline number yet, so Home shows this path without one.
                </p>
            )}
            {notes?.length > 0 && (
                <ul className="mt-4 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-700 marker:text-zinc-400">
                    {notes.map((n) => (
                        <li key={n}>{n}</li>
                    ))}
                </ul>
            )}
        </div>
    );
}

const routingLoss = (ROUTING_PROOF?.points || []).find((p) => p.ratio < 1);
const prefixSetup = PREFIX_CACHE_PROOF?.points?.[0];
// The same best tier at every context length → one note, not a repeated column.
const prefixTiers = new Set((PREFIX_CACHE_PROOF?.points || []).map((p) => p.tier));
const prefixTier = prefixTiers.size === 1 ? [...prefixTiers][0] : null;
const pdReference = (PD_PROOF?.points || []).find((p) => p.isReference);
const agenticSetup = AGENTIC_PROOF?.points?.[0];

export default function MethodologyPage({ onNavigate, onNavigateBack }) {
    const go = (view) => (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate?.(view);
    };

    // Deep links (e.g. Home's "Where these numbers come from" → #paths) land on
    // their section. App resets scroll on navigation before this lazy view
    // mounts, so the browser's own fragment scroll never applies.
    useEffect(() => {
        const id = window.location.hash.slice(1);
        if (!id) return undefined;
        const frame = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
        return () => cancelAnimationFrame(frame);
    }, []);

    return (
        <div className="surface-light min-h-full bg-theme-bg text-zinc-900 font-sans antialiased">
            <PageHeader
                kicker="Methodology"
                title="How we measure"
                subtitle="Every number in Prism comes from a benchmark run you can reproduce. Here's how runs are produced, validated and ranked, and where each headline number on Home comes from."
                onNavigateBack={onNavigateBack}
            />

            <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 md:py-16 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-16">
                <nav aria-label="On this page" className="hidden lg:block">
                    <div className="sticky top-8 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-xs">
                        <p className="kicker text-zinc-600 font-semibold">On this page</p>
                        <ul className="mt-3 space-y-2 border-l border-zinc-200">
                            {SECTIONS.map((s) => (
                                <li key={s.id}>
                                    <a
                                        href={`#${s.id}`}
                                        className="-ml-px block border-l border-transparent pl-4 text-sm font-medium text-zinc-600 transition-colors hover:border-accent-500 hover:text-zinc-900"
                                    >
                                        {s.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>

                <div className="max-w-3xl space-y-16">
                    <Section id="runs" kicker="01" title="Runs and recipes">
                        <p>
                            A <strong className="font-semibold text-zinc-900">run</strong> is one benchmark execution. It
                            produces a <strong className="font-semibold text-zinc-900">report</strong> in the Benchmark
                            Report v0.2 format: the accelerators, the serving stack and its settings, the workload, and the
                            measured latency and throughput.
                        </p>
                        <p>
                            A <strong className="font-semibold text-zinc-900">recipe</strong> is the deployment configuration
                            behind a run plus the command that reproduces it. Every ranked run links to its recipe, so any
                            number can be re-measured on your own hardware.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <Button href={REPORT_FORMAT_URL} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">
                                Report format <ArrowUpRight className="h-3.5 w-3.5" />
                            </Button>
                            <Button href="?view=schema-explorer" onClick={go('schema-explorer')} variant="secondary" size="sm">
                                Explore the schema <ArrowRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </Section>

                    <Section id="validation" kicker="02" title="Validation">
                        <p>
                            Submitted reports are checked against the Benchmark Report v0.2 schema, then peer-reviewed before
                            they rank. Each entry on the leaderboard carries its status:
                        </p>
                        <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/90 bg-white shadow-xs">
                            {STATUSES.map((s) => (
                                <li key={s.status} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                                    <span className="w-44 shrink-0">
                                        <StatusChip status={s.status} />
                                    </span>
                                    <span className="text-sm text-zinc-700">{s.meaning}</span>
                                </li>
                            ))}
                        </ul>
                    </Section>

                    <Section id="ranking" kicker="03" title="Ranking">
                        <p>
                            The leaderboard ranks by{' '}
                            <strong className="font-semibold text-zinc-900">throughput per chip</strong> by default: the
                            setup&apos;s total tokens per second divided by its accelerator count. That compares a single L4
                            with a 32-GPU cluster like for like, instead of rewarding whoever ran the biggest cluster.
                        </p>
                        <Table
                            caption="Ranking objectives"
                            columns={[{ label: 'In the sentence' }, { label: 'Ranks by' }, { label: 'Better' }]}
                            rows={OBJECTIVES.map((o) => ({
                                key: o.value,
                                cells: [o.label, o.by, LOWER_IS_BETTER.has(o.value) ? 'Lower' : 'Higher'],
                            }))}
                        />
                        <p>
                            <strong className="font-semibold text-zinc-900">Cost per 1M tokens</strong> divides the
                            setup&apos;s hourly GCP list price (accelerator rate × chip count) by the tokens it serves in an
                            hour, input and output together. You can replace the list prices with your own rates on the
                            leaderboard.
                        </p>
                        <p>
                            The <strong className="font-semibold text-zinc-900">Pareto frontier</strong> marks the runs that
                            no other run in view beats on both throughput and time to first token. A run off the frontier is
                            slower, less responsive, or both, than some other option.
                        </p>
                        <p>
                            Across model sizes, per-chip throughput favours small models. Pick a model in the leaderboard
                            sentence to compare serving stacks for the same model.
                        </p>
                    </Section>

                    <Section id="workloads" kicker="04" title="Workload classes">
                        <p>
                            Each run is filed under one workload class, from its dataset name and its prompt and output
                            lengths. A class declared in the report always wins.
                        </p>
                        <Table
                            caption="Workload classes"
                            columns={[{ label: 'Class' }, { label: 'Rule' }]}
                            rows={WORKLOADS.map((w) => ({ key: w.value, cells: [w.label, w.rule] }))}
                        />
                    </Section>

                    <Section id="paths" kicker="05" title="Well-lit path numbers">
                        <p>
                            Home quotes one number per llm-d well-lit path. Each comes from the benchmark sweep published
                            with its guide, against the baseline named below. Every point of the sweep is listed, including
                            the ones that don&apos;t flatter the path.
                        </p>
                        <div className="space-y-4">
                            <PathProof
                                view="inference-scheduling"
                                proof={ROUTING_PROOF}
                                onNavigate={onNavigate}
                                columns={[
                                    { label: 'Load' },
                                    { label: 'Service p99 TTFT', numeric: true },
                                    { label: 'Gateway p99 TTFT', numeric: true },
                                    { label: 'Gain', numeric: true },
                                ]}
                                rows={(ROUTING_PROOF?.points || []).map((p) => ({
                                    key: p.qps,
                                    highlight: p.ratio === Math.max(...ROUTING_PROOF.points.map((q) => q.ratio)),
                                    cells: [`${p.qps} QPS`, `${num(p.baseline)} ms`, `${num(p.optimized)} ms`, ratio(p.ratio)],
                                }))}
                                notes={[
                                    'The headline is the best point of the sweep, so Home prefixes it with “up to”.',
                                    routingLoss &&
                                        `At ${routingLoss.qps} QPS there is little contention, and the gateway's p99 TTFT is higher than the Service's (${ratio(routingLoss.ratio)}). Its advantage appears under load.`,
                                    'The Kubernetes Service baseline was measured at these loads only; the guide charts the gateway alone at higher loads.',
                                ].filter(Boolean)}
                            />
                            <PathProof
                                view="pd-disaggregation"
                                proof={PD_PROOF}
                                onNavigate={onNavigate}
                                columns={[
                                    { label: 'Prefill : decode' },
                                    { label: 'Total throughput', numeric: true },
                                    { label: 'vs. even split', numeric: true },
                                ]}
                                rows={(PD_PROOF?.points || []).map((p) => ({
                                    key: p.split,
                                    highlight: p.isBest,
                                    cells: [
                                        `${p.prefill} : ${p.decode}${p.isReference ? ' (baseline)' : ''}`,
                                        `${num(p.total)} tok/s`,
                                        ratio(p.ratio),
                                    ],
                                }))}
                                notes={[
                                    pdReference &&
                                        `Compared with an even ${pdReference.prefill} : ${pdReference.decode} split of the same replicas, the split a team would deploy without tuning, not with the weakest split.`,
                                    PD_PROOF?.points?.[0]?.model && `Model: ${shortModelName(PD_PROOF.points[0].model)}.`,
                                    'This path is in preview while its guide is validated.',
                                ].filter(Boolean)}
                            />
                            <PathProof
                                view="prefix-cache-offloading"
                                proof={PREFIX_CACHE_PROOF}
                                onNavigate={onNavigate}
                                columns={[
                                    { label: 'Context' },
                                    ...(prefixTier ? [] : [{ label: 'Best tier' }]),
                                    { label: 'HBM-only', numeric: true },
                                    { label: 'Offloaded', numeric: true },
                                    { label: 'Gain', numeric: true },
                                ]}
                                rows={(PREFIX_CACHE_PROOF?.points || []).map((p) => ({
                                    key: p.size,
                                    cells: [
                                        <>
                                            {p.size}
                                            <span className="hidden sm:inline"> tokens</span>
                                        </>,
                                        ...(prefixTier ? [] : [p.tier]),
                                        `${num(p.baseline)} tok/s`,
                                        `${num(p.optimized)} tok/s`,
                                        ratio(p.ratio),
                                    ],
                                }))}
                                notes={[
                                    'Home shows the range across context lengths rather than only the best one.',
                                    prefixTier && `Offloaded to ${prefixTier}, the best tier at every context length.`,
                                    prefixSetup && `Setup: ${shortModelName(prefixSetup.model)} on ${prefixSetup.gpu}.`,
                                ].filter(Boolean)}
                            />
                            <PathProof
                                view="agentic-serving"
                                proof={AGENTIC_PROOF}
                                onNavigate={onNavigate}
                                columns={[
                                    { label: 'Concurrency' },
                                    { label: 'Service throughput', numeric: true },
                                    { label: 'Combined throughput', numeric: true },
                                    { label: 'Gain', numeric: true },
                                ]}
                                rows={(AGENTIC_PROOF?.points || []).map((p) => ({
                                    key: p.concurrency,
                                    cells: [
                                        `${p.concurrency} sessions`,
                                        `${num(p.baseline)} tok/s`,
                                        `${num(p.optimized)} tok/s`,
                                        ratio(p.ratio),
                                    ],
                                }))}
                                notes={[
                                    agenticSetup &&
                                        `Multi-turn code generation (${agenticSetup.contextK}-token mean input context) on ${shortModelName(agenticSetup.model)} across ${agenticSetup.accelerator}.`,
                                    'Combined optimizations layer prefix-aware routing, tiered KV-cache offloading, and Pallas kernels.',
                                ].filter(Boolean)}
                            />
                        </div>
                    </Section>

                    <Section id="samples" kicker="06" title="Sample data">
                        <p>
                            Until verified runs land, the leaderboard shows illustrative entries so you can explore how it
                            works. They are labelled <StatusChip status="sample" size="xs" className="align-middle" />, never
                            counted on Home, and give way to real runs as they are verified.
                        </p>
                        <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200/90 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6 shadow-xs">
                            <div>
                                <p className="text-base font-semibold text-zinc-900">Have a run that belongs here?</p>
                                <p className="mt-1 text-sm text-zinc-700">
                                    Upload its Benchmark Report v0.2. It ranks once it passes validation.
                                </p>
                            </div>
                            <Button href={`?view=${SUBMIT.view}`} onClick={go(SUBMIT.view)} size="md" className="shrink-0">
                                <UploadCloud className="h-4 w-4" /> {SUBMIT.label}
                            </Button>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
