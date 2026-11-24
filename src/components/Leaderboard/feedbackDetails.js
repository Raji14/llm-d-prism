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

// What a challenge carries about the run it questions: the number in its
// context (the latency limit it was ranked at, its operating point, latency,
// cost and the prices behind it, whether the throughput is an estimate), who
// stands behind it, and a link back. A maintainer can find and judge the
// number from this alone. Pure functions, so they're unit-tested.

import {
    DEFAULT_SLO,
    describeSlo,
    engineLabel,
    formatHardwareShort,
    formatLatencyMs,
    latencyFor,
    provenanceStatus,
    workloadFor,
} from '../../utils/leaderboardFacets.js';
import { formatRunDate } from '../../utils/runParity.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v) => Math.round(v).toLocaleString('en-US');

const STATUS_LABELS = {
    sample: 'Illustrative sample (not a measured run)',
    official: 'Official',
    published: 'Published',
    well_lit_path: 'Well-lit path reference',
};

/** One line per fact about the run, as the Leaderboard showed it. */
export function runDetailLines(recipe, { slo = DEFAULT_SLO, pricingLabel = null, url = null } = {}) {
    if (!recipe) return [];
    const pct = slo?.percentile || DEFAULT_SLO.percentile;
    const pctLabel = String(pct).toUpperCase();
    const wl = workloadFor(recipe.workload_class);
    const isl = recipe.workload?.input_tokens;
    const osl = recipe.workload?.output_tokens;
    const stack = [
        engineLabel(recipe.stack?.engine),
        recipe.stack?.engine_version && recipe.stack.engine_version !== 'latest' ? recipe.stack.engine_version : null,
    ].filter(Boolean).join(' ');
    const stackExtras = [
        recipe.stack?.tensor_parallel_size ? `TP${recipe.stack.tensor_parallel_size}` : null,
        recipe.stack?.quantization ? String(recipe.stack.quantization).toUpperCase() : null,
    ].filter(Boolean);

    const status = provenanceStatus(recipe);
    const lineage = recipe.results_store?.lineage;
    const statusParts = [STATUS_LABELS[status] || status];
    if (lineage?.approvedBy) {
        const when = formatRunDate(lineage.approvedAt);
        statusParts.push(`${status === 'official' ? 'marked official by' : 'approved by'} ${lineage.approvedBy}${when ? ` on ${when}` : ''}`);
    }
    if (lineage?.askedBy) statusParts.push(`${status === 'official' ? 'requested by' : 'submitted by'} ${lineage.askedBy}`);

    const estimated = Boolean(recipe.operatingPoint?.total_estimated);
    const approx = estimated ? '≈' : '';
    const perChip = recipe.tokens_per_sec_per_chip;
    const total = recipe.tokens_per_sec;
    const ttft = latencyFor(recipe, 'ttft', pct);
    const tpot = latencyFor(recipe, 'itl', pct);
    const cost = recipe.cost_analysis?.cost_per_1m_output_tokens_usd ?? recipe.cost_per_1m;
    const runDate = formatRunDate(recipe.created_at);

    const operating = recipe.operatingConcurrency != null ? `${recipe.operatingConcurrency} concurrent requests` : 'its peak';
    let rankedAt = `Ranked at: ${describeSlo(slo)} → ${operating}`;
    if (recipe.missesSlo) {
        rankedAt = recipe.sloReason === 'not-recorded'
            ? `Ranked at: can't be checked against ${describeSlo(slo)} (no ${pctLabel} latency recorded)`
            : `Ranked at: misses ${describeSlo(slo)} at every measured load; closest point ${operating}`;
    }

    return [
        `Result: ${recipe.recipe_name || 'Unnamed setup'} (id ${recipe.id})`,
        `Model: ${recipe.model_family || recipe.model_name || 'Not recorded'}${recipe.model_name && recipe.model_name !== recipe.model_family ? ` (${recipe.model_name})` : ''}`,
        `Workload: ${wl ? wl.label : recipe.workload_class || 'Not recorded'}${isNum(isl) && isNum(osl) ? ` · ${isl} in / ${osl} out tokens` : ''}`,
        `Hardware: ${formatHardwareShort(recipe)} · Stack: ${[stack, ...stackExtras].join(' · ')}`,
        `Status: ${statusParts.join(' · ')}`,
        runDate ? `Run date: ${runDate}` : null,
        rankedAt,
        isNum(perChip)
            ? `Throughput: ${approx}${int(perChip)} tok/s per chip${isNum(total) ? ` (${approx}${int(total)} total)` : ''}${estimated ? ', estimated from the output rate and the prompt and output lengths' : ''}`
            : 'Throughput: not recorded',
        `TTFT ${pctLabel}: ${ttft != null ? formatLatencyMs(ttft) : 'not recorded'} · TPOT ${pctLabel}: ${tpot != null ? formatLatencyMs(tpot) : 'not recorded'}`,
        isNum(cost) && cost > 0
            ? `Cost: $${cost.toFixed(3)} per 1M tokens${pricingLabel ? ` (${pricingLabel})` : ''}`
            : 'Cost: no list price for this accelerator',
        recipe.results_store?.curveId ? `Results Store result: ${recipe.results_store.curveId} (version ${recipe.results_store.version || 1})` : null,
        url ? `Leaderboard view: ${url}` : null,
    ].filter(Boolean);
}

/** What the run recorded about its environment, for the challenge's environment field. */
export function runEnvironmentLines(recipe) {
    if (!recipe) return [];
    const image = recipe.container_image || recipe.stack?.container_image;
    const harness = recipe.fairness_audit?.harness;
    return [
        'Recorded with the run:',
        `- Container image: ${image || 'not reported'}`,
        `- Commit: ${recipe.git_commit_sha || 'not reported'}`,
        `- Harness: ${harness || 'not reported'}`,
        '',
        'Your environment and logs:',
    ];
}

/** The fields of the leaderboard_challenge.yml issue form. */
export function challengeIssueFields(recipe, { slo, pricingLabel, url, notes = '' } = {}) {
    return {
        template: 'leaderboard_challenge.yml',
        title: `[Leaderboard Challenge]: ${recipe?.recipe_name || recipe?.id || 'Run discrepancy'}`,
        recipe: recipe ? `${recipe.id} (${recipe.recipe_name || 'Unnamed setup'})` : '',
        claim: runDetailLines(recipe, { slo, pricingLabel, url }).join('\n'),
        discrepancy: notes,
        environment: runEnvironmentLines(recipe).join('\n'),
    };
}

/** The same challenge as Markdown, for copying. */
export function challengeMarkdown(recipe, { slo, pricingLabel, url, notes = '' } = {}) {
    const fields = challengeIssueFields(recipe, { slo, pricingLabel, url, notes });
    return [
        `## ${fields.title}`,
        '',
        ...runDetailLines(recipe, { slo, pricingLabel, url }).map((line) => `- ${line}`),
        '',
        '### What looks wrong or failed to reproduce?',
        notes || '_No details yet._',
    ].join('\n');
}
