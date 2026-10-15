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

import React, { useId, useState } from 'react';
import { Activity, ExternalLink, GitCompareArrows, Share2, Sparkles } from 'lucide-react';
import { Badge, Button, ChartContainer, EmptyState, Panel, StatusChip, TabPanel, Tabs } from '../ui';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, MetaGrid, PublishedState, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { concRange, configKeyOf, fmtDateTime, fmtInt, fmtMs, fmtTput, latencyLabel, peakOutput, seriesPoints, typicalStat } from './catalog';

// One label/value pair of the KPI grid, which is a <dl>.
function Kpi({ label, value, unit }) {
    return (
        <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white px-4 py-3">
            <dt className="label-caps text-zinc-500">{label}</dt>
            <dd className="mt-1 font-display text-xl font-bold tabular-nums tracking-display text-zinc-900">
                {value}
                {unit && <span className="ml-1 font-sans text-xs font-medium text-zinc-500">{unit}</span>}
            </dd>
        </div>
    );
}

const previewJson = (obj) => {
    try {
        const s = JSON.stringify(obj, null, 2);
        return s.length > 6000 ? `${s.slice(0, 6000)}\n…` : s;
    } catch {
        return '';
    }
};

// Run page: chart first with default axes, then Metadata · Configs & logs · Lineage.
export function RunDetail({ run, parentRow, curvesUsingRun, copy, canCurate, resultOf, nav, onShare }) {
    const [tab, setTab] = useState('meta');
    const tabsId = useId();
    // Opens on a latency (and statistic) this run recorded: some archive runs have no TTFT.
    const view = useChartView(run ? (parentRow ? [parentRow.points, run.points] : [run.points]) : []);

    if (!run) {
        return (
            <div className="space-y-4">
                <BackButton onClick={nav.back}>Back to Browse</BackButton>
                <EmptyState title="Run not found" message="It may still be loading, or its source is no longer connected." />
            </div>
        );
    }

    const { latency, stat, throughput } = view;
    const single = run.points.length === 1;
    const p = run.points[0];
    const series = [];
    if (single && parentRow) {
        series.push({ id: parentRow.key, name: `Sweep · ${parentRow.runs.length} runs`, points: seriesPoints(parentRow.points, { latency, stat, throughput }), lineStyle: 'dashed', shape: 'diamond' });
    }
    series.push({ id: run.key, name: single ? `This run${p.conc != null ? ` (c=${p.conc})` : ''}` : run.title, points: seriesPoints(run.points, { latency, stat, throughput }) });
    // "TTFT mean": the KPI says which statistic it is.
    const kpiLabel = (metric) => latencyLabel(metric, typicalStat(p, metric));

    // A run that's part of a sweep publishes the whole sweep, and says so.
    const subjectRuns = parentRow ? parentRow.runs : [run];
    const curate = canCurate(subjectRuns);
    const published = resultOf(subjectRuns);
    const internal = copy.publishedStatus === 'official';
    const publishLabel = parentRow ? (internal ? 'Mark sweep official' : 'Submit sweep for review') : copy.publishVerb;

    return (
        <div className="space-y-6">
            <BackButton onClick={nav.back}>Back to Browse</BackButton>

            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                    <div className="kicker text-accent-600">Run</div>
                    <h2 className="display-title mt-1 text-2xl text-zinc-900">{run.title}</h2>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge size="xs">{run.harness}</Badge>
                        <Badge size="xs">{run.source}</Badge>
                        {run.category !== 'Uncategorized' && <Badge size="xs">{run.category}</Badge>}
                        {!run.hwLabel && <StatusChip status="action" size="xs" label="Hardware not recorded" />}
                        <span className="text-micro text-zinc-500">
                            {fmtDateTime(run.ts)} · run <span className="font-mono">{run.idLabel}</span>
                        </span>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => nav.openCompare([{ type: 'run', key: run.key }])}>
                        <GitCompareArrows className="h-3.5 w-3.5" aria-hidden="true" />
                        Compare with…
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => nav.watchSetup({ configKey: configKeyOf(run) })}>
                        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                        Watch this setup
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => onShare({ kind: 'run', key: run.key, title: run.title })}>
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Share
                    </Button>
                    {published && <PublishedState curve={published} copy={copy} size="sm" onOpen={() => nav.openCurve(published.id)} />}
                    {!published && curate && (
                        <>
                            <Button size="sm" variant="secondary" onClick={() => nav.makeCurve(subjectRuns)}>
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                {parentRow ? 'Edit sweep' : 'Make result'}
                            </Button>
                            <Button size="sm" onClick={() => nav.publish(subjectRuns)}>
                                {publishLabel}
                            </Button>
                        </>
                    )}
                </div>
            </header>

            {single && (
                <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <Kpi label="Output" value={fmtTput(p.output)} unit="tok/s" />
                    <Kpi label={kpiLabel('ttft')} value={fmtMs(p.ttft)} />
                    <Kpi label={kpiLabel('tpot')} value={fmtMs(p.tpot)} />
                    <Kpi label={kpiLabel('e2e')} value={fmtMs(p.e2e)} />
                    <Kpi label="Failed requests" value={p.errPct != null ? `${p.errPct.toFixed(1)}%` : fmtInt(p.errCount)} />
                </dl>
            )}

            <ChartContainer
                title="Throughput vs latency"
                subtitle={
                    single
                        ? parentRow
                            ? `This run measured one concurrency level. It's part of a sweep (${concRange(parentRow.points)}).`
                            : 'This run measured one point.'
                        : `${run.points.length} stages · ${concRange(run.points) || 'concurrency not recorded'} · peak ${fmtTput(peakOutput(run.points))} tok/s`
                }
                actions={<MetricToggles view={view} />}
            >
                <CurveChart series={series} latency={latency} stat={stat} throughput={throughput} />
            </ChartContainer>

            <Panel variant="editorial" padding="md">
                <Tabs
                    ariaLabel="Run details"
                    idBase={tabsId}
                    value={tab}
                    onChange={setTab}
                    tabs={[
                        { value: 'meta', label: 'Metadata' },
                        { value: 'configs', label: 'Configs & logs' },
                        { value: 'lineage', label: 'Lineage' },
                    ]}
                    className="mb-5"
                />
                <TabPanel idBase={tabsId} value={tab}>
                    {tab === 'meta' && (
                        <MetaGrid
                            items={[
                                { label: 'Model', value: run.modelFull },
                                { label: 'Hardware', value: run.hwLabel || 'Not recorded' },
                                { label: 'Workload (ISL/OSL)', value: run.workload || 'Not recorded', mono: true },
                                { label: single ? 'Concurrency' : 'Stages', value: single ? (p.conc ?? 'Not recorded') : `${run.points.length} · ${concRange(run.points) || 'concurrency not recorded'}`, mono: true },
                                { label: 'Harness', value: run.harness },
                                { label: 'Serving engine', value: run.engine },
                                { label: 'Deployment', value: run.setup },
                                { label: 'Category', value: run.category },
                                { label: 'Source', value: run.source },
                                { label: 'Measured', value: fmtDateTime(run.ts) },
                                { label: 'Run ID', value: run.runId, mono: true },
                                { label: 'Submitted by', value: run.author ? `@${run.author}` : null },
                            ]}
                        />
                    )}
                    {tab === 'configs' && (
                        <div className="space-y-4 text-xs text-zinc-700">
                            {run.fileId && (
                                <p>
                                    Report file: <span className="font-mono text-zinc-900">{run.fileId}</span>
                                </p>
                            )}
                            {run.rawUrl && (
                                <Button size="xs" variant="secondary" href={run.rawUrl} target="_blank" rel="noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                    Open source folder
                                </Button>
                            )}
                            {run.rawReport ? (
                                <pre className="max-h-96 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-50 p-4 font-mono text-tiny leading-relaxed text-zinc-800">
                                    {previewJson(run.rawReport)}
                                </pre>
                            ) : (
                                <p className="text-zinc-600">No configs or logs were attached to this run.</p>
                            )}
                        </div>
                    )}
                    {tab === 'lineage' && (
                        <div className="space-y-4 text-xs text-zinc-700">
                            <ol className="space-y-2">
                                <li>
                                    <span className="font-semibold text-zinc-900">Measured</span> by {run.harness}
                                    {run.engine ? ` against ${run.engine}` : ''} on {fmtDateTime(run.ts)}.
                                </li>
                                <li>
                                    <span className="font-semibold text-zinc-900">Ingested</span> from {run.source}{' '}
                                    <span className="font-mono text-zinc-500">({run.sourceRaw})</span>. Measured values are read-only.
                                </li>
                                {parentRow && (
                                    <li>
                                        <span className="font-semibold text-zinc-900">Grouped</span> with {parentRow.runs.length - 1} other runs into a sweep (
                                        {concRange(parentRow.points)}).
                                    </li>
                                )}
                            </ol>
                            <div>
                                <div className="label-caps mb-2 text-zinc-500">Used in results</div>
                                {curvesUsingRun.length === 0 ? (
                                    <p className="text-zinc-600">Not used in any result yet.</p>
                                ) : (
                                    <ul className="space-y-1.5">
                                        {curvesUsingRun.map((c) => (
                                            <li key={c.id} className="flex flex-wrap items-center gap-2">
                                                <button type="button" onClick={() => nav.openCurve(c.id)} className="font-medium text-accent-700 hover:underline">
                                                    {c.name}
                                                </button>
                                                <ResultStatusChip status={c.status} size="xs" />
                                                <span className="text-tiny text-zinc-500">v{c.version}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </TabPanel>
            </Panel>
        </div>
    );
}
