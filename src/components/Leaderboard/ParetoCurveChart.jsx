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

import React, { useState, useRef } from 'react';
import {
    ResponsiveContainer,
    Scatter,
    ZAxis,
    Tooltip,
    Cell,
    Line,
    ComposedChart,
    CartesianGrid
} from 'recharts';
import { Sparkles, Download } from 'lucide-react';
import {
    ChartContainer,
    ChartXAxis,
    ChartYAxis,
    ChartTooltip,
    ChartTooltipRow,
    ChartLegend,
    ToggleGroup,
    Button,
    CHART_SERIES,
    gridProps,
    tooltipProps
} from '../ui';
import { generateParetoCurvePoints, getMetricValue } from '../../utils/paretoFrontier.js';
import { TIER_CONFIG } from '../../utils/gamificationEngine.js';

// Canonical Prism chart palette mapped stably to accelerator entities
const HARDWARE_COLORS = {
    'nvidia-h100-80gb': CHART_SERIES[2], // Amber (#d97706)
    'nvidia-a100-80gb': CHART_SERIES[3], // Violet (#7c3aed)
    'nvidia-a100-40gb': CHART_SERIES[3], // Violet (#7c3aed)
    'nvidia-l4': CHART_SERIES[1],        // Sky (#0284c7)
    'tpu-v6e-trillium': CHART_SERIES[0], // Emerald (#059669)
    'tpu-v5e': CHART_SERIES[4],          // Pink (#db2777)
    'other': '#64748b'                   // Slate
};

const LEGEND_ENTRIES = [
    { label: 'NVIDIA H100 (80GB)', color: CHART_SERIES[2] },
    { label: 'NVIDIA A100 (80GB/40GB)', color: CHART_SERIES[3] },
    { label: 'NVIDIA L4 (24GB)', color: CHART_SERIES[1] },
    { label: 'Google TPU v6e (Trillium)', color: CHART_SERIES[0] },
    { label: 'Google TPU v5e (Lite Pod)', color: CHART_SERIES[4] },
];

const ParetoChartTooltip = ({ active, payload, latencyLabel, throughputLabel }) => {
    if (!active || !payload || !payload.length) return null;

    const data = payload[0].payload;
    const item = data.item || data;

    if (!item || !item.recipe_name) return null;

    const tier = item.tier || 'Explorer';
    const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.Explorer;
    const isPareto = Boolean(item.isParetoOptimal);
    const color = data.color || CHART_SERIES[2];

    return (
        <ChartTooltip
            className="min-w-[240px] font-mono"
            title={
                <div className="flex items-center justify-between gap-2 border-b border-theme-border pb-1.5 mb-1.5">
                    <span className="truncate text-xs font-bold text-theme-text">{item.recipe_name}</span>
                    {isPareto && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-400/40 shrink-0">
                            SOTA
                        </span>
                    )}
                </div>
            }
        >
            <div className="text-[10px] text-theme-muted mb-2 font-sans flex items-center justify-between">
                <span>By @{item.author?.username || 'engineer'}</span>
                <span className="font-mono text-cyan-400">{item.stack?.engine?.toUpperCase()} (TP={item.stack?.tensor_parallel_size || 1})</span>
            </div>

            <div className="space-y-1">
                <ChartTooltipRow
                    color={color}
                    label={latencyLabel}
                    value={item.ttft_p50 ? item.ttft_p50.toFixed(1) : 'N/A'}
                    unit=" ms"
                />
                <ChartTooltipRow
                    color={color}
                    label={throughputLabel}
                    value={Math.round(item.tokens_per_sec || 0)}
                    unit=" tok/s"
                />
                <ChartTooltipRow
                    color={color}
                    label="Cost / 1M Output"
                    value={`$${item.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3) || '0.00'}`}
                />
                <ChartTooltipRow
                    color={color}
                    label="Tokens / Dollar"
                    value={Math.round(item.cost_analysis?.tokens_per_dollar || 0)}
                />
            </div>

            <div className="mt-2 pt-1.5 border-t border-theme-border text-[10px] text-theme-muted flex items-center justify-between font-sans">
                <span className="truncate">{item.hardware_summary}</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${tierConfig.badgeBg} ${tierConfig.badgeText} border ${tierConfig.badgeBorder}`}>
                    {tier}
                </span>
            </div>
        </ChartTooltip>
    );
};

export default function ParetoCurveChart({
    dataset,
    latencyMetric = 'ttft_p50',
    throughputMetric = 'tokens_per_sec',
    onSelectRecipe,
    selectedRecipe
}) {
    const [scaleMode, setScaleMode] = useState('linear');
    const useLogScale = scaleMode === 'log';
    const chartContainerRef = useRef(null);

    const latencyLabels = {
        ttft_p50: 'TTFT P50',
        ttft_p90: 'TTFT P90',
        ttft_mean: 'TTFT MEAN',
        itl_p50: 'ITL P50'
    };

    const throughputLabels = {
        tokens_per_sec: 'AGGREGATE THROUGHPUT (TOK/S)',
        output_tokens_per_sec: 'OUTPUT TOKEN RATE (TOK/S)',
        tokens_per_dollar: 'TOKENS PER DOLLAR ($)'
    };

    // Prepare chart data
    const chartData = (dataset || []).map(item => {
        const x = getMetricValue(item, latencyMetric);
        const y = getMetricValue(item, throughputMetric);
        const accId = item.hardware?.accelerator_type || 'other';
        const color = HARDWARE_COLORS[accId] || HARDWARE_COLORS['other'];

        return {
            x,
            y,
            z: Math.max(100, (item.hardware?.accelerator_count || 1) * 30),
            color,
            isParetoOptimal: Boolean(item.isParetoOptimal),
            item
        };
    });

    // Generate Stepwise Pareto curve connecting lines
    const paretoCurvePoints = generateParetoCurvePoints(dataset, latencyMetric, throughputMetric);

    const handleExportSVG = () => {
        const chartElem = chartContainerRef.current?.querySelector('svg');
        if (chartElem) {
            const svgData = new XMLSerializer().serializeToString(chartElem);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const svgUrl = URL.createObjectURL(svgBlob);
            const link = document.createElement('a');
            link.href = svgUrl;
            link.download = `prism-pareto-frontier-${latencyMetric}-vs-${throughputMetric}.svg`;
            link.click();
        }
    };

    return (
        <ChartContainer
            title="Pareto Optimization Frontier (Latency vs. Throughput)"
            subtitle="Convex hull non-dominated boundary identifying mathematically optimal serving configurations"
            className="mb-6"
            actions={
                <div className="flex items-center gap-3">
                    <ToggleGroup
                        size="sm"
                        value={scaleMode}
                        onChange={setScaleMode}
                        options={[
                            { value: 'linear', label: 'Linear' },
                            { value: 'log', label: 'Log Scale' },
                        ]}
                    />

                    <Button
                        variant="secondary"
                        size="xs"
                        onClick={handleExportSVG}
                        title="Download Chart as SVG Image"
                        className="flex items-center gap-1.5"
                    >
                        <Download className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Export SVG</span>
                    </Button>
                </div>
            }
        >
            {/* Chart Canvas */}
            <div ref={chartContainerRef} className="h-[440px] w-full relative bg-slate-950/30 rounded-xl p-2 border border-slate-800/40">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                        margin={{ top: 20, right: 30, left: 65, bottom: 45 }}
                    >
                        <CartesianGrid {...gridProps()} opacity={0.5} />
                        <ChartXAxis
                            dataKey="x"
                            type="number"
                            name={latencyLabels[latencyMetric]}
                            scale={useLogScale ? 'log' : 'auto'}
                            domain={['dataMin - 2', 'dataMax + 10']}
                            label={`${latencyLabels[latencyMetric]} (MS) — LOWER IS BETTER`}
                        />
                        <ChartYAxis
                            dataKey="y"
                            type="number"
                            name={throughputLabels[throughputMetric]}
                            scale={useLogScale ? 'log' : 'auto'}
                            domain={['dataMin * 0.9', 'dataMax * 1.1']}
                            tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}
                            label={`${throughputLabels[throughputMetric]} — HIGHER IS BETTER`}
                        />
                        <ZAxis dataKey="z" range={[80, 260]} />
                        <Tooltip
                            {...tooltipProps()}
                            wrapperStyle={{ outline: 'none', zIndex: 100 }}
                            cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4' }}
                            isAnimationActive={false}
                            content={
                                <ParetoChartTooltip
                                    latencyLabel={latencyLabels[latencyMetric]}
                                    throughputLabel={throughputLabels[throughputMetric]}
                                />
                            }
                        />

                        {/* Stepped Pareto Frontier Line */}
                        {paretoCurvePoints.length > 1 && (
                            <Line
                                data={paretoCurvePoints}
                                type="stepAfter"
                                dataKey="y"
                                stroke="#f59e0b"
                                strokeWidth={2}
                                strokeDasharray="4 4"
                                dot={false}
                                isAnimationActive={false}
                                name="Pareto Frontier Boundary"
                            />
                        )}

                        {/* Scatter points for all configurations */}
                        <Scatter
                            name="Serving Configurations"
                            data={chartData}
                            isAnimationActive={false}
                            onClick={(node) => {
                                if (node && node.item && onSelectRecipe) {
                                    onSelectRecipe(node.item);
                                }
                            }}
                            cursor="pointer"
                        >
                            {chartData.map((entry, index) => {
                                const isSelected = selectedRecipe && selectedRecipe.id === entry.item.id;
                                return (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.color}
                                        stroke={isSelected ? '#38bdf8' : (entry.isParetoOptimal ? '#fbbf24' : '#0f172a')}
                                        strokeWidth={isSelected ? 3 : (entry.isParetoOptimal ? 2 : 1.5)}
                                        fillOpacity={isSelected ? 1 : (entry.isParetoOptimal ? 0.95 : 0.85)}
                                    />
                                );
                            })}
                        </Scatter>
                    </ComposedChart>
                </ResponsiveContainer>
            </div>

            {/* Standard Swatch Legend Footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-800/80 text-xs">
                <ChartLegend entries={LEGEND_ENTRIES} />
            </div>
        </ChartContainer>
    );
}
