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

// Run: npx tsx src/utils/leaderboardSources.test.js
import assert from 'node:assert';
import { RESULTS_WORKSPACE_KEY, curveToEntry, isRankableCurve, leaderboardLinkFor, lineageOf, loadPublishedResults, parseWorkloadLabel } from './leaderboardSources.js';
import { countWaitingResults } from './resultsWorkspace.js';
import { buildLeaderboardDataset, evaluateDatasetAtSlo } from './leaderboardData.js';

console.log('Running leaderboardSources unit tests...');

const memoryStorage = (value) => ({ getItem: (k) => (k === RESULTS_WORKSPACE_KEY ? value : null) });

const point = (key, conc, output, ttftP50, extra = {}) => ({
    key,
    conc,
    output,
    total: null,
    ttft: ttftP50,
    ttftMean: ttftP50 * 1.1,
    ttftP50,
    ttftP99: ttftP50 * 2.5,
    tpot: 20 + conc / 4,
    tpotMean: 21 + conc / 4,
    tpotP50: 20 + conc / 4,
    tpotP99: 40 + conc / 2,
    included: true,
    runId: 'run-1',
    ...extra,
});

const curve = (id, status, extra = {}) => ({
    id,
    name: `Result ${id}`,
    version: 1,
    status,
    visibility: status === 'published' ? 'public' : status === 'official' ? 'instance' : 'me',
    owner: '@rajithal',
    markedAt: Date.UTC(2026, 9, 1),
    meta: {
        model: 'Llama-3.1-70B-Instruct',
        modelFull: 'meta-llama/Llama-3.1-70B-Instruct',
        accelerator: 'H100 ×8',
        accelCount: 8,
        workload: '1024/512',
        harness: 'inference-perf',
        engine: 'vLLM',
        setup: 'vLLM baseline',
        category: 'Inference scheduling',
    },
    points: [
        point('p1', 1, 400, 90),
        point('p2', 8, 2400, 180),
        point('p3', 32, 5200, 900),
        // Overloaded: 10× the latency for under 25% more throughput.
        point('p4', 64, 5600, 9000),
        // Excluded by a curator: never shown.
        point('p5', 128, 9999, 50, { included: false, reason: 'Excluded by you' }),
    ],
    ...extra,
});

// 1. What ranks on each instance.
{
    assert.strictEqual(isRankableCurve(curve('a', 'published'), 'public'), true);
    assert.strictEqual(isRankableCurve({ ...curve('b', 'published'), visibility: 'link' }, 'public'), false, 'link-only results are not listed');
    assert.strictEqual(isRankableCurve(curve('c', 'in_review'), 'public'), false);
    assert.strictEqual(isRankableCurve(curve('d', 'draft'), 'public'), false);
    assert.strictEqual(isRankableCurve(curve('e', 'official'), 'internal'), true);
    assert.strictEqual(isRankableCurve(curve('f', 'official'), 'public'), false);
    assert.strictEqual(isRankableCurve({ ...curve('g', 'published'), supersededBy: 'h' }, 'public'), false, 'replaced versions never rank');
}

// 2. Workload labels.
{
    assert.deepStrictEqual(parseWorkloadLabel('1024/512'), { isl: 1024, osl: 512 });
    assert.deepStrictEqual(parseWorkloadLabel(''), { isl: null, osl: null });
    assert.deepStrictEqual(parseWorkloadLabel('chat'), { isl: null, osl: null });
}

// 3. A result becomes an entry with its measured points.
{
    const { entry } = curveToEntry(curve('a', 'published'), { instance: 'public' });
    assert.strictEqual(entry.id, 'rs-a');
    assert.strictEqual(entry.model_family, 'Llama 3.1 70B', 'known families group with the same model');
    assert.strictEqual(entry.hardware.accelerator_type, 'nvidia-h100-80gb');
    assert.strictEqual(entry.hardware.accelerator_count, 8);
    assert.strictEqual(entry.stack.engine, 'vllm');
    assert.strictEqual(entry.sweep_points.length, 4, 'the excluded point is gone');
    assert.strictEqual(entry.sweep_points[3].overloaded, true, 'the overloaded point is kept but flagged');
    const p2 = entry.sweep_points[1];
    assert.strictEqual(p2.total_estimated, true);
    assert.strictEqual(p2.tokens_per_sec, (2400 * (1024 + 512)) / 512, 'total from output and the workload shape');
    assert.strictEqual(p2.tokens_per_sec_per_chip, p2.tokens_per_sec / 8);
    assert.strictEqual(p2.ttft_p50, 180);
    assert.strictEqual(p2.ttft_p90, null, 'the Results Store keeps no P90');
    assert.strictEqual(p2.itl_p50, 22);
    assert.strictEqual(entry.results_store.overloadedCount, 1);
    assert.strictEqual(entry.results_store.excludedCount, 1);
    assert.strictEqual(entry.author.github_id, 'rajithal');
}

// 4. Measured totals are used as recorded, not estimated.
{
    const c = curve('m', 'published');
    c.points = c.points.map((p) => ({ ...p, total: p.output * 2 }));
    const { entry } = curveToEntry(c);
    assert.strictEqual(entry.sweep_points[0].total_estimated, false);
    assert.strictEqual(entry.sweep_points[0].tokens_per_sec, 800);
}

// 5. Results that can't be ranked are reported, not dropped silently.
{
    const noShape = curve('n', 'published');
    noShape.meta = { ...noShape.meta, workload: '' };
    assert.strictEqual(curveToEntry(noShape).reason, 'no-throughput');
    const empty = { ...curve('o', 'published'), points: [] };
    assert.strictEqual(curveToEntry(empty).reason, 'no-points');
}

// 6. Loading from storage: only rankable results, never a throw.
{
    const saved = JSON.stringify({
        public: { curves: [curve('a', 'published'), curve('b', 'draft'), { ...curve('n', 'published'), meta: { ...curve('n', 'published').meta, workload: '' } }] },
        internal: { curves: [curve('e', 'official')] },
    });
    const pub = loadPublishedResults({ instance: 'public', storage: memoryStorage(saved) });
    assert.deepStrictEqual(pub.entries.map((e) => e.id), ['rs-a']);
    assert.deepStrictEqual(pub.skipped.map((s) => s.reason), ['no-throughput']);
    const internal = loadPublishedResults({ instance: 'internal', storage: memoryStorage(saved) });
    assert.deepStrictEqual(internal.entries.map((e) => e.id), ['rs-e']);
    assert.deepStrictEqual(loadPublishedResults({ storage: memoryStorage('{not json') }), { entries: [], skipped: [] });
    assert.deepStrictEqual(loadPublishedResults({ storage: memoryStorage(null) }), { entries: [], skipped: [] });
}

// 7. End to end: the default SLO never ranks the overloaded peak.
{
    const { entry } = curveToEntry(curve('a', 'published'));
    const dataset = buildLeaderboardDataset({ seedRecipes: [], publishedResults: [entry] });
    const [usable] = evaluateDatasetAtSlo(dataset, { maxTtftSla: 2000, slaPercentile: 'p50' });
    assert.strictEqual(usable.operatingConcurrency, 32);
    assert.strictEqual(usable.missesSlo, false);
    const [peak] = evaluateDatasetAtSlo(dataset, {});
    assert.strictEqual(peak.operatingConcurrency, 32, 'even "Any" skips the overloaded point');
    const [p90] = evaluateDatasetAtSlo(dataset, { maxTtftSla: 2000, slaPercentile: 'p90' });
    assert.strictEqual(p90.sloReason, 'not-recorded');
}

// 8. Lineage travels with the entry, so the drawer can say who stands behind it.
{
    const requested = curve('r', 'official', { requestedBy: '@ana', markedBy: '@raj' });
    assert.deepStrictEqual(curveToEntry(requested, { instance: 'internal' }).entry.results_store.lineage, {
        approvedBy: '@raj',
        approvedAt: new Date(Date.UTC(2026, 9, 1)).toISOString(),
        askedBy: '@ana',
    });
    const direct = curve('d', 'official', { markedBy: '@raj' });
    assert.strictEqual(lineageOf(direct).askedBy, null, 'marked official directly: nobody else asked');
    const approved = curve('p', 'published', { attribution: '@contrib', reviewedBy: '@maint' });
    assert.deepStrictEqual(lineageOf(approved), { approvedBy: '@maint', approvedAt: new Date(Date.UTC(2026, 9, 1)).toISOString(), askedBy: '@contrib' });
    assert.strictEqual(lineageOf(curve('s', 'published', { reviewedBy: '@rajithal' })).askedBy, null, 'the owner approving is said once');
}

// 9. "See it on the Leaderboard" only for results that rank there.
{
    assert.deepStrictEqual(leaderboardLinkFor(curve('a', 'published')), { recipe: 'rs-a' });
    assert.deepStrictEqual(leaderboardLinkFor(curve('e', 'official'), 'internal'), { recipe: 'rs-e' });
    assert.strictEqual(leaderboardLinkFor(curve('e', 'official'), 'public'), null, 'an internal status never ranks on the public store');
    assert.strictEqual(leaderboardLinkFor(curve('b', 'in_review')), null);
    assert.strictEqual(leaderboardLinkFor({ ...curve('l', 'published'), visibility: 'link' }), null, 'link-only results are not listed');
    assert.strictEqual(leaderboardLinkFor({ ...curve('x', 'published'), meta: { ...curve('x', 'published').meta, workload: '' } }), null, 'nothing to rank by');
    assert.strictEqual(leaderboardLinkFor(null), null);
}

// 10. The header's count of what waits for an approver.
{
    const saved = JSON.stringify({ internal: { curves: [curve('q', 'in_review'), curve('w', 'in_review'), curve('o', 'official')] }, public: { curves: [] } });
    assert.strictEqual(countWaitingResults('internal', memoryStorage(saved)), 2);
    assert.strictEqual(countWaitingResults('public', memoryStorage(saved)), 0);
    assert.strictEqual(countWaitingResults('internal', memoryStorage('{oops')), 0);
}

console.log('leaderboardSources: all tests passed');
