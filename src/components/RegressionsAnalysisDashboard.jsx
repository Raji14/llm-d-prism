import React, { useState, useEffect, useMemo } from 'react';
import { ExternalLink, Download, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import {
    Badge, Button, Checkbox, ChartContainer, ChartFilterRow, ChartFilterGroup, ChartCapControl,
    ChartLegend, PercentileLegendKey, ChartTooltip, ChartTooltipRow, ChartXAxis, ChartYAxis,
    EmptyState, LoadingState, PageHeader, Panel, ShareLinkButton, StatPills, ToggleGroup,
    CHART_STATUS, getAxisConfig, getSeriesShape, gridProps, seriesColor,
} from './ui';
import { cn } from '../utils/cn';
import { fetchRegressionRuns } from '../utils/gcsScanner';
import {
    PERCENTILES, REGRESSION_RULE, REGRESSIONS_URL_PARAMS, buildPipelines, compareLatest, comparisonSummary,
    formatRunTime, latencyOf, normalizeRegressionRows, readRegressionsView, resolveRegressionsView,
    runStages, throughputOf, trendPoints, trendRate, writeRegressionsView,
} from '../utils/regressionRuns';

// Every number on this page is read from the nightly CI's Benchmark Reports
// (GET /api/regressions; pure logic in src/utils/regressionRuns.js). Nothing
// is estimated or filled in: no sample runs, no derived latencies, and a
// metadata field the reports don't carry is left out rather than guessed.

// Selected runs map onto the shared CHART_SERIES palette by fixed slot.
// Percentiles (P50/P90/P99) are told apart by line style, not by shade.
const RUN_SERIES_SLOTS = [1, 3, 4, 0, 2];
const runColor = (idx) => seriesColor(RUN_SERIES_SLOTS[idx % RUN_SERIES_SLOTS.length]);
const TREND_COLOR = seriesColor(1);
const PCT_DASH = { P50: undefined, P90: '6 4', P99: '2 3' };
// A run that lost this many requests is drawn red: its latencies describe the survivors only.
const MIN_SUCCESS_RATE = 90;

const METRIC_LABELS = { ntpot: 'NTPOT', tpot: 'TPOT', ttft: 'TTFT', itl: 'ITL', e2e: 'Request latency' };
const METRIC_AXIS = {
    ntpot: 'Normalized TPOT (ms)',
    tpot: 'Time per output token (ms)',
    ttft: 'Time to first token (ms)',
    itl: 'Inter-token latency (ms)',
    e2e: 'Request latency (ms)',
};
const TPUT_LABELS = { output: 'Output tok/s', input: 'Input tok/s', total: 'Total tok/s', qps: 'Requests/s' };
const STATUS_TONES = { slower: 'danger', faster: 'success', steady: 'neutral', 'no-history': 'neutral', none: 'neutral' };
const BUCKET_PATH = 'gs://llm-d-benchmarks/regressions/';
const ACTIONS_REPO = 'llm-d/llm-d';

const shortDay = (ts) => new Date(ts).toISOString().slice(5, 10);
const fmtMs = (v) => (v == null ? 'n/a' : `${v >= 100 ? Math.round(v) : v.toFixed(1)} ms`);
const fmtRate = (v, tput) => (v == null ? 'n/a' : tput === 'qps' ? `${v.toFixed(2)} req/s` : `${Math.round(v).toLocaleString()} tok/s`);
const runUrl = (run) => (run.githubRunId ? `https://github.com/${run.githubRepository || ACTIONS_REPO}/actions/runs/${run.githubRunId}` : null);

function RunDot({ cx, cy, stroke, payload, r = 3.5 }) {
    if (cx == null || cy == null) return null;
    const failed = payload?.successRate != null && payload.successRate < MIN_SUCCESS_RATE;
    return (
        <circle
            cx={cx}
            cy={cy}
            r={failed ? r + 1.5 : r}
            fill={failed ? CHART_STATUS.critical : stroke}
            stroke={failed ? CHART_STATUS.critical : stroke}
            strokeWidth={1.5}
        />
    );
}

function RunTooltip({ active, payload, tput }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
        <ChartTooltip className="min-w-[240px]" title={formatRunTime(d.build)} subtitle={[d.hardware, d.model].filter(Boolean).join(' · ')}>
            {d.stage != null && <ChartTooltipRow label="Stage" value={d.stage} />}
            <ChartTooltipRow label="Requested rate" value={d.requestRate ? `${d.requestRate} req/s` : 'n/a'} />
            <ChartTooltipRow label="Achieved rate" value={d.qps ? `${d.qps.toFixed(2)} req/s` : 'n/a'} />
            {d.yVal != null && <ChartTooltipRow label={TPUT_LABELS[tput]} value={fmtRate(d.yVal, tput)} />}
            <ChartTooltipRow
                label="Request success"
                value={
                    d.successRate == null ? 'n/a' : (
                        <span className={cn(d.successRate < MIN_SUCCESS_RATE ? 'text-red-600' : 'text-emerald-600')}>
                            {d.successRate.toFixed(1)}%
                        </span>
                    )
                }
            />
            {payload.map((entry) => (
                <ChartTooltipRow key={entry.name} color={entry.stroke} label={entry.name} value={fmtMs(entry.payload.xVal ?? entry.value)} />
            ))}
        </ChartTooltip>
    );
}

export default function RegressionsAnalysisDashboard({ onNavigateBack }) {
    const [load, setLoad] = useState({ status: 'loading', rows: [], error: null });
    const [attempt, setAttempt] = useState(0);
    const [view, setView] = useState(() => readRegressionsView(window.location.search));
    const [showChartFilters, setShowChartFilters] = useState(true);
    const [openFaq, setOpenFaq] = useState(null);

    useEffect(() => {
        let active = true;
        fetchRegressionRuns()
            .then((rows) => active && setLoad({ status: 'ready', rows, error: null }))
            .catch((e) => active && setLoad({ status: 'error', rows: [], error: e.message }));
        return () => {
            active = false;
        };
    }, [attempt]);

    const retry = () => {
        setLoad({ status: 'loading', rows: [], error: null });
        setAttempt((n) => n + 1);
    };

    const points = useMemo(() => normalizeRegressionRows(load.rows), [load.rows]);
    const pipelines = useMemo(() => buildPipelines(points), [points]);
    const resolved = useMemo(() => resolveRegressionsView(view, pipelines), [view, pipelines]);
    const pipeline = pipelines.find((p) => p.id === resolved.pipeline) || null;
    const selectedRuns = useMemo(
        () => (pipeline ? resolved.runs.map((id) => pipeline.runs.find((r) => r.build === id)).filter(Boolean) : []),
        [pipeline, resolved.runs]
    );

    // Share link: the URL mirrors the view once the runs are known (and not
    // before, so a shared link isn't rewritten while it loads).
    useEffect(() => {
        if (load.status !== 'ready' || !pipelines.length) return;
        const next = `${window.location.pathname}?${writeRegressionsView(resolved, window.location.search)}${window.location.hash}`;
        if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
            window.history.replaceState(window.history.state, '', next);
        }
    }, [load.status, pipelines.length, resolved]);

    // Leaving the page: App copies the query string into the next view's URL,
    // so take this page's params back out (only once the view has changed).
    useEffect(
        () => () => {
            const q = new URLSearchParams(window.location.search);
            if (q.get('view') === 'regressions-analysis') return;
            const before = q.toString();
            REGRESSIONS_URL_PARAMS.forEach((k) => q.delete(k));
            if (q.toString() !== before) {
                window.history.replaceState(window.history.state, '', `${window.location.pathname}?${q}${window.location.hash}`);
            }
        },
        []
    );

    const update = (patch) => setView({ ...resolved, ...patch });
    const toggleRun = (build) => {
        const on = resolved.runs.includes(build);
        if (on && resolved.runs.length === 1) return; // keep one run selected
        update({ runs: on ? resolved.runs.filter((b) => b !== build) : [...resolved.runs, build] });
    };
    const togglePct = (p) => {
        const on = resolved.pct.includes(p);
        if (on && resolved.pct.length === 1) return;
        update({ pct: PERCENTILES.filter((x) => (x === p ? !on : resolved.pct.includes(x))) });
    };

    // Nightly trend: one point per run at the pipeline's usual load, on the
    // accelerator of the first selected run (pipelines can mix accelerators).
    const rate = useMemo(() => (pipeline ? trendRate(points, pipeline.id) : null), [points, pipeline]);
    const trendAll = useMemo(() => (pipeline && rate != null ? trendPoints(points, pipeline.id, rate) : []), [points, pipeline, rate]);
    const focusPoint = trendAll.find((p) => p.build === resolved.runs[0]) || trendAll[trendAll.length - 1] || null;
    const focusHw = focusPoint ? focusPoint.hardware : null;
    const trend = useMemo(() => trendAll.filter((p) => p.hardware === focusHw), [trendAll, focusHw]);
    const otherHwRuns = trendAll.length - trend.length;
    const trendData = useMemo(
        () =>
            trend.map((p) => ({
                ...p,
                P50: latencyOf(p, resolved.metric, 'P50'),
                P90: latencyOf(p, resolved.metric, 'P90'),
                P99: latencyOf(p, resolved.metric, 'P99'),
            })),
        [trend, resolved.metric]
    );

    // Sweep: throughput vs. latency across each selected run's load stages.
    const sweepSeries = useMemo(() => {
        if (!pipeline) return [];
        return selectedRuns.map((run, idx) => {
            const stages = runStages(points, pipeline.id, run.build);
            return {
                run,
                color: runColor(idx),
                byPct: Object.fromEntries(
                    PERCENTILES.map((p) => [
                        p,
                        stages
                            .map((s) => ({ ...s, xVal: latencyOf(s, resolved.metric, p), yVal: throughputOf(s, resolved.tput) }))
                            .filter((s) => s.xVal != null && s.yVal != null),
                    ])
                ),
            };
        });
    }, [pipeline, selectedRuns, points, resolved.metric, resolved.tput]);

    const isTrend = resolved.chart === 'trend';
    const isLog = resolved.scale === 'log';
    const latencyValues = isTrend
        ? trendData.flatMap((d) => resolved.pct.map((p) => d[p]))
        : sweepSeries.flatMap((s) => resolved.pct.flatMap((p) => s.byPct[p].map((d) => d.xVal)));
    const finiteLatencies = latencyValues.filter((v) => typeof v === 'number' && v > 0);
    const dataMax = Math.max(10, Math.ceil((finiteLatencies.length ? Math.max(...finiteLatencies) : 100) * 1.15));
    const capStep = Math.max(1, Math.round(dataMax / 50));
    const capValue = resolved.cap ? Math.min(resolved.cap, dataMax) : dataMax;
    const baseAxis = getAxisConfig(finiteLatencies.filter((v) => !resolved.cap || v <= resolved.cap), isLog);
    const latencyAxis = resolved.cap && !isLog ? { ...baseAxis, domain: [0, resolved.cap] } : baseAxis;
    const hasE2e = points.some((p) => p.e2e);

    const statusRows = useMemo(
        () =>
            pipelines.map((p) => {
                const r = trendRate(points, p.id);
                return { pipeline: p, rate: r, summary: comparisonSummary(r == null ? null : compareLatest(trendPoints(points, p.id, r))) };
            }),
        [pipelines, points]
    );

    const handleExportJson = () => {
        if (!pipeline) return;
        const rows = load.rows.filter((r) => r.suite === pipeline.id);
        const url = URL.createObjectURL(new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `nightly_regressions_${pipeline.platform || 'pipeline'}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const shareUrl = () =>
        load.status === 'ready' && pipelines.length
            ? `${window.location.origin}${window.location.pathname}?${writeRegressionsView(resolved, window.location.search)}`
            : window.location.href;

    const metaPill = 'inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-mono text-zinc-700';

    let body;
    if (load.status === 'loading') {
        body = (
            <Panel role="status" aria-live="polite" className="rounded-3xl">
                <LoadingState label="Loading nightly runs…" />
                <p className="text-center text-xs text-theme-muted -mt-10 pb-6">
                    The server reads every nightly report from the CI bucket. A cold load can take about a minute.
                </p>
            </Panel>
        );
    } else if (load.status === 'error') {
        body = (
            <Panel role="alert" className="rounded-3xl">
                <EmptyState
                    title={`Couldn't load nightly runs: ${load.error}`}
                    message={`Prism reads nightly results from ${BUCKET_PATH}. A server without read access to that bucket (a fork without Google Cloud credentials, for example) can't show them.`}
                    action={
                        <Button variant="secondary" size="sm" onClick={retry}>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>Try again</span>
                        </Button>
                    }
                />
            </Panel>
        );
    } else if (!pipelines.length) {
        body = (
            <Panel role="status" className="rounded-3xl">
                <EmptyState
                    title="No nightly runs yet"
                    message={`The server found no nightly Benchmark Reports under ${BUCKET_PATH}. Runs show up here after the first nightly CI job uploads one.`}
                />
            </Panel>
        );
    }

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col items-center w-full font-sans">
            <PageHeader
                kicker="Nightly CI"
                title="Nightly regressions & analysis"
                subtitle="Nightly llm-d CI benchmarks per platform, read straight from each run's Benchmark Report."
                onNavigateBack={onNavigateBack}
                actions={<ShareLinkButton getUrl={shareUrl} />}
            />

            {/* The app shell's <main> wraps every view, so this is a plain container. */}
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 flex flex-col space-y-8">
                {body || (
                    <>
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 w-full">
                            {/* Pipelines and their runs */}
                            <Panel className="lg:col-span-3 rounded-3xl p-5 flex flex-col h-full shadow-xs">
                                <div className="border-b border-slate-800 pb-3 mb-4">
                                    <h2 className="display-title text-base text-white">CI pipelines</h2>
                                    <p className="text-micro text-slate-400 mt-1 leading-relaxed">
                                        One nightly pipeline per platform. Pick one, then the runs to compare.
                                    </p>
                                </div>
                                <ul className="space-y-2" aria-label="CI pipelines">
                                    {pipelines.map((p) => {
                                        const isSelected = p.id === resolved.pipeline;
                                        return (
                                            <li key={p.id}>
                                                <button
                                                    type="button"
                                                    aria-pressed={isSelected}
                                                    onClick={() => update({ pipeline: p.id, runs: [] })}
                                                    className={cn(
                                                        'w-full text-left p-3 rounded-2xl border transition-all flex flex-col gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60',
                                                        isSelected
                                                            ? 'bg-slate-800 border-slate-600 shadow-xs text-white'
                                                            : 'bg-slate-950/50 border-slate-800/80 text-slate-300 hover:bg-slate-850 hover:border-slate-700'
                                                    )}
                                                >
                                                    <span className="flex items-center justify-between gap-2">
                                                        <span className="font-bold text-sm text-slate-100">{p.label}</span>
                                                        <span className="text-tiny font-mono text-slate-400">{p.runs.length} runs</span>
                                                    </span>
                                                    <span className="text-micro text-slate-400">
                                                        {p.pathLabel}
                                                        {p.method ? ` · ${p.method}` : ''}
                                                    </span>
                                                    {p.latest && (
                                                        <span className="text-tiny font-mono text-slate-400">Latest {formatRunTime(p.latest.build)}</span>
                                                    )}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>

                                {pipeline && (
                                    <fieldset className="mt-4 pt-3 border-t border-slate-800 min-w-0">
                                        <legend className="text-micro font-semibold text-slate-300 mb-2">
                                            {pipeline.label} runs, newest first
                                        </legend>
                                        <ul className="space-y-1.5 max-h-[360px] overflow-y-auto pr-1">
                                            {pipeline.runs.map((run) => {
                                                const checked = resolved.runs.includes(run.build);
                                                const href = runUrl(run);
                                                const id = `run-${run.build}`;
                                                return (
                                                    <li
                                                        key={run.build}
                                                        className={cn(
                                                            'flex items-center justify-between gap-2 text-tiny p-2 rounded-xl border transition-colors',
                                                            checked ? 'bg-slate-800 border-slate-600 text-white' : 'bg-slate-900/80 border-slate-800/50 text-slate-300'
                                                        )}
                                                    >
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <Checkbox id={id} checked={checked} onChange={() => toggleRun(run.build)} />
                                                            <label htmlFor={id} className="flex flex-col min-w-0 cursor-pointer">
                                                                <span className="font-mono font-bold text-slate-200">{formatRunTime(run.build)}</span>
                                                                {run.hardware && <span className="text-slate-400">{run.hardware}</span>}
                                                            </label>
                                                        </div>
                                                        {href && (
                                                            <a
                                                                href={href}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="shrink-0 rounded p-1 text-slate-400 hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
                                                                aria-label={`GitHub Actions run for ${formatRunTime(run.build)}`}
                                                                title="GitHub Actions run"
                                                            >
                                                                <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                                            </a>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    </fieldset>
                                )}
                            </Panel>

                            {/* Charts */}
                            <section className="lg:col-span-9 min-w-0" aria-labelledby="regressions-chart-heading">
                                <h2 id="regressions-chart-heading" className="sr-only">
                                    Run history
                                </h2>
                                <ChartContainer
                                    kicker={isTrend ? 'Nightly trend' : 'Load sweep'}
                                    title={
                                        isTrend
                                            ? `${METRIC_LABELS[resolved.metric]} across nightly runs`
                                            : `${TPUT_LABELS[resolved.tput]} vs. ${METRIC_LABELS[resolved.metric]}, selected runs`
                                    }
                                    subtitle={
                                        isTrend
                                            ? `One point per run at ${rate ?? '?'} req/s on ${focusHw || 'the same accelerator'}${otherHwRuns ? `. ${otherHwRuns} runs on other accelerators are hidden; select one of them to see its trend.` : '.'}`
                                            : 'Each point is one load stage of a run. Most nightly runs measure a single stage, so they show as one point.'
                                    }
                                    metaPills={[
                                        <span key="pipeline" className={metaPill}>
                                            <span className="text-zinc-600 font-sans font-medium">Pipeline:</span>
                                            {pipeline?.label} · {pipeline?.pathLabel}
                                        </span>,
                                        <span key="model" className={metaPill}>
                                            <span className="text-zinc-600 font-sans font-medium">Model:</span>
                                            {pipeline?.models.join(', ')}
                                        </span>,
                                        pipeline?.hardware.length ? (
                                            <span key="hw" className={metaPill}>
                                                <span className="text-zinc-600 font-sans font-medium">Accelerators:</span>
                                                {pipeline.hardware.join(', ')}
                                            </span>
                                        ) : null,
                                    ]}
                                    actions={
                                        <button
                                            type="button"
                                            onClick={handleExportJson}
                                            title="Download this pipeline's runs as JSON"
                                            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
                                        >
                                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                                            <span>Export</span>
                                        </button>
                                    }
                                    showFilters={showChartFilters}
                                    onToggleFilters={() => setShowChartFilters(!showChartFilters)}
                                    filters={
                                        <div className="flex flex-col gap-2.5 w-full">
                                            <ChartFilterRow>
                                                <ChartFilterGroup label="Chart">
                                                    <ToggleGroup
                                                        size="xs"
                                                        options={[
                                                            { value: 'trend', label: 'Nightly trend' },
                                                            { value: 'sweep', label: 'Load sweep' },
                                                        ]}
                                                        value={resolved.chart}
                                                        onChange={(chart) => update({ chart, cap: null })}
                                                    />
                                                </ChartFilterGroup>
                                                <ChartFilterGroup label="Latency">
                                                    <ToggleGroup
                                                        size="xs"
                                                        options={[
                                                            { value: 'ntpot', label: 'NTPOT' },
                                                            { value: 'tpot', label: 'TPOT' },
                                                            { value: 'ttft', label: 'TTFT' },
                                                            { value: 'itl', label: 'ITL' },
                                                            ...(hasE2e ? [{ value: 'e2e', label: 'Request latency' }] : []),
                                                        ]}
                                                        value={resolved.metric}
                                                        onChange={(metric) => update({ metric, cap: null })}
                                                    />
                                                </ChartFilterGroup>
                                                {!isTrend && (
                                                    <ChartFilterGroup label="Throughput">
                                                        <ToggleGroup
                                                            size="xs"
                                                            options={[
                                                                { value: 'output', label: 'Output' },
                                                                { value: 'input', label: 'Input' },
                                                                { value: 'total', label: 'Total' },
                                                                { value: 'qps', label: 'QPS' },
                                                            ]}
                                                            value={resolved.tput}
                                                            onChange={(tput) => update({ tput })}
                                                        />
                                                    </ChartFilterGroup>
                                                )}
                                            </ChartFilterRow>
                                            <ChartFilterRow>
                                                <ChartFilterGroup label="Scale">
                                                    <StatPills
                                                        options={[{ value: 'log', label: 'Log latency' }]}
                                                        selected={isLog ? ['log'] : []}
                                                        onToggle={() => update({ scale: isLog ? 'linear' : 'log' })}
                                                    />
                                                </ChartFilterGroup>
                                                <ChartFilterGroup label="Percentiles">
                                                    <StatPills options={PERCENTILES} selected={resolved.pct} onToggle={togglePct} />
                                                </ChartFilterGroup>
                                                <ChartCapControl
                                                    label="Latency cap"
                                                    value={Math.round(capValue)}
                                                    min={Math.max(1, Math.round(dataMax * 0.05))}
                                                    max={dataMax}
                                                    step={capStep}
                                                    unit="ms"
                                                    isAuto={!resolved.cap}
                                                    onAutoToggle={() => update({ cap: resolved.cap ? null : Math.round(dataMax * 0.8) })}
                                                    onChange={(cap) => update({ cap })}
                                                />
                                            </ChartFilterRow>
                                        </div>
                                    }
                                    footer={
                                        <>
                                            <ChartLegend
                                                entries={
                                                    isTrend
                                                        ? [
                                                              { key: 'trend', label: `${pipeline?.label} runs`, color: TREND_COLOR, shape: 'circle' },
                                                              ...selectedRuns.map((r, idx) => ({
                                                                  key: r.build,
                                                                  label: `Selected: ${formatRunTime(r.build)}`,
                                                                  color: runColor(idx),
                                                                  shape: getSeriesShape(idx),
                                                              })),
                                                              { key: 'failed', label: `Under ${MIN_SUCCESS_RATE}% request success`, color: CHART_STATUS.critical, shape: 'circle' },
                                                          ]
                                                        : sweepSeries.map((s, idx) => ({
                                                              key: s.run.build,
                                                              label: formatRunTime(s.run.build),
                                                              color: s.color,
                                                              shape: getSeriesShape(idx),
                                                          }))
                                                }
                                            />
                                            <PercentileLegendKey percentiles={resolved.pct} mode="line" />
                                        </>
                                    }
                                >
                                    <div className="w-full h-[420px] select-none relative overflow-visible flex flex-col">
                                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                            {isTrend ? (
                                                <LineChart data={trendData} margin={{ top: 15, right: 30, left: 50, bottom: 35 }}>
                                                    <CartesianGrid {...gridProps()} />
                                                    <ChartXAxis
                                                        dataKey="ts"
                                                        type="number"
                                                        scale="time"
                                                        domain={['dataMin', 'dataMax']}
                                                        tickFormatter={shortDay}
                                                        label="Nightly run (UTC date)"
                                                    />
                                                    <ChartYAxis
                                                        label={METRIC_AXIS[resolved.metric]}
                                                        scale={isLog ? 'log' : 'auto'}
                                                        domain={latencyAxis.domain}
                                                        ticks={latencyAxis.ticks}
                                                        allowDataOverflow
                                                    />
                                                    <Tooltip isAnimationActive={false} content={<RunTooltip tput={resolved.tput} />} />
                                                    {resolved.pct.map((p) => (
                                                        <Line
                                                            key={p}
                                                            type="monotone"
                                                            dataKey={p}
                                                            name={`${METRIC_LABELS[resolved.metric]} ${p}`}
                                                            stroke={TREND_COLOR}
                                                            strokeWidth={p === 'P50' ? 2.25 : 1.5}
                                                            strokeDasharray={PCT_DASH[p]}
                                                            dot={<RunDot />}
                                                            activeDot={<RunDot r={5} />}
                                                            connectNulls
                                                            isAnimationActive={false}
                                                        />
                                                    ))}
                                                    {selectedRuns.map((r, idx) =>
                                                        trend.some((p) => p.build === r.build) ? (
                                                            <ReferenceLine key={r.build} x={r.ts} stroke={runColor(idx)} strokeWidth={2} strokeDasharray="4 3" />
                                                        ) : null
                                                    )}
                                                </LineChart>
                                            ) : (
                                                <LineChart margin={{ top: 15, right: 30, left: 50, bottom: 35 }}>
                                                    <CartesianGrid {...gridProps()} />
                                                    <ChartXAxis
                                                        dataKey="xVal"
                                                        type="number"
                                                        label={METRIC_AXIS[resolved.metric]}
                                                        scale={isLog ? 'log' : 'auto'}
                                                        domain={latencyAxis.domain}
                                                        ticks={latencyAxis.ticks}
                                                        allowDataOverflow
                                                    />
                                                    <ChartYAxis dataKey="yVal" type="number" label={TPUT_LABELS[resolved.tput]} />
                                                    <Tooltip isAnimationActive={false} content={<RunTooltip tput={resolved.tput} />} />
                                                    {sweepSeries.flatMap((s) =>
                                                        resolved.pct.map((p) => (
                                                            <Line
                                                                key={`${s.run.build}-${p}`}
                                                                type="monotone"
                                                                data={s.byPct[p]}
                                                                dataKey="yVal"
                                                                name={`${formatRunTime(s.run.build)} ${p}`}
                                                                stroke={s.color}
                                                                strokeWidth={p === 'P50' ? 2.25 : 1.5}
                                                                strokeDasharray={PCT_DASH[p]}
                                                                dot={<RunDot />}
                                                                activeDot={<RunDot r={5} />}
                                                                isAnimationActive={false}
                                                            />
                                                        ))
                                                    )}
                                                </LineChart>
                                            )}
                                        </ResponsiveContainer>
                                    </div>
                                </ChartContainer>
                            </section>
                        </div>

                        {/* Pipeline status: the latest run against its own history */}
                        <Panel padding="none" className="rounded-2xl shadow-xl overflow-hidden">
                            <div className="p-5 border-b border-slate-800">
                                <h2 className="text-base font-bold text-white">Pipeline status</h2>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Each pipeline&apos;s latest run: {REGRESSION_RULE.pct.toLowerCase()} {REGRESSION_RULE.metric.toUpperCase()} against
                                    the median of up to {REGRESSION_RULE.window} earlier runs on the same accelerator at the same load,
                                    flagged beyond ±{Math.round(REGRESSION_RULE.threshold * 100)}%. A heuristic, not a test verdict.
                                </p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                        <tr className="bg-slate-950 text-slate-400 border-b border-slate-800 uppercase tracking-wider text-tiny">
                                            <th scope="col" className="p-4">Pipeline</th>
                                            <th scope="col" className="p-4">Accelerators</th>
                                            <th scope="col" className="p-4">Latest run</th>
                                            <th scope="col" className="p-4">Runs</th>
                                            <th scope="col" className="p-4">Latest vs. history</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/60 font-medium text-slate-300">
                                        {statusRows.map(({ pipeline: p, summary }) => {
                                            const isCurrent = p.id === resolved.pipeline;
                                            return (
                                                <tr key={p.id} className={cn('transition-colors', isCurrent && 'bg-slate-800/70')}>
                                                    <th scope="row" className="p-4 font-sans">
                                                        <button
                                                            type="button"
                                                            aria-pressed={isCurrent}
                                                            onClick={() => update({ pipeline: p.id, runs: [] })}
                                                            className="inline-flex items-center gap-2 rounded text-left text-white hover:text-accent-600 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
                                                        >
                                                            <span className="font-semibold">{p.label}</span>
                                                            <span className="text-slate-400 font-normal">{p.pathLabel}</span>
                                                            {isCurrent && <Badge tone="info" size="xs">Showing</Badge>}
                                                        </button>
                                                    </th>
                                                    <td className="p-4 font-mono text-white">{p.hardware.join(', ') || 'Not recorded'}</td>
                                                    <td className="p-4 font-mono text-white">{p.latest ? formatRunTime(p.latest.build) : 'n/a'}</td>
                                                    <td className="p-4 font-mono text-white">{p.runs.length}</td>
                                                    <td className="p-4">
                                                        <div className="flex flex-col gap-1">
                                                            <Badge tone={STATUS_TONES[summary.status]} size="xs" className="w-fit">
                                                                {summary.label}
                                                            </Badge>
                                                            {summary.detail && <span className="text-tiny text-slate-400">{summary.detail}</span>}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </Panel>
                    </>
                )}

                {/* How this page works */}
                <Panel className="rounded-2xl shadow-xl space-y-4">
                    <div className="border-b border-slate-800 pb-3">
                        <h2 className="text-base font-bold text-white">How this page works</h2>
                    </div>
                    <div className="space-y-3">
                        {[
                            {
                                q: 'Where do these numbers come from?',
                                a: `Each nightly CI job uploads one Benchmark Report per load stage to ${BUCKET_PATH}<path>/<platform>/. Prism shows the recorded values as they are: nothing is estimated, and fields a report doesn't carry are left out.`,
                            },
                            {
                                q: 'How is "Slower than usual" decided?',
                                a: `It's a heuristic: the latest run's ${REGRESSION_RULE.pct.toLowerCase()} ${REGRESSION_RULE.metric.toUpperCase()} against the median of up to ${REGRESSION_RULE.window} earlier runs on the same accelerator at the same request rate. Beyond ±${Math.round(REGRESSION_RULE.threshold * 100)}% it's flagged. Check the run itself before filing a bug.`,
                            },
                            {
                                q: 'Why does a run show as a single point?',
                                a: 'Most nightly runs measure one load stage. The nightly trend joins those points run by run; the load sweep draws a line only for runs that measured several stages.',
                            },
                        ].map((item, i) => (
                            <div key={item.q} className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/50">
                                <button
                                    type="button"
                                    aria-expanded={openFaq === i}
                                    aria-controls={`regressions-faq-${i}`}
                                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                                    className="w-full p-3 text-left flex justify-between items-center font-semibold text-xs text-slate-200 hover:bg-slate-800/30 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60"
                                >
                                    <span>{item.q}</span>
                                    {openFaq === i ? (
                                        <ChevronUp className="w-4 h-4 text-accent-700 shrink-0" aria-hidden="true" />
                                    ) : (
                                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" aria-hidden="true" />
                                    )}
                                </button>
                                {openFaq === i && (
                                    <div id={`regressions-faq-${i}`} className="p-3 text-xs text-slate-400 border-t border-slate-800 bg-slate-900/30 leading-relaxed">
                                        {item.a}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </Panel>
            </div>
        </div>
    );
}
