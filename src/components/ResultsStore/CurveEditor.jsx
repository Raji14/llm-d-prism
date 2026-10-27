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

import React, { useMemo, useRef, useState } from 'react';
import { Activity, Github, LayoutDashboard, Pencil, Plus, Share2, Star, TriangleAlert, X } from 'lucide-react';
import { Badge, Button, ChartContainer, Checkbox, EmptyState, Input, Label, Modal, Panel, Select, Textarea, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, BaselinePicker, CheckList, HistoryList, MetaGrid, ResultStatusChip, ResultVisibilityChip } from './parts';
import { resultAudience } from './instance';
import { PublishDialog } from './PublishDialog';
import { useChartView } from './useChartView';
import { useWorkspace } from './workspaceContext';
import {
    ACCELERATOR_SUGGESTIONS,
    CATEGORY_OPTIONS,
    ERROR_LIMIT_PCT,
    curveChecks,
    curveConfig,
    fmtDay,
    fmtInt,
    fmtTput,
    latencyLabel,
    latencyValue,
    loadOrder,
    rankBaselines,
    seriesPoints,
} from './catalog';

const EDITABLE = new Set(['draft', 'needs_changes']);
const savedAt = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function PointRow({ p, latency, stat, readOnly, onToggle, onOpenRun }) {
    // Only a known failure rate over the limit is a problem; without a total
    // request count there's no rate (matches the publish check).
    const bad = p.errPct != null && p.errPct >= ERROR_LIMIT_PCT;
    // The load the point measured: concurrency, or a rate sweep's request rate.
    const load = p.conc != null ? `c=${p.conc}` : p.rate != null ? `${p.rate} req/s` : null;
    return (
        <li className={cn('flex items-start gap-3 px-4 py-2.5', !p.included && 'bg-zinc-50/80')}>
            <Checkbox
                surface="light"
                checked={p.included}
                disabled={readOnly}
                onChange={() => onToggle(p)}
                aria-label={`${p.included ? 'Exclude' : 'Include'} ${load || `run ${p.idLabel}`}`}
                className="mt-0.5"
            />
            <div className={cn('min-w-0 flex-1', !p.included && 'opacity-60')}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="w-14 font-mono text-xs font-semibold tabular-nums text-zinc-900">{load || '—'}</span>
                    <button type="button" onClick={() => onOpenRun(p.runKey)} className="font-mono text-tiny text-zinc-600 hover:text-accent-700 hover:underline">
                        run {p.idLabel}
                    </button>
                    <span className="text-tiny text-zinc-500">{fmtDay(p.ts)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 font-mono text-tiny tabular-nums text-zinc-600">
                    <span>{fmtTput(p.output)} tok/s</span>
                    <span>
                        {fmtInt(latencyValue(p, latency, stat))} ms {latencyLabel(latency, stat)}
                    </span>
                    {(p.errPct > 0 || p.errCount > 0) && (
                        <span className={cn('inline-flex items-center gap-1', bad ? 'text-amber-700' : 'text-zinc-600')}>
                            {bad && <TriangleAlert className="h-3 w-3" aria-hidden="true" />}
                            {p.errPct != null ? `${p.errPct.toFixed(1)}% failed` : `${p.errCount} failed (total unknown)`}
                        </span>
                    )}
                </div>
                {!p.included && p.reason && <div className="mt-0.5 text-tiny text-zinc-600">Excluded: {p.reason}</div>}
            </div>
        </li>
    );
}

function FieldNote({ was, now }) {
    if (was === now) return null;
    return <span className="text-micro font-medium text-accent-700">edited · was {was ? `“${was}”` : 'missing'}</span>;
}

// In place of Mark official on the internal instance, for people who can't
// approve: says who can, and offers sign-in when that's what's missing.
function OfficialGate({ reason, onSignIn, signInReady }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-600">Only approvers can mark results official.</span>
            {reason === 'signin' && (
                <Button size="sm" variant="secondary" onClick={() => onSignIn?.()} disabled={!signInReady} title={signInReady ? undefined : 'GitHub sign-in isn’t configured on this server.'}>
                    <Github className="h-3.5 w-3.5" aria-hidden="true" /> Sign in
                </Button>
            )}
        </span>
    );
}

// In place of Submit for review on the public store when a draft was made from
// community catalog runs rather than your own uploaded runs.
function PublicOwnershipGate({ copy, onUpload }) {
    return (
        <span className="inline-flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-600">Catalog draft · only your own uploaded runs can be submitted for review.</span>
            {onUpload && (
                <Button size="sm" variant="secondary" onClick={onUpload}>
                    {copy.uploadLabel}
                </Button>
            )}
        </span>
    );
}

// The one place to edit a curve: prune points, fix labels (measured values
// stay locked), check against baselines, then publish. Official/Published
// curves are read-only; editing opens a new draft version. On the internal
// instance only approvers publish (officialBlock says why someone can't).
export function CurveEditor({ curve, copy, baselineOptions, resolveBaseline, isReviewer, officialBlock, publicBlock, onUpload, onSignIn, signInReady, nav, onShare, onAddToDashboard, onWatch, onSubmitForReview, onContinueUpload, notify }) {
    const ws = useWorkspace();
    const [dialog, setDialog] = useState(null);
    const accelRef = useRef(null);

    const checks = useMemo(() => (curve ? curveChecks(curve) : []), [curve]);
    const baselines = curve ? curve.baselines.map((b) => ({ ...b, points: resolveBaseline(b) })) : [];
    // Open on a latency this result recorded. Not the baselines': adding one
    // shouldn't switch the chart to a metric the result doesn't have.
    const view = useChartView(curve ? [curve.points] : [], { extraLists: baselines.map((b) => b.points) });

    if (!curve) {
        return (
            <div className="space-y-4">
                <BackButton onClick={nav.back}>{nav.backLabel || 'Back'}</BackButton>
                <EmptyState title="Result not found" message="It may have been discarded. Results are saved in this browser for now." />
            </div>
        );
    }

    const instance = ws.instance;
    const readOnly = !EDITABLE.has(curve.status);
    const editable = !readOnly;
    const included = curve.points.filter((p) => p.included);
    const excluded = curve.points.filter((p) => !p.included);
    const { latency, stat, throughput } = view;
    const supersedes = curve.supersedes ? ws.getCurve(curve.supersedes) : null;
    const supersededBy = curve.supersededBy ? ws.getCurve(curve.supersededBy) : null;
    const published = curve.status === 'official' || curve.status === 'published';
    // Anything live can be shared or put in a report; declined and replaced versions can't.
    const shareable = published || editable || curve.status === 'in_review';
    // Anyone may curate a local sandbox draft on either instance; on the public
    // store, submitting for review is gated on owning the source runs (publicBlock).
    const canAddRuns = !readOnly;
    const canNewVersion = true;

    const series = [
        {
            id: curve.id,
            name: 'This result',
            color: seriesColor(0),
            points: seriesPoints(included, { latency, stat, throughput }),
            excluded: seriesPoints(excluded, { latency, stat, throughput }).map((pt) => ({ ...pt, reason: excluded.find((p) => p.key === pt.key)?.reason })),
        },
        ...baselines.map((b, i) => ({
            id: b.id,
            name: `Baseline: ${b.name}`,
            color: seriesColor(i + 1),
            shape: ['diamond', 'triangle', 'square'][i % 3],
            lineStyle: 'dashed',
            points: seriesPoints(b.points, { latency, stat, throughput }),
        })),
    ];

    const fix = (c) => {
        if (c.fix.type === 'exclude') ws.togglePoint(curve.id, c.fix.pointKey, c.fix.reason);
        if (c.fix.type === 'focus') {
            accelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            accelRef.current?.focus();
        }
    };

    const shareForFeedback = () => {
        ws.setVisibility(curve.id, copy.shareVisibility);
        onShare({ kind: 'curve', id: curve.id, title: curve.name });
    };

    const editAsNewVersion = () => {
        const id = ws.newVersion(curve.id);
        if (id) {
            nav.openCurve(id);
            notify(`Draft v${curve.version + 1} created. v${curve.version} stays live until this one replaces it.`);
        }
    };

    return (
        <div className="space-y-6">
            <BackButton onClick={nav.back}>{nav.backLabel || 'Back'}</BackButton>

            {curve.status === 'needs_changes' && curve.feedback && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div>
                        <div className="font-semibold">A reviewer asked for changes</div>
                        <p className="mt-0.5 text-xs">{curve.feedback}</p>
                    </div>
                </div>
            )}
            {curve.status === 'in_review' && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
                    Submitted {curve.submittedAt ? fmtDay(curve.submittedAt) : ''} · Checks passed · <span className="font-semibold">Waiting for a reviewer</span>. You’ll find
                    the outcome in My work.
                </div>
            )}
            {supersededBy && (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700">
                    This version was replaced by{' '}
                    <button type="button" className="font-semibold text-accent-700 hover:underline" onClick={() => nav.openCurve(supersededBy.id)}>
                        v{supersededBy.version}
                    </button>
                    .
                </div>
            )}

            <header className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                    <ResultStatusChip status={curve.status} />
                    {/* A draft is private, and Official, Published and In review chips
                        already say who can see it: the chip only marks a draft someone shared. */}
                    {!resultAudience(curve.status) && curve.visibility !== 'me' && <ResultVisibilityChip curve={curve} />}
                    {curve.version > 1 && <Badge size="sm">v{curve.version}</Badge>}
                    {curve.featured && (
                        <Badge tone="brand">
                            <Star className="h-3 w-3" aria-hidden="true" /> Featured
                        </Badge>
                    )}
                    {/* Where it's saved is the page notice's job. */}
                    <span className="ml-auto text-micro text-zinc-500">
                        Saved {savedAt(curve.updatedAt)}
                        {readOnly ? ' · Read-only' : ''}
                    </span>
                </div>
                {readOnly ? (
                    <h2 className="display-title text-2xl text-zinc-900">{curve.name}</h2>
                ) : (
                    <>
                        {/* The name is edited in place; this keeps the screen's heading for screen readers. */}
                        <h2 className="sr-only">{curve.name || 'Untitled result'}</h2>
                        <Input
                            surface="light"
                            aria-label="Result name"
                            value={curve.name}
                            onChange={(e) => ws.renameCurve(curve.id, e.target.value)}
                            className="-ml-3 border-transparent bg-transparent text-xl font-semibold hover:border-zinc-200"
                        />
                    </>
                )}
                <p className="text-xs text-zinc-600">
                    {curve.autoName && !readOnly ? 'Suggested name from the labels below. ' : ''}
                    {/* The status chip above already names the status. */}
                    {published && curve.markedBy && (
                        <>
                            Marked by <span className="font-medium text-zinc-900">{curve.markedBy}</span> on {fmtDay(curve.markedAt)} ·{' '}
                        </>
                    )}
                    {curve.status === 'published' && curve.reviewedBy && (
                        <>
                            Approved by <span className="font-medium text-zinc-900">{curve.reviewedBy}</span> ·{' '}
                        </>
                    )}
                    Built from {curve.builtFrom.runs} run{curve.builtFrom.runs === 1 ? '' : 's'} · {curve.builtFrom.label}
                </p>
            </header>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <Panel
                    variant="editorial"
                    padding="none"
                    title="Points"
                    subtitle={`${included.length} of ${curve.points.length} included · sorted by ${{ conc: 'concurrency', rate: 'request rate', output: 'throughput' }[loadOrder(curve.points).by]}`}
                    actions={
                        canAddRuns && (
                            <Button size="xs" variant="ghost" onClick={() => nav.addRunsTo(curve.id)}>
                                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add runs
                            </Button>
                        )
                    }
                >
                    <ul className="max-h-[440px] divide-y divide-zinc-100 overflow-y-auto">
                        {curve.points.map((p) => (
                            <PointRow
                                key={p.key}
                                p={p}
                                latency={latency}
                                stat={stat}
                                readOnly={readOnly}
                                onToggle={(pt) => ws.togglePoint(curve.id, pt.key)}
                                onOpenRun={nav.openRun}
                            />
                        ))}
                    </ul>
                    <p className="border-t border-zinc-100 px-4 py-2.5 text-tiny text-zinc-500">Unchecked points stay here, greyed out, with the reason.</p>
                </Panel>

                <ChartContainer
                    title="Throughput vs latency"
                    actions={
                        <>
                            <MetricToggles view={view} />
                            {!readOnly && (
                                <BaselinePicker
                                    options={rankBaselines(
                                        baselineOptions.filter((o) => o.id !== curve.id && o.id !== curve.supersedes && !curve.baselines.some((b) => b.id === o.id)),
                                        curveConfig(curve)
                                    )}
                                    onPick={(o) => ws.addBaseline(curve.id, { id: o.id, name: o.name, note: o.note, ref: o.item, points: o.points })}
                                    emptyText="Nothing else to add yet. Runs and results show up here once they’re loaded."
                                />
                            )}
                        </>
                    }
                >
                    <CurveChart series={series} latency={latency} stat={stat} throughput={throughput} height={360} />
                    {baselines.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                            {baselines.map((b) => (
                                <span
                                    key={b.id}
                                    title={b.note ? `${b.name} · ${b.note}` : b.name}
                                    className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-3 pr-1.5 text-micro text-zinc-700"
                                >
                                    <span className="truncate">Baseline: {b.name}</span>
                                    {!readOnly && (
                                        <button
                                            type="button"
                                            aria-label={`Remove baseline ${b.name}`}
                                            onClick={() => ws.removeBaseline(curve.id, b.id)}
                                            className="rounded-full p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </span>
                            ))}
                        </div>
                    )}
                </ChartContainer>
            </div>

            <Panel variant="editorial" title="Labels & metadata" subtitle={readOnly ? undefined : 'Fix labels, never numbers: measured values are read-only.'}>
                {readOnly ? (
                    // Nothing to edit here, so the labels read as text, not a disabled form.
                    <MetaGrid
                        items={[
                            { label: 'Model', value: curve.meta.model, was: curve.meta.model !== curve.original.model ? curve.original.model : undefined },
                            {
                                label: 'Accelerator',
                                value: curve.meta.accelerator || 'Not recorded',
                                was: curve.meta.accelerator !== curve.original.accelerator ? curve.original.accelerator : undefined,
                            },
                            { label: 'Category', value: curve.meta.category, was: curve.meta.category !== curve.original.category ? curve.original.category : undefined },
                            { label: 'Workload (ISL/OSL)', value: curve.meta.workload || 'Not recorded', mono: true },
                            { label: 'Harness', value: curve.meta.harness },
                            { label: 'Source', value: curve.meta.source || 'Not recorded' },
                            { label: 'Deployment', value: curve.meta.setup || null },
                            { label: 'Notes', value: curve.meta.notes || null },
                        ]}
                    />
                ) : (
                    <div className="grid gap-5 sm:grid-cols-2">
                        <div>
                            <div className="flex items-baseline justify-between gap-2">
                                <Label surface="light" htmlFor="rs-accelerator">
                                    Accelerator
                                </Label>
                                <FieldNote was={curve.original.accelerator} now={curve.meta.accelerator} />
                            </div>
                            <Input
                                ref={accelRef}
                                surface="light"
                                id="rs-accelerator"
                                list="rs-accelerator-options"
                                value={curve.meta.accelerator}
                                placeholder="e.g. TPU v6e ×8"
                                onChange={(e) => ws.setMeta(curve.id, 'accelerator', e.target.value)}
                            />
                            <datalist id="rs-accelerator-options">
                                {ACCELERATOR_SUGGESTIONS.map((a) => (
                                    <option key={a} value={a} />
                                ))}
                            </datalist>
                        </div>
                        <div>
                            <div className="flex items-baseline justify-between gap-2">
                                <Label surface="light" htmlFor="rs-model">
                                    Model
                                </Label>
                                <FieldNote was={curve.original.model} now={curve.meta.model} />
                            </div>
                            <Input surface="light" id="rs-model" value={curve.meta.model} onChange={(e) => ws.setMeta(curve.id, 'model', e.target.value)} />
                        </div>
                        <div>
                            <div className="flex items-baseline justify-between gap-2">
                                <Label surface="light" htmlFor="rs-category">
                                    Category
                                </Label>
                                <FieldNote was={curve.original.category} now={curve.meta.category} />
                            </div>
                            <Select surface="light" id="rs-category" value={curve.meta.category} onChange={(e) => ws.setMeta(curve.id, 'category', e.target.value)}>
                                {CATEGORY_OPTIONS.map((c) => (
                                    <option key={c} value={c}>
                                        {c}
                                    </option>
                                ))}
                            </Select>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                            {[
                                ['Workload (ISL/OSL)', curve.meta.workload || 'Not recorded'],
                                ['Harness', curve.meta.harness],
                                ['Source', curve.meta.source || 'Not recorded'],
                                ['Deployment', curve.meta.setup || '—'],
                            ].map(([k, v]) => (
                                <div key={k} className="min-w-0">
                                    <dt className="label-caps text-zinc-500">{k}</dt>
                                    <dd className="mt-1 truncate text-zinc-900" title={v}>
                                        {v}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <div className="sm:col-span-2">
                            <Label surface="light" htmlFor="rs-notes">
                                Notes
                            </Label>
                            <Textarea
                                surface="light"
                                id="rs-notes"
                                rows={3}
                                value={curve.meta.notes}
                                placeholder="What changed in this run, known caveats, links…"
                                className="font-sans text-sm"
                                onChange={(e) => ws.setMeta(curve.id, 'notes', e.target.value)}
                            />
                        </div>
                    </div>
                )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
                <Panel variant="editorial" title="Checks" subtitle="Plain-language checks with the fix next to each one.">
                    <CheckList checks={checks} onFix={fix} readOnly={readOnly} />
                </Panel>
                {/* Each source run is linked from its point in the Points panel above. */}
                <Panel variant="editorial" title="Lineage" subtitle={`Version ${curve.version}${supersedes ? ` · replaces v${supersedes.version}` : ''}`}>
                    <HistoryList history={curve.history} />
                </Panel>
            </div>

            {/* Sticky, so publishing and sharing stay in reach on a long result.
                Add to report and Share mean the same thing at every status, so they
                appear once; reports take drafts too (marked Unofficial there). */}
            <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-2 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                {editable && (
                    <Button size="sm" variant="dangerOutline" onClick={() => setDialog('discard')}>
                        Discard
                    </Button>
                )}
                <div className="ml-auto flex flex-wrap items-center gap-2">
                    {published && canNewVersion && (
                        <Button size="sm" variant="secondary" onClick={editAsNewVersion}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Edit as new version
                        </Button>
                    )}
                    {published && onWatch && (
                        <Button size="sm" variant="secondary" onClick={() => onWatch(curve)}>
                            <Activity className="h-3.5 w-3.5" aria-hidden="true" /> Watch this setup
                        </Button>
                    )}
                    {shareable && (
                        <Button size="sm" variant="secondary" onClick={() => onAddToDashboard([curve.id])}>
                            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" /> Add to report
                        </Button>
                    )}
                    {published && isReviewer && instance === 'public' && (
                        <Button size="sm" variant="secondary" onClick={() => ws.toggleFeatured(curve.id)}>
                            <Star className="h-3.5 w-3.5" aria-hidden="true" /> {curve.featured ? 'Unfeature' : 'Feature'}
                        </Button>
                    )}
                    {shareable && (
                        // A draft opens up to link sharing first; the share dialog says who can open it.
                        <Button size="sm" variant={published ? 'primary' : 'secondary'} onClick={editable ? shareForFeedback : () => onShare({ kind: 'curve', id: curve.id, title: curve.name })}>
                            <Share2 className="h-3.5 w-3.5" aria-hidden="true" /> Share
                        </Button>
                    )}
                    {editable &&
                        (officialBlock ? (
                            <OfficialGate reason={officialBlock} onSignIn={onSignIn} signInReady={signInReady} />
                        ) : publicBlock ? (
                            <PublicOwnershipGate copy={copy} onUpload={onUpload} />
                        ) : (
                            <Button size="sm" onClick={() => setDialog('publish')}>
                                {curve.status === 'needs_changes' ? 'Submit again' : copy.publishVerb}
                            </Button>
                        ))}
                </div>
            </div>

            <PublishDialog
                key={dialog === 'publish' ? 'open' : 'closed'}
                isOpen={dialog === 'publish'}
                subject={curve}
                checks={checks}
                copy={copy}
                instance={instance}
                actor={ws.actor}
                onClose={() => setDialog(null)}
                onMarkOfficial={() => {
                    if (officialBlock) return;
                    ws.markOfficial(curve.id);
                    setDialog(null);
                    notify('Marked official. It’s saved in this browser for now.');
                }}
                onSubmit={({ attribution }) => {
                    setDialog(null);
                    onSubmitForReview(curve, { attribution });
                }}
                onContinueUpload={({ attribution }) => {
                    setDialog(null);
                    onContinueUpload(curve, { attribution });
                }}
            />

            <Modal
                isOpen={dialog === 'discard'}
                onClose={() => setDialog(null)}
                size="sm"
                title="Discard this draft?"
                footer={
                    <>
                        <Button size="sm" variant="ghost" onClick={() => setDialog(null)}>
                            Keep editing
                        </Button>
                        <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                                ws.discardCurve(curve.id);
                                setDialog(null);
                                nav.back();
                                notify('Draft discarded. The runs haven’t changed.');
                            }}
                        >
                            Discard draft
                        </Button>
                    </>
                }
            >
                <p className="surface-light text-sm text-zinc-700">The result and its label edits are deleted. The {curve.builtFrom.runs} source runs don’t change.</p>
            </Modal>
        </div>
    );
}
