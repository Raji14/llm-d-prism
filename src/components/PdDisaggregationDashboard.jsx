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

import React, { useState, useMemo, useEffect } from 'react';
import {
    LineChart, Line, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Split, ExternalLink } from 'lucide-react';
import {
    WellLitHeader,
    Badge,
    Button,
    ToggleGroup,
    StatPills,
    LoadingState,
    EmptyState,
    ChartContainer,
    ChartFilterRow,
    ChartFilterGroup,
    ChartTooltip,
    ChartTooltipRow,
    ChartXAxis,
    ChartYAxis,
    SeriesPercentileLegend,
    SeriesLineSwatch,
    SeriesMarkerSvg,
    CustomSeriesDot,
    getSeriesShape,
    gridProps,
    cursorProps,
    tooltipProps,
    seriesColor,
    getChartTheme,
    getAxisConfig,
    GoogleMark,
} from './ui';
import { cn } from '../utils/cn';
import { FALLBACK_PD_DATA } from '../utils/wellLitPathData.js';

const THROUGHPUT_LABELS = {
    output: 'Output Tokens/sec',
    input: 'Input Tokens/sec',
    total: 'Total Tokens/sec',
};

const LATENCY_LABELS = {
    ttft: 'Time To First Token (s)',
    itl: 'Inter-Token Latency (ms/token)',
    e2e: 'E2E Latency (s)',
};

const fmtTok = (v) => Math.round(v).toLocaleString();
const fmtSec = (ms) => (ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 });

const ThroughputTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <ChartTooltip
            className="min-w-[220px]"
            title={`P:D ratio ${d.ratio} (${d.prefill}P · ${d.decode}D)`}
            subtitle="8 TPU v7x replicas · Concurrency 40"
        >
            <div className="space-y-1.5 pt-1 border-t border-zinc-200">
                <ChartTooltipRow
                    color={d.fill}
                    shape={d.shape}
                    label={d.metricLabel}
                    value={`${fmtTok(d.value)} tok/s`}
                />
            </div>
        </ChartTooltip>
    );
};

const LatencyTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <ChartTooltip
            className="min-w-[220px]"
            title={`P:D ratio ${d.ratio} (${d.prefill}P · ${d.decode}D)`}
            subtitle={`${d.metricLabel} · 8 TPU v7x replicas`}
        >
            <div className="space-y-1.5 pt-1 border-t border-zinc-200">
                {payload.map((entry) => (
                    <ChartTooltipRow
                        key={entry.name}
                        color={d.fill}
                        shape={d.shape}
                        opacity={entry.name === 'Mean' ? 1 : 0.75}
                        label={entry.name}
                        value={`${typeof entry.value === 'number' ? entry.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : entry.value}${d.unit}`}
                    />
                ))}
            </div>
        </ChartTooltip>
    );
};

export default function PdDisaggregationDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [runs, setRuns] = useState(null);
    const [loadFailed, setLoadFailed] = useState(false);

    const [thruMetric, setThruMetric] = useState('total'); // 'output' | 'input' | 'total'
    const [thruPerChip, setThruPerChip] = useState(false);
    const [showThruFilters, setShowThruFilters] = useState(true);

    const [latMetric, setLatMetric] = useState('ttft'); // 'ttft' | 'itl' | 'e2e'
    const [visibleStats, setVisibleStats] = useState(['Mean', 'P90']);
    const [showChartFilters, setShowChartFilters] = useState(true);
    const [hiddenRatios, setHiddenRatios] = useState([]);

    useEffect(() => {
        let active = true;
        fetch('/api/pd-disaggregation/data')
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                if (active) {
                    const valid = Array.isArray(data) && data.length > 0 ? data : FALLBACK_PD_DATA;
                    setRuns(valid);
                }
            })
            .catch(() => {
                if (active) {
                    setLoadFailed(false);
                    setRuns(FALLBACK_PD_DATA);
                }
            });
        return () => {
            active = false;
        };
    }, []);

    const ratioMetaMap = useMemo(() => {
        const map = new Map();
        (runs || []).forEach((r, idx) => {
            map.set(r.ratio, {
                color: seriesColor(idx),
                shape: getSeriesShape(idx),
                index: idx,
            });
        });
        return map;
    }, [runs]);

    const outcomes = useMemo(() => {
        if (!runs || runs.length === 0) return null;
        const byTotal = [...runs].sort((a, b) => b.throughput.total - a.throughput.total);
        const bestTotal = byTotal[0];
        const worstTotal = byTotal[byTotal.length - 1];
        const bestMeanTtft = runs.reduce((acc, r) => (r.ttft.mean < acc.ttft.mean ? r : acc), runs[0]);
        const bestP90Ttft = runs.reduce((acc, r) => (r.ttft.p90 < acc.ttft.p90 ? r : acc), runs[0]);
        const bestItl = runs.reduce((acc, r) => (r.itl.mean < acc.itl.mean ? r : acc), runs[0]);
        const worstItl = runs.reduce((acc, r) => (r.itl.mean > acc.itl.mean ? r : acc), runs[0]);
        const wins = new Map(runs.map((r) => [r.ratio, 0]));
        const winnersOf = [
            runs.reduce((a, r) => (r.ttft.mean < a.ttft.mean ? r : a), runs[0]),
            bestP90Ttft,
            runs.reduce((a, r) => (r.e2e.mean < a.e2e.mean ? r : a), runs[0]),
            runs.reduce((a, r) => (r.e2e.p90 < a.e2e.p90 ? r : a), runs[0]),
            bestItl,
            bestTotal,
        ];
        winnersOf.forEach((r) => wins.set(r.ratio, wins.get(r.ratio) + 1));
        const bestConfig = runs.reduce((a, r) => (wins.get(r.ratio) > wins.get(a.ratio) ? r : a), runs[0]);
        return {
            bestConfig,
            bestConfigWins: wins.get(bestConfig.ratio),
            bestTotal,
            worstTotal,
            spread: worstTotal.throughput.total > 0 ? bestTotal.throughput.total / worstTotal.throughput.total : 0,
            bestMeanTtft,
            bestP90Ttft,
            bestItl,
            worstItl,
        };
    }, [runs]);

    const scenario = runs && runs.length > 0 ? runs[0] : null;
    const totalChips = (scenario?.totalReplicas ?? 8) * (scenario?.tp ?? 8);

    const visibleRuns = useMemo(
        () => (runs || []).filter((r) => !hiddenRatios.includes(r.ratio)),
        [runs, hiddenRatios]
    );

    const throughputChartData = useMemo(() => {
        if (!runs) return [];
        const divisor = thruPerChip ? Math.max(totalChips, 1) : 1;
        return visibleRuns.map((r) => {
            const meta = ratioMetaMap.get(r.ratio) || { color: seriesColor(0), shape: 'circle' };
            return {
                ratio: r.ratio,
                prefill: r.prefill,
                decode: r.decode,
                value: r.throughput[thruMetric] / divisor,
                metricLabel: `${THROUGHPUT_LABELS[thruMetric]}${thruPerChip ? ' per Chip' : ''}`,
                fill: meta.color,
                shape: meta.shape,
            };
        });
    }, [runs, visibleRuns, thruMetric, thruPerChip, totalChips, ratioMetaMap]);

    const throughputYAxisConfig = useMemo(() => {
        const vals = throughputChartData.map((d) => d.value).filter((v) => v > 0);
        return getAxisConfig(vals, false);
    }, [throughputChartData]);

    const latencyChartData = useMemo(() => {
        if (!runs) return [];
        return visibleRuns.map((r) => {
            const isItl = latMetric === 'itl';
            const meta = ratioMetaMap.get(r.ratio) || { color: seriesColor(0), shape: 'circle' };
            return {
                ratio: r.ratio,
                prefill: r.prefill,
                decode: r.decode,
                mean: isItl ? r.itl.mean : r[latMetric].mean / 1000,
                p90: isItl ? null : r[latMetric].p90 / 1000,
                unit: isItl ? ' ms/tok' : ' s',
                metricLabel: LATENCY_LABELS[latMetric].replace(/ \(.*\)$/, ''),
                fill: meta.color,
                shape: meta.shape,
            };
        });
    }, [runs, visibleRuns, latMetric, ratioMetaMap]);

    const latencyYAxisConfig = useMemo(() => {
        const vals = latencyChartData
            .flatMap((d) => [
                visibleStats.includes('Mean') ? d.mean : 0,
                latMetric !== 'itl' && visibleStats.includes('P90') ? d.p90 : 0,
            ])
            .filter((v) => v > 0);
        return getAxisConfig(vals, false);
    }, [latencyChartData, visibleStats, latMetric]);

    const columnBests = useMemo(() => {
        if (!runs || runs.length === 0) return null;
        return {
            ttftMean: Math.min(...runs.map((r) => r.ttft.mean)),
            ttftP90: Math.min(...runs.map((r) => r.ttft.p90)),
            e2eMean: Math.min(...runs.map((r) => r.e2e.mean)),
            e2eP90: Math.min(...runs.map((r) => r.e2e.p90)),
            itlMean: Math.min(...runs.map((r) => r.itl.mean)),
            output: Math.max(...runs.map((r) => r.throughput.output)),
            input: Math.max(...runs.map((r) => r.throughput.input)),
            total: Math.max(...runs.map((r) => r.throughput.total)),
        };
    }, [runs]);

    const exportToCSV = () => {
        if (!runs || !runs.length) return;
        const headers = [
            'P:D Ratio',
            'Prefill',
            'Decode',
            'TTFT Mean (s)',
            'TTFT P90 (s)',
            'E2E Mean (s)',
            'E2E P90 (s)',
            'ITL Mean (ms/tok)',
            'Output tok/s',
            'Input tok/s',
            'Total tok/s',
            'Requests',
        ];
        const rows = runs.map((r) =>
            [
                r.ratio,
                r.prefill,
                r.decode,
                (r.ttft.mean / 1000).toFixed(1),
                (r.ttft.p90 / 1000).toFixed(1),
                (r.e2e.mean / 1000).toFixed(1),
                (r.e2e.p90 / 1000).toFixed(1),
                r.itl.mean.toFixed(1),
                Math.round(r.throughput.output),
                Math.round(r.throughput.input),
                Math.round(r.throughput.total),
                r.requests,
            ].join(',')
        );
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'pd_disaggregation_replica_ratio_matrix.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (runs === null) {
        return <LoadingState fullPage label="Loading P/D disaggregation benchmarks..." />;
    }

    const chartTheme = getChartTheme();

    const legendItems = visibleRuns.map((r) => {
        const meta = ratioMetaMap.get(r.ratio) || { color: seriesColor(0), shape: 'circle' };
        return {
            key: r.ratio,
            label: `${r.ratio} (${r.prefill}P·${r.decode}D)`,
            color: meta.color,
            shape: meta.shape,
        };
    });

    const commonMetaPills = (
        <>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-sans text-micro font-medium text-zinc-700">
                <GoogleMark className="w-3 h-3" />
                <span>TPU v7x</span>
                <span className="text-zinc-400">·</span>
                <span>{scenario?.totalReplicas ?? 8} replicas (TP{scenario?.tp ?? 8})</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-sans text-micro font-medium text-zinc-700">
                <span>Qwen3-Coder-480B (FP8)</span>
                <span className="text-zinc-400">·</span>
                <span>vLLM</span>
            </span>
        </>
    );

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans relative overflow-hidden">
            <WellLitHeader
                kicker="Well-lit path"
                pageTitle="Prefill/Decode Disaggregation"
                subtitle="Sweeping prefill-to-decode replica ratios at a fixed 8-replica budget on long-context agentic workloads."
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
                isPrototype={true}
            />

            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 flex flex-col space-y-6">
                {/* Prototype Banner Alert */}
                <div className="surface-light flex items-center gap-3 px-4 py-3 bg-amber-50/70 border border-amber-200/90 rounded-2xl text-amber-900 text-xs">
                    <span className="flex h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                    <span>
                        <strong className="font-semibold">Preview Notice:</strong> Prefill/Decode Disaggregation is currently in preview. Benchmark sweeps are actively expanding beyond the 2:6 ratio.
                    </span>
                </div>

                {runs.length === 0 ? (
                    <ChartContainer>
                        <EmptyState
                            icon={<Split className="w-8 h-8" />}
                            title={loadFailed ? 'Benchmark data unavailable' : 'No benchmark runs found'}
                            message={
                                loadFailed
                                    ? 'The P/D disaggregation reports could not be loaded from GCS. Check server credentials and try again.'
                                    : 'No reports were found under gs://llm-d-benchmarks/pd-disaggregation/.'
                            }
                        />
                    </ChartContainer>
                ) : (
                    <>
                        {/* Architectural Overview Card (Matches Intelligent Routing 3-column layout) */}
                        <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                            <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
                                {/* Col 1: Overview */}
                                <div className="p-4 sm:p-5 flex flex-col justify-between space-y-2.5">
                                    <div>
                                        <div className="kicker text-accent-600 mb-1.5">Overview</div>
                                        <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                                            Prefill/decode disaggregation splits serving into separate replica pools: a <strong className="text-zinc-900">prefill</strong> pool that processes incoming context and streams KV cache to a <strong className="text-zinc-900">decode</strong> pool that generates tokens. Decode-heavy splits win across nearly every metric because decode replicas run saturated (~42–49 output tok/s each).
                                        </p>
                                    </div>
                                </div>

                                {/* Col 2: Active Configurations (Selectable ratios) */}
                                <div className="p-4 sm:p-5 space-y-2">
                                    <div className="kicker text-zinc-700 mb-1.5">Active configurations</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(runs || []).map((r) => {
                                            const isActive = !hiddenRatios.includes(r.ratio);
                                            const meta = ratioMetaMap.get(r.ratio) || { color: seriesColor(0), shape: 'circle' };
                                            return (
                                                <button
                                                    key={r.ratio}
                                                    type="button"
                                                    onClick={() =>
                                                        setHiddenRatios((prev) =>
                                                            isActive
                                                                ? prev.length < runs.length - 1
                                                                    ? [...prev, r.ratio]
                                                                    : prev
                                                                : prev.filter((x) => x !== r.ratio)
                                                        )
                                                    }
                                                    className={cn(
                                                        'w-full text-left border rounded-2xl px-3 py-2 flex items-center justify-between gap-2 transition-all cursor-pointer',
                                                        isActive
                                                            ? 'border-zinc-200 bg-zinc-50/70'
                                                            : 'border-zinc-200/70 bg-white opacity-55'
                                                    )}
                                                >
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-semibold text-zinc-900 font-sans tabular-nums">{r.ratio}</div>
                                                        <p className="text-micro text-zinc-600 truncate">{r.prefill}P · {r.decode}D</p>
                                                    </div>
                                                    <SeriesMarkerSvg
                                                        shape={meta.shape}
                                                        color={isActive ? meta.color : chartTheme.muted}
                                                        size={11}
                                                    />
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Col 3: Upcoming Variants */}
                                <div className="p-4 sm:p-5 space-y-2 bg-zinc-50/30">
                                    <div className="kicker text-zinc-700 mb-1.5">Upcoming variants</div>
                                    <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between gap-2">
                                        <div>
                                            <div className="text-xs font-semibold text-zinc-800">Aggregated Baseline Comparison</div>
                                            <p className="text-micro text-zinc-600">Same workload on co-located replicas</p>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            <a
                                                href="https://github.com/llm-d/llm-d/tree/main/guides/pd-disaggregation"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                            >
                                                <span className="text-micro font-medium">Guide</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                            <Badge tone="warning" size="xs">Soon</Badge>
                                        </div>
                                    </div>
                                    <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between gap-2">
                                        <div>
                                            <div className="text-xs font-semibold text-zinc-800">Decode-Heavy Extension (1:7)</div>
                                            <p className="text-micro text-zinc-600">Sweep beyond 2:6 to locate optimal balance</p>
                                        </div>
                                        <div className="flex items-center space-x-2 shrink-0">
                                            <a
                                                href="https://github.com/llm-d/llm-d/tree/main/guides/pd-disaggregation"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                            >
                                                <span className="text-micro font-medium">Guide</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                            <Badge tone="warning" size="xs">Soon</Badge>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Compact Scenario + Outcomes Card (Matches Intelligent Routing) */}
                        {outcomes && (
                            <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                                <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 sm:px-6 py-2.5 flex items-center justify-between flex-wrap gap-2">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <span className="kicker text-accent-600">
                                            Benchmark scenario & outcomes
                                        </span>
                                        <span className="text-zinc-300" aria-hidden="true">|</span>
                                        <span className="text-xs text-zinc-700">
                                            inference-perf · Prefill/Decode Disaggregation (8 TPU v7x replicas)
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                document.getElementById('summary-table')?.scrollIntoView({ behavior: 'smooth' });
                                            }}
                                            className="text-xs font-semibold text-accent-600 hover:text-accent-700 px-2 py-1 transition-colors cursor-pointer"
                                        >
                                            View summary table →
                                        </button>
                                        <a
                                            href="https://github.com/llm-d/llm-d/tree/main/guides/pd-disaggregation"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1 text-xs font-semibold text-white hover:bg-zinc-700 transition-colors cursor-pointer no-underline"
                                        >
                                            <span>Reproducibility guide</span>
                                            <ExternalLink className="w-3 h-3 shrink-0 opacity-85" />
                                        </a>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
                                    {/* Left: Compact 6-item Environment & Serving Spec Strip */}
                                    <div className="lg:col-span-8 xl:col-span-9 p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3.5 items-start">
                                        <div>
                                            <span className="block text-micro font-medium text-zinc-600 mb-0.5">Accelerator & topology</span>
                                            <span className="font-sans font-semibold text-zinc-900 text-xs flex items-center gap-1.5">
                                                <GoogleMark />
                                                TPU v7x · {scenario?.totalReplicas ?? 8} × TP{scenario?.tp ?? 8}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-micro font-medium text-zinc-600 mb-0.5">Replica ratio sweep</span>
                                            <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                                P:D 2:6 → 7:1 ({outcomes.bestConfig.ratio} best)
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-micro font-medium text-zinc-600 mb-0.5">Load profile</span>
                                            <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                                800 req @ concurrency 40
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-micro font-medium text-zinc-600 mb-0.5">Model name</span>
                                            <span className="font-sans font-semibold text-zinc-900 text-xs block" title={scenario?.model}>
                                                Qwen3-Coder-480B-FP8
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-micro font-medium text-zinc-600 mb-0.5">Engine & connector</span>
                                            <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                                vLLM · TPUConnector
                                            </span>
                                        </div>
                                        <div>
                                            <span className="block text-micro font-medium text-zinc-600 mb-0.5">Workload & context</span>
                                            <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                                Agentic · 160k sys + 1.5k/turn
                                            </span>
                                        </div>
                                    </div>

                                    {/* Right: Primary Outcomes Strip */}
                                    <div className="lg:col-span-4 xl:col-span-3 p-4 sm:p-5 bg-zinc-50/50 grid grid-cols-2 gap-4 items-center">
                                        <div>
                                            <div className="text-micro font-medium text-zinc-600 mb-1">Peak throughput</div>
                                            <div className="display-title text-2xl font-bold text-emerald-600 tabular-nums leading-none">
                                                {fmtTok(outcomes.bestTotal.throughput.total)}
                                            </div>
                                            <div className="text-micro font-medium text-zinc-600 mt-1">
                                                tok/s @ P:D {outcomes.bestTotal.ratio}
                                            </div>
                                        </div>
                                        <div className="border-l border-zinc-200 pl-4">
                                            <div className="text-micro font-medium text-zinc-600 mb-1">Best TTFT</div>
                                            <div className="display-title text-2xl font-bold text-accent-600 tabular-nums leading-none">
                                                {fmtSec(outcomes.bestMeanTtft.ttft.mean)}s
                                            </div>
                                            <div className="text-micro font-medium text-zinc-600 mt-1">
                                                Mean @ P:D {outcomes.bestMeanTtft.ratio}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Telemetry Charts (LineChart visualizations matching Intelligent Routing) */}
                        <div className="flex flex-col gap-6 w-full">
                            {/* Throughput LineChart */}
                            <ChartContainer
                                kicker="P/D disaggregation telemetry"
                                title={`${THROUGHPUT_LABELS[thruMetric]} vs. P:D ratio`}
                                subtitle="Higher is better. Mean token rate across prefill:decode replica splits (tokens/s)."
                                metaPills={commonMetaPills}
                                showFilters={showThruFilters}
                                onToggleFilters={() => setShowThruFilters(!showThruFilters)}
                                filters={
                                    <ChartFilterRow>
                                        <ChartFilterGroup label="Y-Axis:">
                                            <ToggleGroup
                                                size="xs"
                                                options={[
                                                    { value: 'output', label: 'Output' },
                                                    { value: 'input', label: 'Input' },
                                                    { value: 'total', label: 'Total' },
                                                ]}
                                                value={thruMetric}
                                                onChange={setThruMetric}
                                            />
                                        </ChartFilterGroup>
                                        <ChartFilterGroup label="Scale:">
                                            <StatPills
                                                options={[{ value: 'perChip', label: 'Per Chip' }]}
                                                active={thruPerChip ? ['perChip'] : []}
                                                onToggle={() => setThruPerChip(!thruPerChip)}
                                            />
                                        </ChartFilterGroup>
                                    </ChartFilterRow>
                                }
                                footer={
                                    <SeriesPercentileLegend
                                        series={legendItems}
                                        percentiles={['Mean']}
                                        activePercentiles={['Mean']}
                                    />
                                }
                            >
                                <div className="relative w-full h-[340px] select-none">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <LineChart data={throughputChartData} margin={{ top: 20, right: 30, left: 60, bottom: 40 }}>
                                            <CartesianGrid {...gridProps()} />
                                            <ChartXAxis
                                                dataKey="ratio"
                                                label="Prefill : Decode Replica Ratio (P:D)"
                                                interval={0}
                                            />
                                            <ChartYAxis
                                                label={`${THROUGHPUT_LABELS[thruMetric]}${thruPerChip ? ' (tok/s/chip)' : ' (tok/s)'}`}
                                                domain={throughputYAxisConfig.domain}
                                                ticks={throughputYAxisConfig.ticks}
                                                tickFormatter={throughputYAxisConfig.tickFormatter}
                                            />
                                            <Tooltip
                                                {...tooltipProps()}
                                                cursor={cursorProps()}
                                                content={<ThroughputTooltip />}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="value"
                                                name="Mean"
                                                stroke={seriesColor(1)}
                                                strokeWidth={2.5}
                                                dot={(props) => {
                                                    const { cx, cy, payload } = props;
                                                    return (
                                                        <CustomSeriesDot
                                                            key={`dot-thru-${payload?.ratio}`}
                                                            cx={cx}
                                                            cy={cy}
                                                            fill={payload?.fill || seriesColor(1)}
                                                            stroke={payload?.fill || seriesColor(1)}
                                                            shape={payload?.shape || 'circle'}
                                                            r={4.5}
                                                        />
                                                    );
                                                }}
                                                activeDot={(props) => {
                                                    const { cx, cy, payload } = props;
                                                    return (
                                                        <CustomSeriesDot
                                                            key={`activedot-thru-${payload?.ratio}`}
                                                            cx={cx}
                                                            cy={cy}
                                                            fill={payload?.fill || seriesColor(1)}
                                                            stroke={payload?.fill || seriesColor(1)}
                                                            shape={payload?.shape || 'circle'}
                                                            r={6}
                                                            strokeWidth={2}
                                                        />
                                                    );
                                                }}
                                                isAnimationActive={false}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartContainer>

                            {/* Latency LineChart */}
                            <ChartContainer
                                kicker="P/D disaggregation telemetry"
                                title={`${LATENCY_LABELS[latMetric].replace(/ \(.*\)$/, '')} vs. P:D ratio`}
                                subtitle="Lower is better. TTFT/E2E in seconds; ITL in ms/token. ITL plateaus at prefill-heavy ratios (≥ 5:3) — the decode-saturation ceiling."
                                metaPills={commonMetaPills}
                                showFilters={showChartFilters}
                                onToggleFilters={() => setShowChartFilters(!showChartFilters)}
                                filters={
                                    <ChartFilterRow>
                                        <ChartFilterGroup label="Y-Axis:">
                                            <ToggleGroup
                                                size="xs"
                                                options={[
                                                    { value: 'ttft', label: 'TTFT' },
                                                    { value: 'itl', label: 'ITL' },
                                                    { value: 'e2e', label: 'E2E Latency' },
                                                ]}
                                                value={latMetric}
                                                onChange={setLatMetric}
                                            />
                                        </ChartFilterGroup>
                                        {latMetric !== 'itl' && (
                                            <ChartFilterGroup label="Percentiles:">
                                                <StatPills
                                                    options={['Mean', 'P90']}
                                                    active={visibleStats}
                                                    onToggle={(p) =>
                                                        setVisibleStats((prev) =>
                                                            prev.includes(p)
                                                                ? prev.length > 1
                                                                    ? prev.filter((x) => x !== p)
                                                                    : prev
                                                                : [...prev, p]
                                                        )
                                                    }
                                                />
                                            </ChartFilterGroup>
                                        )}
                                    </ChartFilterRow>
                                }
                                footer={
                                    <SeriesPercentileLegend
                                        series={legendItems}
                                        percentiles={latMetric === 'itl' ? ['Mean'] : ['Mean', 'P90']}
                                        activePercentiles={latMetric === 'itl' ? ['Mean'] : visibleStats}
                                        onTogglePercentile={
                                            latMetric === 'itl'
                                                ? undefined
                                                : (p) =>
                                                      setVisibleStats((prev) =>
                                                          prev.includes(p)
                                                              ? prev.length > 1
                                                                  ? prev.filter((x) => x !== p)
                                                                  : prev
                                                              : [...prev, p]
                                                      )
                                        }
                                    />
                                }
                            >
                                <div className="relative w-full h-[340px] select-none">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                        <LineChart data={latencyChartData} margin={{ top: 20, right: 30, left: 60, bottom: 40 }}>
                                            <CartesianGrid {...gridProps()} />
                                            <ChartXAxis
                                                dataKey="ratio"
                                                label="Prefill : Decode Replica Ratio (P:D)"
                                                interval={0}
                                            />
                                            <ChartYAxis
                                                label={LATENCY_LABELS[latMetric]}
                                                domain={latencyYAxisConfig.domain}
                                                ticks={latencyYAxisConfig.ticks}
                                                tickFormatter={latencyYAxisConfig.tickFormatter}
                                            />
                                            <Tooltip
                                                {...tooltipProps()}
                                                cursor={cursorProps()}
                                                content={<LatencyTooltip />}
                                            />
                                            {visibleStats.includes('Mean') && (
                                                <Line
                                                    type="monotone"
                                                    dataKey="mean"
                                                    name="Mean"
                                                    stroke={seriesColor(1)}
                                                    strokeWidth={2.5}
                                                    dot={(props) => {
                                                        const { cx, cy, payload } = props;
                                                        return (
                                                            <CustomSeriesDot
                                                                key={`dot-lat-mean-${payload?.ratio}`}
                                                                cx={cx}
                                                                cy={cy}
                                                                fill={payload?.fill || seriesColor(1)}
                                                                stroke={payload?.fill || seriesColor(1)}
                                                                shape={payload?.shape || 'circle'}
                                                                r={4.5}
                                                            />
                                                        );
                                                    }}
                                                    activeDot={(props) => {
                                                        const { cx, cy, payload } = props;
                                                        return (
                                                            <CustomSeriesDot
                                                                key={`activedot-lat-mean-${payload?.ratio}`}
                                                                cx={cx}
                                                                cy={cy}
                                                                fill={payload?.fill || seriesColor(1)}
                                                                stroke={payload?.fill || seriesColor(1)}
                                                                shape={payload?.shape || 'circle'}
                                                                r={6}
                                                                strokeWidth={2}
                                                            />
                                                        );
                                                    }}
                                                    isAnimationActive={false}
                                                />
                                            )}
                                            {latMetric !== 'itl' && visibleStats.includes('P90') && (
                                                <Line
                                                    type="monotone"
                                                    dataKey="p90"
                                                    name="P90"
                                                    stroke={seriesColor(1)}
                                                    strokeWidth={1.75}
                                                    strokeDasharray="6 4"
                                                    dot={(props) => {
                                                        const { cx, cy, payload } = props;
                                                        return (
                                                            <CustomSeriesDot
                                                                key={`dot-lat-p90-${payload?.ratio}`}
                                                                cx={cx}
                                                                cy={cy}
                                                                fill={payload?.fill || seriesColor(1)}
                                                                stroke={payload?.fill || seriesColor(1)}
                                                                shape={payload?.shape || 'circle'}
                                                                r={3.8}
                                                            />
                                                        );
                                                    }}
                                                    activeDot={(props) => {
                                                        const { cx, cy, payload } = props;
                                                        return (
                                                            <CustomSeriesDot
                                                                key={`activedot-lat-p90-${payload?.ratio}`}
                                                                cx={cx}
                                                                cy={cy}
                                                                fill={payload?.fill || seriesColor(1)}
                                                                stroke={payload?.fill || seriesColor(1)}
                                                                shape={payload?.shape || 'circle'}
                                                                r={5.5}
                                                                strokeWidth={2}
                                                            />
                                                        );
                                                    }}
                                                    isAnimationActive={false}
                                                />
                                            )}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </ChartContainer>
                        </div>

                        {/* Summary Metrics Table (Matches Intelligent Routing header + SeriesLineSwatch) */}
                        {columnBests && (
                            <div id="summary-table" className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                                <div className="px-5 sm:px-7 py-4 border-b border-zinc-200 flex flex-wrap justify-between items-center gap-4">
                                    <div>
                                        <span className="kicker block text-accent-600 mb-0.5">
                                            Stepwise breakdown
                                        </span>
                                        <h3 className="font-sans text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                                            Summary metrics comparison
                                        </h3>
                                        <p className="text-xs text-zinc-700 mt-0.5">
                                            TTFT/E2E in seconds; ITL in ms/token; throughput in tokens/s across all evaluated P:D replica splits.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <Button variant="secondary" size="sm" onClick={exportToCSV}>
                                            Export CSV
                                        </Button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="label-caps bg-zinc-50/90 text-zinc-700 border-b border-zinc-200">
                                                <th className="py-3.5 px-4">P:D ratio</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">Prefill</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">Decode</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">TTFT mean (s)</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">TTFT P90 (s)</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">E2E mean (s)</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">E2E P90 (s)</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">ITL mean (ms/tok)</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">Output tok/s</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">Input tok/s</th>
                                                <th className="py-3.5 px-3 border-l border-zinc-200">Total tok/s</th>
                                                <th className="py-3.5 px-4 border-l border-zinc-200">Requests</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-200/80 font-mono">
                                            {runs.map((r) => {
                                                const isWinner = outcomes && r.ratio === outcomes.bestConfig.ratio;
                                                const meta = ratioMetaMap.get(r.ratio) || { color: seriesColor(0), shape: 'circle' };
                                                return (
                                                    <tr key={r.ratio} className={cn('hover:bg-zinc-50/80 transition-colors', isWinner && 'bg-emerald-50/50')}>
                                                        <td className="py-3 px-4 text-zinc-900 font-sans font-semibold">
                                                            <span className="inline-flex items-center gap-2">
                                                                <SeriesLineSwatch
                                                                    shape={meta.shape}
                                                                    color={meta.color}
                                                                    lineStyle="solid"
                                                                />
                                                                <span>{r.ratio}</span>
                                                                {isWinner && <Badge tone="success" size="xs">Best observed</Badge>}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-3 border-l border-zinc-200 text-zinc-700 tabular-nums">{r.prefill}</td>
                                                        <td className="py-3 px-3 border-l border-zinc-200 text-zinc-700 tabular-nums">{r.decode}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.ttft.mean === columnBests.ttftMean ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtSec(r.ttft.mean)}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.ttft.p90 === columnBests.ttftP90 ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtSec(r.ttft.p90)}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.e2e.mean === columnBests.e2eMean ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtSec(r.e2e.mean)}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.e2e.p90 === columnBests.e2eP90 ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtSec(r.e2e.p90)}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.itl.mean === columnBests.itlMean ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{r.itl.mean.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.throughput.output === columnBests.output ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtTok(r.throughput.output)}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.throughput.input === columnBests.input ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtTok(r.throughput.input)}</td>
                                                        <td className={cn('py-3 px-3 border-l border-zinc-200 tabular-nums', r.throughput.total === columnBests.total ? 'text-emerald-700 font-bold' : 'text-zinc-800')}>{fmtTok(r.throughput.total)}</td>
                                                        <td className="py-3 px-4 border-l border-zinc-200 text-zinc-700 tabular-nums">{r.requests.toLocaleString()}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </main>
        </div>
    );
}
