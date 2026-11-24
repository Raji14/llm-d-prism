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

// Run: npx tsx src/components/Leaderboard/feedbackDetails.test.js
import assert from 'node:assert';
import { challengeIssueFields, challengeMarkdown, runDetailLines } from './feedbackDetails.js';
import { curveToEntry } from '../../utils/leaderboardSources.js';
import { buildLeaderboardDataset, evaluateDatasetAtSlo } from '../../utils/leaderboardData.js';

console.log('Running feedbackDetails unit tests...');

// A Published result whose throughput is estimated, as the Results Store saves it.
const point = (key, conc, output, ttftP50) => ({
    key, conc, output, total: null, ttft: ttftP50, ttftMean: ttftP50, ttftP50, ttftP99: ttftP50 * 2,
    tpot: 20, tpotMean: 20, tpotP50: 20, tpotP99: 40, included: true, runId: 'run-1', ts: Date.UTC(2025, 8, 23),
});
const curve = {
    id: 'qa-curve-1',
    name: 'QA llm-d prefix routing',
    version: 2,
    status: 'published',
    visibility: 'public',
    attribution: '@contrib',
    reviewedBy: '@maint',
    markedAt: Date.UTC(2026, 10, 21),
    meta: { model: 'Llama-3.1-70B-Instruct', modelFull: 'meta-llama/Llama-3.1-70B-Instruct', accelerator: 'H100 ×8', workload: '1024/512', engine: 'llm-d', setup: 'QA llm-d prefix routing', harness: 'inference-perf' },
    points: [point('a', 8, 2000, 300), point('b', 64, 3300, 900)],
};
const { entry } = curveToEntry(curve);
const [run] = evaluateDatasetAtSlo(buildLeaderboardDataset({ seedRecipes: [], publishedResults: [entry] }), { maxTtftSla: 1000, slaPercentile: 'p50' });
const slo = { ttft: 1000, tpot: null, percentile: 'p50' };
const url = 'http://localhost:5173/?view=model-leaderboard&recipe=rs-qa-curve-1&ttft_sla=1000&pricing=cud_3yr';

// 1. The claim carries the number in context.
{
    const lines = runDetailLines(run, { slo, pricingLabel: '3-year CUD prices', url });
    const text = lines.join('\n');
    assert.match(text, /Ranked at: TTFT P50 ≤ 1 s → 64 concurrent requests/);
    assert.match(text, /Throughput: ≈[\d,]+ tok\/s per chip \(≈[\d,]+ total\), estimated/, 'the ≈ estimate flag survives');
    assert.match(text, /TTFT P50: 900\.0 ms · TPOT P50: 20\.0 ms/);
    assert.match(text, /Cost: \$\d+\.\d{3} per 1M tokens \(3-year CUD prices\)/);
    assert.match(text, /Status: Published · approved by @maint on Nov \d+, 2026 · submitted by @contrib/);
    assert.match(text, /Run date: Sep 2\d, 2025/);
    assert.match(text, /Results Store result: qa-curve-1 \(version 2\)/);
    assert.ok(lines.includes(`Leaderboard view: ${url}`), 'a link back to exactly what was shown');
}

// 2. The issue form fields: claim, environment and the reporter's notes.
{
    const fields = challengeIssueFields(run, { slo, pricingLabel: 'List prices', url, notes: 'Could not reproduce' });
    assert.strictEqual(fields.template, 'leaderboard_challenge.yml');
    assert.strictEqual(fields.title, '[Leaderboard Challenge]: QA llm-d prefix routing');
    assert.strictEqual(fields.recipe, 'rs-qa-curve-1 (QA llm-d prefix routing)');
    assert.strictEqual(fields.discrepancy, 'Could not reproduce');
    assert.match(fields.environment, /Harness: inference-perf/);
    assert.match(fields.environment, /Your environment and logs:/);
    assert.match(fields.claim, /\(List prices\)/);
}

// 3. A run that misses the limit says so instead of claiming a rank.
{
    const [missed] = evaluateDatasetAtSlo(buildLeaderboardDataset({ seedRecipes: [], publishedResults: [entry] }), { maxTtftSla: 100, slaPercentile: 'p50' });
    assert.match(runDetailLines(missed, { slo: { ttft: 100, percentile: 'p50' } }).join('\n'), /misses TTFT P50 ≤ 100 ms at every measured load/);
    const [p90] = evaluateDatasetAtSlo(buildLeaderboardDataset({ seedRecipes: [], publishedResults: [entry] }), { maxTtftSla: 1000, slaPercentile: 'p90' });
    assert.match(runDetailLines(p90, { slo: { ttft: 1000, percentile: 'p90' } }).join('\n'), /no P90 latency recorded/);
}

// 4. The Markdown copy has the same details and the notes.
{
    const md = challengeMarkdown(run, { slo, pricingLabel: 'List prices', url, notes: 'TTFT looks too low' });
    assert.match(md, /^## \[Leaderboard Challenge\]: QA llm-d prefix routing/);
    assert.match(md, /- Ranked at: TTFT P50 ≤ 1 s/);
    assert.match(md, /TTFT looks too low$/);
    assert.deepStrictEqual(runDetailLines(null), []);
}

console.log('feedbackDetails: all tests passed');
