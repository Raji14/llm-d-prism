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

import { normalizeAcceleratorId, evaluateRecipeCost, DEFAULT_PRICING_CATALOG } from './pricingEngine.js';
import assert from 'node:assert';

console.log('Running pricingEngine unit tests...');

const expectId = (inputs, id) => inputs.forEach((s) => assert.strictEqual(normalizeAcceleratorId(s), id, `${JSON.stringify(s)} should map to ${id}`));

// 1. TPU7x (Ironwood) is not Trillium, and the catalog has no price for it yet.
expectId(['tpu7x', 'TPU7x', 'tpu7x-standard-8', 'TPU v7x', 'TPU v7', 'Ironwood'], 'other');

// 2. Trillium still matches every way it's written.
expectId(['TPU v6e', 'tpu-v6e-slice', '8x Google TPU v6e (ct6e-standard-8t)', '8x Google TPU v6e (Trillium)', 'Trillium', 'tpu6e'], 'tpu-v6e-trillium');

// 3. An L40 or L40S is not an L4.
expectId(['L40S', 'NVIDIA L40S', 'nvidia-l40s', '8x NVIDIA L40S (48GB)', 'L40'], 'other');

// 4. L4 still matches as its own token, and by its G2 machine type.
expectId(['L4', 'nvidia-l4', 'NVIDIA L4', '1x NVIDIA L4 (g2-standard-12)', '8x NVIDIA L4 (24GB) G2 VM', '8x L4', '8xL4', 'L4x8', 'L4 ×8', 'g2-standard-48'], 'nvidia-l4');

// 5. The rest of the catalog is unchanged.
expectId(['8x NVIDIA H100 SXM5 (a3-highgpu-8g)', 'nvidia-h100-80gb', 'a3-megagpu-8g'], 'nvidia-h100-80gb');
expectId(['8x NVIDIA A100 80GB (a2-ultragpu-8g)', '8x NVIDIA A100 (80GB) SXM4', 'nvidia-a100-80gb'], 'nvidia-a100-80gb');
expectId(['A100', 'a2-highgpu-8g'], 'nvidia-a100-40gb');
expectId(['V100'], 'nvidia-v100');
expectId(['8x Google TPU v5e (ct5lp-hightpu-8t)', '8x Google TPU v5e (Lite Pod)', 'tpu-v5-lite-podslice', 'tpu-v5e'], 'tpu-v5e');
expectId(['TPU v5p', 'tpu-v5p-slice'], 'tpu-v5p');
expectId(['H200', 'B200', 'MI300X', 'Accelerator', '', null, undefined], 'other');

// 6. Costs follow the mapping: a TPU7x or L40S hour no longer costs a v6e or L4 hour.
const v6eRate = DEFAULT_PRICING_CATALOG['tpu-v6e-trillium'].unitRateUsd;
const l4Rate = DEFAULT_PRICING_CATALOG['nvidia-l4'].unitRateUsd;
assert.strictEqual(evaluateRecipeCost('tpu7x', 8, 1000).acceleratorId, 'other');
assert.notStrictEqual(evaluateRecipeCost('tpu7x', 8, 1000).unitHourlyRate, v6eRate);
assert.strictEqual(evaluateRecipeCost('NVIDIA L40S', 1, 1000).acceleratorId, 'other');
assert.notStrictEqual(evaluateRecipeCost('NVIDIA L40S', 1, 1000).unitHourlyRate, l4Rate);
assert.strictEqual(evaluateRecipeCost('8x Google TPU v6e (ct6e-standard-8t)', 8, 1000).unitHourlyRate, v6eRate);
assert.strictEqual(evaluateRecipeCost('1x NVIDIA L4 (g2-standard-12)', 1, 1000).unitHourlyRate, l4Rate);

console.log('All pricingEngine unit tests passed successfully!');
