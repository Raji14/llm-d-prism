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

import { engineLabel, workloadFor, HARDWARE_OPTIONS } from './leaderboardFacets.js';

export const STALE_AFTER_DAYS = 180;

const LEGACY_ENGINE_PREFIXES = ['v0.2.', 'v0.3.', 'v0.4.0', 'v0.5.'];

/**
 * Formats an ISO timestamp as a human-readable date ("Aug 18, 2026"),
 * or returns null when missing/invalid.
 */
export function formatRunDate(isoString) {
    if (!isoString) return null;
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    });
}

/**
 * Returns true if a run is older than STALE_AFTER_DAYS or uses an archived engine release.
 */
export function isStaleRun(run, nowMs = Date.now()) {
    if (!run) return false;
    if (run.created_at) {
        const ts = new Date(run.created_at).getTime();
        if (!Number.isNaN(ts)) {
            const ageDays = (nowMs - ts) / (1000 * 60 * 60 * 24);
            if (ageDays > STALE_AFTER_DAYS) return true;
        }
    }
    const ver = String(run.stack?.engine_version || '').toLowerCase();
    if (ver && LEGACY_ENGINE_PREFIXES.some((p) => ver.startsWith(p))) {
        return true;
    }
    return false;
}

const hardwareShortLabel = (accId) => {
    const found = HARDWARE_OPTIONS.find((h) => h.value === accId);
    return found ? found.short : accId || 'Accelerator';
};

/**
 * Workload & harness fields that must match for two runs to be considered
 * a like-for-like ("apples-to-apples") comparison.
 */
export const WORKLOAD_PARITY_FIELDS = [
    {
        key: 'model',
        label: 'Model',
        extract: (r) => r?.model_name || r?.model_family || 'Not reported',
    },
    {
        key: 'dataset',
        label: 'Dataset',
        extract: (r) => r?.workload?.dataset_name || 'Not reported',
    },
    {
        key: 'isl_osl',
        label: 'Prompt / output length',
        extract: (r) => {
            const isl = r?.workload?.input_tokens;
            const osl = r?.workload?.output_tokens;
            if (isl == null && osl == null) return 'Not reported';
            return `${isl ?? '—'} in / ${osl ?? '—'} out tok`;
        },
    },
    {
        key: 'concurrency',
        label: 'Concurrency',
        extract: (r) => (r?.workload?.concurrency != null ? `Concurrency ${r.workload.concurrency}` : 'Not reported'),
    },
    {
        key: 'harness',
        label: 'Benchmark harness',
        extract: (r) => {
            const fa = r?.fairness_audit;
            if (!fa) return 'Not reported';
            const harness = fa.harness || 'inference-perf';
            const temp = fa.temp != null ? `temp ${fa.temp}` : null;
            const warmup = fa.warmup_runs != null ? `warmup ${fa.warmup_runs}` : null;
            return [harness, temp, warmup].filter(Boolean).join(' · ');
        },
    },
];

/**
 * Evaluates whether a set of runs share the exact same model, dataset,
 * prompt/output length, concurrency, and benchmark harness.
 */
export function computeParity(runs = []) {
    const valid = (runs || []).filter(Boolean);
    if (valid.length < 2) {
        return { likeForLike: true, mismatches: [], matched: [] };
    }

    const mismatches = [];
    const matched = [];

    WORKLOAD_PARITY_FIELDS.forEach((field) => {
        const values = valid.map((r) => ({
            runId: r.id,
            recipeName: r.recipe_name,
            value: String(field.extract(r) ?? 'Not reported'),
        }));
        const distinct = new Set(values.map((v) => v.value.toLowerCase()));
        if (distinct.size > 1) {
            mismatches.push({
                key: field.key,
                label: field.label,
                values,
            });
        } else {
            matched.push({
                key: field.key,
                label: field.label,
                value: values[0].value,
            });
        }
    });

    return {
        likeForLike: mismatches.length === 0,
        mismatches,
        matched,
    };
}

/**
 * Serving stack and hardware fields compared symmetrically between two runs.
 */
export const CONFIG_DIFF_FIELDS = [
    {
        key: 'hardware',
        label: 'Hardware topology',
        extract: (r) => {
            const count = r?.hardware?.accelerator_count || 1;
            const short = hardwareShortLabel(r?.hardware?.accelerator_type);
            const vm = r?.hardware?.machine_type ? ` (${r.hardware.machine_type})` : '';
            return `${count}× ${short}${vm}`;
        },
    },
    {
        key: 'engine',
        label: 'Serving stack',
        extract: (r) => {
            const eng = engineLabel(r?.stack?.engine);
            const ver = r?.stack?.engine_version && r.stack.engine_version !== 'latest' ? ` ${r.stack.engine_version}` : '';
            return `${eng}${ver}`;
        },
    },
    {
        key: 'parallelism',
        label: 'Parallelism & replicas',
        extract: (r) => {
            const tp = r?.stack?.tensor_parallel_size || 1;
            const pp = r?.stack?.pipeline_parallel_size || 1;
            const ep = r?.stack?.expert_parallel_size || 1;
            const rep = r?.stack?.replicas || 1;
            const parts = [`TP${tp}`];
            if (pp > 1) parts.push(`PP${pp}`);
            if (ep > 1) parts.push(`EP${ep}`);
            if (rep > 1) parts.push(`${rep} replicas`);
            return parts.join(' · ');
        },
    },
    {
        key: 'quantization',
        label: 'Weights & KV precision',
        extract: (r) => {
            const w = (r?.stack?.quantization || 'fp16').toUpperCase();
            const kv = (r?.stack?.kv_cache_dtype || 'auto').toUpperCase();
            return `${w} weights · ${kv} KV`;
        },
    },
    {
        key: 'prefix_caching',
        label: 'Prefix caching & routing',
        extract: (r) => {
            if (!r?.stack?.prefix_caching) return 'Disabled';
            const routing = r?.stack?.routing;
            return routing ? `Enabled (${routing})` : 'Enabled';
        },
    },
    {
        key: 'speculative_decoding',
        label: 'Speculative decoding',
        extract: (r) => {
            const spec = r?.stack?.speculative_decoding;
            if (!spec?.enabled) return 'Disabled';
            const draft = spec.draft_model ? spec.draft_model.split('/').pop() : 'draft model';
            const k = spec.num_speculative_tokens || 3;
            return `Enabled (${draft}, k=${k})`;
        },
    },
    {
        key: 'pd_disaggregation',
        label: 'Prefill / decode topology',
        extract: (r) => (r?.stack?.pd_disaggregation ? 'Disaggregated P/D' : 'Colocated'),
    },
    {
        key: 'container_image',
        label: 'Container image',
        extract: (r) => r?.container_image || 'Not reported',
    },
];

/**
 * Symmetric configuration diff between baseline and challenger.
 * Reports every differing stack/hardware field regardless of direction.
 */
export function diffConfigs(baseline, challenger) {
    if (!baseline || !challenger) {
        return { diffs: [], same: [] };
    }

    const diffs = [];
    const same = [];

    CONFIG_DIFF_FIELDS.forEach((field) => {
        const baselineValue = String(field.extract(baseline) ?? 'Not reported');
        const challengerValue = String(field.extract(challenger) ?? 'Not reported');
        if (baselineValue.toLowerCase() !== challengerValue.toLowerCase()) {
            diffs.push({
                key: field.key,
                label: field.label,
                baselineValue,
                challengerValue,
            });
        } else {
            same.push({
                key: field.key,
                label: field.label,
                value: baselineValue,
            });
        }
    });

    return { diffs, same };
}

/**
 * True only when the workload parity check passes AND there is a single
 * isolated configuration change between baseline and challenger.
 */
export function isIsolatedChange(parity, configDiff) {
    return Boolean(parity?.likeForLike && configDiff?.diffs?.length === 1);
}

/**
 * Picks the default (model, workload) scope with the richest cross-stack
 * comparison so the leaderboard opens on an honest, apples-to-apples view.
 */
export function pickDefaultScope(dataset = [], hints = {}) {
    const valid = (dataset || []).filter(Boolean);
    if (valid.length === 0) {
        return { model: 'all', workload: 'all' };
    }

    const candidates = valid.filter((r) => {
        if (hints.workload && hints.workload !== 'all' && r.workload_class !== hints.workload) return false;
        if (hints.hardware && hints.hardware !== 'all' && r.hardware?.accelerator_type !== hints.hardware) return false;
        if (hints.engine && hints.engine !== 'all' && r.stack?.engine !== hints.engine) return false;
        return Boolean(r.model_family && r.workload_class);
    });

    const pool = candidates.length > 0 ? candidates : valid;
    const groups = new Map();

    pool.forEach((r) => {
        const model = r.model_family || 'General LLM';
        const workload = r.workload_class || 'chat';
        const key = `${model}|||${workload}`;
        if (!groups.has(key)) {
            groups.set(key, {
                model,
                workload,
                runs: [],
                engines: new Set(),
                hasLlmd: false,
            });
        }
        const g = groups.get(key);
        g.runs.push(r);
        if (r.stack?.engine) g.engines.add(r.stack.engine);
        if (r.stack?.engine === 'llm-d') g.hasLlmd = true;
    });

    const scored = Array.from(groups.values()).sort((a, b) => {
        const scoreA = a.engines.size * 100 + a.runs.length * 10 + (a.hasLlmd ? 5 : 0);
        const scoreB = b.engines.size * 100 + b.runs.length * 10 + (b.hasLlmd ? 5 : 0);
        return scoreB - scoreA;
    });

    const best = scored[0];
    if (!best) return { model: 'all', workload: 'all' };
    return {
        model: best.model,
        workload: hints.workload && hints.workload !== 'all' ? hints.workload : best.workload,
    };
}

/**
 * Picks the best default pair of runs for RecipeComparisonPage when no
 * ?recipes= URL parameter is provided: prefers like-for-like runs on the
 * same hardware comparing llm-d against another stack.
 */
export function pickComparisonDefault(dataset = []) {
    const valid = (dataset || []).filter(Boolean);
    if (valid.length <= 2) return valid;

    let bestPair = null;
    let bestScore = -1;

    for (let i = 0; i < valid.length; i++) {
        for (let j = i + 1; j < valid.length; j++) {
            const a = valid[i];
            const b = valid[j];
            const parity = computeParity([a, b]);
            let score = (WORKLOAD_PARITY_FIELDS.length - parity.mismatches.length) * 20;
            if (parity.likeForLike) score += 100;
            if (a.stack?.engine !== b.stack?.engine) score += 40;
            if (a.hardware?.accelerator_type === b.hardware?.accelerator_type && a.hardware?.accelerator_count === b.hardware?.accelerator_count) {
                score += 30;
            }
            if (a.stack?.engine === 'llm-d' || b.stack?.engine === 'llm-d') {
                score += 15;
            }
            if (score > bestScore) {
                bestScore = score;
                // Put the non-llm-d baseline first so llm-d is shown as the challenger gain,
                // or keep order if both are same engine.
                bestPair = a.stack?.engine === 'llm-d' && b.stack?.engine !== 'llm-d' ? [b, a] : [a, b];
            }
        }
    }

    return bestPair || valid.slice(0, 2);
}

/**
 * Annotates a list of runs with per-(model × workload) group ranks so that
 * when the user views "any model" or "any workload", rankings restart per
 * group instead of ranking an 8B model above a 671B model globally.
 */
export function annotateModelWorkloadGroupRanks(runs = [], compareFn = null) {
    const groups = new Map();
    runs.forEach((run) => {
        const model = run.model_family || 'Model';
        const wlMeta = workloadFor(run.workload_class);
        const wlLabel = wlMeta ? wlMeta.label : (run.workload_class || 'Chat');
        const key = `${model}|||${run.workload_class || 'chat'}`;
        if (!groups.has(key)) {
            groups.set(key, {
                key,
                model,
                workload: run.workload_class || 'chat',
                label: `${model} · ${wlLabel}`,
                items: [],
            });
        }
        groups.get(key).items.push(run);
    });

    const annotatedById = new Map();
    groups.forEach((group) => {
        const sorted = compareFn ? [...group.items].sort(compareFn) : [...group.items];
        sorted.forEach((item, idx) => {
            annotatedById.set(item.id, {
                groupKey: group.key,
                groupLabel: group.label,
                groupRank: idx + 1,
                groupSize: sorted.length,
            });
        });
    });

    return runs.map((r) => ({
        ...r,
        ...(annotatedById.get(r.id) || {
            groupKey: `${r.model_family || 'Model'}|||${r.workload_class || 'chat'}`,
            groupLabel: r.model_family || 'Model',
            groupRank: r.rank || 1,
            groupSize: 1,
        }),
    }));
}
