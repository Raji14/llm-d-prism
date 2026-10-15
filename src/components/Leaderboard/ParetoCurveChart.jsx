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

import React, { useState, useRef, useMemo } from 'react';
import {
    ResponsiveContainer,
    Scatter,
    ZAxis,
    Tooltip,
    Line,
    ComposedChart,
    CartesianGrid,
    ReferenceLine
} from 'recharts';
import { Download, FilterX, Info } from 'lucide-react';
import {
    ChartContainer,
    ChartFilterRow,
    ChartFilterGroup,
    ChartXAxis,
    ChartYAxis,
    ChartTooltip,
    ChartTooltipRow,
    SeriesLineSwatch,
    ToggleGroup,
    EmptyState,
    StatusChip,
    CHART_SERIES,
    CHART_STATUS,
    cursorProps,
    getChartTheme,
    gridProps,
    tooltipProps,
    resolveSeriesColor
} from '../ui';
import { cn } from '../../utils/cn';
import { computeParetoFrontier, getMetricValue } from '../../utils/paretoFrontier.js';
import { engineLabel } from '../../utils/leaderboardFacets.js';

// Canonical Prism chart palette mapped stably to accelerator entities
const HARDWARE_COLORS = {
    'nvidia-h100-80gb': CHART_SERIES[2], // Amber
    'nvidia-a100-80gb': CHART_SERIES[3], // Purple
    'nvidia-a100-40gb': CHART_SERIES[3], // Purple
    'nvidia-l4': CHART_SERIES[1],        // Sky
    'tpu-v6e-trillium': CHART_SERIES[0], // Green
    'tpu-v5e': CHART_SERIES[4],          // Pink
};

const HARDWARE_LABELS = {
    'nvidia-h100-80gb': 'H100',
    'nvidia-a100-80gb': 'A100',
    'nvidia-a100-40gb': 'A100 40GB',
    'nvidia-l4': 'L4',
    'tpu-v6e-trillium': 'TPU v6e',
    'tpu-v5e': 'TPU v5e',
};

function formatShortHardware(item) {
    if (!item) return '';
    const count = item.hardware?.accelerator_count || 1;
    const accType = item.hardware?.accelerator_type || '';
    const shortAcc = HARDWARE_LABELS[accType] || item.hardware_summary || accType;
    return `${count}× ${shortAcc}`;
}

// Canonical Prism chart palette mapped stably to stack components
const STACK_COLORS = {
    'llm-d': CHART_SERIES[0],  // Green
    'vllm': CHART_SERIES[1],   // Sky
    'sglang': CHART_SERIES[2], // Amber
};

const STACK_SERIES_INDEX = {
    'llm-d': 0,
    'vllm': 1,
    'sglang': 2,
};

const STACK_ORDER = ['llm-d', 'vllm', 'sglang'];

function getStackShape(stackKey) {
    const key = String(stackKey || 'llm-d').toLowerCase();
    if (key.includes('llm-d') || key === 'llmd') return 'diamond';
    if (key.includes('vllm')) return 'circle';
    if (key.includes('sglang')) return 'triangle';
    return 'square';
}

function getSweepPointMetric(pt, metricKey) {
    if (!pt) return null;
    if (metricKey === 'ttft_p50') return pt.ttft_p50;
    if (metricKey === 'itl_p50') return pt.itl_p50;
    if (metricKey === 'output_tokens_per_sec') {
        return pt.output_tokens_per_sec ?? (pt.itl_p50 > 0 ? 1000 / pt.itl_p50 : null);
    }
    if (metricKey === 'workload.concurrency') return pt.concurrency;
    if (metricKey === 'tokens_per_sec_per_chip') return pt.tokens_per_sec_per_chip;
    if (metricKey === 'tokens_per_sec') return pt.tokens_per_sec;
    if (metricKey === 'tokens_per_dollar') return pt.tokens_per_dollar;
    return pt[metricKey] ?? null;
}

const X_AXIS_CONFIGS = {
    ttft_p50: {
        label: 'TTFT (P50)',
        shortLabel: 'TTFT P50',
        axisLabel: 'Time to First Token (TTFT P50, ms — lower is better)',
        unit: ' ms',
        direction: 'min',
        format: (v) => Number(v).toFixed(1)
    },
    itl_p50: {
        label: 'TPOT / ITL (P50)',
        shortLabel: 'TPOT P50',
        axisLabel: 'Time Per Output Token (TPOT P50, ms — lower is better)',
        unit: ' ms',
        direction: 'min',
        format: (v) => Number(v).toFixed(1)
    },
    output_tokens_per_sec: {
        label: 'Interactivity',
        shortLabel: 'Interactivity',
        axisLabel: 'Interactivity / Output Token Rate (tok/s/user — higher is better)',
        unit: ' tok/s',
        direction: 'max',
        format: (v) => Number(v).toFixed(1)
    },
    'workload.concurrency': {
        label: 'Concurrency',
        shortLabel: 'Concurrency',
        axisLabel: 'Concurrent Requests / Streams',
        unit: ' streams',
        direction: 'max',
        format: (v) => Math.round(v).toLocaleString()
    }
};

const THROUGHPUT_CONFIGS = {
    tokens_per_sec_per_chip: {
        label: 'Throughput per chip',
        shortLabel: 'Throughput per chip',
        axisLabel: 'Throughput per Chip (Tokens/sec/chip)',
        unit: ' tok/s/chip',
        format: (v) => Math.round(v).toLocaleString()
    },
    tokens_per_sec: {
        label: 'Total throughput',
        shortLabel: 'Aggregate throughput',
        axisLabel: 'Throughput (Tokens/sec)',
        unit: ' tok/s',
        format: (v) => Math.round(v).toLocaleString()
    },
    tokens_per_dollar: {
        label: 'Tokens / dollar',
        shortLabel: 'Tokens per dollar',
        axisLabel: 'Tokens Per Dollar ($)',
        unit: ' tok/$',
        format: (v) => Math.round(v).toLocaleString()
    }
};

function niceAxis(values, pad = 0.08, count = 5) {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) return { domain: ['auto', 'auto'], ticks: undefined };
    const dataMin = Math.min(...finite);
    const dataMax = Math.max(...finite);
    const span = dataMax - dataMin || Math.abs(dataMax) || 1;
    const min = dataMin - span * pad;
    const max = dataMax + span * pad;
    const raw = (max - min) / (count - 1);
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    const floor = Math.floor(min / step) * step;
    const lo = dataMin >= 0 ? Math.max(0, floor) : floor;
    const hi = Math.ceil(max / step) * step;
    const ticks = [];
    for (let t = lo; t <= hi + step / 2; t += step) ticks.push(Number(t.toPrecision(12)));
    return { domain: [lo, hi], ticks };
}

const padLogDomain = ([min, max]) => {
    const pad = (max - min) * 0.12 || max * 0.1 || 1;
    return [Math.max(min - pad, min * 0.5), max + pad];
};

const compactTick = (v) => {
    const abs = Math.abs(v);
    if (abs >= 1e6) return `${Number((v / 1e6).toFixed(1))}M`;
    if (abs >= 1e3) return `${Number((v / 1e3).toFixed(1))}k`;
    return `${abs >= 10 ? Math.round(v) : Number(Number(v).toFixed(1))}`;
};

function CustomScatterDot(props) {
    const { cx, cy, payload, activeItemId, chartTheme, onSelectRecipe } = props;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || !payload) return null;

    const item = payload.item;
    const isSelected = Boolean(activeItemId && item?.id === activeItemId);
    const isPareto = Boolean(payload.isParetoOptimal);
    const missesSlo = Boolean(item?.missesSlo);
    const shape = payload.shape || getStackShape(item?.stack?.engine);
    const fill = payload.color;
    const stroke = isSelected
        ? chartTheme.accent
        : isPareto
            ? CHART_STATUS.warning
            : chartTheme.surface;
    const strokeWidth = isSelected ? 2.75 : isPareto ? 2.25 : 1.5;
    const r = isSelected ? 7.2 : isPareto ? 6.4 : 5.6;
    const fillOpacity = missesSlo ? 0.35 : isSelected ? 1 : 0.92;

    const handleClick = (e) => {
        e.stopPropagation();
        if (item && onSelectRecipe) {
            onSelectRecipe(item);
        }
    };

    return (
        <g
            onClick={handleClick}
            style={{ cursor: 'pointer' }}
            role="button"
            tabIndex={-1}
            aria-label={`${item?.recipe_name || 'Recipe'} (${engineLabel(item?.stack?.engine)})`}
        >
            {shape === 'diamond' && (
                <polygon
                    points={`${cx},${cy - r * 1.22} ${cx + r * 1.22},${cy} ${cx},${cy + r * 1.22} ${cx - r * 1.22},${cy}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    fillOpacity={fillOpacity}
                />
            )}
            {shape === 'circle' && (
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    fillOpacity={fillOpacity}
                />
            )}
            {shape === 'triangle' && (
                <polygon
                    points={`${cx},${cy - r * 1.2} ${cx + r * 1.15},${cy + r * 0.95} ${cx - r * 1.15},${cy + r * 0.95}`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    fillOpacity={fillOpacity}
                />
            )}
            {shape === 'square' && (
                <rect
                    x={cx - r * 0.95}
                    y={cy - r * 0.95}
                    width={r * 1.9}
                    height={r * 1.9}
                    rx={1.5}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    fillOpacity={fillOpacity}
                />
            )}
        </g>
    );
}

const ParetoChartTooltip = ({
    active,
    payload,
    latencyMetric = 'ttft_p50',
    throughputMetric = 'tokens_per_sec_per_chip'
}) => {
    if (!active || !payload || !payload.length) return null;

    const recipeEntry = payload.find(p => p?.payload?.item?.recipe_name || p?.payload?.recipe_name) || payload[0];
    const data = recipeEntry?.payload || {};
    const item = data.item || data;
    const sweepPt = data.sweepPoint || null;

    const latConfig = X_AXIS_CONFIGS[latencyMetric] || X_AXIS_CONFIGS.ttft_p50;
    const tputConfig = THROUGHPUT_CONFIGS[throughputMetric] || THROUGHPUT_CONFIGS.tokens_per_sec_per_chip;

    if (!item || (!item.recipe_name && !data.recipeName)) {
        const xVal = data.x ?? payload[0]?.value;
        const yVal = data.y ?? payload[0]?.value;
        const curveName = data.seriesLabel || recipeEntry?.name || 'Overall Pareto frontier';

        return (
            <ChartTooltip
                className="min-w-[240px] font-mono"
                title={
                    <div className="flex items-center justify-between gap-2 border-b border-theme-border pb-1.5 mb-1.5">
                        <span className="truncate text-xs font-semibold text-amber-800">{curveName}</span>
                    </div>
                }
            >
                <div className="space-y-1">
                    <ChartTooltipRow
                        color={data.seriesColor || CHART_STATUS.warning}
                        label={latConfig.label}
                        value={xVal != null ? latConfig.format(xVal) : 'N/A'}
                        unit={latConfig.unit}
                    />
                    <ChartTooltipRow
                        color={data.seriesColor || CHART_STATUS.warning}
                        label={tputConfig.label}
                        value={yVal != null ? tputConfig.format(yVal) : 'N/A'}
                        unit={tputConfig.unit}
                    />
                </div>
            </ChartTooltip>
        );
    }

    const isPareto = Boolean(data.isParetoOptimal ?? item.isParetoOptimal);
    const stackKey = (item.stack?.engine || 'llm-d').toLowerCase();
    const color = data.color || data.seriesColor || STACK_COLORS[stackKey] || HARDWARE_COLORS[item.hardware?.accelerator_type] || CHART_SERIES[2];

    const latVal = data.x ?? getMetricValue(item, latencyMetric);
    const tputVal = data.y ?? getMetricValue(item, throughputMetric);

    const concurrency = sweepPt?.concurrency ?? data.concurrency ?? item.operatingConcurrency ?? item.workload?.concurrency ?? 32;
    const qps = sweepPt?.qps ?? item.operatingPoint?.qps;
    const costPer1M = sweepPt?.cost_per_1m ?? item.cost_analysis?.cost_per_1m_output_tokens_usd ?? item.cost_per_1m;
    const totalTps = sweepPt?.tokens_per_sec ?? item.tokens_per_sec ?? item.metrics?.total_tokens_per_sec?.p50;
    const chips = Math.max(1, item.hardware?.accelerator_count || 1);
    const perChipTps = sweepPt?.tokens_per_sec_per_chip ?? item.tokens_per_sec_per_chip ?? (totalTps != null ? totalTps / chips : null);

    const modelLabel = item.model_family || item.model_name?.split('/')?.pop() || item.model_name || 'LLM Model';
    const quant = item.stack?.quantization ? ` · ${item.stack.quantization.toUpperCase()}` : '';
    const shortHw = formatShortHardware(item);
    const statusKey = item.missesSlo
        ? 'misses_slo'
        : item.well_lit_path
            ? 'well_lit_path'
            : item.verification_status || 'verified';

    return (
        <ChartTooltip
            className="min-w-[270px] font-mono"
            title={
                <div className="flex items-center justify-between gap-2 border-b border-theme-border pb-1.5 mb-1.5">
                    <span className="truncate text-xs font-semibold text-theme-text" title={`${modelLabel} · ${shortHw}`}>
                        {modelLabel}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <StatusChip status={statusKey} size="xs" />
                        {isPareto && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 text-tiny font-semibold border border-amber-200 shrink-0">
                                Frontier
                            </span>
                        )}
                    </div>
                </div>
            }
        >
            <div className="text-tiny text-zinc-600 mb-2 font-sans flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2 font-mono">
                    <span className="font-semibold text-zinc-900 truncate">{shortHw}</span>
                    <span className="text-accent-700 shrink-0">
                        {engineLabel(item.stack?.engine)} TP{item.stack?.tensor_parallel_size || 1}{quant}
                    </span>
                </div>
                <div className="text-tiny text-zinc-600 truncate">
                    {item.recipe_name}
                </div>
            </div>

            <div className="space-y-1">
                <ChartTooltipRow
                    color={color}
                    label="Operating point"
                    value={`${concurrency} concurrency${qps ? ` · ${qps} QPS` : ''}`}
                />
                <ChartTooltipRow
                    color={color}
                    label={latConfig.label}
                    value={latVal != null && !isNaN(latVal) ? latConfig.format(latVal) : 'N/A'}
                    unit={latConfig.unit}
                />
                <ChartTooltipRow
                    color={color}
                    label={tputConfig.label}
                    value={tputVal != null && !isNaN(tputVal) ? tputConfig.format(tputVal) : 'N/A'}
                    unit={tputConfig.unit}
                />
                {throughputMetric !== 'tokens_per_sec_per_chip' && perChipTps != null && (
                    <ChartTooltipRow
                        color={color}
                        label="Throughput per chip"
                        value={Math.round(perChipTps).toLocaleString()}
                        unit=" tok/s/chip"
                    />
                )}
                {throughputMetric !== 'tokens_per_sec' && totalTps != null && (
                    <ChartTooltipRow
                        color={color}
                        label={`Total across ${chips} ${chips === 1 ? 'chip' : 'chips'}`}
                        value={Math.round(totalTps).toLocaleString()}
                        unit=" tok/s"
                    />
                )}
                {costPer1M != null && (
                    <ChartTooltipRow
                        color={color}
                        label="Cost / 1M tokens"
                        value={`$${Number(costPer1M).toFixed(3)}`}
                    />
                )}
            </div>
        </ChartTooltip>
    );
};

function escapeXml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export default function ParetoCurveChart({
    dataset,
    isComparableScope = true,
    scopeLabel = '',
    curveGroupMode: controlledCurveMode,
    onCurveGroupModeChange,
    latencyMetric: initialLatencyMetric = 'ttft_p50',
    onLatencyMetricChange,
    throughputMetric: initialThroughputMetric = 'tokens_per_sec_per_chip',
    onThroughputMetricChange,
    scaleMode: controlledScaleMode,
    onScaleModeChange,
    maxTtftSla = null,
    maxTpotSla = null,
    slaPercentile = 'p90',
    onSelectRecipe,
    selectedRecipe
}) {
    const [showChartControls, setShowChartControls] = useState(false);
    const [internalCurveMode, setInternalCurveMode] = useState('stack');
    const [internalScaleMode, setInternalScaleMode] = useState('linear');
    const [internalLatencyMetric, setInternalLatencyMetric] = useState(initialLatencyMetric);
    const [internalThroughputMetric, setInternalThroughputMetric] = useState(initialThroughputMetric);

    const curveGroupMode = controlledCurveMode ?? internalCurveMode;
    const scaleMode = controlledScaleMode ?? internalScaleMode;
    const latencyMetric = onLatencyMetricChange ? initialLatencyMetric : internalLatencyMetric;
    const throughputMetric = onThroughputMetricChange ? initialThroughputMetric : internalThroughputMetric;

    const handleCurveGroupModeChange = (val) => {
        if (!isComparableScope) return;
        setInternalCurveMode(val);
        if (onCurveGroupModeChange) onCurveGroupModeChange(val);
    };

    const handleScaleModeChange = (val) => {
        setInternalScaleMode(val);
        if (onScaleModeChange) onScaleModeChange(val);
    };

    const handleLatencyMetricChange = (val) => {
        setInternalLatencyMetric(val);
        if (onLatencyMetricChange) onLatencyMetricChange(val);
    };

    const handleThroughputMetricChange = (val) => {
        setInternalThroughputMetric(val);
        if (onThroughputMetricChange) onThroughputMetricChange(val);
    };

    const useLogScale = scaleMode === 'log';
    const chartContainerRef = useRef(null);

    const activeLatConfig = X_AXIS_CONFIGS[latencyMetric] || X_AXIS_CONFIGS.ttft_p50;
    const activeTputConfig = THROUGHPUT_CONFIGS[throughputMetric] || THROUGHPUT_CONFIGS.tokens_per_sec_per_chip;
    const xDirection = activeLatConfig.direction || 'min';

    const chartTheme = getChartTheme();

    // Global frontier for the plotted operating points on the chosen axes
    const frontier = useMemo(
        () => (isComparableScope
            ? computeParetoFrontier(dataset || [], latencyMetric, throughputMetric, xDirection, 'max')
            : []),
        [dataset, isComparableScope, latencyMetric, throughputMetric, xDirection]
    );

    // Prepare primary operating-point scatter markers
    const chartData = useMemo(() => {
        return (dataset || []).map((item, index) => {
            const x = getMetricValue(item, latencyMetric);
            const y = getMetricValue(item, throughputMetric);
            const accId = item.hardware?.accelerator_type || 'other';
            const stackId = (item.stack?.engine || 'llm-d').toLowerCase();
            const color = curveGroupMode === 'hardware'
                ? (HARDWARE_COLORS[accId] || chartTheme.muted)
                : (STACK_COLORS[stackId] || chartTheme.muted);

            return {
                x,
                y,
                z: Math.max(100, (item.hardware?.accelerator_count || 1) * 30),
                color,
                shape: getStackShape(stackId),
                stackId,
                concurrency: item.operatingConcurrency ?? item.workload?.concurrency ?? 32,
                isParetoOptimal: Boolean(isComparableScope && frontier[index]?.isParetoOptimal && !item.missesSlo),
                item
            };
        });
    }, [dataset, latencyMetric, throughputMetric, curveGroupMode, isComparableScope, frontier, chartTheme.muted]);

    // Build concurrency sweep curves for every run in scope + optional overall Pareto frontier
    const overlaidSeries = useMemo(() => {
        const items = dataset || [];
        if (items.length === 0 || !isComparableScope) return [];

        const sweepSeriesList = [];
        const allSweepNodes = [];

        items.forEach((item) => {
            const accId = item.hardware?.accelerator_type || 'other';
            const stackId = (item.stack?.engine || 'llm-d').toLowerCase();
            const color = curveGroupMode === 'hardware'
                ? (HARDWARE_COLORS[accId] || chartTheme.muted)
                : (STACK_COLORS[stackId] || chartTheme.muted);
            const shape = getStackShape(stackId);
            const sweepPoints = Array.isArray(item.sweep_points) ? item.sweep_points : [];

            const points = sweepPoints
                .map((pt) => {
                    const xVal = getSweepPointMetric(pt, latencyMetric);
                    const yVal = getSweepPointMetric(pt, throughputMetric);
                    if (!Number.isFinite(xVal) || !Number.isFinite(yVal) || xVal <= 0 || yVal <= 0) return null;
                    const node = {
                        x: xVal,
                        y: yVal,
                        concurrency: pt.concurrency,
                        qps: pt.qps,
                        seriesLabel: `${engineLabel(stackId)} · ${formatShortHardware(item)}`,
                        seriesColor: color,
                        color,
                        shape,
                        recipeName: item.recipe_name,
                        item,
                        sweepPoint: pt
                    };
                    allSweepNodes.push(node);
                    return node;
                })
                .filter(Boolean)
                .sort((a, b) => a.x - b.x);

            if (points.length >= 2) {
                sweepSeriesList.push({
                    key: `sweep-${item.id}`,
                    recipeId: item.id,
                    label: `${engineLabel(stackId)} (${formatShortHardware(item)})`,
                    color,
                    shape,
                    points,
                    missesSlo: Boolean(item.missesSlo),
                    isFaint: curveGroupMode === 'overall'
                });
            }
        });

        if (curveGroupMode === 'overall' && allSweepNodes.length >= 2) {
            // Compute global Pareto frontier across all concurrency sweep points
            const sortedNodes = [...allSweepNodes].sort((a, b) =>
                xDirection === 'min' ? a.x - b.x : b.x - a.x
            );
            const frontierPts = [];
            let bestY = -Infinity;
            sortedNodes.forEach((pt) => {
                if (pt.y > bestY) {
                    frontierPts.push({
                        ...pt,
                        seriesLabel: 'Overall Pareto frontier',
                        seriesColor: CHART_STATUS.warning
                    });
                    bestY = pt.y;
                }
            });
            const orderedFrontier = frontierPts.sort((a, b) => a.x - b.x);
            if (orderedFrontier.length >= 2) {
                return [
                    ...sweepSeriesList,
                    {
                        key: 'overall-frontier',
                        label: 'Overall Pareto frontier',
                        color: CHART_STATUS.warning,
                        points: orderedFrontier,
                        isFrontierBoundary: true
                    }
                ];
            }
        }

        return sweepSeriesList;
    }, [dataset, isComparableScope, curveGroupMode, latencyMetric, throughputMetric, xDirection, chartTheme.muted]);

    // Dynamically discover stacks actually present in dataset
    const presentStacks = useMemo(() => {
        const seen = new Set();
        (dataset || []).forEach((item) => {
            const key = (item.stack?.engine || 'llm-d').toLowerCase();
            seen.add(key);
        });
        const ordered = STACK_ORDER.filter((k) => seen.has(k));
        seen.forEach((k) => {
            if (!ordered.includes(k)) ordered.push(k);
        });
        return ordered.map((key) => ({
            key,
            label: engineLabel(key),
            color: STACK_COLORS[key] || chartTheme.muted,
            resolvedColor: STACK_SERIES_INDEX[key] != null
                ? resolveSeriesColor(STACK_SERIES_INDEX[key], 'light')
                : chartTheme.muted,
            shape: getStackShape(key),
        }));
    }, [dataset, chartTheme.muted]);

    // Dynamically discover hardware present when in 'hardware' curve mode
    const presentHardware = useMemo(() => {
        if (curveGroupMode !== 'hardware') return [];
        const seen = new Set();
        (dataset || []).forEach((item) => {
            const acc = item.hardware?.accelerator_type;
            if (acc) seen.add(acc);
        });
        return Array.from(seen).map((acc) => ({
            key: acc,
            label: HARDWARE_LABELS[acc] || acc,
            color: HARDWARE_COLORS[acc] || chartTheme.muted,
        }));
    }, [dataset, curveGroupMode, chartTheme.muted]);

    // Active SLO reference line position when X-axis matches an active latency SLO
    const activeSloLine = useMemo(() => {
        if (latencyMetric === 'ttft_p50' && maxTtftSla !== null && maxTtftSla > 0) {
            return { x: maxTtftSla, label: `SLO TTFT ≤ ${maxTtftSla}ms (${String(slaPercentile).toUpperCase()})` };
        }
        if (latencyMetric === 'itl_p50' && maxTpotSla !== null && maxTpotSla > 0) {
            return { x: maxTpotSla, label: `SLO TPOT ≤ ${maxTpotSla}ms (${String(slaPercentile).toUpperCase()})` };
        }
        return null;
    }, [latencyMetric, maxTtftSla, maxTpotSla, slaPercentile]);

    // Collect all plotted coordinates (both sweep curves and operating points) for clean axis domain
    const allXValues = useMemo(() => {
        const vals = chartData.map((d) => d.x);
        overlaidSeries.forEach((s) => s.points.forEach((p) => vals.push(p.x)));
        if (activeSloLine) vals.push(activeSloLine.x);
        return vals;
    }, [chartData, overlaidSeries, activeSloLine]);

    const allYValues = useMemo(() => {
        const vals = chartData.map((d) => d.y);
        overlaidSeries.forEach((s) => s.points.forEach((p) => vals.push(p.y)));
        return vals;
    }, [chartData, overlaidSeries]);

    const xAxis = niceAxis(allXValues);
    const yAxis = niceAxis(allYValues);

    const qualifyingItems = (dataset || []).filter((d) => !d.missesSlo);
    const activeItem = selectedRecipe || qualifyingItems[0] || dataset?.[0] || null;

    const handleExportSVG = () => {
        const chartSvg = chartContainerRef.current?.querySelector('svg.recharts-surface')
            || chartContainerRef.current?.querySelector('svg');
        if (!chartSvg) return;

        const bbox = chartSvg.getBoundingClientRect();
        const plotWidth = Math.max(720, Math.round(bbox.width || 860));
        const plotHeight = Math.max(320, Math.round(bbox.height || 360));
        const headerHeight = 82;
        const footerHeight = 40;
        const totalWidth = plotWidth;
        const totalHeight = headerHeight + plotHeight + footerHeight;

        const serializedPlot = new XMLSerializer().serializeToString(chartSvg);
        const innerPlot = serializedPlot
            .replace(/^<svg[^>]*>/i, '')
            .replace(/<\/svg>\s*$/i, '');

        const subtitleParts = [
            scopeLabel || 'All models & workloads',
            `${activeTputConfig.shortLabel} vs. ${activeLatConfig.shortLabel}`,
            `Scale: ${scaleMode === 'log' ? 'Logarithmic' : 'Linear'}`
        ].filter(Boolean);

        let legendCursorX = 24;
        const legendItemsSvg = presentStacks.map((st) => {
            const x = legendCursorX;
            const textWidth = st.label.length * 7 + 36;
            legendCursorX += textWidth;
            const cy = 64;
            const cx = x + 10;
            const c = st.resolvedColor || st.color;
            const line = `<line x1="${x}" y1="${cy}" x2="${x + 20}" y2="${cy}" stroke="${c}" stroke-width="2" />`;
            let marker = `<circle cx="${cx}" cy="${cy}" r="4" fill="${c}" />`;
            if (st.shape === 'diamond') {
                marker = `<polygon points="${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}" fill="${c}" />`;
            } else if (st.shape === 'triangle') {
                marker = `<polygon points="${cx},${cy - 4.8} ${cx + 4.6},${cy + 4} ${cx - 4.6},${cy + 4}" fill="${c}" />`;
            } else if (st.shape === 'square') {
                marker = `<rect x="${cx - 3.8}" y="${cy - 3.8}" width="7.6" height="7.6" rx="1.2" fill="${c}" />`;
            }
            return `<g>${line}${marker}<text x="${x + 25}" y="${cy + 4}" font-family="Geist, system-ui, sans-serif" font-size="11" font-weight="500" fill="${chartTheme.tick}">${escapeXml(st.label)}</text></g>`;
        }).join('');

        const hasSampleRuns = Boolean(dataset?.some((d) => d.is_sample));
        const footerText = hasSampleRuns
            ? 'Includes reference benchmark curves · llm-d Prism'
            : 'llm-d Prism · Benchmark Report v0.2';

        const standaloneSvg = [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">`,
            `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${chartTheme.surface}" rx="16" />`,
            `<g transform="translate(24, 28)">`,
            `<text x="0" y="0" font-family="Bricolage Grotesque, Geist, system-ui, sans-serif" font-size="16" font-weight="700" fill="${chartTheme.label}">Throughput vs. latency trade-off curves</text>`,
            `<text x="0" y="18" font-family="Geist, system-ui, sans-serif" font-size="11" fill="${chartTheme.muted}">${escapeXml(subtitleParts.join(' · '))}</text>`,
            `</g>`,
            `<g>${legendItemsSvg}</g>`,
            `<line x1="24" y1="${headerHeight - 4}" x2="${totalWidth - 24}" y2="${headerHeight - 4}" stroke="${chartTheme.grid}" stroke-width="1" />`,
            `<g transform="translate(0, ${headerHeight})">${innerPlot}</g>`,
            `<line x1="24" y1="${headerHeight + plotHeight + 6}" x2="${totalWidth - 24}" y2="${headerHeight + plotHeight + 6}" stroke="${chartTheme.grid}" stroke-width="1" />`,
            `<text x="24" y="${totalHeight - 14}" font-family="Geist Mono, monospace" font-size="10" fill="${chartTheme.muted}">${escapeXml(footerText)}</text>`,
            `</svg>`
        ].join('\n');

        const svgBlob = new Blob([standaloneSvg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const link = document.createElement('a');
        link.href = svgUrl;
        link.download = `prism-pareto-frontier-${latencyMetric}-vs-${throughputMetric}.svg`;
        link.click();
        URL.revokeObjectURL(svgUrl);
    };

    return (
        <ChartContainer
            title={`Throughput vs. latency (${activeTputConfig.shortLabel.toLowerCase()} vs. ${activeLatConfig.shortLabel})`}
            subtitle={
                !isComparableScope
                    ? 'Select a single model above to overlay concurrency curves'
                    : undefined
            }
            showFilters={showChartControls}
            onToggleFilters={() => setShowChartControls((prev) => !prev)}
            filterToggleLabel="Axes & scale"
            actions={
                <button
                    type="button"
                    onClick={handleExportSVG}
                    title="Export chart as SVG"
                    className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
                >
                    <Download className="w-3.5 h-3.5 text-zinc-600" />
                    <span>Export SVG</span>
                </button>
            }
            filters={
                <ChartFilterRow>
                    <div
                        className={cn(!isComparableScope && 'opacity-50')}
                        title={!isComparableScope ? 'Select a single model to overlay concurrency curves' : undefined}
                    >
                        <ChartFilterGroup label="Curves">
                            <ToggleGroup
                                size="xs"
                                value={curveGroupMode}
                                onChange={handleCurveGroupModeChange}
                                options={[
                                    { value: 'stack', label: 'By stack' },
                                    { value: 'hardware', label: 'By hardware' },
                                    { value: 'overall', label: 'Overall frontier' },
                                ]}
                            />
                        </ChartFilterGroup>
                    </div>

                    <ChartFilterGroup label="X-Axis">
                        <ToggleGroup
                            size="xs"
                            value={latencyMetric}
                            onChange={handleLatencyMetricChange}
                            options={[
                                { value: 'ttft_p50', label: 'TTFT' },
                                { value: 'itl_p50', label: 'TPOT' },
                                { value: 'output_tokens_per_sec', label: 'Interactivity' },
                                { value: 'workload.concurrency', label: 'Concurrency' },
                            ]}
                        />
                    </ChartFilterGroup>

                    <ChartFilterGroup label="Y-Axis">
                        <ToggleGroup
                            size="xs"
                            value={throughputMetric}
                            onChange={handleThroughputMetricChange}
                            options={[
                                { value: 'tokens_per_sec_per_chip', label: 'Tok/s/chip' },
                                { value: 'tokens_per_sec', label: 'Total tok/s' },
                                { value: 'tokens_per_dollar', label: 'Tok/$' },
                            ]}
                        />
                    </ChartFilterGroup>

                    <ChartFilterGroup label="Scale" className="ml-auto">
                        <ToggleGroup
                            size="xs"
                            value={scaleMode}
                            onChange={handleScaleModeChange}
                            options={[
                                { value: 'linear', label: 'Linear' },
                                { value: 'log', label: 'Log' },
                            ]}
                        />
                    </ChartFilterGroup>
                </ChartFilterRow>
            }
            footer={
                <div className="flex flex-wrap items-center justify-between gap-4 text-xs">
                    <div className="flex items-center gap-5 flex-wrap">
                        {curveGroupMode !== 'hardware' && presentStacks.map((st) => (
                            <span key={st.key} className="inline-flex items-center gap-2 text-micro text-zinc-700 font-medium">
                                <SeriesLineSwatch
                                    shape={st.shape}
                                    color={st.color}
                                    lineStyle="solid"
                                />
                                <span>{st.label}</span>
                            </span>
                        ))}
                        {presentHardware.map((hw) => (
                            <span key={hw.key} className="inline-flex items-center gap-2 text-micro text-zinc-700 font-medium">
                                <SeriesLineSwatch
                                    shape="circle"
                                    color={hw.color}
                                    lineStyle="solid"
                                />
                                <span>{hw.label}</span>
                            </span>
                        ))}
                        {isComparableScope && curveGroupMode === 'overall' && (
                            <span className="inline-flex items-center gap-2 text-micro text-zinc-700 font-medium">
                                <SeriesLineSwatch
                                    shape="circle"
                                    color={CHART_STATUS.warning}
                                    lineStyle="dashed"
                                />
                                <span>Overall Pareto frontier</span>
                            </span>
                        )}
                        {isComparableScope && (
                            <span className="inline-flex items-center gap-1.5 text-micro text-zinc-700 font-medium">
                                <span
                                    className="w-3 h-3 rounded-full shrink-0 bg-white"
                                    style={{ boxShadow: `inset 0 0 0 1.75px ${CHART_STATUS.warning}` }}
                                    aria-hidden="true"
                                />
                                <span>Frontier operating point</span>
                            </span>
                        )}
                        <span className="inline-flex items-center gap-1.5 text-micro text-zinc-700 font-medium">
                            <span
                                className="w-3 h-3 rounded-full shrink-0 bg-white"
                                style={{ boxShadow: `inset 0 0 0 1.75px ${chartTheme.accent}` }}
                                aria-hidden="true"
                            />
                            <span>Selected recipe</span>
                        </span>
                    </div>
                </div>
            }
        >
            <div ref={chartContainerRef} className="w-full relative overflow-visible flex items-center justify-center min-h-[360px] select-none">
                {chartData.length === 0 ? (
                    <EmptyState
                        icon={<FilterX className="w-9 h-9 text-zinc-400 mx-auto" />}
                        title="No benchmark points to plot"
                        message="No recipes match the active combination of filters. Try adjusting your model family, hardware, or SLO constraints."
                    />
                ) : (
                    <ResponsiveContainer width="100%" height={360} minWidth={0}>
                        <ComposedChart
                            margin={{ top: 15, right: 30, left: 60, bottom: 45 }}
                        >
                            <CartesianGrid {...gridProps()} />
                            <ChartXAxis
                                dataKey="x"
                                type="number"
                                name={activeLatConfig.shortLabel}
                                scale={useLogScale ? 'log' : 'auto'}
                                domain={useLogScale ? ['dataMin - 2', 'dataMax + 10'] : xAxis.domain}
                                ticks={useLogScale ? undefined : xAxis.ticks}
                                label={activeLatConfig.axisLabel}
                            />
                            <ChartYAxis
                                dataKey="y"
                                type="number"
                                name={activeTputConfig.shortLabel}
                                scale={useLogScale ? 'log' : 'auto'}
                                domain={useLogScale ? padLogDomain : yAxis.domain}
                                ticks={useLogScale ? undefined : yAxis.ticks}
                                tickFormatter={compactTick}
                                label={activeTputConfig.axisLabel}
                            />
                            <ZAxis dataKey="z" range={[80, 260]} />
                            <Tooltip
                                {...tooltipProps()}
                                cursor={cursorProps()}
                                content={
                                    <ParetoChartTooltip
                                        latencyMetric={latencyMetric}
                                        throughputMetric={throughputMetric}
                                    />
                                }
                            />

                            {/* Active Latency SLO Boundary Line */}
                            {activeSloLine && (
                                <ReferenceLine
                                    x={activeSloLine.x}
                                    stroke={CHART_STATUS.danger}
                                    strokeDasharray="4 4"
                                    strokeWidth={1.75}
                                    label={{
                                        value: activeSloLine.label,
                                        position: 'insideTopRight',
                                        fill: CHART_STATUS.danger,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        fontFamily: 'Geist Mono, monospace',
                                    }}
                                />
                            )}

                            {/* Overlaid Concurrency Sweep Curves & Pareto Boundary */}
                            {overlaidSeries.map((series) => {
                                const isSelectedCurve = Boolean(activeItem?.id && series.recipeId === activeItem.id);
                                return (
                                    <Line
                                        key={series.key}
                                        data={series.points}
                                        type="monotone"
                                        dataKey="y"
                                        stroke={series.color}
                                        strokeWidth={series.isFrontierBoundary ? 2.5 : isSelectedCurve ? 2.6 : 1.9}
                                        strokeOpacity={series.isFaint ? 0.38 : series.missesSlo ? 0.35 : isSelectedCurve ? 1 : 0.82}
                                        strokeDasharray={series.isFrontierBoundary ? '5 3' : series.missesSlo ? '3 3' : undefined}
                                        dot={
                                            series.isFrontierBoundary
                                                ? false
                                                : {
                                                    r: 2.5,
                                                    fill: series.color,
                                                    stroke: chartTheme.surface,
                                                    strokeWidth: 1,
                                                    fillOpacity: series.isFaint ? 0.45 : series.missesSlo ? 0.35 : 0.85,
                                                }
                                        }
                                        activeDot={{ r: 5, fill: series.color, stroke: chartTheme.surface, strokeWidth: 1.5 }}
                                        isAnimationActive={false}
                                        name={series.label}
                                    />
                                );
                            })}

                            {/* Primary Operating Point Scatter Markers */}
                            <Scatter
                                name="Active SLO operating points"
                                data={chartData}
                                isAnimationActive={false}
                                shape={
                                    <CustomScatterDot
                                        activeItemId={activeItem?.id}
                                        chartTheme={chartTheme}
                                        onSelectRecipe={onSelectRecipe}
                                    />
                                }
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                )}
            </div>
        </ChartContainer>
    );
}
