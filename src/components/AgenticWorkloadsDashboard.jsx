import React, { useState, useMemo, useEffect } from 'react';
import {
    LineChart, Line, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    ExternalLink, Check, Code,
} from 'lucide-react';
import {
    WellLitHeader,
    Button,
    Badge,
    Modal,
    ToggleGroup,
    StatPills,
    Spinner,
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
    seriesColor,
    gridProps,
    cursorProps,
    tooltipProps,
    getChartTheme,
    getAxisConfig,
    GoogleMark,
} from './ui';
import { cn } from '../utils/cn';
import { scanAgenticWorkloads } from '../utils/gcsScanner';
import { getLocalDashboardRuns } from '../utils/dashboardHelpers';
import { FALLBACK_AGENTIC_DATA } from '../utils/wellLitPathData.js';

const SCENARIOS = [
    {
        id: 0,
        name: 'K8s Service (Reference)',
        description: 'Standard Kubernetes round-robin service endpoint',
    },
    {
        id: 1,
        name: 'llm-d Routing',
        description: 'Prefix & KV-cache-aware cluster gateway routing',
        guideUrl: 'https://github.com/llm-d/llm-d/tree/main/guides/agentic-serving',
    },
    {
        id: 2,
        name: 'Combined Optimizations',
        description: 'Pallas kernels + stream-load + FP8 quantization',
        guideUrl: 'https://github.com/llm-d/llm-d/tree/main/guides/agentic-serving',
    },
];

// Shared CVD-safe chart palette slots, assigned stably by scenario id:
export const SCENARIO_COLORS = {
    0: seriesColor(2), // amber   — K8s Service (Reference)
    1: seriesColor(1), // sky     — llm-d Routing
    2: seriesColor(0), // emerald — Combined Optimizations
};

export const SCENARIO_SHAPES = {
    0: 'circle',
    1: 'diamond',
    2: 'triangle',
};

const RECIPE_VLLM = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: qwen3-coder-m2
spec:
  replicas: 4
  template:
    spec:
      containers:
      - name: vllm-server
        image: vllm/vllm-openai:nightly
        command:
        - python3
        - -m
        - vllm.entrypoints.openai.api_server
        args:
        - --model=Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8
        - --tensor-parallel-size=8
        - --max-model-len=164000
        - --gpu-memory-utilization=0.95
        - --enable-chunked-prefill
        - --served-model-name=agentic-code-gen
        - --kv-cache-dtype=fp8`;

const RECIPE_K8S = `apiVersion: v1
kind: Pod
metadata:
  name: tpu7x-affinity-pod
spec:
  nodeSelector:
    cloud.google.com/gke-accelerator: tpu-v7x
    cloud.google.com/machine-family: tpu7x-standard-8
  tolerations:
  - key: "google.com/tpu"
    operator: "Equal"
    value: "present"
    effect: "NoSchedule"
  resources:
    requests:
      google.com/tpu: "4"
    limits:
      google.com/tpu: "4"`;

const RECIPE_TRAFFIC = `use_case: Agentic Code Generation (Simulating InferenceX ProxyTrace)
concurrency: 40
turns: 20
distribution: lognormal
input_length: 163000
output_length: 425
shared_system_prompt: 3000
replay_config:
  test_harness: inference-perf
  rate_limit: none`;

const getLatencyValue = (report, metric, percentile) => {
    const pKey = percentile.toLowerCase();
    return report?.[metric]?.[pKey] || 0;
};

const getThroughputValue = (report, metric) => {
    return report?.throughput?.[metric] || 0;
};

const RichAgentWorkloadTooltip = ({ active, payload, metadata, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;

    const firstPayload = payload[0]?.payload || {};
    const scenarioTitle = firstPayload.scenarioName || 'Agentic Serving';
    const concStr = firstPayload.concurrency != null ? `Concurrency: ${firstPayload.concurrency}` : '';
    const ctxStr = metadata?.inputLengthMean ? `${Math.round(metadata.inputLengthMean / 1000)}k ctx` : '163k ctx';

    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS' };
    const xLabel = xLabelMap[zoomXAxis] || 'Latency';
    const yLabel = yLabelMap[zoomYAxis] || 'Throughput';

    return (
        <ChartTooltip
            className="min-w-[240px]"
            title={`${scenarioTitle} (${firstPayload.percentile || 'P50'})`}
            subtitle={[
                metadata?.machineType || 'tpu7x-standard-8',
                concStr,
                ctxStr,
            ]
                .filter(Boolean)
                .join(' · ')}
        >
            <div className="space-y-1.5 pt-1 border-t border-zinc-200">
                <ChartTooltipRow
                    color={payload[0].stroke || payload[0].fill}
                    label={xLabel}
                    value={`${typeof firstPayload.dynamic_x === 'number' ? firstPayload.dynamic_x.toFixed(1) : firstPayload.dynamic_x} ms`}
                />
                <ChartTooltipRow
                    color={payload[0].stroke || payload[0].fill}
                    label={yLabel}
                    value={
                        zoomYAxis === 'qps'
                            ? `${Number(firstPayload.dynamic_y).toFixed(2)} QPS`
                            : `${Math.round(Number(firstPayload.dynamic_y)).toLocaleString()} tok/s`
                    }
                />
            </div>
        </ChartTooltip>
    );
};

function AgenticTelemetryChart({
    data,
    metadata,
    activeTiers,
    initialXAxis = 'ntpot',
    initialYAxis = 'total',
    initialLogScale = true,
}) {
    const [zoomXAxis, setZoomXAxis] = useState(initialXAxis);
    const [zoomYAxis, setZoomYAxis] = useState(initialYAxis);
    const [zoomLogScale, setZoomLogScale] = useState(Boolean(initialLogScale));
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [zoomXMax, setZoomXMax] = useState(Infinity);
    const [showFilters, setShowFilters] = useState(true);

    const activeScenarioList = useMemo(() => {
        return SCENARIOS.filter((s) => activeTiers[s.id]);
    }, [activeTiers]);

    const derivedPoints = useMemo(() => {
        const points = [];
        activeScenarioList.forEach((s) => {
            const scenarioData = (data || []).filter((d) => d.scenarioId === s.id);
            ['P50', 'P90', 'P99'].forEach((pKey) => {
                const pField = pKey.toLowerCase();
                scenarioData.forEach((d) => {
                    const chipDivisor = zoomPerChip
                        ? Math.max(Number(d.acceleratorCount || d.replicas) || 8, 1)
                        : 1;
                    const xVal = d[zoomXAxis]?.[pField] || 0;
                    const yVal = getThroughputValue(d, zoomYAxis) / chipDivisor;

                    if (xVal > 0 && yVal > 0) {
                        points.push({
                            scenarioId: s.id,
                            scenarioName: s.name,
                            percentile: pKey,
                            concurrency: d.concurrency,
                            dynamic_x: parseFloat(xVal.toFixed(2)),
                            dynamic_y: parseFloat(yVal.toFixed(2)),
                        });
                    }
                });
            });
        });
        return points.sort((a, b) => a.dynamic_x - b.dynamic_x);
    }, [data, activeScenarioList, zoomXAxis, zoomYAxis, zoomPerChip]);

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

    const legendItems = activeScenarioList.map((s) => ({
        key: `scenario-${s.id}`,
        label: s.name,
        color: SCENARIO_COLORS[s.id],
        shape: SCENARIO_SHAPES[s.id],
    }));

    return (
        <ChartContainer
            kicker="Agentic serving telemetry"
            title={`${yTitleLabels[zoomYAxis] || zoomYAxis} vs. ${xTitleLabels[zoomXAxis] || zoomXAxis} (${zoomLogScale ? 'Log' : 'Linear'})`}
            subtitle="Throughput vs. latency Pareto curves across multi-turn agentic code generation runs."
            metaPills={
                <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-sans text-micro font-medium text-zinc-700">
                        <GoogleMark className="w-3 h-3" />
                        <span>{metadata?.machineType || 'tpu7x-standard-8'}</span>
                        <span className="text-zinc-400">·</span>
                        <span>{metadata?.accelerator?.toUpperCase() || 'TPU7X'} ({metadata?.replicas || 8} replicas)</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-sans text-micro font-medium text-zinc-700">
                        <span>{metadata?.model?.split('/').pop()?.split('-Instruct')[0] || 'Qwen3-Coder-480B'} (FP8)</span>
                        <span className="text-zinc-400">·</span>
                        <span>vLLM</span>
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
                            min={Math.max(1, Math.round(dataMax * 0.05))}
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
                    series={legendItems}
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
                            tickFormatter={xAxisConfig.tickFormatter}
                            allowDataOverflow
                            label={xLabels[zoomXAxis]}
                        />
                        <ChartYAxis
                            dataKey="dynamic_y"
                            type="number"
                            domain={yAxisConfig.domain}
                            ticks={yAxisConfig.ticks}
                            tickFormatter={yAxisConfig.tickFormatter}
                            label={yLabels[zoomYAxis]}
                        />
                        <Tooltip
                            {...tooltipProps()}
                            cursor={cursorProps()}
                            content={
                                <RichAgentWorkloadTooltip
                                    metadata={metadata}
                                    zoomXAxis={zoomXAxis}
                                    zoomYAxis={zoomYAxis}
                                />
                            }
                        />
                        {activeScenarioList.map((s) =>
                            ['P50', 'P90', 'P99'].map((pKey) => {
                                if (!visiblePercentiles.includes(pKey)) return null;
                                const lineData = visiblePoints
                                    .filter((d) => d.scenarioId === s.id && d.percentile === pKey)
                                    .sort((a, b) => a.dynamic_x - b.dynamic_x);
                                if (!lineData.length) return null;
                                const strokeDasharray =
                                    pKey === 'P90' ? '6 4' : pKey === 'P99' ? '2 3' : undefined;
                                return (
                                    <Line
                                        key={`${s.id}-${pKey}`}
                                        data={lineData}
                                        type="monotone"
                                        dataKey="dynamic_y"
                                        name={`${s.name} (${pKey})`}
                                        stroke={SCENARIO_COLORS[s.id]}
                                        strokeWidth={pKey === 'P50' ? 2.5 : 1.75}
                                        strokeDasharray={strokeDasharray}
                                        dot={
                                            <CustomSeriesDot
                                                shape={SCENARIO_SHAPES[s.id]}
                                                r={pKey === 'P50' ? 3.8 : 3.25}
                                            />
                                        }
                                        activeDot={
                                            <CustomSeriesDot
                                                shape={SCENARIO_SHAPES[s.id]}
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

export default function AgenticWorkloadsDashboard({ onNavigateBack, onNavigate, onToggleMobileNav, dashboardData }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeRecipeTab, setActiveRecipeTab] = useState(0);
    const [copiedStates, setCopiedStates] = useState({});

    const [tableMetricMode, setTableMetricMode] = useState('ttft');
    const [selectedPercentile, setSelectedPercentile] = useState('P90');
    const [sortConfig, setSortConfig] = useState({ key: 'concurrency', direction: 'asc' });
    const [selectedConcurrency, setSelectedConcurrency] = useState(null);

    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const reports = await scanAgenticWorkloads();

                // Get local runs targeting agentic-serving
                const localRuns = dashboardData?.brv02Runs
                    ? getLocalDashboardRuns(dashboardData.brv02Runs, 'agentic-serving')
                    : [];

                const combinedReports = [...reports, ...localRuns];
                const effectiveReports = combinedReports.length > 0 ? combinedReports : FALLBACK_AGENTIC_DATA;
                setData(effectiveReports);

                if (effectiveReports.length > 0) {
                    const concurrencies = [...new Set(effectiveReports.map((r) => r.concurrency))].sort((a, b) => a - b);
                    setSelectedConcurrency(concurrencies[concurrencies.length - 1]);
                }
            } catch (e) {
                console.error('Failed to load agentic workloads data:', e);
                setData(FALLBACK_AGENTIC_DATA);
                setSelectedConcurrency(60);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [dashboardData?.brv02Runs]);

    const metadata = useMemo(() => {
        if (!data.length) return null;
        const first = data[0];
        return {
            model: first.model,
            accelerator: first.accelerator,
            machineType: first.machineType,
            replicas: first.replicas,
            inputLengthMean: first.inputLengthMean,
            outputLengthMean: first.outputLengthMean,
        };
    }, [data]);

    const concurrencyLevels = useMemo(() => {
        return [...new Set(data.map((r) => r.concurrency))].sort((a, b) => a - b);
    }, [data]);

    const [activeTiers, setActiveTiers] = useState({ 0: true, 1: true, 2: true });

    const handleCopy = (text, key) => {
        navigator.clipboard.writeText(text);
        setCopiedStates((prev) => ({ ...prev, [key]: true }));
        setTimeout(() => {
            setCopiedStates((prev) => ({ ...prev, [key]: false }));
        }, 2500);
    };

    const outcomes = useMemo(() => {
        if (!data.length || selectedConcurrency === null) return null;
        const refData = data.find((d) => d.scenarioId === 0 && d.concurrency === selectedConcurrency);
        if (!refData) return null;

        const combinedData = data.find((d) => d.scenarioId === 2 && d.concurrency === selectedConcurrency);
        if (!combinedData) return null;

        const tputGain = ((combinedData.throughput.total - refData.throughput.total) / refData.throughput.total) * 100;
        const ttftRef = refData.ttft.p50;
        const ttftOpt = combinedData.ttft.p50;
        const latencyReduction = ttftRef > 0 ? ((ttftRef - ttftOpt) / ttftRef) * 100 : 0;

        return {
            throughput: `${tputGain > 0 ? '+' : ''}${tputGain.toFixed(1)}%`,
            latency: `${latencyReduction > 0 ? '-' : '+'}${Math.abs(latencyReduction).toFixed(1)}%`,
            concurrency: selectedConcurrency,
        };
    }, [data, selectedConcurrency]);

    const tableRows = useMemo(() => {
        const pKey = selectedPercentile.toLowerCase();
        const metricKey = tableMetricMode;

        const rows = concurrencyLevels.map((conc) => {
            const refReport = data.find((d) => d.scenarioId === 0 && d.concurrency === conc);
            const routeReport = data.find((d) => d.scenarioId === 1 && d.concurrency === conc);
            const combReport = data.find((d) => d.scenarioId === 2 && d.concurrency === conc);

            const refVal = refReport ? getLatencyValue(refReport, metricKey, pKey) : 0;
            const routeVal = routeReport ? getLatencyValue(routeReport, metricKey, pKey) : 0;
            const combVal = combReport ? getLatencyValue(combReport, metricKey, pKey) : 0;
            const gain = refVal > 0 && combVal > 0 ? ((refVal - combVal) / refVal) * 100 : null;

            return {
                concurrency: conc,
                qps: refReport?.throughput?.qps || 0,
                refVal,
                routeVal,
                combVal,
                gain,
                isCurrent: selectedConcurrency === conc,
            };
        });

        return [...rows].sort((a, b) => {
            const valA = a[sortConfig.key] ?? a.concurrency;
            const valB = b[sortConfig.key] ?? b.concurrency;
            return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        });
    }, [data, concurrencyLevels, selectedPercentile, tableMetricMode, selectedConcurrency, sortConfig]);

    const exportToCSV = () => {
        const headers = [
            'Concurrency',
            `K8s Service (Reference) ${selectedPercentile} (ms)`,
            `llm-d Routing ${selectedPercentile} (ms)`,
            `Combined Optimizations ${selectedPercentile} (ms)`,
            'Difference (%)',
        ];
        const rows = tableRows.map((row) =>
            [
                row.concurrency,
                row.refVal ? Math.round(row.refVal) : 'N/A',
                row.routeVal ? Math.round(row.routeVal) : 'N/A',
                row.combVal ? Math.round(row.combVal) : 'N/A',
                row.gain !== null ? Math.round(row.gain) : 'N/A',
            ].join(',')
        );
        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `agentic_workload_${tableMetricMode}_${selectedPercentile.toLowerCase()}_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) {
        return (
            <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center w-full font-sans">
                <Spinner size="lg" />
                <div className="text-lg font-semibold text-slate-200 mt-4">Loading Agentic Serving Data...</div>
                <p className="text-xs text-slate-500 mt-2">Scanning GCS benchmark results</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center justify-center w-full font-sans">
                <div className="text-lg font-semibold text-red-400 mt-4">Error loading data</div>
                <p className="text-xs text-slate-500 mt-2">{error}</p>
            </div>
        );
    }

    const chartTheme = getChartTheme();
    const tableLineStyle = selectedPercentile === 'P90' ? 'dashed' : selectedPercentile === 'P99' ? 'dotted' : 'solid';

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans relative overflow-hidden">
            <WellLitHeader
                kicker="Well-lit path"
                pageTitle="Agentic serving"
                subtitle="Long-context, multi-turn agentic code generation with prefix-aware routing, CPU DRAM KV-cache offloading, and Pallas kernel optimizations."
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
            />

            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 flex flex-col space-y-6 z-10 relative">

                {/* Architectural Overview Card (Matches Intelligent Routing 3-column layout) */}
                <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
                        {/* Col 1: Overview */}
                        <div className="p-4 sm:p-5 flex flex-col justify-between space-y-2.5">
                            <div>
                                <div className="kicker text-accent-600 mb-1.5">Overview</div>
                                <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                                    Evaluates long-context, multi-turn agentic code generation with tool-calling pauses and deep prefix-cache reuse. Compares standard Kubernetes routing against <strong className="text-zinc-900">llm-d</strong> gateway scheduling and Pallas kernel optimizations on <strong className="text-zinc-900">{metadata?.model?.split('/').pop()?.split('-Instruct')[0] || 'Qwen3-Coder-480B-A35B'}</strong>.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Active Configurations */}
                        <div className="p-4 sm:p-5 space-y-2">
                            <div className="kicker text-zinc-700 mb-1.5">
                                Active configurations
                            </div>

                            {SCENARIOS.map((s) => (
                                <button
                                    key={s.id}
                                    type="button"
                                    onClick={() =>
                                        setActiveTiers((prev) => {
                                            const next = { ...prev, [s.id]: !prev[s.id] };
                                            return Object.values(next).some(Boolean) ? next : prev;
                                        })
                                    }
                                    className={cn(
                                        'w-full text-left border rounded-2xl px-3.5 py-2 flex items-center justify-between gap-2 transition-all cursor-pointer',
                                        activeTiers[s.id]
                                            ? 'border-zinc-200 bg-zinc-50/70'
                                            : 'border-zinc-200/70 bg-white opacity-55'
                                    )}
                                >
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold text-zinc-900">{s.name}</div>
                                        <p className="text-micro text-zinc-600">{s.description}</p>
                                    </div>
                                    <div className="flex items-center space-x-2.5 shrink-0">
                                        {s.guideUrl && (
                                            <a
                                                href={s.guideUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1"
                                            >
                                                <span className="text-micro font-medium">Guide</span>
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        )}
                                        <SeriesMarkerSvg
                                            shape={SCENARIO_SHAPES[s.id]}
                                            color={activeTiers[s.id] ? SCENARIO_COLORS[s.id] : chartTheme.muted}
                                            size={11}
                                        />
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Col 3: Upcoming Variants */}
                        <div className="p-4 sm:p-5 space-y-2 bg-zinc-50/30">
                            <div className="kicker text-zinc-700 mb-1.5">
                                Upcoming variants
                            </div>

                            <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-800">Multi-Agent Speculative Decoding</div>
                                    <p className="text-micro text-zinc-600">Draft-target verification across agent turns</p>
                                </div>
                                <div className="flex items-center space-x-2 shrink-0">
                                    <a
                                        href="https://github.com/llm-d/llm-d/tree/main/guides/agentic-serving"
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

                            <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-800">Cross-Turn Prefix Pre-Warming</div>
                                    <p className="text-micro text-zinc-600">Async KV hydration during tool execution</p>
                                </div>
                                <div className="flex items-center space-x-2 shrink-0">
                                    <a
                                        href="https://github.com/llm-d/llm-d/tree/main/guides/agentic-serving"
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

                {/* Compact Benchmark Scenario & Outcomes Strip (Matches Intelligent Routing) */}
                <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="kicker text-accent-600">
                                Benchmark scenario & outcomes
                            </span>
                            <span className="text-zinc-300" aria-hidden="true">|</span>
                            <span className="text-xs text-zinc-700">
                                inference-perf · Agentic Code Generation ({outcomes?.concurrency ? `Concurrency ${outcomes.concurrency}` : '60 concurrent sessions'})
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
                            <Button
                                variant="primary"
                                size="sm"
                                onClick={() => setIsModalOpen(true)}
                                className="h-7 px-3.5 text-xs font-semibold"
                            >
                                <span>Reproducibility guide</span>
                            </Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
                        {/* Left: Compact 6-item Environment & Serving Spec Strip */}
                        <div className="lg:col-span-8 xl:col-span-9 p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3.5 items-start">
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Provider / machine</span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs flex items-center gap-1.5">
                                    <GoogleMark />
                                    {metadata?.machineType || 'tpu7x-standard-8'}
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Accelerator</span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    {metadata?.accelerator?.toUpperCase() || 'TPU7X'} ({metadata?.replicas || 8} replicas)
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">ISL / OSL</span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block tabular-nums">
                                    {metadata ? `${Math.round(metadata.inputLengthMean).toLocaleString()} / ${Math.round(metadata.outputLengthMean).toLocaleString()}` : '163,000 / 425'} tok
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Model name</span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block truncate" title={metadata?.model || ''}>
                                    {metadata?.model?.split('/').pop()?.substring(0, 26) || 'Qwen3-Coder-480B'}
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Engine & TP</span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs block">
                                    vLLM (TP8 · FP8)
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Test harness</span>
                                <button
                                    type="button"
                                    onClick={() => onNavigate?.('workload-catalog')}
                                    className="font-sans font-semibold text-zinc-900 hover:text-accent-600 text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                    <span>inference-perf</span>
                                    <ExternalLink className="w-3 h-3 text-zinc-600" />
                                </button>
                            </div>
                        </div>

                        {/* Right: Primary Outcomes Strip */}
                        <div className="lg:col-span-4 xl:col-span-3 p-4 sm:p-5 bg-zinc-50/50 grid grid-cols-2 gap-4 items-center">
                            <div>
                                <div className="text-micro font-medium text-zinc-600 mb-1">Throughput gain</div>
                                <div className="display-title text-2xl font-bold text-emerald-600 tabular-nums leading-none">
                                    {outcomes?.throughput || '+94.3%'}
                                </div>
                                <div className="text-micro font-medium text-zinc-600 mt-1">
                                    Total tok/s gain
                                </div>
                            </div>
                            <div className="border-l border-zinc-200 pl-4">
                                <div className="text-micro font-medium text-zinc-600 mb-1">TTFT reduction</div>
                                <div className="display-title text-2xl font-bold text-accent-600 tabular-nums leading-none">
                                    {outcomes?.latency || '-63.9%'}
                                </div>
                                <div className="text-micro font-medium text-zinc-600 mt-1">
                                    P50 latency reduction
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Telemetry Charts (Matches Intelligent Routing 2-panel LineChart layout) */}
                <div className="flex flex-col gap-6 w-full">
                    <AgenticTelemetryChart
                        data={data}
                        metadata={metadata}
                        activeTiers={activeTiers}
                        initialXAxis="ntpot"
                        initialYAxis="total"
                        initialLogScale={true}
                    />
                    <AgenticTelemetryChart
                        data={data}
                        metadata={metadata}
                        activeTiers={activeTiers}
                        initialXAxis="ttft"
                        initialYAxis="total"
                        initialLogScale={true}
                    />
                </div>

                {/* Summary Metrics Table (Matches Intelligent Routing inline header controls + SeriesLineSwatch) */}
                <div id="summary-table" className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="px-5 sm:px-7 py-4 border-b border-zinc-200 flex flex-wrap justify-between items-center gap-4">
                        <div>
                            <span className="kicker block text-accent-600 mb-0.5">
                                Stepwise breakdown
                            </span>
                            <h3 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                                Summary metrics comparison
                            </h3>
                            <span className="text-xs text-zinc-700">
                                Comparing K8s Service (Reference), llm-d Routing, and Combined Optimizations across concurrency levels.
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <ToggleGroup
                                size="xs"
                                options={[
                                    { value: 'ttft', label: 'TTFT' },
                                    { value: 'itl', label: 'ITL' },
                                    { value: 'ntpot', label: 'NTPOT' },
                                    { value: 'tpot', label: 'TPOT' },
                                    { value: 'e2e', label: 'E2E' },
                                ]}
                                value={tableMetricMode}
                                onChange={setTableMetricMode}
                            />
                            <ToggleGroup
                                size="xs"
                                options={[
                                    { value: 'P50', label: 'P50' },
                                    { value: 'P90', label: 'P90' },
                                    { value: 'P99', label: 'P99' },
                                ]}
                                value={selectedPercentile}
                                onChange={setSelectedPercentile}
                            />
                            <Button variant="secondary" size="sm" onClick={exportToCSV}>
                                Export CSV
                            </Button>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-zinc-800">
                            <thead className="label-caps text-zinc-700 bg-zinc-50/90 border-b border-zinc-200">
                                <tr>
                                    <th
                                        scope="col"
                                        className="px-5 py-3 cursor-pointer hover:text-zinc-950 transition-colors w-32"
                                        onClick={() =>
                                            setSortConfig((prev) => ({
                                                key: 'concurrency',
                                                direction: prev.key === 'concurrency' && prev.direction === 'asc' ? 'desc' : 'asc',
                                            }))
                                        }
                                    >
                                        <div className="flex items-center gap-1">
                                            Concurrency {sortConfig.key === 'concurrency' && <span className="text-accent-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                        </div>
                                    </th>
                                    <th scope="col" className="px-5 py-3 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={SCENARIO_SHAPES[0]}
                                                color={SCENARIO_COLORS[0]}
                                                lineStyle={tableLineStyle}
                                            />
                                            <span>K8s Service (Reference) ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th scope="col" className="px-5 py-3 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={SCENARIO_SHAPES[1]}
                                                color={SCENARIO_COLORS[1]}
                                                lineStyle={tableLineStyle}
                                            />
                                            <span>llm-d Routing ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th scope="col" className="px-5 py-3 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={SCENARIO_SHAPES[2]}
                                                color={SCENARIO_COLORS[2]}
                                                lineStyle={tableLineStyle}
                                            />
                                            <span>Combined Optimizations ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th
                                        scope="col"
                                        className="px-5 py-3 border-l border-zinc-200 text-right cursor-pointer hover:text-zinc-950"
                                        onClick={() =>
                                            setSortConfig((prev) => ({
                                                key: 'gain',
                                                direction: prev.key === 'gain' && prev.direction === 'asc' ? 'desc' : 'asc',
                                            }))
                                        }
                                    >
                                        <div className="flex items-center justify-end gap-1 text-zinc-900">
                                            Difference (%) {sortConfig.key === 'gain' && <span className="text-accent-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/80 font-mono">
                                {tableRows.map((row, rIdx) => (
                                    <tr
                                        key={rIdx}
                                        onClick={() => setSelectedConcurrency(row.concurrency)}
                                        className={cn(
                                            'hover:bg-zinc-50/80 transition-colors cursor-pointer tabular-nums',
                                            row.isCurrent && 'bg-accent-50/40'
                                        )}
                                    >
                                        <td className="px-5 py-3 text-xs text-zinc-900 font-semibold font-sans">
                                            <div className="flex items-center gap-2">
                                                <span>{row.concurrency}</span>
                                                {row.isCurrent && <Badge tone="info" size="xs">Active</Badge>}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3 text-xs border-l border-zinc-200 text-zinc-800">
                                            {row.refVal > 0 ? `${row.refVal.toFixed(1)} ms` : 'N/A'}
                                        </td>
                                        <td className="px-5 py-3 text-xs border-l border-zinc-200 text-zinc-800">
                                            {row.routeVal > 0 ? `${row.routeVal.toFixed(1)} ms` : 'N/A'}
                                        </td>
                                        <td className="px-5 py-3 text-xs border-l border-zinc-200 text-zinc-900 font-semibold">
                                            {row.combVal > 0 ? `${row.combVal.toFixed(1)} ms` : 'N/A'}
                                        </td>
                                        <td className="px-5 py-3 border-l border-zinc-200 text-right">
                                            {row.gain === null ? (
                                                <Badge tone="neutral" size="md">N/A</Badge>
                                            ) : (
                                                <Badge
                                                    tone={row.gain > 0 ? 'success' : row.gain < 0 ? 'danger' : 'neutral'}
                                                    size="md"
                                                >
                                                    {row.gain > 0 ? `+${Math.round(row.gain)}%` : row.gain < 0 ? `${Math.round(row.gain)}%` : '0%'}
                                                </Badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                closeOnBackdrop={false}
                closeOnEscape={false}
                size="lg"
                className="max-w-3xl"
                title={
                    <span className="flex items-center">
                        <span className="p-2 bg-accent-600/20 text-accent-700 rounded-lg mr-3 inline-flex">
                            <Code className="w-5 h-5" />
                        </span>
                        <span>
                            <span className="block text-base font-bold">Reproducibility & configuration guide</span>
                            <span className="block text-tiny text-slate-400 mt-0.5 font-normal">View and copy the exact manifests and traffic recipes used for this workload replay.</span>
                        </span>
                    </span>
                }
                footer={
                    <div className="flex items-center justify-between w-full">
                        <a
                            href="https://github.com/llm-d/llm-d/tree/main/guides/agentic-serving"
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-400 hover:text-accent-300"
                        >
                            <span>View full guide on GitHub</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                            Close
                        </Button>
                    </div>
                }
            >
                <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 pt-2 gap-1 overflow-x-auto no-scrollbar">
                    {['Model server flags', 'K8s manifest', 'Traffic YAML', 'Raw benchmark JSON'].map((tab, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveRecipeTab(idx)}
                            className={cn(
                                'px-4 py-2 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer',
                                activeRecipeTab === idx
                                    ? 'border-accent-600 text-accent-700'
                                    : 'border-transparent text-slate-400 hover:text-slate-200'
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                <div className="p-6 flex-1 overflow-y-auto bg-slate-950 font-mono text-tiny text-slate-300 relative">
                    {activeRecipeTab === 0 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleCopy(RECIPE_VLLM, 'vllm')}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['vllm'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-tiny font-bold">{copiedStates['vllm'] ? 'Copied!' : 'Copy code'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">{RECIPE_VLLM}</pre>
                        </>
                    )}
                    {activeRecipeTab === 1 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleCopy(RECIPE_K8S, 'k8s')}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['k8s'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-tiny font-bold">{copiedStates['k8s'] ? 'Copied!' : 'Copy code'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">{RECIPE_K8S}</pre>
                        </>
                    )}
                    {activeRecipeTab === 2 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => handleCopy(RECIPE_TRAFFIC, 'traffic')}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['traffic'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-tiny font-bold">{copiedStates['traffic'] ? 'Copied!' : 'Copy code'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">{RECIPE_TRAFFIC}</pre>
                        </>
                    )}
                    {activeRecipeTab === 3 && (
                        <>
                            <Button
                                variant="secondary"
                                size="xs"
                                onClick={() => {
                                    const jsonData = {};
                                    data.forEach((d) => {
                                        const key = `${d.scenario}_c${d.concurrency}`;
                                        jsonData[key] = {
                                            scenario: d.scenario,
                                            concurrency: d.concurrency,
                                            throughput: d.throughput,
                                            ttft_p50_ms: d.ttft.p50,
                                            tpot_p50_ms: d.tpot.p50,
                                        };
                                    });
                                    handleCopy(JSON.stringify(jsonData, null, 2), 'json');
                                }}
                                className="absolute top-4 right-4"
                            >
                                {copiedStates['json'] ? <Check className="w-3 h-3 text-emerald-400" /> : <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>}
                                <span className="text-tiny font-bold">{copiedStates['json'] ? 'Copied!' : 'Copy JSON'}</span>
                            </Button>
                            <pre className="whitespace-pre-wrap">
                                {JSON.stringify(
                                    Object.fromEntries(data.map((d) => [
                                        `${d.scenario}_c${d.concurrency}`,
                                        { scenario: d.scenario, concurrency: d.concurrency, throughput: d.throughput, ttft_p50_ms: d.ttft.p50, tpot_p50_ms: d.tpot.p50 }
                                    ])),
                                    null, 2
                                )}
                            </pre>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}
