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

import React, { useEffect, useMemo, useState } from 'react';
import { Award, Download, Plus, Sparkles } from 'lucide-react';
import { Badge, Button, Panel, Select } from '../ui';
import { cn } from '../../utils/cn';
import { fmtMoney } from './catalog';
import { CurveChart, MetricToggles } from './CurveChart';
import { useChartView } from './useChartView';
import { downloadText, toCsv } from './exporters';
import { BackButton, CopyButton, MetricsComparisonTable, Notice, estimateCostPerMillion } from './parts';
import {
    computeResultDeltas,
    diffResultVariables,
    domainLabelOf,
    fleetLabelOf,
    formatMetricValue,
    primaryMetricOf,
    rankLocalBaselines,
    signedPct,
} from './storeClient';

export function UnifiedCompareView({
    initialResults = [],
    initialBaselineId = null,
    allResults = [],
    storesById = new Map(),
    onBack,
    backLabel = 'Back to Explore',
    onOpenResult,
    onBuildArtifact,
    onPromoteBaseline,
    onCompareUrlSync,
}) {
    const [results, setResults] = useState(initialResults);
    const [rateOverrides, setRateOverrides] = useState({});
    const [promotingId, setPromotingId] = useState(null);
    const defaultBase = useMemo(() => {
        if (initialBaselineId && results.some((r) => r.id === initialBaselineId)) return initialBaselineId;
        const linked = results.find((r) => results.some((other) => other.lineage?.baselineId === r.id));
        if (linked) return linked.id;
        const named = results.find((r) => /\b(baseline|standard|vanilla|default)\b/i.test(r.title));
        if (named) return named.id;
        return results[0]?.id || '';
    }, [initialBaselineId, results]);

    const [baselineId, setBaselineId] = useState(defaultBase);
    const [pickerOpen, setPickerOpen] = useState(false);

    const activeBaseline = results.find((r) => r.id === baselineId) || results[0] || null;
    const candidates = useMemo(() => results.filter((r) => activeBaseline && r.id !== activeBaseline.id), [results, activeBaseline]);

    // Keep address bar in sync so Compare views are reload-safe and directly shareable.
    useEffect(() => {
        onCompareUrlSync?.(
            results.map((r) => r.id),
            activeBaseline?.id || null
        );
    }, [results, activeBaseline, onCompareUrlSync]);

    const shareUrl = useMemo(() => {
        if (typeof window === 'undefined') return '';
        const p = new URLSearchParams(window.location.search);
        p.set('view', 'results-store');
        p.set('compare', results.map((r) => r.id).join(','));
        if (activeBaseline?.id) p.set('baseline', activeBaseline.id);
        else p.delete('baseline');
        p.delete('result');
        p.delete('artifact');
        return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
    }, [results, activeBaseline]);

    const suggestedAdditions = useMemo(() => {
        const present = new Set(results.map((r) => r.id));
        const anchor = results[0];
        if (!anchor) return allResults.filter((r) => !present.has(r.id)).slice(0, 12).map((r) => ({ result: r, summary: domainLabelOf(r.domain) }));
        const ranked = rankLocalBaselines(anchor, allResults.filter((r) => !present.has(r.id)), 12);
        const rankedIds = new Set(ranked.map((x) => x.result.id));
        const rest = allResults
            .filter((r) => !present.has(r.id) && !rankedIds.has(r.id))
            .slice(0, Math.max(0, 12 - ranked.length))
            .map((r) => ({ result: r, summary: domainLabelOf(r.domain) }));
        return [...ranked, ...rest];
    }, [results, allResults]);

    const framing = useMemo(() => {
        if (!activeBaseline || !candidates.length) {
            return { tone: 'info', text: 'Add a baseline or candidate to see before/after deltas and what changed.' };
        }
        if (candidates.length === 1) {
            const diffs = diffResultVariables(activeBaseline, candidates[0]);
            if (diffs.length === 0) {
                return { tone: 'info', text: 'Same experimental variables in both runs — differences reflect run-to-run variation or an unrecorded change.' };
            }
            if (diffs.length === 1) {
                return {
                    tone: 'info',
                    text: `Testing ${diffs[0].key}: ${diffs[0].baseline ?? 'none'} → ${diffs[0].candidate ?? 'none'}. All other recorded variables match.`,
                };
            }
            return {
                tone: 'warning',
                text: `${diffs.length} experimental variables differ (${diffs.map((d) => d.key).join(', ')}). Check the variable diff table below before attributing gains to one change.`,
            };
        }
        const allDiffKeys = new Set();
        candidates.forEach((c) => diffResultVariables(activeBaseline, c).forEach((d) => allDiffKeys.add(d.key)));
        return {
            tone: allDiffKeys.size > 2 ? 'warning' : 'info',
            text:
                allDiffKeys.size === 0
                    ? `Comparing ${results.length} runs with identical recorded variables against "${activeBaseline.title}".`
                    : `Comparing ${results.length} results against "${activeBaseline.title}". Variables differing: ${[...allDiffKeys].join(', ')}.`,
        };
    }, [activeBaseline, candidates, results.length]);

    const chartSeries = useMemo(
        () =>
            results
                .map((r) => ({
                    id: r.id,
                    name: r.title,
                    baseline: activeBaseline && r.id === activeBaseline.id,
                    points: (r.sweep || []).filter((p) => p.included !== false),
                }))
                .filter((s) => s.points.length >= 2),
        [results, activeBaseline]
    );
    const chartView = useChartView(chartSeries);

    const metricColumns = useMemo(() => {
        const seen = new Map();
        for (const r of results) {
            for (const m of r.metrics || []) {
                if (!seen.has(m.name)) {
                    seen.set(m.name, { name: m.name, label: m.label || m.name, unit: m.unit, direction: m.direction, primary: Boolean(m.primary) });
                }
            }
        }
        return [...seen.values()].sort((a, b) => Number(b.primary) - Number(a.primary));
    }, [results]);

    const diffVarKeys = useMemo(() => {
        if (!activeBaseline) return [];
        const keys = new Set();
        for (const c of candidates) {
            diffResultVariables(activeBaseline, c).forEach((d) => keys.add(d.key));
        }
        return [...keys];
    }, [activeBaseline, candidates]);

    // Decision summary when comparing 3+ results: Best primary metric, Lowest cost, Largest fleet.
    const decisionSummary = useMemo(() => {
        if (results.length < 3) return null;
        const primaryKey = metricColumns[0];
        let bestMetric = null;
        if (primaryKey) {
            const withVal = results
                .map((r) => ({ r, m: (r.metrics || []).find((x) => x.name === primaryKey.name) }))
                .filter((x) => x.m != null);
            withVal.sort((a, b) => (primaryKey.direction === 'lower_is_better' ? a.m.value - b.m.value : b.m.value - a.m.value));
            if (withVal[0]) {
                bestMetric = {
                    label: `Best ${primaryKey.label}`,
                    winner: withVal[0].r.title,
                    value: formatMetricValue(withVal[0].m.value, primaryKey.unit),
                };
            }
        }
        const withCost = results
            .map((r) => ({ r, cost: estimateCostPerMillion(r, rateOverrides) }))
            .filter((x) => x.cost != null)
            .sort((a, b) => a.cost - b.cost);
        const lowestCost = withCost[0]
            ? { label: 'Lowest est. cost', winner: withCost[0].r.title, value: `${fmtMoney(withCost[0].cost)} / 1M tok` }
            : null;
        const largest = [...results].sort((a, b) => (b.fleet?.nodes || 1) - (a.fleet?.nodes || 1))[0];
        const largestFleet = largest
            ? { label: 'Largest fleet', winner: largest.title, value: fleetLabelOf(largest) || 'Single node' }
            : null;
        return [bestMetric, lowestCost, largestFleet].filter(Boolean);
    }, [results, metricColumns, rateOverrides]);

    // Identify a winning persisted candidate that beats the baseline on its primary metric.
    const winningCandidate = useMemo(() => {
        if (!activeBaseline || !onPromoteBaseline) return null;
        for (const c of candidates) {
            if (String(c.id).startsWith('catalog:')) continue;
            const deltas = computeResultDeltas(activeBaseline, c);
            const primary = deltas.find((d) => d.primary) || deltas[0];
            if (primary && primary.verdict === 'better') {
                return { candidate: c, delta: primary };
            }
        }
        return null;
    }, [activeBaseline, candidates, onPromoteBaseline]);

    const handlePromote = async () => {
        if (!winningCandidate || !activeBaseline) return;
        setPromotingId(winningCandidate.candidate.id);
        try {
            const updated = await onPromoteBaseline(winningCandidate.candidate, activeBaseline);
            if (updated) {
                setResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                setBaselineId(updated.id);
            }
        } finally {
            setPromotingId(null);
        }
    };

    const markdownExport = useMemo(() => {
        if (!activeBaseline) return '';
        const lines = [
            `### Before / After Comparison`,
            ``,
            `Baseline: **${activeBaseline.title}** (${activeBaseline.storeId})`,
            `${framing.text}`,
            shareUrl ? `Link: ${shareUrl}` : '',
            ``,
            `| Result | Store | Fleet | ${metricColumns.map((m) => `${m.label} (${m.unit})`).join(' | ')} |`,
            `| :--- | :--- | :--- | ${metricColumns.map(() => '---:').join(' | ')} |`,
        ].filter((line) => line !== undefined);
        for (const r of results) {
            const isBase = r.id === activeBaseline.id;
            const deltas = isBase ? [] : computeResultDeltas(activeBaseline, r);
            const deltaByName = new Map(deltas.map((d) => [d.name, d]));
            const cells = metricColumns.map((col) => {
                const m = (r.metrics || []).find((x) => x.name === col.name);
                if (!m) return '—';
                const val = formatMetricValue(m.value, '');
                if (isBase) return `${val} *(baseline)*`;
                const d = deltaByName.get(col.name);
                if (!d) return val;
                return `${val} (${signedPct(d.deltaPct)} ${d.verdict})`;
            });
            lines.push(`| ${r.title} | ${r.storeId} | ${fleetLabelOf(r) || '—'} | ${cells.join(' | ')} |`);
        }
        return lines.join('\n');
    }, [activeBaseline, framing.text, metricColumns, results, shareUrl]);

    const exportCsv = () => {
        const headers = ['Result', 'Store', 'Domain', 'Fleet', ...metricColumns.flatMap((m) => [`${m.label} (${m.unit})`, `${m.label} delta %`])];
        const rows = results.map((r) => {
            const isBase = activeBaseline && r.id === activeBaseline.id;
            const deltaMap = new Map((!isBase && activeBaseline ? computeResultDeltas(activeBaseline, r) : []).map((d) => [d.name, d]));
            return [
                r.title,
                r.storeId,
                domainLabelOf(r.domain),
                fleetLabelOf(r) || 'Single node',
                ...metricColumns.flatMap((m) => {
                    const val = (r.metrics || []).find((x) => x.name === m.name)?.value ?? '';
                    const d = deltaMap.get(m.name);
                    return [val, isBase ? 'baseline' : d ? `${d.deltaPct.toFixed(1)}%` : ''];
                }),
            ];
        });
        downloadText('prism-comparison.csv', toCsv(headers, rows), 'text/csv;charset=utf-8');
    };

    const addResult = (r) => {
        if (results.some((x) => x.id === r.id)) return;
        setResults((prev) => [...prev, r]);
        setPickerOpen(false);
    };

    const removeResult = (id) => {
        setResults((prev) => {
            const next = prev.filter((r) => r.id !== id);
            if (baselineId === id) setBaselineId(next[0]?.id || '');
            return next;
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <BackButton onClick={onBack}>{backLabel}</BackButton>
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="xs" variant="secondary" onClick={() => setPickerOpen((o) => !o)}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Add baseline / run
                    </Button>
                    <CopyButton text={shareUrl} label="Share link" size="xs" variant="ghost" />
                    <Button size="xs" variant="ghost" onClick={exportCsv}>
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        CSV
                    </Button>
                    <CopyButton text={markdownExport} label="Copy Markdown" copiedLabel="Markdown copied" size="xs" />
                    <Button size="xs" onClick={() => onBuildArtifact?.(results, activeBaseline?.id)}>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Publish as Artifact
                    </Button>
                </div>
            </div>

            {pickerOpen && (
                <Panel variant="editorial" title="Add a baseline or candidate" subtitle="Ranked by domain, experiment group, fleet scale, and matching variables.">
                    {!suggestedAdditions.length ? (
                        <p className="text-xs text-zinc-500">All loaded results are already in this comparison.</p>
                    ) : (
                        <ul className="divide-y divide-zinc-100">
                            {suggestedAdditions.map(({ result: r, summary }) => {
                                const pm = primaryMetricOf(r);
                                return (
                                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="truncate text-xs font-semibold text-zinc-900">{r.title}</span>
                                                <Badge size="xs">{r.storeId}</Badge>
                                                {fleetLabelOf(r) && <span className="text-tiny text-zinc-500">{fleetLabelOf(r)}</span>}
                                            </div>
                                            <p className="text-micro text-zinc-500">
                                                {summary}
                                                {pm ? ` · ${pm.label || pm.name}: ${formatMetricValue(pm.value, pm.unit)}` : ''}
                                            </p>
                                        </div>
                                        <Button size="xs" variant="secondary" onClick={() => addResult(r)}>
                                            Add
                                        </Button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Panel>
            )}

            <Panel variant="editorial">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <p className="kicker text-accent-600">Before / after comparison</p>
                        <h2 className="mt-1 font-display text-2xl font-bold tracking-display text-zinc-900">
                            {results.length} {results.length === 1 ? 'result' : 'results'}
                        </h2>
                    </div>

                    {results.length >= 2 && (
                        <div className="flex flex-wrap items-center gap-2">
                            <label htmlFor="compare-baseline-select" className="label-caps text-zinc-500">
                                Baseline
                            </label>
                            <Select
                                surface="light"
                                id="compare-baseline-select"
                                value={activeBaseline?.id || ''}
                                onChange={(e) => setBaselineId(e.target.value)}
                                className="max-w-xs"
                            >
                                {results.map((r) => (
                                    <option key={r.id} value={r.id}>
                                        {r.title} ({r.storeId})
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}
                </div>

                <Notice tone={framing.tone} className="mt-4">
                    {framing.text}
                </Notice>

                {winningCandidate && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs text-emerald-900">
                        <span className="min-w-0 flex-1">
                            <span className="font-semibold">{winningCandidate.candidate.title}</span> improves{' '}
                            <span className="font-semibold">{winningCandidate.delta.label}</span> by{' '}
                            <span className="font-mono font-semibold">{signedPct(winningCandidate.delta.deltaPct)}</span>. Make it the new baseline for future runs?
                        </span>
                        <Button size="xs" variant="secondary" isLoading={promotingId === winningCandidate.candidate.id} onClick={handlePromote}>
                            <Award className="h-3.5 w-3.5" aria-hidden="true" />
                            Promote as new baseline
                        </Button>
                    </div>
                )}

                {decisionSummary && decisionSummary.length > 0 && (
                    <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                        {decisionSummary.map((card) => (
                            <div key={card.label} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5">
                                <dt className="label-caps text-zinc-500">{card.label}</dt>
                                <dd className="mt-1 font-display text-lg font-bold tracking-display text-zinc-900 tabular-nums">{card.value}</dd>
                                <div className="mt-0.5 truncate text-micro text-zinc-600">{card.winner}</div>
                            </div>
                        ))}
                    </dl>
                )}

                <div className="mt-5">
                    <MetricsComparisonTable
                        results={results}
                        baselineId={activeBaseline?.id}
                        storesById={storesById}
                        onOpenResult={onOpenResult}
                        onRemoveResult={removeResult}
                        showCost
                        allowRateOverride
                        rateOverrides={rateOverrides}
                        onRateOverridesChange={setRateOverrides}
                    />
                </div>
            </Panel>

            {chartSeries.length > 0 && (
                <Panel variant="editorial" title="Sweep curve comparison" actions={<MetricToggles view={chartView} />}>
                    <CurveChart series={chartSeries} view={chartView} height={340} title="Before / after sweep comparison" />
                </Panel>
            )}

            {diffVarKeys.length > 0 && (
                <Panel variant="editorial" title="What changed (experimental variable diff)">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-zinc-200 bg-zinc-50/70">
                                <tr className="label-caps text-zinc-500">
                                    <th className="px-4 py-2.5 font-semibold">Variable</th>
                                    {results.map((r) => (
                                        <th key={r.id} className="px-4 py-2.5 font-semibold">
                                            {r.title}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {diffVarKeys.map((k) => (
                                    <tr key={k}>
                                        <td className="px-4 py-2.5 font-mono font-semibold text-zinc-700">{k}</td>
                                        {results.map((r) => {
                                            const val = r.variables?.[k];
                                            const changed = activeBaseline && String(val ?? '') !== String(activeBaseline.variables?.[k] ?? '');
                                            return (
                                                <td
                                                    key={r.id}
                                                    className={cn('px-4 py-2.5 font-mono', changed ? 'bg-accent-50/60 font-semibold text-accent-800' : 'text-zinc-600')}
                                                >
                                                    {val != null ? String(val) : '—'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}
        </div>
    );
}
