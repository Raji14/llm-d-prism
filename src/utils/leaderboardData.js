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

import { evaluateRecipeCost, normalizeAcceleratorId, extractAcceleratorCount } from './pricingEngine.js';
import { classifyWorkload, engineKey, normalizePercentile, DEFAULT_SLA_PERCENTILE } from './leaderboardFacets.js';

/**
 * Illustrative sample recipes across GCP accelerators. These are NOT measured
 * runs: they show how ranking and parity verification work until verified
 * community runs arrive. Export them only through SEED_LEADERBOARD_RECIPES
 * (below), which flags each one `is_sample` so every surface can label it and
 * never count it as verified.
 *
 * Every recipe is roofline-checked against accelerator memory bandwidth and
 * compute peak, and total_tokens_per_sec = output_tokens_per_sec * (ISL + OSL) / OSL.
 */
const ILLUSTRATIVE_RECIPES = [
    {
        id: 'recipe-llama3-70b-h100-llmd',
        recipe_name: 'llm-d Prefix-Aware Routing + SpecDecode (8x H100)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'rajithal',
            display_name: 'Rajitha L.',
            github_id: 'rajithal',
            team: 'llm-d Core',
            avatar_url: 'https://github.com/rajithal.png',
        },
        hardware_summary: '8x NVIDIA H100 SXM5 (A3 VM)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 8,
            machine_type: 'a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'llm-d',
            engine_version: 'v0.4.2',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'prefix-cache-aware',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: {
                enabled: true,
                draft_model: 'meta-llama/Llama-3.1-8B-Instruct',
                num_speculative_tokens: 4,
            },
            launch_args: {
                max_model_len: 8192,
                gpu_memory_utilization: 0.94,
                enable_chunked_prefill: true,
                scheduler_delay_factor: 0.05,
            },
        },
        container_image: 'ghcr.io/llm-d/llm-d:v0.4.2',
        well_lit_path: 'inference-scheduling',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 64,
            target_qps: 12.5,
            dataset_name: 'ShareGPT Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 34.0, p50: 31.0, p90: 46.0, p99: 64.0 },
            itl_ms: { mean: 14.8, p50: 14.2, p90: 18.5, p99: 24.0 },
            output_tokens_per_sec: { mean: 1940, p50: 1960, p90: 2050 },
            total_tokens_per_sec: { mean: 5820, p50: 5880, p90: 6150 },
            prefix_cache_hit_rate_pct: 88.4,
            kv_cache_usage_pct: 74.2,
        },
        reproductions: [
            {
                id: 'repro-llmd-70b-1',
                author: 'kswain-ai',
                date: '2026-08-20',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: -1.2,
                report_url: 'https://github.com/llm-d/llm-d/pull/142',
            },
            {
                id: 'repro-llmd-70b-2',
                author: 'shorgan-gcp',
                date: '2026-08-22',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: 0.8,
            },
            {
                id: 'repro-llmd-70b-3',
                author: 'chenw-gcp',
                date: '2026-08-25',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: -1.9,
            },
            {
                id: 'repro-llmd-70b-4',
                author: 'arivera-ai',
                date: '2026-08-28',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: 1.4,
            },
        ],
        reproduced_count: 4,
        benchmark_scope: 'system',
        git_commit_sha: 'a8f3b92',
        git_branch: 'main',
        pull_request_url: 'https://github.com/llm-d/llm-d/pull/142',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 78.4,
            oom_headroom_concurrency: 128,
            queue_dwell_p99_ms: 3.2,
        },
        verification_status: 'verified',
        created_at: '2026-08-18T14:20:00Z',
        reproduction_command:
            'docker run --gpus all -e MODEL=meta-llama/Llama-3.1-70B-Instruct -e TP=8 ghcr.io/llm-d/llm-d:v0.4.2 --enable-prefix-caching --routing-policy prefix-cache-aware --speculative-model meta-llama/Llama-3.1-8B-Instruct --num-speculative-tokens 4',
    },
    {
        id: 'recipe-llama3-70b-h100-vllm',
        recipe_name: 'vLLM FP8 Chunked Prefill Baseline (8x H100)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'kellen_s',
            display_name: 'Kellen S.',
            github_id: 'kswain-ai',
            team: 'Serving Benchmarks',
        },
        hardware_summary: '8x NVIDIA H100 SXM5 (A3 VM)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 8,
            machine_type: 'a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'vllm',
            engine_version: 'v0.6.3',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'round-robin',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
            launch_args: {
                max_model_len: 8192,
                gpu_memory_utilization: 0.94,
                enable_chunked_prefill: true,
            },
        },
        container_image: 'vllm/vllm-openai:v0.6.3',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 64,
            target_qps: 10.0,
            dataset_name: 'ShareGPT Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 48.5, p50: 44.0, p90: 68.0, p99: 94.0 },
            itl_ms: { mean: 19.2, p50: 18.5, p90: 23.8, p99: 31.0 },
            output_tokens_per_sec: { mean: 1480, p50: 1500, p90: 1560 },
            total_tokens_per_sec: { mean: 4440, p50: 4500, p90: 4680 },
            prefix_cache_hit_rate_pct: 61.5,
            kv_cache_usage_pct: 79.0,
        },
        reproductions: [
            {
                id: 'repro-vllm-h100-1',
                author: 'rajithal',
                date: '2026-08-19',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: 0.5,
            },
            {
                id: 'repro-vllm-h100-2',
                author: 'smiller-ml',
                date: '2026-08-21',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: -1.1,
            },
            {
                id: 'repro-vllm-h100-3',
                author: 'mk-distrib',
                date: '2026-08-24',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: 1.6,
            },
        ],
        reproduced_count: 3,
        benchmark_scope: 'system',
        git_commit_sha: '9c42e10',
        git_branch: 'release/v0.6.3',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 81.2,
            oom_headroom_concurrency: 112,
            queue_dwell_p99_ms: 5.4,
        },
        verification_status: 'verified',
        created_at: '2026-08-16T11:10:00Z',
        reproduction_command:
            'vllm serve meta-llama/Llama-3.1-70B-Instruct --tensor-parallel-size 8 --quantization fp8 --kv-cache-dtype fp8 --enable-prefix-caching --enable-chunked-prefill',
    },
    {
        id: 'recipe-llama3-70b-h100-sglang',
        recipe_name: 'SGLang RadixAttention FP8 (8x H100)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'alex_fld',
            display_name: 'Alex Rivera',
            github_id: 'arivera-ai',
            team: 'Field Engineering',
        },
        hardware_summary: '8x NVIDIA H100 SXM5 (A3 VM)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 8,
            machine_type: 'a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'sglang',
            engine_version: 'v0.4.1',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'radix-cache',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'lmsysorg/sglang:v0.4.1-cu124',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 64,
            target_qps: 10.8,
            dataset_name: 'ShareGPT Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 39.5, p50: 36.0, p90: 54.0, p99: 76.0 },
            itl_ms: { mean: 17.6, p50: 17.0, p90: 21.8, p99: 28.5 },
            output_tokens_per_sec: { mean: 1620, p50: 1640, p90: 1710 },
            total_tokens_per_sec: { mean: 4860, p50: 4920, p90: 5130 },
            prefix_cache_hit_rate_pct: 83.0,
            kv_cache_usage_pct: 76.5,
        },
        reproductions: [
            {
                id: 'repro-sglang-h100-1',
                author: 'kswain-ai',
                date: '2026-08-18',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: -0.9,
            },
            {
                id: 'repro-sglang-h100-2',
                author: 'dking-ai',
                date: '2026-08-23',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: 2.1,
            },
        ],
        reproduced_count: 2,
        benchmark_scope: 'system',
        git_commit_sha: '4d19c7b',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 79.5,
            oom_headroom_concurrency: 112,
            queue_dwell_p99_ms: 4.1,
        },
        verification_status: 'verified',
        created_at: '2026-08-15T09:40:00Z',
        reproduction_command:
            'python3 -m sglang.launch_server --model-path meta-llama/Llama-3.1-70B-Instruct --tp 8 --quantization fp8 --kv-cache-dtype fp8_e4m3',
    },
    {
        id: 'recipe-llama3-70b-v6e-vllm',
        recipe_name: 'vLLM TPU Trillium FP8 (8x v6e)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'chen_tpu_eng',
            display_name: 'Chen W.',
            github_id: 'chenw-gcp',
            team: 'Cloud TPU Solutions',
        },
        hardware_summary: '8x Google TPU v6e (Trillium)',
        hardware: {
            accelerator_type: 'tpu-v6e-trillium',
            accelerator_count: 8,
            machine_type: 'ct6e-standard-8t',
            cloud_provider: 'gcp',
            region: 'us-east4',
        },
        stack: {
            engine: 'vllm',
            engine_version: 'v0.6.3-tpu',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'round-robin',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'vllm/vllm-tpu:v0.6.3',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 64,
            target_qps: 7.2,
            dataset_name: 'ShareGPT Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 52.0, p50: 48.0, p90: 72.0, p99: 98.0 },
            itl_ms: { mean: 24.5, p50: 23.6, p90: 29.5, p99: 38.0 },
            output_tokens_per_sec: { mean: 1040, p50: 1060, p90: 1120 },
            total_tokens_per_sec: { mean: 3120, p50: 3180, p90: 3360 },
            prefix_cache_hit_rate_pct: 79.0,
            kv_cache_usage_pct: 71.0,
        },
        reproductions: [
            {
                id: 'repro-v6e-70b-1',
                author: 'dking-ai',
                date: '2026-08-15',
                hardware_summary: '8x Google TPU v6e (ct6e-standard-8t)',
                delta_pct: 1.1,
            },
            {
                id: 'repro-v6e-70b-2',
                author: 'shorgan-gcp',
                date: '2026-08-19',
                hardware_summary: '8x Google TPU v6e (ct6e-standard-8t)',
                delta_pct: -0.7,
            },
        ],
        reproduced_count: 2,
        benchmark_scope: 'system',
        git_commit_sha: 'e412f80',
        git_branch: 'release/v0.6.3',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 71.0,
            oom_headroom_concurrency: 96,
            queue_dwell_p99_ms: 4.8,
        },
        verification_status: 'verified',
        created_at: '2026-08-12T11:00:00Z',
        reproduction_command:
            'vllm serve meta-llama/Llama-3.1-70B-Instruct --tensor-parallel-size 8 --quantization fp8 --enable-prefix-caching',
    },
    {
        id: 'recipe-llama3-70b-l4-sglang',
        recipe_name: 'SGLang RadixAttention AWQ INT4 (8x L4)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'alex_fld',
            display_name: 'Alex Rivera',
            github_id: 'arivera-ai',
            team: 'Field Engineering',
        },
        hardware_summary: '8x NVIDIA L4 (24GB) G2 VM',
        hardware: {
            accelerator_type: 'nvidia-l4',
            accelerator_count: 8,
            machine_type: 'g2-standard-96',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'sglang',
            engine_version: 'v0.3.4',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'radix-cache',
            pd_disaggregation: false,
            quantization: 'awq',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'lmsysorg/sglang:v0.3.4-cu124',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 32,
            target_qps: 2.8,
            dataset_name: 'ShareGPT Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 118.0, p50: 108.0, p90: 156.0, p99: 210.0 },
            itl_ms: { mean: 34.5, p50: 33.0, p90: 42.0, p99: 54.0 },
            output_tokens_per_sec: { mean: 420, p50: 430, p90: 460 },
            total_tokens_per_sec: { mean: 1260, p50: 1290, p90: 1380 },
            prefix_cache_hit_rate_pct: 84.1,
            kv_cache_usage_pct: 81.0,
        },
        reproductions: [
            {
                id: 'repro-l4-70b-1',
                author: 'epetrova-cloud',
                date: '2026-08-08',
                hardware_summary: '8x NVIDIA L4 (g2-standard-96)',
                delta_pct: -2.4,
            },
        ],
        reproduced_count: 1,
        benchmark_scope: 'system',
        git_commit_sha: 'c903b11',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 83.5,
            oom_headroom_concurrency: 48,
            queue_dwell_p99_ms: 8.5,
        },
        verification_status: 'verified',
        created_at: '2026-08-04T09:30:00Z',
        reproduction_command:
            'python3 -m sglang.launch_server --model-path meta-llama/Llama-3.1-70B-Instruct-AWQ --tp 8 --kv-cache-dtype fp8_e5m2',
    },
    {
        id: 'recipe-deepseek-r1-h100-llmd',
        recipe_name: 'llm-d Disaggregated P/D + Wide EP (32x H100)',
        model_name: 'deepseek-ai/DeepSeek-R1',
        model_family: 'DeepSeek R1 671B',
        author: {
            username: 'marcus_k',
            display_name: 'Marcus K.',
            github_id: 'mk-distrib',
            team: 'llm-d Systems',
        },
        hardware_summary: '32x NVIDIA H100 (4x A3 Nodes)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 32,
            machine_type: '4x a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'llm-d',
            engine_version: 'v0.4.2',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            expert_parallel_size: 4,
            replicas: 4,
            routing: 'kv-disagg-router',
            pd_disaggregation: true,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: {
                enabled: true,
                draft_model: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
                num_speculative_tokens: 3,
            },
        },
        container_image: 'ghcr.io/llm-d/llm-d:v0.4.2',
        well_lit_path: 'pd-disaggregation',
        workload: {
            input_tokens: 2048,
            output_tokens: 2048,
            concurrency: 128,
            target_qps: 18.0,
            dataset_name: 'Reasoning Bench 2k',
        },
        metrics: {
            ttft_ms: { mean: 58.0, p50: 52.0, p90: 78.0, p99: 108.0 },
            itl_ms: { mean: 16.8, p50: 15.8, p90: 21.0, p99: 27.5 },
            output_tokens_per_sec: { mean: 4470, p50: 4550, p90: 4700 },
            total_tokens_per_sec: { mean: 8940, p50: 9100, p90: 9400 },
            prefix_cache_hit_rate_pct: 76.5,
            kv_cache_usage_pct: 88.0,
        },
        reproductions: [
            {
                id: 'repro-dsr1-1',
                author: 'rajithal',
                date: '2026-08-21',
                hardware_summary: '32x NVIDIA H100 (4x a3-highgpu-8g)',
                delta_pct: -1.5,
                report_url: 'https://github.com/llm-d/llm-d/pull/189',
            },
            {
                id: 'repro-dsr1-2',
                author: 'kswain-ai',
                date: '2026-08-24',
                hardware_summary: '32x NVIDIA H100 (4x a3-highgpu-8g)',
                delta_pct: 0.9,
            },
            {
                id: 'repro-dsr1-3',
                author: 'shorgan-gcp',
                date: '2026-08-27',
                hardware_summary: '32x NVIDIA H100 (4x a3-highgpu-8g)',
                delta_pct: -0.6,
            },
        ],
        reproduced_count: 3,
        benchmark_scope: 'system',
        git_commit_sha: '7f91a0c',
        git_branch: 'feat/deepseek-moe-ep',
        pull_request_url: 'https://github.com/llm-d/llm-d/pull/189',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'DeepSeek Tokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 89.2,
            oom_headroom_concurrency: 160,
            queue_dwell_p99_ms: 12.0,
        },
        verification_status: 'verified',
        created_at: '2026-08-19T16:45:00Z',
        reproduction_command:
            'llmd-dist-serve --model deepseek-ai/DeepSeek-R1 --tp 8 --ep 4 --disaggregated-prefill --nodes 4',
    },
    {
        id: 'recipe-mistral-large-a100-vllm',
        recipe_name: 'vLLM Chunked Prefill FP8 (8x A100)',
        model_name: 'mistralai/Mistral-Large-Instruct-2411',
        model_family: 'Mistral Large',
        author: {
            username: 'sarah_m',
            display_name: 'Sarah Miller',
            github_id: 'smiller-ml',
            team: 'Enterprise SA',
        },
        hardware_summary: '8x NVIDIA A100 (80GB) SXM4',
        hardware: {
            accelerator_type: 'nvidia-a100-80gb',
            accelerator_count: 8,
            machine_type: 'a2-ultragpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'vllm',
            engine_version: 'v0.6.2',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'round-robin',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'auto',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'vllm/vllm-openai:v0.6.2',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 32,
            target_qps: 5.5,
            dataset_name: 'Code Generation',
        },
        metrics: {
            ttft_ms: { mean: 64.0, p50: 58.0, p90: 86.0, p99: 118.0 },
            itl_ms: { mean: 24.8, p50: 23.5, p90: 30.2, p99: 39.0 },
            output_tokens_per_sec: { mean: 820, p50: 840, p90: 880 },
            total_tokens_per_sec: { mean: 2460, p50: 2520, p90: 2640 },
            prefix_cache_hit_rate_pct: 79.2,
            kv_cache_usage_pct: 69.0,
        },
        reproductions: [
            {
                id: 'repro-mistral-1',
                author: 'arivera-ai',
                date: '2026-08-11',
                hardware_summary: '8x NVIDIA A100 80GB (a2-ultragpu-8g)',
                delta_pct: 1.8,
            },
        ],
        reproduced_count: 1,
        benchmark_scope: 'system',
        git_commit_sha: 'b819f03',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'MistralTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 72.0,
            oom_headroom_concurrency: 64,
            queue_dwell_p99_ms: 5.1,
        },
        verification_status: 'community_validated',
        created_at: '2026-08-07T10:15:00Z',
        reproduction_command:
            'vllm serve mistralai/Mistral-Large-Instruct-2411 --tp 8 --enable-prefix-caching',
    },
    {
        id: 'recipe-qwen-72b-v5e-tpu',
        recipe_name: 'llm-d KV Offload + Prefix Cache (8x TPU v5e)',
        model_name: 'Qwen/Qwen2.5-72B-Instruct',
        model_family: 'Qwen 2.5 72B',
        author: {
            username: 'devon_k',
            display_name: 'Devon King',
            github_id: 'dking-ai',
            team: 'Field Engineering',
        },
        hardware_summary: '8x Google TPU v5e (Lite Pod)',
        hardware: {
            accelerator_type: 'tpu-v5e',
            accelerator_count: 8,
            machine_type: 'ct5lp-hightpu-8t',
            cloud_provider: 'gcp',
            region: 'us-east4',
        },
        stack: {
            engine: 'llm-d',
            engine_version: 'v0.4.2',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'prefix-cache-aware',
            pd_disaggregation: false,
            quantization: 'int8',
            kv_cache_dtype: 'int8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'ghcr.io/llm-d/llm-d-tpu:v0.4.2',
        well_lit_path: 'prefix-cache-offloading',
        workload: {
            input_tokens: 4096,
            output_tokens: 512,
            concurrency: 32,
            target_qps: 4.5,
            dataset_name: 'Long-Context RAG 4k',
        },
        metrics: {
            ttft_ms: { mean: 74.0, p50: 68.0, p90: 96.0, p99: 132.0 },
            itl_ms: { mean: 26.2, p50: 25.0, p90: 32.0, p99: 41.0 },
            output_tokens_per_sec: { mean: 310, p50: 318, p90: 340 },
            total_tokens_per_sec: { mean: 2790, p50: 2860, p90: 3060 },
            prefix_cache_hit_rate_pct: 86.0,
            kv_cache_usage_pct: 72.0,
        },
        reproductions: [
            {
                id: 'repro-qwen-v5e-1',
                author: 'chenw-gcp',
                date: '2026-08-16',
                hardware_summary: '8x Google TPU v5e (ct5lp-hightpu-8t)',
                delta_pct: -0.8,
            },
            {
                id: 'repro-qwen-v5e-2',
                author: 'rajithal',
                date: '2026-08-20',
                hardware_summary: '8x Google TPU v5e (ct5lp-hightpu-8t)',
                delta_pct: 1.3,
            },
        ],
        reproduced_count: 2,
        benchmark_scope: 'system',
        git_commit_sha: 'd19842a',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'QwenTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 75.0,
            oom_headroom_concurrency: 64,
            queue_dwell_p99_ms: 6.2,
        },
        verification_status: 'community_validated',
        created_at: '2026-08-14T15:30:00Z',
        reproduction_command:
            'docker run -- privileged -e MODEL=Qwen/Qwen2.5-72B-Instruct -e TP=8 ghcr.io/llm-d/llm-d-tpu:v0.4.2 --quantization int8 --enable-prefix-caching --kv-offload-host-gb 64',
    },
    {
        id: 'recipe-llama3-8b-single-l4',
        recipe_name: 'vLLM Single-L4 FP8 Serving (1x L4)',
        model_name: 'meta-llama/Llama-3.1-8B-Instruct',
        model_family: 'Llama 3.1 8B',
        author: {
            username: 'elena_p',
            display_name: 'Elena Petrova',
            github_id: 'epetrova-cloud',
            team: 'Solutions Architect',
        },
        hardware_summary: '1x NVIDIA L4 (24GB)',
        hardware: {
            accelerator_type: 'nvidia-l4',
            accelerator_count: 1,
            machine_type: 'g2-standard-12',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'vllm',
            engine_version: 'v0.6.3',
            tensor_parallel_size: 1,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'single-replica',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'vllm/vllm-openai:v0.6.3',
        workload: {
            input_tokens: 512,
            output_tokens: 256,
            concurrency: 16,
            target_qps: 3.2,
            dataset_name: 'Chat Bot Standard',
        },
        metrics: {
            // 1x L4 has 300 GB/s memory bandwidth: reading ~8.5 GB of FP8 weights + KV
            // requires ~28.5 ms minimum per decode step; at concurrency 16, TPOT is ~32.5 ms.
            ttft_ms: { mean: 45.0, p50: 42.0, p90: 58.0, p99: 76.0 },
            itl_ms: { mean: 33.8, p50: 32.5, p90: 39.0, p99: 48.0 },
            output_tokens_per_sec: { mean: 185, p50: 190, p90: 202 },
            total_tokens_per_sec: { mean: 555, p50: 570, p90: 606 },
            prefix_cache_hit_rate_pct: 91.5,
            kv_cache_usage_pct: 54.0,
        },
        reproductions: [
            {
                id: 'repro-8b-l4-1',
                author: 'arivera-ai',
                date: '2026-08-12',
                hardware_summary: '1x NVIDIA L4 (g2-standard-12)',
                delta_pct: 0.6,
            },
            {
                id: 'repro-8b-l4-2',
                author: 'smiller-ml',
                date: '2026-08-17',
                hardware_summary: '1x NVIDIA L4 (g2-standard-12)',
                delta_pct: -1.3,
            },
        ],
        reproduced_count: 2,
        benchmark_scope: 'system',
        git_commit_sha: 'f1029aa',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        stability_telemetry: {
            peak_vram_pct: 58.0,
            oom_headroom_concurrency: 32,
            queue_dwell_p99_ms: 2.8,
        },
        verification_status: 'verified',
        created_at: '2026-08-09T18:00:00Z',
        reproduction_command:
            'vllm serve meta-llama/Llama-3.1-8B-Instruct --quantization fp8 --kv-cache-dtype fp8 --enable-prefix-caching',
    },
    {
        id: 'recipe-llama3-70b-h100-llmd-agentic',
        recipe_name: 'llm-d Tool-Use & Prefix-Aware Routing (8x H100)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'rajithal',
            display_name: 'Rajitha L.',
            github_id: 'rajithal',
            team: 'llm-d Core',
            avatar_url: 'https://github.com/rajithal.png',
        },
        hardware_summary: '8x NVIDIA H100 SXM5 (A3 VM)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 8,
            machine_type: 'a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'llm-d',
            engine_version: 'v0.4.2',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'session-prefix-aware',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: {
                enabled: true,
                draft_model: 'meta-llama/Llama-3.1-8B-Instruct',
                num_speculative_tokens: 4,
            },
        },
        container_image: 'ghcr.io/llm-d/llm-d:v0.4.2',
        well_lit_path: 'agentic-serving',
        workload: {
            input_tokens: 4096,
            output_tokens: 512,
            concurrency: 64,
            target_qps: 9.8,
            dataset_name: 'SWE-Bench Agentic Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 44.0, p50: 41.0, p90: 59.0, p99: 82.0 },
            itl_ms: { mean: 15.6, p50: 15.0, p90: 19.4, p99: 25.0 },
            output_tokens_per_sec: { mean: 1680, p50: 1710, p90: 1780 },
            total_tokens_per_sec: { mean: 5160, p50: 5220, p90: 5420 },
            prefix_cache_hit_rate_pct: 92.8,
            kv_cache_usage_pct: 76.0,
        },
        reproductions: [
            {
                id: 'repro-agentic-llmd-1',
                author: 'kswain-ai',
                date: '2026-08-26',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: 0.9,
            },
            {
                id: 'repro-agentic-llmd-2',
                author: 'shorgan-gcp',
                date: '2026-08-28',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: -1.1,
            },
        ],
        reproduced_count: 2,
        benchmark_scope: 'system',
        git_commit_sha: 'a8f3b92',
        git_branch: 'main',
        pull_request_url: 'https://github.com/llm-d/llm-d/pull/154',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        verification_status: 'verified',
        created_at: '2026-08-24T13:15:00Z',
        reproduction_command:
            'docker run --gpus all -e MODEL=meta-llama/Llama-3.1-70B-Instruct -e TP=8 ghcr.io/llm-d/llm-d:v0.4.2 --enable-prefix-caching --routing-policy session-prefix-aware --speculative-model meta-llama/Llama-3.1-8B-Instruct',
    },
    {
        id: 'recipe-llama3-70b-h100-vllm-agentic',
        recipe_name: 'vLLM Round-Robin Agentic Baseline (8x H100)',
        model_name: 'meta-llama/Llama-3.1-70B-Instruct',
        model_family: 'Llama 3.1 70B',
        author: {
            username: 'kellen_s',
            display_name: 'Kellen S.',
            github_id: 'kswain-ai',
            team: 'Serving Benchmarks',
        },
        hardware_summary: '8x NVIDIA H100 SXM5 (A3 VM)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 8,
            machine_type: 'a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'vllm',
            engine_version: 'v0.6.3',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'round-robin',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'vllm/vllm-openai:v0.6.3',
        workload: {
            input_tokens: 4096,
            output_tokens: 512,
            concurrency: 64,
            target_qps: 6.8,
            dataset_name: 'SWE-Bench Agentic Multi-Turn',
        },
        metrics: {
            ttft_ms: { mean: 72.0, p50: 66.0, p90: 98.0, p99: 136.0 },
            itl_ms: { mean: 21.0, p50: 20.2, p90: 26.0, p99: 34.0 },
            output_tokens_per_sec: { mean: 1180, p50: 1200, p90: 1250 },
            total_tokens_per_sec: { mean: 3640, p50: 3700, p90: 3860 },
            prefix_cache_hit_rate_pct: 58.4,
            kv_cache_usage_pct: 84.0,
        },
        reproductions: [
            {
                id: 'repro-agentic-vllm-1',
                author: 'rajithal',
                date: '2026-08-25',
                hardware_summary: '8x NVIDIA H100 SXM5 (a3-highgpu-8g)',
                delta_pct: -0.6,
            },
        ],
        reproduced_count: 1,
        benchmark_scope: 'system',
        git_commit_sha: '9c42e10',
        git_branch: 'release/v0.6.3',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'HuggingFace LlamaTokenizer',
            temp: 0.0,
            seed: 42,
        },
        verification_status: 'verified',
        created_at: '2026-08-23T10:00:00Z',
        reproduction_command:
            'vllm serve meta-llama/Llama-3.1-70B-Instruct --tensor-parallel-size 8 --quantization fp8 --enable-prefix-caching',
    },
    {
        id: 'recipe-deepseek-r1-h100-sglang',
        recipe_name: 'SGLang DeepEP + RadixCache FP8 (32x H100)',
        model_name: 'deepseek-ai/DeepSeek-R1',
        model_family: 'DeepSeek R1 671B',
        author: {
            username: 'alex_fld',
            display_name: 'Alex Rivera',
            github_id: 'arivera-ai',
            team: 'Field Engineering',
        },
        hardware_summary: '32x NVIDIA H100 (4x A3 Nodes)',
        hardware: {
            accelerator_type: 'nvidia-h100-80gb',
            accelerator_count: 32,
            machine_type: '4x a3-highgpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'sglang',
            engine_version: 'v0.4.1',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            expert_parallel_size: 4,
            replicas: 4,
            routing: 'radix-cache',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'lmsysorg/sglang:v0.4.1-cu124',
        workload: {
            input_tokens: 2048,
            output_tokens: 2048,
            concurrency: 128,
            target_qps: 14.5,
            dataset_name: 'Reasoning Bench 2k',
        },
        metrics: {
            ttft_ms: { mean: 74.0, p50: 68.0, p90: 98.0, p99: 138.0 },
            itl_ms: { mean: 20.4, p50: 19.5, p90: 25.4, p99: 33.0 },
            output_tokens_per_sec: { mean: 3680, p50: 3740, p90: 3890 },
            total_tokens_per_sec: { mean: 7360, p50: 7480, p90: 7780 },
            prefix_cache_hit_rate_pct: 71.0,
            kv_cache_usage_pct: 89.5,
        },
        reproductions: [
            {
                id: 'repro-dsr1-sglang-1',
                author: 'mk-distrib',
                date: '2026-08-22',
                hardware_summary: '32x NVIDIA H100 (4x a3-highgpu-8g)',
                delta_pct: 1.2,
            },
        ],
        reproduced_count: 1,
        benchmark_scope: 'system',
        git_commit_sha: '4d19c7b',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'DeepSeek Tokenizer',
            temp: 0.0,
            seed: 42,
        },
        verification_status: 'community_validated',
        created_at: '2026-08-20T14:10:00Z',
        reproduction_command:
            'python3 -m sglang.launch_server --model-path deepseek-ai/DeepSeek-R1 --tp 8 --ep 4 --nnodes 4 --quantization fp8',
    },
    {
        id: 'recipe-qwen-72b-v5e-vllm',
        recipe_name: 'vLLM HBM-Only Prefix Cache Baseline (8x TPU v5e)',
        model_name: 'Qwen/Qwen2.5-72B-Instruct',
        model_family: 'Qwen 2.5 72B',
        author: {
            username: 'chen_tpu_eng',
            display_name: 'Chen W.',
            github_id: 'chenw-gcp',
            team: 'Cloud TPU Solutions',
        },
        hardware_summary: '8x Google TPU v5e (Lite Pod)',
        hardware: {
            accelerator_type: 'tpu-v5e',
            accelerator_count: 8,
            machine_type: 'ct5lp-hightpu-8t',
            cloud_provider: 'gcp',
            region: 'us-east4',
        },
        stack: {
            engine: 'vllm',
            engine_version: 'v0.6.3-tpu',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'round-robin',
            pd_disaggregation: false,
            quantization: 'int8',
            kv_cache_dtype: 'int8',
            prefix_caching: true,
            speculative_decoding: { enabled: false },
        },
        container_image: 'vllm/vllm-tpu:v0.6.3',
        workload: {
            input_tokens: 4096,
            output_tokens: 512,
            concurrency: 32,
            target_qps: 3.1,
            dataset_name: 'Long-Context RAG 4k',
        },
        metrics: {
            ttft_ms: { mean: 104.0, p50: 96.0, p90: 134.0, p99: 178.0 },
            itl_ms: { mean: 31.0, p50: 29.8, p90: 38.0, p99: 49.0 },
            output_tokens_per_sec: { mean: 235, p50: 242, p90: 256 },
            total_tokens_per_sec: { mean: 2120, p50: 2180, p90: 2310 },
            prefix_cache_hit_rate_pct: 52.0,
            kv_cache_usage_pct: 89.0,
        },
        reproductions: [
            {
                id: 'repro-qwen-vllm-1',
                author: 'dking-ai',
                date: '2026-08-18',
                hardware_summary: '8x Google TPU v5e (ct5lp-hightpu-8t)',
                delta_pct: -1.0,
            },
        ],
        reproduced_count: 1,
        benchmark_scope: 'system',
        git_commit_sha: 'e412f80',
        git_branch: 'release/v0.6.3',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'QwenTokenizer',
            temp: 0.0,
            seed: 42,
        },
        verification_status: 'verified',
        created_at: '2026-08-15T11:20:00Z',
        reproduction_command:
            'vllm serve Qwen/Qwen2.5-72B-Instruct --tensor-parallel-size 8 --quantization int8 --enable-prefix-caching',
    },
    {
        id: 'recipe-mistral-large-a100-llmd',
        recipe_name: 'llm-d Prefix-Aware Routing + SpecDecode (8x A100)',
        model_name: 'mistralai/Mistral-Large-Instruct-2411',
        model_family: 'Mistral Large',
        author: {
            username: 'rajithal',
            display_name: 'Rajitha L.',
            github_id: 'rajithal',
            team: 'llm-d Core',
            avatar_url: 'https://github.com/rajithal.png',
        },
        hardware_summary: '8x NVIDIA A100 (80GB) SXM4',
        hardware: {
            accelerator_type: 'nvidia-a100-80gb',
            accelerator_count: 8,
            machine_type: 'a2-ultragpu-8g',
            cloud_provider: 'gcp',
            region: 'us-central1',
        },
        stack: {
            engine: 'llm-d',
            engine_version: 'v0.4.2',
            tensor_parallel_size: 8,
            pipeline_parallel_size: 1,
            replicas: 1,
            routing: 'prefix-cache-aware',
            pd_disaggregation: false,
            quantization: 'fp8',
            kv_cache_dtype: 'fp8',
            prefix_caching: true,
            speculative_decoding: {
                enabled: true,
                draft_model: 'mistralai/Ministral-8B-Instruct-2410',
                num_speculative_tokens: 3,
            },
        },
        container_image: 'ghcr.io/llm-d/llm-d:v0.4.2',
        well_lit_path: 'inference-scheduling',
        workload: {
            input_tokens: 1024,
            output_tokens: 512,
            concurrency: 32,
            target_qps: 7.4,
            dataset_name: 'Code Generation',
        },
        metrics: {
            ttft_ms: { mean: 46.0, p50: 42.0, p90: 62.0, p99: 86.0 },
            itl_ms: { mean: 19.2, p50: 18.4, p90: 23.6, p99: 30.5 },
            output_tokens_per_sec: { mean: 1110, p50: 1130, p90: 1180 },
            total_tokens_per_sec: { mean: 3320, p50: 3390, p90: 3540 },
            prefix_cache_hit_rate_pct: 89.5,
            kv_cache_usage_pct: 66.0,
        },
        reproductions: [
            {
                id: 'repro-mistral-llmd-1',
                author: 'smiller-ml',
                date: '2026-08-19',
                hardware_summary: '8x NVIDIA A100 80GB (a2-ultragpu-8g)',
                delta_pct: 0.7,
            },
            {
                id: 'repro-mistral-llmd-2',
                author: 'arivera-ai',
                date: '2026-08-22',
                hardware_summary: '8x NVIDIA A100 80GB (a2-ultragpu-8g)',
                delta_pct: -1.2,
            },
        ],
        reproduced_count: 2,
        benchmark_scope: 'system',
        git_commit_sha: 'a8f3b92',
        git_branch: 'main',
        fairness_audit: {
            harness: 'inference-perf v0.2',
            identical_harness: true,
            warmup_runs: 5,
            tokenizer: 'MistralTokenizer',
            temp: 0.0,
            seed: 42,
        },
        verification_status: 'verified',
        created_at: '2026-08-17T14:30:00Z',
        reproduction_command:
            'docker run --gpus all -e MODEL=mistralai/Mistral-Large-Instruct-2411 -e TP=8 ghcr.io/llm-d/llm-d:v0.4.2 --enable-prefix-caching --routing-policy prefix-cache-aware',
    },
];

export const SEED_LEADERBOARD_RECIPES = ILLUSTRATIVE_RECIPES.map((recipe) => ({ ...recipe, is_sample: true }));

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const finiteOrNull = (...candidates) => {
    for (const c of candidates) {
        if (isNum(c) && c > 0) return c;
    }
    return null;
};

const LATENCY_PERCENTILES = ['p50', 'p90', 'p99'];

// Samples state one operating point each. Their curves are drawn at lighter
// loads only (lower latency, less throughput), so a sample never shows more
// throughput than the number it states. Measured results never get a curve
// like this: they plot exactly the points that were run.
const SAMPLE_SWEEP_PROFILE = [
    { concMult: 0.125, tpsMult: 0.24, ttftMult: 0.52, itlMult: 0.68 },
    { concMult: 0.25, tpsMult: 0.44, ttftMult: 0.63, itlMult: 0.76 },
    { concMult: 0.5, tpsMult: 0.72, ttftMult: 0.78, itlMult: 0.86 },
    { concMult: 1.0, tpsMult: 1.0, ttftMult: 1.0, itlMult: 1.0, isNominal: true },
];

/**
 * Cost of one operating point. An accelerator without a list price stays
 * unpriced (null) unless you set your own rate, rather than borrowing a
 * placeholder rate that would make its $/1M look real.
 */
export function pointCost(entry, tokensPerSec, customPricing = {}) {
    const accType = entry?.hardware?.accelerator_type || entry?.hardware_summary || '';
    const accId = normalizeAcceleratorId(accType);
    if (accId === 'other' && typeof customPricing?.other !== 'number') {
        return { tokensPerDollar: null, costPer1MTokens: null, hourlyRate: null, isCustomPricing: false, unpriced: true };
    }
    const chips = Math.max(1, entry?.hardware?.accelerator_count || 1);
    const priced = isNum(tokensPerSec) && tokensPerSec > 0;
    const cost = evaluateRecipeCost(accType, chips, priced ? tokensPerSec : 0, customPricing);
    return {
        tokensPerDollar: priced ? cost.tokensPerDollar : null,
        costPer1MTokens: priced ? cost.costPer1MTokens : null,
        hourlyRate: cost.totalHourlyCost,
        isCustomPricing: cost.isCustomPricing,
        unpriced: false,
    };
}

function withPointCost(entry, point, customPricing) {
    const cost = pointCost(entry, point.tokens_per_sec, customPricing);
    return { ...point, tokens_per_dollar: cost.tokensPerDollar, cost_per_1m: cost.costPer1MTokens };
}

function illustrativeSweep(entry) {
    const baseConc = Math.max(1, entry.workload?.concurrency || 64);
    const chips = Math.max(1, entry.hardware?.accelerator_count || 1);
    const scale = (v, m) => (isNum(v) ? Number((v * m).toFixed(1)) : null);
    return SAMPLE_SWEEP_PROFILE.map((step) => {
        const tps = scale(entry.tokens_per_sec, step.tpsMult);
        const pt = {
            concurrency: Math.max(1, Math.round(baseConc * step.concMult)),
            qps: scale(entry.workload?.target_qps, step.tpsMult),
            isNominal: Boolean(step.isNominal),
            illustrative: true,
            measured: false,
            tokens_per_sec: tps,
            tokens_per_sec_per_chip: isNum(tps) ? Number((tps / chips).toFixed(1)) : null,
            output_tokens_per_sec: scale(entry.output_tokens_per_sec, step.tpsMult),
            ttft_mean: step.isNominal ? entry.ttft_mean ?? null : null,
            itl_mean: step.isNominal ? entry.itl_mean ?? null : null,
        };
        LATENCY_PERCENTILES.forEach((pct) => {
            pt[`ttft_${pct}`] = scale(entry[`ttft_${pct}`], step.ttftMult);
            pt[`itl_${pct}`] = scale(entry[`itl_${pct}`], step.itlMult);
        });
        return pt;
    });
}

function singleMeasuredPoint(entry) {
    const pt = {
        concurrency: isNum(entry.workload?.concurrency) ? entry.workload.concurrency : null,
        qps: isNum(entry.workload?.target_qps) ? entry.workload.target_qps : null,
        isNominal: true,
        illustrative: false,
        measured: true,
        tokens_per_sec: entry.tokens_per_sec ?? null,
        tokens_per_sec_per_chip: entry.tokens_per_sec_per_chip ?? null,
        output_tokens_per_sec: entry.output_tokens_per_sec ?? null,
        ttft_mean: entry.ttft_mean ?? null,
        itl_mean: entry.itl_mean ?? null,
    };
    LATENCY_PERCENTILES.forEach((pct) => {
        pt[`ttft_${pct}`] = entry[`ttft_${pct}`] ?? null;
        pt[`itl_${pct}`] = entry[`itl_${pct}`] ?? null;
    });
    return pt;
}

/**
 * The load points a leaderboard entry can be ranked at, each priced:
 *  - a measured sweep (Results Store) keeps exactly the points that were run;
 *  - a run with one measured point keeps that one point, never a made-up curve;
 *  - a sample gets an illustrative curve that tops out at the point it states.
 */
export function buildConcurrencySweep(entry, customPricing = {}) {
    if (!entry) return [];
    const chips = Math.max(1, entry.hardware?.accelerator_count || 1);
    let points;
    if (Array.isArray(entry.sweep_points) && entry.sweep_points.length > 0) {
        points = entry.sweep_points.map((pt) => ({
            ...pt,
            tokens_per_sec_per_chip: isNum(pt.tokens_per_sec_per_chip)
                ? pt.tokens_per_sec_per_chip
                : isNum(pt.tokens_per_sec)
                    ? pt.tokens_per_sec / chips
                    : null,
        }));
    } else if (entry.is_sample) {
        points = illustrativeSweep(entry);
    } else {
        points = [singleMeasuredPoint(entry)];
    }
    return points.map((pt) => withPointCost(entry, pt, customPricing));
}

const ttftAt = (pt, pct) => pt?.[`ttft_${pct}`];
const itlAt = (pt, pct) => pt?.[`itl_${pct}`];

/**
 * Picks the point a run is ranked at:
 *  - with no latency limit, its highest-throughput healthy point;
 *  - with a limit, its highest-throughput point that meets it;
 *  - when no point meets it, the point that comes closest, flagged
 *    `missesSlo` with `reason` 'over-limit', so the row still shows real
 *    numbers from a real load level;
 *  - when the limit's percentile was never recorded, `reason` 'not-recorded'.
 * Points flagged overloaded (by the Results Store's checks) are never picked.
 */
export function selectOperatingPoint(
    sweep = [],
    { maxTtftSla = null, maxTpotSla = null, slaPercentile = DEFAULT_SLA_PERCENTILE } = {}
) {
    const points = (sweep || []).filter(Boolean);
    if (!points.length) return { point: null, missesSlo: false, reason: null };
    const healthy = points.filter((pt) => !pt.overloaded);
    const rankable = healthy.filter((pt) => isNum(pt.tokens_per_sec_per_chip) && pt.tokens_per_sec_per_chip > 0);
    if (!rankable.length) return { point: healthy[0] || points[0], missesSlo: false, reason: null };
    const highest = (pts) => pts.reduce((a, b) => (b.tokens_per_sec_per_chip > a.tokens_per_sec_per_chip ? b : a));

    const hasTtft = isNum(maxTtftSla) && maxTtftSla > 0;
    const hasTpot = isNum(maxTpotSla) && maxTpotSla > 0;
    if (!hasTtft && !hasTpot) return { point: highest(rankable), missesSlo: false, reason: null };

    const pct = normalizePercentile(slaPercentile, DEFAULT_SLA_PERCENTILE);
    const checkable = rankable.filter(
        (pt) => (!hasTtft || isNum(ttftAt(pt, pct))) && (!hasTpot || isNum(itlAt(pt, pct)))
    );
    if (!checkable.length) return { point: highest(rankable), missesSlo: true, reason: 'not-recorded' };

    const within = checkable.filter(
        (pt) => (!hasTtft || ttftAt(pt, pct) <= maxTtftSla) && (!hasTpot || itlAt(pt, pct) <= maxTpotSla)
    );
    if (within.length) return { point: highest(within), missesSlo: false, reason: null };

    const excess = (pt) =>
        Math.max(hasTtft ? ttftAt(pt, pct) / maxTtftSla : 0, hasTpot ? itlAt(pt, pct) / maxTpotSla : 0);
    const closest = checkable.reduce((a, b) => (excess(b) < excess(a) ? b : a));
    return { point: closest, missesSlo: true, reason: 'over-limit' };
}

// Every headline number on a row comes from one point, so a row never mixes
// one load level's throughput with another's latency or concurrency.
function applyOperatingPoint(item, point, { missesSlo = false, reason = null } = {}) {
    if (!point) {
        return { ...item, missesSlo, sloReason: reason, operatingPoint: null, operatingConcurrency: null };
    }
    const pick = (key) => (isNum(point[key]) ? point[key] : null);
    return {
        ...item,
        missesSlo,
        sloReason: reason,
        operatingPoint: point,
        operatingConcurrency: pick('concurrency'),
        tokens_per_sec: pick('tokens_per_sec'),
        tokens_per_sec_per_chip: pick('tokens_per_sec_per_chip'),
        output_tokens_per_sec: pick('output_tokens_per_sec'),
        ttft_mean: pick('ttft_mean'),
        ttft_p50: pick('ttft_p50'),
        ttft_p90: pick('ttft_p90'),
        ttft_p99: pick('ttft_p99'),
        itl_mean: pick('itl_mean'),
        itl_p50: pick('itl_p50'),
        itl_p90: pick('itl_p90'),
        itl_p99: pick('itl_p99'),
        tokens_per_dollar: pick('tokens_per_dollar'),
        cost_per_1m: pick('cost_per_1m'),
        cost_analysis: {
            ...item.cost_analysis,
            cost_per_1m_output_tokens_usd: pick('cost_per_1m'),
            tokens_per_dollar: pick('tokens_per_dollar'),
        },
        metrics: {
            ...item.metrics,
            ttft_ms: { mean: pick('ttft_mean'), p50: pick('ttft_p50'), p90: pick('ttft_p90'), p99: pick('ttft_p99') },
            itl_ms: { mean: pick('itl_mean'), p50: pick('itl_p50'), p90: pick('itl_p90'), p99: pick('itl_p99') },
        },
    };
}

/**
 * Evaluates every entry at the active SLO (maxTtftSla, maxTpotSla at
 * slaPercentile) and sets the numbers it's ranked by from one operating
 * point: `operatingPoint`, `operatingConcurrency`, throughput, latency and
 * cost. Entries with no point inside the SLO stay in the list, flagged
 * `missesSlo` with `sloReason`, so the UI can show them below ranked rows.
 */
export function evaluateDatasetAtSlo(
    dataset = [],
    { maxTtftSla = null, maxTpotSla = null, slaPercentile = DEFAULT_SLA_PERCENTILE } = {}
) {
    return (dataset || []).map((item) => {
        const sweep = Array.isArray(item.sweep_points) && item.sweep_points.length > 0
            ? item.sweep_points
            : buildConcurrencySweep(item);
        const { point, missesSlo, reason } = selectOperatingPoint(sweep, { maxTtftSla, maxTpotSla, slaPercentile });
        return applyOperatingPoint({ ...item, sweep_points: sweep }, point, { missesSlo, reason });
    });
}

// Family names the samples use, matched exactly so another model that only
// shares a size ("Qwen3-8B") never lands in a Llama group.
const KNOWN_MODEL_FAMILIES = [
    [/llama[-_\s.]*3\.1[-_\s.]*70b/i, 'Llama 3.1 70B'],
    [/llama[-_\s.]*3\.1[-_\s.]*8b/i, 'Llama 3.1 8B'],
    [/deepseek[-_\s.]*r1(?![-_\s.]*distill)/i, 'DeepSeek R1 671B'],
    [/mistral[-_\s.]*large/i, 'Mistral Large'],
    [/qwen[-_\s.]*2\.5[-_\s.]*72b/i, 'Qwen 2.5 72B'],
];

const shortModelName = (name) => {
    const s = String(name || '').trim();
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
};

/** The family a run is grouped under: declared, a known family, else its own name. */
export function modelFamilyFor(raw, modelName) {
    if (raw?.model_family) return raw.model_family;
    const hit = KNOWN_MODEL_FAMILIES.find(([rx]) => rx.test(String(modelName || '')));
    return hit ? hit[1] : shortModelName(modelName) || 'Model not recorded';
}

const SHORT_ACCELERATOR_NAMES = {
    'nvidia-h100-80gb': 'H100',
    'nvidia-a100-80gb': 'A100',
    'nvidia-a100-40gb': 'A100 40GB',
    'nvidia-l4': 'L4',
    'tpu-v6e-trillium': 'TPU v6e',
    'tpu-v5e': 'TPU v5e',
};

const boolOrNull = (v) => (typeof v === 'boolean' ? v : null);

/**
 * Normalizes an entry from the samples, a Results Store result or a single
 * run. Never fabricates what a run didn't record: a missing stack, tensor
 * parallelism, prefix-caching setting, dataset, author, region, container
 * image, commit or run date stays null, and the UI says "Not reported".
 */
export function normalizeLeaderboardEntry(raw, customPricing = {}) {
    if (!raw) return null;

    const id = raw.id || raw.run_uid || `run-${Math.random().toString(36).substring(2, 9)}`;
    const modelName = raw.model_name || raw.model || raw.name || 'Model not recorded';
    const modelFamily = modelFamilyFor(raw, modelName);

    const author = raw.author || (raw.submitted_by
        ? { username: raw.submitted_by, display_name: raw.submitted_by, github_id: raw.submitted_by, team: raw.team || null }
        : null);

    const hardwareStr = raw.hardware_summary
        || raw.hardware?.accelerator_type
        || (typeof raw.hardware === 'string' ? raw.hardware : '')
        || raw.accelerator
        || '';
    const declaredAccelerator = normalizeAcceleratorId(raw.hardware?.accelerator_type);
    const acceleratorType = declaredAccelerator !== 'other' ? declaredAccelerator : normalizeAcceleratorId(hardwareStr);
    const acceleratorCount = extractAcceleratorCount(hardwareStr, raw.hardware?.accelerator_count || raw.accelerator_count);

    // Extract metrics without inventing values when missing
    const tps = finiteOrNull(
        raw.tokens_per_sec,
        raw.metrics?.total_tokens_per_sec?.mean,
        raw.metrics?.total_tokens_per_sec?.p50,
        raw.total_tokens_per_sec,
        raw.tokens_out_per_sec,
        raw.tps
    );
    const outTps = finiteOrNull(
        raw.output_tokens_per_sec,
        raw.metrics?.output_tokens_per_sec?.mean,
        raw.metrics?.output_tokens_per_sec?.p50
    );

    const ttftP50 = finiteOrNull(raw.ttft_p50, raw.metrics?.ttft_ms?.p50);
    const ttftMean = finiteOrNull(raw.ttft_mean, raw.metrics?.ttft_ms?.mean);
    const ttftP90 = finiteOrNull(raw.ttft_p90, raw.metrics?.ttft_ms?.p90);
    const ttftP99 = finiteOrNull(raw.ttft_p99, raw.metrics?.ttft_ms?.p99);

    const itlP50 = finiteOrNull(raw.itl_p50, raw.metrics?.itl_ms?.p50);
    const itlMean = finiteOrNull(raw.itl_mean, raw.metrics?.itl_ms?.mean, raw.tpot_mean);
    const itlP90 = finiteOrNull(raw.itl_p90, raw.metrics?.itl_ms?.p90);
    const itlP99 = finiteOrNull(raw.itl_p99, raw.metrics?.itl_ms?.p99);

    const engine = engineKey(raw.stack?.engine || raw.engine);
    const rawRecipeName = raw.recipe_name || raw.label || raw.description || '';
    const cleanedRecipe = String(rawRecipeName)
        .replace(/^(?:llm-d|vllm|sglang|tensorrt-llm)\s+/i, '')
        .replace(/\s*\(\d+\s*[x×]\s*[^)]+\)\s*$/i, '')
        .replace(/\b(?:TPU\s+Trillium|Single-L4)\b\s*/gi, '')
        .replace(/\b(?:FP8|FP16|BF16|AWQ\s+INT4|AWQ|INT4|INT8)\b\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const recipeName = cleanedRecipe && cleanedRecipe.toLowerCase() !== 'serving'
        ? cleanedRecipe
        : String(rawRecipeName).trim() || 'Unnamed setup';
    const workload = raw.workload || {
        input_tokens: raw.input_len ?? null,
        output_tokens: raw.output_len ?? null,
        concurrency: raw.concurrency ?? null,
        dataset_name: raw.dataset_name || null,
    };

    const shortAccName = SHORT_ACCELERATOR_NAMES[acceleratorType];
    const hardwareSummary = shortAccName
        ? `${acceleratorCount}× ${shortAccName}`
        : raw.hardware?.accelerator_label
            ? `${acceleratorCount}× ${raw.hardware.accelerator_label}`
            : hardwareStr || 'Hardware not recorded';

    const hardware = {
        accelerator_type: acceleratorType,
        accelerator_count: acceleratorCount,
        accelerator_label: raw.hardware?.accelerator_label || null,
        machine_type: raw.hardware?.machine_type || null,
        cloud_provider: raw.hardware?.cloud_provider || null,
        region: raw.hardware?.region || null,
    };
    const cost = pointCost({ hardware }, tps, customPricing);

    const entry = {
        id,
        recipe_name: recipeName,
        model_name: modelName,
        model_family: modelFamily,
        author,
        hardware_summary: hardwareSummary,
        hardware,
        stack: {
            engine,
            engine_version: raw.stack?.engine_version || null,
            tensor_parallel_size: raw.stack?.tensor_parallel_size || raw.tp || null,
            pipeline_parallel_size: raw.stack?.pipeline_parallel_size || raw.pp || null,
            expert_parallel_size: raw.stack?.expert_parallel_size || null,
            replicas: raw.stack?.replicas || null,
            routing: raw.stack?.routing || null,
            pd_disaggregation: boolOrNull(raw.stack?.pd_disaggregation),
            quantization: raw.stack?.quantization || raw.quantization || null,
            kv_cache_dtype: raw.stack?.kv_cache_dtype || null,
            prefix_caching: boolOrNull(raw.stack?.prefix_caching),
            speculative_decoding: raw.stack?.speculative_decoding || null,
            launch_args: raw.stack?.launch_args || null,
        },
        container_image: raw.container_image || raw.stack?.container_image || null,
        well_lit_path: raw.well_lit_path || null,
        workload,
        workload_class: classifyWorkload(workload),
        metrics: {
            ttft_ms: { mean: ttftMean, p50: ttftP50, p90: ttftP90, p99: ttftP99 },
            itl_ms: { mean: itlMean, p50: itlP50, p90: itlP90, p99: itlP99 },
            output_tokens_per_sec: {
                mean: outTps,
                p50: finiteOrNull(raw.metrics?.output_tokens_per_sec?.p50, outTps),
                p90: finiteOrNull(raw.metrics?.output_tokens_per_sec?.p90),
            },
            total_tokens_per_sec: {
                mean: tps,
                p50: finiteOrNull(raw.metrics?.total_tokens_per_sec?.p50, tps),
                p90: finiteOrNull(raw.metrics?.total_tokens_per_sec?.p90),
            },
            prefix_cache_hit_rate_pct: finiteOrNull(raw.prefix_cache_hit_rate, raw.metrics?.prefix_cache_hit_rate_pct),
            kv_cache_usage_pct: finiteOrNull(raw.kv_cache_usage, raw.metrics?.kv_cache_usage_pct),
        },
        tokens_per_sec: tps,
        tokens_per_sec_per_chip: tps != null ? tps / Math.max(1, acceleratorCount) : null,
        output_tokens_per_sec: outTps,
        ttft_p50: ttftP50,
        ttft_mean: ttftMean,
        ttft_p90: ttftP90,
        ttft_p99: ttftP99,
        itl_p50: itlP50,
        itl_mean: itlMean,
        itl_p90: itlP90,
        itl_p99: itlP99,
        cost_analysis: {
            hourly_rate_usd: cost.hourlyRate,
            cost_per_1m_output_tokens_usd: cost.costPer1MTokens,
            tokens_per_dollar: cost.tokensPerDollar,
            is_custom_pricing: cost.isCustomPricing,
            unpriced: cost.unpriced,
        },
        tokens_per_dollar: cost.tokensPerDollar,
        cost_per_1m: cost.costPer1MTokens,
        benchmark_scope: raw.benchmark_scope || 'system',
        git_commit_sha: raw.git_commit_sha || null,
        git_branch: raw.git_branch || null,
        pull_request_url: raw.pull_request_url || null,
        fairness_audit: raw.fairness_audit || null,
        stability_telemetry: raw.stability_telemetry || null,
        is_sample: raw.is_sample === true,
        source: raw.source || (raw.is_sample === true ? 'sample' : 'upload'),
        results_store: raw.results_store || null,
        verification_status: raw.verification_status || (raw.is_verified ? 'verified' : 'community_validated'),
        reproduction_command: raw.reproduction_command || null,
        created_at: raw.created_at || null,
    };

    entry.sweep_points = buildConcurrencySweep({ ...entry, sweep_points: raw.sweep_points }, customPricing);
    return entry;
}

/**
 * The entries the Leaderboard ranks: results published from the Results
 * Store, then (when shown) the illustrative samples. Each is normalized once;
 * `evaluateDatasetAtSlo` then picks the point every entry is ranked at.
 */
export function buildLeaderboardDataset({
    seedRecipes = SEED_LEADERBOARD_RECIPES,
    publishedResults = [],
    customPricing = {},
} = {}) {
    return [...(publishedResults || []), ...(seedRecipes || [])]
        .map((item) => normalizeLeaderboardEntry(item, customPricing))
        .filter(Boolean);
}
