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

// Client & pure domain helpers for the simplified multi-store Results Store.
// Keeps UI decoupled from storage backends (buckets never appear here) and
// implements context-dependent branding, before/after variable & metric deltas,
// fleet scale classification, and catalog-to-result adaptation.

export const RESULT_DOMAINS = [
    { value: 'serving', label: 'Serving' },
    { value: 'routing', label: 'Routing' },
    { value: 'kv-cache-storage', label: 'KV-cache & storage' },
    { value: 'protocol', label: 'Protocol' },
    { value: 'end-to-end', label: 'End-to-end' },
    { value: 'custom', label: 'Custom' },
];

export const DOMAIN_LABELS = Object.fromEntries(RESULT_DOMAINS.map((d) => [d.value, d.label]));

export const SCALE_FILTERS = [
    { value: 'all', label: 'All scales' },
    { value: 'fleet', label: 'Fleet (8+ nodes)' },
    { value: 'multi', label: 'Multi-node (2–7)' },
    { value: 'single', label: 'Single node' },
];

export const domainLabelOf = (domain) => DOMAIN_LABELS[domain] || domain || 'Serving';

export function scaleTierOf(result) {
    const nodes = result?.fleet?.nodes || 1;
    if (nodes >= 8) return 'fleet';
    if (nodes >= 2) return 'multi';
    return 'single';
}

export function fleetLabelOf(result) {
    const f = result?.fleet;
    if (!f) return result?.hardware || null;
    const parts = [];
    if (f.nodes) parts.push(`${f.nodes} node${f.nodes === 1 ? '' : 's'}`);
    if (f.totalAccelerators && f.accelerator) parts.push(`${f.totalAccelerators.toLocaleString()}× ${f.accelerator}`);
    else if (f.accelerator) parts.push(f.accelerator);
    if (f.topology) parts.push(f.topology);
    return parts.join(' · ');
}

export function primaryMetricOf(result) {
    const metrics = result?.metrics || [];
    return metrics.find((m) => m.primary) || metrics[0] || null;
}

export function formatMetricValue(value, unit = '') {
    if (value == null || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    const formatted = Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : Math.abs(n) >= 10 ? n.toFixed(1) : n.toFixed(2);
    return unit ? `${formatted} ${unit}` : formatted;
}

export function signedPct(v) {
    if (v == null || !Number.isFinite(v)) return '—';
    const rounded = Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1);
    return `${v > 0 ? '+' : ''}${rounded}%`;
}

/**
 * Context-dependent branding for the Results Store header:
 * - Public llm-d store (single store or explicitly selected): shows llm-d branding.
 * - Internal / custom store (or federated multi-store view): no llm-d branding;
 *   defaults to "Result store" (or the store's custom name).
 */
export function storeHeaderBranding(stores = [], activeStoreId = 'all') {
    const list = Array.isArray(stores) ? stores : [];
    const active = activeStoreId && activeStoreId !== 'all' ? list.find((s) => s.id === activeStoreId) : null;
    const effective = active || (list.length === 1 ? list[0] : null);

    if (effective?.brand === 'llm-d') {
        return {
            title: 'Result store',
            storeBadge: effective.name || 'llm-d',
            showLlmdBrand: true,
            subtitle: effective.description || 'Fleet-scale benchmarks, before/after baselines, and curated artifacts.',
        };
    }

    if (effective) {
        const customName = effective.name && effective.name.toLowerCase() !== 'result store' ? effective.name : null;
        return {
            title: customName ? `${customName} result store` : 'Result store',
            storeBadge: null,
            showLlmdBrand: false,
            subtitle: effective.description || 'Team benchmarks, experimental baselines, and shareable artifacts.',
        };
    }

    // Federated view across multiple accessible stores: neutral chrome (store switcher below carries the list).
    return {
        title: 'Result store',
        storeBadge: null,
        showLlmdBrand: false,
        subtitle: 'Query across every store you can access, compare before/after runs, and publish artifacts.',
    };
}

/**
 * Determines whether top-level site chrome should wear llm-d branding or stay neutral.
 * Neutral unless the deployment's only/primary store is the public llm-d store.
 */
export function siteChromeBrandForStores(stores = [], fallbackBrand = 'prism') {
    const list = Array.isArray(stores) ? stores : [];
    if (list.length === 1 && list[0].brand === 'llm-d') return 'llm-d';
    if (list.length > 0) return 'prism';
    return fallbackBrand;
}

const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Diffs experimental variables between baseline and candidate results. */
export function diffResultVariables(baseline, candidate) {
    const bVars = baseline?.variables || {};
    const cVars = candidate?.variables || {};
    const keys = new Set([...Object.keys(bVars), ...Object.keys(cVars)]);
    const diffs = [];
    for (const key of keys) {
        if (norm(bVars[key]) !== norm(cVars[key])) {
            diffs.push({ key, baseline: bVars[key], candidate: cVars[key] });
        }
    }
    return diffs;
}

/** Computes signed metric deltas and better/worse verdicts between baseline and candidate. */
export function computeResultDeltas(baseline, candidate) {
    const byName = new Map((baseline?.metrics || []).map((m) => [m.name, m]));
    const deltas = [];
    for (const c of candidate?.metrics || []) {
        const b = byName.get(c.name);
        if (!b || !b.value) continue;
        const delta = c.value - b.value;
        const deltaPct = (delta / Math.abs(b.value)) * 100;
        let verdict = 'neutral';
        if (Math.abs(deltaPct) >= 1) {
            const improved = c.direction === 'lower_is_better' ? delta < 0 : delta > 0;
            verdict = improved ? 'better' : 'worse';
        }
        deltas.push({
            name: c.name,
            label: c.label || c.name,
            unit: c.unit,
            direction: c.direction,
            baselineValue: b.value,
            candidateValue: c.value,
            delta,
            deltaPct,
            verdict,
            primary: Boolean(c.primary || b.primary),
            at: c.at || b.at,
        });
    }
    return deltas.sort((a, b) => Number(b.primary) - Number(a.primary));
}

/** Ranks best baselines locally across a mixed pool of store results + adapted catalog runs. */
export function rankLocalBaselines(candidate, pool = [], limit = 6) {
    if (!candidate) return [];
    const scored = [];
    for (const item of pool) {
        if (!item || item.id === candidate.id) continue;
        if (item.status === 'retracted' || item.status === 'declined') continue;
        let score = 0;
        const matchedOn = [];
        if (candidate.lineage?.baselineId && candidate.lineage.baselineId === item.id) {
            score += 200;
            matchedOn.push('linked baseline');
        }
        if (item.status === 'published') {
            score += 25;
            matchedOn.push('published');
        }
        if (item.domain === candidate.domain) {
            score += 40;
            matchedOn.push(domainLabelOf(item.domain));
        }
        if (candidate.lineage?.experimentGroup && item.lineage?.experimentGroup && norm(item.lineage.experimentGroup) === norm(candidate.lineage.experimentGroup)) {
            score += 50;
            matchedOn.push(`experiment: ${item.lineage.experimentGroup}`);
        }
        if (candidate.model && item.model && norm(item.model) === norm(candidate.model)) {
            score += 25;
            matchedOn.push('model');
        }
        if (candidate.workload && item.workload && norm(item.workload) === norm(candidate.workload)) {
            score += 20;
            matchedOn.push('workload');
        }
        if (candidate.hardware && item.hardware && norm(item.hardware) === norm(candidate.hardware)) {
            score += 15;
            matchedOn.push('hardware');
        }
        if (candidate.fleet?.nodes && item.fleet?.nodes && candidate.fleet.nodes === item.fleet.nodes) {
            score += 20;
            matchedOn.push(`${item.fleet.nodes}-node fleet`);
        }
        const diffs = diffResultVariables(item, candidate);
        const shared = Object.keys(candidate.variables || {}).filter((k) => k in (item.variables || {}) && norm(item.variables[k]) === norm(candidate.variables[k]));
        score += Math.min(shared.length * 6, 24);
        if (diffs.length === 1 && shared.length > 0) score += 18;
        if (computeResultDeltas(item, candidate).length > 0) score += 15;
        if (score <= 0) continue;
        const summary =
            diffs.length === 0
                ? 'Same setup / variables (repeat or regression check)'
                : diffs.length === 1
                  ? `Testing ${diffs[0].key}: ${diffs[0].baseline ?? 'none'} → ${diffs[0].candidate ?? 'none'}`
                  : `${diffs.length} variables differ (${diffs.slice(0, 3).map((d) => d.key).join(', ')})`;
        scored.push({ result: item, score, matchedOn, diffVariables: diffs, summary });
    }
    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * Adapts a BrowseRow from the existing GCS/archive catalog (catalog.js) into
 * the unified StoredResult shape so existing serving sweeps participate in
 * unified search, baseline discovery, Compare, and Artifacts seamlessly.
 */
export function adaptCatalogRowToResult(row, storeId = 'llm-d') {
    if (!row) return null;
    const points = (row.points || []).map((p, idx) => ({
        key: p.key || `pt-${idx}`,
        conc: p.conc ?? null,
        rate: p.rate ?? null,
        output: Number(p.output) || 0,
        total: p.total != null ? Number(p.total) : undefined,
        chips: p.chips ?? null,
        outputPerChip: p.outputPerChip ?? null,
        totalPerChip: p.totalPerChip ?? null,
        lat: p.lat || {},
        errRate: p.errRate ?? null,
        included: p.included !== false,
        reason: p.reason || '',
    }));

    const usablePoints = points.filter((p) => {
        const ttft = p.lat?.ttft?.p50 ?? p.lat?.ttft?.mean;
        return typeof ttft === 'number' && ttft > 0 && ttft <= 2000;
    });
    const bestUsable = [...usablePoints].sort((a, b) => b.output - a.output)[0];
    const peak = [...points].sort((a, b) => b.output - a.output)[0];
    const bestTtft = points
        .map((p) => p.lat?.ttft?.p50 ?? p.lat?.ttft?.mean)
        .filter((v) => typeof v === 'number' && v > 0)
        .sort((a, b) => a - b)[0];

    const metrics = [];
    if (bestUsable) {
        metrics.push({
            name: 'output_tok_s_at_ttft_2s',
            label: 'Output at TTFT p50 ≤ 2 s',
            value: Math.round(bestUsable.output),
            unit: 'tok/s',
            direction: 'higher_is_better',
            primary: true,
            stat: bestUsable.lat?.ttft?.p50 != null ? 'p50' : 'mean',
            at: 'TTFT ≤ 2 s',
        });
    }
    if (peak) {
        metrics.push({
            name: 'peak_output_tok_s',
            label: 'Peak output',
            value: Math.round(peak.output),
            unit: 'tok/s',
            direction: 'higher_is_better',
            primary: !bestUsable,
        });
    }
    if (bestTtft != null) {
        metrics.push({
            name: 'best_ttft_ms',
            label: 'Best TTFT',
            value: Math.round(bestTtft * 10) / 10,
            unit: 'ms',
            direction: 'lower_is_better',
            primary: false,
            stat: points.some((p) => p.lat?.ttft?.p50 != null) ? 'p50' : 'mean',
        });
    }

    const totalChips = points[0]?.chips || null;
    const estNodes = totalChips && totalChips > 8 ? Math.ceil(totalChips / 8) : 1;
    const iso = row.ts ? new Date(row.ts).toISOString() : new Date(0).toISOString();

    const categoryLower = String(row.category || '').toLowerCase();
    let domain = 'serving';
    if (categoryLower.includes('routing') || categoryLower.includes('schedul')) domain = 'routing';
    else if (categoryLower.includes('prefix') || categoryLower.includes('cache') || categoryLower.includes('storage')) domain = 'kv-cache-storage';
    else if (categoryLower.includes('agent')) domain = 'end-to-end';

    const variables = {};
    if (row.setup) variables.deployment = row.setup;
    if (row.run?.engine) variables.engine = row.run.engine;
    if (row.harness) variables.harness = row.harness;
    if (row.workload && row.workload !== 'Not recorded') variables.workload = row.workload;
    if (row.hwLabel) variables.hardware = row.hwLabel;

    return {
        id: `catalog:${row.key}`,
        storeId,
        version: 1,
        title: row.title,
        domain,
        summary: row.kind === 'suggested' ? `Auto-grouped sweep (${row.runs?.length || points.length} runs)` : '',
        status: 'published',
        metrics,
        variables,
        evidence: [],
        fleet: {
            nodes: estNodes,
            totalAccelerators: totalChips || undefined,
            accelerator: row.hwLabel ? String(row.hwLabel).replace(/\s*×\s*\d+$/i, '').trim() : undefined,
            topology: row.setup || undefined,
        },
        lineage: { baselineId: null, experimentGroup: null, changedVariables: [] },
        sweep: points,
        model: row.model,
        hardware: row.hwLabel,
        workload: row.workload,
        harness: row.harness,
        tags: [row.category].filter((t) => t && t !== 'Uncategorized'),
        notes: '',
        author: row.run?.author || 'catalog',
        createdAt: iso,
        updatedAt: iso,
        publishedAt: iso,
        history: [],
        _catalogRow: row,
    };
}

// ---------------------------------------------------------------------------
// HTTP Client for /api/stores/*
// ---------------------------------------------------------------------------

function buildHeaders({ devStoreProfile, devRole } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    try {
        const token = typeof localStorage !== 'undefined' ? localStorage.getItem('prism_github_token') : null;
        if (token) headers['X-Prism-Github-Token'] = token;
    } catch {
        // Storage unavailable.
    }
    if (devStoreProfile) headers['X-Prism-Store-Profile'] = devStoreProfile;
    if (devRole) headers['X-Prism-Dev-Role'] = devRole;
    return headers;
}

async function apiJson(url, opts = {}, ctx = {}) {
    const res = await fetch(url, {
        ...opts,
        headers: { ...buildHeaders(ctx), ...(opts.headers || {}) },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new Error(body?.error || `HTTP ${res.status}`);
        err.status = res.status;
        err.body = body;
        throw err;
    }
    return body;
}

export const storeApi = {
    listStores: (ctx) => apiJson('/api/stores', {}, ctx),
    listResults: (params = {}, ctx) => {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v != null && v !== '' && v !== 'all') qs.set(k, String(v));
        });
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return apiJson(`/api/stores/results${suffix}`, {}, ctx);
    },
    getResult: (storeId, id, ctx) => apiJson(`/api/stores/${encodeURIComponent(storeId)}/results/${encodeURIComponent(id)}`, {}, ctx),
    createResult: (storeId, payload, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/results`, { method: 'POST', body: JSON.stringify(payload) }, ctx),
    patchResult: (storeId, id, payload, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/results/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }, ctx),
    transitionResult: (storeId, id, payload, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/results/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(payload) }, ctx),
    deleteResult: (storeId, id, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/results/${encodeURIComponent(id)}`, { method: 'DELETE' }, ctx),
    discoverBaselines: (storeId, id, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/results/${encodeURIComponent(id)}/baselines`, {}, ctx),

    listArtifacts: (params = {}, ctx) => {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => {
            if (v != null && v !== '' && v !== 'all') qs.set(k, String(v));
        });
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return apiJson(`/api/stores/artifacts${suffix}`, {}, ctx);
    },
    getArtifact: (storeId, slug, ctx) =>
        apiJson(`/api/artifacts/${encodeURIComponent(storeId)}/${encodeURIComponent(slug)}`, {}, ctx),
    saveArtifact: (storeId, payload, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/artifacts`, { method: 'POST', body: JSON.stringify(payload) }, ctx),
    deleteArtifact: (storeId, slug, ctx) =>
        apiJson(`/api/stores/${encodeURIComponent(storeId)}/artifacts/${encodeURIComponent(slug)}`, { method: 'DELETE' }, ctx),
};
