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

// The leaderboard's vocabulary: ranking objectives, workload shapes,
// accelerators and serving stacks. The Leaderboard sentence, Home's
// quick-start chips and the methodology page all read these lists, so a link
// from Home always lands on a value the Leaderboard understands.

export const OBJECTIVES = [
    { value: 'tokens_per_sec_per_chip', label: 'fastest', spotlight: 'Highest throughput per chip', by: 'throughput per chip' },
    { value: 'ttft_p50', label: 'most responsive', spotlight: 'Lowest TTFT', by: 'time to first token' },
    { value: 'itl_p50', label: 'smoothest', spotlight: 'Lowest TPOT', by: 'time per output token' },
    // pricingEngine divides the hourly list price by TOTAL (input + output)
    // tokens served, so this is cost per 1M tokens, not per 1M output tokens.
    { value: 'cost_per_1m', label: 'cheapest', spotlight: 'Lowest $ / 1M tokens', by: 'cost per 1M tokens' },
];

export const DEFAULT_OBJECTIVE = OBJECTIVES[0].value;

// Links from before per-chip ranking used `sort=tokens_per_sec` for "fastest".
const LEGACY_OBJECTIVES = {
    tokens_per_sec: DEFAULT_OBJECTIVE,
    upvotes: DEFAULT_OBJECTIVE,
    reproductions: DEFAULT_OBJECTIVE,
};

export const normalizeObjective = (value) =>
    LEGACY_OBJECTIVES[value] || (OBJECTIVES.some((o) => o.value === value) ? value : DEFAULT_OBJECTIVE);

export const objectiveFor = (metric) => OBJECTIVES.find((o) => o.value === metric) || OBJECTIVES[0];

export const PERCENTILES = [
    { value: 'p50', label: 'P50' },
    { value: 'p90', label: 'P90' },
    { value: 'p99', label: 'P99' },
];

export const DEFAULT_PERCENTILE = 'p50';
export const DEFAULT_SLA_PERCENTILE = 'p90';

export const normalizePercentile = (value, fallback = DEFAULT_PERCENTILE) =>
    PERCENTILES.some((p) => p.value === value) ? value : fallback;

/**
 * Reads TTFT ('ttft') or TPOT ('itl') in milliseconds at the requested
 * percentile ('p50' | 'p90' | 'p99'), or null when not reported.
 */
export function latencyFor(item, kind = 'ttft', percentile = 'p50') {
    if (!item) return null;
    const pct = normalizePercentile(percentile);
    const nested = kind === 'itl' ? item.metrics?.itl_ms?.[pct] : item.metrics?.ttft_ms?.[pct];
    if (typeof nested === 'number' && Number.isFinite(nested) && nested > 0) return nested;
    const flatKey = `${kind === 'itl' ? 'itl' : 'ttft'}_${pct}`;
    const flat = item[flatKey];
    if (typeof flat === 'number' && Number.isFinite(flat) && flat > 0) return flat;
    return null;
}

// Workload shapes. `display` reads inside the sentence ("…serve Llama 3.1 70B
// for code generation…"); `rule` is published on the methodology page and
// must describe classifyWorkload() below.
export const WORKLOADS = [
    {
        value: 'chat',
        label: 'Chat (ShareGPT)',
        display: 'chat',
        islOslLabel: '1,024 in / 512 out tok',
        defaultSlo: { ttft: 100, tpot: 25, percentile: 'p90' },
        rule: 'Conversational datasets (ShareGPT, chat, multi-turn), and any run without a stronger signal.',
    },
    {
        value: 'rag',
        label: 'RAG / summarization',
        display: 'RAG and summarization',
        islOslLabel: '4,096 in / 512 out tok',
        defaultSlo: { ttft: 200, tpot: 35, percentile: 'p90' },
        rule: 'Retrieval, summarization or long-context datasets, or prompts of 4k+ tokens that are at least 4× the output.',
    },
    {
        value: 'code',
        label: 'Agentic & codegen',
        display: 'agentic & code generation',
        islOslLabel: '1k–4k in / 512 out tok',
        defaultSlo: { ttft: 120, tpot: 25, percentile: 'p90' },
        rule: 'Code and agentic tool-use datasets (SWE-bench, agentic code generation, HumanEval, MBPP).',
    },
    {
        value: 'reasoning',
        label: 'Reasoning',
        display: 'reasoning',
        islOslLabel: '2,048 in / 2,048 out tok',
        defaultSlo: { ttft: 150, tpot: 30, percentile: 'p90' },
        rule: 'Reasoning or math datasets (GSM8K, AIME), or outputs of 1.5k+ tokens that are at least as long as the prompt.',
    },
    {
        value: 'batch',
        label: 'Offline batch',
        display: 'offline batch',
        islOslLabel: 'Throughput-bound',
        defaultSlo: null,
        rule: 'Runs marked offline or batch: throughput-bound, with no latency target.',
    },
];

export const workloadFor = (value) => WORKLOADS.find((w) => w.value === value) || null;

// Derives a run's workload shape from its dataset name, then from its prompt
// and output lengths. An explicit `workload_class` on the run always wins.
export function classifyWorkload(workload) {
    if (!workload || typeof workload !== 'object') return 'chat';
    if (workloadFor(workload.workload_class)) return workload.workload_class;

    const name = String(workload.dataset_name || workload.name || '').toLowerCase();
    const mode = String(workload.mode || '').toLowerCase();
    const isl = Number(workload.input_tokens) || 0;
    const osl = Number(workload.output_tokens) || 0;

    if (/batch|offline/.test(name) || /batch|offline/.test(mode)) return 'batch';
    if (/reason|math|gsm8k|aime/.test(name)) return 'reasoning';
    if (/code|humaneval|mbpp|swe-?bench|agentic/.test(name)) return 'code';
    if (/rag|retriev|long[- ]?context|summar|needle/.test(name)) return 'rag';
    if (/chat|sharegpt|conversation|multi-?turn/.test(name)) return 'chat';
    if (isl >= 4096 && isl >= 4 * osl) return 'rag';
    if (osl >= 1536 && osl >= isl) return 'reasoning';
    return 'chat';
}

export const HARDWARE_OPTIONS = [
    { value: 'nvidia-h100-80gb', label: 'NVIDIA H100', short: 'H100' },
    { value: 'nvidia-a100-80gb', label: 'NVIDIA A100', short: 'A100' },
    { value: 'nvidia-l4', label: 'NVIDIA L4', short: 'L4' },
    { value: 'tpu-v6e-trillium', label: 'TPU v6e', short: 'TPU v6e' },
    { value: 'tpu-v5e', label: 'TPU v5e', short: 'TPU v5e' },
];

// Accelerator ids the data can carry beyond the defaults. They are offered
// only when a run uses them, so no run is ever unreachable from the sentence.
const EXTRA_HARDWARE_LABELS = {
    'nvidia-a100-40gb': 'NVIDIA A100 40GB',
    'nvidia-v100': 'NVIDIA V100',
    'tpu-v5p': 'TPU v5p',
    other: 'other accelerators',
};

export function hardwareOptionsFor(dataset = []) {
    const known = new Set(HARDWARE_OPTIONS.map((h) => h.value));
    const extras = [...new Set(dataset.map((r) => r.hardware?.accelerator_type))]
        .filter((id) => id && !known.has(id))
        .map((id) => ({ value: id, label: EXTRA_HARDWARE_LABELS[id] || id, short: EXTRA_HARDWARE_LABELS[id] || id }));
    return [...HARDWARE_OPTIONS, ...extras];
}

export const ENGINE_OPTIONS = [
    { value: 'llm-d', label: 'llm-d' },
    { value: 'vllm', label: 'vLLM' },
    { value: 'sglang', label: 'SGLang' },
];

export function engineLabel(value) {
    if (!value) return 'Unknown';
    const lower = String(value).toLowerCase();
    const match = ENGINE_OPTIONS.find((e) => e.value === lower);
    if (match) return match.label;
    if (lower.includes('llm-d') || lower === 'llmd') return 'llm-d';
    if (lower.includes('vllm')) return 'vLLM';
    if (lower.includes('sglang')) return 'SGLang';
    return String(value);
}

export const DIMENSION_TOKEN_KEYS = {
    model: ['model'],
    workload: ['workload', 'usecase'],
    hardware: ['hardware', 'hw', 'gpu', 'tpu', 'acc', 'machine'],
    engine: ['stack', 'engine'],
};

function dimensionForKey(key) {
    const k = String(key || '').toLowerCase();
    for (const [dim, keys] of Object.entries(DIMENSION_TOKEN_KEYS)) {
        if (keys.includes(k)) return dim;
    }
    return null;
}

/**
 * Parses a raw search query into structured tokens for chip display and sync.
 */
export function parseQueryTokens(rawQuery = '') {
    const trimmed = String(rawQuery || '').trim();
    if (!trimmed) return [];
    const rawTokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return rawTokens.map((raw) => {
        const clean = raw.replace(/^"|"$/g, '');
        const colonIdx = clean.indexOf(':');
        if (colonIdx > 0) {
            const key = clean.slice(0, colonIdx).toLowerCase();
            const value = clean.slice(colonIdx + 1);
            return {
                raw,
                key,
                value,
                dimension: dimensionForKey(key),
            };
        }
        return { raw, key: null, value: clean, dimension: null };
    });
}

/**
 * Removes any property:value tokens belonging to `dimension` ('model' | 'workload' | 'hardware' | 'engine')
 * from `rawQuery` so sentence selections and search tokens never conflict.
 */
export function removeDimensionTokens(rawQuery = '', dimension) {
    const tokens = parseQueryTokens(rawQuery);
    if (tokens.length === 0) return '';
    return tokens
        .filter((t) => t.dimension !== dimension)
        .map((t) => t.raw)
        .join(' ');
}

/**
 * Removes a single raw token from `rawQuery`.
 */
export function removeQueryToken(rawQuery = '', rawTokenToRemove) {
    const tokens = parseQueryTokens(rawQuery);
    let removed = false;
    return tokens
        .filter((t) => {
            if (!removed && t.raw === rawTokenToRemove) {
                removed = true;
                return false;
            }
            return true;
        })
        .map((t) => t.raw)
        .join(' ');
}

// Evaluates a single pattern (plain text, `a|b` alternation, or `/regex/flags`)
// against one or more candidate strings on a leaderboard item.
function testPatternAgainstFields(patternStr, candidateStrings) {
    if (!patternStr) return true;
    const combined = candidateStrings.filter(Boolean).join(' ');
    const slashMatch = /^\/(.+)\/([gimsuy]*)$/.exec(patternStr);
    if (slashMatch) {
        try {
            const flags = slashMatch[2].includes('i') ? slashMatch[2] : `${slashMatch[2]}i`;
            const rx = new RegExp(slashMatch[1], flags);
            return rx.test(combined);
        } catch {
            return combined.toLowerCase().includes(slashMatch[1].toLowerCase());
        }
    }
    if (/[|.*+?^${}()[\]\\]/.test(patternStr)) {
        try {
            const rx = new RegExp(patternStr, 'i');
            return rx.test(combined);
        } catch {
            // Fall through to case-insensitive substring check
        }
    }
    return combined.toLowerCase().includes(patternStr.toLowerCase());
}

/**
 * Cloud-style `property:value` & regex search matcher for leaderboard runs.
 * Supports:
 *  - `model:<pattern>`
 *  - `hardware:<pattern>` (aliases `hw:`, `gpu:`, `tpu:`, `acc:`, `machine:`)
 *  - `stack:<pattern>` (alias `engine:`)
 *  - `workload:<pattern>`
 *  - `quant:<pattern>` (alias `precision:`)
 *  - `tp:<pattern>`
 *  - `author:<pattern>` (aliases `contributor:`, `team:`)
 *  - `status:<pattern>` (`verified`, `well-lit`, `community`)
 *  - Free-text tokens and `/regex/i` or `a|b` regex expressions.
 */
export function matchesSearchQuery(item, rawQuery) {
    const trimmed = String(rawQuery || '').trim();
    if (!trimmed) return true;

    const allFields = [
        item.recipe_name,
        item.model_name,
        item.model_family,
        item.hardware_summary,
        item.hardware?.accelerator_type,
        item.hardware?.machine_type,
        item.stack?.engine,
        item.stack?.quantization,
        item.workload_class,
        item.workload?.dataset_name,
        item.author?.display_name,
        item.author?.username,
        item.author?.team,
        item.verification_status,
        item.well_lit_path,
    ];

    // If the entire query is a single /regex/flags literal, evaluate across all fields
    if (/^\/.+\/[gimsuy]*$/.test(trimmed)) {
        return testPatternAgainstFields(trimmed, allFields);
    }

    const tokens = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    return tokens.every((rawToken) => {
        const token = rawToken.replace(/^"|"$/g, '');
        const colonIdx = token.indexOf(':');
        if (colonIdx > 0) {
            const key = token.slice(0, colonIdx).toLowerCase();
            const val = token.slice(colonIdx + 1);
            if (!val) return true;

            if (key === 'model') {
                return testPatternAgainstFields(val, [item.model_family, item.model_name, item.recipe_name]);
            }
            if (key === 'hardware' || key === 'hw' || key === 'gpu' || key === 'tpu' || key === 'acc' || key === 'machine') {
                return testPatternAgainstFields(val, [
                    item.hardware_summary,
                    item.hardware?.accelerator_type,
                    item.hardware?.machine_type,
                ]);
            }
            if (key === 'stack' || key === 'engine') {
                return testPatternAgainstFields(val, [item.stack?.engine, item.stack?.engine_version]);
            }
            if (key === 'workload' || key === 'usecase') {
                return testPatternAgainstFields(val, [item.workload_class, item.workload?.dataset_name, item.workload?.mode]);
            }
            if (key === 'quant' || key === 'precision') {
                return testPatternAgainstFields(val, [item.stack?.quantization, item.stack?.kv_cache_dtype]);
            }
            if (key === 'tp') {
                return String(item.stack?.tensor_parallel_size || 1) === val.replace(/^tp/i, '');
            }
            if (key === 'author' || key === 'contributor' || key === 'team') {
                return testPatternAgainstFields(val, [
                    item.author?.display_name,
                    item.author?.username,
                    item.author?.github_id,
                    item.author?.team,
                ]);
            }
            if (key === 'status') {
                return testPatternAgainstFields(val, [
                    item.verification_status,
                    item.well_lit_path ? 'well-lit well_lit_path' : '',
                ]);
            }
        }

        return testPatternAgainstFields(token, allFields);
    });
}

