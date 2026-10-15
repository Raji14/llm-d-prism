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

import React, { useState, useMemo } from 'react';
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    XAxis,
    YAxis,
    ZAxis,
    Tooltip,
    Cell,
    CartesianGrid,
    ReferenceArea,
    ReferenceLine
} from 'recharts';
import {
    Layers,
    Sparkles,
    Activity,
    SlidersHorizontal,
    ShieldCheck,
    Cpu,
    Zap,
    TrendingUp,
    Filter,
    CheckCircle2,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipRow,
    ChartXAxis,
    ChartYAxis,
    CHART_STATUS,
    getChartTheme,
    gridProps,
    Button,
    Badge
} from '../ui';
import { buildDistributionPoints } from '../../utils/distributionData.js';
import { cn } from '../../utils/cn';

export default function DistributionExplorerChart({
    dataset = [],
    onSelectRecipe
}) {
    const [showFilters, setShowFilters] = useState(false);
    // Selection state
    const [selectedModel, setSelectedModel] = useState('all');
    const [selectedHardware, setSelectedHardware] = useState('all');
    const [selectedEngine, setSelectedEngine] = useState('all');

    // Dimension mapping states
    const [xAxisMetric, setXAxisMetric] = useState('ttft_p50');
    const [yAxisMetric, setYAxisMetric] = useState('tpot_p50');
    const [sizeMetric, setSizeMetric] = useState('tokens_per_sec');
    const [showTrajectories, setShowTrajectories] = useState(true);
    const [enableSlaBox, setEnableSlaBox] = useState(true);

    // SLA Bounding Box Targets
    const [maxTtftSla, setMaxTtftSla] = useState(25);
    const [maxTpotSla, setMaxTpotSla] = useState(12);

    // Build raw multi-dimensional distribution points
    const allDistributionPoints = useMemo(() => {
        return buildDistributionPoints(dataset);
    }, [dataset]);

    // Unique filter options
    const modelOptions = useMemo(() => {
        const set = new Set();
        dataset.forEach(d => {
            if (d.model_family) set.add(d.model_family);
            else if (d.model_name) set.add(d.model_name);
        });
        return Array.from(set);
    }, [dataset]);

    const hardwareOptions = useMemo(() => {
        const set = new Set();
        dataset.forEach(d => {
            if (d.hardware_summary) set.add(d.hardware_summary);
        });
        return Array.from(set);
    }, [dataset]);

    // Filter points based on user scope
    const filteredPoints = useMemo(() => {
        return allDistributionPoints.filter(p => {
            if (selectedModel !== 'all' && p.model_family !== selectedModel && p.model_name !== selectedModel) {
                return false;
            }
            if (selectedHardware !== 'all' && p.hardware_summary !== selectedHardware) {
                return false;
            }
            if (selectedEngine !== 'all' && p.stack?.engine !== selectedEngine) {
                return false;
            }
            return true;
        });
    }, [allDistributionPoints, selectedModel, selectedHardware, selectedEngine]);

    // Compute SLA Compliance count
    const slaStats = useMemo(() => {
        if (!filteredPoints.length) return { pass: 0, total: 0, pct: 0 };
        const passCount = filteredPoints.filter(p => p.ttft_p50 <= maxTtftSla && p.tpot_p50 <= maxTpotSla).length;
        const total = filteredPoints.length;
        const pct = Math.round((passCount / total) * 100);
        return { pass: passCount, total, pct };
    }, [filteredPoints, maxTtftSla, maxTpotSla]);

    // Marginal distribution histograms (bucket counts)
    const ttftHistogram = useMemo(() => {
        if (!filteredPoints.length) return [];
        const buckets = [0, 10, 20, 30, 40, 50, 60, 70, 80];
        return buckets.map((b, i) => {
            const next = buckets[i + 1] || 999;
            const count = filteredPoints.filter(p => p[xAxisMetric] >= b && p[xAxisMetric] < next).length;
            return { range: `${b}-${next}`, count };
        });
    }, [filteredPoints, xAxisMetric]);

    const maxHistCount = Math.max(1, ...ttftHistogram.map(h => h.count));
    const chartTheme = getChartTheme();

    return (
        <div className="bg-slate-900/80 border border-slate-700/60 rounded-2xl shadow-2xl flex flex-col w-full mb-8 overflow-hidden backdrop-blur-sm relative">
            {/* Header Title Row */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center gap-6 shadow-sm">
                <div className="min-w-0">
                    <h3 className="text-slate-200 text-base font-semibold tracking-tight">
                        TTFT vs. TPOT distribution
                    </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                        onClick={() => setShowTrajectories(!showTrajectories)}
                        className={cn('px-2.5 py-1 rounded-lg text-micro font-mono font-medium border transition-colors cursor-pointer', showTrajectories
                                ? 'bg-accent-600/20 text-accent-800 border-accent-600/40'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200')}
                    >
                        Concurrency trajectories
                    </button>
                    <button
                        onClick={() => setEnableSlaBox(!enableSlaBox)}
                        className={cn('px-2.5 py-1 rounded-lg text-micro font-mono font-medium border transition-colors cursor-pointer', enableSlaBox
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200')}
                    >
                        SLA target zone ({slaStats.pct}%)
                    </button>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className="label-caps flex items-center gap-1.5 cursor-pointer"
                    >
                        <span>Filters</span>
                        {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </Button>
                </div>
            </div>

            {/* Streamlined Dimension Mapping & SLA Toolbar (Collapsible, Full-width) */}
            {showFilters && (
                <div className="bg-slate-800/40 border-b border-slate-700/50 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 w-full animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-3.5 flex-wrap">
                        {/* X-Axis Selector */}
                        <div className="flex items-center gap-1.5 font-mono text-micro">
                            <span className="text-slate-400 font-semibold">X-Axis:</span>
                            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                                {['ttft_p50', 'ttft_p90', 'ttft_p99'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setXAxisMetric(m)}
                                        className={cn('px-2 py-0.5 rounded text-tiny font-semibold transition-all cursor-pointer', xAxisMetric === m ? 'bg-accent-600 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white')}
                                    >
                                        {m.toUpperCase().replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Y-Axis Selector */}
                        <div className="flex items-center gap-1.5 font-mono text-micro">
                            <span className="text-slate-400 font-semibold">Y-Axis:</span>
                            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                                {['tpot_p50', 'single_stream_tps'].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setYAxisMetric(m)}
                                        className={cn('px-2 py-0.5 rounded text-tiny font-semibold transition-all cursor-pointer', yAxisMetric === m ? 'bg-accent-600 text-slate-950 shadow-sm' : 'text-slate-400 hover:text-white')}
                                    >
                                        {m === 'tpot_p50' ? 'TPOT (ms)' : 'Output speed (tok/s)'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Bubble Size */}
                        <div className="flex items-center gap-1.5 font-mono text-micro">
                            <span className="text-slate-400 font-semibold">Bubble size:</span>
                            <select
                                value={sizeMetric}
                                onChange={(e) => setSizeMetric(e.target.value)}
                                className="bg-slate-900 border border-slate-700 text-slate-200 rounded-lg px-2 py-1 text-tiny cursor-pointer focus:outline-none focus:border-accent-600"
                            >
                                <option value="tokens_per_sec">Total throughput (tok/s)</option>
                                <option value="tokens_per_dollar">Tokens / dollar ($)</option>
                                <option value="concurrency">Concurrency level (N)</option>
                            </select>
                        </div>
                    </div>

                    {/* SLA Targets Inline Bar */}
                    {enableSlaBox && (
                        <div className="flex items-center gap-3 bg-emerald-950/40 px-3 py-1 rounded-xl border border-emerald-500/30 text-micro font-mono text-emerald-300">
                            <span className="font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> SLA targets:
                            </span>
                            <span>TTFT &le; {maxTtftSla}ms</span>
                            <input
                                type="range"
                                min="15"
                                max="60"
                                value={maxTtftSla}
                                onChange={(e) => setMaxTtftSla(Number(e.target.value))}
                                className="w-16 accent-emerald-400 cursor-pointer h-1.5"
                            />
                            <span>TPOT &le; {maxTpotSla}ms</span>
                            <input
                                type="range"
                                min="6"
                                max="24"
                                value={maxTpotSla}
                                onChange={(e) => setMaxTpotSla(Number(e.target.value))}
                                className="w-16 accent-emerald-400 cursor-pointer h-1.5"
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Top Marginal TTFT Density Mini-Histogram */}
            <div className="h-6 flex items-end gap-1 px-12 mb-1 opacity-70">
                {ttftHistogram.map((h, idx) => {
                    const heightPct = (h.count / maxHistCount) * 100;
                    return (
                        <div
                            key={idx}
                            className="flex-1 bg-accent-600/20 hover:bg-accent-600/40 transition-all rounded-t relative group"
                            style={{ height: `${Math.max(15, heightPct)}%` }}
                            title={`TTFT ${h.range}ms: ${h.count} benchmark runs`}
                        />
                    );
                })}
            </div>

            {/* Main Interactive Scatter Plot Canvas */}
            <div className="w-full h-[400px] relative">
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                        margin={{ top: 20, right: 30, left: 60, bottom: 45 }}
                    >
                        <CartesianGrid {...gridProps()} opacity={0.5} />

                        <ChartXAxis
                            type="number"
                            dataKey={xAxisMetric}
                            name="TTFT Latency"
                            label={xAxisMetric === 'ttft_p50' ? 'Time to First Token (TTFT P50, ms)' : 'Prefill Latency (ms)'}
                        />

                        <ChartYAxis
                            type="number"
                            dataKey={yAxisMetric}
                            name="TPOT Latency"
                            label={yAxisMetric === 'tpot_p50' ? 'Time Per Output Token (TPOT P50, ms)' : 'Single-Stream Output Rate (Tokens/sec)'}
                        />

                        <ZAxis
                            type="number"
                            dataKey={sizeMetric}
                            range={[40, 260]}
                            name={sizeMetric}
                        />

                        {/* Interactive SLA Target Bounding Box */}
                        {enableSlaBox && (
                            <ReferenceArea
                                x1={0}
                                x2={maxTtftSla}
                                y1={0}
                                y2={maxTpotSla}
                                fill={CHART_STATUS.good}
                                fillOpacity={0.08}
                                stroke={CHART_STATUS.good}
                                strokeDasharray="4 4"
                                strokeOpacity={0.5}
                            />
                        )}

                        <Tooltip
                            content={({ active, payload }) => {
                                if (!active || !payload || !payload.length) return null;
                                const item = payload[0]?.payload;
                                if (!item) return null;

                                const count = item.hardware?.accelerator_count || 1;
                                const accMap = {
                                    'nvidia-h100-80gb': 'H100',
                                    'nvidia-a100-80gb': 'A100',
                                    'nvidia-a100-40gb': 'A100 40GB',
                                    'nvidia-l4': 'L4',
                                    'tpu-v6e-trillium': 'TPU v6e',
                                    'tpu-v5e': 'TPU v5e',
                                };
                                const shortHw = `${count}× ${accMap[item.hardware?.accelerator_type] || item.hardware_summary || ''}`;

                                return (
                                    <ChartTooltip
                                        className="min-w-[260px] font-mono text-xs"
                                        title={
                                            <div className="flex items-center justify-between border-b border-theme-border pb-1.5 mb-1.5">
                                                <span className="font-bold text-zinc-900 truncate max-w-[180px]">
                                                    {item.model_family || item.model_name}
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded text-tiny bg-accent-50 text-accent-800 font-bold border border-accent-200">
                                                    {item.concurrencyLabel}
                                                </span>
                                            </div>
                                        }
                                    >
                                        <div className="text-tiny text-zinc-600 font-sans mb-2 flex flex-col gap-0.5">
                                            <div className="flex items-center justify-between gap-2 font-mono">
                                                <span className="text-zinc-900 font-semibold truncate">{shortHw}</span>
                                                <span className="text-accent-700 shrink-0">{item.stack?.engine} TP{item.stack?.tensor_parallel_size || 1}</span>
                                            </div>
                                            <div className="text-zinc-500 truncate">{item.recipe_name}</div>
                                        </div>

                                        <div className="space-y-1">
                                            <ChartTooltipRow
                                                color={item.color}
                                                label="TTFT (P50)"
                                                value={`${item.ttft_p50} ms`}
                                            />
                                            <ChartTooltipRow
                                                color={item.color}
                                                label="TPOT (P50)"
                                                value={`${item.tpot_p50} ms (${item.single_stream_tps} tok/s/user)`}
                                            />
                                            <ChartTooltipRow
                                                color={item.color}
                                                label="Aggregate throughput"
                                                value={`${item.tokens_per_sec.toLocaleString()} tok/s`}
                                            />
                                            <ChartTooltipRow
                                                color={item.color}
                                                label="KV cache usage"
                                                value={`${item.kv_cache_usage_pct}%`}
                                            />
                                            <ChartTooltipRow
                                                color={item.color}
                                                label="Cost / 1M tokens"
                                                value={`$${item.cost_per_1m}`}
                                            />
                                        </div>
                                    </ChartTooltip>
                                );
                            }}
                        />

                        <Scatter
                            name="Serving Configurations"
                            data={filteredPoints}
                            onClick={(point) => {
                                const base = dataset.find(r => r.id === point.recipeId);
                                if (base && onSelectRecipe) onSelectRecipe(base);
                            }}
                            cursor="pointer"
                        >
                            {filteredPoints.map((entry, index) => (
                                <Cell
                                    key={`cell-${index}`}
                                    fill={entry.color}
                                    fillOpacity={entry.isBaseRun ? 0.9 : 0.65}
                                    stroke={entry.isBaseRun ? chartTheme.surface : entry.color}
                                    strokeWidth={entry.isBaseRun ? 1.5 : 1}
                                />
                            ))}
                        </Scatter>
                    </ScatterChart>
                </ResponsiveContainer>
            </div>

            {/* Bottom Legend & SLA Compliance Summary */}
            <div className="px-6 py-3.5 border-t border-slate-800/80 bg-slate-900/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Engine Legend */}
                <div className="flex items-center gap-4 font-mono text-micro">
                    <div className="flex items-center gap-1.5 text-accent-800">
                        <span className="w-2.5 h-2.5 rounded-full bg-accent-700 inline-block shadow-[0_0_8px_rgba(6,182,212,0.6)]" />
                        <span>llm-d</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                        <span>vLLM</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-purple-300">
                        <span className="w-2.5 h-2.5 rounded-full bg-purple-400 inline-block shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                        <span>SGLang</span>
                    </div>
                </div>

                {/* Status Stats */}
                <div className="flex items-center gap-3 text-micro font-mono text-slate-400">
                    <span>Evaluated runs: <strong className="text-white font-bold">{filteredPoints.length}</strong></span>
                    {enableSlaBox && (
                        <span>
                            SLA compliance: <strong className="text-emerald-400 font-bold">{slaStats.pass}/{slaStats.total} ({slaStats.pct}%)</strong>
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
