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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { RAW_GEMMA_DATA, FALLBACK_PREFIX_CACHE_DATA, FALLBACK_PD_DATA, FALLBACK_AGENTIC_DATA } from './wellLitPathData.js';
import {
    AGENTIC_PROOF, PD_PROOF, PREFIX_CACHE_PROOF, ROUTING_PROOF, bestPoint, computeAgenticProof, computePdProof,
    computePrefixCacheProof, computeRoutingProof, routingPointNear, routingRowsFromReports,
} from './wellLitProofs.js';
import { renderWellLitProofOutcome } from './dashboardHelpers.jsx';

console.log('Running wellLitProofs unit tests...');

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, rel), 'utf8');
const RATIO = /^\d+(\.\d)?(–\d+(\.\d)?)?×$/; // "1.9×" or "1.4–2.6×": a ratio, never a % gain

// 1. Intelligent routing: p99 TTFT of a Kubernetes Service ÷ the gateway's,
// best point of the sweep, so "up to".
assert.strictEqual(ROUTING_PROOF.metric, '8.1×');
assert.strictEqual(ROUTING_PROOF.upTo, true);
assert.strictEqual(ROUTING_PROOF.claim, 'lower tail latency under load');
assert.strictEqual(ROUTING_PROOF.context, 'p99 time to first token at 5 QPS, vs. a standard Kubernetes Service');
// Percentile: every point is the guide's p99 pair, at every QPS where both sides were measured.
assert.deepStrictEqual(
    ROUTING_PROOF.points.map((p) => [p.qps, p.baseline, p.optimized]),
    RAW_GEMMA_DATA.filter((r) => r.baseline_ttft_p99 > 0 && r.optimal_ttft_p99 > 0).map((r) => [r.qps, r.baseline_ttft_p99, r.optimal_ttft_p99])
);
assert.strictEqual(bestPoint(ROUTING_PROOF).qps, 5);
assert.strictEqual(ROUTING_PROOF.metric, `${(6954 / 854).toFixed(1)}×`);
// No claim when the gateway never wins or the Service wasn't measured; one point isn't "up to".
assert.strictEqual(computeRoutingProof([{ qps: 1, baseline_ttft_p99: 100, optimal_ttft_p99: 200 }]), null);
assert.strictEqual(computeRoutingProof([{ qps: 8, optimal_ttft_p99: 1400 }]), null);
assert.strictEqual(computeRoutingProof([{ qps: 5, baseline_ttft_p99: 900, optimal_ttft_p99: 300 }]).upTo, false);

// 2. The routing page's live sweep, quoted at the guide's own load (5 QPS),
// not where the Service saturates and the ratio explodes.
const rep = (scenario, stage, qps, p99) => ({ scenario, stage, qps, ttft: { p50: 1, p90: 2, p99 } });
const liveRows = routingRowsFromReports([
    rep('k8s-service-baseline', 0, 0.5, 100), // stage 0 (warm-up) is skipped
    rep('llm-d-intelligent-router', 0, 0.5, 90),
    rep('k8s-service-baseline', 1, 0.98, 300),
    rep('llm-d-intelligent-router', 1, 1.02, 400),
    rep('k8s-service-baseline', 2, 4.9, 7000),
    rep('llm-d-intelligent-router', 2, 5.1, 875),
    rep('k8s-service-baseline', 3, 10.8, 900000),
    rep('llm-d-intelligent-router', 3, 11, 1500),
    rep('llm-d-intelligent-router', 4, 14, 1400), // no Service run at this stage: dropped
]);
assert.deepStrictEqual(liveRows, [
    { qps: 1, baseline_ttft_p99: 300, optimal_ttft_p99: 400 },
    { qps: 5, baseline_ttft_p99: 7000, optimal_ttft_p99: 875 }, // achieved rates averaged per stage
    { qps: 10.9, baseline_ttft_p99: 900000, optimal_ttft_p99: 1500 },
]);
const live = computeRoutingProof(liveRows);
assert.strictEqual(live.metric, '600.0×'); // the saturated tail would dominate "up to"
const atGuide = routingPointNear(live, bestPoint(ROUTING_PROOF).qps);
assert.deepStrictEqual([atGuide.qps, atGuide.ratio], [5, 8]);
assert.strictEqual(routingPointNear(null, 5), null);
assert.strictEqual(routingPointNear(live, null), null);
assert.strictEqual(computeRoutingProof(routingRowsFromReports([])), null);

// 3. Prefix cache offloading: best offload tier's throughput ÷ HBM-only vLLM,
// as a range across context lengths.
assert.strictEqual(PREFIX_CACHE_PROOF.metric, '1.4–2.6×');
assert.strictEqual(PREFIX_CACHE_PROOF.upTo, false);
assert.strictEqual(PREFIX_CACHE_PROOF.claim, 'higher throughput as context grows');
assert.strictEqual(PREFIX_CACHE_PROOF.context, '30k→70k tokens of context · CPU + Lustre vs. HBM-only vLLM · Qwen3-32B on H100');
assert.deepStrictEqual(PREFIX_CACHE_PROOF.points.map((p) => p.size), ['30k', '50k', '70k']);
PREFIX_CACHE_PROOF.points.forEach((p) => assert.strictEqual(p.ratio, p.optimized / p.baseline));
// One context size (all the live API has today): one ratio, and no "as context grows".
const oneSize = computePrefixCacheProof(FALLBACK_PREFIX_CACHE_DATA.filter((r) => r.workloadSize === '30k'));
assert.strictEqual(oneSize.metric, '1.4×');
assert.strictEqual(oneSize.claim, 'higher throughput on long contexts');
assert.match(oneSize.context, /^30k tokens of context · CPU \+ Lustre vs\. HBM-only vLLM/);

// 4. Agentic serving: total throughput of the combined stack ÷ a Kubernetes
// Service, across concurrency levels, as a ratio (the page used to say "+111.0%").
assert.strictEqual(AGENTIC_PROOF.metric, '1.9×');
assert.strictEqual(AGENTIC_PROOF.upTo, false);
assert.strictEqual(AGENTIC_PROOF.claim, 'higher multi-turn throughput');
assert.strictEqual(AGENTIC_PROOF.context, '10→60 concurrent sessions · 163k-token context · Qwen3-Coder-480B FP8 on TPU v7x');
AGENTIC_PROOF.points.forEach((p) => assert.strictEqual(p.ratio, p.optimized / p.baseline));
assert.deepStrictEqual(computeAgenticProof(FALLBACK_AGENTIC_DATA), AGENTIC_PROOF);

// 5. P/D disaggregation: best split vs. an even split of the same replicas,
// never vs. the weakest split.
assert.strictEqual(PD_PROOF.metric, '1.5×');
assert.strictEqual(PD_PROOF.upTo, false);
assert.strictEqual(PD_PROOF.claim, 'more throughput than an even split');
assert.strictEqual(PD_PROOF.context, '2 prefill : 6 decode vs. 4 : 4 · Qwen3-Coder-480B FP8');
assert.strictEqual(PD_PROOF.baseline, 'An even 4 : 4 prefill : decode split of the same 8 replicas');
const reference = PD_PROOF.points.find((p) => p.isReference);
const best = PD_PROOF.points.find((p) => p.isBest);
assert.deepStrictEqual([reference.split, best.split], ['4:4', '2:6']);
assert.strictEqual(PD_PROOF.metric, `${(best.total / reference.total).toFixed(1)}×`);
const noEven = computePdProof(FALLBACK_PD_DATA.filter((r) => r.prefill !== r.decode));
assert.strictEqual(noEven.claim, 'more throughput than a mid-range split');
assert.strictEqual(noEven.points.find((p) => p.isReference).split, '5:3');

// Every headline is a ratio in ×.
[ROUTING_PROOF, PREFIX_CACHE_PROOF, AGENTIC_PROOF, PD_PROOF].forEach((p) => assert.match(p.metric, RATIO));

// 6. Home and the four pages read the same proof. Home's card and the page's
// headline name the same export, and the pages keep no hard-coded headline.
const home = read('../components/PrismHome.jsx');
const PAGES = [
    ['inference-scheduling', 'ROUTING_PROOF', '../components/Milestone1Dashboard.jsx', ["'-41%'", '-41%', '22.2k']],
    ['prefix-cache-offloading', 'PREFIX_CACHE_PROOF', '../components/PrefixCacheOffloadingDashboard.jsx', ["'+83%'", "'-63%'"]],
    ['agentic-serving', 'AGENTIC_PROOF', '../components/AgenticWorkloadsDashboard.jsx', ["'+94.3%'", "'-63.9%'"]],
    ['pd-disaggregation', 'PD_PROOF', '../components/PdDisaggregationDashboard.jsx', []],
];
for (const [view, proof, file, stale] of PAGES) {
    const page = read(file);
    assert.match(home, new RegExp(`path: '${view}',[^}]*?proof: ${proof},`), `Home's ${view} card reads ${proof}`);
    assert.match(page, new RegExp(`import \\{[^}]*\\b${proof}\\b[^}]*\\} from '\\.\\./utils/wellLitProofs\\.js'`), `${file} imports ${proof}`);
    assert.match(page, new RegExp(`renderWellLitProofOutcome\\(\\{\\s*proof: ${proof},`), `${file} renders ${proof} as its headline`);
    stale.forEach((s) => assert.ok(!page.includes(s), `${file} still hard-codes ${s}`));
}

// The page headline renders exactly what Home's card shows: "up to" (when the
// proof says so), the metric, the claim and the conditions.
for (const proof of [ROUTING_PROOF, PREFIX_CACHE_PROOF, AGENTIC_PROOF, PD_PROOF]) {
    const html = renderToStaticMarkup(renderWellLitProofOutcome({ proof }));
    [proof.metric, proof.claim, proof.context].forEach((s) => assert.ok(html.includes(s), `headline shows "${s}"`));
    assert.strictEqual(html.includes('>up to<'), proof.upTo);
    assert.ok(html.includes('href="?view=methodology#paths"'));
}
// A live figure is labelled and sits under the guide's number, never in place of it.
const withLive = renderToStaticMarkup(
    renderWellLitProofOutcome({
        proof: ROUTING_PROOF,
        live: { source: 'Live sweep on this page', metric: '17.1×', claim: 'lower p99 TTFT', context: 'p99 time to first token at 5.1 QPS' },
    })
);
assert.ok(withLive.indexOf('8.1×') < withLive.indexOf('Live sweep on this page'));
assert.ok(withLive.includes('17.1×'));
// No proof, no number.
assert.ok(!renderToStaticMarkup(renderWellLitProofOutcome({ proof: null })).includes('×'));

console.log('wellLitProofs tests passed.');
