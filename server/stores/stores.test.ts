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

// Run: npx tsx server/stores/stores.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
    CreateArtifactInputSchema,
    CreateResultInputSchema,
    deriveMetricsFromSweep,
    type StoredResult,
} from './schema.ts';
import { listAccessibleStores, loadConfiguredStores, toPublicStoreSummary } from './registry.ts';
import { adapterForStore } from './storage.ts';
import { computeMetricDeltas, diffVariables, rankBaselines } from './baselines.ts';

console.log('Running multi-store & baselines unit tests...');

// 1. Store registry: public default vs internal multi-store vs custom JSON config.
{
    const pub = loadConfiguredStores({ NODE_ENV: 'production' });
    assert.equal(pub.length, 1);
    assert.equal(pub[0].id, 'llm-d');
    assert.equal(pub[0].brand, 'llm-d');

    const internalMulti = loadConfiguredStores({ NODE_ENV: 'production', PRISM_INSTANCE: 'internal', SITE_NAME: 'Google Cloud' });
    assert.equal(internalMulti.length, 2);
    assert.equal(internalMulti[0].id, 'internal');
    assert.equal(internalMulti[0].name, 'Google Cloud');
    assert.equal(internalMulti[0].brand, 'none');
    assert.equal(internalMulti[0].defaultTarget, true);
    assert.equal(internalMulti[1].id, 'llm-d');
    assert.equal(internalMulti[1].brand, 'llm-d');

    const internalNoName = loadConfiguredStores({ NODE_ENV: 'production', PRISM_INSTANCE: 'internal', PRISM_CONNECT_PUBLIC_STORE: 'false' });
    assert.equal(internalNoName.length, 1);
    assert.equal(internalNoName[0].name, 'Result store');
    assert.equal(internalNoName[0].brand, 'none');

    // Public summary never leaks storage backend details (bucket / local dir).
    const summary = toPublicStoreSummary(pub[0], {
        canRead: true,
        canWrite: false,
        canApprove: false,
        approvalRequired: true,
        dcoRequired: true,
    });
    assert.equal('storage' in summary, false);
}

// 2. Permissions govern store visibility — no hardcoded public/private boxes.
{
    const customEnv = {
        NODE_ENV: 'production',
        PRISM_STORES: JSON.stringify([
            {
                id: 'llm-d',
                name: 'llm-d',
                brand: 'llm-d',
                governance: { readAccess: 'anyone', writeAccess: 'members', approvalRequired: true, dcoRequired: true },
            },
            {
                id: 'ubench',
                name: 'Ubench',
                brand: 'none',
                governance: { readAccess: 'members', writeAccess: 'members', approvalRequired: false, dcoRequired: false },
            },
        ]),
    };

    const anonStores = listAccessibleStores({ username: null, permission: 'none' }, customEnv);
    assert.deepEqual(anonStores.map((s) => s.config.id), ['llm-d']);

    const memberStores = listAccessibleStores({ username: 'alice', permission: 'user' }, customEnv);
    assert.deepEqual(memberStores.map((s) => s.config.id), ['llm-d', 'ubench']);
}

// 3. Minimum-friction non-serving (storage & protocol) + fleet-scale result schema.
{
    const storageResult = CreateResultInputSchema.parse({
        title: 'LMCache NVMe KV tiering — 128-node fleet',
        domain: 'kv-cache-storage',
        fleet: { nodes: 128, totalAccelerators: 1024, accelerator: 'H100', topology: '128-node NVMe tier' },
        variables: { kv_tier: 'nvme-raid0', chunk_size_kb: 256, compression: 'none' },
        metrics: [
            { name: 'kv_read_gb_s', label: 'KV read bandwidth', value: 412.5, unit: 'GB/s', direction: 'higher_is_better', primary: true },
            { name: 'cache_hit_ttft_ms', label: 'Cache hit TTFT p50', value: 48.2, unit: 'ms', direction: 'lower_is_better', stat: 'p50' },
        ],
        evidence: [{ label: 'fio + lmcache config', kind: 'config', content: 'chunk_size_kb: 256' }],
    });
    assert.equal(storageResult.domain, 'kv-cache-storage');
    assert.equal(storageResult.fleet?.nodes, 128);

    // Serving sweep auto-derives metrics when metrics[] is omitted.
    const sweepOnly = CreateResultInputSchema.parse({
        title: 'Qwen3-32B 64-node P/D sweep',
        domain: 'serving',
        sweep: [
            { key: 'c=16', conc: 16, output: 14200, lat: { ttft: { p50: 420 } }, included: true },
            { key: 'c=64', conc: 64, output: 38900, lat: { ttft: { p50: 1650 } }, included: true },
            { key: 'c=128', conc: 128, output: 41000, lat: { ttft: { p50: 4900 } }, included: true },
        ],
    });
    const derived = deriveMetricsFromSweep(sweepOnly.sweep);
    assert.equal(derived[0].name, 'output_tok_s_at_ttft_2s');
    assert.equal(derived[0].value, 38900);

    // Empty metrics + empty sweep fails with structured issue.
    const bad = CreateResultInputSchema.safeParse({ title: 'Missing outcomes', domain: 'protocol' });
    assert.equal(bad.success, false);
}

// 4. Baseline discovery & before/after deltas (today's after = tomorrow's before).
{
    const base: StoredResult = {
        id: 'res-base',
        storeId: 'internal',
        version: 1,
        title: 'A2I protocol v1 baseline (64 nodes)',
        domain: 'protocol',
        summary: '',
        status: 'published',
        metrics: [
            { name: 'protocol_overhead_ms', label: 'Protocol overhead p99', value: 18.4, unit: 'ms', direction: 'lower_is_better', primary: true },
            { name: 'goodput_rps', label: 'Fleet goodput', value: 2400, unit: 'req/s', direction: 'higher_is_better', primary: false },
        ],
        variables: { protocol: 'http2', batching: 'static', compression: 'gzip' },
        evidence: [],
        fleet: { nodes: 64, totalAccelerators: 512, accelerator: 'H100' },
        lineage: { experimentGroup: 'a2i-proto', changedVariables: [] },
        tags: [],
        notes: '',
        author: 'alice',
        createdAt: '2026-11-20T00:00:00Z',
        updatedAt: '2026-11-20T00:00:00Z',
        publishedAt: '2026-11-20T00:00:00Z',
        history: [],
    };

    const candidate: StoredResult = {
        ...base,
        id: 'res-cand',
        title: 'A2I protocol v2 gRPC streaming (64 nodes)',
        variables: { protocol: 'grpc-stream', batching: 'static', compression: 'gzip' },
        metrics: [
            { name: 'protocol_overhead_ms', label: 'Protocol overhead p99', value: 6.2, unit: 'ms', direction: 'lower_is_better', primary: true },
            { name: 'goodput_rps', label: 'Fleet goodput', value: 3120, unit: 'req/s', direction: 'higher_is_better', primary: false },
        ],
        lineage: { experimentGroup: 'a2i-proto', changedVariables: ['protocol'] },
    };

    const unrelated: StoredResult = {
        ...base,
        id: 'res-other',
        domain: 'kv-cache-storage',
        lineage: { experimentGroup: 'storage-x', changedVariables: [] },
        variables: { kv_tier: 's3' },
    };

    const ranked = rankBaselines(candidate, [unrelated, base]);
    assert.equal(ranked[0].result.id, 'res-base');
    assert.match(ranked[0].summary, /Testing protocol: http2 → grpc-stream/);

    const diffs = diffVariables(base, candidate);
    assert.equal(diffs.length, 1);
    assert.equal(diffs[0].key, 'protocol');

    const deltas = computeMetricDeltas(base, candidate);
    assert.equal(deltas[0].name, 'protocol_overhead_ms');
    assert.equal(deltas[0].verdict, 'better');
    assert.ok(deltas[0].deltaPct < -60);
    assert.equal(deltas[1].verdict, 'better');
    assert.ok(deltas[1].deltaPct > 29);
}

// 5. Artifact schema (declarative blocks + sandboxed HTML) & local adapter persistence.
{
    const blocksArtifact = CreateArtifactInputSchema.parse({
        title: 'A2I Protocol v2 Fleet Study',
        kind: 'blocks',
        resultIds: ['res-base', 'res-cand'],
        blocks: [
            { type: 'markdown', content: 'Switching to gRPC streaming cut p99 protocol overhead by 66%.' },
            { type: 'delta-summary', candidateId: 'res-cand', baselineId: 'res-base' },
            { type: 'fleet-topology', resultIds: ['res-base', 'res-cand'] },
        ],
        generatedBy: 'agent',
    });
    assert.equal(blocksArtifact.kind, 'blocks');

    const htmlArtifact = CreateArtifactInputSchema.parse({
        title: 'Custom Interactive Heat Map',
        kind: 'html',
        resultIds: ['res-cand'],
        html: '<!doctype html><html><body><h1>Fleet Heat Map</h1></body></html>',
        generatedBy: 'agent',
    });
    assert.equal(htmlArtifact.kind, 'html');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prism-store-test-'));
    try {
        const store = loadConfiguredStores({ NODE_ENV: 'development' })[0];
        const adapter = adapterForStore({ ...store, storage: { type: 'local', dir: tmpDir } });
        const now = new Date().toISOString();
        await adapter.saveArtifact({
            slug: 'a2i-v2',
            storeId: store.id,
            title: blocksArtifact.title,
            description: '',
            kind: 'blocks',
            resultIds: blocksArtifact.resultIds,
            blocks: blocksArtifact.blocks,
            curated: true,
            tags: ['protocol'],
            generatedBy: 'agent',
            author: 'agent-bot',
            createdAt: now,
            updatedAt: now,
        });
        const loaded = await adapter.getArtifact('a2i-v2');
        assert.equal(loaded?.title, 'A2I Protocol v2 Fleet Study');
        assert.equal((await adapter.listArtifacts()).length, 1);
    } finally {
        await fs.rm(tmpDir, { recursive: true, force: true });
    }
}

console.log('stores: all tests passed');
