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

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Logical Stores (decoupled from underlying storage buckets/backends)
// ---------------------------------------------------------------------------

export const StoreBrandSchema = z.enum(['llm-d', 'none']);
export type StoreBrand = z.infer<typeof StoreBrandSchema>;

export const StoreGovernanceSchema = z.object({
    /** Who may view published results in this store. */
    readAccess: z.enum(['anyone', 'authenticated', 'members']).default('anyone'),
    /** Who may ingest/create results in this store. */
    writeAccess: z.enum(['authenticated', 'members', 'approvers']).default('members'),
    /** Whether publishing requires an approver review step. */
    approvalRequired: z.boolean().default(true),
    /** Whether contributors must sign off DCO when publishing. */
    dcoRequired: z.boolean().default(false),
    /** Optional GitHub org whose admins can approve in this store. */
    approverOrg: z.string().optional(),
});
export type StoreGovernance = z.infer<typeof StoreGovernanceSchema>;

export const StoreStorageBackendSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('local'),
        dir: z.string().optional(),
    }),
    z.object({
        type: z.literal('gcs'),
        bucket: z.string().min(1),
        prefix: z.string().default('prism-stores'),
    }),
]);
export type StoreStorageBackend = z.infer<typeof StoreStorageBackendSchema>;

export const StoreConfigSchema = z.object({
    id: z.string().regex(/^[a-z0-9-]+$/, 'Store id must be lowercase alphanumeric and hyphens'),
    name: z.string().min(1),
    description: z.string().optional().default(''),
    brand: StoreBrandSchema.default('none'),
    /** Mark as default target store when publishing from a multi-store UI. */
    defaultTarget: z.boolean().optional().default(false),
    governance: StoreGovernanceSchema.default({
        readAccess: 'anyone',
        writeAccess: 'members',
        approvalRequired: true,
        dcoRequired: false,
    }),
    storage: StoreStorageBackendSchema.default({ type: 'local' }),
});
export type StoreConfig = z.infer<typeof StoreConfigSchema>;

export interface StoreCapabilities {
    canRead: boolean;
    canWrite: boolean;
    canApprove: boolean;
    approvalRequired: boolean;
    dcoRequired: boolean;
}

export interface StorePublicSummary {
    id: string;
    name: string;
    description: string;
    brand: StoreBrand;
    defaultTarget: boolean;
    capabilities: StoreCapabilities;
    stats?: {
        resultCount: number;
        artifactCount: number;
        pendingCount: number;
    };
}

// ---------------------------------------------------------------------------
// Unified Result Envelope (Serving, Storage, Routing, Protocol, Fleet-scale)
// ---------------------------------------------------------------------------

export const ResultDomainSchema = z.enum([
    'serving',
    'routing',
    'kv-cache-storage',
    'protocol',
    'end-to-end',
    'custom',
]);
export type ResultDomain = z.infer<typeof ResultDomainSchema>;

export const ResultStatusSchema = z.enum([
    'draft',
    'in_review',
    'published',
    'needs_changes',
    'declined',
    'superseded',
    'retracted',
]);
export type ResultStatus = z.infer<typeof ResultStatusSchema>;

export const ResultMetricSchema = z.object({
    /** Canonical metric name (e.g. "output_tok_s", "kv_read_gb_s", "protocol_overhead_ms"). */
    name: z.string().min(1),
    /** Optional human-friendly display label. */
    label: z.string().optional(),
    /** Measured numeric value (immutable once stored). */
    value: z.number().finite(),
    /** Unit string (e.g. "tok/s", "ms", "GB/s", "%", "$/1M tok"). */
    unit: z.string().min(1),
    /** Direction used for automatic before/after delta grading. */
    direction: z.enum(['higher_is_better', 'lower_is_better']).default('higher_is_better'),
    /** Marks the headline metric shown on cards and default sort. */
    primary: z.boolean().optional().default(false),
    /** Statistic label when applicable (mean, p50, p90, p99). */
    stat: z.enum(['mean', 'p50', 'p90', 'p99', 'max', 'min']).optional(),
    /** Operating point qualifier (e.g. "TTFT p50 <= 2s", "c=64", "128 nodes"). */
    at: z.string().optional(),
});
export type ResultMetric = z.infer<typeof ResultMetricSchema>;

export const FleetTopologySchema = z.object({
    /** Number of compute/serving/storage nodes in the benchmark cluster. */
    nodes: z.number().int().min(1),
    /** Total accelerator chips across the fleet (e.g. 1024 for 128x 8-H100 nodes). */
    totalAccelerators: z.number().int().min(0).optional(),
    /** Accelerator family (e.g. "H100", "B200", "TPU v6e", "CPU/NVMe"). */
    accelerator: z.string().optional(),
    /** Human-readable topology (e.g. "64P:192D TP4", "128-node NVMe tier", "Wide-EP 32"). */
    topology: z.string().optional(),
    replicas: z.number().int().min(1).optional(),
    prefillReplicas: z.number().int().min(0).optional(),
    decodeReplicas: z.number().int().min(0).optional(),
    interconnect: z.string().optional(),
});
export type FleetTopology = z.infer<typeof FleetTopologySchema>;

export const ResultEvidenceSchema = z.object({
    label: z.string().min(1),
    kind: z.enum(['config', 'log', 'report', 'manifest', 'command', 'link']).default('link'),
    url: z.string().optional(),
    content: z.string().optional(),
});
export type ResultEvidence = z.infer<typeof ResultEvidenceSchema>;

export const ResultLineageSchema = z.object({
    /** Result ID this run was tested against (enables before/after loop). */
    baselineId: z.string().nullable().optional(),
    /** Store ID of the baseline when comparing across stores. */
    baselineStoreId: z.string().nullable().optional(),
    /** Shared group name for an iterative optimization track. */
    experimentGroup: z.string().nullable().optional(),
    /** Explicit variable names changed relative to the baseline. */
    changedVariables: z.array(z.string()).optional().default([]),
    supersedes: z.string().nullable().optional(),
    supersededBy: z.string().nullable().optional(),
});
export type ResultLineage = z.infer<typeof ResultLineageSchema>;

export const LatencyBlockSchema = z.object({
    mean: z.number().nullable().optional(),
    p50: z.number().nullable().optional(),
    p90: z.number().nullable().optional(),
    p99: z.number().nullable().optional(),
});

export const SweepPointSchema = z.object({
    key: z.string().min(1),
    conc: z.number().nullable().optional(),
    rate: z.number().nullable().optional(),
    output: z.number().finite(),
    total: z.number().finite().optional(),
    chips: z.number().nullable().optional(),
    outputPerChip: z.number().nullable().optional(),
    totalPerChip: z.number().nullable().optional(),
    lat: z.object({
        ttft: LatencyBlockSchema.optional(),
        tpot: LatencyBlockSchema.optional(),
        itl: LatencyBlockSchema.optional(),
        e2e: LatencyBlockSchema.optional(),
    }).optional(),
    errRate: z.number().nullable().optional(),
    included: z.boolean().default(true),
    reason: z.string().optional().default(''),
});
export type SweepPoint = z.infer<typeof SweepPointSchema>;

export const VariableValueSchema = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Minimum-friction input envelope for ingesting a result into any logical store.
 * Accepts either generalized domain metrics[] (storage, protocol, routing, custom)
 * or serving sweep points[] (or both).
 */
export const CreateResultInputSchema = z.object({
    title: z.string().min(1, 'title is required'),
    domain: ResultDomainSchema.default('serving'),
    summary: z.string().optional().default(''),
    metrics: z.array(ResultMetricSchema).default([]),
    variables: z.record(z.string(), VariableValueSchema).default({}),
    evidence: z.array(ResultEvidenceSchema).default([]),
    fleet: FleetTopologySchema.optional(),
    lineage: ResultLineageSchema.optional(),
    sweep: z.array(SweepPointSchema).optional(),
    model: z.string().optional(),
    hardware: z.string().optional(),
    workload: z.string().optional(),
    harness: z.string().optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().optional().default(''),
    /** If true, publish immediately (or enter review queue if store requires approval). If false, save as draft. */
    publish: z.boolean().optional().default(true),
    /** DCO sign-off string or object when target store requires DCO. */
    dco: z.object({
        version: z.string().default('1.1'),
        signedBy: z.string().min(1),
        signedAt: z.string().optional(),
    }).optional(),
}).refine(
    (data) => data.metrics.length > 0 || (data.sweep && data.sweep.length > 0),
    {
        message: 'Provide at least one entry in metrics[] or sweep[] so Compare can evaluate outcomes.',
        path: ['metrics'],
    }
);
export type CreateResultInput = z.infer<typeof CreateResultInputSchema>;

/** Mutable fields allowed on PATCH (measured values in metrics[] and sweep[] stay immutable). */
export const PatchResultInputSchema = z.object({
    title: z.string().min(1).optional(),
    summary: z.string().optional(),
    notes: z.string().optional(),
    tags: z.array(z.string()).optional(),
    variables: z.record(z.string(), VariableValueSchema).optional(),
    model: z.string().optional(),
    hardware: z.string().optional(),
    workload: z.string().optional(),
    harness: z.string().optional(),
    fleet: FleetTopologySchema.optional(),
    lineage: ResultLineageSchema.optional(),
    pointToggles: z.array(z.object({
        key: z.string().min(1),
        included: z.boolean(),
        reason: z.string().optional().default(''),
    })).optional(),
}).strict();
export type PatchResultInput = z.infer<typeof PatchResultInputSchema>;

export const ResultHistoryEntrySchema = z.object({
    at: z.string(),
    by: z.string(),
    action: z.string(),
    note: z.string().optional(),
});

export const StoredResultSchema = z.object({
    id: z.string().min(1),
    storeId: z.string().min(1),
    version: z.number().int().min(1).default(1),
    title: z.string().min(1),
    domain: ResultDomainSchema,
    summary: z.string().default(''),
    status: ResultStatusSchema,
    metrics: z.array(ResultMetricSchema),
    variables: z.record(z.string(), VariableValueSchema).default({}),
    evidence: z.array(ResultEvidenceSchema).default([]),
    fleet: FleetTopologySchema.optional(),
    lineage: ResultLineageSchema.default({ changedVariables: [] }),
    sweep: z.array(SweepPointSchema).optional(),
    model: z.string().optional(),
    hardware: z.string().optional(),
    workload: z.string().optional(),
    harness: z.string().optional(),
    tags: z.array(z.string()).default([]),
    notes: z.string().default(''),
    author: z.string(),
    reviewedBy: z.string().nullable().optional(),
    feedback: z.string().nullable().optional(),
    dco: z.object({
        version: z.string(),
        signedBy: z.string(),
        signedAt: z.string(),
    }).nullable().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    publishedAt: z.string().nullable().optional(),
    history: z.array(ResultHistoryEntrySchema).default([]),
});
export type StoredResult = z.infer<typeof StoredResultSchema>;

export const ResultStatusTransitionSchema = z.object({
    action: z.enum(['publish', 'submit_for_review', 'approve', 'request_changes', 'decline', 'retract', 'reopen']),
    feedback: z.string().optional(),
    reason: z.string().optional(),
    dco: z.object({
        version: z.string().default('1.1'),
        signedBy: z.string().min(1),
    }).optional(),
});
export type ResultStatusTransition = z.infer<typeof ResultStatusTransitionSchema>;

// ---------------------------------------------------------------------------
// Composable Artifacts (Declarative Building Blocks + Sandboxed HTML Escape Hatch)
// ---------------------------------------------------------------------------

export const ArtifactBlockSchema = z.discriminatedUnion('type', [
    z.object({
        type: z.literal('markdown'),
        title: z.string().optional(),
        content: z.string().min(1),
    }),
    z.object({
        type: z.literal('delta-summary'),
        title: z.string().optional(),
        candidateId: z.string().min(1),
        baselineId: z.string().min(1),
    }),
    z.object({
        type: z.literal('sweep-chart'),
        title: z.string().optional(),
        resultIds: z.array(z.string().min(1)).min(1),
        latencyMetric: z.enum(['ttft', 'tpot', 'itl', 'e2e']).optional().default('ttft'),
        stat: z.enum(['mean', 'p50', 'p99']).optional().default('p50'),
        perChip: z.boolean().optional().default(false),
    }),
    z.object({
        type: z.literal('metrics-table'),
        title: z.string().optional(),
        resultIds: z.array(z.string().min(1)).min(1),
        baselineId: z.string().optional(),
        showCost: z.boolean().optional().default(false),
        priceAtMs: z.number().optional().default(2000),
    }),
    z.object({
        type: z.literal('fleet-topology'),
        title: z.string().optional(),
        resultIds: z.array(z.string().min(1)).min(1),
    }),
]);
export type ArtifactBlock = z.infer<typeof ArtifactBlockSchema>;

export const CreateArtifactInputSchema = z.object({
    slug: z.string().regex(/^[a-z0-9-]{1,64}$/, 'slug must be 1-64 lowercase alphanumeric characters or hyphens').optional(),
    title: z.string().min(1, 'title is required'),
    description: z.string().optional().default(''),
    kind: z.enum(['blocks', 'html']).default('blocks'),
    /** Provenance links to store Result IDs this artifact is built from. */
    resultIds: z.array(z.string().min(1)).default([]),
    /** Declarative Prism building blocks (used when kind === "blocks"). */
    blocks: z.array(ArtifactBlockSchema).optional(),
    /** Self-contained HTML document rendered inside a sandboxed iframe (used when kind === "html"). */
    html: z.string().max(512 * 1024, 'HTML artifact exceeds 512 KB limit').optional(),
    /** Marks a curated well-lit path artifact (requires store approver permission). */
    curated: z.boolean().optional().default(false),
    /** Optional domain tag for grouping curated artifacts. */
    domain: ResultDomainSchema.optional(),
    tags: z.array(z.string()).default([]),
    generatedBy: z.enum(['human', 'agent']).optional().default('human'),
}).refine(
    (data) => (data.kind === 'blocks' ? (data.blocks && data.blocks.length > 0) : Boolean(data.html && data.html.trim())),
    {
        message: 'Provide blocks[] when kind is "blocks", or html when kind is "html".',
        path: ['blocks'],
    }
);
export type CreateArtifactInput = z.infer<typeof CreateArtifactInputSchema>;

export const StoredArtifactSchema = z.object({
    slug: z.string().min(1),
    storeId: z.string().min(1),
    title: z.string().min(1),
    description: z.string().default(''),
    kind: z.enum(['blocks', 'html']),
    resultIds: z.array(z.string()).default([]),
    blocks: z.array(ArtifactBlockSchema).optional(),
    html: z.string().optional(),
    curated: z.boolean().default(false),
    domain: ResultDomainSchema.optional(),
    tags: z.array(z.string()).default([]),
    generatedBy: z.enum(['human', 'agent']).default('human'),
    author: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
});
export type StoredArtifact = z.infer<typeof StoredArtifactSchema>;

// ---------------------------------------------------------------------------
// Helpers: derive serving metrics from sweep points & export JSON schemas
// ---------------------------------------------------------------------------

export function deriveMetricsFromSweep(sweep: SweepPoint[] = []): ResultMetric[] {
    const included = sweep.filter((p) => p.included !== false);
    if (!included.length) return [];
    const usable = included.filter((p) => {
        const ttft = p.lat?.ttft?.p50 ?? p.lat?.ttft?.mean;
        return typeof ttft === 'number' && ttft > 0 && ttft <= 2000;
    });
    const bestUsable = usable.sort((a, b) => b.output - a.output)[0];
    const peak = [...included].sort((a, b) => b.output - a.output)[0];
    const metrics: ResultMetric[] = [];
    if (bestUsable) {
        metrics.push({
            name: 'output_tok_s_at_ttft_2s',
            label: 'Output at TTFT p50 <= 2s',
            value: Math.round(bestUsable.output * 100) / 100,
            unit: 'tok/s',
            direction: 'higher_is_better',
            primary: true,
            stat: bestUsable.lat?.ttft?.p50 != null ? 'p50' : 'mean',
            at: 'TTFT <= 2s',
        });
    }
    if (peak) {
        metrics.push({
            name: 'peak_output_tok_s',
            label: 'Peak output throughput',
            value: Math.round(peak.output * 100) / 100,
            unit: 'tok/s',
            direction: 'higher_is_better',
            primary: !bestUsable,
        });
        const bestTtft = included
            .map((p) => p.lat?.ttft?.p50 ?? p.lat?.ttft?.mean)
            .filter((v): v is number => typeof v === 'number' && v > 0)
            .sort((a, b) => a - b)[0];
        if (bestTtft != null) {
            metrics.push({
                name: 'best_ttft_ms',
                label: 'Best TTFT',
                value: Math.round(bestTtft * 10) / 10,
                unit: 'ms',
                direction: 'lower_is_better',
                primary: false,
                stat: included.some((p) => p.lat?.ttft?.p50 != null) ? 'p50' : 'mean',
            });
        }
    }
    return metrics;
}

export function slugifyTitle(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return slug || `artifact-${Date.now().toString(36)}`;
}

/** Runtime JSON Schema published at GET /api/schemas/result.json for agents. */
export const RESULT_INPUT_JSON_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PrismStoreResultInput',
    description: 'Minimum-friction envelope for ingesting serving, routing, storage, protocol, or fleet-scale benchmark results into a Prism Result Store.',
    type: 'object',
    required: ['title'],
    properties: {
        title: { type: 'string', description: 'Human-readable result title.' },
        domain: {
            type: 'string',
            enum: ['serving', 'routing', 'kv-cache-storage', 'protocol', 'end-to-end', 'custom'],
            default: 'serving',
        },
        summary: { type: 'string' },
        metrics: {
            type: 'array',
            description: 'Structured numeric outcomes used for before/after comparison deltas.',
            items: {
                type: 'object',
                required: ['name', 'value', 'unit'],
                properties: {
                    name: { type: 'string' },
                    label: { type: 'string' },
                    value: { type: 'number' },
                    unit: { type: 'string' },
                    direction: { type: 'string', enum: ['higher_is_better', 'lower_is_better'], default: 'higher_is_better' },
                    primary: { type: 'boolean' },
                    stat: { type: 'string', enum: ['mean', 'p50', 'p90', 'p99', 'max', 'min'] },
                    at: { type: 'string' },
                },
            },
        },
        variables: {
            type: 'object',
            description: 'Experimental parameters & setup knobs diffed automatically in Compare.',
            additionalProperties: { type: ['string', 'number', 'boolean'] },
        },
        fleet: {
            type: 'object',
            required: ['nodes'],
            properties: {
                nodes: { type: 'integer', minimum: 1 },
                totalAccelerators: { type: 'integer', minimum: 0 },
                accelerator: { type: 'string' },
                topology: { type: 'string' },
                replicas: { type: 'integer', minimum: 1 },
                prefillReplicas: { type: 'integer', minimum: 0 },
                decodeReplicas: { type: 'integer', minimum: 0 },
                interconnect: { type: 'string' },
            },
        },
        lineage: {
            type: 'object',
            properties: {
                baselineId: { type: ['string', 'null'] },
                baselineStoreId: { type: ['string', 'null'] },
                experimentGroup: { type: ['string', 'null'] },
                changedVariables: { type: 'array', items: { type: 'string' } },
                supersedes: { type: ['string', 'null'] },
            },
        },
        evidence: {
            type: 'array',
            items: {
                type: 'object',
                required: ['label'],
                properties: {
                    label: { type: 'string' },
                    kind: { type: 'string', enum: ['config', 'log', 'report', 'manifest', 'command', 'link'] },
                    url: { type: 'string' },
                    content: { type: 'string' },
                },
            },
        },
        sweep: { type: 'array', description: 'Optional multi-load throughput/latency points for serving curves.' },
        model: { type: 'string' },
        hardware: { type: 'string' },
        workload: { type: 'string' },
        harness: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' },
        publish: { type: 'boolean', default: true },
    },
};

/** Runtime JSON Schema published at GET /api/schemas/artifact.json for agents. */
export const ARTIFACT_INPUT_JSON_SCHEMA = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'PrismStoreArtifactInput',
    description: 'Publish a shareable Artifact backed by Prism Result Store IDs: either declarative Prism building blocks (default well-lit path) or a sandboxed HTML visualization.',
    type: 'object',
    required: ['title'],
    properties: {
        slug: { type: 'string', pattern: '^[a-z0-9-]{1,64}$' },
        title: { type: 'string' },
        description: { type: 'string' },
        kind: { type: 'string', enum: ['blocks', 'html'], default: 'blocks' },
        resultIds: { type: 'array', items: { type: 'string' } },
        blocks: {
            type: 'array',
            items: {
                type: 'object',
                required: ['type'],
                properties: {
                    type: { type: 'string', enum: ['markdown', 'delta-summary', 'sweep-chart', 'metrics-table', 'fleet-topology'] },
                },
            },
        },
        html: { type: 'string', maxLength: 524288 },
        curated: { type: 'boolean', default: false },
        domain: { type: 'string', enum: ['serving', 'routing', 'kv-cache-storage', 'protocol', 'end-to-end', 'custom'] },
        tags: { type: 'array', items: { type: 'string' } },
        generatedBy: { type: 'string', enum: ['human', 'agent'], default: 'agent' },
    },
};
