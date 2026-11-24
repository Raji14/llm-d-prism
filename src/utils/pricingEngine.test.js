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

import {
    normalizeAcceleratorId,
    evaluateRecipeCost,
    DEFAULT_PRICING_CATALOG,
    calculateDiscountedRates,
    ratesForPreset,
    presetForRates,
    normalizePricingSelection,
    pricingToParam,
    pricingFromParam,
    pricingLabelFor,
    loadPricingSelection,
    savePricingSelection,
    pricingParamForUrl,
    withPricingParam,
} from './pricingEngine.js';
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

// 7. TPU v6e is priced at its on-demand list price; the CUD presets discount it.
assert.strictEqual(v6eRate, 2.7, 'TPU v6e on-demand list price is $2.70 per chip-hour');
assert.strictEqual(DEFAULT_PRICING_CATALOG['tpu-v6e-trillium'].baseNodeRateUsd, 2.7 * 4);
assert.strictEqual(ratesForPreset('cud_3yr')['tpu-v6e-trillium'], 1.215);
assert.strictEqual(ratesForPreset('cud_1yr')['tpu-v6e-trillium'], 1.701);

// 8. Presets are recognised from their rates; anything else is custom.
assert.strictEqual(presetForRates({}), 'on_demand');
assert.strictEqual(presetForRates(calculateDiscountedRates(37)), 'cud_1yr');
assert.strictEqual(presetForRates(calculateDiscountedRates(55)), 'cud_3yr');
assert.strictEqual(presetForRates({ 'nvidia-h100-80gb': 3.67 }), 'on_demand', 'a list rate changes nothing');
assert.strictEqual(presetForRates({ 'nvidia-h100-80gb': 2.5 }), 'custom');
assert.deepStrictEqual(normalizePricingSelection({ preset: 'cud_3yr', rates: { 'nvidia-l4': 9 } }).rates, ratesForPreset('cud_3yr'), 'a preset carries its own rates');

// 9. The pricing URL param: list prices stay out, presets by id, custom rates compactly.
assert.strictEqual(pricingToParam({ preset: 'on_demand' }), null);
assert.strictEqual(pricingToParam({ rates: {} }), null);
assert.strictEqual(pricingToParam({ preset: 'cud_3yr' }), 'cud_3yr');
assert.strictEqual(pricingToParam({ rates: calculateDiscountedRates(65) }), 'spot', 'rates that equal a preset travel as the preset');
const custom = { rates: { 'nvidia-h100-80gb': 2.5, 'nvidia-l4': 0.4, 'tpu-v6e-trillium': 2.7 } };
assert.strictEqual(pricingToParam(custom), 'custom_h100-2.5_l4-0.4', 'only the rates that differ from list prices');
assert.deepStrictEqual(pricingFromParam('custom_h100-2.5_l4-0.4'), { preset: 'custom', rates: { 'nvidia-h100-80gb': 2.5, 'nvidia-l4': 0.4 } });
assert.deepStrictEqual(pricingFromParam('cud_3yr'), { preset: 'cud_3yr', rates: ratesForPreset('cud_3yr') });
assert.deepStrictEqual(pricingFromParam('list'), { preset: 'on_demand', rates: {} });
[null, '', 'bogus', 'custom_', 'custom_zzz-1', 'custom_h100-abc'].forEach((v) => assert.strictEqual(pricingFromParam(v), null, `${v} is unreadable`));

// 10. Labels name the prices in use.
assert.strictEqual(pricingLabelFor({}), 'List prices');
assert.strictEqual(pricingLabelFor({ preset: 'cud_3yr' }), '3-year CUD prices');
assert.strictEqual(pricingLabelFor(custom), 'Custom prices');

// 11. The saved selection keeps its preset, worked out again from today's list prices.
{
    const store = new Map();
    const previous = globalThis.localStorage;
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    try {
        assert.deepStrictEqual(loadPricingSelection(), { preset: 'on_demand', rates: {} }, 'nothing saved: list prices');
        savePricingSelection({ preset: 'cud_3yr' });
        assert.strictEqual(loadPricingSelection().preset, 'cud_3yr');
        // Rates saved before a list-price fix (v6e at the old $1.90 × 0.45).
        store.set('prism_custom_pricing_rates', JSON.stringify({ ...ratesForPreset('cud_3yr'), 'tpu-v6e-trillium': 0.855 }));
        assert.strictEqual(loadPricingSelection().rates['tpu-v6e-trillium'], 1.215);
        savePricingSelection(custom);
        assert.deepStrictEqual(loadPricingSelection(), { preset: 'custom', rates: custom.rates });
    } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
    }
}

// 12. A shared link always names its prices, list prices included; the
//     address bar keeps pricing=list only when the saved prices differ.
{
    const base = 'http://localhost:5173/?view=model-leaderboard&model=Llama+3.1+70B';
    assert.strictEqual(new URL(withPricingParam(base, { preset: 'on_demand' })).searchParams.get('pricing'), 'list');
    assert.strictEqual(new URL(withPricingParam(`${base}&pricing=spot`, { preset: 'cud_3yr' })).searchParams.get('pricing'), 'cud_3yr');
    assert.strictEqual(new URL(withPricingParam(base, custom)).searchParams.get('pricing'), 'custom_h100-2.5_l4-0.4');
    assert.strictEqual(withPricingParam('not a url', { preset: 'cud_3yr' }), 'not a url');
    assert.strictEqual(pricingParamForUrl({ preset: 'on_demand' }, { preset: 'on_demand' }), null, 'list on both: nothing to keep');
    assert.strictEqual(pricingParamForUrl({ preset: 'on_demand' }, custom), 'list', 'list view over saved custom prices: keep it');
    assert.strictEqual(pricingParamForUrl({ preset: 'cud_1yr' }, {}), 'cud_1yr');
}

console.log('All pricingEngine unit tests passed successfully!');
