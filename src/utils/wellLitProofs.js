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

// Headline proofs for llm-d's well-lit paths, computed from the benchmark data
// each guide ships (wellLitPathData.js). Home's stack panel and the
// methodology page both read these, so a number on Home and its explanation
// can never drift apart. A proof is null when its data can't support a claim;
// callers then show the path without a number instead of an unsourced one.
//
// Every proof is { metric, upTo, claim, context, baseline, points }:
//   metric   headline number, e.g. "8.1×" or "1.4–2.6×"
//   upTo     true when the metric is the best of several measured points
//   claim    what improved, in plain words
//   context  the condition and the baseline the number was measured against
//   baseline the comparison point, spelled out for the methodology page
//   points   every comparison in the sweep, so nothing is cherry-picked unseen

import { RAW_GEMMA_DATA, FALLBACK_PREFIX_CACHE_DATA, FALLBACK_PD_DATA, FALLBACK_AGENTIC_DATA } from './wellLitPathData.js';

const times = (ratio) => `${ratio.toFixed(1)}×`;

const MODEL_LABELS = { qwen3_32b: 'Qwen3-32B' };

// "qwen3_32b" -> "Qwen3-32B"; "Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8" -> "Qwen3-Coder-480B FP8".
export function shortModelName(name = '') {
    if (MODEL_LABELS[name]) return MODEL_LABELS[name];
    return String(name)
        .split('/')
        .pop()
        .replace(/-Instruct/i, '')
        .replace(/-A\d+B/i, '')
        .replace(/-(FP8|BF16|INT8|INT4)$/i, ' $1');
}

const shortGpu = (gpu = '') => String(gpu).replace(/^NVIDIA\s+/i, '');

// "30k" -> 30000, so context sizes sort numerically.
const contextTokens = (size) => parseFloat(size) * (/k$/i.test(String(size)) ? 1000 : 1);

// Intelligent routing: p99 TTFT of a standard Kubernetes Service divided by
// p99 TTFT behind the inference gateway, at every QPS where both were
// measured. The headline is the best point, so it carries "up to".
export function computeRoutingProof(rows = RAW_GEMMA_DATA) {
    const points = (rows || [])
        .filter((r) => r.baseline_ttft_p99 > 0 && r.optimal_ttft_p99 > 0)
        .map((r) => ({
            qps: r.qps,
            baseline: r.baseline_ttft_p99,
            optimized: r.optimal_ttft_p99,
            ratio: r.baseline_ttft_p99 / r.optimal_ttft_p99,
        }))
        .sort((a, b) => a.qps - b.qps);
    const best = points.reduce((b, p) => (!b || p.ratio > b.ratio ? p : b), null);
    if (!best || best.ratio <= 1) return null;
    return {
        metric: times(best.ratio),
        upTo: points.length > 1,
        claim: 'lower tail latency under load',
        context: `p99 time to first token at ${best.qps} QPS, vs. a standard Kubernetes Service`,
        baseline: 'A standard Kubernetes Service in front of the same model servers',
        points,
    };
}

const OFFLOAD_TIER = { cpu: 'CPU', 'cpu-lustre': 'CPU + Lustre' };

// Prefix cache offloading: for each context length, the best offload tier's
// throughput divided by HBM-only vLLM on the same model and context. The
// headline is the range across context lengths, not just the best one.
export function computePrefixCacheProof(rows = FALLBACK_PREFIX_CACHE_DATA) {
    const all = rows || [];
    const points = all
        .filter((r) => r.tech === 'pure-vllm' && r.throughput > 0)
        .map((base) => {
            const tiers = all.filter(
                (r) => r.tech !== 'pure-vllm' && r.model === base.model && r.workloadSize === base.workloadSize && r.throughput > 0
            );
            if (!tiers.length) return null;
            const top = tiers.reduce((b, r) => (r.throughput > b.throughput ? r : b));
            return {
                size: base.workloadSize,
                tokens: contextTokens(base.workloadSize),
                model: base.model,
                gpu: base.gpu,
                tier: OFFLOAD_TIER[top.setup] || top.setup,
                baseline: base.throughput,
                optimized: top.throughput,
                ratio: top.throughput / base.throughput,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.tokens - b.tokens);
    const gains = points.filter((p) => p.ratio > 1);
    if (!gains.length) return null;

    const lo = Math.min(...gains.map((p) => p.ratio));
    const hi = Math.max(...gains.map((p) => p.ratio));
    const grows = gains.length > 1 && gains.every((p, i) => i === 0 || p.ratio >= gains[i - 1].ratio);
    const first = gains[0];
    const last = gains[gains.length - 1];
    const tiers = new Set(gains.map((p) => p.tier));
    const sameSetup = new Set(gains.map((p) => `${p.model}|${p.gpu}`)).size === 1;

    return {
        metric: lo.toFixed(1) === hi.toFixed(1) ? times(hi) : `${lo.toFixed(1)}–${hi.toFixed(1)}×`,
        upTo: false,
        claim: grows ? 'higher throughput as context grows' : 'higher throughput on long contexts',
        context: [
            gains.length > 1 ? `${first.size}→${last.size} tokens of context` : `${first.size} tokens of context`,
            `${tiers.size === 1 ? first.tier : 'Best offload tier'} vs. HBM-only vLLM`,
            sameSetup ? `${shortModelName(first.model)} on ${shortGpu(first.gpu)}` : null,
        ]
            .filter(Boolean)
            .join(' · '),
        baseline: 'HBM-only vLLM (no KV-cache offloading) on the same model and context length',
        points,
    };
}

// Prefill/decode disaggregation: the split with the highest total throughput
// against an even split of the same replicas (the median split when the sweep
// has no even one). Never against the weakest split, which nobody deploys.
export function computePdProof(rows = FALLBACK_PD_DATA) {
    const points = (rows || [])
        .filter((r) => r.throughput?.total > 0)
        .map((r) => ({ split: r.ratio, prefill: r.prefill, decode: r.decode, total: r.throughput.total, model: r.model }));
    if (points.length < 2) return null;

    const best = points.reduce((b, p) => (p.total > b.total ? p : b));
    const even = points.find((p) => p.prefill != null && p.prefill === p.decode);
    const reference = even || [...points].sort((a, b) => a.total - b.total)[Math.floor(points.length / 2)];
    if (!reference || reference === best || best.total <= reference.total) return null;

    const label = (p) => (p.prefill != null && p.decode != null ? `${p.prefill} : ${p.decode}` : p.split);
    return {
        metric: times(best.total / reference.total),
        upTo: false,
        claim: even ? 'more throughput than an even split' : 'more throughput than a mid-range split',
        context: `${best.prefill} prefill : ${best.decode} decode vs. ${label(reference)} · ${shortModelName(best.model)}`,
        baseline: even
            ? `An even ${label(even)} prefill : decode split of the same ${even.prefill + even.decode} replicas`
            : 'The median split of the sweep',
        points: points.map((p) => ({ ...p, ratio: p.total / reference.total, isReference: p === reference, isBest: p === best })),
    };
}

// Agentic serving: combined optimizations (prefix-aware routing + tiered KV
// cache + Pallas kernels) vs. a standard Kubernetes Service across concurrency
// levels on 163k-token multi-turn agentic code generation.
export function computeAgenticProof(rows = FALLBACK_AGENTIC_DATA) {
    const all = rows || [];
    const points = all
        .filter((r) => (r.scenario === 'reference' || r.scenarioId === 0) && r.throughput?.total > 0)
        .map((base) => {
            const top = all.find(
                (r) =>
                    (r.scenario === 'combined' || r.scenarioId === 2) &&
                    r.concurrency === base.concurrency &&
                    r.throughput?.total > 0
            );
            if (!top) return null;
            return {
                concurrency: base.concurrency,
                model: base.model,
                accelerator: base.accelerator,
                contextK: base.inputLengthMean ? `${Math.round(base.inputLengthMean / 1000)}k` : null,
                baseline: base.throughput.total,
                optimized: top.throughput.total,
                ttftBaseline: base.ttft?.p50 || 0,
                ttftOptimized: top.ttft?.p50 || 0,
                ratio: top.throughput.total / base.throughput.total,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.concurrency - b.concurrency);

    const gains = points.filter((p) => p.ratio > 1);
    if (!gains.length) return null;

    const lo = Math.min(...gains.map((p) => p.ratio));
    const hi = Math.max(...gains.map((p) => p.ratio));
    const first = gains[0];
    const last = gains[gains.length - 1];

    return {
        metric: lo.toFixed(1) === hi.toFixed(1) ? times(hi) : `${lo.toFixed(1)}–${hi.toFixed(1)}×`,
        upTo: false,
        claim: 'higher multi-turn throughput',
        context: [
            gains.length > 1 ? `${first.concurrency}→${last.concurrency} concurrent sessions` : `${first.concurrency} concurrent sessions`,
            first.contextK ? `${first.contextK}-token context` : null,
            `${shortModelName(first.model)} on ${first.accelerator}`,
        ]
            .filter(Boolean)
            .join(' · '),
        baseline: 'A standard Kubernetes Service running the same vLLM replicas without llm-d routing or tiered KV cache',
        points,
    };
}

export const ROUTING_PROOF = computeRoutingProof();
export const PREFIX_CACHE_PROOF = computePrefixCacheProof();
export const PD_PROOF = computePdProof();
export const AGENTIC_PROOF = computeAgenticProof();

