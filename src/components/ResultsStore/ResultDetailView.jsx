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

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Check, ExternalLink, GitCompare, Layers, Pencil, Plus, Save, Server, Sparkles, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Label, Panel, Select, StatusChip } from '../ui';
import { CurveChart, MetricToggles } from './CurveChart';
import { useChartView } from './useChartView';
import { BackButton, CopyButton } from './parts';
import {
    domainLabelOf,
    fleetLabelOf,
    formatMetricValue,
    rankLocalBaselines,
    scaleTierOf,
    storeApi,
} from './storeClient';

export function ResultDetailView({
    result,
    store,
    writableStores = [],
    allResults = [],
    apiCtx,
    onBack,
    backLabel = 'Back to Explore',
    onCompare,
    onOpenResult,
    onBuildArtifact,
    onStatusChanged,
    onSavedToStore,
    onTrackRegressions,
    notify,
}) {
    const [baselines, setBaselines] = useState([]);
    const [loadingBaselines, setLoadingBaselines] = useState(false);
    const [busyAction, setBusyAction] = useState(null);
    const [feedbackText, setFeedbackText] = useState('');
    const [showFeedback, setShowFeedback] = useState(null);
    const [editingMeta, setEditingMeta] = useState(false);
    const [metaForm, setMetaForm] = useState({ title: '', summary: '', experimentGroup: '', baselineId: '', variables: [] });

    const isPersisted = Boolean(result && !String(result.id).startsWith('catalog:'));
    const sweepPoints = useMemo(() => (result?.sweep || []).filter((p) => p.included !== false), [result]);
    const chartSeries = useMemo(
        () => (sweepPoints.length >= 2 ? [{ id: result.id, name: result.title, points: sweepPoints }] : []),
        [result, sweepPoints]
    );
    const view = useChartView(chartSeries);

    useEffect(() => {
        if (!result) return undefined;
        let cancelled = false;
        const localRanked = rankLocalBaselines(result, allResults, 6);
        setBaselines(localRanked);

        if (!isPersisted) return undefined;
        setLoadingBaselines(true);
        storeApi
            .discoverBaselines(result.storeId, result.id, apiCtx)
            .then((res) => {
                if (cancelled) return;
                const serverRanked = res?.baselines || [];
                const seen = new Set(serverRanked.map((b) => b.result.id));
                const merged = [...serverRanked, ...localRanked.filter((b) => !seen.has(b.result.id))].slice(0, 6);
                setBaselines(merged);
            })
            .catch(() => {})
            .finally(() => {
                if (!cancelled) setLoadingBaselines(false);
            });
        return () => {
            cancelled = true;
        };
    }, [result, isPersisted, allResults, apiCtx]);

    const followUps = useMemo(
        () => (result ? allResults.filter((r) => r.id !== result.id && r.lineage?.baselineId === result.id) : []),
        [allResults, result]
    );

    if (!result) {
        return (
            <div className="space-y-4">
                <BackButton onClick={onBack}>{backLabel}</BackButton>
                <Panel variant="editorial" title="Result not found">
                    <p className="text-sm text-zinc-600">This result could not be found in any store you have access to.</p>
                </Panel>
            </div>
        );
    }

    const capabilities = store?.capabilities || {};
    const fleetLabel = fleetLabelOf(result);
    const isFleet = scaleTierOf(result) === 'fleet';
    const shareUrl = `${window.location.origin}${window.location.pathname}?view=results-store&store=${encodeURIComponent(result.storeId)}&result=${encodeURIComponent(result.id)}`;
    const apiUrl = isPersisted ? `${window.location.origin}/api/stores/${encodeURIComponent(result.storeId)}/results/${encodeURIComponent(result.id)}` : null;

    const runTransition = async (action, extra = {}) => {
        if (!isPersisted) return;
        setBusyAction(action);
        try {
            const res = await storeApi.transitionResult(result.storeId, result.id, { action, ...extra }, apiCtx);
            onStatusChanged?.(res.result);
            setShowFeedback(null);
            setFeedbackText('');
            notify?.(`Result status updated to ${res.result.status}.`);
        } catch (err) {
            notify?.(err.message || 'Status update failed.', 'error');
        } finally {
            setBusyAction(null);
        }
    };

    const topBaseline = baselines[0]?.result || null;
    const linkedBaseline = result.lineage?.baselineId ? allResults.find((r) => r.id === result.lineage.baselineId) : null;

    const openMetaEdit = () => {
        const varEntries = Object.entries(result.variables || {}).map(([key, value]) => ({ key, value: String(value) }));
        setMetaForm({
            title: result.title || '',
            summary: result.summary || '',
            experimentGroup: result.lineage?.experimentGroup || '',
            baselineId: result.lineage?.baselineId || '',
            variables: varEntries.length ? varEntries : [{ key: '', value: '' }],
        });
        setEditingMeta(true);
    };

    const saveMetaEdit = async () => {
        setBusyAction('patch');
        try {
            const base = allResults.find((r) => r.id === metaForm.baselineId);
            const variables = {};
            for (const row of metaForm.variables || []) {
                const k = row.key.trim();
                if (!k) continue;
                const v = row.value.trim();
                if (v === 'true') variables[k] = true;
                else if (v === 'false') variables[k] = false;
                else if (v !== '' && !Number.isNaN(Number(v))) variables[k] = Number(v);
                else variables[k] = v;
            }
            const res = await storeApi.patchResult(
                result.storeId,
                result.id,
                {
                    title: metaForm.title.trim() || result.title,
                    summary: metaForm.summary.trim(),
                    variables,
                    lineage: {
                        ...result.lineage,
                        experimentGroup: metaForm.experimentGroup.trim() || null,
                        baselineId: base ? base.id : null,
                        baselineStoreId: base ? base.storeId : null,
                    },
                },
                apiCtx
            );
            onStatusChanged?.(res.result);
            setEditingMeta(false);
            notify?.('Updated result metadata and variables.');
        } catch (err) {
            notify?.(err.message || 'Could not update metadata.', 'error');
        } finally {
            setBusyAction(null);
        }
    };

    const saveCatalogToStore = async () => {
        const target = writableStores.find((s) => s.defaultTarget) || writableStores[0];
        if (!target) return;
        setBusyAction('save_catalog');
        try {
            const payload = {
                title: result.title,
                domain: result.domain || 'serving',
                summary: result.summary || '',
                metrics: result.metrics || [],
                variables: result.variables || {},
                evidence: result.evidence || [],
                fleet: result.fleet,
                sweep: result.sweep,
                model: result.model,
                hardware: result.hardware,
                workload: result.workload,
                harness: result.harness,
                tags: result.tags || [],
                publish: !target.capabilities?.dcoRequired,
            };
            const res = await storeApi.createResult(target.id, payload, apiCtx);
            onSavedToStore?.(res.result, target);
            notify?.(`Saved "${res.result.title}" into ${target.name}.`);
        } catch (err) {
            notify?.(err.message || 'Could not save to store.', 'error');
        } finally {
            setBusyAction(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <BackButton onClick={onBack}>{backLabel}</BackButton>
                <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={shareUrl} label="Copy link" size="xs" />
                    {apiUrl && <CopyButton text={apiUrl} label="Copy API URL" size="xs" variant="ghost" />}
                    {onTrackRegressions && (result.model || result.hardware) && (
                        <Button size="xs" variant="ghost" onClick={() => onTrackRegressions(result)}>
                            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                            Track in Regressions
                        </Button>
                    )}
                    {!isPersisted && writableStores.length > 0 && (
                        <Button size="xs" variant="secondary" isLoading={busyAction === 'save_catalog'} onClick={saveCatalogToStore}>
                            <Save className="h-3.5 w-3.5" aria-hidden="true" />
                            Save to store
                        </Button>
                    )}
                    {topBaseline ? (
                        <Button size="xs" variant="secondary" onClick={() => onCompare?.([result, topBaseline], topBaseline.id)}>
                            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                            Compare with best baseline
                        </Button>
                    ) : (
                        <Button size="xs" variant="secondary" onClick={() => onCompare?.([result])}>
                            <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                            Compare with…
                        </Button>
                    )}
                    <Button size="xs" onClick={() => onBuildArtifact?.([result, ...(topBaseline ? [topBaseline] : [])])}>
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Build artifact
                    </Button>
                </div>
            </div>

            <Panel variant="editorial">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            {store && (
                                <Badge size="xs" tone={store.brand === 'llm-d' ? 'brand' : 'neutral'}>
                                    {store.brand === 'llm-d' ? 'llm-d' : store.name}
                                </Badge>
                            )}
                            <Badge size="xs" tone="neutral">
                                <Layers className="h-3 w-3" aria-hidden="true" />
                                {domainLabelOf(result.domain)}
                            </Badge>
                            {fleetLabel && (
                                <Badge size="xs" tone={isFleet ? 'brand' : 'neutral'}>
                                    <Server className="h-3 w-3" aria-hidden="true" />
                                    {fleetLabel}
                                </Badge>
                            )}
                            <StatusChip status={result.status} size="xs" />
                            <span className="font-mono text-tiny text-zinc-500">v{result.version || 1}</span>
                        </div>
                        <h2 className="font-display text-2xl font-bold tracking-display text-zinc-900">{result.title}</h2>
                        {result.summary && <p className="max-w-3xl text-sm leading-relaxed text-zinc-600">{result.summary}</p>}
                        <p className="text-micro text-zinc-500">
                            By {result.author}
                            {result.reviewedBy ? ` · Approved by ${result.reviewedBy}` : ''}
                            {result.lineage?.experimentGroup ? ` · Experiment: ${result.lineage.experimentGroup}` : ''}
                            {result.harness ? ` · Harness: ${result.harness}` : ''}
                        </p>
                    </div>

                    {isPersisted && (
                        <div className="flex flex-wrap items-center gap-2">
                            {capabilities.canWrite && !editingMeta && (
                                <Button size="xs" variant="ghost" onClick={openMetaEdit}>
                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                    Edit labels
                                </Button>
                            )}
                            {result.status === 'draft' && capabilities.canWrite && (
                                <Button size="xs" onClick={() => runTransition('publish')} isLoading={busyAction === 'publish'}>
                                    {capabilities.approvalRequired && !capabilities.canApprove ? 'Submit for review' : 'Publish'}
                                </Button>
                            )}
                            {result.status === 'in_review' && capabilities.canApprove && (
                                <>
                                    <Button size="xs" onClick={() => runTransition('approve')} isLoading={busyAction === 'approve'}>
                                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                        Approve
                                    </Button>
                                    <Button size="xs" variant="secondary" onClick={() => setShowFeedback('request_changes')}>
                                        Request changes
                                    </Button>
                                    <Button size="xs" variant="ghost" onClick={() => setShowFeedback('decline')}>
                                        Decline
                                    </Button>
                                </>
                            )}
                            {result.status === 'published' && capabilities.canApprove && (
                                <Button size="xs" variant="ghost" onClick={() => setShowFeedback('retract')}>
                                    Retract
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {editingMeta && (
                    <div className="mt-4 space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
                        <div className="label-caps text-zinc-500">Edit metadata &amp; lineage (measured values stay read-only)</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <Label surface="light" htmlFor="edit-meta-title">
                                    Title
                                </Label>
                                <Input
                                    surface="light"
                                    id="edit-meta-title"
                                    value={metaForm.title}
                                    onChange={(e) => setMetaForm((f) => ({ ...f, title: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="edit-meta-group">
                                    Experiment group
                                </Label>
                                <Input
                                    surface="light"
                                    id="edit-meta-group"
                                    value={metaForm.experimentGroup}
                                    placeholder="e.g. a2i-protocol-v2"
                                    onChange={(e) => setMetaForm((f) => ({ ...f, experimentGroup: e.target.value }))}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Label surface="light" htmlFor="edit-meta-summary">
                                    Summary
                                </Label>
                                <Input
                                    surface="light"
                                    id="edit-meta-summary"
                                    value={metaForm.summary}
                                    onChange={(e) => setMetaForm((f) => ({ ...f, summary: e.target.value }))}
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Label surface="light" htmlFor="edit-meta-baseline">
                                    Linked baseline
                                </Label>
                                <Select
                                    surface="light"
                                    id="edit-meta-baseline"
                                    value={metaForm.baselineId}
                                    onChange={(e) => setMetaForm((f) => ({ ...f, baselineId: e.target.value }))}
                                >
                                    <option value="">None (auto-discover)</option>
                                    {allResults
                                        .filter((r) => r.id !== result.id)
                                        .slice(0, 40)
                                        .map((r) => (
                                            <option key={r.id} value={r.id}>
                                                {r.title} ({r.storeId})
                                            </option>
                                        ))}
                                </Select>
                            </div>
                            <div className="sm:col-span-2">
                                <div className="mb-1.5 flex items-center justify-between">
                                    <Label surface="light" className="mb-0">
                                        Experimental variables
                                    </Label>
                                    <Button
                                        size="xs"
                                        variant="ghost"
                                        onClick={() => setMetaForm((f) => ({ ...f, variables: [...(f.variables || []), { key: '', value: '' }] }))}
                                    >
                                        <Plus className="h-3 w-3" aria-hidden="true" />
                                        Add variable
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {(metaForm.variables || []).map((v, idx) => (
                                        <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                            <Input
                                                surface="light"
                                                placeholder="Variable key"
                                                value={v.key}
                                                onChange={(e) =>
                                                    setMetaForm((f) => ({
                                                        ...f,
                                                        variables: f.variables.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)),
                                                    }))
                                                }
                                            />
                                            <Input
                                                surface="light"
                                                placeholder="Value"
                                                value={v.value}
                                                onChange={(e) =>
                                                    setMetaForm((f) => ({
                                                        ...f,
                                                        variables: f.variables.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)),
                                                    }))
                                                }
                                            />
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                aria-label="Remove variable"
                                                onClick={() => setMetaForm((f) => ({ ...f, variables: f.variables.filter((_, i) => i !== idx) }))}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <Button size="xs" variant="ghost" onClick={() => setEditingMeta(false)}>
                                Cancel
                            </Button>
                            <Button size="xs" onClick={saveMetaEdit} isLoading={busyAction === 'patch'}>
                                Save changes
                            </Button>
                        </div>
                    </div>
                )}

                {(linkedBaseline || followUps.length > 0) && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-2.5 text-xs">
                        {linkedBaseline && (
                            <span className="inline-flex items-center gap-1.5 text-zinc-600">
                                <span className="label-caps text-zinc-500">Baseline:</span>
                                <button
                                    type="button"
                                    onClick={() => onOpenResult?.(linkedBaseline)}
                                    className="font-semibold text-zinc-900 hover:text-accent-700 hover:underline"
                                >
                                    {linkedBaseline.title}
                                </button>
                                <Button size="xs" variant="ghost" onClick={() => onCompare?.([result, linkedBaseline], linkedBaseline.id)}>
                                    Diff
                                </Button>
                            </span>
                        )}
                        {followUps.length > 0 && (
                            <span className="inline-flex flex-wrap items-center gap-1.5 text-zinc-600">
                                <ArrowRight className="h-3.5 w-3.5 text-accent-600" aria-hidden="true" />
                                <span className="label-caps text-zinc-500">Used as baseline by:</span>
                                {followUps.map((child) => (
                                    <button
                                        key={child.id}
                                        type="button"
                                        onClick={() => onOpenResult?.(child)}
                                        className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-tiny font-semibold text-zinc-800 hover:border-accent-300 hover:text-accent-700"
                                    >
                                        {child.title}
                                    </button>
                                ))}
                            </span>
                        )}
                    </div>
                )}

                {result.feedback && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                        <span className="font-semibold">Reviewer note:</span> {result.feedback}
                    </div>
                )}

                {showFeedback && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <input
                            type="text"
                            value={feedbackText}
                            onChange={(e) => setFeedbackText(e.target.value)}
                            placeholder={`Reason for ${showFeedback.replace('_', ' ')}…`}
                            className="min-w-0 flex-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900"
                        />
                        <Button size="xs" onClick={() => runTransition(showFeedback, { feedback: feedbackText })} isLoading={busyAction === showFeedback}>
                            Confirm
                        </Button>
                        <Button size="xs" variant="ghost" onClick={() => setShowFeedback(null)}>
                            Cancel
                        </Button>
                    </div>
                )}

                {result.metrics?.length > 0 && (
                    <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {result.metrics.map((m) => (
                            <div key={m.name} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4">
                                <dt className="label-caps text-zinc-500">
                                    {m.label || m.name}
                                    {m.stat && !String(m.label || m.name).toLowerCase().includes(String(m.stat).toLowerCase()) ? ` (${m.stat})` : ''}
                                </dt>
                                <dd className="mt-1 font-display text-2xl font-bold tracking-display text-zinc-900 tabular-nums">
                                    {formatMetricValue(m.value, m.unit)}
                                </dd>
                                <div className="mt-1 text-tiny text-zinc-500">
                                    {[m.at, m.direction === 'lower_is_better' ? 'lower is better' : 'higher is better'].filter(Boolean).join(' · ')}
                                </div>
                            </div>
                        ))}
                    </dl>
                )}
            </Panel>

            {chartSeries.length > 0 && (
                <Panel
                    variant="editorial"
                    title="Throughput vs. latency sweep"
                    actions={<MetricToggles view={view} />}
                >
                    <CurveChart series={chartSeries} view={view} height={320} title={result.title} />
                </Panel>
            )}

            <Panel
                variant="editorial"
                title="Before / after baseline discovery"
                subtitle="Today’s published result becomes tomorrow’s baseline. Prism ranks the closest matching setups across all stores you can access."
            >
                {loadingBaselines && !baselines.length ? (
                    <p className="text-xs text-zinc-500">Finding matching baselines…</p>
                ) : !baselines.length ? (
                    <p className="text-xs text-zinc-500">No matching baselines found yet. Add another run in this domain or experiment group to unlock before/after deltas.</p>
                ) : (
                    <ul className="divide-y divide-zinc-100">
                        {baselines.map((b) => (
                            <li key={b.result.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="truncate text-sm font-semibold text-zinc-900">{b.result.title}</span>
                                        <Badge size="xs">{b.result.storeId}</Badge>
                                        {b.matchedOn.slice(0, 3).map((tag) => (
                                            <span key={tag} className="rounded-full bg-zinc-100 px-2 py-0.5 text-tiny text-zinc-600">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-0.5 text-xs text-zinc-600">{b.summary}</p>
                                </div>
                                <Button size="xs" variant="secondary" onClick={() => onCompare?.([result, b.result], b.result.id)}>
                                    <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                                    Compare before / after
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
                <Panel variant="editorial" title="Experimental variables & setup">
                    {Object.keys(result.variables || {}).length === 0 ? (
                        <p className="text-xs text-zinc-500">No experimental variables recorded.</p>
                    ) : (
                        <dl className="divide-y divide-zinc-100">
                            {Object.entries(result.variables).map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between gap-4 py-2 text-xs">
                                    <dt className="font-mono text-zinc-500">{k}</dt>
                                    <dd className="font-mono font-medium text-zinc-900">{String(v)}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </Panel>

                <Panel variant="editorial" title="Evidence & reproducibility">
                    {!result.evidence?.length ? (
                        <p className="text-xs text-zinc-500">No attached commands, configs, or logs.</p>
                    ) : (
                        <ul className="space-y-3">
                            {result.evidence.map((ev, idx) => (
                                <li key={`${ev.label}-${idx}`} className="rounded-2xl border border-zinc-200 bg-zinc-50/60 p-3 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-semibold text-zinc-900">{ev.label}</span>
                                        {ev.content && <CopyButton text={ev.content} label="Copy" size="xs" variant="ghost" />}
                                        {ev.url && (
                                            <a
                                                href={ev.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-accent-700 hover:underline"
                                            >
                                                Open <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                            </a>
                                        )}
                                    </div>
                                    {ev.content && (
                                        <pre className="mt-2 max-h-40 overflow-auto rounded-xl border border-zinc-200 bg-white p-2.5 font-mono text-tiny text-zinc-800">
                                            {ev.content}
                                        </pre>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Panel>
            </div>
        </div>
    );
}
