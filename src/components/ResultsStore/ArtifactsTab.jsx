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

import React, { useMemo, useState } from 'react';
import { Bot, Code2, FileCode2, LayoutGrid, Pencil, Plus, Server, Sparkles, Star, Trash2, User } from 'lucide-react';
import { Badge, Button, Checkbox, EmptyState, Input, Label, Modal, Panel, Select, ToggleGroup } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { useChartView } from './useChartView';
import { BackButton, CopyButton, MetricsComparisonTable } from './parts';
import {
    computeResultDeltas,
    domainLabelOf,
    fleetLabelOf,
    formatMetricValue,
    signedPct,
    storeApi,
} from './storeClient';

// ---------------------------------------------------------------------------
// Declarative Prism Building Blocks (the Well-Lit Path for Artifacts)
// ---------------------------------------------------------------------------

function MarkdownBlock({ block }) {
    const paragraphs = String(block.content || '')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
    return (
        <Panel variant="editorial" title={block.title}>
            <div className="space-y-3 text-sm leading-relaxed text-zinc-700">
                {paragraphs.map((p, idx) =>
                    p.startsWith('#') ? (
                        <h3 key={idx} className="font-display text-lg font-semibold tracking-display text-zinc-900">
                            {p.replace(/^#+\s*/, '')}
                        </h3>
                    ) : (
                        <p key={idx} className="whitespace-pre-line">
                            {p}
                        </p>
                    )
                )}
            </div>
        </Panel>
    );
}

function DeltaSummaryBlock({ block, byId }) {
    const candidate = byId.get(block.candidateId);
    const baseline = byId.get(block.baselineId);
    if (!candidate || !baseline) {
        return (
            <Panel variant="editorial" title={block.title || 'Before / after summary'}>
                <p className="text-xs text-zinc-500">Referenced baseline or candidate result is not loaded.</p>
            </Panel>
        );
    }
    const deltas = computeResultDeltas(baseline, candidate);
    return (
        <Panel
            variant="editorial"
            title={block.title || 'Before / after impact'}
            subtitle={`${candidate.title} vs. ${baseline.title}`}
        >
            {!deltas.length ? (
                <p className="text-xs text-zinc-500">No overlapping metric keys between candidate and baseline.</p>
            ) : (
                <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {deltas.map((d) => (
                        <div key={d.name} className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                            <dt className="label-caps text-zinc-500">{d.label}</dt>
                            <dd className="mt-1 flex items-baseline gap-2">
                                <span
                                    className={cn(
                                        'font-display text-2xl font-bold tracking-display tabular-nums',
                                        d.verdict === 'better' ? 'text-emerald-700' : d.verdict === 'worse' ? 'text-red-700' : 'text-zinc-900'
                                    )}
                                >
                                    {signedPct(d.deltaPct)}
                                </span>
                                <span className="text-xs text-zinc-600">{d.verdict}</span>
                            </dd>
                            <div className="mt-1.5 font-mono text-tiny text-zinc-600 tabular-nums">
                                {formatMetricValue(d.baselineValue, d.unit)} → {formatMetricValue(d.candidateValue, d.unit)}
                            </div>
                        </div>
                    ))}
                </dl>
            )}
        </Panel>
    );
}

function SweepChartBlock({ block, byId }) {
    const series = useMemo(
        () =>
            (block.resultIds || [])
                .map((id) => byId.get(id))
                .filter(Boolean)
                .map((r, idx) => ({
                    id: r.id,
                    name: r.title,
                    baseline: idx === 1,
                    points: (r.sweep || []).filter((p) => p.included !== false),
                }))
                .filter((s) => s.points.length >= 2),
        [block.resultIds, byId]
    );
    const view = useChartView(series, { latency: block.latencyMetric, stat: block.stat });
    if (!series.length) return null;
    return (
        <Panel variant="editorial" title={block.title || 'Throughput vs. latency curve'} actions={<MetricToggles view={view} />}>
            <CurveChart series={series} view={view} height={320} title={block.title || 'Sweep comparison'} />
        </Panel>
    );
}

function MetricsTableBlock({ block, byId, storesById, onOpenResult }) {
    const list = useMemo(() => (block.resultIds || []).map((id) => byId.get(id)).filter(Boolean), [block.resultIds, byId]);
    if (!list.length) return null;
    return (
        <Panel variant="editorial" title={block.title || 'Structured metrics'}>
            <MetricsComparisonTable
                results={list}
                baselineId={block.baselineId || list[0]?.id}
                storesById={storesById}
                onOpenResult={onOpenResult}
                showCost={block.showCost !== false}
            />
        </Panel>
    );
}

function FleetTopologyBlock({ block, byId }) {
    const list = (block.resultIds || []).map((id) => byId.get(id)).filter(Boolean);
    if (!list.length) return null;
    return (
        <Panel variant="editorial" title={block.title || 'Fleet scale & topology'}>
            <div className="grid gap-3 sm:grid-cols-2">
                {list.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-xs font-semibold text-zinc-900">{r.title}</span>
                            <Badge size="xs" tone="brand">
                                <Server className="h-3 w-3" aria-hidden="true" />
                                {r.fleet?.nodes || 1} node{(r.fleet?.nodes || 1) === 1 ? '' : 's'}
                            </Badge>
                        </div>
                        <p className="mt-1 text-micro text-zinc-600">{fleetLabelOf(r) || 'Single node setup'}</p>
                        {Object.keys(r.variables || {}).length > 0 && (
                            <div className="mt-2.5 flex flex-wrap gap-1.5">
                                {Object.entries(r.variables).map(([k, v]) => (
                                    <span key={k} className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-tiny text-zinc-700">
                                        {k}={String(v)}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </Panel>
    );
}

// ---------------------------------------------------------------------------
// Artifact Viewer (Declarative Blocks + Sandboxed HTML Escape Hatch)
// ---------------------------------------------------------------------------

export function ArtifactViewer({ artifact, results = [], storesById = new Map(), onBack, onOpenResult, onEdit, onToggleCurated, onDelete }) {
    const byId = useMemo(() => new Map(results.map((r) => [r.id, r])), [results]);
    if (!artifact) return null;
    const store = storesById.get(artifact.storeId);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const shareUrl = `${origin}/artifacts/${encodeURIComponent(artifact.storeId)}/${encodeURIComponent(artifact.slug)}`;
    const jsonApiUrl = `${origin}/api/artifacts/${encodeURIComponent(artifact.storeId)}/${encodeURIComponent(artifact.slug)}`;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <BackButton onClick={onBack}>Back to Artifacts</BackButton>
                <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={shareUrl} label="Copy share URL" size="xs" />
                    <CopyButton text={jsonApiUrl} label="Copy JSON API" size="xs" variant="ghost" />
                    {onToggleCurated && (
                        <Button size="xs" variant="secondary" onClick={() => onToggleCurated(artifact)}>
                            <Star className="h-3.5 w-3.5" aria-hidden="true" />
                            {artifact.curated ? 'Unpin well-lit path' : 'Pin as well-lit path'}
                        </Button>
                    )}
                    {onEdit && (
                        <Button size="xs" variant="ghost" onClick={() => onEdit(artifact)}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Edit
                        </Button>
                    )}
                    {onDelete && (
                        <Button size="xs" variant="ghost" onClick={() => onDelete(artifact)}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                        </Button>
                    )}
                </div>
            </div>

            <Panel variant="editorial">
                <div className="flex flex-wrap items-center gap-2">
                    <Badge size="xs" tone={store?.brand === 'llm-d' ? 'brand' : 'neutral'}>
                        {store?.name || artifact.storeId}
                    </Badge>
                    {artifact.curated && (
                        <Badge size="xs" tone="brand">
                            <Star className="h-3 w-3" aria-hidden="true" />
                            Curated well-lit path
                        </Badge>
                    )}
                    <Badge size="xs" tone="neutral">
                        {artifact.kind === 'html' ? (
                            <>
                                <FileCode2 className="h-3 w-3" aria-hidden="true" /> Sandboxed HTML
                            </>
                        ) : (
                            <>
                                <LayoutGrid className="h-3 w-3" aria-hidden="true" /> Building blocks
                            </>
                        )}
                    </Badge>
                    <Badge size="xs" tone="neutral">
                        {artifact.generatedBy === 'agent' ? (
                            <>
                                <Bot className="h-3 w-3" aria-hidden="true" /> Agent-generated
                            </>
                        ) : (
                            <>
                                <User className="h-3 w-3" aria-hidden="true" /> By {artifact.author}
                            </>
                        )}
                    </Badge>
                </div>
                <h2 className="mt-2 font-display text-2xl font-bold tracking-display text-zinc-900">{artifact.title}</h2>
                {artifact.description && <p className="mt-1.5 max-w-3xl text-sm text-zinc-600">{artifact.description}</p>}

                {artifact.resultIds?.length > 0 && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
                        <span className="label-caps text-zinc-500">Backed by results:</span>
                        {artifact.resultIds.map((id) => {
                            const r = byId.get(id);
                            return (
                                <button
                                    key={id}
                                    type="button"
                                    onClick={() => r && onOpenResult?.(r)}
                                    className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-tiny font-medium text-zinc-700 hover:border-accent-300 hover:text-accent-700"
                                >
                                    {r ? r.title : id}
                                </button>
                            );
                        })}
                    </div>
                )}
            </Panel>

            {artifact.kind === 'html' ? (
                <Panel variant="editorial" padding="none" title="Interactive HTML artifact (sandboxed)">
                    <iframe
                        title={artifact.title}
                        sandbox="allow-scripts"
                        srcDoc={artifact.html || ''}
                        className="h-[640px] w-full border-0 bg-white"
                    />
                </Panel>
            ) : (
                <div className="space-y-6">
                    {(artifact.blocks || []).map((block, idx) => {
                        if (block.type === 'markdown') return <MarkdownBlock key={idx} block={block} />;
                        if (block.type === 'delta-summary') return <DeltaSummaryBlock key={idx} block={block} byId={byId} />;
                        if (block.type === 'sweep-chart') return <SweepChartBlock key={idx} block={block} byId={byId} />;
                        if (block.type === 'metrics-table') return <MetricsTableBlock key={idx} block={block} byId={byId} storesById={storesById} onOpenResult={onOpenResult} />;
                        if (block.type === 'fleet-topology') return <FleetTopologyBlock key={idx} block={block} byId={byId} />;
                        return null;
                    })}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Artifact Builder Dialog (Well-Lit Blocks + Sandboxed HTML + Agent JSON)
// ---------------------------------------------------------------------------

export function ArtifactBuilderDialog({ isOpen, onClose, stores = [], defaultStoreId, initialArtifact = null, initialResults = [], initialBaselineId = null, allResults = [], apiCtx, onSaved }) {
    const writableStores = useMemo(() => stores.filter((s) => s.capabilities?.canWrite), [stores]);
    const initialStore =
        initialArtifact?.storeId ||
        writableStores.find((s) => s.id === defaultStoreId)?.id ||
        writableStores.find((s) => s.defaultTarget)?.id ||
        writableStores[0]?.id ||
        stores[0]?.id ||
        'llm-d';

    const existingBlocks = initialArtifact?.blocks || [];
    const [storeId, setStoreId] = useState(initialStore);
    const [kind, setKind] = useState(initialArtifact?.kind || 'blocks');
    const [title, setTitle] = useState(() => initialArtifact?.title || (initialResults.length >= 2 ? `${initialResults[0].title} vs. baseline` : initialResults[0]?.title || ''));
    const [description, setDescription] = useState(initialArtifact?.description || '');
    const [markdown, setMarkdown] = useState(
        () => existingBlocks.find((b) => b.type === 'markdown')?.content || 'Key findings and methodology notes for this optimization study.'
    );
    const [selectedIds, setSelectedIds] = useState(() => initialArtifact?.resultIds || initialResults.map((r) => r.id));
    const [includeDelta, setIncludeDelta] = useState(() => (initialArtifact ? existingBlocks.some((b) => b.type === 'delta-summary') : initialResults.length >= 2));
    const [includeChart, setIncludeChart] = useState(() =>
        initialArtifact ? existingBlocks.some((b) => b.type === 'sweep-chart') : initialResults.some((r) => (r.sweep || []).length >= 2)
    );
    const [includeTable, setIncludeTable] = useState(() => (initialArtifact ? existingBlocks.some((b) => b.type === 'metrics-table') : true));
    const [includeFleet, setIncludeFleet] = useState(() => (initialArtifact ? existingBlocks.some((b) => b.type === 'fleet-topology') : true));
    const [curated, setCurated] = useState(Boolean(initialArtifact?.curated));
    const [htmlSource, setHtmlSource] = useState(
        initialArtifact?.html ||
            '<!doctype html>\n<html>\n<head><style>body{font-family:system-ui,sans-serif;padding:24px;color:#18181b}h1{font-size:20px}</style></head>\n<body>\n  <h1>Custom Benchmark Artifact</h1>\n  <p>Render any interactive visualization here backed by published Result IDs.</p>\n</body>\n</html>'
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const store = stores.find((s) => s.id === storeId) || writableStores[0] || stores[0];
    const baselineId = initialBaselineId || selectedIds[1] || selectedIds[0];
    const candidateId = selectedIds.find((id) => id !== baselineId) || selectedIds[0];

    const payload = useMemo(() => {
        const slugPart = initialArtifact?.slug ? { slug: initialArtifact.slug } : {};
        if (kind === 'html') {
            return {
                ...slugPart,
                title: title.trim() || 'Untitled HTML artifact',
                description: description.trim(),
                kind: 'html',
                resultIds: selectedIds,
                html: htmlSource,
                curated: Boolean(curated && store?.capabilities?.canApprove),
                generatedBy: 'human',
            };
        }
        const blocks = [];
        if (markdown.trim()) blocks.push({ type: 'markdown', title: 'Summary', content: markdown.trim() });
        if (includeDelta && candidateId && baselineId && candidateId !== baselineId) {
            blocks.push({ type: 'delta-summary', title: 'Before / after impact', candidateId, baselineId });
        }
        if (includeChart && selectedIds.length > 0) {
            blocks.push({ type: 'sweep-chart', title: 'Throughput vs. latency', resultIds: selectedIds });
        }
        if (includeTable && selectedIds.length > 0) {
            blocks.push({ type: 'metrics-table', title: 'Metrics comparison', resultIds: selectedIds, baselineId });
        }
        if (includeFleet && selectedIds.length > 0) {
            blocks.push({ type: 'fleet-topology', title: 'Fleet scale & variables', resultIds: selectedIds });
        }
        return {
            ...slugPart,
            title: title.trim() || 'Untitled artifact',
            description: description.trim(),
            kind: 'blocks',
            resultIds: selectedIds,
            blocks,
            curated: Boolean(curated && store?.capabilities?.canApprove),
            generatedBy: 'human',
        };
    }, [initialArtifact?.slug, kind, title, description, selectedIds, htmlSource, markdown, includeDelta, candidateId, baselineId, includeChart, includeTable, includeFleet, curated, store]);

    const toggleResult = (id) => {
        setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    };

    const save = async () => {
        setError(null);
        setSaving(true);
        try {
            const res = await storeApi.saveArtifact(store.id, payload, apiCtx);
            onSaved?.(res.artifact);
            onClose();
        } catch (err) {
            const issues = err?.body?.issues;
            setError(Array.isArray(issues) ? issues.map((i) => `${i.path?.join('.')}: ${i.message}`).join(' · ') : err.message || 'Failed to save artifact.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title={initialArtifact ? `Edit artifact: ${initialArtifact.title}` : 'Publish artifact'}
            subtitle="Compose a shareable dashboard from published Result IDs using Prism building blocks, or drop in a sandboxed HTML visualization."
            footer={
                <>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" onClick={save} isLoading={saving} disabled={saving || !title.trim() || !writableStores.length}>
                        {initialArtifact ? 'Save changes' : 'Publish artifact'}
                    </Button>
                </>
            }
        >
            <div className="surface-light space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <ToggleGroup
                        size="xs"
                        aria-label="Artifact format"
                        value={kind}
                        onChange={setKind}
                        options={[
                            { value: 'blocks', label: 'Prism building blocks (Well-lit path)' },
                            { value: 'html', label: 'Sandboxed HTML (Custom)' },
                        ]}
                    />
                    {writableStores.length > 1 && (
                        <div className="flex items-center gap-2">
                            <Label surface="light" htmlFor="artifact-store" className="mb-0">
                                Store
                            </Label>
                            <Select surface="light" id="artifact-store" value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-44">
                                {writableStores.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                        <Label surface="light" htmlFor="artifact-title">
                            Title
                        </Label>
                        <Input surface="light" id="artifact-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 128-Node NVMe KV Tiering Study" />
                    </div>
                    <div>
                        <Label surface="light" htmlFor="artifact-desc">
                            Short description
                        </Label>
                        <Input surface="light" id="artifact-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="One-sentence takeaway" />
                    </div>
                </div>

                {allResults.length > 0 && (
                    <div className="rounded-2xl border border-zinc-200 p-3">
                        <div className="label-caps mb-2 text-zinc-500">Backing results ({selectedIds.length} selected)</div>
                        <div className="max-h-32 space-y-1.5 overflow-y-auto">
                            {allResults.slice(0, 20).map((r) => (
                                <Checkbox
                                    key={r.id}
                                    surface="light"
                                    checked={selectedIds.includes(r.id)}
                                    onChange={() => toggleResult(r.id)}
                                    label={`${r.title} (${r.storeId})`}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {kind === 'blocks' ? (
                    <div className="space-y-3">
                        <div>
                            <Label surface="light" htmlFor="artifact-md">
                                Narrative block (Markdown)
                            </Label>
                            <textarea
                                id="artifact-md"
                                rows={3}
                                value={markdown}
                                onChange={(e) => setMarkdown(e.target.value)}
                                className="w-full rounded-2xl border border-zinc-200 bg-white p-3 text-xs text-zinc-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                            />
                        </div>
                        <div className="flex flex-wrap gap-4 rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3">
                            <Checkbox surface="light" checked={includeDelta} onChange={setIncludeDelta} label="Before / after delta cards" />
                            <Checkbox surface="light" checked={includeChart} onChange={setIncludeChart} label="Sweep curve chart" />
                            <Checkbox surface="light" checked={includeTable} onChange={setIncludeTable} label="Structured metrics table" />
                            <Checkbox surface="light" checked={includeFleet} onChange={setIncludeFleet} label="Fleet topology & variables" />
                        </div>
                    </div>
                ) : (
                    <div>
                        <Label surface="light" htmlFor="artifact-html">
                            Self-contained HTML (rendered inside sandbox=&quot;allow-scripts&quot; iframe)
                        </Label>
                        <textarea
                            id="artifact-html"
                            rows={8}
                            value={htmlSource}
                            onChange={(e) => setHtmlSource(e.target.value)}
                            className="w-full rounded-2xl border border-zinc-200 bg-white p-3 font-mono text-xs text-zinc-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                        />
                    </div>
                )}

                {store?.capabilities?.canApprove && (
                    <Checkbox
                        surface="light"
                        checked={curated}
                        onChange={setCurated}
                        label="Pin as a curated well-lit path artifact in this store"
                    />
                )}

                <details className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3 text-xs">
                    <summary className="flex cursor-pointer items-center justify-between font-semibold text-zinc-800">
                        <span className="inline-flex items-center gap-1.5">
                            <Code2 className="h-3.5 w-3.5 text-accent-600" aria-hidden="true" />
                            Agent API JSON (`POST /api/stores/{store?.id || 'llm-d'}/artifacts`)
                        </span>
                        <CopyButton text={JSON.stringify({ ...payload, generatedBy: 'agent' }, null, 2)} label="Copy JSON" size="xs" variant="ghost" />
                    </summary>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-zinc-950 p-3 font-mono text-tiny text-zinc-100">
                        {JSON.stringify({ ...payload, generatedBy: 'agent' }, null, 2)}
                    </pre>
                </details>

                {error && (
                    <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
                        {error}
                    </p>
                )}
            </div>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// Artifacts Tab List
// ---------------------------------------------------------------------------

export function ArtifactsTab({ artifacts = [], storesById = new Map(), onOpenArtifact, onNewArtifact, canWrite }) {
    const [q, setQ] = useState('');
    const filtered = useMemo(() => {
        const needle = q.trim().toLowerCase();
        if (!needle) return artifacts;
        return artifacts.filter((a) => [a.title, a.description, a.slug, a.author, ...(a.tags || [])].join(' ').toLowerCase().includes(needle));
    }, [artifacts, q]);

    const curated = filtered.filter((a) => a.curated);
    const community = filtered.filter((a) => !a.curated);

    const renderCard = (a) => {
        const store = storesById.get(a.storeId);
        return (
            <button
                key={`${a.storeId}/${a.slug}`}
                type="button"
                onClick={() => onOpenArtifact?.(a)}
                className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 text-left transition-colors hover:border-accent-300 hover:bg-accent-50/20"
            >
                <div className="flex flex-wrap items-center gap-1.5">
                    <Badge size="xs" tone={store?.brand === 'llm-d' ? 'brand' : 'neutral'}>
                        {store?.name || a.storeId}
                    </Badge>
                    {a.curated && (
                        <Badge size="xs" tone="brand">
                            <Star className="h-3 w-3" aria-hidden="true" />
                            Well-lit path
                        </Badge>
                    )}
                    {a.domain && <Badge size="xs">{domainLabelOf(a.domain)}</Badge>}
                    {a.generatedBy === 'agent' && (
                        <Badge size="xs" tone="neutral">
                            <Bot className="h-3 w-3" aria-hidden="true" />
                            Agent
                        </Badge>
                    )}
                </div>
                <h3 className="mt-2.5 font-display text-base font-semibold tracking-display text-zinc-900">{a.title}</h3>
                {a.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-600">{a.description}</p>}
                <div className="mt-auto flex items-center justify-between pt-4 text-tiny text-zinc-500">
                    <span>
                        {a.resultIds?.length || 0} backing result{(a.resultIds?.length || 0) === 1 ? '' : 's'}
                    </span>
                    <span className="font-mono">{a.kind === 'html' ? 'HTML' : `${a.blocks?.length || 0} blocks`}</span>
                </div>
            </button>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <Input
                    surface="light"
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Filter artifacts by title, slug, or tag…"
                    className="max-w-sm"
                />
                {canWrite && (
                    <Button size="sm" onClick={onNewArtifact}>
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        New artifact
                    </Button>
                )}
            </div>

            {!filtered.length ? (
                <EmptyState
                    icon={Sparkles}
                    title="No artifacts published yet"
                    description="Publish a result or run a before/after comparison, then turn it into a shareable declarative dashboard or HTML artifact — via UI or agent API."
                    action={
                        canWrite && (
                            <Button size="sm" onClick={onNewArtifact}>
                                Build first artifact
                            </Button>
                        )
                    }
                />
            ) : (
                <>
                    {curated.length > 0 && (
                        <section className="space-y-3">
                            <div>
                                <p className="kicker text-accent-600">Curated</p>
                                <h2 className="font-display text-lg font-semibold tracking-display text-zinc-900">Well-lit paths</h2>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{curated.map(renderCard)}</div>
                        </section>
                    )}

                    {community.length > 0 && (
                        <section className="space-y-3">
                            <div>
                                <p className="kicker text-zinc-500">Published</p>
                                <h2 className="font-display text-lg font-semibold tracking-display text-zinc-900">Team &amp; agent artifacts</h2>
                            </div>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{community.map(renderCard)}</div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
