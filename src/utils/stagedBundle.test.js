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

// A staged run re-opened in the upload wizard keeps what a fresh upload knew,
// including whether its hardware is recorded (RSP-4).
// Run: npx tsx src/utils/stagedBundle.test.js
import assert from 'node:assert';
import { buildStagedBundle } from './stagedBundle.js';

const stage = (accelerator) => ({
    filename: 'benchmark_report_v0.2_stage_0.json',
    stageIndex: 0,
    runUid: 'run-1',
    rawReport: {
        version: '0.2',
        run: { uid: 'run-1' },
        scenario: {
            stack: [{ standardized: { kind: 'inference_engine', tool: 'vllm', model: { name: 'google/gemma-4-31b-it' }, ...(accelerator ? { accelerator } : {}) } }],
            load: { standardized: { tool: 'inference-perf', stage: 0 } },
        },
        results: {
            request_performance: {
                aggregate: {
                    throughput: { output_token_rate: { mean: 1250 }, request_rate: { mean: 1 } },
                    latency: {
                        request_latency: { mean: 1.7, p50: 1.7, p99: 1.9 },
                        time_to_first_token: { mean: 0.05, p50: 0.05, p99: 0.08 },
                        time_per_output_token: { mean: 0.012, p50: 0.012, p99: 0.02 },
                    },
                },
            },
        },
    },
});
const run = (overrides = {}) => ({ runId: 'r1', runLabel: 'My run', model_name: 'google/gemma-4-31b-it', stages: [stage({ model: 'h100', count: 8 })], ...overrides });

// The report records the accelerator: hardware is known.
const withHw = buildStagedBundle(run());
assert.strictEqual(withHw.validation.hasHardware, true, 'standardized accelerator counts');
assert.strictEqual(withHw.payload.hardware.hardware_name, 'Unknown Hardware', 'no name was given, so the payload says so');

// A known name on the run counts too, even without an accelerator in the report.
assert.strictEqual(buildStagedBundle(run({ hardware: { hardware_name: 'H100' }, stages: [stage(null)] })).validation.hasHardware, true);

// Nothing recorded anywhere: hardware stays unknown.
assert.strictEqual(buildStagedBundle(run({ stages: [stage(null)] })).validation.hasHardware, false);
assert.strictEqual(buildStagedBundle(run({ hardware: { hardware_name: 'Unknown' }, stages: [stage(null)] })).validation.hasHardware, false);

// The rest of the bundle is unchanged: one entry per stage, no errors.
assert.strictEqual(withHw.payload.entries.length, 1);
assert.deepStrictEqual(withHw.validation.errors, []);

console.log('stagedBundle: all tests passed');
