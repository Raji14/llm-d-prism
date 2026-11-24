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

// Run: npx tsx src/components/ResultsStore/storeClient.test.js
import assert from 'node:assert/strict';
import {
    computeResultDeltas,
    diffResultVariables,
    fleetLabelOf,
    rankLocalBaselines,
    scaleTierOf,
    signedPct,
    siteChromeBrandForStores,
    storeHeaderBranding,
} from './storeClient.js';

console.log('Running storeClient unit tests...');

// 1. Context-dependent branding rules
const llmdStore = { id: 'llm-d', name: 'llm-d', brand: 'llm-d', description: 'Community store' };
const internalDefault = { id: 'internal', name: 'Result store', brand: 'none', description: 'Internal store' };
const internalNamed = { id: 'google', name: 'Google Cloud', brand: 'none', description: 'Google internal store' };

// Single public llm-d store -> llm-d branding in both site chrome and store header.
assert.equal(siteChromeBrandForStores([llmdStore]), 'llm-d');
assert.equal(storeHeaderBranding([llmdStore], 'all').showLlmdBrand, true);
assert.equal(storeHeaderBranding([llmdStore], 'llm-d').storeBadge, 'llm-d');

// Multi-store (Google + llm-d) -> site chrome stays neutral; llm-d branding only when llm-d store is scoped.
assert.equal(siteChromeBrandForStores([internalNamed, llmdStore]), 'prism');
assert.equal(storeHeaderBranding([internalNamed, llmdStore], 'all').showLlmdBrand, false);
assert.equal(storeHeaderBranding([internalNamed, llmdStore], 'all').title, 'Result store');
assert.equal(storeHeaderBranding([internalNamed, llmdStore], 'all').storeBadge, null);
assert.equal(signedPct(29.54), '+30%');
assert.equal(signedPct(-6.24), '-6.2%');
assert.equal(storeHeaderBranding([internalNamed, llmdStore], 'google').showLlmdBrand, false);
assert.equal(storeHeaderBranding([internalNamed, llmdStore], 'google').title, 'Google Cloud result store');
assert.equal(storeHeaderBranding([internalNamed, llmdStore], 'llm-d').showLlmdBrand, true);

// Single internal store with no custom name -> simply "Result store", no llm-d branding.
assert.equal(siteChromeBrandForStores([internalDefault]), 'prism');
assert.equal(storeHeaderBranding([internalDefault], 'all').showLlmdBrand, false);
assert.equal(storeHeaderBranding([internalDefault], 'all').title, 'Result store');
assert.equal(storeHeaderBranding([internalDefault], 'all').storeBadge, null);

// 2. Fleet scale classification & formatting
assert.equal(scaleTierOf({ fleet: { nodes: 128 } }), 'fleet');
assert.equal(scaleTierOf({ fleet: { nodes: 4 } }), 'multi');
assert.equal(scaleTierOf({ fleet: { nodes: 1 } }), 'single');
assert.equal(fleetLabelOf({ fleet: { nodes: 128, totalAccelerators: 1024, accelerator: 'H100', topology: '32P:96D' } }), '128 nodes · 1,024× H100 · 32P:96D');

// 3. Before/after deltas & baseline ranking
const base = {
    id: 'b1',
    domain: 'kv-cache-storage',
    status: 'published',
    fleet: { nodes: 64 },
    variables: { tier: 'hbm-only', model: 'qwen3-32b' },
    metrics: [
        { name: 'kv_read_gb_s', label: 'KV read', value: 180, unit: 'GB/s', direction: 'higher_is_better', primary: true },
        { name: 'hit_latency_ms', label: 'Hit latency', value: 40, unit: 'ms', direction: 'lower_is_better' },
    ],
};
const cand = {
    id: 'c1',
    domain: 'kv-cache-storage',
    status: 'published',
    fleet: { nodes: 64 },
    variables: { tier: 'nvme-offload', model: 'qwen3-32b' },
    metrics: [
        { name: 'kv_read_gb_s', label: 'KV read', value: 360, unit: 'GB/s', direction: 'higher_is_better', primary: true },
        { name: 'hit_latency_ms', label: 'Hit latency', value: 20, unit: 'ms', direction: 'lower_is_better' },
    ],
};
const diffs = diffResultVariables(base, cand);
assert.equal(diffs.length, 1);
assert.equal(diffs[0].key, 'tier');
const deltas = computeResultDeltas(base, cand);
assert.equal(deltas[0].verdict, 'better');
assert.equal(Math.round(deltas[0].deltaPct), 100);
assert.equal(deltas[1].verdict, 'better');
assert.equal(Math.round(deltas[1].deltaPct), -50);

const ranked = rankLocalBaselines(cand, [base]);
assert.equal(ranked[0].result.id, 'b1');
assert.match(ranked[0].summary, /Testing tier: hbm-only → nvme-offload/);

console.log('storeClient: all tests passed');
