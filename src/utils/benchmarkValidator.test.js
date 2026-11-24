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

// What the upload wizard is told about a report file: its format, whether it
// records hardware, and one message per problem.
// Run: npx tsx src/utils/benchmarkValidator.test.js
import assert from 'node:assert';
import { mergeValidationMessages, validateBenchmark, validateFormat, validateHardware } from './benchmarkValidator.js';

// A Benchmark Report v0.2 stage: the accelerator sits on the stack component's
// standardized block, as llm-d-benchmark writes it.
const v02Stage = ({ accelerator = { model: 'h100', count: 2 }, outputRate = 1250, latency = 1.7 } = {}) =>
    JSON.stringify({
        version: '0.2',
        run: { uid: 'run-1' },
        scenario: {
            stack: [
                {
                    standardized: {
                        kind: 'inference_engine',
                        tool: 'vllm',
                        role: 'aggregate',
                        model: { name: 'google/gemma-4-31b-it' },
                        ...(accelerator === null ? {} : { accelerator }),
                    },
                },
            ],
            load: { standardized: { tool: 'inference-perf', stage: 0, rate_qps: 1 } },
        },
        results: {
            request_performance: {
                aggregate: {
                    throughput: { output_token_rate: { mean: outputRate }, request_rate: { mean: 1 } },
                    latency: {
                        request_latency: { mean: latency, p50: latency, p99: latency },
                        time_to_first_token: { mean: 0.05, p50: 0.05, p99: 0.08 },
                        time_per_output_token: { mean: 0.012, p50: 0.012, p99: 0.02 },
                    },
                },
            },
        },
    });

// --- validateHardware: v0.2's standardized accelerator counts (RSP-4).
assert.strictEqual(validateHardware({ scenario: { stack: [{ standardized: { accelerator: { model: 'h100' } } }] } }), true, 'standardized.accelerator.model');
assert.strictEqual(validateHardware({ scenario: { stack: [{ standardized: { accelerator: 'TPU v6e' } }] } }), true, 'a plain accelerator name');
assert.strictEqual(validateHardware({ scenario: { stack: [{ config: { accelerator: { model: 'H100' } } }] } }), true, 'older reports: config.accelerator');
assert.strictEqual(validateHardware({ scenario: { stack: [{ config: { machine: { type: 'a3-highgpu-8g' } } }] } }), true, 'older reports: config.machine');
assert.strictEqual(validateHardware({ scenario: { stack: [{ standardized: { accelerator: { model: 'Unknown' } } }] } }), false, '"Unknown" is not hardware');
assert.strictEqual(validateHardware({ scenario: { stack: [{ standardized: { tool: 'vllm' } }] } }), false, 'no accelerator anywhere');
assert.strictEqual(validateHardware({ scenario: {} }), false, 'no stack');
assert.strictEqual(validateHardware({}), false, 'no scenario');
assert.strictEqual(validateHardware(null), false, 'nothing at all');

// --- validateBenchmark on a v0.2 stage: hardware found, so no "missing" warning.
const ok = validateBenchmark(v02Stage(), 'benchmark_report_v0.2_stage_0.json');
assert.strictEqual(ok.format, 'brv02');
assert.strictEqual(ok.hasHardware, true);
assert.deepStrictEqual(ok.errors, []);
assert.ok(!ok.warnings.some((w) => /hardware metadata is missing/i.test(w)), `no hardware warning: ${ok.warnings}`);

const noHw = validateBenchmark(v02Stage({ accelerator: null }), 'stage_0.json');
assert.strictEqual(noHw.hasHardware, false);
assert.ok(noHw.warnings.some((w) => /hardware metadata is missing/i.test(w)), 'a report without an accelerator still warns');

const zero = validateBenchmark(v02Stage({ outputRate: 0 }), 'zero.json');
assert.deepStrictEqual(zero.errors, ['Stage 0 has zero or negative metrics.']);

// --- Files that aren't benchmark reports say why (RSP-3 lists these reasons).
assert.strictEqual(validateFormat('this: is: not: [valid yaml', 'broken.yaml').error, 'Invalid YAML/JSON format');
assert.strictEqual(validateFormat('apiVersion: apps/v1\nkind: Deployment\n', 'deployment.yaml').error, 'Unrecognized benchmark format');
assert.deepStrictEqual(validateBenchmark('apiVersion: apps/v1\nkind: Deployment\n', 'deployment.yaml').errors, ['Unrecognized benchmark format']);

// --- inference-perf errors carry no "[file]" prefix: the wizard adds it once.
const ipZero = validateBenchmark(JSON.stringify({ model: 'm', throughput: 0, latency: 0, metrics: {} }), 'ip.json');
assert.strictEqual(ipZero.format, 'inference-perf');
assert.ok(ipZero.errors.every((e) => !e.startsWith('[')), `no file prefix: ${ipZero.errors}`);

// --- mergeValidationMessages: one message per stage problem (RSP-11).
const fileCheck = ['[stage_0.json] Stage 0 has zero or negative metrics.'];
const runCheck = ['Stage 0 (stage_0.json) has zero or negative metrics.', 'Missing root model_name in upload structure'];
assert.deepStrictEqual(mergeValidationMessages(fileCheck, runCheck), ['[stage_0.json] Stage 0 has zero or negative metrics.', 'Missing root model_name in upload structure']);
// Different files keep their own message.
assert.deepStrictEqual(mergeValidationMessages(['[a.json] Stage 0 has zero or negative metrics.'], ['Stage 0 (b.json) has zero or negative metrics.']).length, 2);
// File names with brackets or parentheses still match.
assert.deepStrictEqual(mergeValidationMessages(['[run (1).json] Stage 3 has zero or negative metrics.'], ['Stage 3 (run (1).json) has zero or negative metrics.']).length, 1);
// inference-perf wording, prefixed by the wizard.
assert.deepStrictEqual(
    mergeValidationMessages(['[ip.json] Stage metrics are zero or negative: throughput=0, latency=0'], ['Stage 0 (ip.json) has zero or negative metrics.']).length,
    1
);
// Exact repeats go, empty entries are skipped, order is kept.
assert.deepStrictEqual(mergeValidationMessages(['b', 'a', '', null], ['a', 'c']), ['b', 'a', 'c']);

console.log('benchmarkValidator: all tests passed');
