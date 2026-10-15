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
import {
    Download,
    ExternalLink,
} from 'lucide-react';
import {
    WellLitHeader,
    Button,
    Badge,
    ToggleGroup,
    StatPills,
    LoadingState,
    ChartContainer,
    ChartFilterRow,
    ChartFilterGroup,
    ChartCapControl,
    ChartTooltip,
    ChartTooltipRow,
    SeriesPercentileLegend,
    SeriesLineSwatch,
    SeriesMarkerSvg,
    CustomSeriesDot,
    ChartXAxis,
    ChartYAxis,
    gridProps,
    cursorProps,
    tooltipProps,
    seriesColor,
    getAxisConfig,
    GoogleMark,
} from './ui';
import { cn } from '../utils/cn';
import { FALLBACK_PREFIX_CACHE_DATA } from '../utils/wellLitPathData.js';

export const TIER_COLORS = {
    baseline: seriesColor(2), // Amber   — Baseline (HBM only)
    fsCpu: seriesColor(1),    // Sky     — LLM-D-FS: CPU
    fsLustre: seriesColor(0), // Emerald — LLM-D-FS: CPU + Lustre
};

export const TIER_SHAPES = {
    baseline: 'circle',
    fsCpu: 'diamond',
    fsLustre: 'triangle',
};

const getMachineType = (gpu) => {
    if (!gpu) return 'a3-highgpu-8g';
    const upper = gpu.toUpperCase();
    if (upper.includes('H100')) return 'a3-highgpu-8g';
    if (upper.includes('A100')) return 'a2-highgpu-8g';
    if (upper.includes('L4')) return 'g2-standard-96';
    return 'a3-highgpu-8g';
};

const RichPrefixCacheTooltip = ({ active, payload, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;

    const pl = payload[0].payload;
    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS' };
    const xLabel = xLabelMap[zoomXAxis] || 'Latency';
    const yLabel = yLabelMap[zoomYAxis] || 'Throughput';

    return (
        <ChartTooltip
            className="min-w-[240px]"
            title={`${pl.tierLabel} (${pl.percentile})`}
            subtitle={`Context scale: ${pl.workloadSize} shared prefix`}
        >
            <div className="space-y-1.5 pt-1 border-t border-zinc-200">
                <ChartTooltipRow
                    color={payload[0].stroke || payload[0].fill}
                    label={xLabel}
                    value={`${typeof pl.dynamic_x === 'number' ? pl.dynamic_x.toFixed(1) : pl.dynamic_x} ms`}
                />
                <ChartTooltipRow
                    color={payload[0].stroke || payload[0].fill}
                    label={yLabel}
                    value={
                        zoomYAxis === 'qps'
                            ? `${Number(pl.dynamic_y).toFixed(2)} QPS`
                            : `${Math.round(Number(pl.dynamic_y)).toLocaleString()} tok/s`
                    }
                />
            </div>
        </ChartTooltip>
    );
};

function PrefixCacheTelemetryChart({
    fetchedData,
    selectedModel,
    activeTiers,
    activeConfig,
    workloadSize,
    initialXAxis = 'ntpot',
    initialLogScale = false,
}) {
    const [zoomXAxis, setZoomXAxis] = useState(initialXAxis);
    const [zoomYAxis, setZoomYAxis] = useState('output');
    const [zoomLogScale, setZoomLogScale] = useState(Boolean(initialLogScale));
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [zoomXMax, setZoomXMax] = useState(Infinity);
    const [showFilters, setShowFilters] = useState(true);

    const seriesMeta = useMemo(() => {
        const list = [];
        if (activeTiers.baseline) {
            list.push({
                key: 'baseline',
                match: (r) => r.tech === 'pure-vllm' && r.setup === 'hbm',
                label: 'Baseline (HBM)',
                color: TIER_COLORS.baseline,
                shape: TIER_SHAPES.baseline,
            });
        }
        if (activeTiers.cpu) {
            list.push({
                key: 'fsCpu',
                match: (r) => r.tech === 'llm-d-fs' && r.setup === 'cpu',
                label: 'LLM-D-FS: CPU',
                color: TIER_COLORS.fsCpu,
                shape: TIER_SHAPES.fsCpu,
            });
        }
        if (activeTiers.cpuLustre) {
            list.push({
                key: 'fsLustre',
                match: (r) => r.tech === 'llm-d-fs' && r.setup === 'cpu-lustre',
                label: 'LLM-D-FS: CPU + Lustre',
                color: TIER_COLORS.fsLustre,
                shape: TIER_SHAPES.fsLustre,
            });
        }
        return list;
    }, [activeTiers]);

    const derivedPoints = useMemo(() => {
        const modelRuns = (fetchedData || []).filter((r) => r.model === selectedModel);
        const chipDivisor = zoomPerChip ? Math.max(Number(activeConfig.replicas) || 8, 1) : 1;
        const points = [];

        seriesMeta.forEach((tier) => {
            const tierRuns = modelRuns.filter(tier.match);
            ['P50', 'P90', 'P99'].forEach((pKey) => {
                const pField = pKey.toLowerCase();
                tierRuns.forEach((run) => {
                    const latObj = zoomXAxis === 'e2e' ? run.e2e : run[zoomXAxis];
                    const xVal = ((latObj?.[pField] ?? 0) * 1000);
                    let yVal = run.throughput || 0;
                    if (zoomYAxis === 'input') yVal = run.inputRate || 0;
                    else if (zoomYAxis === 'total') yVal = run.totalRate || 0;
                    else if (zoomYAxis === 'qps') yVal = run.qps || 0;
                    yVal = yVal / chipDivisor;

                    if (xVal > 0 && yVal > 0) {
                        points.push({
                            tierKey: tier.key,
                            tierLabel: tier.label,
                            percentile: pKey,
                            workloadSize: run.workloadSize,
                            dynamic_x: parseFloat(xVal.toFixed(2)),
                            dynamic_y: parseFloat(yVal.toFixed(2)),
                        });
                    }
                });
            });
        });

        return points.sort((a, b) => a.dynamic_x - b.dynamic_x);
    }, [fetchedData, selectedModel, seriesMeta, zoomXAxis, zoomYAxis, zoomPerChip, activeConfig.replicas]);

    const rawDataMax = derivedPoints.length > 0
        ? Math.max(...derivedPoints.map((d) => d.dynamic_x))
        : 100;
    const dataMax = Math.max(10, Math.ceil(rawDataMax * 1.15));
    const step = Math.max(1, Math.round(dataMax / 50));
    const deferredZoomXMax = React.useDeferredValue(zoomXMax);
    const currentMax = deferredZoomXMax === Infinity ? dataMax : deferredZoomXMax;

    const visiblePoints = useMemo(() => {
        return derivedPoints.filter(
            (d) => d.dynamic_x <= currentMax && visiblePercentiles.includes(d.percentile)
        );
    }, [derivedPoints, currentMax, visiblePercentiles]);

    const xAxisConfig = useMemo(() => {
        const vals = visiblePoints.map((d) => d.dynamic_x);
        const cfg = getAxisConfig(vals, zoomLogScale);
        if (zoomXMax !== Infinity && !zoomLogScale) {
            return { ...cfg, domain: [0, currentMax] };
        }
        return cfg;
    }, [visiblePoints, zoomLogScale, zoomXMax, currentMax]);

    const yAxisConfig = useMemo(() => {
        const vals = visiblePoints.map((d) => d.dynamic_y);
        return getAxisConfig(vals, false);
    }, [visiblePoints]);

    const xLabels = {
        tpot: 'Time Per Output Token (TPOT, ms — lower is better)',
        ntpot: 'Normalized TPOT (NTPOT, ms — lower is better)',
        ttft: 'Time To First Token (TTFT, ms — lower is better)',
        itl: 'Inter-Token Latency (ITL, ms — lower is better)',
        e2e: 'End-to-End Latency (E2E, ms — lower is better)',
    };

    const yLabels = {
        output: `Output Throughput (${zoomPerChip ? 'tok/s/chip' : 'tok/s'})`,
        input: `Input Throughput (${zoomPerChip ? 'tok/s/chip' : 'tok/s'})`,
        total: `Total Throughput (${zoomPerChip ? 'tok/s/chip' : 'tok/s'})`,
        qps: `Request Rate (${zoomPerChip ? 'QPS/chip' : 'QPS'})`,
    };

    const yTitleLabels = {
        output: 'Output tokens/sec',
        input: 'Input tokens/sec',
        total: 'Total tokens/sec',
        qps: 'Queries per second',
    };

    const xTitleLabels = {
        ttft: 'TTFT',
        tpot: 'TPOT',
        ntpot: 'Normalized TPOT',
        itl: 'ITL',
        e2e: 'E2E latency',
    };

    const activeScaleModes = [
        ...(zoomLogScale ? ['log'] : []),
        ...(zoomPerChip ? ['perChip'] : []),
    ];

    const handleToggleScaleMode = (mode) => {
        if (mode === 'log') setZoomLogScale((prev) => !prev);
        if (mode === 'perChip') setZoomPerChip((prev) => !prev);
    };

    const handleTogglePercentile = (p) => {
        setVisiblePercentiles((prev) =>
            prev.includes(p) ? (prev.length > 1 ? prev.filter((x) => x !== p) : prev) : [...prev, p]
        );
    };

    return (
        <ChartContainer
            kicker="Tiered cache telemetry"
            title={`${yTitleLabels[zoomYAxis] || zoomYAxis} vs. ${xTitleLabels[zoomXAxis] || zoomXAxis} (${zoomLogScale ? 'Log' : 'Linear'})`}
            subtitle="Comparing sustained token throughput and tail latency across HBM-only, host CPU RAM, and multi-connector CPU + Lustre storage tiers (30k–70k shared prefix)."
            metaPills={
                <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-sans text-micro font-medium text-zinc-700">
                        <GoogleMark className="w-3 h-3" />
                        <span>{getMachineType(activeConfig.gpu)}</span>
                        <span className="text-zinc-400">·</span>
                        <span>{activeConfig.gpu} ({activeConfig.replicas} replicas)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-sans text-micro font-medium text-zinc-700">
                        <span>Qwen3-32B (BF16)</span>
                        <span className="text-zinc-400">·</span>
                        <span>{activeConfig.engineLabel}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 font-sans text-micro font-semibold text-accent-700">
                        {workloadSize} focus
                    </span>
                </>
            }
            showFilters={showFilters}
            onToggleFilters={() => setShowFilters(!showFilters)}
            filters={
                <>
                    <ChartFilterRow>
                        <ChartFilterGroup label="X-Axis:">
                            <ToggleGroup
                                size="xs"
                                options={[
                                    { value: 'ntpot', label: 'NTPOT' },
                                    { value: 'tpot', label: 'TPOT' },
                                    { value: 'ttft', label: 'TTFT' },
                                    { value: 'itl', label: 'ITL' },
                                    { value: 'e2e', label: 'E2E Latency' },
                                ]}
                                value={zoomXAxis}
                                onChange={(val) => {
                                    setZoomXAxis(val);
                                    setZoomXMax(Infinity);
                                }}
                            />
                        </ChartFilterGroup>

                        <div className="flex flex-wrap items-center gap-2">
                            <ChartFilterGroup label="Scale:">
                                <StatPills
                                    options={[
                                        { value: 'log', label: 'Log Scale' },
                                        { value: 'perChip', label: 'Per Chip' },
                                    ]}
                                    active={activeScaleModes}
                                    onToggle={handleToggleScaleMode}
                                />
                            </ChartFilterGroup>

                            <ChartFilterGroup label="Percentiles:">
                                <StatPills
                                    options={['P50', 'P90', 'P99']}
                                    active={visiblePercentiles}
                                    onToggle={handleTogglePercentile}
                                />
                            </ChartFilterGroup>
                        </div>
                    </ChartFilterRow>

                    <ChartFilterRow>
                        <ChartFilterGroup label="Y-Axis:">
                            <ToggleGroup
                                size="xs"
                                options={[
                                    { value: 'output', label: 'Output' },
                                    { value: 'input', label: 'Input' },
                                    { value: 'total', label: 'Total' },
                                    { value: 'qps', label: 'QPS' },
                                ]}
                                value={zoomYAxis}
                                onChange={setZoomYAxis}
                            />
                        </ChartFilterGroup>

                        <ChartCapControl
                            label="Cap:"
                            value={currentMax}
                            min={Math.max(1, Math.round(dataMax * 0.05))}
                            max={dataMax}
                            step={step}
                            unit="ms"
                            isAuto={zoomXMax === Infinity}
                            onAutoToggle={() => setZoomXMax(Infinity)}
                            onChange={setZoomXMax}
                        />
                    </ChartFilterRow>
                </>
            }
            footer={
                <SeriesPercentileLegend
                    series={seriesMeta}
                    percentiles={['P50', 'P90', 'P99']}
                    activePercentiles={visiblePercentiles}
                    onTogglePercentile={handleTogglePercentile}
                />
            }
        >
            <div className="relative w-full h-[380px] select-none">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart margin={{ top: 16, right: 30, left: 60, bottom: 45 }}>
                        <CartesianGrid {...gridProps()} />
                        <ChartXAxis
                            dataKey="dynamic_x"
                            type="number"
                            scale={zoomLogScale ? 'log' : 'auto'}
                            domain={xAxisConfig.domain}
                            ticks={xAxisConfig.ticks}
                            allowDataOverflow
                            label={xLabels[zoomXAxis]}
                        />
                        <ChartYAxis
                            dataKey="dynamic_y"
                            type="number"
                            domain={yAxisConfig.domain}
                            ticks={yAxisConfig.ticks}
                            label={yLabels[zoomYAxis]}
                        />
                        <Tooltip
                            {...tooltipProps()}
                            content={
                                <RichPrefixCacheTooltip
                                    zoomXAxis={zoomXAxis}
                                    zoomYAxis={zoomYAxis}
                                />
                            }
                            cursor={cursorProps()}
                        />
                        {seriesMeta.map((tier) =>
                            ['P50', 'P90', 'P99'].map((pKey) => {
                                if (!visiblePercentiles.includes(pKey)) return null;
                                const lineData = visiblePoints.filter(
                                    (d) => d.tierKey === tier.key && d.percentile === pKey
                                );
                                if (!lineData.length) return null;
                                const strokeDasharray =
                                    pKey === 'P90' ? '6 4' : pKey === 'P99' ? '2 3' : undefined;
                                return (
                                    <Line
                                        key={`${tier.key}-${pKey}`}
                                        data={lineData}
                                        type="monotone"
                                        dataKey="dynamic_y"
                                        name={`${tier.label} (${pKey})`}
                                        stroke={tier.color}
                                        strokeWidth={pKey === 'P50' ? 2.5 : 1.75}
                                        strokeDasharray={strokeDasharray}
                                        dot={
                                            <CustomSeriesDot
                                                shape={tier.shape}
                                                r={pKey === 'P50' ? 4 : 3.25}
                                            />
                                        }
                                        activeDot={
                                            <CustomSeriesDot
                                                shape={tier.shape}
                                                r={5.5}
                                                strokeWidth={2}
                                            />
                                        }
                                        isAnimationActive={false}
                                    />
                                );
                            })
                        )}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </ChartContainer>
    );
}

export default function PrefixCacheOffloadingDashboard({ onNavigateBack, onToggleMobileNav }) {
    const [workloadSize, setWorkloadSize] = useState('50k');
    const [selectedModel] = useState('qwen3_32b');
    const [fetchedData, setFetchedData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Table filters matching Milestone1Dashboard
    const [tableMetricMode, setTableMetricMode] = useState('ttft');
    const [selectedPercentile, setSelectedPercentile] = useState('P90');

    useEffect(() => {
        let active = true;
        fetch('/api/prefix-cache/data')
            .then((res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then((data) => {
                if (active) {
                    const filtered = (Array.isArray(data) ? data : []).filter(
                        (r) => r.model !== 'llama_3_3_70b' && r.tech !== 'lm-cache'
                    );
                    setFetchedData(filtered.length > 0 ? filtered : FALLBACK_PREFIX_CACHE_DATA);
                    setIsLoading(false);
                }
            })
            .catch(() => {
                if (active) {
                    setFetchedData(FALLBACK_PREFIX_CACHE_DATA);
                    setIsLoading(false);
                }
            });
        return () => {
            active = false;
        };
    }, []);

    const [activeTiers, setActiveTiers] = useState({
        baseline: true,
        cpu: true,
        cpuLustre: true,
    });

    const derivedOutcomesMap = useMemo(() => {
        if (!fetchedData || fetchedData.length === 0) return {};

        const sizes = ['30k', '50k', '70k'];
        const map = {};

        sizes.forEach((size) => {
            const sizeRuns = fetchedData.filter(
                (r) => r.model === selectedModel && r.workloadSize === size
            );
            if (sizeRuns.length === 0) return;

            const baseline = sizeRuns.find((r) => r.tech === 'pure-vllm' && r.setup === 'hbm');
            const fsCpu = sizeRuns.find((r) => r.tech === 'llm-d-fs' && r.setup === 'cpu');
            const fsLustre = sizeRuns.find(
                (r) => r.tech === 'llm-d-fs' && r.setup === 'cpu-lustre'
            );

            const getPct = (run, refRun) => {
                if (!run || !refRun) return 'N/A';
                const pct = ((run.throughput - refRun.throughput) / refRun.throughput) * 100;
                return `${pct >= 0 ? '+' : ''}${Math.round(pct)}%`;
            };

            const getLatencyPct = (run, refRun) => {
                if (!run || !refRun) return 'N/A';
                const pct = ((run.ttft.p50 - refRun.ttft.p50) / refRun.ttft.p50) * 100;
                return `${pct <= 0 ? '' : '+'}${Math.round(pct)}%`;
            };

            map[size] = {
                cpu: {
                    throughput: getPct(fsCpu, baseline),
                    latency: getLatencyPct(fsCpu, baseline),
                },
                ssd: {
                    throughput: getPct(fsLustre, baseline),
                    latency: getLatencyPct(fsLustre, baseline),
                },
            };
        });

        return map;
    }, [fetchedData, selectedModel]);

    const activeConfig = useMemo(() => {
        if (!fetchedData || fetchedData.length === 0) {
            return { tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: '' };
        }

        const run =
            fetchedData.find((r) => r.model === selectedModel && r.workloadSize === workloadSize) ||
            fetchedData.find((r) => r.model === selectedModel) ||
            fetchedData[0];

        return {
            tp: run.tp || 2,
            replicas: run.replicas || 8,
            gpu: run.gpu || 'NVIDIA H100',
            engineLabel: run.engineLabel || 'vLLM',
            engineVersion: run.engineVersion || '',
        };
    }, [fetchedData, selectedModel, workloadSize]);

    const tableRows = useMemo(() => {
        const sizes = ['30k', '50k', '70k'];
        const pField = selectedPercentile.toLowerCase();

        return sizes.map((size) => {
            const sizeRuns = (fetchedData || []).filter(
                (r) => r.model === selectedModel && r.workloadSize === size
            );
            const baseline = sizeRuns.find((r) => r.tech === 'pure-vllm' && r.setup === 'hbm');
            const fsCpu = sizeRuns.find((r) => r.tech === 'llm-d-fs' && r.setup === 'cpu');
            const fsLustre = sizeRuns.find(
                (r) => r.tech === 'llm-d-fs' && r.setup === 'cpu-lustre'
            );

            const getLatMs = (run) => {
                if (!run) return null;
                const src = tableMetricMode === 'e2e' ? run.e2e : run[tableMetricMode];
                return src?.[pField] !== undefined ? Math.round(src[pField] * 1000) : null;
            };

            const baseMs = getLatMs(baseline);
            const cpuMs = getLatMs(fsCpu);
            const lustreMs = getLatMs(fsLustre);
            const gain =
                baseMs && lustreMs ? Math.round(((baseMs - lustreMs) / baseMs) * 100) : null;

            return {
                context: size,
                baseMs,
                cpuMs,
                lustreMs,
                baseTput: baseline ? Math.round(baseline.throughput) : null,
                cpuTput: fsCpu ? Math.round(fsCpu.throughput) : null,
                lustreTput: fsLustre ? Math.round(fsLustre.throughput) : null,
                gain,
            };
        });
    }, [fetchedData, selectedModel, tableMetricMode, selectedPercentile]);

    const exportToCSV = () => {
        const headers = [
            'Context Scale',
            `Baseline (HBM) ${selectedPercentile} (${tableMetricMode.toUpperCase()} ms)`,
            `LLM-D-FS: CPU ${selectedPercentile} (${tableMetricMode.toUpperCase()} ms)`,
            `LLM-D-FS: CPU + Lustre ${selectedPercentile} (${tableMetricMode.toUpperCase()} ms)`,
            'Latency Reduction (%)',
        ];
        const rows = tableRows.map((r) =>
            [
                r.context,
                r.baseMs ?? 'N/A',
                r.cpuMs ?? 'N/A',
                r.lustreMs ?? 'N/A',
                r.gain !== null ? `${r.gain}%` : 'N/A',
            ].join(',')
        );
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute(
            'download',
            `prefix_cache_offloading_${tableMetricMode}_${selectedPercentile}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading) {
        return (
            <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center w-full">
                <LoadingState label="Loading telemetry database..." />
            </div>
        );
    }

    const activeLineStyle =
        selectedPercentile === 'P90'
            ? 'dashed'
            : selectedPercentile === 'P99'
              ? 'dotted'
              : 'solid';

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans relative overflow-hidden">
            <WellLitHeader
                kicker="Well-lit path"
                pageTitle="Prefix cache offloading"
                subtitle="Dynamic capacity and saturation boundaries under tiered prefix caching across HBM VRAM, host CPU RAM, and Lustre storage."
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
            />

            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 flex flex-col space-y-6">
                {/* ROW 1: Architectural Overview Card */}
                <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
                        {/* Col 1: Overview */}
                        <div className="p-4 sm:p-5 flex flex-col justify-between space-y-2.5">
                            <div>
                                <div className="kicker text-accent-600 mb-1.5">Overview</div>
                                <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                                    Evaluates dynamic capacity and saturation boundaries under Tiered Prefix Caching.
                                    These telemetry benchmarks expose the exact context scale where native HBM VRAM saturates on long prompts, proving how offloading to Host CPU RAM and CPU + Lustre storage extends serving capacity while lowering TTFT.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Active Configurations */}
                        <div className="p-4 sm:p-5 space-y-2">
                            <div className="kicker text-zinc-700 mb-1.5">
                                Active configurations
                            </div>

                            {/* Baseline (HBM Only) */}
                            <button
                                onClick={() =>
                                    setActiveTiers((prev) => ({ ...prev, baseline: !prev.baseline }))
                                }
                                className={cn(
                                    'w-full text-left border rounded-2xl px-3.5 py-2 flex items-center justify-between transition-all cursor-pointer',
                                    activeTiers.baseline
                                        ? 'border-zinc-300 bg-zinc-50/90'
                                        : 'border-zinc-200/70 bg-white opacity-60'
                                )}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-zinc-900">
                                        Baseline (HBM only)
                                    </div>
                                    <p className="text-micro text-zinc-600">
                                        Native HBM VRAM without offloading
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <SeriesMarkerSvg
                                        shape={TIER_SHAPES.baseline}
                                        color={TIER_COLORS.baseline}
                                        opacity={activeTiers.baseline ? 1 : 0.35}
                                        size={11}
                                    />
                                </div>
                            </button>

                            {/* CPU Offloading */}
                            <button
                                onClick={() =>
                                    setActiveTiers((prev) => ({ ...prev, cpu: !prev.cpu }))
                                }
                                className={cn(
                                    'w-full text-left border rounded-2xl px-3.5 py-2 flex items-center justify-between transition-all cursor-pointer',
                                    activeTiers.cpu
                                        ? 'border-zinc-300 bg-zinc-50/90'
                                        : 'border-zinc-200/70 bg-white opacity-60'
                                )}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-zinc-900">
                                        CPU Offloading (LLM-D-FS)
                                    </div>
                                    <p className="text-micro text-zinc-600">
                                        Host CPU RAM offload via FS connector
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2.5">
                                    <a
                                        href="https://github.com/llm-d/llm-d/tree/main/guides/tiered-prefix-cache"
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <SeriesMarkerSvg
                                        shape={TIER_SHAPES.fsCpu}
                                        color={TIER_COLORS.fsCpu}
                                        opacity={activeTiers.cpu ? 1 : 0.35}
                                        size={11}
                                    />
                                </div>
                            </button>

                            {/* CPU + Lustre */}
                            <button
                                onClick={() =>
                                    setActiveTiers((prev) => ({ ...prev, cpuLustre: !prev.cpuLustre }))
                                }
                                className={cn(
                                    'w-full text-left border rounded-2xl px-3.5 py-2 flex items-center justify-between transition-all cursor-pointer',
                                    activeTiers.cpuLustre
                                        ? 'border-zinc-300 bg-zinc-50/90'
                                        : 'border-zinc-200/70 bg-white opacity-60'
                                )}
                            >
                                <div>
                                    <div className="text-xs font-semibold text-zinc-900">
                                        CPU + Lustre Offloading
                                    </div>
                                    <p className="text-micro text-zinc-600">
                                        Multi-connector offload to Lustre storage
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2.5">
                                    <a
                                        href="https://github.com/llm-d/llm-d/tree/main/guides/tiered-prefix-cache"
                                        target="_blank"
                                        rel="noreferrer"
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <SeriesMarkerSvg
                                        shape={TIER_SHAPES.fsLustre}
                                        color={TIER_COLORS.fsLustre}
                                        opacity={activeTiers.cpuLustre ? 1 : 0.35}
                                        size={11}
                                    />
                                </div>
                            </button>
                        </div>

                        {/* Col 3: Upcoming Variants */}
                        <div className="p-4 sm:p-5 space-y-2 bg-zinc-50/30">
                            <div className="kicker text-zinc-700 mb-1.5">
                                Upcoming variants
                            </div>

                            <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-800">
                                        Tiered cache: local SSD
                                    </div>
                                    <p className="text-micro text-zinc-600">
                                        Direct persistent NVMe offloading
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a
                                        href="https://github.com/lmcache/lmcache"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Badge tone="warning" size="xs">
                                        Soon
                                    </Badge>
                                </div>
                            </div>

                            <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-800">
                                        Cloud storage rapid cache
                                    </div>
                                    <p className="text-micro text-zinc-600">
                                        GCS / Object storage remote layer
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a
                                        href="https://www.coreweave.com/news/coreweave-unveils-ai-object-storage-redefining-how-ai-workloads-access-and-scale-data"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                    >
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Badge tone="warning" size="xs">
                                        Soon
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ROW 2: Compact Benchmark Scenario & Outcomes Strip */}
                <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 sm:px-6 py-2.5 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="kicker text-accent-600">
                                Benchmark scenario & outcomes
                            </span>
                            <span className="text-zinc-300" aria-hidden="true">
                                |
                            </span>
                            <div className="flex items-center gap-1.5">
                                <span className="text-micro font-medium text-zinc-700">
                                    Context scale:
                                </span>
                                <ToggleGroup
                                    size="xs"
                                    value={workloadSize}
                                    onChange={setWorkloadSize}
                                    options={[
                                        { value: '30k', label: '30k' },
                                        { value: '50k', label: '50k' },
                                        { value: '70k', label: '70k' },
                                    ]}
                                />
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    document
                                        .getElementById('summary-table')
                                        ?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="text-xs font-semibold text-accent-600 hover:text-accent-700 px-2 py-1 transition-colors cursor-pointer"
                            >
                                View summary table →
                            </button>
                            <a
                                href="https://github.com/llm-d/llm-d/tree/main/guides/tiered-prefix-cache"
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
                        {/* Compact 6-Spec Environment Grid */}
                        <div className="lg:col-span-8 xl:col-span-9 p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3.5 items-start">
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">
                                    Provider / machine
                                </span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs flex items-center gap-1.5">
                                    <GoogleMark />
                                    {getMachineType(activeConfig.gpu)}
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">
                                    Accelerator
                                </span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    {activeConfig.gpu} ({activeConfig.replicas} replicas)
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">
                                    Context length
                                </span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    {workloadSize} shared prefix
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">
                                    Model name
                                </span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    Qwen3-32B (BF16)
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">
                                    Engine & connector
                                </span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    {activeConfig.engineLabel} · llm-d-fs
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">
                                    Test harness
                                </span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    inference-perf
                                </span>
                            </div>
                        </div>

                        {/* Compact Primary Outcomes Strip */}
                        <div className="lg:col-span-4 xl:col-span-3 p-4 sm:p-5 bg-zinc-50/50 grid grid-cols-2 gap-4 items-center">
                            <div>
                                <div className="text-micro font-medium text-zinc-600 mb-1">
                                    Throughput gain
                                </div>
                                <div className="display-title text-2xl font-bold text-emerald-600 tabular-nums leading-none">
                                    {derivedOutcomesMap[workloadSize]?.ssd?.throughput || '+83%'}
                                </div>
                                <div className="text-micro font-medium text-zinc-600 mt-1">
                                    CPU+Lustre vs HBM
                                </div>
                            </div>
                            <div className="border-l border-zinc-200 pl-4">
                                <div className="text-micro font-medium text-zinc-600 mb-1">
                                    Latency reduction
                                </div>
                                <div className="display-title text-2xl font-bold text-accent-600 tabular-nums leading-none">
                                    {derivedOutcomesMap[workloadSize]?.ssd?.latency || '-63%'}
                                </div>
                                <div className="text-micro font-medium text-zinc-600 mt-1">
                                    TTFT (P50)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* ROW 3: Interactive Line Charts matching Intelligent Routing */}
                <div className="flex flex-col gap-6 w-full">
                    <PrefixCacheTelemetryChart
                        fetchedData={fetchedData}
                        selectedModel={selectedModel}
                        activeTiers={activeTiers}
                        activeConfig={activeConfig}
                        workloadSize={workloadSize}
                        initialXAxis="ntpot"
                        initialLogScale={false}
                    />
                    <PrefixCacheTelemetryChart
                        fetchedData={fetchedData}
                        selectedModel={selectedModel}
                        activeTiers={activeTiers}
                        activeConfig={activeConfig}
                        workloadSize={workloadSize}
                        initialXAxis="ttft"
                        initialLogScale={false}
                    />
                </div>

                {/* ROW 4: Summary Metrics Table matching Intelligent Routing */}
                <div
                    id="summary-table"
                    className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden"
                >
                    <div className="px-5 sm:px-6 py-4 border-b border-zinc-200 bg-zinc-50/75 flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <div className="kicker text-accent-600 mb-0.5">
                                Stepwise breakdown
                            </div>
                            <h3 className="font-sans text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                                Summary metrics comparison
                            </h3>
                            <p className="text-xs text-zinc-700 mt-0.5">
                                Comparing Baseline (HBM), CPU Offloading, and CPU + Lustre across context lengths. Click a row to focus that context scale.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <ToggleGroup
                                size="xs"
                                options={['ttft', 'itl', 'ntpot', 'tpot', 'e2e'].map((m) => ({
                                    value: m,
                                    label: m.toUpperCase(),
                                }))}
                                value={tableMetricMode}
                                onChange={setTableMetricMode}
                            />
                            <ToggleGroup
                                size="xs"
                                options={['P50', 'P90', 'P99'].map((p) => ({
                                    value: p,
                                    label: p,
                                }))}
                                value={selectedPercentile}
                                onChange={setSelectedPercentile}
                            />
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={exportToCSV}
                                className="cursor-pointer"
                            >
                                Export CSV
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="label-caps bg-zinc-50/90 text-zinc-700 border-b border-zinc-200">
                                    <th className="py-3.5 px-5">Context scale</th>
                                    <th className="py-3.5 px-4 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={TIER_SHAPES.baseline}
                                                color={TIER_COLORS.baseline}
                                                lineStyle={activeLineStyle}
                                            />
                                            <span>Baseline (HBM) ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th className="py-3.5 px-4 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={TIER_SHAPES.fsCpu}
                                                color={TIER_COLORS.fsCpu}
                                                lineStyle={activeLineStyle}
                                            />
                                            <span>LLM-D-FS: CPU ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th className="py-3.5 px-4 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={TIER_SHAPES.fsLustre}
                                                color={TIER_COLORS.fsLustre}
                                                lineStyle={activeLineStyle}
                                            />
                                            <span>LLM-D-FS: CPU + Lustre ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th className="py-3.5 px-5 border-l border-zinc-200 text-right">
                                        Difference (%)
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/80 font-mono">
                                {tableRows.map((row) => {
                                    const isCurrent = workloadSize === row.context;
                                    return (
                                        <tr
                                            key={row.context}
                                            onClick={() => setWorkloadSize(row.context)}
                                            className={cn(
                                                'hover:bg-zinc-50 transition-colors cursor-pointer',
                                                isCurrent && 'bg-accent-50/40'
                                            )}
                                        >
                                            <td className="py-3.5 px-5 text-zinc-900 font-sans font-semibold flex items-center gap-2">
                                                <span>{row.context}</span>
                                                {isCurrent && (
                                                    <Badge tone="info" size="xs">
                                                        Active
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="py-3.5 px-4 border-l border-zinc-200 text-zinc-700 tabular-nums">
                                                {row.baseMs !== null ? `${row.baseMs} ms` : 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 border-l border-zinc-200 text-zinc-800 tabular-nums">
                                                {row.cpuMs !== null ? `${row.cpuMs} ms` : 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-4 border-l border-zinc-200 text-zinc-900 font-semibold tabular-nums">
                                                {row.lustreMs !== null ? `${row.lustreMs} ms` : 'N/A'}
                                            </td>
                                            <td className="py-3.5 px-5 border-l border-zinc-200 text-right tabular-nums">
                                                {row.gain !== null ? (
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-micro font-semibold border',
                                                            row.gain > 0
                                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                : 'bg-red-50 text-red-700 border-red-200'
                                                        )}
                                                    >
                                                        {row.gain > 0 ? `+${row.gain}%` : `${row.gain}%`}
                                                    </span>
                                                ) : (
                                                    <span className="text-zinc-500">N/A</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
        </div>
    );
}
