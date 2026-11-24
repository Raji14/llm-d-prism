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

// Text helpers behind Compare and Reports: short series names for narrow
// places, and a stage's load level for concurrency and request-rate sweeps.
// Run: npx tsx src/components/ResultsStore/exporters.test.js
import assert from 'node:assert';
import { distinctLabels, loadLevelLabel, mdTable, toCsv } from './exporters.js';

// --- distinctLabels: keep only the part of each name that differs (RS-5).
const qwen = (deployment) => `qwen3-32b · H100 ×8 · 7200/1000 · ${deployment} · inference-perf`;
assert.deepStrictEqual(distinctLabels([qwen('standard-k8s'), qwen('precise-prefix-cache-routing'), qwen('predicted-latency-routing')]), [
    'standard-k8s',
    'precise-prefix-cache-routing',
    'predicted-latency-routing',
]);
// Differences in two places keep everything between them.
assert.deepStrictEqual(distinctLabels(['m · H100 ×8 · a · h', 'm · TPU v6e ×4 · b · h']), ['H100 ×8 · a', 'TPU v6e ×4 · b']);
// One name, or none, comes back as it is.
assert.deepStrictEqual(distinctLabels([qwen('standard-k8s')]), [qwen('standard-k8s')]);
assert.deepStrictEqual(distinctLabels([]), []);
// The shortest name always keeps at least one part, so none comes out empty.
assert.deepStrictEqual(distinctLabels(['a · b', 'a · b · c']), ['b', 'b · c']);
// Same names (two batches of one setup) can't be told apart by trimming: whole names.
assert.deepStrictEqual(distinctLabels(['a · x', 'a · x']), ['a · x', 'a · x']);
// Names without separators, and missing names, don't break it.
assert.deepStrictEqual(distinctLabels(['alpha', 'beta']), ['alpha', 'beta']);
assert.deepStrictEqual(distinctLabels([null, 'b']), ['', 'b']);

// --- loadLevelLabel: concurrency sweeps say c=N, request-rate sweeps say N req/s (RS-6).
assert.strictEqual(loadLevelLabel({ conc: 30, rate: 2 }), 'c=30');
assert.strictEqual(loadLevelLabel({ conc: 0 }), 'c=0');
assert.strictEqual(loadLevelLabel({ conc: null, rate: 6.5 }), '6.5 req/s');
assert.strictEqual(loadLevelLabel({ rate: 1 / 3 }), '0.33 req/s');
assert.strictEqual(loadLevelLabel({ rate: 7 }), '7 req/s');
assert.strictEqual(loadLevelLabel({ rate: Number.NaN }), null);
assert.strictEqual(loadLevelLabel({}), null);
assert.strictEqual(loadLevelLabel(null), null);

// --- toCsv / mdTable still escape what spreadsheets and Markdown would misread.
assert.strictEqual(toCsv([{ label: 'Name', get: (r) => r.n }], [{ n: '=SUM(A1)' }, { n: 'a, b' }]), "Name\n'=SUM(A1)\n\"a, b\"");
assert.strictEqual(mdTable(['A', 'B'], [['x|y', 2]], ['l', 'r']), '| A | B |\n| --- | ---: |\n| x\\|y | 2 |');

console.log('exporters: all tests passed');
