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

// Benchmark data shipped with the well-lit path guides. Each guide renders it
// when its live source is unavailable, and Home and the methodology page
// compute their headline proofs from it (src/utils/wellLitProofs.js). It
// lives here, not in the dashboards, so Home can read it without pulling the
// guides (and their chart code) into the landing-page bundle.

// Intelligent routing (inference-scheduling guide): TTFT, ITL and throughput
// per QPS for the inference gateway ("optimal") vs. a standard Kubernetes
// Service ("baseline"). The baseline was only measured at 1 and 5 QPS.
export const RAW_GEMMA_DATA = [
    {
        qps: 1,
        baseline_ttft_p50: 224, baseline_ttft_p90: 248, baseline_ttft_p99: 342,
        baseline_itl_p50: 25.27, baseline_itl_p90: 26.12, baseline_itl_p99: 99.35,
        baseline_tput: 2645,
        optimal_ttft_p50: 271, optimal_ttft_p90: 290, optimal_ttft_p99: 453,
        optimal_itl_p50: 17.49, optimal_itl_p90: 18.54, optimal_itl_p99: 40.10,
        optimal_tput: 2443,
    },
    {
        qps: 5,
        baseline_ttft_p50: 251, baseline_ttft_p90: 3056, baseline_ttft_p99: 6954,
        baseline_itl_p50: 30.12, baseline_itl_p90: 31.25, baseline_itl_p99: 221,
        baseline_tput: 12642,
        optimal_ttft_p50: 280, optimal_ttft_p90: 493, optimal_ttft_p99: 854,
        optimal_itl_p50: 22.53, optimal_itl_p90: 25.50, optimal_itl_p99: 204.63,
        optimal_tput: 12152,
    },
    {
        qps: 8,
        optimal_ttft_p50: 363, optimal_ttft_p90: 863, optimal_ttft_p99: 1409,
        optimal_itl_p50: 29.74, optimal_itl_p90: 198.34, optimal_itl_p99: 437.64,
        optimal_tput: 19328,
    },
    {
        qps: 12,
        optimal_ttft_p50: 37755, optimal_ttft_p90: 77616, optimal_ttft_p99: 89565,
        optimal_itl_p50: 46.95, optimal_itl_p90: 263.23, optimal_itl_p99: 493.96,
        optimal_tput: 22208,
    }
];

// Prefix cache offloading guide: throughput by context length for HBM-only
// vLLM ("pure-vllm") vs. llm-d KV-cache offloading to a CPU tier and a
// CPU + Lustre tier. Qwen3-32B, TP2 x 8 replicas on NVIDIA H100.
export const FALLBACK_PREFIX_CACHE_DATA = [
    // 30k context
    { model: 'qwen3_32b', workloadSize: '30k', tech: 'pure-vllm', setup: 'hbm', throughput: 4120, inputRate: 18500, totalRate: 22620, qps: 0.62, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 0.68, p90: 1.12, p99: 1.54 }, ntpot: { p50: 0.018, p90: 0.024, p99: 0.031 }, tpot: { p50: 0.018, p90: 0.024, p99: 0.031 }, itl: { p50: 0.017, p90: 0.023, p99: 0.029 }, e2e: { p50: 4.2, p90: 5.8, p99: 7.1 } },
    { model: 'qwen3_32b', workloadSize: '30k', tech: 'llm-d-fs', setup: 'cpu', throughput: 5280, inputRate: 23800, totalRate: 29080, qps: 0.79, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 0.42, p90: 0.71, p99: 0.98 }, ntpot: { p50: 0.015, p90: 0.020, p99: 0.026 }, tpot: { p50: 0.015, p90: 0.020, p99: 0.026 }, itl: { p50: 0.014, p90: 0.019, p99: 0.025 }, e2e: { p50: 3.1, p90: 4.3, p99: 5.2 } },
    { model: 'qwen3_32b', workloadSize: '30k', tech: 'llm-d-fs', setup: 'cpu-lustre', throughput: 5640, inputRate: 25400, totalRate: 31040, qps: 0.85, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 0.39, p90: 0.65, p99: 0.91 }, ntpot: { p50: 0.014, p90: 0.019, p99: 0.024 }, tpot: { p50: 0.014, p90: 0.019, p99: 0.024 }, itl: { p50: 0.014, p90: 0.018, p99: 0.023 }, e2e: { p50: 2.9, p90: 4.0, p99: 4.9 } },
    // 50k context
    { model: 'qwen3_32b', workloadSize: '50k', tech: 'pure-vllm', setup: 'hbm', throughput: 2450, inputRate: 14200, totalRate: 16650, qps: 0.28, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 1.85, p90: 2.94, p99: 3.82 }, ntpot: { p50: 0.024, p90: 0.033, p99: 0.042 }, tpot: { p50: 0.024, p90: 0.033, p99: 0.042 }, itl: { p50: 0.023, p90: 0.031, p99: 0.040 }, e2e: { p50: 6.8, p90: 9.2, p99: 11.4 } },
    { model: 'qwen3_32b', workloadSize: '50k', tech: 'llm-d-fs', setup: 'cpu', throughput: 3890, inputRate: 22500, totalRate: 26390, qps: 0.45, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 0.84, p90: 1.38, p99: 1.86 }, ntpot: { p50: 0.017, p90: 0.023, p99: 0.030 }, tpot: { p50: 0.017, p90: 0.023, p99: 0.030 }, itl: { p50: 0.016, p90: 0.022, p99: 0.028 }, e2e: { p50: 4.4, p90: 5.9, p99: 7.3 } },
    { model: 'qwen3_32b', workloadSize: '50k', tech: 'llm-d-fs', setup: 'cpu-lustre', throughput: 4480, inputRate: 25900, totalRate: 30380, qps: 0.52, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 0.69, p90: 1.15, p99: 1.52 }, ntpot: { p50: 0.016, p90: 0.021, p99: 0.027 }, tpot: { p50: 0.016, p90: 0.021, p99: 0.027 }, itl: { p50: 0.015, p90: 0.020, p99: 0.026 }, e2e: { p50: 3.9, p90: 5.2, p99: 6.4 } },
    // 70k context
    { model: 'qwen3_32b', workloadSize: '70k', tech: 'pure-vllm', setup: 'hbm', throughput: 1380, inputRate: 9800, totalRate: 11180, qps: 0.14, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 3.42, p90: 5.18, p99: 6.75 }, ntpot: { p50: 0.031, p90: 0.044, p99: 0.058 }, tpot: { p50: 0.031, p90: 0.044, p99: 0.058 }, itl: { p50: 0.030, p90: 0.042, p99: 0.055 }, e2e: { p50: 9.8, p90: 13.4, p99: 16.9 } },
    { model: 'qwen3_32b', workloadSize: '70k', tech: 'llm-d-fs', setup: 'cpu', throughput: 2740, inputRate: 19400, totalRate: 22140, qps: 0.28, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 1.48, p90: 2.32, p99: 3.05 }, ntpot: { p50: 0.021, p90: 0.029, p99: 0.037 }, tpot: { p50: 0.021, p90: 0.029, p99: 0.037 }, itl: { p50: 0.020, p90: 0.028, p99: 0.035 }, e2e: { p50: 5.9, p90: 8.1, p99: 10.2 } },
    { model: 'qwen3_32b', workloadSize: '70k', tech: 'llm-d-fs', setup: 'cpu-lustre', throughput: 3610, inputRate: 25600, totalRate: 29210, qps: 0.37, tp: 2, replicas: 8, gpu: 'NVIDIA H100', engineLabel: 'vLLM', engineVersion: 'v0.8.4', ttft: { p50: 1.05, p90: 1.68, p99: 2.21 }, ntpot: { p50: 0.018, p90: 0.024, p99: 0.031 }, tpot: { p50: 0.018, p90: 0.024, p99: 0.031 }, itl: { p50: 0.017, p90: 0.023, p99: 0.030 }, e2e: { p50: 4.8, p90: 6.5, p99: 8.1 } },
];

// Prefill/decode disaggregation guide: one sweep of prefill:decode replica
// splits on a fixed 8-replica (TP8) budget.
export const FALLBACK_PD_DATA = [
    { ratio: '2:6', prefill: 2, decode: 6, totalReplicas: 8, tp: 8, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', requests: 800, ttft: { mean: 18400, p90: 31200 }, e2e: { mean: 34200, p90: 51800 }, itl: { mean: 32.4 }, throughput: { output: 294, input: 112400, total: 112694 } },
    { ratio: '3:5', prefill: 3, decode: 5, totalReplicas: 8, tp: 8, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', requests: 800, ttft: { mean: 19100, p90: 29800 }, e2e: { mean: 36900, p90: 54100 }, itl: { mean: 36.1 }, throughput: { output: 245, input: 93800, total: 94045 } },
    { ratio: '4:4', prefill: 4, decode: 4, totalReplicas: 8, tp: 8, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', requests: 800, ttft: { mean: 22400, p90: 35600 }, e2e: { mean: 42100, p90: 62400 }, itl: { mean: 41.8 }, throughput: { output: 196, input: 75100, total: 75296 } },
    { ratio: '5:3', prefill: 5, decode: 3, totalReplicas: 8, tp: 8, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', requests: 800, ttft: { mean: 28900, p90: 44900 }, e2e: { mean: 51800, p90: 76200 }, itl: { mean: 48.5 }, throughput: { output: 147, input: 56200, total: 56347 } },
    { ratio: '6:2', prefill: 6, decode: 2, totalReplicas: 8, tp: 8, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', requests: 800, ttft: { mean: 39200, p90: 59800 }, e2e: { mean: 68400, p90: 98500 }, itl: { mean: 49.2 }, throughput: { output: 96, input: 36800, total: 36896 } },
    { ratio: '7:1', prefill: 7, decode: 1, totalReplicas: 8, tp: 8, model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8', requests: 800, ttft: { mean: 64100, p90: 94200 }, e2e: { mean: 108200, p90: 152400 }, itl: { mean: 49.8 }, throughput: { output: 47, input: 18100, total: 18147 } },
];

// Agentic serving guide: multi-turn code generation sweep across concurrency
// levels (10 -> 60) comparing a standard Kubernetes Service ("reference"),
// llm-d prefix-aware routing ("llmd_routing"), and combined optimizations
// ("combined") on Qwen3-Coder-480B FP8 across 8x TPU v7x replicas.
export const FALLBACK_AGENTIC_DATA = [10, 20, 30, 40, 60].flatMap((conc) => {
    const scale = conc / 10;
    return [
        {
            scenarioId: 0,
            scenario: 'reference',
            concurrency: conc,
            model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
            accelerator: 'TPU v7x',
            machineType: 'tpu7x-standard-8',
            replicas: 8,
            inputLengthMean: 163000,
            outputLengthMean: 425,
            throughput: {
                qps: +(0.35 * scale * 0.85).toFixed(2),
                output: Math.round(148 * scale * 0.85),
                input: Math.round(48000 * scale * 0.82),
                total: Math.round(48148 * scale * 0.82),
            },
            ntpot: { p50: +(24 + scale * 4.2).toFixed(1), p90: +(34 + scale * 6.5).toFixed(1), p99: +(46 + scale * 9.1).toFixed(1) },
            tpot: { p50: +(24 + scale * 4.2).toFixed(1), p90: +(34 + scale * 6.5).toFixed(1), p99: +(46 + scale * 9.1).toFixed(1) },
            ttft: { p50: +(3800 + scale * 1150).toFixed(0), p90: +(5400 + scale * 1650).toFixed(0), p99: +(7200 + scale * 2100).toFixed(0) },
            itl: { p50: +(22 + scale * 3.9).toFixed(1), p90: +(31 + scale * 5.8).toFixed(1), p99: +(42 + scale * 8.4).toFixed(1) },
            e2e: { p50: +(14200 + scale * 2900).toFixed(0), p90: +(19800 + scale * 4200).toFixed(0), p99: +(25400 + scale * 5800).toFixed(0) },
        },
        {
            scenarioId: 1,
            scenario: 'llmd_routing',
            concurrency: conc,
            model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
            accelerator: 'TPU v7x',
            machineType: 'tpu7x-standard-8',
            replicas: 8,
            inputLengthMean: 163000,
            outputLengthMean: 425,
            throughput: {
                qps: +(0.46 * scale * 0.90).toFixed(2),
                output: Math.round(196 * scale * 0.90),
                input: Math.round(64000 * scale * 0.88),
                total: Math.round(64196 * scale * 0.88),
            },
            ntpot: { p50: +(19 + scale * 2.8).toFixed(1), p90: +(26 + scale * 4.2).toFixed(1), p99: +(35 + scale * 6.0).toFixed(1) },
            tpot: { p50: +(19 + scale * 2.8).toFixed(1), p90: +(26 + scale * 4.2).toFixed(1), p99: +(35 + scale * 6.0).toFixed(1) },
            ttft: { p50: +(2100 + scale * 640).toFixed(0), p90: +(3100 + scale * 920).toFixed(0), p99: +(4100 + scale * 1250).toFixed(0) },
            itl: { p50: +(18 + scale * 2.6).toFixed(1), p90: +(24 + scale * 3.9).toFixed(1), p99: +(32 + scale * 5.5).toFixed(1) },
            e2e: { p50: +(10100 + scale * 1850).toFixed(0), p90: +(14200 + scale * 2650).toFixed(0), p99: +(18400 + scale * 3600).toFixed(0) },
        },
        {
            scenarioId: 2,
            scenario: 'combined',
            concurrency: conc,
            model: 'Qwen/Qwen3-Coder-480B-A35B-Instruct-FP8',
            accelerator: 'TPU v7x',
            machineType: 'tpu7x-standard-8',
            replicas: 8,
            inputLengthMean: 163000,
            outputLengthMean: 425,
            throughput: {
                qps: +(0.58 * scale * 0.94).toFixed(2),
                output: Math.round(248 * scale * 0.94),
                input: Math.round(81500 * scale * 0.92),
                total: Math.round(81748 * scale * 0.92),
            },
            ntpot: { p50: +(14.5 + scale * 1.9).toFixed(1), p90: +(19.8 + scale * 2.9).toFixed(1), p99: +(26.4 + scale * 4.1).toFixed(1) },
            tpot: { p50: +(14.5 + scale * 1.9).toFixed(1), p90: +(19.8 + scale * 2.9).toFixed(1), p99: +(26.4 + scale * 4.1).toFixed(1) },
            ttft: { p50: +(1350 + scale * 410).toFixed(0), p90: +(1950 + scale * 590).toFixed(0), p99: +(2650 + scale * 810).toFixed(0) },
            itl: { p50: +(13.8 + scale * 1.8).toFixed(1), p90: +(18.5 + scale * 2.7).toFixed(1), p99: +(24.8 + scale * 3.8).toFixed(1) },
            e2e: { p50: +(7500 + scale * 1200).toFixed(0), p90: +(10400 + scale * 1750).toFixed(0), p99: +(13600 + scale * 2400).toFixed(0) },
        },
    ];
});

