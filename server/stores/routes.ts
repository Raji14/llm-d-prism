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

import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import type { ZodError } from 'zod';
import { validateGitHubToken } from '../oauth.ts';
import type { PermissionLevel } from '../iam.ts';
import {
    ARTIFACT_INPUT_JSON_SCHEMA,
    CreateArtifactInputSchema,
    CreateResultInputSchema,
    PatchResultInputSchema,
    RESULT_INPUT_JSON_SCHEMA,
    ResultStatusTransitionSchema,
    deriveMetricsFromSweep,
    slugifyTitle,
    type StoredArtifact,
    type StoredResult,
} from './schema.ts';
import { listAccessibleStores, toPublicStoreSummary, type CallerContext } from './registry.ts';
import { adapterForStore } from './storage.ts';
import { computeMetricDeltas, diffVariables, rankBaselines } from './baselines.ts';

export const storesRouter = Router();

const IS_PROD = () => process.env.NODE_ENV === 'production';

async function resolveCaller(req: Request): Promise<CallerContext> {
    const token = req.headers['x-prism-github-token'] as string | undefined;
    const devStoreProfile = !IS_PROD()
        ? ((req.headers['x-prism-store-profile'] as string | undefined) || (req.query.stores as string | undefined) || null)
        : null;
    const devRole = !IS_PROD() ? (req.headers['x-prism-dev-role'] as string | undefined) : undefined;

    let username: string | null = null;
    let permission: PermissionLevel = 'none';

    if (token) {
        try {
            const auth = await validateGitHubToken(token);
            username = auth.username;
            permission = auth.permission;
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn('[Stores API] Invalid session token:', msg);
        }
    }

    if (!IS_PROD() && devRole) {
        if (devRole === 'admin') {
            permission = 'admin';
            username = username || 'dev-approver';
        } else if (devRole === 'contributor') {
            permission = 'user';
            username = username || 'dev-contributor';
        } else if (devRole === 'signedout') {
            permission = 'none';
            username = null;
        }
    }

    return { username, permission, devStoreProfile };
}

function validationErrorBody(err: ZodError) {
    return {
        error: 'ValidationError',
        issues: err.issues.map((i) => ({
            path: i.path,
            code: i.code,
            message: i.message,
        })),
    };
}

function primaryMetricValue(result: StoredResult): number {
    const primary = result.metrics.find((m) => m.primary) || result.metrics[0];
    return primary ? primary.value : 0;
}

function filterAndSortResults(
    items: StoredResult[],
    query: Record<string, unknown>,
    caller: CallerContext,
    canApproveByStore: Map<string, boolean>
): StoredResult[] {
    const q = String(query.q || '').trim().toLowerCase();
    const domain = String(query.domain || '').trim().toLowerCase();
    const status = String(query.status || '').trim().toLowerCase();
    const model = String(query.model || '').trim().toLowerCase();
    const hardware = String(query.hardware || '').trim().toLowerCase();
    const workload = String(query.workload || '').trim().toLowerCase();
    const experimentGroup = String(query.experimentGroup || '').trim().toLowerCase();
    const tag = String(query.tag || '').trim().toLowerCase();
    const minNodes = query.minNodes ? Number(query.minNodes) : 0;
    const ownOnly = query.own === 'true' || query.own === '1';
    const sort = String(query.sort || 'newest');
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 250);

    const me = caller.username?.toLowerCase() || null;

    const filtered = items.filter((r) => {
        const isOwner = Boolean(me && r.author.toLowerCase() === me);
        const isApprover = Boolean(canApproveByStore.get(r.storeId));
        // Visibility: published results are readable by anyone with store read access;
        // drafts/needs_changes/declined are visible to owner or approvers; in_review to owner or approvers.
        if (r.status !== 'published' && !isOwner && !isApprover) return false;
        if (ownOnly && !isOwner) return false;
        if (status && r.status !== status) return false;
        if (!status && r.status === 'retracted') return false;
        if (domain && r.domain.toLowerCase() !== domain) return false;
        if (model && !String(r.model || '').toLowerCase().includes(model)) return false;
        if (hardware && !String(r.hardware || r.fleet?.accelerator || '').toLowerCase().includes(hardware)) return false;
        if (workload && !String(r.workload || '').toLowerCase().includes(workload)) return false;
        if (experimentGroup && String(r.lineage?.experimentGroup || '').toLowerCase() !== experimentGroup) return false;
        if (tag && !r.tags.some((t) => t.toLowerCase() === tag)) return false;
        if (minNodes > 0 && (r.fleet?.nodes || 1) < minNodes) return false;
        if (q) {
            const haystack = [
                r.title,
                r.summary,
                r.domain,
                r.model,
                r.hardware,
                r.workload,
                r.harness,
                r.author,
                r.fleet?.topology,
                r.lineage?.experimentGroup,
                ...r.tags,
                ...Object.entries(r.variables || {}).map(([k, v]) => `${k}=${v}`),
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();
            if (!haystack.includes(q)) return false;
        }
        return true;
    });

    filtered.sort((a, b) => {
        if (sort === 'oldest') return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        if (sort === 'metric') return primaryMetricValue(b) - primaryMetricValue(a);
        if (sort === 'nodes') return (b.fleet?.nodes || 1) - (a.fleet?.nodes || 1);
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });

    return filtered.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Runtime Schema Discovery (Agent-native)
// ---------------------------------------------------------------------------

storesRouter.get('/api/schemas', (_req: Request, res: Response) => {
    res.json({
        schemas: [
            { id: 'result', url: '/api/schemas/result.json', description: 'Ingest serving, storage, routing, protocol, or fleet-scale results.' },
            { id: 'artifact', url: '/api/schemas/artifact.json', description: 'Publish declarative block or sandboxed HTML artifacts backed by Result IDs.' },
        ],
    });
});

storesRouter.get('/api/schemas/result.json', (_req: Request, res: Response) => {
    res.json(RESULT_INPUT_JSON_SCHEMA);
});

storesRouter.get('/api/schemas/artifact.json', (_req: Request, res: Response) => {
    res.json(ARTIFACT_INPUT_JSON_SCHEMA);
});

// ---------------------------------------------------------------------------
// Stores Discovery (Logical stores only; permissions filter visibility)
// ---------------------------------------------------------------------------

storesRouter.get('/api/stores', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const accessible = listAccessibleStores(caller);
        const stores = await Promise.all(
            accessible.map(async ({ config, capabilities }) => {
                const adapter = adapterForStore(config);
                const [results, artifacts] = await Promise.all([
                    adapter.listResults().catch(() => []),
                    adapter.listArtifacts().catch(() => []),
                ]);
                const publishedCount = results.filter((r) => r.status === 'published').length;
                const pendingCount = results.filter((r) => r.status === 'in_review').length;
                return toPublicStoreSummary(config, capabilities, {
                    resultCount: publishedCount,
                    artifactCount: artifacts.length,
                    pendingCount: capabilities.canApprove ? pendingCount : 0,
                });
            })
        );
        res.json({ stores });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to list stores', detail: msg });
    }
});

// ---------------------------------------------------------------------------
// Results: Federated & Per-Store Query, Ingestion, Mutation, Review, Baselines
// ---------------------------------------------------------------------------

storesRouter.get('/api/stores/results', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const accessible = listAccessibleStores(caller);
        const storeFilter = String(req.query.storeId || '').trim();
        const targets = storeFilter ? accessible.filter((s) => s.config.id === storeFilter) : accessible;
        const canApproveByStore = new Map(targets.map((s) => [s.config.id, s.capabilities.canApprove]));
        const all = (
            await Promise.all(targets.map(({ config }) => adapterForStore(config).listResults().catch(() => [])))
        ).flat();
        const items = filterAndSortResults(all, req.query as Record<string, unknown>, caller, canApproveByStore);
        res.json({ items, total: items.length, stores: targets.map((s) => s.config.id) });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to query results', detail: msg });
    }
});

// Single-call agent-native before/after comparison across accessible stores.
storesRouter.get('/api/stores/compare', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const accessible = listAccessibleStores(caller);
        const ids = String(req.query.ids || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);
        if (!ids.length) {
            return res.status(400).json({ error: 'Provide ?ids=<id1>,<id2> to compare results.' });
        }

        const all = (
            await Promise.all(accessible.map(({ config }) => adapterForStore(config).listResults().catch(() => [])))
        ).flat();
        const byId = new Map(all.map((r) => [r.id, r]));
        const found = ids.map((id) => byId.get(id)).filter((r): r is StoredResult => Boolean(r));
        if (!found.length) {
            return res.status(404).json({ error: 'None of the requested result IDs were found in accessible stores.' });
        }

        const requestedBase = String(req.query.baseline || '').trim();
        const baseline =
            (requestedBase && found.find((r) => r.id === requestedBase)) ||
            found.find((r) => found.some((other) => other.lineage?.baselineId === r.id)) ||
            found[0];

        const comparisons = found
            .filter((r) => r.id !== baseline.id)
            .map((candidate) => ({
                candidateId: candidate.id,
                candidateTitle: candidate.title,
                candidateStoreId: candidate.storeId,
                variableDiffs: diffVariables(baseline, candidate),
                metricDeltas: computeMetricDeltas(baseline, candidate),
            }));

        res.json({
            baseline: { id: baseline.id, storeId: baseline.storeId, title: baseline.title },
            results: found,
            comparisons,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to compare results', detail: msg });
    }
});

storesRouter.get('/api/stores/:storeId/results', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const all = await adapterForStore(entry.config).listResults();
        const items = filterAndSortResults(
            all,
            req.query as Record<string, unknown>,
            caller,
            new Map([[entry.config.id, entry.capabilities.canApprove]])
        );
        res.json({ items, total: items.length, storeId: entry.config.id });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to list store results', detail: msg });
    }
});

storesRouter.post('/api/stores/:storeId/results', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        if (!entry.capabilities.canWrite) {
            return res.status(403).json({ error: `You do not have permission to write results to "${entry.config.name}".` });
        }

        const parsed = CreateResultInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json(validationErrorBody(parsed.error));
        }
        const input = parsed.data;
        const now = new Date().toISOString();
        const author = caller.username || 'local-user';
        const metrics = input.metrics.length > 0 ? input.metrics : deriveMetricsFromSweep(input.sweep);

        // Enforce DCO when publishing to a store that requires it.
        if (input.publish && entry.capabilities.dcoRequired && !input.dco?.signedBy) {
            return res.status(400).json({
                error: 'ValidationError',
                issues: [{ path: ['dco', 'signedBy'], code: 'custom', message: `Store "${entry.config.name}" requires a DCO sign-off when publishing.` }],
            });
        }

        let status: StoredResult['status'] = 'draft';
        let actionNote = 'Created draft';
        if (input.publish) {
            if (entry.capabilities.approvalRequired && !entry.capabilities.canApprove) {
                status = 'in_review';
                actionNote = 'Submitted for review';
            } else {
                status = 'published';
                actionNote = 'Published';
            }
        }

        const id = crypto.randomUUID();
        const adapter = adapterForStore(entry.config);

        // If superseding a prior result, bump version and retire predecessor when published.
        let version = 1;
        if (input.lineage?.supersedes) {
            const prior = await adapter.getResult(input.lineage.supersedes);
            if (prior) {
                version = prior.version + 1;
                if (status === 'published') {
                    await adapter.saveResult({
                        ...prior,
                        status: 'superseded',
                        lineage: { ...prior.lineage, supersededBy: id },
                        updatedAt: now,
                        history: [...prior.history, { at: now, by: author, action: 'superseded', note: `Superseded by ${id} (v${version})` }],
                    });
                }
            }
        }

        const record: StoredResult = {
            id,
            storeId: entry.config.id,
            version,
            title: input.title,
            domain: input.domain,
            summary: input.summary || '',
            status,
            metrics,
            variables: input.variables || {},
            evidence: input.evidence || [],
            fleet: input.fleet,
            lineage: {
                baselineId: input.lineage?.baselineId ?? null,
                baselineStoreId: input.lineage?.baselineStoreId ?? null,
                experimentGroup: input.lineage?.experimentGroup ?? null,
                changedVariables: input.lineage?.changedVariables ?? [],
                supersedes: input.lineage?.supersedes ?? null,
                supersededBy: null,
            },
            sweep: input.sweep,
            model: input.model,
            hardware: input.hardware || input.fleet?.accelerator,
            workload: input.workload,
            harness: input.harness,
            tags: input.tags || [],
            notes: input.notes || '',
            author,
            reviewedBy: status === 'published' && entry.capabilities.approvalRequired ? author : null,
            feedback: null,
            dco: input.dco ? { version: input.dco.version, signedBy: input.dco.signedBy, signedAt: input.dco.signedAt || now } : null,
            createdAt: now,
            updatedAt: now,
            publishedAt: status === 'published' ? now : null,
            history: [{ at: now, by: author, action: status, note: actionNote }],
        };

        await adapter.saveResult(record);
        res.status(201).json({
            result: record,
            url: `/?view=results-store&store=${encodeURIComponent(entry.config.id)}&result=${encodeURIComponent(id)}`,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to save result', detail: msg });
    }
});

storesRouter.get('/api/stores/:storeId/results/:id', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const result = await adapterForStore(entry.config).getResult(req.params.id);
        if (!result) return res.status(404).json({ error: 'Result not found.' });
        const isOwner = Boolean(caller.username && result.author.toLowerCase() === caller.username.toLowerCase());
        if (result.status !== 'published' && result.status !== 'superseded' && result.status !== 'retracted' && !isOwner && !entry.capabilities.canApprove) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        res.json({ result });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to read result', detail: msg });
    }
});

storesRouter.patch('/api/stores/:storeId/results/:id', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const adapter = adapterForStore(entry.config);
        const existing = await adapter.getResult(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Result not found.' });

        const isOwner = Boolean(caller.username && existing.author.toLowerCase() === caller.username.toLowerCase());
        if (!isOwner && !entry.capabilities.canApprove) {
            return res.status(403).json({ error: 'Only the author or a store approver can update metadata.' });
        }

        const parsed = PatchResultInputSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json(validationErrorBody(parsed.error));
        }

        const patch = parsed.data;
        const now = new Date().toISOString();
        const actor = caller.username || 'local-user';

        // Measured values stay immutable; only point inclusion/exclusion toggles are editable.
        let sweep = existing.sweep;
        if (patch.pointToggles && sweep) {
            const byKey = new Map(patch.pointToggles.map((p) => [p.key, p]));
            sweep = sweep.map((pt) => {
                const toggle = byKey.get(pt.key);
                return toggle ? { ...pt, included: toggle.included, reason: toggle.reason || '' } : pt;
            });
        }

        const updated: StoredResult = {
            ...existing,
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
            ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
            ...(patch.variables !== undefined ? { variables: patch.variables } : {}),
            ...(patch.model !== undefined ? { model: patch.model } : {}),
            ...(patch.hardware !== undefined ? { hardware: patch.hardware } : {}),
            ...(patch.workload !== undefined ? { workload: patch.workload } : {}),
            ...(patch.harness !== undefined ? { harness: patch.harness } : {}),
            ...(patch.fleet !== undefined ? { fleet: patch.fleet } : {}),
            ...(patch.lineage !== undefined ? { lineage: { ...existing.lineage, ...patch.lineage } } : {}),
            ...(sweep ? { sweep } : {}),
            updatedAt: now,
            history: [...existing.history, { at: now, by: actor, action: 'updated', note: 'Updated metadata/labels' }],
        };

        await adapter.saveResult(updated);
        res.json({ result: updated });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to update result', detail: msg });
    }
});

storesRouter.post('/api/stores/:storeId/results/:id/status', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });

        const parsed = ResultStatusTransitionSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(validationErrorBody(parsed.error));

        const adapter = adapterForStore(entry.config);
        const existing = await adapter.getResult(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Result not found.' });

        const { action, feedback, reason, dco } = parsed.data;
        const actor = caller.username || 'local-user';
        const isOwner = Boolean(caller.username && existing.author.toLowerCase() === caller.username.toLowerCase());
        const canApprove = entry.capabilities.canApprove;
        const now = new Date().toISOString();

        let nextStatus: StoredResult['status'] = existing.status;
        let reviewedBy = existing.reviewedBy ?? null;
        let publishedAt = existing.publishedAt ?? null;
        let nextFeedback = existing.feedback ?? null;
        let nextDco = existing.dco ?? null;

        if (action === 'publish' || action === 'submit_for_review') {
            if (!isOwner && !canApprove) return res.status(403).json({ error: 'Only the author or an approver can publish.' });
            if (dco) nextDco = { version: dco.version, signedBy: dco.signedBy, signedAt: now };
            if (entry.capabilities.dcoRequired && !nextDco?.signedBy) {
                return res.status(400).json({ error: 'ValidationError', issues: [{ path: ['dco'], code: 'custom', message: 'DCO sign-off required for this store.' }] });
            }
            if (entry.capabilities.approvalRequired && !canApprove) {
                nextStatus = 'in_review';
            } else {
                nextStatus = 'published';
                publishedAt = now;
                if (entry.capabilities.approvalRequired) reviewedBy = actor;
            }
            nextFeedback = null;
        } else if (action === 'approve') {
            if (!canApprove) return res.status(403).json({ error: 'Approver role required.' });
            nextStatus = 'published';
            reviewedBy = actor;
            publishedAt = now;
            nextFeedback = null;
        } else if (action === 'request_changes') {
            if (!canApprove) return res.status(403).json({ error: 'Approver role required.' });
            nextStatus = 'needs_changes';
            reviewedBy = actor;
            nextFeedback = feedback || reason || 'Changes requested.';
        } else if (action === 'decline') {
            if (!canApprove) return res.status(403).json({ error: 'Approver role required.' });
            nextStatus = 'declined';
            reviewedBy = actor;
            nextFeedback = feedback || reason || 'Declined.';
        } else if (action === 'retract') {
            if (!isOwner && !canApprove) return res.status(403).json({ error: 'Only the author or an approver can retract.' });
            nextStatus = 'retracted';
            nextFeedback = reason || feedback || 'Retracted.';
        } else if (action === 'reopen') {
            if (!isOwner && !canApprove) return res.status(403).json({ error: 'Only the author or an approver can reopen.' });
            nextStatus = 'draft';
        }

        const updated: StoredResult = {
            ...existing,
            status: nextStatus,
            reviewedBy,
            publishedAt,
            feedback: nextFeedback,
            dco: nextDco,
            updatedAt: now,
            history: [...existing.history, { at: now, by: actor, action, note: feedback || reason }],
        };

        await adapter.saveResult(updated);
        res.json({ result: updated });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to update status', detail: msg });
    }
});

storesRouter.get('/api/stores/:storeId/results/:id/baselines', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const accessible = listAccessibleStores(caller);
        const entry = accessible.find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const candidate = await adapterForStore(entry.config).getResult(req.params.id);
        if (!candidate) return res.status(404).json({ error: 'Result not found.' });

        // Federate baseline discovery across all stores the caller can read!
        const pool = (
            await Promise.all(accessible.map(({ config }) => adapterForStore(config).listResults().catch(() => [])))
        ).flat();
        const baselines = rankBaselines(candidate, pool, Math.min(Number(req.query.limit) || 8, 25));
        res.json({ candidateId: candidate.id, baselines });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to discover baselines', detail: msg });
    }
});

storesRouter.delete('/api/stores/:storeId/results/:id', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const adapter = adapterForStore(entry.config);
        const existing = await adapter.getResult(req.params.id);
        if (!existing) return res.status(404).json({ error: 'Result not found.' });
        const isOwner = Boolean(caller.username && existing.author.toLowerCase() === caller.username.toLowerCase());
        if (!isOwner && !entry.capabilities.canApprove) {
            return res.status(403).json({ error: 'Only the author or an approver can delete this result.' });
        }
        await adapter.deleteResult(req.params.id);
        res.json({ deleted: true, id: req.params.id });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to delete result', detail: msg });
    }
});

// ---------------------------------------------------------------------------
// Artifacts: Declarative Building Blocks + Sandboxed HTML Escape Hatch
// ---------------------------------------------------------------------------

storesRouter.get('/api/stores/artifacts', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const accessible = listAccessibleStores(caller);
        const storeFilter = String(req.query.storeId || '').trim();
        const curatedOnly = req.query.curated === 'true' || req.query.curated === '1';
        const resultId = String(req.query.resultId || '').trim();
        const q = String(req.query.q || '').trim().toLowerCase();

        const targets = storeFilter ? accessible.filter((s) => s.config.id === storeFilter) : accessible;
        let items = (
            await Promise.all(targets.map(({ config }) => adapterForStore(config).listArtifacts().catch(() => [])))
        ).flat();

        items = items.filter((a) => {
            if (curatedOnly && !a.curated) return false;
            if (resultId && !a.resultIds.includes(resultId)) return false;
            if (q && ![a.title, a.description, a.slug, a.author, ...(a.tags || [])].join(' ').toLowerCase().includes(q)) return false;
            return true;
        });

        items.sort((a, b) => Number(b.curated) - Number(a.curated) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        res.json({ items, total: items.length });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to list artifacts', detail: msg });
    }
});

storesRouter.get('/api/stores/:storeId/artifacts', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const items = await adapterForStore(entry.config).listArtifacts();
        res.json({ items, total: items.length, storeId: entry.config.id });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to list store artifacts', detail: msg });
    }
});

storesRouter.post('/api/stores/:storeId/artifacts', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        if (!entry.capabilities.canWrite) {
            return res.status(403).json({ error: `You do not have permission to publish artifacts to "${entry.config.name}".` });
        }

        const parsed = CreateArtifactInputSchema.safeParse(req.body);
        if (!parsed.success) return res.status(400).json(validationErrorBody(parsed.error));
        const input = parsed.data;

        if (input.curated && !entry.capabilities.canApprove) {
            return res.status(403).json({ error: 'Only store approvers can mark an artifact as a curated well-lit path.' });
        }

        const adapter = adapterForStore(entry.config);
        const slug = input.slug || slugifyTitle(input.title);
        const existing = await adapter.getArtifact(slug);
        const actor = caller.username || 'local-user';
        if (existing && existing.author.toLowerCase() !== actor.toLowerCase() && !entry.capabilities.canApprove) {
            return res.status(403).json({ error: 'Only the artifact author or a store approver can overwrite this slug.' });
        }

        // Collect all referenced result IDs across top-level and blocks for full provenance.
        const referencedIds = new Set(input.resultIds || []);
        for (const block of input.blocks || []) {
            if (block.type === 'delta-summary') {
                referencedIds.add(block.candidateId);
                referencedIds.add(block.baselineId);
            } else if (block.type === 'sweep-chart' || block.type === 'metrics-table' || block.type === 'fleet-topology') {
                block.resultIds.forEach((id) => referencedIds.add(id));
                if (block.type === 'metrics-table' && block.baselineId) referencedIds.add(block.baselineId);
            }
        }

        const now = new Date().toISOString();
        const artifact: StoredArtifact = {
            slug,
            storeId: entry.config.id,
            title: input.title,
            description: input.description || '',
            kind: input.kind,
            resultIds: [...referencedIds],
            blocks: input.kind === 'blocks' ? input.blocks : undefined,
            html: input.kind === 'html' ? input.html : undefined,
            curated: Boolean(input.curated),
            domain: input.domain,
            tags: input.tags || [],
            generatedBy: input.generatedBy || 'human',
            author: existing?.author || actor,
            createdAt: existing?.createdAt || now,
            updatedAt: now,
        };

        await adapter.saveArtifact(artifact);
        res.status(existing ? 200 : 201).json({
            artifact,
            url: `/?view=results-store&artifact=${encodeURIComponent(`${entry.config.id}/${slug}`)}`,
            apiUrl: `/api/artifacts/${encodeURIComponent(entry.config.id)}/${encodeURIComponent(slug)}`,
        });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to save artifact', detail: msg });
    }
});

storesRouter.get('/api/artifacts/:storeId/:slug', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const accessible = listAccessibleStores(caller);
        const entry = accessible.find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });

        const artifact = await adapterForStore(entry.config).getArtifact(req.params.slug);
        if (!artifact) return res.status(404).json({ error: 'Artifact not found.' });

        // Hydrate referenced results across accessible stores so both UI and agents get full data in 1 call.
        const allResults = (
            await Promise.all(accessible.map(({ config }) => adapterForStore(config).listResults().catch(() => [])))
        ).flat();
        const byId = new Map(allResults.map((r) => [r.id, r]));
        const results = artifact.resultIds.map((id) => byId.get(id)).filter((r): r is StoredResult => Boolean(r));

        res.json({ artifact, results });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to load artifact', detail: msg });
    }
});

storesRouter.delete('/api/stores/:storeId/artifacts/:slug', async (req: Request, res: Response) => {
    try {
        const caller = await resolveCaller(req);
        const entry = listAccessibleStores(caller).find((s) => s.config.id === req.params.storeId);
        if (!entry) return res.status(404).json({ error: `Store "${req.params.storeId}" not found or inaccessible.` });
        const adapter = adapterForStore(entry.config);
        const existing = await adapter.getArtifact(req.params.slug);
        if (!existing) return res.status(404).json({ error: 'Artifact not found.' });
        const actor = caller.username || 'local-user';
        if (existing.author.toLowerCase() !== actor.toLowerCase() && !entry.capabilities.canApprove) {
            return res.status(403).json({ error: 'Only the artifact author or an approver can delete this artifact.' });
        }
        await adapter.deleteArtifact(req.params.slug);
        res.json({ deleted: true, slug: req.params.slug });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        res.status(500).json({ error: 'Failed to delete artifact', detail: msg });
    }
});
