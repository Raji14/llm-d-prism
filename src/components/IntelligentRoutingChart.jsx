import React, { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
    ToggleGroup,
    StatPills,
    ChartContainer,
    ChartFilterRow,
    ChartFilterGroup,
    ChartCapControl,
    ChartXAxis,
    ChartYAxis,
    ChartTooltip,
    ChartTooltipRow,
    SeriesPercentileLegend,
    CustomSeriesDot,
    CHART_SERIES,
    gridProps,
    cursorProps,
    tooltipProps,
    getAxisConfig,
    GoogleMark,
} from './ui';

// Series colors from the shared CVD-safe chart palette, assigned stably by entity:
// Standard Kubernetes (reference baseline) → amber slot (CHART_SERIES[2])
// Approx. prefix-aware routing (optimized) → sky slot (CHART_SERIES[1])
export const SCENARIO_COLORS = {
    baseline: CHART_SERIES[2], // amber — Standard Kubernetes (Reference)
    router: CHART_SERIES[1],   // sky   — Approx. Prefix-Aware Routing
};

export const SCENARIO_SHAPES = {
    baseline: 'circle',
    router: 'diamond',
};

const RichSchedulingTooltip = ({ active, payload, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;

    const pl = payload[0].payload;
    const hw = pl.hardware || 'H100';
    const model = pl.model_name || 'Qwen3-32B';
    const qpsVal = pl.qps ?? pl.y ?? 'N/A';

    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS' };

    const xLabel = xLabelMap[zoomXAxis] || 'X';
    const yLabel = yLabelMap[zoomYAxis] || 'Y';

    const groups = {
        'Standard K8s (Reference)': [],
        'Approx. Prefix-Aware Routing': [],
        Other: [],
    };

    payload.forEach((entry) => {
        if (entry.name.includes('Standard') || entry.name.includes('Baseline')) {
            groups['Standard K8s (Reference)'].push(entry);
        } else if (entry.name.includes('Prefix') || entry.name.includes('Router')) {
            groups['Approx. Prefix-Aware Routing'].push(entry);
        } else {
            groups.Other.push(entry);
        }
    });

    return (
        <ChartTooltip
            className="min-w-[240px]"
            title={`QPS: ${qpsVal}`}
            subtitle={`${hw} · ${model}${pl.interpolated ? ' · Interpolated' : ''}`}
        >
            <div className="space-y-2.5 pt-1 border-t border-zinc-200">
                {Object.entries(groups).map(([groupName, items]) => {
                    if (items.length === 0) return null;
                    return (
                        <div key={groupName} className="space-y-1">
                            {groupName !== 'Other' && (
                                <div className="label-caps text-zinc-500 pb-0.5">
                                    {groupName}
                                </div>
                            )}
                            {items.map((entry, index) => {
                                const epl = entry.payload;
                                const xVal = epl.dynamic_x ?? epl.x;
                                const yVal = epl.dynamic_y ?? epl.y;

                                let label = entry.name;
                                if (groupName !== 'Other') {
                                    label = label
                                        .replace('Standard Kubernetes ', '')
                                        .replace('Approx. prefix aware routing ', '')
                                        .replace('Baseline ', '')
                                        .replace('Router ', '')
                                        .replace(/[()]/g, '');
                                }

                                return (
                                    <ChartTooltipRow
                                        key={index}
                                        color={entry.stroke || entry.fill}
                                        label={label}
                                        value={
                                            xVal !== undefined && yVal !== undefined
                                                ? `${xLabel}: ${typeof xVal === 'number' ? xVal.toFixed(1) : xVal} ms · ${yLabel}: ${typeof yVal === 'number' ? Math.round(yVal).toLocaleString() : yVal}`
                                                : `${Number(entry.value ?? xVal).toFixed(1)} ms`
                                        }
                                    />
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </ChartTooltip>
    );
};

const IntelligentRoutingChart = ({
    data,
    initialXAxis,
    initialYAxis,
    initialLogScale,
    metadata,
}) => {
    const [zoomXAxis, setZoomXAxis] = useState(initialXAxis || 'tpot');
    const [zoomYAxis, setZoomYAxis] = useState(initialYAxis || 'output');
    const [zoomLogScale, setZoomLogScale] = useState(Boolean(initialLogScale));
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [zoomXMax, setZoomXMax] = useState(Infinity);
    const [showFilters, setShowFilters] = useState(true);

    const displayMetadata = metadata
        ? {
              machineType: metadata.machineType || 'a3-highgpu-8g',
              accelerator: metadata.accelerator || data?.[0]?.hardware || 'NVIDIA H100',
              replicas: metadata.replicas ?? 8,
              model: metadata.model || data?.[0]?.model_name || 'Qwen3-32B',
              precision: metadata.precision || 'BF16',
              engine: metadata.engine || 'vLLM',
          }
        : {
              machineType: 'a3-highgpu-8g',
              accelerator: 'NVIDIA H100',
              replicas: 8,
              model: 'Qwen3-32B',
              precision: 'BF16',
              engine: 'vLLM',
          };

    useEffect(() => {
        if (zoomXAxis === 'ntpot' && initialLogScale === undefined) {
            setZoomLogScale(true);
        }
    }, [zoomXAxis, initialLogScale]);

    const isPercentileAxis = ['ttft', 'tpot', 'itl', 'ntpot', 'e2e'].includes(zoomXAxis);

    const derivedZoomData = useMemo(() => {
        return (data || [])
            .flatMap((item) => {
                const chipDivisor = zoomPerChip ? 4 : 1;

                const parseNum = (val, fallback = 0) => {
                    const parsed = parseFloat(val);
                    return isNaN(parsed) ? fallback : parsed;
                };

                const b_outputRate = parseNum(item.baseline_output_token_rate, 0);
                const r_outputRate = parseNum(item.router_output_token_rate, 0);
                const b_inputRate = parseNum(
                    item.baseline_input_token_rate,
                    parseNum(item.qps, 0) * 512
                );
                const r_inputRate = parseNum(
                    item.router_input_token_rate,
                    parseNum(item.qps, 0) * 512
                );

                let b_yVal = b_outputRate;
                if (zoomYAxis === 'input') b_yVal = b_inputRate;
                else if (zoomYAxis === 'total') b_yVal = b_inputRate + b_outputRate;
                else if (zoomYAxis === 'qps') b_yVal = parseNum(item.qps, 0);

                let r_yVal = r_outputRate;
                if (zoomYAxis === 'input') r_yVal = r_inputRate;
                else if (zoomYAxis === 'total') r_yVal = r_inputRate + r_outputRate;
                else if (zoomYAxis === 'qps') r_yVal = parseNum(item.qps, 0);

                if (zoomPerChip) {
                    b_yVal = b_yVal / chipDivisor;
                    r_yVal = r_yVal / chipDivisor;
                }

                const percentilesToGenerate = isPercentileAxis
                    ? ['p50', 'p90', 'p99']
                    : ['p50'];
                const res = [];

                percentilesToGenerate.forEach((pKey) => {
                    const b_tpotVal = parseNum(item[`baseline_tpot_${pKey}`], 20);
                    const r_tpotVal = parseNum(item[`router_tpot_${pKey}`], 20);
                    const b_ntpotVal = parseNum(item[`baseline_ntpot_${pKey}`], 20);
                    const r_ntpotVal = parseNum(item[`router_ntpot_${pKey}`], 20);
                    const b_ttftVal = parseNum(item[`baseline_ttft_${pKey}`], 250);
                    const r_ttftVal = parseNum(item[`router_ttft_${pKey}`], 250);
                    const b_itlVal = parseNum(item[`baseline_itl_${pKey}`], 25);
                    const r_itlVal = parseNum(item[`router_itl_${pKey}`], 25);

                    let b_xVal = parseNum(item.qps, 0);
                    if (zoomXAxis === 'tpot') b_xVal = b_tpotVal;
                    else if (zoomXAxis === 'ntpot') b_xVal = b_ntpotVal;
                    else if (zoomXAxis === 'ttft') b_xVal = b_ttftVal;
                    else if (zoomXAxis === 'itl') b_xVal = b_itlVal;
                    else if (zoomXAxis === 'tokens_sec') b_xVal = b_outputRate || 1000;
                    else if (zoomXAxis === 'e2e') b_xVal = b_ttftVal + b_tpotVal * 128;

                    let r_xVal = parseNum(item.qps, 0);
                    if (zoomXAxis === 'tpot') r_xVal = r_tpotVal;
                    else if (zoomXAxis === 'ntpot') r_xVal = r_ntpotVal;
                    else if (zoomXAxis === 'ttft') r_xVal = r_ttftVal;
                    else if (zoomXAxis === 'itl') r_xVal = r_itlVal;
                    else if (zoomXAxis === 'tokens_sec') r_xVal = r_outputRate || 1000;
                    else if (zoomXAxis === 'e2e') r_xVal = r_ttftVal + r_tpotVal * 128;

                    const hasBaseline = item[`baseline_ttft_${pKey}`] !== undefined;
                    const hasRouter = item[`router_ttft_${pKey}`] !== undefined;

                    if (hasBaseline) {
                        res.push({
                            ...item,
                            type: 'baseline',
                            percentile: pKey.toUpperCase(),
                            dynamic_x: parseFloat(b_xVal.toFixed(4)),
                            dynamic_y: parseFloat(b_yVal.toFixed(4)),
                        });
                    }
                    if (hasRouter) {
                        res.push({
                            ...item,
                            type: 'router',
                            percentile: pKey.toUpperCase(),
                            dynamic_x: parseFloat(r_xVal.toFixed(4)),
                            dynamic_y: parseFloat(r_yVal.toFixed(4)),
                        });
                    }
                });

                return res;
            })
            .filter((d) => !isNaN(d.dynamic_x) && !isNaN(d.dynamic_y))
            .sort((a, b) => a.dynamic_x - b.dynamic_x);
    }, [data, zoomXAxis, zoomYAxis, zoomPerChip, isPercentileAxis]);

    const rawDataMax =
        derivedZoomData.length > 0
            ? Math.max(...derivedZoomData.map((d) => d.dynamic_x))
            : 100;
    const dataMax = Math.max(10, Math.ceil(rawDataMax * 1.15));
    const step = Math.max(1, Math.round(dataMax / 50));
    const deferredZoomXMax = React.useDeferredValue(zoomXMax);
    const currentMax = deferredZoomXMax === Infinity ? dataMax : deferredZoomXMax;

    const visibleZoomData = useMemo(() => {
        return derivedZoomData.filter(
            (d) =>
                d.dynamic_x <= currentMax &&
                (!isPercentileAxis || visiblePercentiles.includes(d.percentile))
        );
    }, [derivedZoomData, currentMax, isPercentileAxis, visiblePercentiles]);

    const xAxisConfig = useMemo(() => {
        const vals = visibleZoomData.map((d) => d.dynamic_x);
        const cfg = getAxisConfig(vals, zoomLogScale);
        if (zoomXMax !== Infinity && !zoomLogScale) {
            return { ...cfg, domain: [0, currentMax] };
        }
        return cfg;
    }, [visibleZoomData, zoomLogScale, zoomXMax, currentMax]);

    const yAxisConfig = useMemo(() => {
        const vals = visibleZoomData.map((d) => d.dynamic_y);
        return getAxisConfig(vals, false);
    }, [visibleZoomData]);

    const xLabels = {
        tpot: 'Time Per Output Token (TPOT, ms — lower is better)',
        ntpot: 'Normalized TPOT (NTPOT, ms — lower is better)',
        ttft: 'Time To First Token (TTFT, ms — lower is better)',
        itl: 'Inter-Token Latency (ITL, ms — lower is better)',
        e2e: 'End-to-End Latency (E2E, ms — lower is better)',
        qps: 'Queries Per Second (QPS)',
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
            kicker="Routing telemetry"
            title={`${yTitleLabels[zoomYAxis] || zoomYAxis} vs. ${xTitleLabels[zoomXAxis] || zoomXAxis} (${zoomLogScale ? 'Log' : 'Linear'})`}
            subtitle="Comparing Standard Kubernetes service routing against GKE Inference Gateway prefix-cache-aware routing."
            metaPills={
                <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-micro font-medium text-zinc-700">
                        <GoogleMark className="w-3 h-3" />
                        <span>{displayMetadata.machineType}</span>
                        <span className="text-zinc-400">·</span>
                        <span>{displayMetadata.accelerator}</span>
                        {displayMetadata.replicas !== undefined && (
                            <span className="text-zinc-600">({displayMetadata.replicas} replicas)</span>
                        )}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-micro font-medium text-zinc-700">
                        <span>
                            {displayMetadata.model?.split('/').pop()?.split('-Instruct')[0]}
                        </span>
                        {displayMetadata.precision && (
                            <span className="text-zinc-600">({displayMetadata.precision})</span>
                        )}
                        {displayMetadata.engine && (
                            <>
                                <span className="text-zinc-400">·</span>
                                <span>{displayMetadata.engine}</span>
                            </>
                        )}
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
                                onChange={(val) => {
                                    setZoomYAxis(val);
                                    setZoomXMax(Infinity);
                                }}
                            />
                        </ChartFilterGroup>

                        <ChartCapControl
                            label="Cap:"
                            value={Math.round(currentMax)}
                            min={Math.max(10, Math.round(dataMax * 0.1))}
                            max={dataMax}
                            step={step}
                            unit="ms"
                            isAuto={zoomXMax === Infinity}
                            onAutoToggle={() =>
                                setZoomXMax(zoomXMax === Infinity ? Math.round(dataMax * 0.8) : Infinity)
                            }
                            onChange={(val) => setZoomXMax(val)}
                        />
                    </ChartFilterRow>
                </>
            }
            footer={
                <SeriesPercentileLegend
                    series={[
                        {
                            key: 'baseline',
                            label: 'Standard Kubernetes',
                            color: SCENARIO_COLORS.baseline,
                            shape: SCENARIO_SHAPES.baseline,
                        },
                        {
                            key: 'router',
                            label: 'Approx. prefix aware routing',
                            color: SCENARIO_COLORS.router,
                            shape: SCENARIO_SHAPES.router,
                        },
                    ]}
                    percentiles={['P50', 'P90', 'P99']}
                    activePercentiles={visiblePercentiles}
                    onTogglePercentile={handleTogglePercentile}
                />
            }
        >
            <div className="relative w-full h-[380px] select-none">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart margin={{ top: 20, right: 30, left: 60, bottom: 45 }}>
                        <CartesianGrid {...gridProps()} />
                        <ChartXAxis
                            type="number"
                            dataKey="dynamic_x"
                            label={xLabels[zoomXAxis] || 'Latency (ms)'}
                            domain={xAxisConfig.domain}
                            scale={zoomLogScale ? 'log' : 'auto'}
                            ticks={xAxisConfig.ticks}
                            tickFormatter={xAxisConfig.tickFormatter}
                            allowDataOverflow
                        />
                        <ChartYAxis
                            label={yLabels[zoomYAxis] || 'Throughput (tok/s)'}
                            domain={yAxisConfig.domain}
                            ticks={yAxisConfig.ticks}
                            tickFormatter={yAxisConfig.tickFormatter}
                        />
                        <Tooltip
                            {...tooltipProps()}
                            cursor={cursorProps()}
                            content={
                                <RichSchedulingTooltip
                                    zoomXAxis={zoomXAxis}
                                    zoomYAxis={zoomYAxis}
                                />
                            }
                        />
                        {(() => {
                            const groups = {};
                            visibleZoomData.forEach((pt) => {
                                const prefix =
                                    pt.type === 'baseline'
                                        ? 'Standard Kubernetes'
                                        : 'Approx. prefix aware routing';
                                const key = isPercentileAxis
                                    ? `${prefix} (${pt.percentile})`
                                    : prefix;
                                if (!groups[key]) groups[key] = [];
                                groups[key].push(pt);
                            });

                            return Object.keys(groups).map((k) => {
                                const isBaseline = k.includes('Standard Kubernetes');
                                const strokeColor = isBaseline
                                    ? SCENARIO_COLORS.baseline
                                    : SCENARIO_COLORS.router;
                                const markerShape = isBaseline
                                    ? SCENARIO_SHAPES.baseline
                                    : SCENARIO_SHAPES.router;

                                let dashArray;
                                if (k.includes('P90')) {
                                    dashArray = '6 4';
                                } else if (k.includes('P99')) {
                                    dashArray = '2 3';
                                }

                                groups[k].sort((a, b) => {
                                    if (a.stage !== undefined && b.stage !== undefined) {
                                        return a.stage - b.stage;
                                    }
                                    return a.dynamic_x - b.dynamic_x;
                                });

                                return (
                                    <Line
                                        key={k}
                                        data={groups[k]}
                                        type="monotone"
                                        dataKey="dynamic_y"
                                        name={k}
                                        stroke={strokeColor}
                                        strokeDasharray={dashArray}
                                        strokeWidth={k.includes('P50') || !isPercentileAxis ? 2.5 : 2}
                                        dot={<CustomSeriesDot shape={markerShape} r={3.8} />}
                                        activeDot={<CustomSeriesDot shape={markerShape} r={5.5} />}
                                        isAnimationActive={false}
                                    />
                                );
                            });
                        })()}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </ChartContainer>
    );
};

export default IntelligentRoutingChart;
