import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    ScatterChart, Scatter, ComposedChart, ZAxis, Label, ReferenceArea, ReferenceLine
} from 'recharts';
import IntelligentRoutingChart, { SCENARIO_COLORS, SCENARIO_SHAPES } from './IntelligentRoutingChart';
import { Zap, Download, Copy, Check, Info, ExternalLink, Settings, ShieldAlert, Cpu, Cloud, Server, Bell, Slack, ChevronDown, ChevronUp, Eye, Maximize2, ArrowDown, X, BarChart2, Table } from 'lucide-react';
import { scanInferenceScheduling } from '../utils/gcsScanner';
import { getLocalDashboardRuns } from '../utils/dashboardHelpers';
import { WellLitHeader, Badge, Button, ChartTooltip, ChartTooltipRow, SeriesMarkerSvg, SeriesLineSwatch, Input, Label as FieldLabel, Modal, Panel, Select, ToggleGroup, GoogleMark, CHART_STATUS, getChartTheme } from './ui';
import { cn } from '../utils/cn';
import { RAW_GEMMA_DATA } from '../utils/wellLitPathData.js';

const CustomTputTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length >= 2) {
        // Find optimal & baseline by their name or datakey
        const optimal = payload.find(p => p.dataKey === 'optimal_tput')?.value || 0;
        const baseline = payload.find(p => p.dataKey === 'baseline_tput')?.value || 0;
        const speedup = ((optimal - baseline) / baseline) * 100;

        return (
            <ChartTooltip className="font-mono" title={`QPS: ${label}`}>
                <ChartTooltipRow label="standard Kubernetes service" value={Math.round(baseline)} />
                <ChartTooltipRow label="Optimal" value={Math.round(optimal)} />
                {speedup > 0 && (
                    <p className="text-accent-700 text-micro mt-2 pt-2 border-t border-theme-border flex items-center">
                        <Zap className="w-3 h-3 mr-1 text-accent-600" /> +{Math.round(speedup)}% speedup
                    </p>
                )}
            </ChartTooltip>
        );
    }
    return null;
};

// Interactive Bell Label for SLA Threshold
const CustomReferenceLabel = (props) => {
    const { viewBox, value, onClickAlert } = props;
    const chartTheme = getChartTheme();
    return (
        <g onClick={onClickAlert} className="cursor-pointer group">
            <text x={viewBox.x + 10} y={viewBox.y - 12} fill={CHART_STATUS.good} fontSize="11" fontWeight="bold">
                {value}
            </text>
            <rect x={viewBox.x} y={viewBox.y - 30} width="160" height="30" fill="transparent" />
            <g className="opacity-60 group-hover:opacity-100 transition-opacity">
                <circle cx={viewBox.x + 125} cy={viewBox.y - 15} r="10" fill={chartTheme.surface} stroke={chartTheme.grid} />
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke={chartTheme.tick} strokeWidth="2" fill="none" transform="translate(115, -23) scale(0.8)" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke={chartTheme.tick} strokeWidth="2" fill="none" transform="translate(115, -23) scale(0.8)" strokeLinecap="round" strokeLinejoin="round" />
            </g>
        </g>
    );
};

const RichSchedulingTooltip = ({ active, payload, zoomXAxis, zoomYAxis }) => {
    if (!active || !payload || !payload.length) return null;

    const pl = payload[0].payload;
    const hw = pl.hardware || 'H100';
    const model = pl.model_name || 'Model';
    const qpsVal = pl.qps ?? pl.y ?? 'N/A';

    const xLabelMap = { tpot: 'TPOT', ntpot: 'NTPOT', ttft: 'TTFT', itl: 'ITL', tokens_sec: 'Tokens/sec', e2e: 'E2E' };
    const yLabelMap = { output: 'Out Tok/s', input: 'In Tok/s', total: 'Tot Tok/s', qps: 'QPS', cost: 'Cost' };

    const xLabel = xLabelMap[zoomXAxis] || 'X';
    const yLabel = yLabelMap[zoomYAxis] || 'Y';

    return (
        <ChartTooltip
            className="min-w-[220px]"
            title={
                <div className="border-b border-theme-border pb-1.5 mb-1.5">
                    <div className="text-micro font-mono font-normal text-theme-muted leading-tight">
                        {hw} • {model}
                    </div>
                    <div className="text-xs font-bold text-theme-text mt-1">
                        QPS: {qpsVal}
                    </div>
                    {pl.interpolated && (
                        <div className="text-tiny font-normal text-amber-500 font-mono mt-0.5">
                            (Interpolated Curve)
                        </div>
                    )}
                </div>
            }
        >
            {/* Series Values List */}
            <div className="space-y-3">
                {(() => {
                    const groups = {
                        'Standard Kubernetes [STD]': [],
                        'Approx. prefix aware routing [BENCH]': [],
                        'Other': []
                    };

                    payload.forEach(entry => {
                        if (entry.name.includes('Standard Kubernetes') || entry.name.includes('Baseline')) {
                            groups['Standard Kubernetes [STD]'].push(entry);
                        } else if (entry.name.includes('Prefix-aware') || entry.name.includes('Router')) {
                            groups['Approx. prefix aware routing [BENCH]'].push(entry);
                        } else {
                            groups['Other'].push(entry);
                        }
                    });

                    return Object.entries(groups).map(([groupName, items]) => {
                        if (items.length === 0) return null;

                        return (
                            <div key={groupName} className="space-y-1">
                                {groupName !== 'Other' && (
                                    <div className="label-caps text-theme-muted border-b border-theme-border pb-0.5 mb-1 flex items-center justify-between">
                                        <span>{groupName.split(' [')[0]}</span>
                                    </div>
                                )}
                                {items.map((entry, index) => {
                                    const epl = entry.payload;
                                    const xVal = epl.dynamic_x ?? epl.x;
                                    const yVal = epl.dynamic_y ?? epl.y;

                                    let label = entry.name;
                                    if (groupName !== 'Other') {
                                        label = label.replace('Standard Kubernetes ', '').replace('Approx. prefix aware routing ', '').replace('Baseline ', '').replace('Router ', '');
                                    }

                                    return (
                                        <ChartTooltipRow
                                            key={index}
                                            color={entry.stroke || entry.fill}
                                            label={label}
                                            value={xVal !== undefined && yVal !== undefined ? (
                                                `${xLabel}: ${typeof xVal === 'number' ? xVal.toFixed(1) : xVal} | ${yLabel}: ${typeof yVal === 'number' ? yVal.toFixed(1) : yVal}`
                                            ) : (
                                                `${Number(entry.value ?? xVal).toFixed(1)} ${entry.name.includes('Rate') ? 'tokens/s' : 'ms'}`
                                            )}
                                        />
                                    );
                                })}
                            </div>
                        );
                    });
                })()}
            </div>
        </ChartTooltip>
    );
};



const Milestone1Dashboard = ({ onNavigateBack, onNavigate, onToggleMobileNav, dashboardData }) => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [gcsData, setGcsData] = useState([]);
    const [reportsMeta, setReportsMeta] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showFilters, setShowFilters] = useState(false);
    const [workloadConfig, setWorkloadConfig] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const reports = await scanInferenceScheduling();
            
            // Get local runs targeting intelligent-routing
            const localRuns = dashboardData?.brv02Runs 
                ? getLocalDashboardRuns(dashboardData.brv02Runs, 'inference-scheduling')
                : [];
            
            const combinedReports = [...reports, ...localRuns];

            const grouped = {};
            combinedReports.forEach(r => {
                if (r.stage === 0) return; // Skip stage 0
                const q = parseFloat(r.qps.toFixed(2));
                if (!grouped[q]) {
                    grouped[q] = { qps: q, stage: r.stage };
                }
                const prefix = r.scenario === 'k8s-service-baseline' ? 'baseline' : 'router';
                grouped[q][`${prefix}_output_token_rate`] = parseFloat(r.output_token_rate.toFixed(2));
                grouped[q][`${prefix}_ttft_p50`] = parseFloat(r.ttft.p50.toFixed(2));
                grouped[q][`${prefix}_ttft_p90`] = parseFloat(r.ttft.p90.toFixed(2));
                grouped[q][`${prefix}_ttft_p99`] = parseFloat(r.ttft.p99.toFixed(2));
                grouped[q][`${prefix}_tpot_p50`] = parseFloat(r.tpot.p50.toFixed(2));
                grouped[q][`${prefix}_tpot_p90`] = parseFloat(r.tpot.p90.toFixed(2));
                grouped[q][`${prefix}_tpot_p99`] = parseFloat(r.tpot.p99.toFixed(2));
                grouped[q][`${prefix}_ntpot_p50`] = parseFloat(r.ntpot.p50.toFixed(2));
                grouped[q][`${prefix}_ntpot_p90`] = parseFloat(r.ntpot.p90.toFixed(2));
                grouped[q][`${prefix}_ntpot_p99`] = parseFloat(r.ntpot.p99.toFixed(2));
                grouped[q][`${prefix}_itl_p50`] = parseFloat(r.itl.p50.toFixed(2));
                grouped[q][`${prefix}_itl_p90`] = parseFloat(r.itl.p90.toFixed(2));
                grouped[q][`${prefix}_itl_p99`] = parseFloat(r.itl.p99.toFixed(2));
            });
            let denseData = Object.values(grouped).sort((a, b) => a.qps - b.qps);
            if (denseData.length === 0) {
                denseData = RAW_GEMMA_DATA.map((d, idx) => ({
                    qps: d.qps,
                    stage: idx + 1,
                    baseline_output_token_rate: d.baseline_tput,
                    baseline_ttft_p50: d.baseline_ttft_p50,
                    baseline_ttft_p90: d.baseline_ttft_p90,
                    baseline_ttft_p99: d.baseline_ttft_p99,
                    baseline_tpot_p50: d.baseline_itl_p50,
                    baseline_tpot_p90: d.baseline_itl_p90,
                    baseline_tpot_p99: d.baseline_itl_p99,
                    baseline_ntpot_p50: d.baseline_itl_p50,
                    baseline_ntpot_p90: d.baseline_itl_p90,
                    baseline_ntpot_p99: d.baseline_itl_p99,
                    baseline_itl_p50: d.baseline_itl_p50,
                    baseline_itl_p90: d.baseline_itl_p90,
                    baseline_itl_p99: d.baseline_itl_p99,
                    router_output_token_rate: d.optimal_tput,
                    router_ttft_p50: d.optimal_ttft_p50,
                    router_ttft_p90: d.optimal_ttft_p90,
                    router_ttft_p99: d.optimal_ttft_p99,
                    router_tpot_p50: d.optimal_itl_p50,
                    router_tpot_p90: d.optimal_itl_p90,
                    router_tpot_p99: d.optimal_itl_p99,
                    router_ntpot_p50: d.optimal_itl_p50,
                    router_ntpot_p90: d.optimal_itl_p90,
                    router_ntpot_p99: d.optimal_itl_p99,
                    router_itl_p50: d.optimal_itl_p50,
                    router_itl_p90: d.optimal_itl_p90,
                    router_itl_p99: d.optimal_itl_p99,
                }));
            }

            setGcsData(denseData);
            if (combinedReports && combinedReports.length > 0) {
                setReportsMeta(combinedReports[0]);
            }

            try {
                const configRes = await fetch('https://raw.githubusercontent.com/kubernetes-sigs/inference-perf/main/workload-catalog/interactive-chat/config.json');
                if (configRes.ok) {
                    const config = await configRes.json();
                    setWorkloadConfig(config);
                }
            } catch (e) {
                console.warn('Failed to fetch interactive-chat config:', e);
            }

            setLoading(false);
        };
        fetchData();
    }, [dashboardData?.brv02Runs]);

    const [copied, setCopied] = useState(false);
    const [targetQps, setTargetQps] = useState(5);

    const [provider, setProvider] = useState('GCP');
    const [hardware] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('hw') || '4x H100 80GB';
    });
    const [showFullProfile, setShowFullProfile] = useState(false);

    const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
    const [alertSaved, setAlertSaved] = useState(false);

    const [latencyScale, setLatencyScale] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('scale') || 'linear';
    });
    const [ttftHistory, setTtftHistory] = useState('snapshot');
    const [itlScale, setItlScale] = useState('linear');
    const [itlHistory, setItlHistory] = useState('snapshot');
    const [tputDisplay, setTputDisplay] = useState('tput_sec');
    const [xUnit, setXUnit] = useState('qps');
    const [hiddenSeries, setHiddenSeries] = useState([]);

    const [sortConfig, setSortConfig] = useState({ key: 'qps', direction: 'asc' });
    const [tableMetricMode, setTableMetricMode] = useState('ttft');
    const [selectedPercentile, setSelectedPercentile] = useState('P90');
    const [expandedRow, setExpandedRow] = useState(null);
    const [zoomYAxis, setZoomYAxis] = useState('output');
    const [zoomXAxis, setZoomXAxis] = useState('tpot');
    const [zoomCostMode, setZoomCostMode] = useState('spot');
    const [zoomPerChip, setZoomPerChip] = useState(false);
    const [zoomLogScale, setZoomLogScale] = useState(false);
    const [zoomShowPareto, setZoomShowPareto] = useState(false);
    const [zoomXMax, setZoomXMax] = useState(Infinity);
    const [zoomColorMode, setZoomColorMode] = useState('default');
    const [zoomViewMode, setZoomViewMode] = useState('standard');
    const [visiblePercentiles, setVisiblePercentiles] = useState(['p50', 'p90', 'p99']);

    const exportToCSV = () => {
        const headers = ['QPS', 'Standard P50 (ms)', 'Prefix-aware P50 (ms)', 'Standard P99 (ms)', 'Prefix-aware P99 (ms)', 'Difference (%)'];
        const rows = tableData.map(row => {
            const base50 = tableMetricMode === 'ttft' ? (row.baseline_ttft_p50 || 0) : (row.baseline_itl_p50 || 0);
            const opt50 = tableMetricMode === 'ttft' ? (row.router_ttft_p50 || 0) : (row.router_itl_p50 || 0);
            const base99 = tableMetricMode === 'ttft' ? (row.baseline_ttft_p99 || 0) : (row.baseline_itl_p99 || 0);
            const opt99 = tableMetricMode === 'ttft' ? (row.router_ttft_p99 || 0) : (row.router_itl_p99 || 0);
            const gain99 = base99 && opt99 ? ((base99 - opt99) / base99) * 100 : 0;
            return [row.qps, Math.round(base50), Math.round(opt50), Math.round(base99), Math.round(opt99), Math.round(gain99)].join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `prism_cost_efficiency_${tableMetricMode}_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    const handleLegendClick = (e) => {
        const { value } = e;
        setHiddenSeries(prev =>
            prev.includes(value)
                ? prev.filter(v => v !== value)
                : [...prev, value]
        );
    };
    const ttftData = React.useMemo(() => {
        const getSeries = (prefix, percentile) => {
            return gcsData
                .filter(d => d[`${prefix}_ttft_${percentile}`] !== undefined)
                .map(d => ({
                    x: d[`${prefix}_ttft_${percentile}`],
                    y: d[xUnit]
                }))
                .sort((a, b) => a.x - b.x);
        };
        return {
            baseline_p50: getSeries('baseline', 'p50'),
            baseline_p90: getSeries('baseline', 'p90'),
            baseline_p99: getSeries('baseline', 'p99'),
            router_p50: getSeries('router', 'p50'),
            router_p90: getSeries('router', 'p90'),
            router_p99: getSeries('router', 'p99'),
        };
    }, [gcsData, xUnit]);

    const tpotData = React.useMemo(() => {
        const getSeries = (prefix, percentile) => {
            return gcsData
                .filter(d => d[`${prefix}_tpot_${percentile}`] !== undefined)
                .map(d => ({
                    x: d[`${prefix}_tpot_${percentile}`],
                    y: d[xUnit]
                }))
                .sort((a, b) => a.x - b.x);
        };
        return {
            baseline_p50: getSeries('baseline', 'p50'),
            baseline_p90: getSeries('baseline', 'p90'),
            baseline_p99: getSeries('baseline', 'p99'),
            router_p50: getSeries('router', 'p50'),
            router_p90: getSeries('router', 'p90'),
            router_p99: getSeries('router', 'p99'),
        };
    }, [gcsData, xUnit]);

    const additionalChartData = React.useMemo(() => {
        return gcsData.map(d => {
            // Only compute input rate if the point belongs to that series
            const baseline_input_token_rate = d.baseline_ttft_p50 !== undefined ? d.qps * 512 : null;
            const router_input_token_rate = d.router_ttft_p50 !== undefined ? d.qps * 512 : null;

            const b_out = d.baseline_output_token_rate ?? null;
            const r_out = d.router_output_token_rate ?? null;

            return {
                ...d,
                baseline_input_token_rate,
                router_input_token_rate,
                baseline_output_token_rate: b_out,
                router_output_token_rate: r_out,
                baseline_total_token_rate: baseline_input_token_rate ? baseline_input_token_rate + (b_out || 0) : null,
                router_total_token_rate: router_input_token_rate ? router_input_token_rate + (r_out || 0) : null
            };
        }).sort((a, b) => a.qps - b.qps);
    }, [gcsData]);
    const scatterData = React.useMemo(() => {
        const routerPoints = gcsData.filter(d => d.router_ttft_p50 !== undefined);
        const baselinePoints = gcsData.filter(d => d.baseline_ttft_p50 !== undefined);

        const pKey = selectedPercentile.toLowerCase();

        const baseMapped = baselinePoints.map(d => ({
            qps: d.qps,
            ttft: d[`baseline_ttft_${pKey}`],
            tpot: d[`baseline_tpot_${pKey}`],
            input: d.qps * 512,
            output: d.baseline_output_token_rate,
            total: (d.qps * 512) + (d.baseline_output_token_rate || 0)
        }));

        const routerMapped = routerPoints.map(d => ({
            qps: d.qps,
            ttft: d[`router_ttft_${pKey}`],
            tpot: d[`router_tpot_${pKey}`],
            input: d.qps * 512,
            output: d.router_output_token_rate,
            total: (d.qps * 512) + (d.router_output_token_rate || 0)
        }));

        return {
            ttft_baseline: [...baseMapped].sort((a, b) => a.ttft - b.ttft),
            ttft_router: [...routerMapped].sort((a, b) => a.ttft - b.ttft),
            tpot_baseline: [...baseMapped].sort((a, b) => a.tpot - b.tpot),
            tpot_router: [...routerMapped].sort((a, b) => a.tpot - b.tpot),
            qps_baseline: [...baseMapped].sort((a, b) => a.qps - b.qps),
            qps_router: [...routerMapped].sort((a, b) => a.qps - b.qps)
        };
    }, [gcsData, selectedPercentile]);

    const tableData = React.useMemo(() => {
        const routerPoints = gcsData.filter(d => d.router_ttft_p50 !== undefined);
        const baselinePoints = gcsData.filter(d => d.baseline_ttft_p50 !== undefined).sort((a, b) => a.qps - b.qps);

        const interpolate = (x, points, key) => {
            if (points.length === 0) return { value: null, interpolated: false };

            // Find exact match (within small tolerance)
            const exact = points.find(p => Math.abs(p.qps - x) < 0.1);
            if (exact) return { value: exact[key], interpolated: false };

            // Find surrounding points
            let lower = null;
            let upper = null;
            for (let i = 0; i < points.length; i++) {
                if (points[i].qps < x) {
                    lower = points[i];
                }
                if (points[i].qps > x) {
                    upper = points[i];
                    break;
                }
            }

            if (!lower && !upper) return { value: null, interpolated: false };
            if (!lower) return { value: upper[key], interpolated: true };
            if (!upper) return { value: null, interpolated: false };

            const ratio = (x - lower.qps) / (upper.qps - lower.qps);
            const val = lower[key] + ratio * (upper[key] - lower[key]);
            return { value: val, interpolated: true };
        };

        return routerPoints.map(rp => {
            const qps = rp.qps;
            const ttft99Result = interpolate(qps, baselinePoints, 'baseline_ttft_p99');
            const itl99Result = interpolate(qps, baselinePoints, 'baseline_itl_p99');
            const ntpot99Result = interpolate(qps, baselinePoints, 'baseline_ntpot_p99');
            const tpot99Result = interpolate(qps, baselinePoints, 'baseline_tpot_p99');

            const ttft90Result = interpolate(qps, baselinePoints, 'baseline_ttft_p90');
            const itl90Result = interpolate(qps, baselinePoints, 'baseline_itl_p90');
            const ntpot90Result = interpolate(qps, baselinePoints, 'baseline_ntpot_p90');
            const tpot90Result = interpolate(qps, baselinePoints, 'baseline_tpot_p90');

            const ttft50Result = interpolate(qps, baselinePoints, 'baseline_ttft_p50');
            const itl50Result = interpolate(qps, baselinePoints, 'baseline_itl_p50');
            const ntpot50Result = interpolate(qps, baselinePoints, 'baseline_ntpot_p50');
            const tpot50Result = interpolate(qps, baselinePoints, 'baseline_tpot_p50');

            const outputRateResult = interpolate(qps, baselinePoints, 'baseline_output_token_rate');

            return {
                qps: Math.round(qps * 10) / 10,

                router_ttft_p99: rp.router_ttft_p99,
                router_itl_p99: rp.router_itl_p99,
                router_ntpot_p99: rp.router_ntpot_p99,
                router_tpot_p99: rp.router_tpot_p99,

                router_ttft_p90: rp.router_ttft_p90,
                router_itl_p90: rp.router_itl_p90,
                router_ntpot_p90: rp.router_ntpot_p90,
                router_tpot_p90: rp.router_tpot_p90,

                router_ttft_p50: rp.router_ttft_p50,
                router_itl_p50: rp.router_itl_p50,
                router_ntpot_p50: rp.router_ntpot_p50,
                router_tpot_p50: rp.router_tpot_p50,

                router_output_token_rate: rp.router_output_token_rate,

                baseline_ttft_p99: ttft99Result.value,
                baseline_ttft_p99_interpolated: ttft99Result.interpolated,
                baseline_itl_p99: itl99Result.value,
                baseline_itl_p99_interpolated: itl99Result.interpolated,
                baseline_ntpot_p99: ntpot99Result.value,
                baseline_ntpot_p99_interpolated: ntpot99Result.interpolated,
                baseline_tpot_p99: tpot99Result.value,
                baseline_tpot_p99_interpolated: tpot99Result.interpolated,

                baseline_ttft_p90: ttft90Result.value,
                baseline_ttft_p90_interpolated: ttft90Result.interpolated,
                baseline_itl_p90: itl90Result.value,
                baseline_itl_p90_interpolated: itl90Result.interpolated,
                baseline_ntpot_p90: ntpot90Result.value,
                baseline_ntpot_p90_interpolated: ntpot90Result.interpolated,
                baseline_tpot_p90: tpot90Result.value,
                baseline_tpot_p90_interpolated: tpot90Result.interpolated,

                baseline_ttft_p50: ttft50Result.value,
                baseline_ttft_p50_interpolated: ttft50Result.interpolated,
                baseline_itl_p50: itl50Result.value,
                baseline_itl_p50_interpolated: itl50Result.interpolated,
                baseline_ntpot_p50: ntpot50Result.value,
                baseline_ntpot_p50_interpolated: ntpot50Result.interpolated,
                baseline_tpot_p50: tpot50Result.value,
                baseline_tpot_p50_interpolated: tpot50Result.interpolated,

                baseline_output_token_rate: outputRateResult.value
            };
        }).sort((a, b) => a.qps - b.qps);
    }, [gcsData]);

    const handleCopyHelm = () => {
        const cmd = `helm upgrade prism-router ./chart --set router.policy=intelligent_gateway --set target_qps=${targetQps}`;
        navigator.clipboard.writeText(cmd);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleSaveAlert = () => {
        setAlertSaved(true);
        setTimeout(() => {
            setAlertSaved(false);
            setIsAlertModalOpen(false);
        }, 1500);
    };

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans relative overflow-hidden">
            {/* Editorial Page Header */}
            <WellLitHeader
                kicker="Well-lit path"
                pageTitle="Intelligent routing"
                subtitle="Evaluating GKE Inference Gateway prefix-cache-aware routing against standard Kubernetes service endpoints."
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
                getShareUrl={() => {
                    const params = new URLSearchParams();
                    params.set('share', '1');
                    params.set('view', 'intelligent-routing');
                    params.set('hw', hardware);
                    params.set('scale', latencyScale);
                    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
                }}
            />

            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 flex flex-col space-y-6 z-10 relative">
                {/* Architectural Overview Card */}
                <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200">
                        {/* Col 1: Overview */}
                        <div className="p-4 sm:p-5 flex flex-col justify-between space-y-2.5">
                            <div>
                                <div className="kicker text-accent-600 mb-1.5">Overview</div>
                                <p className="text-xs sm:text-sm text-zinc-700 leading-relaxed">
                                    Intelligent Routing optimizes request scheduling across distributed model servers. By leveraging GKE Inference Gateway, real-time KV-cache introspection, and latency-aware load balancing, it reduces tail TTFT and increases cluster throughput.
                                </p>
                            </div>
                        </div>

                        {/* Col 2: Active Configurations */}
                        <div className="p-4 sm:p-5 space-y-2">
                            <div className="kicker text-zinc-700 mb-1.5">
                                Active configurations
                            </div>

                            {/* Baseline */}
                            <div className="border border-zinc-200 rounded-2xl bg-zinc-50/70 px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-900">Standard Kubernetes (Reference)</div>
                                    <p className="text-micro text-zinc-600">Standard Kubernetes service endpoint</p>
                                </div>
                                <SeriesMarkerSvg
                                    shape={SCENARIO_SHAPES.baseline}
                                    color={SCENARIO_COLORS.baseline}
                                    size={11}
                                />
                            </div>

                            {/* Opt 1: Active */}
                            <div className="border border-zinc-200 rounded-2xl bg-zinc-50/70 px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-900">Approx. prefix aware routing</div>
                                    <p className="text-micro text-zinc-600">Current active scenario</p>
                                </div>
                                <div className="flex items-center space-x-2.5">
                                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/optimized-baseline" target="_blank" rel="noreferrer" className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1">
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <SeriesMarkerSvg
                                        shape={SCENARIO_SHAPES.router}
                                        color={SCENARIO_COLORS.router}
                                        size={11}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Col 3: Upcoming */}
                        <div className="p-4 sm:p-5 space-y-2 bg-zinc-50/30">
                            <div className="kicker text-zinc-700 mb-1.5">
                                Upcoming variants
                            </div>

                            {/* Opt 2: Disabled */}
                            <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-800">Precise Cache-Aware Routing</div>
                                    <p className="text-micro text-zinc-600">Real-time KV block tracking</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/precise-prefix-cache-routing" target="_blank" rel="noreferrer" className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1">
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Badge tone="warning" size="xs">Soon</Badge>
                                </div>
                            </div>

                            {/* Opt 3: Disabled */}
                            <div className="border border-zinc-200/80 rounded-2xl bg-white px-3.5 py-2 flex items-center justify-between">
                                <div>
                                    <div className="text-xs font-semibold text-zinc-800">Predicted Latency Balancing</div>
                                    <p className="text-micro text-zinc-600">ML-guided queue estimation</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/predicted-latency-routing" target="_blank" rel="noreferrer" className="text-zinc-700 hover:text-zinc-950 transition-colors flex items-center space-x-1">
                                        <span className="text-micro font-medium">Guide</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                    <Badge tone="warning" size="xs">Soon</Badge>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Compact Benchmark Scenario & Outcomes Strip (Reproducibility guide in header bar) */}
                <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="border-b border-zinc-200 bg-zinc-50/80 px-5 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <span className="kicker text-accent-600">
                                Benchmark scenario & outcomes
                            </span>
                            <span className="text-zinc-300" aria-hidden="true">|</span>
                            <span className="text-xs text-zinc-700">
                                inference-perf · Interactive Chat
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    document.getElementById('summary-table')?.scrollIntoView({ behavior: 'smooth' });
                                }}
                                className="text-xs font-semibold text-accent-600 hover:text-accent-700 px-2 py-1 cursor-pointer transition-colors"
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
                        {/* Compact 6-Spec Environment Grid */}
                        <div className="lg:col-span-8 xl:col-span-9 p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3.5 items-start">
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Provider / machine</span>
                                <span className="font-sans font-semibold text-zinc-900 text-xs flex items-center gap-1.5">
                                    <GoogleMark />
                                    <span>a3-highgpu-8g</span>
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Accelerator</span>
                                <span className="font-sans font-semibold text-zinc-900 block text-xs">NVIDIA H100 (8 replicas)</span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">ISL / OSL</span>
                                <span className="font-sans font-semibold text-zinc-900 block text-xs tabular-nums">
                                    {workloadConfig
                                        ? `${workloadConfig.input_sequence_length.mean} / ${workloadConfig.output_sequence_length.max}`
                                        : '7200 / 1000'} tok
                                </span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Model name</span>
                                <span className="font-sans font-semibold text-zinc-900 block text-xs">Qwen3-32B (BF16)</span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Engine & TP</span>
                                <span className="font-sans font-semibold text-zinc-900 block text-xs">vLLM (TP2)</span>
                            </div>
                            <div>
                                <span className="block text-micro font-medium text-zinc-600 mb-0.5">Test harness</span>
                                <span className="font-sans font-semibold text-zinc-900 block text-xs">inference-perf</span>
                            </div>
                        </div>

                        {/* Compact Primary Outcomes Strip */}
                        <div className="lg:col-span-4 xl:col-span-3 p-4 sm:p-5 bg-zinc-50/50 grid grid-cols-2 gap-4 items-center">
                            <div>
                                <div className="text-micro font-medium text-zinc-600 mb-1">Latency reduction</div>
                                <div className="display-title text-2xl font-bold text-emerald-600 tabular-nums leading-none">
                                    -41%
                                </div>
                                <div className="text-micro font-medium text-zinc-600 mt-1">Tail TTFT (P90)</div>
                            </div>
                            <div className="border-l border-zinc-200 pl-4">
                                <div className="text-micro font-medium text-zinc-600 mb-1">Peak throughput</div>
                                <div className="display-title text-2xl font-bold text-accent-600 tabular-nums leading-none">
                                    22.2k
                                </div>
                                <div className="text-micro font-medium text-zinc-600 mt-1">tok / sec</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-6 w-full">
                    <IntelligentRoutingChart data={additionalChartData} initialXAxis="ntpot" />
                    <IntelligentRoutingChart data={additionalChartData} initialXAxis="ttft" initialLogScale={true} />
                </div>

                {/* Summary Metrics Table */}
                <div id="summary-table" className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden">
                    <div className="px-5 sm:px-7 py-4 border-b border-zinc-200 flex flex-wrap justify-between items-center gap-4">
                        <div>
                            <span className="kicker block text-accent-600 mb-0.5">
                                Stepwise breakdown
                            </span>
                            <h3 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">Summary metrics comparison</h3>
                            <span className="text-xs text-zinc-700">Comparing Standard Kubernetes against Approx. prefix aware routing across QPS levels.</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                            <ToggleGroup
                                size="xs"
                                options={[
                                    { value: 'ttft', label: 'TTFT' },
                                    { value: 'itl', label: 'ITL' },
                                    { value: 'ntpot', label: 'NTPOT' },
                                    { value: 'tpot', label: 'TPOT' },
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
                                    <th scope="col" className="px-5 py-3 cursor-pointer hover:text-zinc-950 transition-colors w-24" onClick={() => setSortConfig(prev => ({ key: 'qps', direction: prev.key === 'qps' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                                        <div className="flex items-center gap-1">
                                            QPS {sortConfig.key === 'qps' && <span className="text-accent-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                        </div>
                                    </th>
                                    <th scope="col" className="px-5 py-3 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={SCENARIO_SHAPES.baseline}
                                                color={SCENARIO_COLORS.baseline}
                                                lineStyle={selectedPercentile === 'P90' ? 'dashed' : selectedPercentile === 'P99' ? 'dotted' : 'solid'}
                                            />
                                            <span>Standard Kubernetes ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th scope="col" className="px-5 py-3 border-l border-zinc-200">
                                        <span className="inline-flex items-center gap-2 text-zinc-800">
                                            <SeriesLineSwatch
                                                shape={SCENARIO_SHAPES.router}
                                                color={SCENARIO_COLORS.router}
                                                lineStyle={selectedPercentile === 'P90' ? 'dashed' : selectedPercentile === 'P99' ? 'dotted' : 'solid'}
                                            />
                                            <span>Approx. prefix aware routing ({selectedPercentile})</span>
                                        </span>
                                    </th>
                                    <th scope="col" className="px-5 py-3 border-l border-zinc-200 text-right cursor-pointer hover:text-zinc-950" onClick={() => setSortConfig(prev => ({ key: 'gain', direction: prev.key === 'gain' && prev.direction === 'asc' ? 'desc' : 'asc' }))}>
                                        <div className="flex items-center justify-end gap-1 text-zinc-900">
                                            Difference (%) {sortConfig.key === 'gain' && <span className="text-accent-600">{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                                        </div>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/80 font-mono">
                                {(() => {
                                    const enhancedData = tableData.map(row => {
                                        let base, opt;
                                        if (tableMetricMode === 'ttft') {
                                            base = selectedPercentile === 'P50' ? row.baseline_ttft_p50 : selectedPercentile === 'P90' ? row.baseline_ttft_p90 : row.baseline_ttft_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_ttft_p50 : selectedPercentile === 'P90' ? row.router_ttft_p90 : row.router_ttft_p99;
                                        } else if (tableMetricMode === 'itl') {
                                            base = selectedPercentile === 'P50' ? row.baseline_itl_p50 : selectedPercentile === 'P90' ? row.baseline_itl_p90 : row.baseline_itl_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_itl_p50 : selectedPercentile === 'P90' ? row.router_itl_p90 : row.router_itl_p99;
                                        } else if (tableMetricMode === 'ntpot') {
                                            base = selectedPercentile === 'P50' ? row.baseline_ntpot_p50 : selectedPercentile === 'P90' ? row.baseline_ntpot_p90 : row.baseline_ntpot_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_ntpot_p50 : selectedPercentile === 'P90' ? row.router_ntpot_p90 : row.router_ntpot_p99;
                                        } else if (tableMetricMode === 'tpot') {
                                            base = selectedPercentile === 'P50' ? row.baseline_tpot_p50 : selectedPercentile === 'P90' ? row.baseline_tpot_p90 : row.baseline_tpot_p99;
                                            opt = selectedPercentile === 'P50' ? row.router_tpot_p50 : selectedPercentile === 'P90' ? row.router_tpot_p90 : row.router_tpot_p99;
                                        }

                                        const gain = base && opt ? ((base - opt) / base) * 100 : null;

                                        return {
                                            ...row,
                                            val_base: base || 0,
                                            val_opt: opt || 0,
                                            gain: gain
                                        };
                                    });

                                    const sortedData = [...enhancedData].sort((a, b) => {
                                        const valA = a[sortConfig.key] ?? a.qps;
                                        const valB = b[sortConfig.key] ?? b.qps;
                                        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
                                    });

                                    return sortedData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-50/80 transition-colors tabular-nums">
                                            <td className="px-5 py-3 text-xs text-zinc-900 font-semibold">{row.qps}</td>
                                            <td className="px-5 py-3 text-xs border-l border-zinc-200 text-zinc-800">
                                                {row.val_base ? `${Math.round(row.val_base)} ms` : <span className="text-zinc-500">Saturated</span>}
                                            </td>
                                            <td className="px-5 py-3 text-xs border-l border-zinc-200 text-zinc-900 font-semibold">
                                                {row.val_opt ? `${Math.round(row.val_opt)} ms` : 'N/A'}
                                            </td>
                                            <td className="px-5 py-3 border-l border-zinc-200 text-right">
                                                {row.gain === null ? (
                                                    <Badge tone="neutral" size="md">Baseline saturated</Badge>
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
                                    ));
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>

            {/* Reproduction Modal Workflow */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                closeOnBackdrop={false}
                closeOnEscape={false}
                size="lg"
                title={
                    <span className="flex items-center">
                        <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg mr-3">
                            <Zap className="w-5 h-5" />
                        </span>
                        Reproducibility Instructions
                    </span>
                }
                subtitle="Execute this exact benchmark profile on your cluster."
                footer={
                    <Button variant="secondary" size="sm" onClick={() => setIsModalOpen(false)}>
                        Close
                    </Button>
                }
            >
                <div className="mb-2">
                    <h4 className="text-sm font-semibold text-slate-300 mb-1">Reference Documentation</h4>
                    <p className="text-xs text-slate-400">
                        For deep architectural specifications, view the full instructions directly on our repository:
                    </p>
                    <a href="https://github.com/llm-d/llm-d/tree/main/guides/optimized-baseline" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center text-xs font-bold text-accent-700 hover:underline">
                        View complete guide <ExternalLink className="w-3.5 h-3.5 ml-1" />
                    </a>
                </div>
            </Modal>

            {/* SLA Alert Modal Mock */}
            <Modal
                isOpen={isAlertModalOpen}
                onClose={() => setIsAlertModalOpen(false)}
                closeOnBackdrop={false}
                closeOnEscape={false}
                size="md"
                title={
                    <span className="flex items-center">
                        <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg mr-3">
                            <Bell className="w-5 h-5 cursor-pointer" />
                        </span>
                        Create SLA Alert
                    </span>
                }
                subtitle="Notifies your team when performance drops."
                footer={
                    <>
                        {alertSaved && <span className="text-xs font-medium text-emerald-500 mr-2 animate-in fade-in slide-in-from-right-4">Alert Saved!</span>}
                        <Button variant="secondary" size="sm" onClick={() => setIsAlertModalOpen(false)}>Cancel</Button>
                        <button onClick={handleSaveAlert} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold text-xs transition-colors shadow-sm flex items-center border border-indigo-500 line-clamp-1">
                            Save Alert Condition
                        </button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div>
                        <FieldLabel>Condition</FieldLabel>
                        <div className="flex items-center space-x-2 text-sm text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800">
                            <span className="font-mono text-emerald-400">P99 TTFT</span>
                            <span> exceeds </span>
                            <Input type="number" defaultValue={450} className="w-16 px-2 py-0.5 text-center" />
                            <span>ms</span>
                        </div>
                    </div>

                    <div>
                        <FieldLabel>Duration</FieldLabel>
                        <div className="flex items-center space-x-2 text-sm text-slate-300">
                            <span>For</span>
                            <Select className="w-auto px-2 py-1">
                                <option>2 consecutive days</option>
                                <option>3 consecutive days</option>
                                <option>1 week</option>
                            </Select>
                        </div>
                    </div>

                    <div className="pt-2">
                        <FieldLabel>Routing</FieldLabel>
                        <button className="w-full flex items-center justify-between p-3 border border-indigo-500/30 bg-indigo-500/10 rounded-lg hover:bg-indigo-500/20 transition-colors">
                            <div className="flex items-center">
                                <Slack className="w-4 h-4 text-indigo-400 mr-2" />
                                <span className="text-sm font-medium text-slate-200">#ops-alerts-inference</span>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                        </button>
                    </div>
                </div>
            </Modal>

        </div>
    );
};

export default Milestone1Dashboard;

