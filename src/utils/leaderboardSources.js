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

// Where the Leaderboard's real entries come from: results people published
// in the Results Store. The Results Store is the review step the methodology
// promises ("checked, then peer-reviewed before they rank"), so the
// Leaderboard ranks only what made it through: Official results on the
// internal instance, Published (publicly listed) results on the public store.
//
// Each result keeps the measured points it was published with. Points a
// curator excluded never appear; points the Results Store's checks flag as
// overloaded are kept for the record but never ranked.
//
// Until results are stored on the server, they live in this browser
// (localStorage), exactly as the Results Store saves them.

import { accelTypeOf, chipsOf, latencyValue, loadOrder, overloadedKeys } from '../components/ResultsStore/catalog.js';
import { normalizeAcceleratorId } from './pricingEngine.js';
import { classifyWorkload, engineKey } from './leaderboardFacets.js';
import { modelFamilyFor } from './leaderboardData.js';

export const RESULTS_WORKSPACE_KEY = 'prism_results_workspace_v1';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const positive = (v) => (isNum(v) && v > 0 ? v : null);

/** True when a Results Store result should rank on this instance. */
export function isRankableCurve(curve, instance = 'public') {
    if (!curve || curve.supersededBy || curve.status === 'superseded') return false;
    if (instance === 'internal') return curve.status === 'official';
    return curve.status === 'published' && curve.visibility === 'public';
}

/** "1024/512" → { isl: 1024, osl: 512 }; anything else → nulls. */
export function parseWorkloadLabel(label) {
    const m = String(label || '').match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    return m ? { isl: Number(m[1]), osl: Number(m[2]) } : { isl: null, osl: null };
}

const handleOf = (value) => {
    if (!value) return null;
    const s = typeof value === 'string' ? value : value.username || value.login || '';
    return String(s).replace(/^@/, '').trim() || null;
};

// TPOT where the harness recorded it, else inter-token latency, at one statistic.
const decodeLatency = (p, stat) => {
    const tpot = latencyValue(p, 'tpot', stat);
    return isNum(tpot) ? tpot : latencyValue(p, 'itl', stat);
};

/**
 * One measured point in Leaderboard terms. The Leaderboard ranks by total
 * (input + output) tokens per second per chip, as the methodology says. When a
 * run recorded only its output rate, total is worked out from the result's
 * prompt and output lengths (total = output × (ISL + OSL) / OSL) and flagged
 * `total_estimated`, so the drawer can say so.
 */
function toSweepPoint(p, { chips, isl, osl, overloaded }) {
    const output = positive(p.output);
    const measuredTotal = positive(p.total);
    const estimatedTotal = measuredTotal == null && output != null && isl > 0 && osl > 0 ? (output * (isl + osl)) / osl : null;
    const total = measuredTotal ?? estimatedTotal;
    return {
        concurrency: positive(p.conc),
        qps: positive(p.rate),
        measured: true,
        illustrative: false,
        overloaded: overloaded.has(p.key),
        total_estimated: measuredTotal == null && estimatedTotal != null,
        tokens_per_sec: total,
        tokens_per_sec_per_chip: total != null ? total / chips : null,
        output_tokens_per_sec: output,
        ttft_mean: latencyValue(p, 'ttft', 'mean'),
        ttft_p50: latencyValue(p, 'ttft', 'p50'),
        ttft_p90: null,
        ttft_p99: latencyValue(p, 'ttft', 'p99'),
        itl_mean: decodeLatency(p, 'mean'),
        itl_p50: decodeLatency(p, 'p50'),
        itl_p90: null,
        itl_p99: decodeLatency(p, 'p99'),
        err_pct: isNum(p.errPct) ? p.errPct : null,
        run_id: p.runId || null,
    };
}

/**
 * A Results Store result as a raw Leaderboard entry, or `{ entry: null,
 * reason }` when it can't be ranked ('no-points': nothing measured is left
 * in it; 'no-throughput': no point has a total throughput to rank by).
 */
export function curveToEntry(curve, { instance = 'public' } = {}) {
    const meta = curve?.meta || {};
    const included = (curve?.points || []).filter((p) => p && p.included !== false && positive(p.output) != null);
    if (!included.length) return { entry: null, reason: 'no-points' };

    const chips = chipsOf(meta);
    const { isl, osl } = parseWorkloadLabel(meta.workload);
    const overloaded = overloadedKeys(included);
    const sweep = loadOrder(included).points.map((p) => toSweepPoint(p, { chips, isl, osl, overloaded }));
    if (!sweep.some((pt) => !pt.overloaded && positive(pt.tokens_per_sec_per_chip) != null)) {
        return { entry: null, reason: 'no-throughput' };
    }

    const accelLabel = meta.accelerator ? accelTypeOf(meta.accelerator) : null;
    const author = handleOf(curve.attribution) || handleOf(curve.markedBy) || handleOf(curve.owner);
    const publishedAt = curve.markedAt || curve.updatedAt || curve.createdAt;
    const modelName = meta.modelFull || meta.model || 'Model not recorded';
    const harness = meta.harness && meta.harness !== 'Not recorded' ? meta.harness : null;

    return {
        reason: null,
        entry: {
            id: `rs-${curve.id}`,
            source: 'results-store',
            recipe_name: meta.setup || curve.name || 'Unnamed setup',
            model_name: modelName,
            model_family: modelFamilyFor({}, meta.model || modelName),
            author: author ? { username: author, github_id: author, display_name: author } : null,
            hardware_summary: accelLabel ? `${chips}× ${accelLabel}` : 'Hardware not recorded',
            hardware: {
                accelerator_type: accelLabel ? normalizeAcceleratorId(accelLabel) : 'other',
                accelerator_count: chips,
                accelerator_label: accelLabel,
            },
            stack: { engine: engineKey(meta.engine) },
            workload: {
                input_tokens: isl,
                output_tokens: osl,
                concurrency: null,
                dataset_name: null,
                workload_class: classifyWorkload({ input_tokens: isl, output_tokens: osl }),
            },
            fairness_audit: harness ? { harness } : null,
            sweep_points: sweep,
            created_at: isNum(publishedAt) ? new Date(publishedAt).toISOString() : null,
            verification_status: curve.status,
            results_store: {
                curveId: curve.id,
                name: curve.name || null,
                version: curve.version || 1,
                status: curve.status,
                instance,
                category: meta.category || null,
                source: meta.source || null,
                notes: meta.notes || null,
                pointCount: included.length,
                excludedCount: (curve.points || []).length - included.length,
                overloadedCount: overloaded.size,
                totalEstimated: sweep.some((pt) => pt.total_estimated),
            },
        },
    };
}

/**
 * Reads the results that rank on this instance from the Results Store's saved
 * workspace. Never throws: unreadable storage means no published results.
 * Returns the entries plus the results that couldn't be ranked, and why, so
 * the page can say so instead of dropping them silently.
 */
export function loadPublishedResults({ instance = 'public', storage } = {}) {
    let saved;
    try {
        const store = storage ?? globalThis.localStorage;
        saved = JSON.parse(store?.getItem(RESULTS_WORKSPACE_KEY) || '{}');
    } catch {
        return { entries: [], skipped: [] };
    }
    const curves = Array.isArray(saved?.[instance]?.curves) ? saved[instance].curves : [];
    const entries = [];
    const skipped = [];
    curves
        .filter((c) => isRankableCurve(c, instance))
        .forEach((curve) => {
            const { entry, reason } = curveToEntry(curve, { instance });
            if (entry) entries.push(entry);
            else skipped.push({ id: curve.id, name: curve.name || 'Untitled result', reason });
        });
    return { entries, skipped };
}
