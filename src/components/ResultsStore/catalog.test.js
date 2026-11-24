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

// The Results store's data model: workload labels, accelerator names,
// baseline ranking, check fix labels and the small formatters.
// Run: npx tsx src/components/ResultsStore/catalog.test.js
import assert from 'node:assert';
import { LOADED_AT, buildRuns, fmtFailPct, fmtOnDay, hardwareName, loadChecks, rankBaselines, sameSetup, stripPodCount } from './catalog.js';

// One stage of a benchmark run, as the loaders hand it over.
const entry = ({ runId, isl, osl, cfg = null, model = 'gemma-4-31b-it', hardware = 'H100', conc = 8, output = 1000 }) => ({
    source: 'gcs:test-bucket',
    run_id: runId,
    model_name: model,
    hardware,
    metadata: { accelerator_count: 8 },
    workload: { input_tokens: isl, output_tokens: osl, concurrency: conc },
    metrics: { output_tput: output },
    rawReport: cfg ? { scenario: { load: { metadata: { cfg_id: cfg } } } } : undefined,
});
const workloadOf = (runs, runId) => runs.find((r) => r.runId === runId)?.workload;

// RSP-6: a shared load config id no longer hands a run another load's label.
{
    const runs = buildRuns([
        entry({ runId: 'catalog-run-000001', isl: 31961, osl: 418, cfg: 'cfg-1' }),
        entry({ runId: 'catalog-run-000002', isl: 32010, osl: 421, cfg: 'cfg-1' }),
        entry({ runId: 'catalog-run-000003', isl: 31990, osl: 425, cfg: 'cfg-1' }),
        // An upload that measured about 750/130 under the same cfg_id.
        entry({ runId: 'uploaded-run-00001', isl: 747.3, osl: 128.4, cfg: 'cfg-1' }),
    ]);
    assert.strictEqual(workloadOf(runs, 'catalog-run-000001'), '32000/420', 'catalog runs keep their shared label');
    assert.strictEqual(workloadOf(runs, 'catalog-run-000003'), '32000/420');
    assert.strictEqual(workloadOf(runs, 'uploaded-run-00001'), '750/130', 'the far-off run gets its own measured label');
}
// Near-equal runs of one load config still share one label.
{
    const runs = buildRuns([
        entry({ runId: 'near-run-0000001', isl: 1000, osl: 300, cfg: 'cfg-2' }),
        entry({ runId: 'near-run-0000002', isl: 1020, osl: 280, cfg: 'cfg-2' }),
    ]);
    assert.strictEqual(workloadOf(runs, 'near-run-0000001'), workloadOf(runs, 'near-run-0000002'), 'drift within the tolerances keeps one label');
}
// Two loads that happen to share a cfg_id, half and half: each keeps its own.
{
    const runs = buildRuns([
        entry({ runId: 'split-run-000001', isl: 1000, osl: 1000, cfg: 'cfg-3' }),
        entry({ runId: 'split-run-000002', isl: 8000, osl: 1000, cfg: 'cfg-3' }),
    ]);
    assert.strictEqual(workloadOf(runs, 'split-run-000001'), '1000/1000');
    assert.strictEqual(workloadOf(runs, 'split-run-000002'), '8000/1000');
}
// Without a cfg_id, runs still group by closeness, per model.
{
    const runs = buildRuns([
        entry({ runId: 'plain-run-000001', isl: 994.76, osl: 290 }),
        entry({ runId: 'plain-run-000002', isl: 1001, osl: 300 }),
        entry({ runId: 'plain-run-000003', isl: 4000, osl: 300 }),
    ]);
    assert.strictEqual(workloadOf(runs, 'plain-run-000001'), workloadOf(runs, 'plain-run-000002'));
    assert.notStrictEqual(workloadOf(runs, 'plain-run-000001'), workloadOf(runs, 'plain-run-000003'));
}

// RS-16: one name per accelerator, as the pricing hints write it.
assert.strictEqual(hardwareName('TPU V6E'), 'TPU v6e');
assert.strictEqual(hardwareName('tpu-v5e'), 'TPU v5e');
assert.strictEqual(hardwareName('TPU7X'), 'TPU7x');
assert.strictEqual(hardwareName('h100'), 'H100');
assert.strictEqual(hardwareName('NVIDIA H100'), 'H100');
assert.strictEqual(hardwareName('mi300x'), 'MI300X');
assert.strictEqual(hardwareName('TPU'), 'TPU', 'a generic name stays generic');
assert.strictEqual(hardwareName('NVIDIA-H100-80GB-HBM3'), 'NVIDIA-H100-80GB-HBM3', 'names it doesn’t know stay as recorded');
assert.strictEqual(buildRuns([entry({ runId: 'tpu-run-00000001', isl: 1000, osl: 1000, hardware: 'TPU V6E' })])[0].hwLabel, 'TPU v6e ×8');
// Deployment labels drop the archive's pod count, and old watch keys still match.
assert.strictEqual(stripPodCount('4: 1P-TP4 3D-TP4'), '1P-TP4 3D-TP4');
assert.strictEqual(stripPodCount('standard-k8s'), 'standard-k8s');
assert.ok(sameSetup('llama|h100 ×16|9999/1000|llm-d-benchmark|4: 3p-tp4 1d-tp4', 'llama|h100 ×16|9999/1000|llm-d-benchmark|3p-tp4 1d-tp4'));
assert.ok(!sameSetup('llama|h100 ×16|9999/1000|llm-d-benchmark|3p-tp4 1d-tp4', 'llama|h100 ×16|9999/1000|llm-d-benchmark|2p-tp4 2d-tp4'));

// RSP-13: the same model ranks first, then the same hardware, then workload.
{
    const target = { model: 'gemma-4-31b-it', accelerator: 'H100', chips: 8, workload: '1000/1000', harness: 'inference-perf', setup: '', engine: '' };
    const options = [
        { id: 'other-model', config: { ...target, model: 'qwen3-32b' } },
        { id: 'same-model-other-chips', config: { ...target, chips: 10, workload: '750/130' } },
        { id: 'same-model-other-hw', config: { ...target, accelerator: 'A100' } },
        { id: 'exact', config: { ...target } },
    ];
    const ranked = rankBaselines(options, target);
    assert.deepStrictEqual(
        ranked.map((o) => o.id),
        ['exact', 'same-model-other-chips', 'same-model-other-hw', 'other-model']
    );
    assert.deepStrictEqual(
        ranked.filter((o) => o.group === 'Closest matches').map((o) => o.id),
        ['exact', 'same-model-other-chips'],
        'closest matches share the model and the hardware'
    );
}

// RSP-9: every fix button names its own point.
{
    const pt = (conc, ttft, output) => ({ key: `p${conc}`, conc, ttft, output });
    const checks = loadChecks([pt(1, 100, 100), pt(8, 150, 700), pt(64, 300, 1000), pt(128, 20000, 1050), pt(256, 50000, 1100)]);
    const labels = checks.filter((c) => c.fix).map((c) => c.fixLabel);
    assert.deepStrictEqual(labels, ['Exclude point c=128', 'Exclude point c=256']);
    const rated = loadChecks([
        { key: 'a', rate: 1, ttft: 100, output: 100 },
        { key: 'b', rate: 5, ttft: 200, output: 900 },
        { key: 'c', rate: 9, ttft: 30000, output: 950 },
    ]);
    assert.deepStrictEqual(rated.filter((c) => c.fix).map((c) => c.fixLabel), ['Exclude point 9 req/s']);
}

// RSP-11: dates read right mid-sentence, and a tiny failure rate isn't 0.0%.
assert.strictEqual(fmtOnDay(LOADED_AT), 'today');
assert.strictEqual(fmtOnDay(LOADED_AT - 24 * 60 * 60 * 1000), 'yesterday');
assert.ok(fmtOnDay(LOADED_AT - 40 * 24 * 60 * 60 * 1000).startsWith('on '));
assert.strictEqual(fmtOnDay(null), '');
assert.strictEqual(fmtFailPct(0.02), '<0.1%');
assert.strictEqual(fmtFailPct(0), '0.0%');
assert.strictEqual(fmtFailPct(5.2), '5.2%');
assert.strictEqual(fmtFailPct(null), '—');

console.log('catalog: all tests passed');
