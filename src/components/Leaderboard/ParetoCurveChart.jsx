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
import { Download, FilterX } from 'lucide-react';
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
import { computeParetoFrontier } from '../../utils/paretoFrontier.js';
import {
    DEFAULT_SLO,
    describeSlo,
    engineLabel,
    formatHardwareShort,
    formatLimitMs,
    latencyFor,
    provenanceStatus,
} from '../../utils/leaderboardFacets.js';

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

// Accelerators outside the catalog keep their recorded name as their series.
const hardwareKeyOf = (item) => {
    const acc = item?.hardware?.accelerator_type || 'other';
    return acc === 'other' ? item?.hardware?.accelerator_label || 'other' : acc;
};

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
const UNKNOWN_STACK = 'unknown';
const stackKeyOf = (item) => String(item?.stack?.engine || UNKNOWN_STACK).toLowerCase();

function getStackShape(stackKey) {
    const key = String(stackKey || '').toLowerCase();
    if (key.includes('llm-d') || key === 'llmd') return 'diamond';
    if (key.includes('vllm')) return 'circle';
    if (key.includes('sglang')) return 'triangle';
    return 'square';
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const perUserRate = (tpotMs) => (isNum(tpotMs) && tpotMs > 0 ? 1000 / tpotMs : null);

// Axis ids stay stable in URLs; what they read follows the active percentile.
function xAxisConfig(metricId, pct) {
    const P = String(pct).toUpperCase();
    switch (metricId) {
        case 'itl_p50':
            return {
                label: `TPOT (${P})`,
                shortLabel: `TPOT ${P}`,
                axisLabel: `Time per output token (TPOT ${P}, ms — lower is better)`,
                unit: ' ms',
                direction: 'min',
                format: (v) => Number(v).toFixed(1),
                ofItem: (item) => latencyFor(item, 'itl', pct),
                ofPoint: (pt) => pt?.[`itl_${pct}`] ?? null,
            };
        case 'output_tokens_per_sec':
            return {
                label: `Interactivity (${P})`,
                shortLabel: `Interactivity ${P}`,
                axisLabel: `Interactivity: tokens per second each user sees (1000 ÷ TPOT ${P}, higher is better)`,
                unit: ' tok/s/user',
                direction: 'max',
                format: (v) => Number(v).toFixed(1),
                ofItem: (item) => perUserRate(latencyFor(item, 'itl', pct)),
                ofPoint: (pt) => perUserRate(pt?.[`itl_${pct}`]),
            };
        case 'workload.concurrency':
            return {
                label: 'Concurrency',
                shortLabel: 'Concurrency',
                axisLabel: 'Concurrent requests',
                unit: ' concurrent',
                direction: 'max',
                format: (v) => Math.round(v).toLocaleString(),
                ofItem: (item) => item?.operatingConcurrency ?? null,
                ofPoint: (pt) => pt?.concurrency ?? null,
            };
        case 'ttft_p50':
        default:
            return {
                label: `TTFT (${P})`,
                shortLabel: `TTFT ${P}`,
                axisLabel: `Time to first token (TTFT ${P}, ms — lower is better)`,
                unit: ' ms',
                direction: 'min',
                format: (v) => Number(v).toFixed(1),
                ofItem: (item) => latencyFor(item, 'ttft', pct),
                ofPoint: (pt) => pt?.[`ttft_${pct}`] ?? null,
            };
    }
}

const THROUGHPUT_CONFIGS = {
    tokens_per_sec_per_chip: {
        label: 'Throughput per chip',
        shortLabel: 'Throughput per chip',
        axisLabel: 'Throughput per chip (total tokens/sec/chip)',
        unit: ' tok/s/chip',
        format: (v) => Math.round(v).toLocaleString()
    },
    tokens_per_sec: {
        label: 'Total throughput',
        shortLabel: 'Aggregate throughput',
        axisLabel: 'Throughput (total tokens/sec)',
        unit: ' tok/s',
        format: (v) => Math.round(v).toLocaleString()
    },
    tokens_per_dollar: {
        label: 'Tokens / dollar',
        shortLabel: 'Tokens per dollar',
        axisLabel: 'Tokens per dollar',
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
    const shape = payload.shape || getStackShape(stackKeyOf(item));
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
    latConfig,
    throughputMetric = 'tokens_per_sec_per_chip'
}) => {
    if (!active || !payload || !payload.length || !latConfig) return null;

    const recipeEntry = payload.find(p => p?.payload?.item?.recipe_name || p?.payload?.recipe_name) || payload[0];
    const data = recipeEntry?.payload || {};
    const item = data.item || data;
    const sweepPt = data.sweepPoint || null;

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

    const isPareto = Boolean(data.isParetoOptimal);
    const color = data.color || data.seriesColor || STACK_COLORS[stackKeyOf(item)] || CHART_SERIES[2];
    const point = sweepPt || item.operatingPoint || {};

    const latVal = data.x;
    const tputVal = data.y;

    const concurrency = point.concurrency ?? item.operatingConcurrency ?? null;
    const qps = point.qps ?? null;
    const costPer1M = point.cost_per_1m ?? item.cost_analysis?.cost_per_1m_output_tokens_usd ?? null;
    const totalTps = point.tokens_per_sec ?? item.tokens_per_sec ?? null;
    const chips = Math.max(1, item.hardware?.accelerator_count || 1);
    const perChipTps = point.tokens_per_sec_per_chip ?? item.tokens_per_sec_per_chip ?? null;
    const illustrative = Boolean(point.illustrative || item.is_sample);

    const modelLabel = item.model_family || item.model_name?.split('/')?.pop() || item.model_name || 'Model';
    const quant = item.stack?.quantization ? ` · ${item.stack.quantization.toUpperCase()}` : '';
    const tp = item.stack?.tensor_parallel_size ? ` TP${item.stack.tensor_parallel_size}` : '';
    const shortHw = formatHardwareShort(item);

    return (
        <ChartTooltip
            className="min-w-[270px] font-mono"
            title={
                <div className="flex items-center justify-between gap-2 border-b border-theme-border pb-1.5 mb-1.5">
                    <span className="truncate text-xs font-semibold text-theme-text" title={`${modelLabel} · ${shortHw}`}>
                        {modelLabel}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <StatusChip status={provenanceStatus(item)} size="xs" />
                        {item.missesSlo && !sweepPt && <StatusChip status="misses_slo" size="xs" />}
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
                        {engineLabel(item.stack?.engine)}{tp}{quant}
                    </span>
                </div>
                <div className="text-tiny text-zinc-600 truncate">
                    {item.recipe_name}
                </div>
            </div>

            <div className="space-y-1">
                <ChartTooltipRow
                    color={color}
                    label={sweepPt ? 'Load point' : 'Operating point'}
                    value={concurrency != null ? `${concurrency} concurrent${qps ? ` · ${qps} QPS` : ''}` : 'Not recorded'}
                />
                <ChartTooltipRow
                    color={color}
                    label={latConfig.label}
                    value={isNum(latVal) ? latConfig.format(latVal) : 'Not recorded'}
                    unit={isNum(latVal) ? latConfig.unit : ''}
                />
                <ChartTooltipRow
                    color={color}
                    label={tputConfig.label}
                    value={isNum(tputVal) ? tputConfig.format(tputVal) : 'Not recorded'}
                    unit={isNum(tputVal) ? tputConfig.unit : ''}
                />
                {throughputMetric !== 'tokens_per_sec_per_chip' && isNum(perChipTps) && (
                    <ChartTooltipRow
                        color={color}
                        label="Throughput per chip"
                        value={Math.round(perChipTps).toLocaleString()}
                        unit=" tok/s/chip"
                    />
                )}
                {throughputMetric !== 'tokens_per_sec' && isNum(totalTps) && (
                    <ChartTooltipRow
                        color={color}
                        label={`Total across ${chips} ${chips === 1 ? 'chip' : 'chips'}`}
                        value={Math.round(totalTps).toLocaleString()}
                        unit=" tok/s"
                    />
                )}
                <ChartTooltipRow
                    color={color}
                    label="Cost / 1M tokens"
                    value={isNum(costPer1M) ? `$${Number(costPer1M).toFixed(3)}` : 'No list price'}
                />
            </div>
            {(illustrative || point.total_estimated) && (
                <div className="mt-2 pt-1.5 border-t border-theme-border text-tiny font-sans text-zinc-600">
                    {illustrative
                        ? 'Illustrative sample: not a measured run.'
                        : 'Total throughput estimated from the output rate and workload shape.'}
                </div>
            )}
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
    maxTtftSla = DEFAULT_SLO.ttft,
    maxTpotSla = DEFAULT_SLO.tpot,
    slaPercentile = DEFAULT_SLO.percentile,
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

    const activeLatConfig = useMemo(() => xAxisConfig(latencyMetric, slaPercentile), [latencyMetric, slaPercentile]);
    const activeTputConfig = THROUGHPUT_CONFIGS[throughputMetric] || THROUGHPUT_CONFIGS.tokens_per_sec_per_chip;
    const xDirection = activeLatConfig.direction || 'min';

    const chartTheme = getChartTheme();

    // Global frontier for the plotted operating points on the chosen axes
    const frontier = useMemo(
        () => (isComparableScope
            ? computeParetoFrontier(
                dataset || [],
                (item) => activeLatConfig.ofItem(item) ?? 0,
                (item) => item?.[throughputMetric] ?? 0,
                xDirection,
                'max'
            )
            : []),
        [dataset, isComparableScope, activeLatConfig, throughputMetric, xDirection]
    );

    // Prepare primary operating-point scatter markers (rows with no value on an axis aren't plotted)
    const chartData = useMemo(() => {
        return (dataset || []).flatMap((item, index) => {
            const x = activeLatConfig.ofItem(item);
            const y = item?.[throughputMetric] ?? null;
            if (!isNum(x) || !isNum(y)) return [];
            return [{
                x,
                y,
                z: Math.max(100, (item.hardware?.accelerator_count || 1) * 30),
                color: curveGroupMode === 'hardware'
                    ? (HARDWARE_COLORS[hardwareKeyOf(item)] || chartTheme.muted)
                    : (STACK_COLORS[stackKeyOf(item)] || chartTheme.muted),
                shape: getStackShape(stackKeyOf(item)),
                stackId: stackKeyOf(item),
                isParetoOptimal: Boolean(isComparableScope && frontier[index]?.isParetoOptimal && !item.missesSlo),
                item
            }];
        });
    }, [dataset, activeLatConfig, throughputMetric, curveGroupMode, isComparableScope, frontier, chartTheme.muted]);

    const unplottedCount = (dataset || []).length - chartData.length;

    // Build load-sweep curves for every run in scope + optional overall Pareto frontier.
    // Overloaded points are left off: they're kept for the record, never ranked or drawn.
    const overlaidSeries = useMemo(() => {
        const items = dataset || [];
        if (items.length === 0 || !isComparableScope) return [];

        const sweepSeriesList = [];
        const allSweepNodes = [];

        items.forEach((item) => {
            const stackId = stackKeyOf(item);
            const color = curveGroupMode === 'hardware'
                ? (HARDWARE_COLORS[hardwareKeyOf(item)] || chartTheme.muted)
                : (STACK_COLORS[stackId] || chartTheme.muted);
            const shape = getStackShape(stackId);
            const sweepPoints = Array.isArray(item.sweep_points) ? item.sweep_points : [];
            const illustrative = sweepPoints.some((pt) => pt.illustrative);

            const points = sweepPoints
                .filter((pt) => !pt.overloaded)
                .map((pt) => {
                    const xVal = activeLatConfig.ofPoint(pt);
                    const yVal = pt?.[throughputMetric] ?? null;
                    if (!isNum(xVal) || !isNum(yVal) || xVal <= 0 || yVal <= 0) return null;
                    const node = {
                        x: xVal,
                        y: yVal,
                        concurrency: pt.concurrency,
                        qps: pt.qps,
                        seriesLabel: `${engineLabel(item.stack?.engine)} · ${formatHardwareShort(item)}`,
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
                    label: `${engineLabel(item.stack?.engine)} (${formatHardwareShort(item)})${illustrative ? ' · sample' : ''}`,
                    color,
                    shape,
                    points,
                    illustrative,
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
    }, [dataset, isComparableScope, curveGroupMode, activeLatConfig, throughputMetric, xDirection, chartTheme.muted]);

    const hasIllustrative = overlaidSeries.some((s) => s.illustrative);

    // Dynamically discover stacks actually present in dataset
    const presentStacks = useMemo(() => {
        const seen = new Set();
        (dataset || []).forEach((item) => seen.add(stackKeyOf(item)));
        const ordered = STACK_ORDER.filter((k) => seen.has(k));
        seen.forEach((k) => {
            if (!ordered.includes(k)) ordered.push(k);
        });
        return ordered.map((key) => ({
            key,
            label: key === UNKNOWN_STACK ? 'Stack not recorded' : engineLabel(key),
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
        const seen = new Map();
        (dataset || []).forEach((item) => {
            const key = hardwareKeyOf(item);
            if (!seen.has(key)) seen.set(key, HARDWARE_LABELS[key] || item.hardware?.accelerator_label || 'Other accelerator');
        });
        return Array.from(seen.entries()).map(([key, label]) => ({
            key,
            label,
            color: HARDWARE_COLORS[key] || chartTheme.muted,
        }));
    }, [dataset, curveGroupMode, chartTheme.muted]);

    // The SLO line, on the axis it belongs to. Since the X axis reads the
    // SLO's own percentile, a point left of the line really is inside it.
    const sloLine = useMemo(() => {
        const P = String(slaPercentile).toUpperCase();
        if (latencyMetric === 'ttft_p50' && isNum(maxTtftSla) && maxTtftSla > 0) {
            return { x: maxTtftSla, label: `SLO TTFT ${P} ≤ ${formatLimitMs(maxTtftSla)}` };
        }
        if (latencyMetric === 'itl_p50' && isNum(maxTpotSla) && maxTpotSla > 0) {
            return { x: maxTpotSla, label: `SLO TPOT ${P} ≤ ${formatLimitMs(maxTpotSla)}` };
        }
        if (latencyMetric === 'output_tokens_per_sec' && isNum(maxTpotSla) && maxTpotSla > 0) {
            return { x: 1000 / maxTpotSla, label: `SLO ≥ ${(1000 / maxTpotSla).toFixed(0)} tok/s/user` };
        }
        return null;
    }, [latencyMetric, maxTtftSla, maxTpotSla, slaPercentile]);

    // Collect all plotted coordinates (both sweep curves and operating points) for clean axis domain
    const dataXValues = useMemo(() => {
        const vals = chartData.map((d) => d.x);
        overlaidSeries.forEach((s) => s.points.forEach((p) => vals.push(p.x)));
        return vals;
    }, [chartData, overlaidSeries]);

    // A far-off SLO (the default 2 s next to 100 ms samples) would squash every
    // point into one corner, so the line is only drawn when it's near the data.
    const dataXMax = dataXValues.length ? Math.max(...dataXValues) : 0;
    const sloOnChart = Boolean(sloLine && dataXMax > 0 && sloLine.x <= dataXMax * 1.6);
    const allXValues = sloOnChart ? [...dataXValues, sloLine.x] : dataXValues;

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
            `Ranked within ${describeSlo({ ttft: maxTtftSla, tpot: maxTpotSla, percentile: slaPercentile })}`,
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
            ? 'Includes illustrative samples (not measured runs) · llm-d Prism'
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
        link.download = `prism-pareto-frontier-${latencyMetric}-${slaPercentile}-vs-${throughputMetric}.svg`;
        link.click();
        URL.revokeObjectURL(svgUrl);
    };

    const offChartNote = sloLine && !sloOnChart && dataXMax > 0
        ? `${sloLine.label.replace(/^SLO /, 'The SLO (')}) is off the right edge of this chart.`
        : null;

    return (
        <ChartContainer
            title={`Throughput vs. latency (${activeTputConfig.shortLabel.toLowerCase()} vs. ${activeLatConfig.shortLabel})`}
            subtitle={
                !isComparableScope
                    ? 'Select a single model above to overlay load curves'
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
                        title={!isComparableScope ? 'Select a single model to overlay load curves' : undefined}
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
                        {hasIllustrative && (
                            <span className="inline-flex items-center gap-2 text-micro text-zinc-700 font-medium">
                                <SeriesLineSwatch shape="circle" color={chartTheme.muted} lineStyle="dashed" />
                                <span>Illustrative sample curve</span>
                            </span>
                        )}
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
                    {(offChartNote || unplottedCount > 0) && (
                        <span className="text-micro text-zinc-600">
                            {[
                                offChartNote,
                                unplottedCount > 0
                                    ? `${unplottedCount} ${unplottedCount === 1 ? 'run isn’t' : 'runs aren’t'} plotted: ${activeLatConfig.shortLabel} wasn’t recorded.`
                                    : null,
                            ].filter(Boolean).join(' ')}
                        </span>
                    )}
                </div>
            }
        >
            <div ref={chartContainerRef} className="w-full relative overflow-visible flex items-center justify-center min-h-[360px] select-none">
                {chartData.length === 0 ? (
                    <EmptyState
                        icon={<FilterX className="w-9 h-9 text-zinc-400 mx-auto" />}
                        title="No benchmark points to plot"
                        message={`None of these runs recorded ${activeLatConfig.shortLabel}. Try another percentile or X-axis.`}
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
                                        latConfig={activeLatConfig}
                                        throughputMetric={throughputMetric}
                                    />
                                }
                            />

                            {/* Active Latency SLO Boundary Line */}
                            {sloOnChart && (
                                <ReferenceLine
                                    x={sloLine.x}
                                    stroke={CHART_STATUS.danger}
                                    strokeDasharray="4 4"
                                    strokeWidth={1.75}
                                    label={{
                                        value: sloLine.label,
                                        position: 'insideTopRight',
                                        fill: CHART_STATUS.danger,
                                        fontSize: 11,
                                        fontWeight: 600,
                                        fontFamily: 'Geist Mono, monospace',
                                    }}
                                />
                            )}

                            {/* Overlaid load-sweep curves & Pareto boundary */}
                            {overlaidSeries.map((series) => {
                                const isSelectedCurve = Boolean(activeItem?.id && series.recipeId === activeItem.id);
                                const dashed = series.isFrontierBoundary ? '5 3' : series.illustrative ? '6 4' : series.missesSlo ? '3 3' : undefined;
                                return (
                                    <Line
                                        key={series.key}
                                        data={series.points}
                                        type="monotone"
                                        dataKey="y"
                                        stroke={series.color}
                                        strokeWidth={series.isFrontierBoundary ? 2.5 : isSelectedCurve ? 2.4 : series.illustrative ? 1.5 : 1.9}
                                        strokeOpacity={series.isFaint ? 0.38 : series.missesSlo ? 0.35 : series.illustrative && !isSelectedCurve ? 0.6 : isSelectedCurve ? 1 : 0.82}
                                        strokeDasharray={dashed}
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
                                name="Operating points at the active SLO"
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
