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
import { Button, ChartContainer, EmptyState, Select, getSeriesShape, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, BaselinePicker, ExportActions, Notice, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { mdTable, pointsCsv } from './exporters';
import {
    OPERATING_TTFT_MS,
    fmtInt,
    fmtPct,
    fmtTput,
    itemKey,
    latencyLabel,
    latencyValue,
    limitLabel,
    parityFraming,
    pctDelta,
    peakPoint,
    pricingPoint,
    rankBaselines,
    runsConfig,
    secondsLabel,
    seriesParity,
    seriesPoints,
    throughputMetric,
} from './catalog';

const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const LIMIT_LABEL = limitLabel();
const LIMIT_SECONDS = secondsLabel(OPERATING_TTFT_MS);

// What the table shows per series: peak throughput, latency at that peak, the
// best latency, and the throughput it sustains within the TTFT limit (what a
// user would actually get; the peak is often an overloaded point).
function seriesStats(points, { latency, stat, throughput }) {
    const peak = peakPoint(points, throughput);
    const lats = points.map((p) => latencyValue(p, latency, stat)).filter(isNum);
    const usable = pricingPoint(points, OPERATING_TTFT_MS);
    return {
        peak: peak ? peak[throughput] : null,
        latAtPeak: peak ? latencyValue(peak, latency, stat) : null,
        best: lats.length ? Math.min(...lats) : null,
        usable: usable.point && isNum(usable.point[throughput]) ? usable.point[throughput] : null,
        usableWhy: usable.reason,
    };
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
// What's under test, baseline first: "deployment (standard-k8s → precise-prefix-cache-routing, predicted-latency-routing)".
const listTested = (mismatches, baseIdx) =>
    listLabels(
        mismatches.map((m) => {
            const from = m.byIndex[baseIdx] || 'not recorded';
            const to = [...new Set(m.byIndex.filter((v, i) => i !== baseIdx && v && v.toLowerCase() !== from.toLowerCase()))];
            return { label: `${m.label} (${from} → ${to.join(', ')})` };
        })
    );
const usableCell = (st) => (isNum(st.usable) ? fmtTput(st.usable) : st.usableWhy === 'over-limit' ? `none ≤ ${LIMIT_SECONDS}` : '—');

// How much a series name says "I'm the baseline": the default baseline is
// the most baseline-like series when nobody picked one.
function baselineScore(name) {
    const s = String(name || '').toLowerCase();
    if (/\bbaseline\b/.test(s)) return 4;
    if (/\b(standard|vanilla|plain)\b/.test(s)) return 3;
    if (/\b(none|no[-_ ]?scorer)\b/.test(s)) return 2;
    if (/\b(default|base)\b/.test(s)) return 1;
    return 0;
}

// Compare: default axes, a series per run/curve, and added baselines overlaid
// (dashed). Browsing never publishes; saving turns the selection into a curve.
// `initialView` ({ latency, stat, throughput }) comes from a shared link.
//
// One series is the baseline for the table's Δ columns: the one you pick,
// else the one added last with "Add baseline", else an Official result, else
// the most baseline-like name (baseline, standard, none, default), else the
// first series.
export function CompareView({ items, initialView, resolve, baselineOptions, copy, canCurate, nav, onShare, onAddToDashboard, onOpenInBrowser }) {
    const [extra, setExtra] = useState([]);
    const [removed, setRemoved] = useState(() => new Set());
    const [pickedBase, setPickedBase] = useState(null);
    const tableHeadingId = useId();
    const baseSelectId = useId();
    const backLabel = nav.backLabel || 'Back to Browse';

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

    const addedBase = [...resolved].reverse().find((x) => x.item.baseline);
    const officialBase = resolved.find((x) => x.s.curve?.status === copy.publishedStatus);
    const namedBase = resolved.reduce((best, x) => (baselineScore(x.s.name) > baselineScore(best?.s.name) ? x : best), null);
    const base = resolved.find((x) => itemKey(x.item) === pickedBase) || addedBase || officialBase || (baselineScore(namedBase?.s.name) > 0 ? namedBase : null) || resolved[0];
    const baseKey = base ? itemKey(base.item) : null;
    const baseIdx = resolved.indexOf(base);
    const rows = resolved.map((x, i) => ({ ...x, i, key: itemKey(x.item), stats: seriesStats(x.s.points, view) }));
    const baseStats = rows.find((r) => r.key === baseKey)?.stats;
    const deltas = (st) => ({
        peak: pctDelta(st.peak, baseStats?.peak),
        latAtPeak: pctDelta(st.latAtPeak, baseStats?.latAtPeak),
        best: pctDelta(st.best, baseStats?.best),
        usable: pctDelta(st.usable, baseStats?.usable),
    });

    // What the comparison tests: one thing differing is the variable under
    // test; several differing at once means no gap can be pinned on one.
    const configs = resolved.map((x) => x.s.config || runsConfig(x.s.runs || []));
    const parity = resolved.length > 1 ? seriesParity(configs) : null;
    const framing = parityFraming(parity);
    const perChipHint = framing?.perChip && !tp.perChip ? ' Chip counts differ, so turn on Per chip to compare per accelerator.' : '';
    const framingText = !framing
        ? null
        : framing.kind === 'repeat'
          ? `Same setup in every series (${listLabels(parity.matched)}), so the differences are run-to-run variation.`
          : framing.kind === 'test'
            ? `Testing ${listTested(parity.mismatches, Math.max(0, baseIdx))}.${parity.matched.length ? ` Same ${listLabels(parity.matched)}.` : ''}${perChipHint}`
            : `Not like-for-like: these series differ in ${listMismatches(parity.mismatches)}. A gap between them could come from any of these, not only the one you’re testing.${perChipHint}`;

    // Baseline suggestions closest to what's compared come first.
    const target = configs.find((c, i) => !resolved[i].item.baseline) || configs[0];
    const pickable = rankBaselines(
        baselineOptions.filter((o) => !present.has(itemKey(o.item))),
        target
    );

    const markdown = [
        `**Throughput vs latency** · ${latLabel} · ${tp.label.toLowerCase()} throughput`,
        framingText ? `> ${framingText}` : null,
        mdTable(
            ['Series', 'Points', `${tp.label} at ${LIMIT_LABEL} (tok/s)`, 'Δ', `Peak ${tp.label.toLowerCase()} (tok/s)`, 'Δ', `${latLabel} at peak (ms)`, 'Δ', `Best ${latLabel} (ms)`, 'Δ'],
            rows.map((r) => {
                const d = r.key === baseKey ? null : deltas(r.stats);
                return [
                    `${r.s.name}${r.key === baseKey ? ' · baseline' : ''}`,
                    r.s.points.length,
                    usableCell(r.stats),
                    d ? fmtPct(d.usable) : '',
                    fmtTput(r.stats.peak),
                    d ? fmtPct(d.peak) : '',
                    fmtInt(r.stats.latAtPeak),
                    d ? fmtPct(d.latAtPeak) : '',
                    fmtInt(r.stats.best),
                    d ? fmtPct(d.best) : '',
                ];
            }),
            ['l', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r', 'r']
        ),
        base ? `Δ is against ${base.s.name}. Higher throughput and lower latency are better. “At ${LIMIT_LABEL}” is the most throughput with a first token within ${LIMIT_SECONDS}.` : null,
    ]
        .filter(Boolean)
        .join('\n\n');

    if (!all.length) {
        return (
            <div className="space-y-4">
                <BackButton onClick={nav.back}>{backLabel}</BackButton>
                <EmptyState title="Nothing to compare" message="Select runs or results in Browse, then choose Compare." />
            </div>
        );
    }

    const compared = resolved.filter((x) => !x.item.baseline);

    return (
        <div className="space-y-6">
            <BackButton onClick={nav.back}>{backLabel}</BackButton>
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
                            Make result
                        </Button>
                    )}
                    <Button size="sm" variant="secondary" onClick={() => onShare({ kind: 'compare', items: all, title: 'Comparison', view: { latency, stat, throughput } })}>
                        <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Share this view
                    </Button>
                    {/* Every series can go in a report. Runs and sweeps go in as results;
                        any that aren't Official are marked Unofficial there. */}
                    <Button size="sm" variant="secondary" onClick={() => onAddToDashboard(resolved.map((x) => x.item))}>
                        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                        Add to report
                    </Button>
                </div>
            </header>

            {resolved.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <label htmlFor={baseSelectId} className="font-semibold text-zinc-700">
                        Baseline
                    </label>
                    <Select
                        surface="light"
                        id={baseSelectId}
                        value={baseKey || ''}
                        onChange={(e) => setPickedBase(e.target.value)}
                        className="w-auto max-w-full rounded-full py-1.5 text-xs"
                    >
                        {rows.map((r) => (
                            <option key={r.key} value={r.key}>
                                {r.s.name}
                            </option>
                        ))}
                    </Select>
                    <span>Every Δ below is measured against it.</span>
                </div>
            )}
            {framingText && (
                <Notice tone={framing.kind === 'mixed' ? 'warning' : 'info'}>
                    {framingText}
                    {framing.kind !== 'mixed' && parity.unrecorded.length > 0 && ` Not recorded for every series: ${listLabels(parity.unrecorded)}.`}
                </Notice>
            )}
            {resolved.length === 1 && compared.length === 1 && (
                <Notice>Add a baseline to see what changed. “Add baseline” lists the closest matches first: same model, hardware and workload.</Notice>
            )}

            <ChartContainer
                title="Throughput vs latency"
                subtitle={
                    unplotted.length
                        ? `${unplotted.length} series can’t be plotted with ${latLabel} and ${tp.label.toLowerCase()} throughput: ${unplotted.join(', ')}. Try another statistic or metric.`
                        : 'Each line is one run or result, in concurrency order. Baselines you add are dashed.'
                }
                actions={
                    <>
                        <MetricToggles view={view} />
                        <BaselinePicker
                            options={pickable}
                            onPick={(o) => {
                                setExtra((prev) => [...prev, { ...o.item, baseline: true }]);
                                setPickedBase(itemKey(o.item));
                            }}
                            emptyText="Nothing else to add yet. Runs and results show up here once they’re loaded."
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
                            {/* The Baseline menu above and the row's tag already name the baseline. */}
                            Higher throughput and lower latency are better. “At {LIMIT_LABEL}” is the most throughput with a first token within {LIMIT_SECONDS}, which is what users get.
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
                                <th className="px-4 py-3 text-right font-semibold">
                                    {tp.label} at {LIMIT_LABEL} (tok/s)
                                </th>
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
                                        <td
                                            className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900"
                                            title={r.stats.usableWhy === 'no-ttft' ? 'TTFT wasn’t recorded' : undefined}
                                        >
                                            <div>{usableCell(r.stats)}</div>
                                            {d && (
                                                <div className="text-tiny">
                                                    <Delta value={d.usable} higherIsBetter />
                                                </div>
                                            )}
                                        </td>
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
                                        {/* The Baseline menu above picks the baseline; rows only remove. */}
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                type="button"
                                                aria-label={`Remove ${r.s.name}`}
                                                title="Remove from this comparison"
                                                onClick={() => setRemoved((prev) => new Set(prev).add(r.key))}
                                                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                                            >
                                                <X className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
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
