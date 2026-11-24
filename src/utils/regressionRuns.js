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

// Nightly regression runs as served by GET /api/regressions (server/server.js
// parses one Benchmark Report v0.2 per run and load stage). These helpers are
// pure so the Regressions page only renders, and regressionRuns.test.js
// covers the logic: normalize the rows (recorded values only, nothing
// invented), group them into CI pipelines and runs, pick the defaults,
// compare the latest run with its own history, and mirror the view in the
// URL so Share link reproduces it.

export const LATENCY_METRICS = ['ntpot', 'tpot', 'ttft', 'itl', 'e2e'];
export const THROUGHPUT_METRICS = ['output', 'input', 'total', 'qps'];
export const PERCENTILES = ['P50', 'P90', 'P99'];
export const CHART_MODES = ['trend', 'sweep'];

export const DEFAULT_VIEW = {
    pipeline: null,
    runs: [],
    chart: 'trend',
    metric: 'ntpot',
    tput: 'output',
    pct: ['P50', 'P90', 'P99'],
    scale: 'linear',
    cap: null, // latency cap in ms; null = Auto
};

// "Regression?" is a heuristic, so its rule is spelled out next to the result:
// the latest run's p50 TTFT against the median of up to 7 earlier runs on the
// same accelerator at the same load, flagged beyond ±20%.
export const REGRESSION_RULE = { metric: 'ttft', pct: 'P50', window: 7, threshold: 0.2 };

// CI platform codes in the bucket path: regressions/<path>/<platform>/<method>/…
const PLATFORM_LABELS = { gke: 'GKE', cks: 'CKS', ocp: 'OCP', rocm: 'ROCm' };

const STAMP = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const pct3 = (o) => ({ p50: num(o?.p50), p90: num(o?.p90), p99: num(o?.p99) });
const known = (v) => (v != null && v !== '' && v !== 'Unknown' ? String(v) : null);
const sentence = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ') : '');

/** "optimized-baseline/gke/kustomize" -> its well-lit path, CI platform and deploy method. */
export function parseSuite(suite = '') {
    const [path = '', platform = '', method = ''] = String(suite).split('/');
    return {
        id: String(suite),
        path,
        platform,
        method,
        label: PLATFORM_LABELS[platform] || platform.toUpperCase() || String(suite),
        pathLabel: sentence(path),
    };
}

/** Run folder stamp ("runner-20261124-002730-308") -> ms; the date folder is the fallback. */
export function runTimestamp(runId, date) {
    const m = String(runId || '').match(STAMP);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    const t = Date.parse(date || '');
    return Number.isNaN(t) ? 0 : t;
}

/** "runner-20261124-002730-308" -> "2026-11-24 00:27:30"; ids without a stamp stay as they are. */
export function formatRunTime(runId) {
    const m = String(runId || '').match(STAMP);
    return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : String(runId || 'Unknown run');
}

/** One API row -> one measured point. Missing values stay missing (0 / null), never guessed. */
export function normalizeRegressionRow(d = {}, idx = 0) {
    const build = known(d.runId) || `run-${idx}`;
    return {
        build,
        ts: runTimestamp(build, d.date),
        date: known(d.date),
        suite: known(d.suite) || 'unknown',
        model: known(d.model) || 'Unknown model',
        hardware: known(d.hardware),
        stage: Number.isFinite(d.stage) ? d.stage : 0,
        requestRate: num(d.request_rate),
        qps: num(d.qps),
        duration: num(d.duration),
        successRate: typeof d.success_rate === 'number' ? d.success_rate : null,
        output: num(d.output_token_rate),
        input: num(d.input_token_rate),
        total: num(d.total_token_rate),
        ttft: pct3(d.ttft),
        tpot: pct3(d.tpot),
        ntpot: pct3(d.ntpot),
        itl: pct3(d.itl),
        // Request (end-to-end) latency, only when the report recorded it.
        e2e: d.e2e ? pct3(d.e2e) : null,
        githubRunId: known(d.github_run_id),
        githubRepository: known(d.github_repository),
    };
}

/** All rows, one point per run and stage (a run can carry the same stage as v0.2 and v0.2.1). */
export function normalizeRegressionRows(rows = []) {
    const seen = new Set();
    const out = [];
    (Array.isArray(rows) ? rows : []).forEach((d, i) => {
        const p = normalizeRegressionRow(d, i);
        const key = `${p.suite}|${p.build}|${p.stage}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(p);
    });
    return out;
}

/** A metric's recorded value, or null when the report has none. */
export function latencyOf(point, metric, pct) {
    const v = point?.[metric]?.[String(pct).toLowerCase()];
    return typeof v === 'number' && v > 0 ? v : null;
}

export function throughputOf(point, tput) {
    const v = point?.[tput];
    return typeof v === 'number' && v > 0 ? v : null;
}

/** Runs (one per build) of a pipeline, newest first. */
export function runsOf(points, suite) {
    const byBuild = new Map();
    points
        .filter((p) => p.suite === suite)
        .forEach((p) => {
            const run = byBuild.get(p.build) || {
                build: p.build,
                ts: p.ts,
                date: p.date,
                model: p.model,
                hardware: new Set(),
                stages: 0,
                githubRunId: null,
                githubRepository: null,
            };
            run.stages += 1;
            if (p.hardware) run.hardware.add(p.hardware);
            run.githubRunId = run.githubRunId || p.githubRunId;
            run.githubRepository = run.githubRepository || p.githubRepository;
            byBuild.set(p.build, run);
        });
    return [...byBuild.values()]
        .map((r) => ({ ...r, hardware: [...r.hardware].join(' · ') || null }))
        .sort((a, b) => b.ts - a.ts || b.build.localeCompare(a.build));
}

/** CI pipelines (one per suite) with their runs, in a stable order by platform. */
export function buildPipelines(points) {
    return [...new Set(points.map((p) => p.suite))]
        .map((suite) => {
            const own = points.filter((p) => p.suite === suite);
            const runs = runsOf(points, suite);
            return {
                ...parseSuite(suite),
                runs,
                latest: runs[0] || null,
                models: [...new Set(own.map((p) => p.model))],
                hardware: [...new Set(own.map((p) => p.hardware).filter(Boolean))],
            };
        })
        .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
}

/** The pipeline whose latest run is the newest nightly. */
export function defaultPipelineId(pipelines = []) {
    const newest = [...pipelines].sort((a, b) => (b.latest?.ts || 0) - (a.latest?.ts || 0))[0];
    return newest ? newest.id : null;
}

/** The load most runs of a pipeline were measured at (nightlies run one fixed rate). */
export function trendRate(points, suite) {
    const counts = new Map();
    points
        .filter((p) => p.suite === suite && p.requestRate > 0)
        .forEach((p) => counts.set(p.requestRate, (counts.get(p.requestRate) || 0) + 1));
    let best = null;
    counts.forEach((n, rate) => {
        if (best === null || n > counts.get(best) || (n === counts.get(best) && rate < best)) best = rate;
    });
    return best;
}

/** One point per run at the shared load, oldest first: the nightly trend. */
export function trendPoints(points, suite, rate) {
    const byBuild = new Map();
    points
        .filter((p) => p.suite === suite && p.requestRate === rate)
        .forEach((p) => {
            const prev = byBuild.get(p.build);
            if (!prev || p.stage < prev.stage) byBuild.set(p.build, p);
        });
    return [...byBuild.values()].sort((a, b) => a.ts - b.ts);
}

const median = (values) => {
    const s = [...values].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * The latest run against the median of up to `window` earlier runs on the
 * same accelerator at the same load. status: slower | faster | steady |
 * no-history; null when no run recorded the metric.
 */
export function compareLatest(trend = [], rule = REGRESSION_RULE) {
    const valued = trend.filter((p) => latencyOf(p, rule.metric, rule.pct) != null);
    const latest = valued[valued.length - 1];
    if (!latest) return null;
    const history = valued.filter((p) => p !== latest && p.hardware === latest.hardware).slice(-rule.window);
    if (!history.length) return { latest, history, baseline: null, delta: null, status: 'no-history' };
    const baseline = median(history.map((p) => latencyOf(p, rule.metric, rule.pct)));
    const delta = (latencyOf(latest, rule.metric, rule.pct) - baseline) / baseline;
    const status = delta > rule.threshold ? 'slower' : delta < -rule.threshold ? 'faster' : 'steady';
    return { latest, history, baseline, delta, status };
}

/**
 * compareLatest() in plain words: the badge label and the sentence behind it,
 * so the page never shows a verdict without its rule.
 */
export function comparisonSummary(cmp, rule = REGRESSION_RULE) {
    const metric = `${rule.pct.toLowerCase()} ${rule.metric.toUpperCase()}`;
    if (!cmp) return { status: 'none', label: `No ${metric} recorded`, detail: null };
    if (cmp.status === 'no-history') {
        return {
            status: 'no-history',
            label: 'No earlier runs',
            detail: `Nothing to compare with on ${cmp.latest.hardware || 'this accelerator'} at this load yet`,
        };
    }
    const n = cmp.history.length;
    const pct = Math.round(cmp.delta * 100);
    const detail = `Latest ${metric} ${pct > 0 ? '+' : ''}${pct}% vs. the median of ${n} earlier run${n === 1 ? '' : 's'}`;
    if (cmp.status === 'slower') return { status: 'slower', label: 'Slower than usual', detail };
    if (cmp.status === 'faster') return { status: 'faster', label: 'Faster than usual', detail };
    return { status: 'steady', label: `Within ±${Math.round(rule.threshold * 100)}%`, detail };
}

/** One run's load stages, lowest first: the throughput vs. latency sweep. */
export function runStages(points, suite, build) {
    return points.filter((p) => p.suite === suite && p.build === build).sort((a, b) => a.stage - b.stage);
}

/** Page state from a query string; anything unknown falls back to the default. */
export function readRegressionsView(search = '') {
    const q = new URLSearchParams(search);
    const list = (k) => (q.get(k) || '').split(',').map((s) => s.trim()).filter(Boolean);
    const pick = (k, allowed, fallback) => (allowed.includes(q.get(k)) ? q.get(k) : fallback);
    const pct = list('pct').map((s) => s.toUpperCase());
    const cap = Number(q.get('cap'));
    return {
        pipeline: q.get('pipeline') || null,
        runs: list('runs'),
        chart: pick('chart', CHART_MODES, DEFAULT_VIEW.chart),
        metric: pick('metric', LATENCY_METRICS, DEFAULT_VIEW.metric),
        tput: pick('tput', THROUGHPUT_METRICS, DEFAULT_VIEW.tput),
        pct: PERCENTILES.some((p) => pct.includes(p)) ? PERCENTILES.filter((p) => pct.includes(p)) : DEFAULT_VIEW.pct,
        scale: q.get('scale') === 'log' ? 'log' : 'linear',
        cap: Number.isFinite(cap) && cap > 0 ? cap : null,
    };
}

// The params this page writes; App can clear them when another view opens.
export const REGRESSIONS_URL_PARAMS = ['pipeline', 'runs', 'chart', 'metric', 'tput', 'pct', 'scale', 'cap'];
// The view and the which-Prism preview params (dev server only, src/config/site.js) ride along.
const KEEP_PARAMS = ['view', 'instance', 'brand', 'site', 'pinned'];

/**
 * Query string for the page state. Pipeline and runs are always written, so
 * a shared link keeps pointing at the same runs after newer nightlies land;
 * the rest only when it differs from the default.
 */
export function writeRegressionsView(view, search = '') {
    const current = new URLSearchParams(search);
    const q = new URLSearchParams();
    KEEP_PARAMS.forEach((k) => {
        if (current.get(k) != null) q.set(k, current.get(k));
    });
    if (view.pipeline) q.set('pipeline', view.pipeline);
    if (view.runs?.length) q.set('runs', view.runs.join(','));
    if (view.chart !== DEFAULT_VIEW.chart) q.set('chart', view.chart);
    if (view.metric !== DEFAULT_VIEW.metric) q.set('metric', view.metric);
    if (view.tput !== DEFAULT_VIEW.tput) q.set('tput', view.tput);
    if ((view.pct || []).join(',') !== DEFAULT_VIEW.pct.join(',')) q.set('pct', view.pct.map((p) => p.toLowerCase()).join(','));
    if (view.scale === 'log') q.set('scale', 'log');
    if (view.cap) q.set('cap', String(Math.round(view.cap)));
    return q.toString();
}

/** Fits a requested view to the loaded data: a known pipeline, its runs, the newest run by default. */
export function resolveRegressionsView(view, pipelines = []) {
    const requested = pipelines.find((p) => p.id === view.pipeline || (view.pipeline && p.platform === view.pipeline));
    const pipeline = requested || pipelines.find((p) => p.id === defaultPipelineId(pipelines));
    if (!pipeline) return { ...view, pipeline: null, runs: [] };
    const ids = new Set(pipeline.runs.map((r) => r.build));
    const runs = requested ? (view.runs || []).filter((id) => ids.has(id)) : [];
    return {
        ...view,
        pipeline: pipeline.id,
        runs: runs.length ? [...new Set(runs)] : pipeline.latest ? [pipeline.latest.build] : [],
    };
}
