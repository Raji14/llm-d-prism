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
import {
    BarChart, Bar, Cell, ReferenceLine,
    ResponsiveContainer, LabelList, Tooltip,
} from 'recharts';
import {
    AlertTriangle, Share2, FileText, Download, Check, Copy, Pin,
    Cpu, HardDrive, Zap, Layers, Activity, ChevronDown, ChevronUp, ExternalLink,
    Sparkles
} from 'lucide-react';
import {
    ChartContainer, ChartTooltip, ChartTooltipRow, ChartXAxis, ChartYAxis,
    CHART_SERIES, EmptyState, ToggleGroup, Button, Badge, Modal,
    SectionLabel, FactCell, Panel, gridProps,
} from '../ui';
import { cn } from '../../utils/cn';
import { getEffectiveTp, getBucket, getRatioType, extractAcceleratorCount } from '../../utils/dashboardHelpers';

// One-bar-per-run comparison chart. Metrics are grouped into families
// (TTFT / TPOT / ITL / E2E / throughput / observability) so the user picks the family
// once and then chooses any combination of mean / p50 / p99 — selected
// stats render as side-by-side grouped bars in the same plot.

const METRICS = [
    // Throughput family — single stat each
    { id: 'output_tput', label: 'Output Tput', unit: 'tok/s', dec: 0, higher: true,
      stats: [{ id: 'mean', label: 'mean',
                fn: d => d.metrics?.output_tput ?? d.throughput }] },
    { id: 'input_tput',  label: 'Input Tput',  unit: 'tok/s', dec: 0, higher: true,
      stats: [{ id: 'mean', label: 'mean',
                fn: d => d.metrics?.input_tput }] },
    { id: 'request_rate', label: 'Request rate', unit: 'req/s', dec: 2, higher: true,
      stats: [{ id: 'mean', label: 'mean',
                fn: d => d.metrics?.request_rate ?? d.qps }] },

    // Latency family — mean / p50 / p99 sub-toggles
    { id: 'ttft', label: 'TTFT', unit: 'ms', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.ttft?.mean ?? d.ttft?.mean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.ttft?.p50  ?? d.ttft?.p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.ttft?.p99  ?? d.ttft?.p99 },
      ] },
    { id: 'tpot', label: 'TPOT', unit: 'ms', dec: 2, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.tpot ?? d.time_per_output_token },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.tpot_p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.tpot_p99 },
      ] },
    { id: 'itl', label: 'ITL', unit: 'ms', dec: 2, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.itl ?? d.itl },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.itl_p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.itl_p99 },
      ] },
    { id: 'e2e', label: 'E2E', unit: 'ms', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.e2e_latency ?? d.latency?.mean },
        { id: 'p50',  label: 'p50',  fn: d => d.latency?.p50 ?? d.metrics?.latency?.p50 },
        { id: 'p99',  label: 'p99',  fn: d => d.latency?.p99 ?? d.metrics?.latency?.p99 },
      ] },

    // Observability — only present in v0.2 reports
    { id: 'kv_cache_usage', label: 'KV cache usage', unit: '%', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.kvCacheUsageMean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.kvCacheUsageP50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.kvCacheUsageP99 },
      ] },
    { id: 'prefix_cache_hit', label: 'Prefix cache hit', unit: '%', dec: 1, higher: true,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.prefixCacheHitMean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.prefixCacheHitP50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.prefixCacheHitP99 },
      ] },
    { id: 'epp_queue', label: 'EPP queue size', unit: '', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.eppQueueMean },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.eppQueueP50 },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.eppQueueP99 },
      ] },
    { id: 'pod_startup', label: 'Pod startup', unit: 's', dec: 1, higher: false,
      stats: [
        { id: 'mean', label: 'mean', fn: d => d.metrics?.observability?.podStartupMeanS },
        { id: 'p50',  label: 'p50',  fn: d => d.metrics?.observability?.podStartupP50S },
        { id: 'p99',  label: 'p99',  fn: d => d.metrics?.observability?.podStartupP99S },
      ] },
];

// Stable colors per stat — used for both bar fill and the legend.
const STAT_COLORS = {
    mean: CHART_SERIES[1], // sky
    p50:  CHART_SERIES[2], // amber
    p99:  CHART_SERIES[3], // violet
};

const aggregateValue = (entries, statFn, higher) => {
    const vals = entries
        .map(statFn)
        .filter(v => v !== null && v !== undefined && !isNaN(v));
    if (vals.length === 0) return null;
    if (vals.length === 1) return vals[0];
    return higher ? Math.max(...vals) : Math.min(...vals);
};

const formatVal = (v, dec = 1) => {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Number(v).toLocaleString(undefined, { maximumFractionDigits: dec });
};

const formatTokenCount = (val) => {
    if (!val || val <= 0) return '—';
    if (val >= 1000) {
        const k = val / 1000;
        return `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`;
    }
    return String(val);
};

// Comprehensive metadata extractor for a benchmark grouping
const extractRunMetadata = (key, entries, brv02CustomLabels) => {
    const sample = entries[0] || {};
    const meta = sample.metadata || {};

    // 1. Model Name & Precision
    const rawModel = sample.model_name || sample.model || 'Unknown Model';
    const cleanModel = rawModel.replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
    const precision = sample.precision || meta.precision || 'BF16';

    // 2. Hardware & Architecture
    let hardware = sample.hardware || meta.hardware || 'Unknown Hardware';
    if (hardware.includes('Unknown') && meta.accelerator_type) {
        hardware = meta.accelerator_type;
    }
    const chips = sample.accelerator_count || meta.accelerator_count || extractAcceleratorCount(hardware);
    const tp = getEffectiveTp(sample) || 'TP1';
    const pdRatio = sample.pd_ratio || meta.pd_ratio || 'Aggregated';
    const machineType = sample.machine_type || meta.machine_type || '';

    // 3. Workload & Load
    const rawIsl = sample.isl || sample.workload?.input_tokens || meta.isl || 0;
    const rawOsl = sample.osl || sample.workload?.output_tokens || meta.osl || 0;
    const islStr = formatTokenCount(rawIsl);
    const oslStr = formatTokenCount(rawOsl);

    const qpsVal = sample.qps || sample.metrics?.request_rate || sample.workload?.target_qps || sample.target_qps || 0;
    const qpsStr = qpsVal > 0 ? `${Number(qpsVal).toFixed(1)} QPS` : '';

    const useCase = sample.use_case || sample.workload?.use_case || getRatioType(rawIsl, rawOsl);
    const modelServer = sample.model_server || sample.backend || sample.serving_stack || meta.model_server || meta.backend || 'vLLM';

    // Custom Label override if local v0.2
    let customLabel = null;
    if (sample.source?.startsWith('brv02:')) {
        const runId = sample.source.slice('brv02:'.length);
        if (brv02CustomLabels?.[runId]) customLabel = brv02CustomLabels[runId];
    }

    // Clean, informative short labels for x-axis & tables
    const hwShortClean = hardware.replace(/^NVIDIA\s+/i, '').replace(/Tensor\s+Parallel\s+\d+/i, '').trim();
    const hwShort = `${chips > 1 ? `${chips}x ` : ''}${hwShortClean} (${tp})`;
    const loadShort = `${islStr}/${oslStr}${qpsStr ? ` · ${qpsStr}` : ''}`;
    const shortModel = customLabel || cleanModel;
    const fullLabel = customLabel || `${cleanModel} (${precision}) | ${hwShort} | ${loadShort}`;

    return {
        key,
        modelName: cleanModel,
        shortModel,
        precision,
        hardware,
        chips,
        tp,
        pdRatio,
        machineType,
        isl: rawIsl,
        osl: rawOsl,
        islStr,
        oslStr,
        qps: qpsVal,
        qpsStr,
        useCase,
        modelServer,
        hwShort,
        loadShort,
        fullLabel,
        sample,
        entriesCount: entries.length,
    };
};

// Tooltip: rich system specs (model, hardware, load) + metric stats & %diff
const BarTooltip = ({ active, payload, metric, activeStats, baselineSet }) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const meta = d.meta;

    return (
        <ChartTooltip
            className="min-w-[280px] max-w-[380px]"
            title={
                <div className="flex flex-col gap-1 pb-1 border-b border-slate-700/50">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-100 text-sm truncate">{meta.shortModel}</span>
                        {d.isBaseline ? (
                            <span className="bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0">
                                📌 BASELINE
                            </span>
                        ) : (
                            <span className="text-slate-400 text-[10px] font-mono shrink-0">
                                {meta.precision}
                            </span>
                        )}
                    </div>
                    {/* System specs in tooltip */}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-300 pt-1 font-sans">
                        <div className="flex items-center gap-1.5 truncate">
                            <HardDrive size={11} className="text-cyan-400 shrink-0" />
                            <span className="truncate text-slate-300" title={meta.hardware}>
                                {meta.hwShort}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                            <Activity size={11} className="text-emerald-400 shrink-0" />
                            <span className="truncate text-slate-300">
                                {meta.loadShort}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate text-[10px] text-slate-400">
                            <Cpu size={10} className="text-purple-400 shrink-0" />
                            <span className="truncate">{meta.modelServer}</span>
                        </div>
                        {meta.pdRatio && meta.pdRatio !== 'Aggregated' && (
                            <div className="flex items-center gap-1.5 truncate text-[10px] text-slate-400">
                                <Layers size={10} className="text-amber-400 shrink-0" />
                                <span className="truncate">P/D: {meta.pdRatio}</span>
                            </div>
                        )}
                    </div>
                </div>
            }
        >
            <div className="pt-2 flex flex-col gap-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Measured Performance ({metric.label})
                </div>
                {activeStats.map(s => {
                    const raw = d[`raw_${s.id}`];
                    const diff = d[`diff_${s.id}`];
                    const isImp = d[`imp_${s.id}`];
                    const statLabel = `${metric.label}${metric.stats.length > 1 ? ` (${s.label})` : ''}`;
                    return (
                        <ChartTooltipRow
                            key={s.id}
                            color={STAT_COLORS[s.id]}
                            label={statLabel}
                            value={
                                <span className="flex items-baseline gap-2">
                                    <span className="font-mono font-bold text-slate-100">
                                        {formatVal(raw, metric.dec)}
                                        {metric.unit && (
                                            <span className="text-theme-muted text-[10px] ml-1 font-normal">{metric.unit}</span>
                                        )}
                                    </span>
                                    {baselineSet && diff !== null && diff !== undefined && (
                                        <span className={cn(
                                            'font-bold text-xs',
                                            isImp === null ? 'text-slate-400'
                                                : isImp ? 'text-emerald-400'
                                                : 'text-rose-400'
                                        )}>
                                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                        </span>
                                    )}
                                </span>
                            }
                        />
                    );
                })}
            </div>
            {!baselineSet && (
                <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-700/50 mt-2 flex items-center gap-1">
                    <span>💡 Select 📌 on a run to enable relative %diff comparison</span>
                </div>
            )}
        </ChartTooltip>
    );
};

// Custom X-Axis Tick that renders Model, Hardware, and Load in 3 distinct lines
const CustomXAxisTick = (props) => {
    const { x, y, payload, plotData } = props;
    if (!payload || x == null || y == null) return null;

    // Find the matching row in plotData
    const entry = plotData?.find(d => d.key === payload.value || d.label === payload.value);
    if (!entry) {
        return (
            <g transform={`translate(${x},${y})`}>
                <text x={0} y={0} dy={16} textAnchor="end" transform="rotate(-25)" className="fill-slate-400 text-[10px] font-mono">
                    {String(payload.value)}
                </text>
            </g>
        );
    }

    const meta = entry.meta;
    const isBaseline = entry.isBaseline;

    return (
        <g transform={`translate(${x},${y})`}>
            {/* Line 1: Model Name (Prominent) */}
            <text
                x={0}
                y={0}
                dy={16}
                textAnchor="end"
                transform="rotate(-25)"
                className="fill-slate-100 font-bold text-[11px]"
            >
                {isBaseline && <tspan className="fill-cyan-400 font-bold">📌 </tspan>}
                {meta.shortModel}
            </text>

            {/* Line 2: Hardware & TP (Accent) */}
            <text
                x={0}
                y={0}
                dy={30}
                textAnchor="end"
                transform="rotate(-25)"
                className="fill-cyan-400 font-medium text-[10px]"
            >
                {meta.hwShort}
            </text>

            {/* Line 3: Workload & QPS (Muted) */}
            <text
                x={0}
                y={0}
                dy={44}
                textAnchor="end"
                transform="rotate(-25)"
                className="fill-slate-400 text-[9px]"
            >
                {meta.loadShort}
            </text>
        </g>
    );
};

export const RunComparisonChart = ({
    filteredBySource,
    selectedBenchmarks,
    getBenchmarkKey,
    baselineBenchmarkKey,
    brv02CustomLabels,
    theme,
    bucketConfigs = [],
    apiConfigs = [],
    selectedSources = new Set(),
    generateShareUrl,
    setBaselineBenchmarkKey,
    toggleBenchmark,
    setSelectedBenchmarks,
}) => {
    const [metricId, setMetricId] = useState('output_tput');
    // Multi-select: any combination of {'mean','p50','p99'} for the active metric.
    const [statIds, setStatIds] = useState(() => new Set(['mean']));
    const [viewOverride, setViewOverride] = useState(null);

    // Share & Spec Report Modal
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [copySuccessToast, setCopySuccessToast] = useState(null);
    const [showComparisonMatrix, setShowComparisonMatrix] = useState(true);
    const [selectedScenarioKey, setSelectedScenarioKey] = useState(null);

    useEffect(() => {
        if (!baselineBenchmarkKey) setViewOverride(null);
    }, [baselineBenchmarkKey]);

    const canDiff = !!baselineBenchmarkKey;
    const view = viewOverride ?? (canDiff ? 'diff' : 'absolute');

    const metric = METRICS.find(m => m.id === metricId) || METRICS[0];

    // Stats actually visible on the chart
    const activeStats = useMemo(() => {
        const visible = metric.stats.filter(s => statIds.has(s.id));
        return visible.length > 0 ? visible : [metric.stats[0]];
    }, [metric, statIds]);

    useEffect(() => {
        const supported = new Set(metric.stats.map(s => s.id));
        setStatIds(prev => {
            const next = new Set([...prev].filter(id => supported.has(id)));
            if (next.size === 0) next.add('mean');
            return next;
        });
    }, [metricId]);

    const toggleStat = (id) => {
        setStatIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                if (next.size > 1) next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Build comprehensive chart & comparison dataset
    const chartData = useMemo(() => {
        if (selectedBenchmarks.size < 2) return [];

        const byKey = new Map();
        filteredBySource.forEach(d => {
            const key = getBenchmarkKey(d);
            if (!selectedBenchmarks.has(key)) return;
            if (!byKey.has(key)) byKey.set(key, []);
            byKey.get(key).push(d);
        });

        const list = [];
        byKey.forEach((entries, key) => {
            const meta = extractRunMetadata(key, entries, brv02CustomLabels);
            const isBaseline = key === baselineBenchmarkKey;
            const row = {
                key,
                meta,
                fullLabel: meta.fullLabel,
                label: key, // Use key as identifier for custom tick renderer
                isBaseline,
                entries,
            };

            // Calculate aggregate values for all supported metrics
            METRICS.forEach(m => {
                m.stats.forEach(s => {
                    row[`${m.id}_${s.id}`] = aggregateValue(entries, s.fn, m.higher);
                });
            });

            // Map current metric values to raw_statId for Recharts
            metric.stats.forEach(s => {
                row[`raw_${s.id}`] = row[`${metric.id}_${s.id}`];
            });

            list.push(row);
        });

        // Compute %diff vs baseline for all metrics
        const baselineRow = list.find(r => r.isBaseline);
        list.forEach(r => {
            METRICS.forEach(m => {
                m.stats.forEach(s => {
                    const v = r[`${m.id}_${s.id}`];
                    const bv = baselineRow ? baselineRow[`${m.id}_${s.id}`] : null;
                    if (r.isBaseline) {
                        r[`${m.id}_diff_${s.id}`] = 0;
                        r[`${m.id}_imp_${s.id}`] = null;
                    } else if (v === null || bv === null || bv === 0) {
                        r[`${m.id}_diff_${s.id}`] = null;
                        r[`${m.id}_imp_${s.id}`] = null;
                    } else {
                        const diff = ((v - bv) / Math.abs(bv)) * 100;
                        r[`${m.id}_diff_${s.id}`] = diff;
                        r[`${m.id}_imp_${s.id}`] = Math.abs(diff) < 0.1 ? null
                            : (m.higher ? diff > 0 : diff < 0);
                    }
                });
            });

            // Map active metric diffs for current chart view
            metric.stats.forEach(s => {
                r[`diff_${s.id}`] = r[`${metric.id}_diff_${s.id}`];
                r[`imp_${s.id}`] = r[`${metric.id}_imp_${s.id}`];
            });
        });

        // Sort: Baseline first, then by mean (or first available stat) desc
        const sortStat = metric.stats.find(s => statIds.has(s.id))?.id ?? metric.stats[0].id;
        return list.sort((a, b) => {
            if (a.isBaseline && !b.isBaseline) return -1;
            if (b.isBaseline && !a.isBaseline) return 1;
            return (b[`raw_${sortStat}`] ?? 0) - (a[`raw_${sortStat}`] ?? 0);
        });
    }, [filteredBySource, selectedBenchmarks, getBenchmarkKey, metric, baselineBenchmarkKey, brv02CustomLabels, statIds]);

    if (selectedBenchmarks.size < 2) return null;

    // Drop benchmarks where ALL active stats are null
    const plotData = chartData.filter(r =>
        activeStats.some(s => r[`raw_${s.id}`] !== null && r[`raw_${s.id}`] !== undefined)
    );

    const activeScenarioRow = plotData.find(r => r.key === selectedScenarioKey) || plotData.find(r => r.isBaseline) || plotData[0];
    const activeScenarioMeta = activeScenarioRow?.meta;

    const barKey = (statId) => view === 'diff' ? `diff_${statId}` : `raw_${statId}`;
    const hasPlotData = plotData.length >= 2;
    const showRichLabels = activeStats.length === 1;

    const POS_COLOR = '#34d399';
    const NEG_COLOR = '#f87171';
    const ABS_COLOR = '#f8fafc';

    // LabelList content factory
    const makeLabelRenderer = (statId) => (props) => {
        const { x, y, width, index } = props;
        if (x == null || y == null || width == null) return null;
        const entry = plotData[index];
        if (!entry) return null;

        const raw = entry[`raw_${statId}`];
        const diff = entry[`diff_${statId}`];
        const imp = entry[`imp_${statId}`];
        if (raw === null || raw === undefined) return null;

        const cx = x + width / 2;

        if (view === 'diff') {
            const isAbove = (diff ?? 0) >= 0;
            const cy = isAbove ? y - 8 : y + 16;
            if (entry.isBaseline || diff === null) return null;
            const sign = diff > 0 ? '+' : '';
            const fill = imp === null ? '#cbd5e1' : imp ? POS_COLOR : NEG_COLOR;
            return (
                <text x={cx} y={cy} textAnchor="middle" fontSize={showRichLabels ? 13 : 10}
                      fontWeight={800} fill={fill}>
                    {sign}{diff.toFixed(1)}%
                </text>
            );
        }

        // Absolute view
        const valStr = formatVal(raw, metric.dec);

        if (showRichLabels) {
            const TOP_Y = y - 22;
            const ABS_Y = y - 6;
            return (
                <g>
                    {canDiff && !entry.isBaseline && diff !== null && (
                        <text x={cx} y={TOP_Y} textAnchor="middle" fontSize={12} fontWeight={800}
                              fill={imp === null ? '#cbd5e1' : imp ? POS_COLOR : NEG_COLOR}>
                            {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                        </text>
                    )}
                    <text x={cx} y={ABS_Y} textAnchor="middle" fontSize={12} fontWeight={700}
                          fill={ABS_COLOR}>
                        {valStr}
                    </text>
                </g>
            );
        }

        // Grouped bars
        const showDiffLabel = canDiff && !entry.isBaseline && diff !== null;
        return (
            <g>
                {showDiffLabel && (
                    <text x={cx} y={y - 16} textAnchor="middle" fontSize={10} fontWeight={800}
                          fill={imp === null ? '#cbd5e1' : imp ? POS_COLOR : NEG_COLOR}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                    </text>
                )}
                <text x={cx} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={700}
                      fill={ABS_COLOR}>
                    {valStr}
                </text>
            </g>
        );
    };

    const activeStatsLabel = activeStats.map(s => s.label).join(', ');
    const metricLabelFull = metric.stats.length > 1
        ? `${metric.label} (${activeStatsLabel})`
        : metric.label;
    const yLabel = view === 'diff'
        ? `Δ ${metricLabelFull} vs baseline (%)`
        : `${metric.label}${metric.unit ? ` (${metric.unit})` : ''}`;

    // Generate Shareable Markdown Report
    const generateMarkdownReport = () => {
        const baselineRow = chartData.find(r => r.isBaseline);
        const dateStr = new Date().toISOString().split('T')[0];

        const configRows = chartData.map(r => {
            const m = r.meta;
            const prefix = r.isBaseline ? '📌 **Baseline**' : `Run`;
            return `| ${prefix} | **${m.modelName}** | \`${m.precision}\` | ${m.hardware} | ${m.chips} chips (${m.tp}) | ${m.islStr} / ${m.oslStr} (${m.useCase}) | ${m.qpsStr || '—'} | ${m.modelServer} |`;
        }).join('\n');

        const perfRows = chartData.map(r => {
            const m = r.meta;
            const tput = formatVal(r['output_tput_mean'], 0);
            const ttftMean = formatVal(r['ttft_mean'], 1);
            const ttftP99 = formatVal(r['ttft_p99'], 1);
            const tpotMean = formatVal(r['tpot_mean'], 2);
            const tpotP99 = formatVal(r['tpot_p99'], 2);
            const itl = formatVal(r['itl_mean'], 2);
            const diffVal = r[`diff_mean`];
            const diffStr = r.isBaseline ? 'Baseline (0.0%)'
                : (diffVal !== null && diffVal !== undefined
                    ? `${diffVal > 0 ? '+' : ''}${diffVal.toFixed(1)}% (${r.imp_mean ? 'Faster' : 'Slower'})`
                    : '—');

            return `| ${r.isBaseline ? '📌 ' : ''}**${m.shortModel}** | ${tput} tok/s | ${ttftMean} ms / ${ttftP99} ms | ${tpotMean} ms / ${tpotP99} ms | ${itl} ms | **${diffStr}** |`;
        }).join('\n');

        return `### 📊 llm-d-prism Benchmark Comparison Report
**Date:** ${dateStr}  
**Active Metric:** ${metric.label} (${activeStatsLabel})  
**Baseline:** ${baselineRow ? `${baselineRow.meta.shortModel} on ${baselineRow.meta.hwShort}` : 'No baseline selected'}

#### 1. Hardware, Model & Workload Specifications
| Status | Model | Precision | Hardware | Accelerator Count & TP | Workload (ISL / OSL) | Load (QPS) | Serving Stack |
|:---|:---|:---|:---|:---|:---|:---|:---|
${configRows}

#### 2. Measured Performance Results
| Run / Configuration | Output Throughput | TTFT (Mean / P99) | TPOT (Mean / P99) | ITL (Mean) | Δ% vs Baseline (${metric.label}) |
|:---|:---|:---|:---|:---|:---|
${perfRows}

---
*Generated via [llm-d-prism Benchmark Browser](${window.location.href})*`;
    };

    // Generate CSV export
    const generateCsvContent = () => {
        const headers = [
            'Run_Type', 'Model_Name', 'Precision', 'Hardware', 'Accelerator_Count', 'TP', 'P_D_Ratio',
            'ISL', 'OSL', 'Workload_Type', 'Target_QPS', 'Serving_Stack',
            'Output_Tput_tok_s', 'TTFT_Mean_ms', 'TTFT_P50_ms', 'TTFT_P99_ms',
            'TPOT_Mean_ms', 'TPOT_P50_ms', 'TPOT_P99_ms', 'ITL_Mean_ms', 'E2E_Latency_ms',
            'Diff_Vs_Baseline_Pct'
        ];

        const rows = chartData.map(r => {
            const m = r.meta;
            const diff = r['diff_mean'] !== null && r['diff_mean'] !== undefined ? r['diff_mean'].toFixed(2) : '';
            return [
                r.isBaseline ? 'Baseline' : 'Comparison',
                `"${m.modelName}"`,
                m.precision,
                `"${m.hardware}"`,
                m.chips,
                m.tp,
                m.pdRatio,
                m.isl,
                m.osl,
                `"${m.useCase}"`,
                m.qps || '',
                `"${m.modelServer}"`,
                r['output_tput_mean'] ?? '',
                r['ttft_mean'] ?? '',
                r['ttft_p50'] ?? '',
                r['ttft_p99'] ?? '',
                r['tpot_mean'] ?? '',
                r['tpot_p50'] ?? '',
                r['tpot_p99'] ?? '',
                r['itl_mean'] ?? '',
                r['e2e_mean'] ?? '',
                diff
            ].join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    };

    const handleCopyMarkdown = () => {
        const md = generateMarkdownReport();
        navigator.clipboard.writeText(md).then(() => {
            setCopySuccessToast('Markdown summary copied to clipboard!');
            setTimeout(() => setCopySuccessToast(null), 3000);
        }).catch(() => {
            setCopySuccessToast('Failed to copy to clipboard');
            setTimeout(() => setCopySuccessToast(null), 3000);
        });
    };

    const handleDownloadCsv = () => {
        const csv = generateCsvContent();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `prism_run_comparison_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setCopySuccessToast('CSV comparison file exported!');
        setTimeout(() => setCopySuccessToast(null), 3000);
    };

    const handleCopyShareLink = () => {
        if (generateShareUrl) {
            const url = generateShareUrl(bucketConfigs, apiConfigs, selectedSources);
            navigator.clipboard.writeText(url).then(() => {
                setCopySuccessToast('Shareable comparison link copied!');
                setTimeout(() => setCopySuccessToast(null), 3000);
            });
        }
    };

    const baseTogglesClass = 'px-3 py-1 text-xs font-medium rounded-md transition-all';
    const inactiveToggleClass = 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50';

    return (
        <ChartContainer
            title={
                <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-100">Run Comparison & System Benchmark Matrix</span>
                    <Badge tone="brand" size="xs">
                        {plotData.length} runs selected
                    </Badge>
                </div>
            }
            actions={
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Share & Export Toolbar */}
                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleCopyMarkdown}
                        className="flex items-center gap-1 text-slate-200"
                        title="Copy formatted Markdown comparison report with Model, Hardware, Load, and Metrics"
                    >
                        <Copy size={12} className="text-cyan-400" />
                        <span>Copy Markdown</span>
                    </Button>

                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleDownloadCsv}
                        className="flex items-center gap-1 text-slate-200"
                        title="Download complete comparison data as CSV"
                    >
                        <Download size={12} className="text-emerald-400" />
                        <span>Export CSV</span>
                    </Button>

                    <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => setIsReportModalOpen(true)}
                        className="flex items-center gap-1 text-slate-300 hover:text-white"
                        title="Preview generated comparison report"
                    >
                        <FileText size={12} />
                        <span>Preview Report</span>
                    </Button>

                    {copySuccessToast && (
                        <div className="text-xs text-emerald-400 font-bold animate-in fade-in flex items-center gap-1">
                            <Check size={13} /> {copySuccessToast}
                        </div>
                    )}
                </div>
            }
        >
            {/* ROW 1: Benchmark Scenario & Primary Outcomes (Matching Well-Lit Dashboards) */}
            {activeScenarioMeta && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-4">
                    {/* CARD 1: Benchmark Scenario Card (col-span-8) */}
                    <div className="lg:col-span-8 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 via-slate-900/60 to-slate-950 p-3.5 flex flex-col justify-between shadow-lg relative overflow-hidden">
                        <div className="absolute -top-12 -left-12 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />
                        
                        <div className="mb-2.5 flex justify-between items-center flex-wrap gap-2">
                            <SectionLabel tone="sky" className="text-[11px]">
                                Benchmark scenario {activeScenarioRow?.isBaseline ? '· 📌 Baseline Run' : ''}
                            </SectionLabel>
                            
                            {/* Interactive Run Selector Chips */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Inspect Specs:</span>
                                {plotData.map((row) => (
                                    <button
                                        key={row.key}
                                        onClick={() => setSelectedScenarioKey(row.key)}
                                        className={cn(
                                            'text-[10px] font-mono px-2 py-0.5 rounded-md transition-all flex items-center gap-1 border',
                                            (activeScenarioRow?.key === row.key)
                                                ? 'bg-sky-500/20 border-sky-500/50 text-sky-300 font-bold shadow-sm'
                                                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                                        )}
                                    >
                                        {row.isBaseline && <span className="text-cyan-400 font-bold">📌</span>}
                                        <span className="truncate max-w-[120px]">{row.meta.shortModel}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-12 gap-2">
                            {/* Column 1: Infra layer */}
                            <div className="flex flex-col gap-2 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate flex items-center gap-1">
                                    <HardDrive size={11} className="text-cyan-400" /> Infra layer
                                </div>
                                <div className="flex flex-col gap-1.5 text-xs">
                                    <FactCell label="Accelerator" value={activeScenarioMeta.hardware} />
                                    <FactCell label="Parallelism / TP" value={`${activeScenarioMeta.chips} chips · ${activeScenarioMeta.tp}`} />
                                    <FactCell label="Machine Type" value={activeScenarioMeta.machineType || 'GKE / Cloud Compute'} />
                                </div>
                            </div>

                            {/* Column 2: Model serving */}
                            <div className="flex flex-col gap-2 col-span-4 border-r border-slate-800/60 pr-2">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate flex items-center gap-1">
                                    <Cpu size={11} className="text-purple-400" /> Model serving
                                </div>
                                <div className="flex flex-col gap-1.5 text-xs">
                                    <FactCell label="Model & Precision" value={`${activeScenarioMeta.modelName} (${activeScenarioMeta.precision})`} />
                                    <FactCell label="Engine / Stack" value={activeScenarioMeta.modelServer} />
                                    <FactCell label="P/D Strategy" value={activeScenarioMeta.pdRatio || 'Aggregated'} />
                                </div>
                            </div>

                            {/* Column 3: Workload & Load */}
                            <div className="flex flex-col gap-2 col-span-4">
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider truncate flex items-center gap-1">
                                    <Activity size={11} className="text-emerald-400" /> Workload & Load
                                </div>
                                <div className="flex flex-col gap-1.5 text-xs">
                                    <FactCell label="Workload Type" value={activeScenarioMeta.useCase} />
                                    <FactCell label="Context (ISL / OSL)" value={`${activeScenarioMeta.islStr} / ${activeScenarioMeta.oslStr}`} />
                                    <FactCell label="Target Load" value={activeScenarioMeta.qpsStr || 'Dynamic / Sweep QPS'} />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CARD 2: Primary comparison outcomes (col-span-4) */}
                    <Panel padding="sm" className="lg:col-span-4 flex flex-col justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-all bg-slate-900/60 border border-slate-800/80">
                        <SectionLabel tone="emerald" className="text-[11px]">Primary comparison outcomes</SectionLabel>
                        <div className="grid grid-cols-1 gap-1.5 font-sans text-xs mt-1.5">
                            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg px-2.5 py-2 flex justify-between items-center transition-all hover:border-emerald-500/40">
                                <div className="min-w-0 pr-2">
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider truncate">Output Throughput</h3>
                                    <div className="text-[10px] text-slate-500 font-normal uppercase truncate">(tokens/sec · higher is better)</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-sm font-black font-mono text-emerald-400">
                                        {formatVal(activeScenarioRow?.['output_tput_mean'], 0)} <span className="text-[10px] font-normal text-slate-400">tok/s</span>
                                    </div>
                                    {canDiff && !activeScenarioRow?.isBaseline && activeScenarioRow?.['output_tput_diff_mean'] != null && (
                                        <div className={cn('text-[10px] font-bold', activeScenarioRow?.['output_tput_imp_mean'] ? 'text-emerald-400' : 'text-rose-400')}>
                                            {activeScenarioRow['output_tput_diff_mean'] > 0 ? '+' : ''}{activeScenarioRow['output_tput_diff_mean'].toFixed(1)}% vs bl
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg px-2.5 py-2 flex justify-between items-center transition-all hover:border-sky-500/40">
                                <div className="min-w-0 pr-2">
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider truncate">TTFT (Latency)</h3>
                                    <div className="text-[10px] text-slate-500 font-normal uppercase truncate">(time to first token · mean)</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-sm font-black font-mono text-sky-400">
                                        {formatVal(activeScenarioRow?.['ttft_mean'], 1)} <span className="text-[10px] font-normal text-slate-400">ms</span>
                                    </div>
                                    {canDiff && !activeScenarioRow?.isBaseline && activeScenarioRow?.['ttft_diff_mean'] != null && (
                                        <div className={cn('text-[10px] font-bold', activeScenarioRow?.['ttft_imp_mean'] ? 'text-emerald-400' : 'text-rose-400')}>
                                            {activeScenarioRow['ttft_diff_mean'] > 0 ? '+' : ''}{activeScenarioRow['ttft_diff_mean'].toFixed(1)}% vs bl
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg px-2.5 py-2 flex justify-between items-center transition-all hover:border-purple-500/40">
                                <div className="min-w-0 pr-2">
                                    <h3 className="text-xs font-extrabold text-slate-400 uppercase tracking-wider truncate">TPOT (Generation)</h3>
                                    <div className="text-[10px] text-slate-500 font-normal uppercase truncate">(time per output token)</div>
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-sm font-black font-mono text-purple-400">
                                        {formatVal(activeScenarioRow?.['tpot_mean'], 2)} <span className="text-[10px] font-normal text-slate-400">ms</span>
                                    </div>
                                    {canDiff && !activeScenarioRow?.isBaseline && activeScenarioRow?.['tpot_diff_mean'] != null && (
                                        <div className={cn('text-[10px] font-bold', activeScenarioRow?.['tpot_imp_mean'] ? 'text-emerald-400' : 'text-rose-400')}>
                                            {activeScenarioRow['tpot_diff_mean'] > 0 ? '+' : ''}{activeScenarioRow['tpot_diff_mean'].toFixed(1)}% vs bl
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Panel>
                </div>
            )}

            {plotData.length > 20 && (
                <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400 text-xs flex items-start gap-2.5 leading-relaxed font-sans">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-bold">Visual Density Warning:</span> Comparing {plotData.length} runs. Bar charts are optimized for comparing fewer than 20 runs. Use the table below or the <span className="font-semibold text-cyan-400">Scatter Trade-offs</span> view for large sweeps.
                    </div>
                </div>
            )}

            {/* Toggle row */}
            <div className="flex items-center justify-between gap-3 flex-wrap mb-4 bg-slate-900/40 p-2.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Metric</span>
                        <ToggleGroup
                            options={METRICS.map(opt => ({ value: opt.id, label: opt.label }))}
                            value={metricId}
                            onChange={setMetricId}
                            className="flex-wrap"
                        />
                    </div>

                    {metric.stats.length > 1 && (
                        <div className="flex items-center gap-1 bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/60">
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">Stat</span>
                            <div className="h-4 w-px bg-slate-700 mr-1" />
                            {metric.stats.map(opt => {
                                const isOn = statIds.has(opt.id);
                                return (
                                    <button
                                        key={opt.id}
                                        onClick={() => toggleStat(opt.id)}
                                        title={isOn && statIds.size === 1 ? 'Keep at least one stat' : ''}
                                        className={cn(
                                            baseTogglesClass,
                                            'flex items-center gap-1.5',
                                            isOn ? 'bg-purple-600 text-white shadow-sm' : inactiveToggleClass
                                        )}
                                    >
                                        <span
                                            className="w-2 h-2 rounded-sm"
                                            style={{ background: STAT_COLORS[opt.id], opacity: isOn ? 1 : 0.45 }}
                                        />
                                        {opt.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="flex items-center gap-1 bg-slate-800/60 p-1.5 rounded-lg border border-slate-700/60">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mr-1">View</span>
                        <div className="h-4 w-px bg-slate-700 mr-1" />
                        <button
                            onClick={() => setViewOverride('absolute')}
                            className={cn(baseTogglesClass, view === 'absolute' ? 'bg-emerald-600 text-white shadow-sm' : inactiveToggleClass)}
                        >
                            Absolute
                        </button>
                        <button
                            onClick={() => canDiff && setViewOverride('diff')}
                            disabled={!canDiff}
                            title={canDiff ? '' : 'Select a baseline (📌) on a row to enable relative Δ% view'}
                            className={cn(
                                baseTogglesClass,
                                !canDiff
                                    ? 'text-slate-600 cursor-not-allowed opacity-50'
                                    : view === 'diff'
                                        ? 'bg-cyan-600 text-white shadow-sm'
                                        : inactiveToggleClass
                            )}
                        >
                            Δ% vs baseline
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowComparisonMatrix(!showComparisonMatrix)}
                        className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                    >
                        <span>{showComparisonMatrix ? 'Hide' : 'Show'} System Specs Table</span>
                        {showComparisonMatrix ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                </div>
            </div>

            {/* Main Bar Chart Viewport with Generous Height & Dynamic Width */}
            <div className="h-[400px] overflow-x-auto overflow-y-hidden border border-slate-800/60 rounded-xl bg-slate-950/40 p-2">
                {hasPlotData ? (
                    <div style={{ minWidth: `${Math.max(760, plotData.length * (activeStats.length * 48 + 90))}px`, height: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                key={activeStats.map(s => s.id).join(',')}
                                data={plotData}
                                margin={{ top: 36, right: 30, left: 36, bottom: 100 }}
                                barGap={3}
                            >
                                <CartesianGrid {...gridProps()} opacity={0.25} vertical={false} />
                                <ChartXAxis
                                    dataKey="label"
                                    type="category"
                                    interval={0}
                                    height={95}
                                    tick={<CustomXAxisTick plotData={plotData} />}
                                    tickFormatter={(v) => v}
                                />
                                <ChartYAxis
                                    label={yLabel}
                                    width={72}
                                    tickFormatter={(v) => view === 'diff'
                                        ? `${v > 0 ? '+' : ''}${v}%`
                                        : (Math.abs(v) >= 1000
                                            ? Number(v).toFixed(0)
                                            : Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 }))}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                                    content={<BarTooltip metric={metric} activeStats={activeStats} baselineSet={canDiff} />}
                                />
                                {view === 'diff' && (
                                    <ReferenceLine
                                        y={0}
                                        stroke="#22d3ee"
                                        strokeWidth={1.5}
                                        strokeDasharray="4 4"
                                    />
                                )}
                                {activeStats.map(s => (
                                    <Bar
                                        key={s.id}
                                        dataKey={barKey(s.id)}
                                        fill={STAT_COLORS[s.id]}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={64}
                                    >
                                        {plotData.map((entry, i) => (
                                            <Cell
                                                key={i}
                                                fill={STAT_COLORS[s.id]}
                                                stroke={entry.isBaseline ? '#67e8f9' : 'none'}
                                                strokeWidth={entry.isBaseline ? 2 : 0}
                                            />
                                        ))}
                                        <LabelList dataKey={barKey(s.id)} content={makeLabelRenderer(s.id)} />
                                    </Bar>
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <EmptyState
                        className="h-full py-0"
                        title={`No data for ${metric.label}`}
                        message="The selected benchmarks don't include this metric. Try a different metric or select more benchmark runs."
                    />
                )}
            </div>

            {/* Legend & Summary Subtitle */}
            <div className="flex items-center justify-between mt-2 px-2 text-[11px] text-slate-400">
                <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-cyan-400 inline-block" />
                        <span>Line 1: Model</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-cyan-600 inline-block" />
                        <span>Line 2: Hardware & Parallelism</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block" />
                        <span>Line 3: Load (ISL/OSL · QPS)</span>
                    </span>
                </div>
                <div>
                    {canDiff
                        ? '🟢 Green = improvement vs baseline · 🔴 Red = regression'
                        : '💡 Click 📌 in the table below to set a baseline run'}
                </div>
            </div>

            {/* Comprehensive System & Workload Comparison Matrix Table */}
            {showComparisonMatrix && (
                <div className="mt-6 border border-slate-800 rounded-xl overflow-hidden bg-slate-900/50">
                    <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Layers size={14} className="text-cyan-400" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                                Detailed Run Specifications & Performance Matrix
                            </h4>
                        </div>
                        <span className="text-[11px] text-slate-400">
                            Showing complete Model, Hardware, Load, and Performance metrics
                        </span>
                    </div>

                    <div className="overflow-x-auto max-h-96 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse font-sans">
                            <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] tracking-wider sticky top-0 z-10 border-b border-slate-800">
                                <tr>
                                    <th className="px-3 py-2.5 w-10 text-center">Baseline</th>
                                    <th className="px-3 py-2.5">Model & Precision</th>
                                    <th className="px-3 py-2.5">Hardware & TP</th>
                                    <th className="px-3 py-2.5">Workload (ISL/OSL)</th>
                                    <th className="px-3 py-2.5">Load (QPS)</th>
                                    <th className="px-3 py-2.5">Serving Stack</th>
                                    <th className="px-3 py-2.5 text-right">Output Tput</th>
                                    <th className="px-3 py-2.5 text-right">TTFT (Mean/P99)</th>
                                    <th className="px-3 py-2.5 text-right">TPOT (Mean/P99)</th>
                                    <th className="px-3 py-2.5 text-right">Δ% vs Baseline</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-mono">
                                {chartData.map((row) => {
                                    const m = row.meta;
                                    const isBaseline = row.isBaseline;
                                    const diff = row.diff_mean;
                                    const isImp = row.imp_mean;

                                    return (
                                        <tr
                                            key={row.key}
                                            className={cn(
                                                'transition-colors hover:bg-slate-800/40',
                                                isBaseline && 'bg-cyan-950/20 border-l-2 border-cyan-400'
                                            )}
                                        >
                                            {/* Baseline Selector Pin */}
                                            <td className="px-3 py-2 text-center">
                                                <button
                                                    onClick={() => {
                                                        if (setBaselineBenchmarkKey) {
                                                            setBaselineBenchmarkKey(isBaseline ? null : row.key);
                                                        }
                                                    }}
                                                    title={isBaseline ? 'Active Baseline (Click to unset)' : 'Set as Baseline'}
                                                    className={cn(
                                                        'p-1 rounded transition-all',
                                                        isBaseline
                                                            ? 'bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30'
                                                            : 'text-slate-600 hover:text-slate-300 hover:bg-slate-800'
                                                    )}
                                                >
                                                    <Pin size={13} className={isBaseline ? 'fill-cyan-400' : ''} />
                                                </button>
                                            </td>

                                            {/* Model & Precision */}
                                            <td className="px-3 py-2">
                                                <div className="font-sans font-bold text-slate-100 flex items-center gap-1.5">
                                                    <span>{m.shortModel}</span>
                                                    <span className="text-[10px] text-purple-400 bg-purple-500/10 px-1 rounded font-mono font-normal">
                                                        {m.precision}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Hardware & TP */}
                                            <td className="px-3 py-2">
                                                <div className="text-cyan-300 flex items-center gap-1 font-sans">
                                                    <span>{m.hwShort}</span>
                                                    {m.pdRatio && m.pdRatio !== 'Aggregated' && (
                                                        <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1 rounded">
                                                            {m.pdRatio}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Workload */}
                                            <td className="px-3 py-2 text-slate-300">
                                                <div className="font-sans">
                                                    <span>{m.islStr} / {m.oslStr}</span>
                                                    <span className="text-[10px] text-slate-500 block truncate max-w-[120px]" title={m.useCase}>
                                                        {m.useCase}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Load (QPS) */}
                                            <td className="px-3 py-2 text-slate-300">
                                                {m.qpsStr || '—'}
                                            </td>

                                            {/* Serving Stack */}
                                            <td className="px-3 py-2 text-slate-400 font-sans">
                                                {m.modelServer}
                                            </td>

                                            {/* Output Tput */}
                                            <td className="px-3 py-2 text-right font-bold text-slate-100">
                                                {formatVal(row['output_tput_mean'], 0)} <span className="text-[10px] text-slate-500 font-normal">tok/s</span>
                                            </td>

                                            {/* TTFT */}
                                            <td className="px-3 py-2 text-right text-slate-200">
                                                {formatVal(row['ttft_mean'], 1)} <span className="text-slate-500 text-[10px]">/ {formatVal(row['ttft_p99'], 1)} ms</span>
                                            </td>

                                            {/* TPOT */}
                                            <td className="px-3 py-2 text-right text-slate-200">
                                                {formatVal(row['tpot_mean'], 2)} <span className="text-slate-500 text-[10px]">/ {formatVal(row['tpot_p99'], 2)} ms</span>
                                            </td>

                                            {/* Diff vs Baseline */}
                                            <td className="px-3 py-2 text-right">
                                                {isBaseline ? (
                                                    <span className="text-cyan-400 font-bold text-[10px] bg-cyan-500/10 px-1.5 py-0.5 rounded">
                                                        BASELINE
                                                    </span>
                                                ) : diff !== null && diff !== undefined ? (
                                                    <span className={cn(
                                                        'font-bold px-1.5 py-0.5 rounded text-[11px]',
                                                        isImp === null
                                                            ? 'text-slate-400 bg-slate-800'
                                                            : isImp
                                                                ? 'text-emerald-400 bg-emerald-500/10'
                                                                : 'text-rose-400 bg-rose-500/10'
                                                    )}>
                                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}%
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Spec Report Preview Modal */}
            {isReportModalOpen && (
                <Modal
                    isOpen={isReportModalOpen}
                    onClose={() => setIsReportModalOpen(false)}
                    title="Benchmark Comparison Specification Report"
                    subtitle="Shareable Markdown report with complete hardware, workload, and performance specifications"
                    size="xl"
                    footer={
                        <div className="flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={handleCopyMarkdown}
                                >
                                    <Copy size={13} /> Copy Markdown
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleDownloadCsv}
                                >
                                    <Download size={13} /> Export CSV
                                </Button>
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsReportModalOpen(false)}
                            >
                                Close
                            </Button>
                        </div>
                    }
                >
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 overflow-y-auto max-h-[60vh] font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">
                        {generateMarkdownReport()}
                    </div>
                </Modal>
            )}
        </ChartContainer>
    );
};

