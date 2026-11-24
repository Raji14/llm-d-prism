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

import type { ResultMetric, StoredResult } from './schema.ts';

export interface VariableDiff {
    key: string;
    baseline: string | number | boolean | undefined;
    candidate: string | number | boolean | undefined;
}

export interface MetricDelta {
    name: string;
    label: string;
    unit: string;
    direction: 'higher_is_better' | 'lower_is_better';
    baselineValue: number;
    candidateValue: number;
    delta: number;
    deltaPct: number;
    verdict: 'better' | 'worse' | 'neutral';
    primary: boolean;
    at?: string;
}

export interface RankedBaseline {
    result: StoredResult;
    score: number;
    matchedOn: string[];
    diffVariables: VariableDiff[];
    summary: string;
}

const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

/** Diffs experimental variables between a baseline result and a candidate result. */
export function diffVariables(baseline: StoredResult, candidate: StoredResult): VariableDiff[] {
    const bVars = baseline.variables || {};
    const cVars = candidate.variables || {};
    const keys = new Set([...Object.keys(bVars), ...Object.keys(cVars)]);
    const diffs: VariableDiff[] = [];
    for (const key of keys) {
        if (norm(bVars[key]) !== norm(cVars[key])) {
            diffs.push({ key, baseline: bVars[key], candidate: cVars[key] });
        }
    }
    return diffs;
}

/** Computes signed metric deltas and better/worse verdicts between baseline and candidate. */
export function computeMetricDeltas(baseline: StoredResult, candidate: StoredResult): MetricDelta[] {
    const byName = new Map<string, ResultMetric>();
    for (const m of baseline.metrics || []) {
        byName.set(m.name, m);
    }
    const deltas: MetricDelta[] = [];
    for (const c of candidate.metrics || []) {
        const b = byName.get(c.name);
        if (!b || b.value === 0) continue;
        const delta = c.value - b.value;
        const deltaPct = (delta / Math.abs(b.value)) * 100;
        let verdict: 'better' | 'worse' | 'neutral' = 'neutral';
        if (Math.abs(deltaPct) >= 1) {
            const improved = c.direction === 'lower_is_better' ? delta < 0 : delta > 0;
            verdict = improved ? 'better' : 'worse';
        }
        deltas.push({
            name: c.name,
            label: c.label || c.name,
            unit: c.unit,
            direction: c.direction,
            baselineValue: b.value,
            candidateValue: c.value,
            delta,
            deltaPct,
            verdict,
            primary: Boolean(c.primary || b.primary),
            at: c.at || b.at,
        });
    }
    return deltas.sort((a, b) => Number(b.primary) - Number(a.primary));
}

/**
 * Ranks candidate baselines for a given result so "today's after becomes tomorrow's before".
 * Prefers published results in the same domain/experiment group/model/workload/fleet scale
 * with minimal variable differences (ideally 1 changed variable = clean A/B test).
 */
export function rankBaselines(candidate: StoredResult, pool: StoredResult[], limit = 8): RankedBaseline[] {
    const scored: RankedBaseline[] = [];

    for (const item of pool) {
        if (item.id === candidate.id) continue;
        if (item.status === 'retracted' || item.status === 'declined') continue;

        let score = 0;
        const matchedOn: string[] = [];

        // Explicit baseline pointer wins immediately.
        if (candidate.lineage?.baselineId && candidate.lineage.baselineId === item.id) {
            score += 200;
            matchedOn.push('linked baseline');
        }

        if (item.status === 'published') {
            score += 30;
            matchedOn.push('published');
        }

        if (item.domain === candidate.domain) {
            score += 40;
            matchedOn.push(item.domain);
        }

        if (candidate.lineage?.experimentGroup && item.lineage?.experimentGroup && norm(item.lineage.experimentGroup) === norm(candidate.lineage.experimentGroup)) {
            score += 50;
            matchedOn.push(`experiment: ${item.lineage.experimentGroup}`);
        }

        if (candidate.model && item.model && norm(item.model) === norm(candidate.model)) {
            score += 25;
            matchedOn.push('model');
        }

        if (candidate.workload && item.workload && norm(item.workload) === norm(candidate.workload)) {
            score += 20;
            matchedOn.push('workload');
        }

        if (candidate.hardware && item.hardware && norm(item.hardware) === norm(candidate.hardware)) {
            score += 15;
            matchedOn.push('hardware');
        }

        if (candidate.fleet?.nodes && item.fleet?.nodes) {
            if (candidate.fleet.nodes === item.fleet.nodes) {
                score += 20;
                matchedOn.push(`${item.fleet.nodes}-node fleet`);
            } else {
                const ratio = Math.min(candidate.fleet.nodes, item.fleet.nodes) / Math.max(candidate.fleet.nodes, item.fleet.nodes);
                if (ratio >= 0.5) score += 8;
            }
        }

        const diffs = diffVariables(item, candidate);
        const sharedVarKeys = Object.keys(candidate.variables || {}).filter(
            (k) => k in (item.variables || {}) && norm(item.variables[k]) === norm(candidate.variables[k])
        );
        score += Math.min(sharedVarKeys.length * 6, 24);

        // Clean A/B bonus: exactly 1 variable differs.
        if (diffs.length === 1 && sharedVarKeys.length > 0) {
            score += 18;
        }

        // Metric overlap ensures we can compute meaningful before/after deltas.
        const deltas = computeMetricDeltas(item, candidate);
        if (deltas.length > 0) {
            score += 15;
        }

        // Mild recency tie-breaker.
        const ts = Date.parse(item.publishedAt || item.updatedAt || item.createdAt || '') || 0;
        score += Math.min(ts / 1e14, 2);

        if (score <= 0) continue;

        const summary =
            diffs.length === 0
                ? 'Identical variables (repeat / regression check)'
                : diffs.length === 1
                  ? `Testing ${diffs[0].key}: ${diffs[0].baseline ?? 'none'} → ${diffs[0].candidate ?? 'none'}`
                  : `${diffs.length} variables differ (${diffs.slice(0, 3).map((d) => d.key).join(', ')})`;

        scored.push({
            result: item,
            score,
            matchedOn,
            diffVariables: diffs,
            summary,
        });
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
