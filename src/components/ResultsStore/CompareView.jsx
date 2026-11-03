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

import React, { useEffect, useId, useMemo, useState } from 'react';
import { ExternalLink, LayoutDashboard, Share2, Sparkles, X } from 'lucide-react';
import { Button, ChartContainer, EmptyState, Select, getSeriesShape, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, BaselinePicker, ExportActions, Notice, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { mdTable, pointsCsv } from './exporters';
import {
    OPERATING_TTFT_MS,
    fmtDate,
    fmtInt,
    fmtPct,
    fmtTput,
    healthyPoints,
    itemKey,
    latencyLabel,
    latencyValue,
    limitLabel,
    overloadedKeys,
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
const LIMIT_P50_LABEL = limitLabel(OPERATING_TTFT_MS, 'p50');
const LIMIT_P99_LABEL = limitLabel(OPERATING_TTFT_MS, 'p99');
const LIMIT_SECONDS = secondsLabel(OPERATING_TTFT_MS);

// Signature of the underlying run keys for a series or baseline option, so a
// run/sweep/result is never offered as its own baseline.
const runSigOf = (keys) => {
    if (!keys?.length) return '';
    return [...new Set(keys.filter(Boolean))].sort().join('|');
};

// What the table shows per series: peak throughput and latency at peak on
// healthy (non-overloaded) points, best healthy latency, and throughput
// sustained within the TTFT p50 and p99 limits. When the raw highest-output
// point is overloaded, `overloadedPeak` records it so the table marks it
// "not comparable" instead of computing a misleading Δ on a saturated stage.
function seriesStats(points, { latency, stat, throughput }) {
    const satKeys = overloadedKeys(points);
    const healthy = healthyPoints(points);
    const rawPeak = peakPoint(points, throughput);
    const rawPeakOverloaded = Boolean(rawPeak && satKeys.has(rawPeak.key));
    const peak = healthy.length ? peakPoint(healthy, throughput) : null;
    const lats = healthy.map((p) => latencyValue(p, latency, stat)).filter(isNum);
    const usable = pricingPoint(points, OPERATING_TTFT_MS, 'p50');
    const usableP99 = pricingPoint(points, OPERATING_TTFT_MS, 'p99');
    return {
        peak: peak ? peak[throughput] : null,
        peakConc: peak?.conc ?? null,
        latAtPeak: peak ? latencyValue(peak, latency, stat) : null,
        best: lats.length ? Math.min(...lats) : null,
        overloadedPeak: rawPeakOverloaded ? rawPeak : null,
        allOverloaded: points.length > 0 && healthy.length === 0,
        satKeys,
        usable: usable.point && isNum(usable.point[throughput]) ? usable.point[throughput] : null,
        usableWhy: usable.reason,
        usableP99: usableP99.point && isNum(usableP99.point[throughput]) ? usableP99.point[throughput] : null,
        usableP99Why: usableP99.reason,
    };
}

// Change against the baseline row. Higher throughput and lower latency are
// better; under ±1.0% it's left neutral as run-to-run noise. The direction is
// shown visibly ("better" / "worse") as well as in color.
function Delta({ value, higherIsBetter }) {
    if (!isNum(value)) return <span className="text-zinc-400">—</span>;
    const better = higherIsBetter ? value > 0 : value < 0;
    const flat = Math.abs(value) < 1;
    return (
        <span className={cn(flat ? 'text-zinc-500' : better ? 'text-emerald-700' : 'text-red-700')}>
            {fmtPct(value)}
            {!flat && <span className="ml-1 font-sans text-micro opacity-85">{better ? 'better' : 'worse'}</span>}
        </span>
    );
}

const fmtDeltaMd = (value, higherIsBetter) => {
    if (!isNum(value)) return '—';
    const flat = Math.abs(value) < 1;
    const better = higherIsBetter ? value > 0 : value < 0;
    return flat ? fmtPct(value) : `${fmtPct(value)} (${better ? 'better' : 'worse'})`;
};

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
const usableCell = (val, why) => (isNum(val) ? fmtTput(val) : why === 'over-limit' ? `none ≤ ${LIMIT_SECONDS}` : 'not recorded');

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

// Provenance fields for a resolved series, using "not recorded" wherever a
// field was missing from the underlying report files.
function seriesProvenance(s, config) {
    const runs = s.runs || [];
    const modelFull = runs.map((r) => r.modelFull).find((m) => m && m !== 'Model not recorded') || s.curve?.meta?.model || config?.model || 'not recorded';
    const hw =
        s.curve?.meta?.accelerator ||
        (config?.accelerator ? `${config.accelerator}${config.chips ? ` ×${config.chips}` : ''}` : '') ||
        runs.map((r) => r.hwLabel).find((h) => h && h !== 'Accelerator not recorded') ||
        'not recorded';
    const setup = config?.setup || s.curve?.meta?.setup || runs.map((r) => r.setup || r.variant || r.runLabel).find(Boolean) || 'not recorded';
    const workload = config?.workload || s.curve?.meta?.workload || runs.map((r) => r.workload).find(Boolean) || 'not recorded';
    const harness = config?.harness || s.curve?.meta?.harness || runs.map((r) => r.harness).find(Boolean) || 'not recorded';
    const engine = config?.engine || s.curve?.meta?.engine || runs.map((r) => r.engine).find((e) => e && e !== 'not recorded') || 'not recorded';
    const tss = [...new Set(runs.map((r) => r.ts).filter(Boolean))].sort((a, b) => a - b);
    const measured = tss.length
        ? tss.length === 1 || fmtDate(tss[0]) === fmtDate(tss[tss.length - 1])
            ? fmtDate(tss[0])
            : `${fmtDate(tss[0])} – ${fmtDate(tss[tss.length - 1])}`
        : s.curve?.createdAt
          ? fmtDate(s.curve.createdAt)
          : 'not recorded';
    const runIds = [...new Set(runs.map((r) => r.runId || r.idLabel || r.key).filter(Boolean))].join(', ') || (s.curve ? `result:${s.curve.id}` : 'not recorded');
    return { modelId: modelFull, hw, setup, workload, harness, engine, measured, runIds };
}

// Compare: default axes, a series per run/curve, and added baselines overlaid
// (dashed). Browsing never publishes; saving turns the selection into a curve.
// `initialView` ({ latency, stat, throughput }) comes from a shared link.
//
// One series is the baseline for the table's Δ columns when 2+ series are
// compared: the one you pick, else the one added last with "Add baseline",
// else an Official result, else the most baseline-like name (baseline,
// standard, none, default), else the first series. With only 1 series, no
// baseline is set until one is added.
export function CompareView({ items, initialView, resolve, baselineOptions, copy, canMakeResult, nav, onShare, onLiveChange, onAddToDashboard, onOpenInBrowser }) {
    const [extra, setExtra] = useState([]);
    const [removed, setRemoved] = useState(() => new Set());
    // A shared link names the baseline its sender chose; open on it.
    const [pickedBase, setPickedBase] = useState(() => initialView?.base || null);
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
    const presentRunSigs = new Set(
        resolved
            .map((x) => runSigOf((x.s.runs || []).map((r) => r.key).concat(x.s.points.map((p) => p.runKey))))
            .filter(Boolean)
    );
    // Saving a comparison as a result is curation: only when the series form
    // one curve (one setup, no load level twice) of runs you may curate.
    const canSave = canMakeResult(resolved.filter((x) => !x.item.baseline).flatMap((x) => x.s.runs || []));

    // Two series can share a name (two batches of one setup, a watch's batch
    // and its baseline): add what tells them apart, so legend and menu differ.
    const nameCounts = resolved.reduce((m, x) => m.set(x.s.name, (m.get(x.s.name) || 0) + 1), new Map());
    const label = (s) => (nameCounts.get(s.name) > 1 && s.kindLabel ? `${s.name} (${s.kindLabel})` : s.name);

    const series = resolved.map(({ item, s }, i) => ({
        id: itemKey(item),
        name: label(s),
        color: seriesColor(i),
        shape: getSeriesShape(i),
        lineStyle: item.baseline ? 'dashed' : undefined,
        points: seriesPoints(s.points, { latency, stat, throughput }),
    }));
    const unplotted = series.filter((s) => s.points.length === 0).map((s) => s.name);

    const addedBase = [...resolved].reverse().find((x) => x.item.baseline);
    const officialBase = resolved.find((x) => x.s.curve?.status === copy.publishedStatus);
    const namedBase = resolved.reduce((best, x) => (baselineScore(x.s.name) > baselineScore(best?.s.name) ? x : best), null);
    const base =
        resolved.length < 2
            ? null
            : resolved.find((x) => itemKey(x.item) === pickedBase) ||
              addedBase ||
              officialBase ||
              (baselineScore(namedBase?.s.name) > 0 ? namedBase : null) ||
              resolved[0];
    const baseKey = base ? itemKey(base.item) : null;
    const baseIdx = base ? resolved.indexOf(base) : 0;

    // What's on screen now, for the address bar: series as added or removed,
    // the metric and statistic, and the baseline.
    useEffect(() => {
        onLiveChange?.({ items: all, view: { latency, stat, throughput, base: baseKey } });
    }, [onLiveChange, all, latency, stat, throughput, baseKey]);

    const configs = resolved.map((x) => x.s.config || runsConfig(x.s.runs || []));
    const rows = resolved.map((x, i) => ({
        ...x,
        i,
        key: itemKey(x.item),
        stats: seriesStats(x.s.points, view),
        prov: seriesProvenance(x.s, configs[i]),
    }));
    const hasP99 = rows.some((r) => r.s.points.some((p) => isNum(p.ttftP99)));
    const baseStats = rows.find((r) => r.key === baseKey)?.stats;
    const deltas = (st) => ({
        peak: pctDelta(st.peak, baseStats?.peak),
        latAtPeak: pctDelta(st.latAtPeak, baseStats?.latAtPeak),
        best: pctDelta(st.best, baseStats?.best),
        usable: pctDelta(st.usable, baseStats?.usable),
        usableP99: pctDelta(st.usableP99, baseStats?.usableP99),
    });

    // What the comparison tests: one thing differing is the variable under
    // test; several differing at once means no gap can be pinned on one.
    // When every recorded field matches ('repeat'), check whether throughput
    // dropped ≤ -5% or latency spiked ≥ +20%: if so, call it a likely
    // regression or unrecorded change instead of "run-to-run variation".
    const parity = resolved.length > 1 ? seriesParity(configs) : null;
    const framing = parityFraming(parity);
    const perChipHint = framing?.perChip && !tp.perChip ? ' Chip counts differ, so turn on Per chip to compare per accelerator.' : '';
    const nonBaseDeltas = rows.filter((r) => baseKey && r.key !== baseKey).map((r) => deltas(r.stats));
    const worstTputDrop = nonBaseDeltas.reduce((min, d) => {
        const drop = Math.min(isNum(d.usable) ? d.usable : 0, isNum(d.peak) ? d.peak : 0);
        return drop < min ? drop : min;
    }, 0);
    const worstLatSpike = nonBaseDeltas.reduce((max, d) => {
        const spike = Math.max(isNum(d.latAtPeak) ? d.latAtPeak : 0, isNum(d.best) ? d.best : 0);
        return spike > max ? spike : max;
    }, 0);
    const repeatRegressed = framing?.kind === 'repeat' && (worstTputDrop <= -5 || worstLatSpike >= 20);
    const repeatReason =
        worstTputDrop <= -5
            ? `throughput dropped ${fmtPct(worstTputDrop)} against the baseline`
            : `latency increased +${worstLatSpike.toFixed(1)}% against the baseline`;
    const framingText = !framing
        ? null
        : framing.kind === 'repeat'
          ? repeatRegressed
              ? `Same recorded setup in every series (${listLabels(parity.matched)}), but ${repeatReason} — a likely regression or an unrecorded change.`
              : `Same setup in every series (${listLabels(parity.matched)}), so small differences are run-to-run variation.`
          : framing.kind === 'test'
            ? `Testing ${listTested(parity.mismatches, Math.max(0, baseIdx))}.${parity.matched.length ? ` Same ${listLabels(parity.matched)}.` : ''}${perChipHint}`
            : `Not like-for-like: these series differ in ${listMismatches(parity.mismatches)}. A gap between them could come from any of these, not only the one you’re testing.${perChipHint}`;
    const unrecordedNote = parity?.unrecorded?.length ? `Not recorded for every series: ${listLabels(parity.unrecorded)}.` : '';
    const overloadedCount = rows.filter((r) => r.stats.overloadedPeak || r.stats.allOverloaded).length;
    const overloadedNote =
        overloadedCount > 0
            ? 'Overloaded stages (where latency spiked ≥5× for <25% more throughput) are marked not comparable and excluded from peak and best-latency Δ.'
            : '';

    // Baseline suggestions closest to what's compared come first. Never offer
    // any currently compared series (by key or by underlying run set) as its
    // own baseline.
    const target = configs.find((c, i) => !resolved[i].item.baseline) || configs[0];
    const pickable = rankBaselines(
        baselineOptions.filter((o) => {
            if (present.has(itemKey(o.item))) return false;
            const sig = runSigOf(o.runKeys);
            if (sig && presentRunSigs.has(sig)) return false;
            return true;
        }),
        target
    );

    const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
    const peakCellMd = (st) => {
        if (st.allOverloaded) return 'not comparable (overloaded)';
        if (st.overloadedPeak) {
            const raw = fmtTput(st.overloadedPeak[throughput]);
            const rawConc = st.overloadedPeak.conc != null ? ` at c=${st.overloadedPeak.conc}` : '';
            return `${fmtTput(st.peak)} (healthy; overloaded ${raw}${rawConc} not comparable)`;
        }
        return fmtTput(st.peak);
    };

    const summaryHeaders = [
        'Series',
        'Points',
        `${tp.label} at ${LIMIT_P50_LABEL} (tok/s)`,
        'Δ',
        ...(hasP99 ? [`${tp.label} at ${LIMIT_P99_LABEL} (tok/s)`, 'Δ p99'] : []),
        `Peak healthy ${tp.label.toLowerCase()} (tok/s)`,
        'Δ',
        `${latLabel} at peak (ms)`,
        'Δ',
        `Best ${latLabel} (ms)`,
        'Δ',
    ];
    const summaryAlign = ['l', 'r', 'r', 'r', ...(hasP99 ? ['r', 'r'] : []), 'r', 'r', 'r', 'r', 'r', 'r'];

    const markdown = [
        `**Throughput vs latency** · ${latLabel} · ${tp.label.toLowerCase()} throughput`,
        shareUrl ? `Share link: ${shareUrl}` : null,
        framingText || unrecordedNote ? `> ${[framingText, unrecordedNote].filter(Boolean).join(' ')}` : null,
        overloadedNote ? `> ${overloadedNote}` : null,
        mdTable(
            summaryHeaders,
            rows.map((r) => {
                const d = !baseKey || r.key === baseKey ? null : deltas(r.stats);
                return [
                    `${label(r.s)}${r.key === baseKey ? ' · baseline' : ''}`,
                    r.s.points.length,
                    usableCell(r.stats.usable, r.stats.usableWhy),
                    d ? fmtDeltaMd(d.usable, true) : '—',
                    ...(hasP99
                        ? [
                              usableCell(r.stats.usableP99, r.stats.usableP99Why),
                              d ? fmtDeltaMd(d.usableP99, true) : '—',
                          ]
                        : []),
                    peakCellMd(r.stats),
                    d && !r.stats.allOverloaded ? fmtDeltaMd(d.peak, true) : '—',
                    r.stats.allOverloaded ? 'not comparable' : fmtInt(r.stats.latAtPeak),
                    d && !r.stats.allOverloaded ? fmtDeltaMd(d.latAtPeak, false) : '—',
                    r.stats.allOverloaded ? 'not comparable' : fmtInt(r.stats.best),
                    d && !r.stats.allOverloaded ? fmtDeltaMd(d.best, false) : '—',
                ];
            }),
            summaryAlign
        ),
        `**Provenance**`,
        mdTable(
            ['Series', 'Role', 'Model ID', 'Hardware', 'Deployment', 'Workload (ISL/OSL)', 'Harness', 'Serving engine', 'Measured', 'Run IDs'],
            rows.map((r) => [
                label(r.s),
                !baseKey ? 'compared (no baseline)' : r.key === baseKey ? 'baseline' : 'compared',
                r.prov.modelId,
                r.prov.hw,
                r.prov.setup,
                r.prov.workload,
                r.prov.harness,
                r.prov.engine,
                r.prov.measured,
                r.prov.runIds,
            ]),
            ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'l']
        ),
        base
            ? `Δ is against ${label(base.s)}. Higher throughput and lower latency are better (±1% is treated as neutral run-to-run noise). “At ${LIMIT_P50_LABEL}” is the highest throughput with TTFT p50 ≤ ${LIMIT_SECONDS}.`
            : `No baseline selected — add a baseline in Compare to include Δ columns.`,
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
                    <Button size="sm" variant="secondary" onClick={() => onShare({ kind: 'compare', items: all, title: 'Comparison', view: { latency, stat, throughput, base: baseKey } })}>
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
                                {label(r.s)}
                            </option>
                        ))}
                    </Select>
                    <span>Every Δ below is measured against it.</span>
                </div>
            )}
            {framingText && (
                <Notice tone={framing.kind === 'mixed' || repeatRegressed ? 'warning' : 'info'}>
                    {framingText}
                    {framing.kind !== 'mixed' && unrecordedNote ? ` ${unrecordedNote}` : ''}
                </Notice>
            )}
            {overloadedNote && <Notice tone="warning">{overloadedNote}</Notice>}
            {resolved.length === 1 && compared.length === 1 && (
                <Notice>Add a baseline to see what changed. “Add baseline” lists the closest matches first: same model, hardware and workload.</Notice>
            )}
            {unplotted.length > 0 && (
                <Notice tone="warning">
                    {unplotted.length === series.length ? 'None of these series can be plotted' : `${unplotted.length} series can’t be plotted`} with {latLabel} and{' '}
                    {tp.label.toLowerCase()} throughput: {unplotted.join(', ')}. Try another statistic or metric.
                </Notice>
            )}

            <ChartContainer
                title="Throughput vs latency"
                subtitle="Each line is one run or result, in concurrency order. Baselines you add are dashed."
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
                            Higher throughput and lower latency are better. “At {LIMIT_P50_LABEL}” is the highest throughput with TTFT p50 within {LIMIT_SECONDS}.
                        </p>
                    </div>
                    <ExportActions
                        filename="prism-comparison.csv"
                        warnMessage={
                            resolved.length < 2
                                ? 'No baseline is selected yet — this export only has 1 series and no Δ comparison. Add a baseline first, or export anyway?'
                                : null
                        }
                        csv={() =>
                            pointsCsv(
                                rows.map((r) => ({
                                    name: label(r.s),
                                    role: !baseKey ? 'compared (no baseline)' : r.key === baseKey ? 'baseline' : 'compared',
                                    points: r.s.points,
                                    ...r.prov,
                                    overloadedKeys: r.stats.satKeys,
                                    caveats: [
                                        framingText,
                                        unrecordedNote,
                                        r.stats.overloadedPeak
                                            ? `Overloaded peak ${fmtTput(r.stats.overloadedPeak[throughput])}${r.stats.overloadedPeak.conc != null ? ` at c=${r.stats.overloadedPeak.conc}` : ''} not comparable`
                                            : null,
                                    ]
                                        .filter(Boolean)
                                        .join(' '),
                                    shareUrl,
                                }))
                            )
                        }
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
                                    {tp.label} at {LIMIT_P50_LABEL} (tok/s)
                                </th>
                                {hasP99 && (
                                    <th className="px-4 py-3 text-right font-semibold">
                                        {tp.label} at {LIMIT_P99_LABEL} (tok/s)
                                    </th>
                                )}
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
                                const isBase = Boolean(baseKey && r.key === baseKey);
                                const d = !baseKey || isBase ? null : deltas(r.stats);
                                return (
                                    <tr key={r.key} className={cn(isBase && 'bg-accent-50/40')}>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(r.i) }} aria-hidden="true" />
                                                <span className="font-medium text-zinc-900">{label(r.s)}</span>
                                                {isBase && <span className="text-tiny font-semibold text-accent-700">baseline</span>}
                                                {r.s.curve && <ResultStatusChip status={r.s.curve.status} copy={copy} size="xs" />}
                                            </div>
                                            <div className="mt-0.5 pl-4 text-tiny text-zinc-500">
                                                {r.s.kindLabel}
                                                {r.prov.setup && r.prov.setup !== 'not recorded' ? ` · ${r.prov.setup}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono tabular-nums text-zinc-700">{r.s.points.length}</td>
                                        <td
                                            className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900"
                                            title={r.stats.usableWhy === 'no-ttft' ? 'TTFT p50 wasn’t recorded' : undefined}
                                        >
                                            <div>{usableCell(r.stats.usable, r.stats.usableWhy)}</div>
                                            {d && (
                                                <div className="text-tiny">
                                                    <Delta value={d.usable} higherIsBetter />
                                                </div>
                                            )}
                                        </td>
                                        {hasP99 && (
                                            <td
                                                className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900"
                                                title={r.stats.usableP99Why === 'no-ttft' ? 'TTFT p99 wasn’t recorded' : undefined}
                                            >
                                                <div>{usableCell(r.stats.usableP99, r.stats.usableP99Why)}</div>
                                                {d && (
                                                    <div className="text-tiny">
                                                        <Delta value={d.usableP99} higherIsBetter />
                                                    </div>
                                                )}
                                            </td>
                                        )}
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900">
                                            {r.stats.allOverloaded ? (
                                                <span className="font-sans text-tiny font-medium text-amber-800">not comparable (overloaded)</span>
                                            ) : (
                                                <>
                                                    <div>{fmtTput(r.stats.peak)}</div>
                                                    {d && (
                                                        <div className="text-tiny">
                                                            <Delta value={d.peak} higherIsBetter />
                                                        </div>
                                                    )}
                                                    {r.stats.overloadedPeak && (
                                                        <div className="mt-0.5 font-sans text-micro text-amber-800">
                                                            overloaded peak ({fmtTput(r.stats.overloadedPeak[throughput])}
                                                            {r.stats.overloadedPeak.conc != null ? ` at c=${r.stats.overloadedPeak.conc}` : ''}) not comparable
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700">
                                            {r.stats.allOverloaded ? (
                                                <span className="font-sans text-tiny text-amber-800">not comparable</span>
                                            ) : (
                                                <>
                                                    <div>{fmtInt(r.stats.latAtPeak)}</div>
                                                    {d && (
                                                        <div className="text-tiny">
                                                            <Delta value={d.latAtPeak} />
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700">
                                            {r.stats.allOverloaded ? (
                                                <span className="font-sans text-tiny text-amber-800">not comparable</span>
                                            ) : (
                                                <>
                                                    <div>{fmtInt(r.stats.best)}</div>
                                                    {d && (
                                                        <div className="text-tiny">
                                                            <Delta value={d.best} />
                                                        </div>
                                                    )}
                                                </>
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
