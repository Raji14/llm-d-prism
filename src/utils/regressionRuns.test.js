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

import assert from 'node:assert';
import {
    DEFAULT_VIEW, REGRESSION_RULE, buildPipelines, compareLatest, comparisonSummary, defaultPipelineId,
    formatRunTime, latencyOf, normalizeRegressionRow, normalizeRegressionRows, parseSuite, readRegressionsView,
    resolveRegressionsView, runStages, runTimestamp, trendPoints, trendRate, writeRegressionsView,
} from './regressionRuns.js';

console.log('Running regressionRuns unit tests...');

// Rows shaped like GET /api/regressions (server/server.js).
const row = (suite, runId, extra = {}) => ({
    suite,
    runId,
    date: runId.slice(7, 11) + '-' + runId.slice(11, 13) + '-' + runId.slice(13, 15),
    model: 'Qwen/Qwen3-32B',
    hardware: 'GPU',
    stage: 0,
    request_rate: 1,
    success_rate: 100,
    qps: 1,
    output_token_rate: 60,
    input_token_rate: 400,
    total_token_rate: 460,
    ttft: { p50: 40, p90: 50, p99: 60 },
    tpot: { p50: 11, p90: 12, p99: 17 },
    ntpot: { p50: 12, p90: 13, p99: 18 },
    itl: { p50: 10, p90: 11, p99: 18 },
    github_run_id: '33495821489',
    github_repository: null,
    ...extra,
});

const CKS = 'optimized-baseline/cks/kustomize';
const GKE = 'optimized-baseline/gke/kustomize';
const ROCM = 'optimized-baseline/rocm/kustomize';

// 1. Suites are named by platform, not all "Optimized Baseline".
assert.deepStrictEqual(
    [parseSuite(CKS).label, parseSuite(GKE).label, parseSuite(ROCM).label, parseSuite('optimized-baseline/ocp/kustomize').label],
    ['CKS', 'GKE', 'ROCm', 'OCP']
);
assert.strictEqual(parseSuite(GKE).pathLabel, 'Optimized baseline');
assert.strictEqual(parseSuite(GKE).method, 'kustomize');

// 2. Run stamps sort by time, whatever the prefix (runner- or root-).
assert.strictEqual(formatRunTime('runner-20261124-002730-308'), '2026-11-24 00:27:30');
assert.ok(runTimestamp('root-20261014-002247-809') > runTimestamp('runner-20261005-205830-601'));
assert.strictEqual(formatRunTime('no-stamp'), 'no-stamp');

// 3. Normalizing keeps recorded values only: no invented e2e, missing stays missing.
const n = normalizeRegressionRow(row(CKS, 'runner-20261101-010000-000', { ttft: { p50: 40 }, e2e: undefined }));
assert.strictEqual(n.e2e, null);
assert.strictEqual(latencyOf(n, 'ttft', 'P50'), 40);
assert.strictEqual(latencyOf(n, 'ttft', 'P99'), null);
assert.strictEqual(n.githubRunId, '33495821489');
// A run carrying the same stage as v0.2 and v0.2.1 counts once.
assert.strictEqual(
    normalizeRegressionRows([row(CKS, 'runner-20261101-010000-000'), row(CKS, 'runner-20261101-010000-000')]).length,
    1
);

// 4. Pipelines, runs newest first, and the default is the newest nightly
// (not the last row in API order).
const rows = [
    row(CKS, 'runner-20261120-010000-000'),
    row(CKS, 'runner-20261124-002730-308'),
    row(CKS, 'runner-20261122-010000-000'),
    row(GKE, 'runner-20261123-142018-653', { hardware: 'H100' }),
    row(GKE, 'runner-20261123-142018-653', { hardware: 'H100', stage: 1, request_rate: 3, output_token_rate: 150, ttft: { p50: 55, p90: 70, p99: 90 } }),
    row(ROCM, 'runner-20261026-212900-000'),
];
const points = normalizeRegressionRows(rows);
const pipelines = buildPipelines(points);
assert.deepStrictEqual(pipelines.map((p) => p.label), ['CKS', 'GKE', 'ROCm']);
assert.deepStrictEqual(
    pipelines[0].runs.map((r) => r.build),
    ['runner-20261124-002730-308', 'runner-20261122-010000-000', 'runner-20261120-010000-000']
);
assert.strictEqual(defaultPipelineId(pipelines), CKS);
const def = resolveRegressionsView(readRegressionsView(''), pipelines);
assert.strictEqual(def.pipeline, CKS);
assert.deepStrictEqual(def.runs, ['runner-20261124-002730-308']);
assert.strictEqual(def.chart, 'trend');

// 5. Trend: one point per run at the usual load, oldest first; sweep: a run's stages.
assert.strictEqual(trendRate(points, GKE), 1);
assert.deepStrictEqual(trendPoints(points, CKS, 1).map((p) => p.build.slice(7, 15)), ['20261120', '20261122', '20261124']);
assert.deepStrictEqual(runStages(points, GKE, 'runner-20261123-142018-653').map((p) => p.stage), [0, 1]);

// 6. Latest vs. history: median of earlier runs on the same accelerator, ±20%.
const hist = (ttfts, hardware = 'GPU') =>
    normalizeRegressionRows(
        ttfts.map((t, i) => row(CKS, `runner-202611${String(10 + i).padStart(2, '0')}-010000-000`, { hardware, ttft: { p50: t, p90: t, p99: t } }))
    );
assert.strictEqual(compareLatest(hist([40, 42, 38, 41, 60])).status, 'slower');
assert.strictEqual(compareLatest(hist([40, 42, 38, 41, 25])).status, 'faster');
assert.strictEqual(compareLatest(hist([40, 42, 38, 41, 43])).status, 'steady');
assert.strictEqual(compareLatest(hist([40])).status, 'no-history');
assert.strictEqual(compareLatest([]), null);
// Only the last `window` earlier runs count.
assert.strictEqual(compareLatest(hist([10, 10, 10, 40, 40, 40, 40, 40, 40, 40, 41])).history.length, REGRESSION_RULE.window);
// Runs on another accelerator are not history.
const mixed = [...hist([100, 100, 100], 'H100'), ...normalizeRegressionRows([row(CKS, 'runner-20261130-010000-000', { ttft: { p50: 40 } })])];
assert.strictEqual(compareLatest(mixed).status, 'no-history');
const s = comparisonSummary(compareLatest(hist([40, 40, 40, 60])));
assert.strictEqual(s.label, 'Slower than usual');
assert.strictEqual(s.detail, 'Latest p50 TTFT +50% vs. the median of 3 earlier runs');
assert.strictEqual(comparisonSummary(null).label, 'No p50 TTFT recorded');

// 7. URL round trip: pipeline, runs, chart, axes, percentiles, scale and cap,
// keeping the view and the dev preview params, dropping everything else.
const view = {
    ...DEFAULT_VIEW,
    pipeline: GKE,
    runs: ['runner-20261123-142018-653', 'runner-20261122-010000-000'],
    chart: 'sweep',
    metric: 'ttft',
    tput: 'total',
    pct: ['P50', 'P99'],
    scale: 'log',
    cap: 950.4,
};
const qs = writeRegressionsView(view, '?view=regressions-analysis&instance=internal&brand=prism&workload=chat');
const q = new URLSearchParams(qs);
assert.strictEqual(q.get('view'), 'regressions-analysis');
assert.strictEqual(q.get('instance'), 'internal');
assert.strictEqual(q.get('brand'), 'prism');
assert.strictEqual(q.get('workload'), null);
assert.deepStrictEqual(readRegressionsView(qs), { ...view, cap: 950 });
// Defaults stay out of the URL, except the pipeline and runs.
assert.strictEqual(writeRegressionsView(def, '?view=regressions-analysis'), `view=regressions-analysis&pipeline=${encodeURIComponent(CKS)}&runs=runner-20261124-002730-308`);
// Junk falls back to defaults; a platform code picks its pipeline; unknown runs are dropped.
const junk = readRegressionsView('?chart=pie&metric=foo&pct=p42&scale=weird&cap=-3&pipeline=gke&runs=nope');
assert.strictEqual(junk.chart, 'trend');
assert.strictEqual(junk.metric, 'ntpot');
assert.deepStrictEqual(junk.pct, ['P50', 'P90', 'P99']);
assert.strictEqual(junk.scale, 'linear');
assert.strictEqual(junk.cap, null);
assert.deepStrictEqual(resolveRegressionsView(junk, pipelines).runs, ['runner-20261123-142018-653']);
assert.strictEqual(resolveRegressionsView(junk, pipelines).pipeline, GKE);
// No data: nothing selected.
assert.deepStrictEqual(resolveRegressionsView(DEFAULT_VIEW, []).runs, []);

console.log('regressionRuns tests passed.');
