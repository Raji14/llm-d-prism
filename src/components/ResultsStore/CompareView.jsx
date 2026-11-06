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
import { LayoutDashboard, Share2, Sparkles, X } from 'lucide-react';
import { Badge, Button, ChartContainer, EmptyState, Input, Panel, Select, ToggleGroup, getSeriesShape, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, BaselinePicker, ExportActions, Notice, ResultStatusChip, decodeDataUrl } from './parts';
import { useChartView } from './useChartView';
import { mdTable, pointsCsv } from './exporters';
import {
    OPERATING_TTFT_MS,
    accelTypeOf,
    costPerMillion,
    fmtCount,
    fmtDate,
    fmtInt,
    fmtMoney,
    fmtPct,
    fmtTput,
    healthyPoints,
    itemKey,
    latencyLabel,
    latencyValue,
    limitLabel,
    listPrice,
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
        usableOutput: usable.point && isNum(usable.point.output) ? usable.point.output : null,
        usablePerChip: usable.point && isNum(usable.point.outputPerChip) ? usable.point.outputPerChip : null,
        usableConc: usable.point?.conc ?? null,
        usableWhy: usable.reason,
        usableP99: usableP99.point && isNum(usableP99.point[throughput]) ? usableP99.point[throughput] : null,
        usableP99Why: usableP99.reason,
    };
}

// Compute repeat batch count (`n`) and throughput spread across repeat batches
// when a Browse row has multiple repeat runs/batches.
function repeatSpreadOf(s, throughput) {
    const repeats = s.repeats || [];
    const n = Math.max(1, repeats.length);
    if (n < 2) return { n: 1, min: null, max: null };
    const vals = repeats
        .map((rep) => {
            const pts = (rep.runs || []).flatMap((r) => r.points || []);
            const hit = pricingPoint(pts, OPERATING_TTFT_MS, 'p50');
            if (hit.point && isNum(hit.point[throughput])) return hit.point[throughput];
            const pk = peakPoint(healthyPoints(pts), throughput);
            return pk ? pk[throughput] : null;
        })
        .filter(isNum);
    if (vals.length < 2) return { n, min: null, max: null };
    return { n, min: Math.min(...vals), max: Math.max(...vals) };
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
    const r0 = runs[0];
    const workloadType = r0
        ? r0.workloadConfigured
            ? `${r0.workload} (configured${r0.measuredWorkload && r0.measuredWorkload !== r0.workload ? ` · measured ${r0.measuredWorkload}` : ''})`
            : `${r0.workload || 'not recorded'} (measured average)`
        : workload;
    const harness = config?.harness || s.curve?.meta?.harness || runs.map((r) => r.harness).find(Boolean) || 'not recorded';
    const engine = config?.engine || s.curve?.meta?.engine || runs.map((r) => r.engine).find((e) => e && e !== 'not recorded') || 'not recorded';
    const harnessArgs = runs.map((r) => r.runMetadata?.harness_args).find(Boolean) || 'not recorded';
    const attachments = runs.flatMap((r) => r.attachments || []);
    const configAttachment = attachments.find((f) => /\.(ya?ml|json)$/i.test(f.name) && /^data:/i.test(f.value)) || null;
    const configText = configAttachment ? decodeDataUrl(configAttachment.value) : null;
    const tss = [...new Set(runs.map((r) => r.ts).filter(Boolean))].sort((a, b) => a - b);
    const measured = tss.length
        ? tss.length === 1 || fmtDate(tss[0]) === fmtDate(tss[tss.length - 1])
            ? fmtDate(tss[0])
            : `${fmtDate(tss[0])} – ${fmtDate(tss[tss.length - 1])}`
        : s.curve?.createdAt
          ? fmtDate(s.curve.createdAt)
          : 'not recorded';
    const runIds = [...new Set(runs.map((r) => r.runId || r.idLabel || r.key).filter(Boolean))].join(', ') || (s.curve ? `result:${s.curve.id}` : 'not recorded');
    return {
        modelId: modelFull,
        hw,
        setup,
        workload,
        workloadType,
        harness,
        engine,
        harnessArgs,
        configName: configAttachment?.name || null,
        configText,
        measured,
        runIds,
    };
}

// Line-level diff between two config texts (baseline vs compared).
function diffConfigLines(baseText, otherText) {
    if (!baseText || !otherText || baseText.trim() === otherText.trim()) return [];
    const aLines = baseText.split(/\r?\n/).map((l) => l.trimEnd());
    const bLines = otherText.split(/\r?\n/).map((l) => l.trimEnd());
    const aSet = new Set(aLines.filter((l) => l.trim() && !l.trim().startsWith('#')));
    const bSet = new Set(bLines.filter((l) => l.trim() && !l.trim().startsWith('#')));
    const removed = [...aSet].filter((l) => !bSet.has(l)).slice(0, 12);
    const added = [...bSet].filter((l) => !aSet.has(l)).slice(0, 12);
    return [
        ...removed.map((line) => ({ kind: 'removed', line })),
        ...added.map((line) => ({ kind: 'added', line })),
    ];
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
export function CompareView({
    items,
    initialView,
    resolve,
    baselineOptions,
    copy,
    canMakeResult,
    customRates = {},
    nav,
    onShare,
    onLiveChange,
    onAddToDashboard,
}) {
    const [extra, setExtra] = useState([]);
    const [removed, setRemoved] = useState(() => new Set());
    // A shared link names the baseline its sender chose; open on it.
    const [pickedBase, setPickedBase] = useState(() => initialView?.base || null);
    const [priceOverrides, setPriceOverrides] = useState({});
    const [diffFilter, setDiffFilter] = useState('diff');
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
    const rows = resolved.map((x, i) => {
        const stats = seriesStats(x.s.points, view);
        const prov = seriesProvenance(x.s, configs[i]);
        const accelType = accelTypeOf(prov.hw);
        const chips = Number(configs[i]?.chips) || x.s.points[0]?.chips || 1;
        const catalogRate = listPrice(accelType, customRates);
        const overrideVal = priceOverrides[accelType];
        const hasOverride = overrideVal !== undefined && overrideVal !== '';
        const unitPrice = hasOverride ? Number(overrideVal) : catalogRate?.price ?? null;
        const priceSource = hasOverride
            ? 'Custom override'
            : catalogRate?.source === 'custom'
              ? 'Saved custom rate'
              : catalogRate?.source === 'list'
                ? 'GCP on-demand list (us-central1)'
                : null;
        const costPerM = costPerMillion(unitPrice, chips, stats.usableOutput);
        const tokPerDollar = isNum(costPerM) && costPerM > 0 ? 1e6 / costPerM : null;
        const spread = repeatSpreadOf(x.s, throughput);
        return {
            ...x,
            i,
            key: itemKey(x.item),
            stats,
            prov,
            accelType,
            chips,
            unitPrice: isNum(unitPrice) && unitPrice > 0 ? unitPrice : null,
            priceSource,
            costPerM,
            tokPerDollar,
            spread,
        };
    });

    const accelTypes = (() => {
        const seen = new Map();
        rows.forEach((r) => {
            if (r.accelType && r.accelType !== 'Accelerator not recorded' && !seen.has(r.accelType)) {
                const cat = listPrice(r.accelType, customRates);
                seen.set(r.accelType, {
                    type: r.accelType,
                    defaultPrice: cat?.price ?? null,
                    source: cat?.source === 'list' ? 'GCP on-demand list' : cat?.source === 'custom' ? 'Saved custom rate' : 'No list price',
                });
            }
        });
        return [...seen.values()];
    })();

    const pricedRows = rows.filter((r) => isNum(r.costPerM));
    const cheapestRow = pricedRows.length >= 2 ? pricedRows.reduce((best, r) => (r.costPerM < best.costPerM ? r : best)) : null;
    const bestUsableRow = rows.filter((r) => isNum(r.stats.usable)).length >= 2
        ? rows.filter((r) => isNum(r.stats.usable)).reduce((best, r) => (r.stats.usable > best.stats.usable ? r : best))
        : null;
    const bestPerChipRow = rows.filter((r) => isNum(r.stats.usablePerChip)).length >= 2
        ? rows.filter((r) => isNum(r.stats.usablePerChip)).reduce((best, r) => (r.stats.usablePerChip > best.stats.usablePerChip ? r : best))
        : null;

    const hasP99 = rows.some((r) => r.s.points.some((p) => isNum(p.ttftP99)));
    const hasCost = rows.some((r) => isNum(r.costPerM) || r.unitPrice != null);
    const baseRow = rows.find((r) => r.key === baseKey) || null;
    const baseStats = baseRow?.stats;
    const deltas = (r) => ({
        peak: pctDelta(r.stats.peak, baseStats?.peak),
        latAtPeak: pctDelta(r.stats.latAtPeak, baseStats?.latAtPeak),
        best: pctDelta(r.stats.best, baseStats?.best),
        usable: pctDelta(r.stats.usable, baseStats?.usable),
        usableP99: pctDelta(r.stats.usableP99, baseStats?.usableP99),
        costPerM: pctDelta(r.costPerM, baseRow?.costPerM),
    });

    // What the comparison tests: one thing differing is the variable under
    // test; several differing at once means no gap can be pinned on one.
    // When every recorded field matches ('repeat'), check whether throughput
    // dropped ≤ -5% or latency spiked ≥ +20%: if so, call it a likely
    // regression or unrecorded change instead of "run-to-run variation".
    const parity = resolved.length > 1 ? seriesParity(configs) : null;
    const framing = parityFraming(parity);
    const perChipHint = framing?.perChip && !tp.perChip ? ' Chip counts differ, so turn on Per chip to compare per accelerator.' : '';
    const nonBaseDeltas = rows.filter((r) => baseKey && r.key !== baseKey).map((r) => deltas(r));
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
            ? 'Overloaded stages (where latency spiked ≥5× for <25% more throughput, or ≥5% requests failed) are marked not comparable and excluded from peak and best-latency Δ.'
            : '';

    // Configuration & harness diff fields across all series.
    const configRows =
        rows.length < 2
            ? []
            : [
                  { key: 'modelId', label: 'Model ID', get: (r) => r.prov.modelId },
                  { key: 'hw', label: 'Hardware & chips', get: (r) => r.prov.hw },
                  { key: 'setup', label: 'Deployment / stack', get: (r) => r.prov.setup },
                  { key: 'engine', label: 'Serving engine', get: (r) => r.prov.engine },
                  { key: 'workloadType', label: 'Workload (ISL/OSL)', get: (r) => r.prov.workloadType },
                  { key: 'harness', label: 'Harness', get: (r) => r.prov.harness },
                  { key: 'harnessArgs', label: 'Harness CLI args', get: (r) => r.prov.harnessArgs },
                  { key: 'configName', label: 'Attached config file', get: (r) => r.prov.configName || 'not attached' },
              ].map((f) => {
                  const values = rows.map((r) => f.get(r));
                  const norm = new Set(values.map((v) => String(v || '').trim().toLowerCase()));
                  return { ...f, values, differs: norm.size > 1 };
              });

    const visibleConfigRows = diffFilter === 'diff' ? configRows.filter((r) => r.differs) : configRows;
    const yamlDiffs = !baseRow?.prov?.configText
        ? []
        : rows
              .filter((r) => r.key !== baseRow.key && r.prov.configText)
              .map((r) => ({
                  key: r.key,
                  name: label(r.s),
                  file: r.prov.configName,
                  lines: diffConfigLines(baseRow.prov.configText, r.prov.configText),
              }))
              .filter((d) => d.lines.length > 0);

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
        'Points (n batches)',
        `${tp.label} at ${LIMIT_P50_LABEL} (tok/s)`,
        'Δ',
        ...(hasP99 ? [`${tp.label} at ${LIMIT_P99_LABEL} (tok/s)`, 'Δ p99'] : []),
        ...(hasCost ? [`$/1M output tokens at ${LIMIT_P50_LABEL}`, 'Δ cost'] : []),
        `Peak healthy ${tp.label.toLowerCase()} (tok/s)`,
        'Δ',
        `${latLabel} at peak (ms)`,
        'Δ',
        `Best ${latLabel} (ms)`,
        'Δ',
    ];
    const summaryAlign = ['l', 'r', 'r', 'r', ...(hasP99 ? ['r', 'r'] : []), ...(hasCost ? ['r', 'r'] : []), 'r', 'r', 'r', 'r', 'r', 'r'];

    const markdown = [
        `**Throughput vs latency** · ${latLabel} · ${tp.label.toLowerCase()} throughput`,
        shareUrl ? `Share link: ${shareUrl}` : null,
        framingText || unrecordedNote ? `> ${[framingText, unrecordedNote].filter(Boolean).join(' ')}` : null,
        overloadedNote ? `> ${overloadedNote}` : null,
        mdTable(
            summaryHeaders,
            rows.map((r) => {
                const d = !baseKey || r.key === baseKey ? null : deltas(r);
                const ptsText = r.spread.n > 1 ? `${r.s.points.length} (n=${r.spread.n})` : `${r.s.points.length} (n=1)`;
                return [
                    `${label(r.s)}${r.key === baseKey ? ' · baseline' : ''}${cheapestRow?.key === r.key ? ' · cheapest' : ''}`,
                    ptsText,
                    usableCell(r.stats.usable, r.stats.usableWhy),
                    d ? fmtDeltaMd(d.usable, true) : '—',
                    ...(hasP99
                        ? [
                              usableCell(r.stats.usableP99, r.stats.usableP99Why),
                              d ? fmtDeltaMd(d.usableP99, true) : '—',
                          ]
                        : []),
                    ...(hasCost
                        ? [
                              isNum(r.costPerM) ? `${fmtMoney(r.costPerM)} (${fmtCount(r.tokPerDollar)} tok/$)` : '—',
                              d ? fmtDeltaMd(d.costPerM, false) : '—',
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
            ['Series', 'Role', 'Model ID', 'Hardware', 'Deployment', 'Workload (ISL/OSL)', 'Harness', 'Serving engine', 'Rate ($/chip-hr)', 'Measured', 'Run IDs'],
            rows.map((r) => [
                label(r.s),
                !baseKey ? 'compared (no baseline)' : r.key === baseKey ? 'baseline' : 'compared',
                r.prov.modelId,
                r.prov.hw,
                r.prov.setup,
                r.prov.workloadType,
                r.prov.harness,
                r.prov.engine,
                r.unitPrice != null ? `${fmtMoney(r.unitPrice)} (${r.priceSource || 'list'})` : 'not priced',
                r.prov.measured,
                r.prov.runIds,
            ]),
            ['l', 'l', 'l', 'l', 'l', 'l', 'l', 'l', 'r', 'l', 'l']
        ),
        base
            ? `Δ is against ${label(base.s)}. Higher throughput, lower latency, and lower $/1M tokens are better (±1% is treated as neutral run-to-run noise). “At ${LIMIT_P50_LABEL}” is the highest throughput with TTFT p50 ≤ ${LIMIT_SECONDS}.`
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

            {/* Sweep-space decision summary when comparing multiple configurations */}
            {resolved.length >= 2 && (bestUsableRow || bestPerChipRow || cheapestRow) && (
                <div className="grid gap-3 rounded-3xl border border-zinc-200 bg-zinc-50/70 p-4 sm:grid-cols-4">
                    <div className="sm:col-span-4 flex items-center justify-between border-b border-zinc-200/70 pb-2">
                        <span className="label-caps font-semibold text-zinc-700">Sweep-space decision summary</span>
                        <span className="text-micro text-zinc-500">Evaluated at {LIMIT_P50_LABEL}</span>
                    </div>
                    <div className="min-w-0">
                        <div className="label-caps text-zinc-500">Best output at {LIMIT_P50_LABEL}</div>
                        {bestUsableRow ? (
                            <>
                                <div className="mt-1 truncate text-xs font-semibold text-zinc-900">{label(bestUsableRow.s)}</div>
                                <div className="font-mono text-xs text-emerald-700">
                                    {fmtTput(bestUsableRow.stats.usable)} tok/s{bestUsableRow.stats.usableConc != null ? ` at c=${bestUsableRow.stats.usableConc}` : ''}
                                </div>
                            </>
                        ) : (
                            <div className="mt-1 text-xs text-zinc-500">None under {LIMIT_SECONDS}</div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="label-caps text-zinc-500">Best per-chip at {LIMIT_P50_LABEL}</div>
                        {bestPerChipRow ? (
                            <>
                                <div className="mt-1 truncate text-xs font-semibold text-zinc-900">{label(bestPerChipRow.s)}</div>
                                <div className="font-mono text-xs text-zinc-800">
                                    {fmtTput(bestPerChipRow.stats.usablePerChip)} tok/s/chip ({bestPerChipRow.chips} chip{bestPerChipRow.chips === 1 ? '' : 's'})
                                </div>
                            </>
                        ) : (
                            <div className="mt-1 text-xs text-zinc-500">Not recorded</div>
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="label-caps text-zinc-500">Lowest cost at {LIMIT_P50_LABEL}</div>
                        {cheapestRow ? (
                            <>
                                <div className="mt-1 flex items-center gap-1.5">
                                    <span className="truncate text-xs font-semibold text-zinc-900">{label(cheapestRow.s)}</span>
                                    <Badge tone="success" size="xs">
                                        Cheapest
                                    </Badge>
                                </div>
                                <div className="font-mono text-xs text-emerald-700">
                                    {fmtMoney(cheapestRow.costPerM)} / 1M tok ({fmtCount(cheapestRow.tokPerDollar)} tok/$)
                                </div>
                            </>
                        ) : (
                            <div className="mt-1 text-xs text-zinc-500">Set $/chip-hr below to price</div>
                        )}
                    </div>
                    <div className="flex items-center justify-end">
                        <Button size="xs" variant="secondary" onClick={() => onAddToDashboard(resolved.map((x) => x.item))}>
                            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                            Add all {resolved.length} to report
                        </Button>
                    </div>
                </div>
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
                            Higher throughput, lower latency, and lower $/1M tokens are better (±1% is treated as neutral run-to-run noise). “At {LIMIT_P50_LABEL}” is the highest throughput with TTFT p50 within {LIMIT_SECONDS}.
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

                {accelTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-2.5 text-xs text-zinc-700">
                        <span className="font-semibold text-zinc-900">Chip-hour rates ($/chip-hr):</span>
                        {accelTypes.map((a) => {
                            const val = priceOverrides[a.type] !== undefined ? priceOverrides[a.type] : a.defaultPrice ?? '';
                            const isCustom = priceOverrides[a.type] !== undefined && priceOverrides[a.type] !== '';
                            return (
                                <label key={a.type} className="inline-flex items-center gap-1.5">
                                    <span className="font-medium text-zinc-800">{a.type}</span>
                                    <Input
                                        surface="light"
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        aria-label={`${a.type} price per chip-hour in USD`}
                                        value={val}
                                        placeholder="—"
                                        onChange={(e) => setPriceOverrides((prev) => ({ ...prev, [a.type]: e.target.value }))}
                                        className="w-20 py-1 font-mono text-xs"
                                    />
                                    <span className="text-micro text-zinc-500">({isCustom ? 'Custom override' : a.source})</span>
                                </label>
                            );
                        })}
                    </div>
                )}

                <div className="overflow-x-auto rounded-3xl border border-zinc-200 bg-white">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-zinc-200 bg-zinc-50/70">
                            <tr className="label-caps text-zinc-500">
                                <th className="px-4 py-3 font-semibold">Series</th>
                                <th className="px-4 py-3 font-semibold">Points · n</th>
                                <th className="px-4 py-3 text-right font-semibold">
                                    {tp.label} at {LIMIT_P50_LABEL} (tok/s)
                                </th>
                                {hasP99 && (
                                    <th className="px-4 py-3 text-right font-semibold">
                                        {tp.label} at {LIMIT_P99_LABEL} (tok/s)
                                    </th>
                                )}
                                {hasCost && (
                                    <th className="px-4 py-3 text-right font-semibold">
                                        $/1M tok at {LIMIT_P50_LABEL}
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
                                const isCheapest = Boolean(cheapestRow && cheapestRow.key === r.key);
                                const d = !baseKey || isBase ? null : deltas(r);
                                return (
                                    <tr key={r.key} className={cn(isBase && 'bg-accent-50/40')}>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(r.i) }} aria-hidden="true" />
                                                <span className="font-medium text-zinc-900">{label(r.s)}</span>
                                                {isBase && <span className="text-tiny font-semibold text-accent-700">baseline</span>}
                                                {isCheapest && (
                                                    <Badge tone="success" size="xs">
                                                        Cheapest
                                                    </Badge>
                                                )}
                                                {r.s.curve && <ResultStatusChip status={r.s.curve.status} copy={copy} size="xs" />}
                                            </div>
                                            <div className="mt-0.5 pl-4 text-tiny text-zinc-500">
                                                {r.s.kindLabel}
                                                {r.prov.setup && r.prov.setup !== 'not recorded' ? ` · ${r.prov.setup}` : ''}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-mono tabular-nums text-zinc-700">
                                            <div>
                                                {r.s.points.length} pt{r.s.points.length === 1 ? '' : 's'} · n={r.spread.n}
                                            </div>
                                            {r.spread.min != null && r.spread.max != null ? (
                                                <div className="font-sans text-micro text-zinc-500">
                                                    spread {fmtTput(r.spread.min)}–{fmtTput(r.spread.max)} tok/s
                                                </div>
                                            ) : (
                                                <div className="font-sans text-micro text-zinc-400">single batch</div>
                                            )}
                                        </td>
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
                                        {hasCost && (
                                            <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900">
                                                {isNum(r.costPerM) ? (
                                                    <>
                                                        <div>{fmtMoney(r.costPerM)}</div>
                                                        <div className="font-sans text-micro text-zinc-500">{fmtCount(r.tokPerDollar)} tok/$</div>
                                                        {d && (
                                                            <div className="text-tiny">
                                                                <Delta value={d.costPerM} higherIsBetter={false} />
                                                            </div>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="font-sans text-tiny text-zinc-400">
                                                        {r.unitPrice == null ? 'no rate' : 'over limit'}
                                                    </span>
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

            {/* Configuration & harness diff across series */}
            {rows.length >= 2 && (
                <Panel
                    variant="editorial"
                    padding="none"
                    title="Configuration & harness diff"
                    titleAs="h3"
                    subtitle="Compares recorded stack labels, workload (configured vs measured), harness arguments, and attached config files across series."
                    actions={
                        <ToggleGroup
                            size="xs"
                            aria-label="Configuration diff filter"
                            value={diffFilter}
                            onChange={setDiffFilter}
                            options={[
                                { value: 'diff', label: `Differences (${configRows.filter((c) => c.differs).length})` },
                                { value: 'all', label: `All fields (${configRows.length})` },
                            ]}
                        />
                    }
                >
                    {visibleConfigRows.length === 0 ? (
                        <p className="px-5 py-4 text-xs text-zinc-600">
                            All recorded configuration fields match across these series. Switch to <span className="font-medium text-zinc-900">All fields</span> to inspect them.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-zinc-200 bg-zinc-50/70">
                                    <tr className="label-caps text-zinc-500">
                                        <th className="px-4 py-2.5 font-semibold">Field</th>
                                        <th className="px-3 py-2.5 font-semibold">Parity</th>
                                        {rows.map((r) => (
                                            <th key={r.key} className="px-4 py-2.5 font-semibold">
                                                {label(r.s)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {visibleConfigRows.map((cr) => (
                                        <tr key={cr.key} className={cn(cr.differs && 'bg-amber-50/30')}>
                                            <td className="px-4 py-2.5 font-medium text-zinc-900">{cr.label}</td>
                                            <td className="px-3 py-2.5">
                                                <Badge tone={cr.differs ? 'warning' : 'neutral'} size="xs">
                                                    {cr.differs ? 'Differs' : 'Same'}
                                                </Badge>
                                            </td>
                                            {cr.values.map((val, idx) => (
                                                <td key={`${cr.key}-${rows[idx].key}`} className="px-4 py-2.5 font-mono text-tiny text-zinc-800">
                                                    {val}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {yamlDiffs.length > 0 && (
                        <div className="border-t border-zinc-200 px-5 py-4 space-y-3">
                            <div className="label-caps text-zinc-500">Attached config file line diff vs baseline ({baseRow?.prov?.configName})</div>
                            {yamlDiffs.map((yd) => (
                                <div key={yd.key} className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                    <div className="mb-1.5 text-xs font-semibold text-zinc-900">
                                        {yd.name} ({yd.file})
                                    </div>
                                    <pre className="max-h-48 overflow-auto font-mono text-tiny leading-relaxed">
                                        {yd.lines.map((l, idx) => (
                                            <div key={idx} className={cn(l.kind === 'added' ? 'text-emerald-800' : 'text-red-800')}>
                                                {l.kind === 'added' ? `+ ${l.line}` : `- ${l.line}`}
                                            </div>
                                        ))}
                                    </pre>
                                </div>
                            ))}
                        </div>
                    )}
                </Panel>
            )}

        </div>
    );
}
