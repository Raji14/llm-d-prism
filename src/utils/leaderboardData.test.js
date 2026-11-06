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

// Run: npx tsx src/utils/leaderboardData.test.js
import assert from 'node:assert';
import process from 'node:process';
import {
    SEED_LEADERBOARD_RECIPES,
    buildLeaderboardDataset,
    evaluateDatasetAtSlo,
    normalizeLeaderboardEntry,
    selectOperatingPoint,
    modelFamilyFor,
    pointCost,
} from './leaderboardData.js';
import { readSloParams, writeSloParams, DEFAULT_SLO, provenanceStatus, describeSlo, isDefaultSlo, formatQps } from './leaderboardFacets.js';
import { computeParity, formatRunDate } from './runParity.js';

console.log('Running leaderboardData unit tests...');

const pt = (concurrency, tps, ttft50, itl50, extra = {}) => ({
    concurrency,
    tokens_per_sec: tps,
    tokens_per_sec_per_chip: tps / 8,
    ttft_p50: ttft50,
    ttft_p90: null,
    ttft_p99: ttft50 * 2,
    itl_p50: itl50,
    itl_p90: null,
    itl_p99: itl50 * 2,
    measured: true,
    ...extra,
});

const sweep = [pt(1, 800, 120, 12), pt(8, 4000, 400, 18), pt(32, 9000, 1500, 30), pt(64, 9600, 4800, 45)];

// 1. No limit: the highest-throughput healthy point.
{
    const r = selectOperatingPoint(sweep, {});
    assert.strictEqual(r.point.concurrency, 64);
    assert.strictEqual(r.missesSlo, false);
}

// 2. Overloaded points are never picked, even as the raw peak.
{
    const withOverload = [...sweep.slice(0, 3), { ...sweep[3], overloaded: true }];
    const r = selectOperatingPoint(withOverload, {});
    assert.strictEqual(r.point.concurrency, 32, 'an overloaded peak must not rank');
}

// 3. A TTFT limit picks the highest-throughput point inside it.
{
    const r = selectOperatingPoint(sweep, { maxTtftSla: 2000, slaPercentile: 'p50' });
    assert.strictEqual(r.point.concurrency, 32);
    assert.strictEqual(r.missesSlo, false);
}

// 4. Nothing inside the limit: the closest point, flagged over-limit.
{
    const r = selectOperatingPoint(sweep, { maxTtftSla: 50, slaPercentile: 'p50' });
    assert.strictEqual(r.missesSlo, true);
    assert.strictEqual(r.reason, 'over-limit');
    assert.strictEqual(r.point.concurrency, 1, 'closest to the limit is the lightest load here');
}

// 5. A percentile the run never recorded can't be checked.
{
    const r = selectOperatingPoint(sweep, { maxTtftSla: 2000, slaPercentile: 'p90' });
    assert.strictEqual(r.missesSlo, true);
    assert.strictEqual(r.reason, 'not-recorded');
}

// 6. TTFT and TPOT limits apply together.
{
    const r = selectOperatingPoint(sweep, { maxTtftSla: 2000, maxTpotSla: 20, slaPercentile: 'p50' });
    assert.strictEqual(r.point.concurrency, 8);
}

// 7. evaluateDatasetAtSlo writes one point's numbers everywhere, concurrency included.
{
    const entry = normalizeLeaderboardEntry({
        id: 'm1',
        model_name: 'org/Some-Model',
        hardware: { accelerator_type: 'nvidia-h100-80gb', accelerator_count: 8 },
        sweep_points: sweep,
    });
    const [atSlo] = evaluateDatasetAtSlo([entry], { maxTtftSla: 500, slaPercentile: 'p50' });
    assert.strictEqual(atSlo.operatingConcurrency, 8);
    assert.strictEqual(atSlo.tokens_per_sec, 4000);
    assert.strictEqual(atSlo.tokens_per_sec_per_chip, 500);
    assert.strictEqual(atSlo.ttft_p50, 400);
    assert.strictEqual(atSlo.metrics.ttft_ms.p50, 400);
    assert.strictEqual(atSlo.metrics.ttft_ms.p90, null, 'a percentile the point lacks stays empty, never stale');
    assert.ok(atSlo.cost_per_1m > 0, 'each operating point is priced');

    const [missed] = evaluateDatasetAtSlo([entry], { maxTtftSla: 50, slaPercentile: 'p50' });
    assert.strictEqual(missed.missesSlo, true);
    assert.strictEqual(missed.operatingConcurrency, 1, 'a missed row shows the point it is closest at');
    assert.strictEqual(missed.tokens_per_sec, 800, 'and that point\u2019s own numbers');
}

// 8. A sample's illustrative curve never goes past the number it states.
{
    const dataset = buildLeaderboardDataset({ seedRecipes: SEED_LEADERBOARD_RECIPES });
    dataset.forEach((s) => {
        const peak = Math.max(...s.sweep_points.map((p) => p.tokens_per_sec || 0));
        assert.ok(peak <= s.tokens_per_sec + 0.5, `${s.id}: curve peak ${peak} exceeds stated ${s.tokens_per_sec}`);
        assert.ok(s.sweep_points.every((p) => p.illustrative), `${s.id}: sample points are marked illustrative`);
    });
    const [atPeak] = evaluateDatasetAtSlo(dataset.slice(0, 1), {});
    assert.strictEqual(atPeak.operatingConcurrency, dataset[0].workload.concurrency, 'no limit → the stated point');
}

// 9. A single measured run keeps its one point: no made-up curve.
{
    const single = normalizeLeaderboardEntry({
        id: 's1',
        model_name: 'org/Model',
        hardware: { accelerator_type: 'nvidia-l4', accelerator_count: 1 },
        tokens_per_sec: 500,
        ttft_p50: 90,
        workload: { concurrency: 4, input_tokens: 1000, output_tokens: 100 },
    });
    assert.strictEqual(single.sweep_points.length, 1);
    assert.strictEqual(single.sweep_points[0].measured, true);
}

// 10. Unknowns stay unknown: no default stack, TP, prefix caching or author.
{
    const e = normalizeLeaderboardEntry({ id: 'u1', model_name: 'Qwen/Qwen3-8B', tokens_per_sec: 100 });
    assert.strictEqual(e.stack.engine, null, 'a missing stack is not llm-d');
    assert.strictEqual(e.stack.tensor_parallel_size, null);
    assert.strictEqual(e.stack.prefix_caching, null);
    assert.strictEqual(e.author, null);
    assert.strictEqual(e.hardware.region, null);
    assert.strictEqual(e.workload.dataset_name, null);
    assert.strictEqual(e.model_family, 'Qwen3-8B', 'an 8B model that isn\u2019t Llama keeps its own name');
}

// 11. Known families still group; distills don't pass as R1 671B.
{
    assert.strictEqual(modelFamilyFor({}, 'meta-llama/Llama-3.1-70B-Instruct'), 'Llama 3.1 70B');
    assert.strictEqual(modelFamilyFor({}, 'deepseek-ai/DeepSeek-R1'), 'DeepSeek R1 671B');
    assert.strictEqual(modelFamilyFor({}, 'deepseek-ai/DeepSeek-R1-Distill-Llama-70B'), 'DeepSeek-R1-Distill-Llama-70B');
    assert.strictEqual(modelFamilyFor({}, 'mistralai/Mistral-7B-Instruct-v0.3'), 'Mistral-7B-Instruct-v0.3');
}

// 12. An accelerator without a list price stays unpriced.
{
    const c = pointCost({ hardware: { accelerator_type: 'other', accelerator_count: 8 } }, 5000, {});
    assert.strictEqual(c.costPer1MTokens, null);
    assert.strictEqual(c.unpriced, true);
}

// 13. SLO URL state: defaults stay out of the URL; Any is explicit.
{
    const p = new URLSearchParams('');
    assert.deepStrictEqual(readSloParams(p), { ttft: DEFAULT_SLO.ttft, tpot: null, percentile: 'p50' });
    assert.strictEqual(isDefaultSlo(readSloParams(p)), true);
    writeSloParams(p, { ttft: null, tpot: null, percentile: 'p50' });
    assert.strictEqual(p.get('ttft_sla'), 'any');
    assert.deepStrictEqual(readSloParams(p), { ttft: null, tpot: null, percentile: 'p50' });
    writeSloParams(p, { ttft: 2000, tpot: 50, percentile: 'p99' });
    assert.strictEqual(p.get('ttft_sla'), null);
    assert.strictEqual(p.get('tpot_sla'), '50');
    assert.strictEqual(p.get('sla_pct'), 'p99');
    assert.strictEqual(describeSlo({ ttft: 2000, tpot: 50, percentile: 'p99' }), 'TTFT P99 ≤ 2 s · TPOT P99 ≤ 50 ms');
    assert.strictEqual(readSloParams(new URLSearchParams('ttft_sla=abc')).ttft, DEFAULT_SLO.ttft, 'junk falls back to the default');
}

// 14. A sample never reads as verified.
{
    const [sample] = buildLeaderboardDataset({ seedRecipes: SEED_LEADERBOARD_RECIPES.slice(0, 1) });
    assert.strictEqual(provenanceStatus(sample), 'sample');
}

// 15. Parity compares the workload, not each run's operating concurrency.
{
    const [a, b] = buildLeaderboardDataset({ seedRecipes: SEED_LEADERBOARD_RECIPES.slice(0, 2) });
    const [ea, eb] = evaluateDatasetAtSlo([a, b], { maxTtftSla: 40, slaPercentile: 'p50' });
    assert.notStrictEqual(ea.operatingConcurrency, eb.operatingConcurrency);
    assert.strictEqual(computeParity([ea, eb]).likeForLike, true);
}

// 16. Request rates read like the other columns, not like a float dump.
{
    assert.strictEqual(formatQps(0.3655179367259668), '0.366');
    assert.strictEqual(formatQps(0.05524116453102534), '0.0552');
    assert.strictEqual(formatQps(13.46), '13.5');
    assert.strictEqual(formatQps(2.5), '2.5');
    assert.strictEqual(formatQps(1234.6), '1,235');
    assert.strictEqual(formatQps(null), null);
    assert.strictEqual(formatQps(Number.NaN), null);
}

// 17. A bare run date is the same day everywhere; an approval is the viewer's
// day (late evening in California is already tomorrow in UTC).
{
    const tz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    assert.strictEqual(formatRunDate('2026-08-18'), 'Aug 18, 2026');
    assert.strictEqual(formatRunDate('2026-11-06T06:40:00.000Z'), 'Nov 5, 2026');
    assert.strictEqual(formatRunDate('not a date'), null);
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
}

console.log('leaderboardData: all tests passed');
