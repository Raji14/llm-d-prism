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

import React, { useId, useMemo, useState } from 'react';
import { ExternalLink, LayoutDashboard, Share2, Sparkles, X } from 'lucide-react';
import { Button, ChartContainer, EmptyState, getSeriesShape, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, BaselinePicker, ExportActions, Notice, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { mdTable, pointsCsv } from './exporters';
import { fmtInt, fmtPct, fmtTput, itemKey, latencyLabel, latencyValue, pctDelta, peakPoint, runsConfig, seriesParity, seriesPoints, throughputMetric } from './catalog';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

// What the table shows per series: peak throughput, latency at that peak and
// the best latency, for the chart's metrics.
function seriesStats(points, { latency, stat, throughput }) {
    const peak = peakPoint(points, throughput);
    const lats = points.map((p) => latencyValue(p, latency, stat)).filter(isNum);
    return { peak: peak ? peak[throughput] : null, latAtPeak: peak ? latencyValue(peak, latency, stat) : null, best: lats.length ? Math.min(...lats) : null };
}

// Change against the baseline row. Higher throughput and lower latency are
// better; under ±0.5% it's left neutral. The direction is spelled out for
// screen readers, not only shown in color.
function Delta({ value, higherIsBetter }) {
    if (!isNum(value)) return <span className="text-zinc-400">—</span>;
    const better = higherIsBetter ? value > 0 : value < 0;
    const flat = Math.abs(value) < 0.5;
    return (
        <span className={cn(flat ? 'text-zinc-500' : better ? 'text-emerald-700' : 'text-red-700')}>
            {fmtPct(value)}
            {!flat && <span className="sr-only">{better ? ' (better)' : ' (worse)'}</span>}
        </span>
    );
}

// "accelerator (H100 vs TPU v6e) and chip count (8 vs 4)".
const listMismatches = (mismatches) => {
    const parts = mismatches.map((m) => `${m.label} (${m.values.join(' vs ')})`);
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
};
const listLabels = (fields) => {
    const labels = fields.map((f) => f.label);
    return labels.length > 1 ? `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}` : labels[0] || '';
};

// Compare: default axes, a series per run/curve, and added baselines overlaid
// (dashed). Browsing never publishes; saving turns the selection into a curve.
// `initialView` ({ latency, stat, throughput }) comes from a shared link.
//
// One series is the baseline for the table's Δ columns: the one added last
// with "Add baseline", else the first series, or whichever you pick.
export function CompareView({ items, initialView, resolve, baselineOptions, copy, canCurate, nav, onShare, onAddToDashboard, onOpenInBrowser }) {
    const [extra, setExtra] = useState([]);
    const [removed, setRemoved] = useState(() => new Set());
    const [pickedBase, setPickedBase] = useState(null);
    const tableHeadingId = useId();

    const all = useMemo(() => [...items, ...extra].filter((i) => !removed.has(itemKey(i))), [items, extra, removed]);
    const resolved = useMemo(() => all.map((i) => ({ item: i, s: resolve(i) })).filter((x) => x.s), [all, resolve]);
    const missing = all.length - resolved.length;
    // Results live in the browser that saved them, so a shared one can't open here.
    const missingResults = all.filter((i) => i.type === 'curve').length - resolved.filter((x) => x.item.type === 'curve').length;
    // Defaults come from the compared series only, so adding a baseline never
    // flips the chart to a metric they lack.
    const view = useChartView(
        resolved.filter((x) => !x.item.baseline).map((x) => x.s.points),
        { extraLists: resolved.filter((x) => x.item.baseline).map((x) => x.s.points), initial: initialView }
    );
    const { latency, stat, throughput } = view;
    const latLabel = latencyLabel(latency, stat);
    const tp = throughputMetric(throughput);
    const publishedCurves = resolved.filter((x) => x.s.curve && ['official', 'published'].includes(x.s.curve.status));
    const present = new Set(all.map(itemKey));
    // Saving a comparison as a result is curation: only for runs you may curate.
    const canSave = canCurate(resolved.filter((x) => !x.item.baseline).flatMap((x) => x.s.runs || []));

    const series = resolved.map(({ item, s }, i) => ({
        id: itemKey(item),
        name: s.name,
        color: seriesColor(i),
        shape: getSeriesShape(i),
        lineStyle: item.baseline ? 'dashed' : 'solid',
        points: seriesPoints(s.points, { latency, stat, throughput }),
    }));
    const unplotted = series.filter((s) => s.points.length === 0).map((s) => s.name);

    const base = resolved.find((x) => itemKey(x.item) === pickedBase) || resolved.find((x) => x.item.baseline) || resolved[0];
    const baseKey = base ? itemKey(base.item) : null;
    const rows = resolved.map((x, i) => ({ ...x, i, key: itemKey(x.item), stats: seriesStats(x.s.points, view) }));
    const baseStats = rows.find((r) => r.key === baseKey)?.stats;
    const deltas = (st) => ({
        peak: pctDelta(st.peak, baseStats?.peak),
        latAtPeak: pctDelta(st.latAtPeak, baseStats?.latAtPeak),
        best: pctDelta(st.best, baseStats?.best),
    });

    // Like-for-like: what differs between the series besides what you're testing.
    const parity = resolved.length > 1 ? seriesParity(resolved.map((x) => x.s.config || runsConfig(x.s.runs || []))) : null;
    const chipsDiffer = parity?.mismatches.some((m) => m.key === 'chips' || m.key === 'accelerator');

    const markdown = [
        `**Throughput vs latency** · ${latLabel} · ${tp.label.toLowerCase()} throughput`,
        mdTable(
            ['Series', 'Points', `Peak ${tp.label.toLowerCase()} (tok/s)`, 'Δ', `${latLabel} at peak (ms)`, 'Δ', `Best ${latLabel} (ms)`, 'Δ'],
            rows.map((r) => {
                const d = r.key === baseKey ? null : deltas(r.stats);
                return [
                    `${r.s.name}${r.key === baseKey ? ' · baseline' : ''}`,
                    r.s.points.length,
                    fmtTput(r.stats.peak),
                    d ? fmtPct(d.peak) : '',
                    fmtInt(r.stats.latAtPeak),
                    d ? fmtPct(d.latAtPeak) : '',
                    fmtInt(r.stats.best),
                    d ? fmtPct(d.best) : '',
                ];
            }),
            ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r']
        ),
        base ? `Δ is against ${base.s.name}. Higher throughput and lower latency are better.` : null,
        parity && !parity.likeForLike ? `> **Not like-for-like:** the series differ in ${listMismatches(parity.mismatches)}.` : null,
    ]
        .filter(Boolean)
        .join('\n\n');

    if (!all.length) {
        return (
            <div className="space-y-4">
                <BackButton onClick={nav.back}>Back to Browse</BackButton>
                <EmptyState title="Nothing to compare" message="Select runs or results in Browse, then choose Compare." />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <BackButton onClick={nav.back}>Back to Browse</BackButton>
            <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <div className="kicker text-accent-600">Compare</div>
                    <h2 className="display-title mt-1 text-2xl text-zinc-900">
                        {resolved.length} series
                        {missing > 0 && (
                            <span className="ml-2 text-sm font-medium text-zinc-500">
                                (
                                {missingResults === missing
                                    ? `${missing} result${missing === 1 ? ' only opens' : 's only open'} in the browser that saved ${missing === 1 ? 'it' : 'them'}`
                                    : missingResults > 0
                                      ? `${missing} couldn’t be found, including ${missingResults} result${missingResults === 1 ? '' : 's'} saved in another browser`
                                      : `${missing} couldn’t be found`}
                                )
                            </span>
                        )}
                    </h2>
                </div>
                <div className="flex flex-wrap gap-2">
                    {canSave && (
                        <Button size="sm" variant="secondary" onClick={() => nav.makeCurveFromItems(all.filter((i) => !i.baseline))}>
                            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            Save as result
                        </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => onShare({ kind: 'compare', items: all, title: 'Comparison', view: { latency, stat, throughput } })}>
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Share this view
                    </Button>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={!publishedCurves.length}
                        title={publishedCurves.length ? undefined : `Only ${copy.publishedLabel} results can go in a report.`}
                        onClick={() => onAddToDashboard(publishedCurves.map((x) => x.s.curve.id))}
                    >
                        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                        Add to report
                    </Button>
                </div>
            </header>

            {parity && !parity.likeForLike && (
                <Notice tone="warning">
                    Not like-for-like: these series differ in {listMismatches(parity.mismatches)}. Unless that’s what you’re comparing, the gaps between them may come
                    from it.
                    {chipsDiffer && !tp.perChip && ' Turn on Per chip to compare per accelerator.'}
                </Notice>
            )}
            {parity && parity.likeForLike && parity.matched.length > 0 && (
                <Notice>
                    Like-for-like: same {listLabels(parity.matched)}.
                    {parity.unrecorded.length > 0 && ` Not recorded for every series: ${listLabels(parity.unrecorded)}.`}
                </Notice>
            )}

            <ChartContainer
                title="Throughput vs latency"
                subtitle={
                    unplotted.length
                        ? `${unplotted.length} series can’t be plotted with ${latLabel} and ${tp.label.toLowerCase()} throughput: ${unplotted.join(', ')}. Try another statistic or metric.`
                        : `Each line is one run or result, in concurrency order. ${copy.publishedLabel} results added as baselines are dashed.`
                }
                actions={
                    <>
                        <MetricToggles view={view} />
                        <BaselinePicker
                            options={baselineOptions.filter((o) => !present.has(itemKey(o.item)))}
                            onPick={(o) => {
                                setExtra((prev) => [...prev, { ...o.item, baseline: true }]);
                                setPickedBase(itemKey(o.item));
                            }}
                            emptyText={`No ${copy.publishedLabel.toLowerCase()} results yet. Once you have one, you can add it here as a baseline.`}
                        />
                    </>
                }
            >
                <CurveChart series={series} latency={latency} stat={stat} throughput={throughput} height={380} />
            </ChartContainer>

            <section aria-labelledby={tableHeadingId} className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h3 id={tableHeadingId} className="text-sm font-semibold text-zinc-900">
                            Against the baseline
                        </h3>
                        <p className="mt-0.5 text-micro text-zinc-500">
                            {base ? (
                                <>
                                    Δ is against <span className="font-medium text-zinc-700">{base.s.name}</span>. Higher throughput and lower latency are better.
                                </>
                            ) : (
                                'Pick a baseline to see changes against it.'
                            )}
                        </p>
                    </div>
                    <ExportActions
                        filename="prism-comparison.csv"
                        csv={() => pointsCsv(resolved.map(({ item, s }) => ({ name: s.name, role: itemKey(item) === baseKey ? 'baseline' : 'compared', points: s.points })))}
                        markdown={markdown}
                    />
                </div>
                <div className="overflow-x-auto rounded-3xl border border-zinc-200 bg-white">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-zinc-200 bg-zinc-50/70">
                            <tr className="label-caps text-zinc-500">
                                <th className="px-4 py-3 font-semibold">Series</th>
                                <th className="px-4 py-3 font-semibold">Points</th>
                                <th className="px-4 py-3 text-right font-semibold">Peak {tp.label.toLowerCase()} (tok/s)</th>
                                <th className="px-4 py-3 text-right font-semibold">{latLabel} at peak (ms)</th>
                                <th className="px-4 py-3 text-right font-semibold">Best {latLabel} (ms)</th>
                                <th className="px-4 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {rows.map((r) => {
                                const isBase = r.key === baseKey;
                                const d = isBase ? null : deltas(r.stats);
                                return (
                                    <tr key={r.key} className={cn(isBase && 'bg-accent-50/40')}>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(r.i) }} aria-hidden="true" />
                                                <span className="font-medium text-zinc-900">{r.s.name}</span>
                                                {isBase && <span className="text-tiny font-semibold text-accent-700">baseline</span>}
                                                {r.s.curve && <ResultStatusChip status={r.s.curve.status} copy={copy} size="xs" />}
                                            </div>
                                            <div className="mt-0.5 pl-4 text-tiny text-zinc-500">{r.s.kindLabel}</div>
                                        </td>
                                        <td className="px-4 py-3 font-mono tabular-nums text-zinc-700">{r.s.points.length}</td>
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900">
                                            <div>{fmtTput(r.stats.peak)}</div>
                                            {d && (
                                                <div className="text-tiny">
                                                    <Delta value={d.peak} higherIsBetter />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700">
                                            <div>{fmtInt(r.stats.latAtPeak)}</div>
                                            {d && (
                                                <div className="text-tiny">
                                                    <Delta value={d.latAtPeak} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700">
                                            <div>{fmtInt(r.stats.best)}</div>
                                            {d && (
                                                <div className="text-tiny">
                                                    <Delta value={d.best} />
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {!isBase && (
                                                    <Button size="xs" variant="ghost" onClick={() => setPickedBase(r.key)} aria-label={`Use as baseline: ${r.s.name}`}>
                                                        Use as baseline
                                                    </Button>
                                                )}
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${r.s.name}`}
                                                    onClick={() => setRemoved((prev) => new Set(prev).add(r.key))}
                                                    className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <p className="text-micro text-zinc-500">
                Need every metric and percentile?{' '}
                <button
                    type="button"
                    onClick={() => onOpenInBrowser(resolved.flatMap((x) => x.s.runs || []))}
                    className="inline-flex items-center gap-1 font-medium text-accent-600 hover:underline"
                >
                    Open these runs in the Benchmark browser
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </button>
            </p>
        </div>
    );
}
