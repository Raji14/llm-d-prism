import React, { useState, useEffect, useMemo } from 'react';
// Runs (builds) map onto the shared CHART_SERIES palette by fixed slot,
// preserving hue-family continuity with the old per-run colors:
// cyan→sky, purple→violet, rose→pink, emerald→emerald, amber→amber.
// Percentiles (P50/P90/P99) are distinguished by line style
// (solid/dashed/dotted), not by shade.
const RUN_SERIES_SLOTS = [1, 3, 4, 0, 2];
const runColor = (idx) => seriesColor(RUN_SERIES_SLOTS[idx % RUN_SERIES_SLOTS.length]);

const CustomizedDot = (props) => {
    const { cx, cy, stroke, payload } = props;
    if (!cx || !cy) return null;
    
    const isFailed = payload && payload.success_rate < 90;
    if (isFailed) {
        return (
            <circle
                cx={cx}
                cy={cy}
                r={6}
                fill={CHART_STATUS.critical}
                stroke={CHART_STATUS.critical}
                strokeWidth={2}
                className="animate-pulse"
                style={{ cursor: 'pointer' }}
            />
        );
    }
    return (
        <circle 
            cx={cx} 
            cy={cy} 
            r={props.r || 4} 
            fill={stroke} 
            stroke={stroke} 
            style={{ cursor: 'pointer' }}
        />
    );
};

const WELL_LIT_PATH_METADATA = {
    'optimized-baseline': {
        sig: 'SIG Router',
        owners: '@liu-cong, @vMaroon',
        infra: 'GKE Standard Cluster'
    },
    'pd-disaggregation': {
        sig: 'SIG PD-Disaggregation',
        owners: '@tlrmchlsmth',
        infra: 'GKE Standalone Cluster'
    },
    'precise-prefix-cache-routing': {
        sig: 'SIG KV-Disaggregation',
        owners: '@vMaroon, @liu-cong',
        infra: 'GKE Standalone Cluster'
    },
    'tiered-prefix-cache': {
        sig: 'SIG KV-Disaggregation',
        owners: '@kfirtoledo, @liu-cong, @vMaroon',
        infra: 'GKE Standalone Cluster'
    },
    'workload-autoscaling': {
        sig: 'SIG Autoscaling',
        owners: '@lionelvillard',
        infra: 'GKE Standalone Cluster'
    },
    'asynchronous-processing': {
        sig: 'SIG Router',
        owners: '@shimib',
        infra: 'GKE Standalone Cluster'
    },
    'batch-gateway': {
        sig: 'SIG Router',
        owners: '@lioraron',
        infra: 'GKE Standalone Cluster'
    },
    'flow-control': {
        sig: 'SIG Router',
        owners: '@LukeAVanDrie',
        infra: 'GKE Standalone Cluster'
    },
    'no-kubernetes-deployment': {
        sig: 'SIG Installation',
        owners: '@ezrasilvera',
        infra: 'Bare Metal / VM'
    },
    'recipes': {
        sig: 'SIG Installation',
        owners: '@ahg-g, @robertgshaw2-redhat, @liu-cong, @Gregory-Pereira',
        infra: 'GKE Standalone Cluster'
    },
    'rollouts': {
        sig: 'SIG Router',
        owners: '@ahg-g',
        infra: 'GKE Standalone Cluster'
    },
    'wide-ep-lws': {
        sig: 'SIG PD-Disaggregation',
        owners: '@robertgshaw2-redhat, @tlrmchlsmth',
        infra: 'GKE Multi-Node Cluster'
    }
};

const formatBuildId = (buildId) => {
    if (!buildId) return 'Unknown Run';
    const match = buildId.match(/^runner-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
    if (match) {
        const [_, year, month, day, hour, minute, second] = match;
        return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
    }
    return buildId;
};

import {
    Activity, Zap, BarChart2, ArrowLeft, Shield, CheckCircle, AlertTriangle,
    ExternalLink, FileCode, GitCommit, Clock, Cpu, Server, Info, ChevronDown, ChevronUp, Download, Layers
} from 'lucide-react';
import {
    ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine
} from 'recharts';
import {
    Badge, Button, ChartContainer, ChartFilterRow, ChartFilterGroup, ChartCapControl,
    ChartLegend, PercentileLegendKey, StatPills, SeriesMarkerSvg, getSeriesShape,
    ChartTooltip, ChartTooltipRow, ChartXAxis, ChartYAxis,
    PageHeader, Panel, ShareLinkButton, ToggleGroup, CHART_STATUS, gridProps, seriesColor,
} from './ui';
import { cn } from '../utils/cn';
import { scanRegressions } from '../utils/gcsScanner';

const FALLBACK_REGRESSION_RUNS = [
    // Build 1: runner-20260416-020000 (Stable baseline)
    { build: 'runner-20260416-020000', date: '2026-04-16', qps: 2.0, outputTokenRate: 920, totalTokenRate: 2840, inputTokenRate: 1920, cacheHitPct: 88, status: 'stable', stage: 0, duration: 180, request_rate: 2.0, success_rate: 100, commit: 'a81f4c2', pr: '#412', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 95, ttft_p90: 142, ttft_p99: 185, itl_p50: 18.2, itl_p90: 22.4, itl_p99: 27.1, ntpot_p50: 18.5, ntpot_p90: 23.1, ntpot_p99: 28.0, tpot_p50: 18.5, tpot_p90: 23.1, tpot_p99: 28.0 },
    { build: 'runner-20260416-020000', date: '2026-04-16', qps: 4.0, outputTokenRate: 1810, totalTokenRate: 5620, inputTokenRate: 3810, cacheHitPct: 87, status: 'stable', stage: 1, duration: 180, request_rate: 4.0, success_rate: 100, commit: 'a81f4c2', pr: '#412', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 118, ttft_p90: 176, ttft_p99: 230, itl_p50: 21.0, itl_p90: 26.5, itl_p99: 32.4, ntpot_p50: 21.4, ntpot_p90: 27.0, ntpot_p99: 33.1, tpot_p50: 21.4, tpot_p90: 27.0, tpot_p99: 33.1 },
    { build: 'runner-20260416-020000', date: '2026-04-16', qps: 6.0, outputTokenRate: 2640, totalTokenRate: 8190, inputTokenRate: 5550, cacheHitPct: 86, status: 'stable', stage: 2, duration: 180, request_rate: 6.0, success_rate: 100, commit: 'a81f4c2', pr: '#412', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 154, ttft_p90: 228, ttft_p99: 295, itl_p50: 25.4, itl_p90: 32.8, itl_p99: 40.2, ntpot_p50: 25.9, ntpot_p90: 33.5, ntpot_p99: 41.0, tpot_p50: 25.9, tpot_p90: 33.5, tpot_p99: 41.0 },
    { build: 'runner-20260416-020000', date: '2026-04-16', qps: 8.0, outputTokenRate: 3380, totalTokenRate: 10480, inputTokenRate: 7100, cacheHitPct: 85, status: 'stable', stage: 3, duration: 180, request_rate: 8.0, success_rate: 99.8, commit: 'a81f4c2', pr: '#412', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 205, ttft_p90: 310, ttft_p99: 412, itl_p50: 31.8, itl_p90: 41.2, itl_p99: 52.0, ntpot_p50: 32.4, ntpot_p90: 42.0, ntpot_p99: 53.1, tpot_p50: 32.4, tpot_p90: 42.0, tpot_p99: 53.1 },
    // Build 2: runner-20260417-020000 (Slight regression at high QPS)
    { build: 'runner-20260417-020000', date: '2026-04-17', qps: 2.0, outputTokenRate: 905, totalTokenRate: 2810, inputTokenRate: 1905, cacheHitPct: 84, status: 'stable', stage: 0, duration: 180, request_rate: 2.0, success_rate: 100, commit: 'c39d10e', pr: '#419', author: '@vMaroon', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 102, ttft_p90: 155, ttft_p99: 204, itl_p50: 19.1, itl_p90: 24.0, itl_p99: 29.5, ntpot_p50: 19.5, ntpot_p90: 24.6, ntpot_p99: 30.2, tpot_p50: 19.5, tpot_p90: 24.6, tpot_p99: 30.2 },
    { build: 'runner-20260417-020000', date: '2026-04-17', qps: 4.0, outputTokenRate: 1760, totalTokenRate: 5490, inputTokenRate: 3730, cacheHitPct: 83, status: 'stable', stage: 1, duration: 180, request_rate: 4.0, success_rate: 100, commit: 'c39d10e', pr: '#419', author: '@vMaroon', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 134, ttft_p90: 198, ttft_p99: 262, itl_p50: 22.8, itl_p90: 29.1, itl_p99: 36.0, ntpot_p50: 23.3, ntpot_p90: 29.8, ntpot_p99: 36.8, tpot_p50: 23.3, tpot_p90: 29.8, tpot_p99: 36.8 },
    { build: 'runner-20260417-020000', date: '2026-04-17', qps: 6.0, outputTokenRate: 2520, totalTokenRate: 7890, inputTokenRate: 5370, cacheHitPct: 81, status: 'stable', stage: 2, duration: 180, request_rate: 6.0, success_rate: 99.9, commit: 'c39d10e', pr: '#419', author: '@vMaroon', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 188, ttft_p90: 274, ttft_p99: 358, itl_p50: 28.4, itl_p90: 36.9, itl_p99: 45.8, ntpot_p50: 29.1, ntpot_p90: 37.8, ntpot_p99: 46.9, tpot_p50: 29.1, tpot_p90: 37.8, tpot_p99: 46.9 },
    { build: 'runner-20260417-020000', date: '2026-04-17', qps: 8.0, outputTokenRate: 3190, totalTokenRate: 9980, inputTokenRate: 6790, cacheHitPct: 79, status: 'regression', note: 'High latency anomaly caught on nightly run', stage: 3, duration: 180, request_rate: 8.0, success_rate: 98.4, commit: 'c39d10e', pr: '#419', author: '@vMaroon', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 268, ttft_p90: 392, ttft_p99: 510, itl_p50: 36.5, itl_p90: 47.8, itl_p99: 61.2, ntpot_p50: 37.4, ntpot_p90: 48.9, ntpot_p99: 62.5, tpot_p50: 37.4, tpot_p90: 48.9, tpot_p99: 62.5 },
    // Build 3: runner-20260418-020000 (Recovered & improved scheduler)
    { build: 'runner-20260418-020000', date: '2026-04-18', qps: 2.0, outputTokenRate: 945, totalTokenRate: 2910, inputTokenRate: 1965, cacheHitPct: 91, status: 'stable', stage: 0, duration: 180, request_rate: 2.0, success_rate: 100, commit: '7f2e91b', pr: '#425', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 88, ttft_p90: 130, ttft_p99: 168, itl_p50: 17.1, itl_p90: 21.0, itl_p99: 25.4, ntpot_p50: 17.4, ntpot_p90: 21.5, ntpot_p99: 26.0, tpot_p50: 17.4, tpot_p90: 21.5, tpot_p99: 26.0 },
    { build: 'runner-20260418-020000', date: '2026-04-18', qps: 4.0, outputTokenRate: 1860, totalTokenRate: 5760, inputTokenRate: 3900, cacheHitPct: 90, status: 'stable', stage: 1, duration: 180, request_rate: 4.0, success_rate: 100, commit: '7f2e91b', pr: '#425', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 109, ttft_p90: 161, ttft_p99: 210, itl_p50: 19.6, itl_p90: 24.8, itl_p99: 30.1, ntpot_p50: 20.0, ntpot_p90: 25.3, ntpot_p99: 30.8, tpot_p50: 20.0, tpot_p90: 25.3, tpot_p99: 30.8 },
    { build: 'runner-20260418-020000', date: '2026-04-18', qps: 6.0, outputTokenRate: 2730, totalTokenRate: 8450, inputTokenRate: 5720, cacheHitPct: 89, status: 'stable', stage: 2, duration: 180, request_rate: 6.0, success_rate: 100, commit: '7f2e91b', pr: '#425', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 141, ttft_p90: 208, ttft_p99: 270, itl_p50: 23.5, itl_p90: 30.2, itl_p99: 37.0, ntpot_p50: 24.0, ntpot_p90: 30.9, ntpot_p99: 37.8, tpot_p50: 24.0, tpot_p90: 30.9, tpot_p99: 37.8 },
    { build: 'runner-20260418-020000', date: '2026-04-18', qps: 8.0, outputTokenRate: 3510, totalTokenRate: 10890, inputTokenRate: 7380, cacheHitPct: 88, status: 'stable', stage: 3, duration: 180, request_rate: 8.0, success_rate: 100, commit: '7f2e91b', pr: '#425', author: '@liu-cong', model: 'meta-llama/Llama-3.1-70B-Instruct', suite: 'optimized-baseline/gke/kustomize', hardware: 'H100 (8x)', ttft_p50: 184, ttft_p90: 276, ttft_p99: 365, itl_p50: 28.9, itl_p90: 37.4, itl_p99: 46.8, ntpot_p50: 29.5, ntpot_p90: 38.2, ntpot_p99: 47.9, tpot_p50: 29.5, tpot_p90: 38.2, tpot_p99: 47.9 },
];

export default function RegressionsAnalysisDashboard({ onNavigateBack }) {
    const [selectedPath, setSelectedPath] = useState('meta-llama/Llama-3.1-70B-Instruct');
    const [activeMetric, setActiveMetric] = useState('ttft'); // 'ttft' | 'itl' | 'qps' | 'p90Latency' | 'cacheHitPct'
    const [selectedRunMenu, setSelectedRunMenu] = useState('optimized-baseline/gke/kustomize');
    const [xAxisMode, setXAxisMode] = useState('output'); // 'build' | 'date' | 'output' | 'input' | 'total' | 'qps'
    const [yMetric, setYMetric] = useState('ntpot'); // 'ntpot' | 'tpot' | 'ttft' | 'itl' | 'e2e'
    const [isLogScaleX, setIsLogScaleX] = useState(false);
    const [showPerChip, setShowPerChip] = useState(false);
    const [visiblePercentiles, setVisiblePercentiles] = useState(['P50', 'P90', 'P99']);
    const [tputCap, setTputCap] = useState(4000);
    const [showChartFilters, setShowChartFilters] = useState(true);
    const [bugLoggedToast, setBugLoggedToast] = useState(false);
    const [viewSavedToast, setViewSavedToast] = useState(false);
    const [showFaq, setShowFaq] = useState(0);
    const [selectedBuilds, setSelectedBuilds] = useState([]);

    const handleToggleBuild = (build) => {
        setSelectedBuilds(prev => {
            if (prev.includes(build)) {
                return prev.filter(b => b !== build);
            } else {
                return [...prev, build];
            }
        });
    };

    const [runs, setRuns] = useState(FALLBACK_REGRESSION_RUNS);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const loadData = async () => {
            try {
                const gcsRuns = await scanRegressions();
                if (!active) return;
                if (gcsRuns && gcsRuns.length > 0) {
                    const mapped = gcsRuns.map((d, idx) => {
                        const status = (d.ttft?.p50 || 0) > 250 ? 'regression' : 'stable';
                        const modelName = d.model || 'openai-infqps-concurrency1-opt-125m';
                        return {
                            build: d.runId || `gcs-${idx}`,
                            date: d.date || 'Unknown',
                            qps: d.qps || 0,
                            outputTokenRate: d.output_token_rate || 0,
                            totalTokenRate: d.total_token_rate || 0,
                            inputTokenRate: d.input_token_rate || 0,
                            cacheHitPct: d.cacheHitPercent || 85,
                            status: status,
                            stage: d.stage !== undefined ? d.stage : 0,
                            duration: d.duration || 0,
                            request_rate: d.request_rate || 0,
                            success_rate: d.success_rate !== undefined ? d.success_rate : 100,
                            commit: d.commit?.slice(0, 7) || d.runId?.slice(0, 7) || 'gcs-run',
                            pr: d.pr || '#N/A',
                            author: d.author || '@gke-runner',
                            note: d.note || (status === 'regression' ? 'High latency anomaly caught on nightly run' : undefined),
                            model: modelName,
                            suite: d.suite || 'gke/standalone',
                            github_run_id: d.github_run_id || null,
                            github_repository: d.github_repository || null,
                            hardware: d.hardware || 'Unknown',
                            // Parse actual percentiles from GCS
                            ttft_p50: d.ttft?.p50 || 0,
                            ttft_p90: d.ttft?.p90 || d.tpot?.p90 || 0,
                            ttft_p99: d.ttft?.p99 || d.tpot?.p99 || 0,
                            itl_p50: d.itl?.p50 || 0,
                            itl_p90: d.itl?.p90 || 0,
                            itl_p99: d.itl?.p99 || 0,
                            ntpot_p50: d.ntpot?.p50 || 0,
                            ntpot_p90: d.ntpot?.p90 || 0,
                            ntpot_p99: d.ntpot?.p99 || 0,
                            tpot_p50: d.tpot?.p50 || 0,
                            tpot_p90: d.tpot?.p90 || 0,
                            tpot_p99: d.tpot?.p99 || 0
                        };
                    });
                    setRuns(mapped);
                    const optRun = mapped.find(r => r.suite.includes('optimized-baseline'));
                    if (optRun) {
                        setSelectedPath(optRun.model);
                        setSelectedRunMenu(optRun.suite);
                    } else if (mapped.length > 0) {
                        setSelectedPath(mapped[0].model);
                        setSelectedRunMenu(mapped[0].suite);
                    }
                }
            } catch (e) {
                console.error('Failed to scan GCS regressions, using fallback runs', e);
            } finally {
                if (active) setIsLoading(false);
            }
        };
        loadData();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        const suiteRuns = runs.filter(r => 
            r.model === selectedPath && 
            r.suite === selectedRunMenu
        );
        if (suiteRuns.length > 0) {
            const uniqueBuilds = Array.from(new Set(suiteRuns.map(r => r.build)));
            setSelectedBuilds([uniqueBuilds[uniqueBuilds.length - 1] || null].filter(Boolean));
        } else {
            setSelectedBuilds([]);
        }
    }, [selectedPath, selectedRunMenu, runs]);

    const derivedPaths = useMemo(() => {
        const uniqueSuites = Array.from(new Set(runs.map(r => r.suite).filter(Boolean)));
        if (uniqueSuites.length === 0) {
            return [
                { 
                    id: 'optimized-baseline/gke/kustomize', 
                    name: 'Optimized-baseline Gke Kustomize', 
                    sig: 'SIG Router', 
                    owner: '@liu-cong, @vMaroon', 
                    infra: 'GKE Standard Cluster', 
                    status: 'Stable' 
                }
            ];
        }
        return uniqueSuites.map(s => {
            const formattedName = s.split('/')
                .map(part => part.charAt(0).toUpperCase() + part.slice(1))
                .join(' ');
            
            const pathKey = s.split('/')[0];
            const meta = WELL_LIT_PATH_METADATA[pathKey] || {
                sig: 'SIG Router',
                owners: '@gke-runner',
                infra: 'GKE Cluster'
            };
            
            const suiteRuns = runs.filter(r => r.suite === s);
            const hasRegression = suiteRuns.some(r => r.status === 'regression');
            
            return {
                id: s,
                name: formattedName,
                sig: meta.sig,
                owner: meta.owners,
                infra: meta.infra,
                status: hasRegression ? 'Regression Detected' : 'Stable'
            };
        });
    }, [runs]);

    const derivedSuites = useMemo(() => {
        const uniqueSuites = Array.from(new Set(runs.map(r => r.suite).filter(Boolean)))
            .filter(s => s.includes('optimized-baseline'));
        if (uniqueSuites.length === 0) {
            return [
                { 
                    id: 'optimized-baseline/gke/kustomize', 
                    title: 'Optimized Baseline', 
                    infraTag: 'GKE',
                    methodTag: 'Kustomize',
                    sig: 'SIG Router', 
                    desc: 'Baseline optimization regressions tracking' 
                }
            ];
        }
        return uniqueSuites.map(s => {
            const parts = s.split('/');
            const scenarioName = parts[0] ? parts[0].split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : 'Unknown Scenario';
            const infra = parts[1] ? parts[1].toUpperCase() : null;
            const method = parts[2] ? parts[2].charAt(0).toUpperCase() + parts[2].slice(1) : null;
            
            const pathKey = parts[0];
            const meta = WELL_LIT_PATH_METADATA[pathKey] || {
                sig: 'SIG Router',
                owners: '@gke-runner',
                infra: 'GKE Cluster'
            };
            return {
                id: s,
                title: scenarioName,
                infraTag: infra,
                methodTag: method,
                sig: meta.sig,
                desc: `Benchmark suite for benchmark scenario: ${s}`
            };
        });
    }, [runs]);

    const xLabels = {
        output: 'Output Tokens/sec',
        input: 'Input Tokens/sec',
        total: 'Total Tokens/sec',
        qps: 'Queries Per Second (QPS)'
    };
    
    const yLabels = {
        ntpot: 'Normalized TPOT (ms)',
        tpot: 'Time Per Output Token (ms)',
        ttft: 'Time To First Token (ms)',
        itl: 'Inter-Token Latency (ms)',
        e2e: 'E2E Latency (ms)'
    };

    const filteredRuns = useMemo(() => {
        const modelRuns = runs.filter(r => 
            r.model === (selectedPath || 'openai-infqps-concurrency1-opt-125m') &&
            r.suite === (selectedRunMenu || 'optimized-baseline/gke/kustomize')
        );
        const baseData = modelRuns;

        // Map and derive metrics
        const processed = baseData.map(d => {
            // Derive X values (Latency percentiles)
            let xVal_p50 = d.ttft_p50;
            let xVal_p90 = d.ttft_p90;
            let xVal_p99 = d.ttft_p99;

            if (yMetric === 'itl') {
                xVal_p50 = d.itl_p50;
                xVal_p90 = d.itl_p90;
                xVal_p99 = d.itl_p99;
            } else if (yMetric === 'ntpot') {
                xVal_p50 = d.ntpot_p50;
                xVal_p90 = d.ntpot_p90;
                xVal_p99 = d.ntpot_p99;
            } else if (yMetric === 'tpot') {
                xVal_p50 = d.tpot_p50;
                xVal_p90 = d.tpot_p90;
                xVal_p99 = d.tpot_p99;
            } else if (yMetric === 'e2e') {
                xVal_p50 = d.ttft_p50 + d.itl_p50 * 10;
                xVal_p90 = d.ttft_p90 + d.itl_p90 * 10;
                xVal_p99 = d.ttft_p99 + d.itl_p99 * 10;
            }

            // Apply Per Chip scaling to Latency (X-axis)
            if (showPerChip) {
                xVal_p50 = xVal_p50 / 8; // Assume 8 chips
                xVal_p90 = xVal_p90 / 8;
                xVal_p99 = xVal_p99 / 8;
            }

            // Derive Y value (Throughput/QPS)
            let yVal = d.qps;
            if (xAxisMode === 'input') {
                yVal = d.inputTokenRate;
            } else if (xAxisMode === 'total') {
                yVal = d.totalTokenRate;
            } else if (xAxisMode === 'output') {
                yVal = d.outputTokenRate;
            } else if (xAxisMode === 'qps') {
                yVal = d.qps;
            }

            return {
                ...d,
                xVal_p50,
                xVal_p90,
                xVal_p99,
                yVal
            };
        });

        const filtered = processed.filter(d => {
            if (typeof d.yVal === 'number') {
                return d.yVal <= tputCap;
            }
            return true;
        });

        return filtered;
    }, [selectedRunMenu, xAxisMode, yMetric, showPerChip, tputCap, runs, selectedPath]);

    const uniqueRunsForSidebar = useMemo(() => {
        const seen = new Set();
        const unique = [];
        for (const r of filteredRuns) {
            if (!seen.has(r.build)) {
                seen.add(r.build);
                unique.push(r);
            }
        }
        return unique.sort((a, b) => {
            const dateA = a.date || '';
            const dateB = b.date || '';
            if (dateA !== dateB) {
                return dateB.localeCompare(dateA);
            }
            return (b.build || '').localeCompare(a.build || '');
        });
    }, [filteredRuns]);

    const selectedRunsData = useMemo(() => {
        return filteredRuns.filter(r => selectedBuilds.includes(r.build));
    }, [filteredRuns, selectedBuilds]);

    const xDomain = useMemo(() => {
        if (selectedRunsData.length === 0) return [0.1, 100];
        const xVals = selectedRunsData.flatMap(d => [d.xVal_p50, d.xVal_p90, d.xVal_p99]).filter(x => typeof x === 'number');
        if (xVals.length === 0) return [0.1, 100];
        const minX = Math.min(...xVals);
        const maxX = Math.max(...xVals);

        if (isLogScaleX) {
            const logMin = Math.floor(Math.log10(minX > 0 ? minX : 0.1));
            const logMax = Math.ceil(Math.log10(maxX > 0 ? maxX : 100));
            return [Math.pow(10, logMin), Math.pow(10, logMax)];
        } else {
            const pad = (maxX - minX) * 0.05 || 1;
            return [Math.max(0, minX - pad), maxX + pad];
        }
    }, [selectedRunsData, isLogScaleX]);

    const handleExportJson = () => {
        const payload = JSON.stringify({ selectedPath, activeMetric, runs: runs }, null, 2);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(payload);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `nightly_regression_${selectedPath}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    };

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans">
            <PageHeader
                kicker="Prism toolkit"
                title="Nightly regressions & analysis"
                subtitle="Automated CI regression tracking across well-lit paths, serving engines, and GKE clusters."
                onNavigateBack={onNavigateBack}
                actions={<ShareLinkButton />}
            />

            {/* Main Dashboard Body */}
            <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 flex flex-col space-y-8">

                {/* CORE WORKSPACE LAYOUT: TEST RUN SIDEBAR & RECHARTS SUITE */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                    {/* Left Column: Dedicated Test Run Menu Suite */}
                    <Panel className="lg:col-span-3 rounded-3xl p-5 flex flex-col h-full shadow-xs">
                        <div className="border-b border-slate-800 pb-3 mb-4">
                            <span className="kicker text-accent-600 block mb-1">
                                CI pipelines
                            </span>
                            <h3 className="display-title text-base text-white flex items-center gap-2">
                                <span>Defined test runs</span>
                            </h3>
                            <p className="text-micro text-slate-400 mt-1 leading-relaxed">
                                Select a nightly CI regression pipeline to load historical benchmarks.
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 pb-4 space-y-2 max-h-[700px] no-scrollbar">
                            {derivedSuites.map(run => {
                                const isSelected = selectedRunMenu === run.id;
                                return (
                                    <div
                                        key={run.id}
                                        className={cn(
                                            'w-full text-left p-3 rounded-2xl border transition-all flex flex-col gap-1.5',
                                            isSelected
                                                ? 'bg-slate-800 border-slate-600 shadow-xs text-white'
                                                : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                                        )}
                                    >
                                        <div 
                                            onClick={() => setSelectedRunMenu(run.id)}
                                            className="cursor-pointer flex flex-col gap-1 w-full"
                                        >
                                            <span className="font-bold text-xs font-sans text-slate-100 truncate">{run.title}</span>
                                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                {run.infraTag && (
                                                    <Badge tone="info" size="xs" className="shrink-0">
                                                        {run.infraTag}
                                                    </Badge>
                                                )}
                                                {run.methodTag && (
                                                    <Badge tone="neutral" size="xs" className="shrink-0">
                                                        {run.methodTag}
                                                    </Badge>
                                                )}
                                                <span className="text-tiny font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded-full border border-slate-800 shrink-0">
                                                    {run.sig}
                                                </span>
                                            </div>
                                        </div>

                                        {isSelected && (
                                            <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-2 max-h-[220px] overflow-y-auto no-scrollbar">
                                                {uniqueRunsForSidebar.map(runPoint => {
                                                    const isRunSelected = selectedBuilds.includes(runPoint.build);
                                                    return (
                                                        <div
                                                            key={runPoint.build}
                                                            onClick={() => handleToggleBuild(runPoint.build)}
                                                            className={cn(
                                                                'flex items-center justify-between text-tiny p-2 rounded-xl border transition-all cursor-pointer',
                                                                isRunSelected
                                                                    ? 'bg-slate-800 border-slate-600 text-white'
                                                                    : 'bg-slate-900/80 hover:bg-slate-900 border-slate-800/50 text-slate-300'
                                                            )}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <div className={cn(
                                                                    'w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-all',
                                                                    isRunSelected
                                                                        ? 'bg-accent-600 border-accent-600 text-slate-950 font-black'
                                                                        : 'border-slate-700 bg-slate-950'
                                                                )}>
                                                                    {isRunSelected && '✓'}
                                                                </div>
                                                                <div className="flex flex-col flex-1 min-w-0">
                                                                    <a 
                                                                        href={runPoint.github_run_id 
                                                                            ? `https://github.com/${runPoint.github_repository || 'llm-d/llm-d'}/actions/runs/${runPoint.github_run_id}` 
                                                                            : `https://github.com/llm-d/llm-d/actions/runs/${runPoint.build.replace('b', '')}`
                                                                        }
                                                                        target="_blank" 
                                                                        rel="noopener noreferrer"
                                                                        onClick={(e) => e.stopPropagation()} // Prevent selecting run when clicking link
                                                                        className="font-mono font-bold text-slate-200 hover:text-accent-600 hover:underline flex items-center gap-1.5 transition-colors w-fit"
                                                                        title="View GitHub Action Run"
                                                                    >
                                                                        <span>{formatBuildId(runPoint.build)}</span>
                                                                        <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                                                                    </a>
                                                                    {runPoint.hardware && runPoint.hardware !== 'Unknown' && (
                                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                                            <Badge
                                                                                tone={runPoint.hardware.startsWith('TPU') ? 'violet' : 'success'}
                                                                                size="xs"
                                                                            >
                                                                                {runPoint.hardware}
                                                                            </Badge>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </Panel>

                    {/* Right Column: The Core Recharts Suite & Filters */}
                    <ChartContainer
                        className="lg:col-span-9"
                        kicker="Regression telemetry"
                        title={selectedPath || 'Nightly Regression Tracker'}
                        subtitle="Comparing historical nightly CI runs across concurrency stages."
                        metaPills={[
                            <span key="focus" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-mono text-zinc-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Active focus
                            </span>,
                            <span key="infra" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-mono text-zinc-700">
                                <span className="text-zinc-600 font-sans font-medium">Infra:</span>
                                {derivedPaths.find(p => p.id === selectedRunMenu)?.infra || 'Cluster Hardware'}
                            </span>,
                            <span key="sig" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-mono text-zinc-700">
                                <span className="text-zinc-600 font-sans font-medium">SIG:</span>
                                {derivedPaths.find(p => p.id === selectedRunMenu)?.sig || 'SIG-Serving'}
                            </span>,
                            <span key="suite" className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-mono text-zinc-700">
                                {derivedSuites.find(s => s.id === selectedRunMenu)?.title || selectedRunMenu || 'Default Scenario'}
                            </span>,
                        ]}
                        actions={
                            <button
                                type="button"
                                onClick={handleExportJson}
                                title="Export Raw Benchmark JSON"
                                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
                            >
                                <Download className="w-3.5 h-3.5" />
                                <span>Export</span>
                            </button>
                        }
                        showFilters={showChartFilters}
                        onToggleFilters={() => setShowChartFilters(!showChartFilters)}
                        filters={
                            <div className="flex flex-col gap-2.5 w-full">
                                <ChartFilterRow>
                                    <ChartFilterGroup label="X-Axis">
                                        <ToggleGroup
                                            size="xs"
                                            options={[
                                                { value: 'ntpot', label: 'NTPOT' },
                                                { value: 'tpot', label: 'TPOT' },
                                                { value: 'ttft', label: 'TTFT' },
                                                { value: 'itl', label: 'ITL' },
                                                { value: 'e2e', label: 'E2E Latency' },
                                            ]}
                                            value={yMetric}
                                            onChange={setYMetric}
                                        />
                                    </ChartFilterGroup>
                                    <ChartFilterGroup label="Y-Axis">
                                        <ToggleGroup
                                            size="xs"
                                            options={[
                                                { value: 'output', label: 'Output' },
                                                { value: 'input', label: 'Input' },
                                                { value: 'total', label: 'Total' },
                                                { value: 'qps', label: 'QPS' },
                                            ]}
                                            value={xAxisMode}
                                            onChange={setXAxisMode}
                                        />
                                    </ChartFilterGroup>
                                </ChartFilterRow>
                                <ChartFilterRow>
                                    <ChartFilterGroup label="Scale">
                                        <StatPills
                                            options={['Log Scale', 'Per Chip']}
                                            selected={[
                                                ...(isLogScaleX ? ['Log Scale'] : []),
                                                ...(showPerChip ? ['Per Chip'] : []),
                                            ]}
                                            onToggle={(opt) => {
                                                if (opt === 'Log Scale') setIsLogScaleX(!isLogScaleX);
                                                if (opt === 'Per Chip') setShowPerChip(!showPerChip);
                                            }}
                                        />
                                    </ChartFilterGroup>
                                    <ChartFilterGroup label="Percentiles">
                                        <StatPills
                                            options={['P50', 'P90', 'P99']}
                                            selected={visiblePercentiles}
                                            onToggle={(p) => setVisiblePercentiles(prev => prev.includes(p) ? (prev.length > 1 ? prev.filter(x => x !== p) : prev) : [...prev, p])}
                                        />
                                    </ChartFilterGroup>
                                    <ChartCapControl
                                        min={500}
                                        max={4000}
                                        step={100}
                                        value={tputCap}
                                        isAuto={tputCap >= 4000}
                                        onToggleAuto={() => setTputCap(tputCap >= 4000 ? 3000 : 4000)}
                                        onChange={setTputCap}
                                        formatValue={(val) => `${val} tok/s`}
                                    />
                                </ChartFilterRow>
                            </div>
                        }
                        footer={
                            <>
                                <ChartLegend
                                    entries={selectedBuilds.map((build, idx) => ({
                                        key: build,
                                        label: formatBuildId(build),
                                        color: runColor(idx),
                                        shape: getSeriesShape(idx),
                                    }))}
                                />
                                <PercentileLegendKey percentiles={visiblePercentiles} mode="line" />
                            </>
                        }
                    >
                        <div className="w-full h-[420px] select-none relative overflow-visible flex flex-col">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart margin={{ top: 15, right: 30, left: 50, bottom: 35 }}>
                                    <CartesianGrid {...gridProps()} />
                                    <ChartXAxis
                                        dataKey="xVal"
                                        type="number"
                                        label={yLabels[yMetric] || 'Latency'}
                                        scale={isLogScaleX ? 'log' : 'auto'}
                                        domain={xDomain}
                                        allowDataOverflow={true}
                                        ticks={isLogScaleX ? (() => {
                                            const min = xDomain[0];
                                            const max = xDomain[1];
                                            const ticks = [];
                                            let current = Math.pow(10, Math.ceil(Math.log10(min)));
                                            while (current <= max) {
                                                ticks.push(current);
                                                current *= 10;
                                            }
                                            return ticks;
                                        })() : undefined}
                                    />
                                    <ChartYAxis
                                        label={xLabels[xAxisMode] || 'Throughput'}
                                    />
                                    <Tooltip
                                        isAnimationActive={false}
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                const tputUnit = xAxisMode === 'qps' ? 'qps' : 'tok/s';
                                                return (
                                                    <ChartTooltip className="min-w-[240px]">
                                                        <div className="border-b border-zinc-200 pb-1.5 mb-1.5">
                                                            <div className="text-micro font-mono font-bold text-zinc-900 leading-tight flex justify-between gap-3">
                                                                <span>Run: {formatBuildId(d.build)}</span>
                                                                <span className="text-zinc-500">Stage {d.stage}</span>
                                                            </div>
                                                            <div className="text-tiny text-zinc-500 mt-0.5">
                                                                Date: {d.date} | Model: {d.model}
                                                            </div>
                                                        </div>
                                                        <ChartTooltipRow label="Target Rate" value={d.request_rate ? `${d.request_rate} QPS` : 'N/A'} />
                                                        <ChartTooltipRow label="Achieved Rate" value={d.qps !== undefined ? `${Number(d.qps).toFixed(1)} QPS` : 'N/A'} />
                                                        <ChartTooltipRow label="Duration" value={d.duration ? `${Number(d.duration).toFixed(0)}s` : 'N/A'} />
                                                        <ChartTooltipRow
                                                            label="Request Success Rate"
                                                            value={
                                                                <span className={cn(d.success_rate < 90 ? 'text-red-600' : 'text-emerald-600')}>
                                                                    {d.success_rate.toFixed(1)}%
                                                                </span>
                                                            }
                                                        />
                                                        {payload.map((entry, index) => (
                                                            <div key={index} className="pt-1.5 mt-1.5 border-t border-zinc-200">
                                                                <div className="flex items-center gap-1.5 mb-0.5">
                                                                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: entry.stroke }} aria-hidden="true" />
                                                                    <span className="text-tiny font-bold text-zinc-900">{entry.name}</span>
                                                                </div>
                                                                <ChartTooltipRow label="Throughput" value={entry.value !== undefined ? `${Number(entry.value).toFixed(1)} ${tputUnit}` : 'N/A'} />
                                                                <ChartTooltipRow label="Latency" value={entry.payload.xVal !== undefined ? `${Number(entry.payload.xVal).toFixed(1)} ms` : 'N/A'} />
                                                            </div>
                                                        ))}
                                                        {d.note && (
                                                            <div className="mt-1.5 pt-1.5 border-t border-zinc-200 text-tiny text-amber-800 font-sans leading-normal">
                                                                ⚠️ {d.note}
                                                            </div>
                                                        )}
                                                    </ChartTooltip>
                                                );
                                            }
                                            return null;
                                        }}
                                    />

                                    {selectedBuilds.map((build, buildIdx) => {
                                        const color = runColor(buildIdx);
                                        const runData = filteredRuns.filter(r => r.build === build);

                                        const p50Data = runData.map(r => ({ ...r, xVal: r.xVal_p50 })).sort((a, b) => a.stage - b.stage);
                                        const p90Data = runData.map(r => ({ ...r, xVal: r.xVal_p90 })).sort((a, b) => a.stage - b.stage);
                                        const p99Data = runData.map(r => ({ ...r, xVal: r.xVal_p99 })).sort((a, b) => a.stage - b.stage);

                                        return (
                                            <React.Fragment key={build}>
                                                {visiblePercentiles.includes('P50') && (
                                                    <Line
                                                        type="monotone"
                                                        data={p50Data}
                                                        dataKey="yVal"
                                                        name={`${formatBuildId(build)} P50`}
                                                        stroke={color}
                                                        strokeWidth={2.5}
                                                        dot={<CustomizedDot />}
                                                        activeDot={<CustomizedDot r={6} />}
                                                        isAnimationActive={false}
                                                    />
                                                )}
                                                {visiblePercentiles.includes('P90') && (
                                                    <Line
                                                        type="monotone"
                                                        data={p90Data}
                                                        dataKey="yVal"
                                                        name={`${formatBuildId(build)} P90`}
                                                        stroke={color}
                                                        strokeDasharray="4 3"
                                                        strokeWidth={1.75}
                                                        dot={<CustomizedDot />}
                                                        activeDot={<CustomizedDot r={5} />}
                                                        isAnimationActive={false}
                                                    />
                                                )}
                                                {visiblePercentiles.includes('P99') && (
                                                    <Line
                                                        type="monotone"
                                                        data={p99Data}
                                                        dataKey="yVal"
                                                        name={`${formatBuildId(build)} P99`}
                                                        stroke={color}
                                                        strokeDasharray="2 2"
                                                        strokeWidth={1.75}
                                                        dot={<CustomizedDot />}
                                                        activeDot={<CustomizedDot r={5} />}
                                                        isAnimationActive={false}
                                                    />
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </ChartContainer>
                </div>

            {/* WELL-LIT PATH STATUS MATRIX */}
                <Panel padding="none" className="rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-800 flex items-center justify-between flex-wrap gap-4">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <FileCode className="w-4 h-4 text-accent-700" />
                                <span>Active Well-Lit Paths & SIG Ownership Matrix</span>
                            </h3>
                            <p className="text-xs text-slate-400 mt-0.5">
                                Select any well-lit path below to load its nightly regression history into the charts above.
                            </p>
                        </div>

                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs font-mono">
                            <thead>
                                <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-tiny">
                                    <th className="p-4 font-sans">Well-Lit Path ID</th>
                                    <th className="p-4 font-sans">SIG Ownership</th>
                                    <th className="p-4 font-sans">Maintainers (OWNERS.md)</th>
                                    <th className="p-4 font-sans">Target Infrastructure</th>
                                    <th className="p-4 font-sans">Nightly Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                                {derivedPaths.map((path, idx) => {
                                    const isCurrent = selectedRunMenu === path.id;
                                    return (
                                        <tr 
                                            key={idx} 
                                            onClick={() => {
                                                setSelectedRunMenu(path.id);
                                                const suiteRuns = runs.filter(r => r.suite === path.id);
                                                if (suiteRuns.length > 0) {
                                                    setSelectedPath(suiteRuns[0].model);
                                                }
                                            }}
                                            className={cn(
                                                'hover:bg-slate-800/40 transition-colors cursor-pointer',
                                                isCurrent && 'bg-slate-800/70'
                                            )}
                                        >
                                            <td className="p-4 text-white font-sans flex items-center gap-2">
                                                <span>{path.name}</span>
                                                {isCurrent && <Badge tone="info" size="xs" className="font-sans">Active</Badge>}
                                            </td>
                                            <td className="p-4 font-sans text-white">{path.sig}</td>
                                            <td className="p-4 text-white">{path.owner}</td>
                                            <td className="p-4 text-white">{path.infra}</td>
                                            <td className="p-4 font-sans text-white">
                                                {path.status}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Panel>

                {/* FAQ SECTION */}
                <Panel className="rounded-2xl shadow-xl space-y-4">
                    <div className="flex items-center gap-2.5 border-b border-slate-800 pb-3">
                        <div className="p-1.5 bg-purple-500/20 text-purple-400 rounded-lg">
                            <Zap className="w-4 h-4" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-white">Regressions & Analysis Governance FAQ</h3>
                            <p className="text-xs text-slate-400">Prepopulated guidelines for SIG syncs and release criteria.</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {[
                            {
                                q: "How are well-lit paths maintained across SIG organizations?",
                                a: "Each well-lit path is explicitly owned by at least one core contributor defined in an OWNERS.md file. SIG members are responsible for provisioning required cluster networking and hardware driver compatibility before nightly test execution."
                            }
                        ].map((item, i) => (
                            <div key={i} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50 transition-all">
                                <button 
                                    onClick={() => setShowFaq(showFaq === i ? null : i)} 
                                    className="w-full p-3 text-left flex justify-between items-center font-semibold text-xs text-slate-200 hover:bg-slate-800/30 transition-colors cursor-pointer"
                                >
                                    <span>{item.q}</span>
                                    {showFaq === i ? <ChevronUp className="w-4 h-4 text-accent-700 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                                </button>
                                {showFaq === i && (
                                    <div className="p-3 pt-0 text-xs text-slate-400 border-t border-slate-800 bg-slate-900/30 leading-relaxed animate-in fade-in duration-200">
                                        {item.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Panel>

            </main>



        </div>
    );
}
