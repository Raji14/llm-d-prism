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
import { Inbox, RefreshCw, RotateCcw, Trophy } from 'lucide-react';
import { Badge, Button, ChartContainer, EmptyState, Label, Panel, Spinner, StatusChip, Textarea, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { Attachments, BackButton, CheckList, HistoryList, MetaGrid, Notice, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { closeness, curveChecks, curveConfig, curveDraftFromRuns, fmtDay, seriesPoints } from './catalog';

const CHANGE_REASONS = [
    'Hardware or model label looks wrong',
    'Exclude overloaded or failed stage',
    'Configs or logs missing',
    'Add more concurrency points',
    'Clarify setup or notes',
];

// The same queue on both instances, named the way each one names it: on
// Internal Prism a request to mark a result official, on the public store a
// submission to publish.
function wordsFor(instance) {
    const internal = instance === 'internal';
    return {
        internal,
        item: internal ? 'request' : 'submission',
        person: internal ? 'requester' : 'contributor',
        submitted: internal ? 'Requested' : 'Submitted',
        live: internal ? 'official' : 'published',
        reviewer: internal ? 'approver' : 'reviewer',
        declineReasons: [
            `Duplicates an already-${internal ? 'official' : 'published'} result`,
            'Failed requests over 5% across the sweep',
            'Synthetic or incomplete run data',
            'Wrong benchmark harness or unverified source',
            internal ? 'Withdrawn by the requester' : 'Withdrawn by contributor',
        ],
    };
}

const cleanHandle = (s) => String(s || '').trim().replace(/^@/, '').toLowerCase();

const summarize = (checks) => {
    const bad = checks.filter((c) => c.level === 'warn' || c.level === 'error').length;
    const ok = checks.filter((c) => c.level === 'ok').length;
    return bad ? `${ok} checks passed · ${bad} need${bad === 1 ? 's' : ''} attention` : `${ok} checks passed`;
};

// Which metadata fields were edited away from what the run files recorded.
function editedFieldsOf(curve) {
    if (!curve?.meta || !curve?.original) return [];
    const out = [];
    if (curve.meta.model !== curve.original.model) out.push(`Model (${curve.original.model || 'missing'} → ${curve.meta.model})`);
    if (curve.meta.accelerator !== curve.original.accelerator) out.push(`Accelerator (${curve.original.accelerator || 'missing'} → ${curve.meta.accelerator})`);
    if (curve.meta.category !== curve.original.category) out.push(`Category (${curve.original.category} → ${curve.meta.category})`);
    if (curve.original.workload !== undefined && curve.meta.workload !== curve.original.workload) {
        out.push(`Workload (${curve.original.workload || 'missing'} → ${curve.meta.workload})`);
    }
    return out;
}

// Published results that already include any of the same underlying runs.
function duplicatePublishedOf(curve, baselines) {
    const keys = new Set(curve?.builtFrom?.runKeys || []);
    if (!keys.size || !baselines?.length) return [];
    return baselines.filter(
        (b) => b.id !== curve.id && b.id !== curve.supersedes && (b.builtFrom?.runKeys || []).some((k) => keys.has(k))
    );
}

// A server submission becomes a curve-shaped object so the reviewer sees the
// same evidence either way. Runs that aren't loaded show metadata only.
function toReviewItem(entry, runsById, baselines) {
    if (entry.kind === 'curve') {
        const checks = curveChecks(entry.curve);
        const editedFields = editedFieldsOf(entry.curve);
        const duplicates = duplicatePublishedOf(entry.curve, baselines);
        return { ...entry, checks, editedFields, duplicates };
    }
    const run = runsById.get(entry.runId);
    const draft = run ? curveDraftFromRuns([run]) : null;
    const curve = draft
        ? { ...draft, id: entry.runId, name: run.title, baselines: [], status: 'in_review', visibility: 'reviewers', history: [], version: 1 }
        : null;
    return {
        ...entry,
        run: run || null,
        curve,
        checks: curve ? curveChecks(curve) : [],
        editedFields: curve ? editedFieldsOf(curve) : [],
        duplicates: curve ? duplicatePublishedOf(curve, baselines) : [],
    };
}

// The files uploaded with the runs under review, labelled by run when
// there's more than one.
function reviewFiles(runs) {
    return runs.flatMap((r) => (r.attachments || []).map((f) => (runs.length > 1 ? { ...f, group: `${f.group} · run ${r.idLabel || r.runId}` } : f)));
}

function ReviewDetail({ item, actor, words: W, baselines, runsFromKeys, onBack, onDecide }) {
    const [mode, setMode] = useState(null);
    const [reasons, setReasons] = useState([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const c = item.curve;
    // What the contributor uploaded with the runs: configs, run metadata, logs.
    const files = reviewFiles(item.kind === 'curve' ? runsFromKeys(c?.builtFrom?.runKeys || []) : item.run ? [item.run] : []);
    // Published results of the same model, closest setup first (hardware,
    // chips, workload), so the overlay compares like with like.
    const sameModel = c ? baselines.filter((b) => b.meta.model === c.meta.model && b.id !== c.id) : [];
    const target = c ? curveConfig(c) : null;
    const overlaid = sameModel
        .map((b, i) => ({ b, i, score: closeness(curveConfig(b), target) }))
        .sort((x, y) => y.score - x.score || x.i - y.i)
        .slice(0, 4)
        .map((x) => x.b);
    const included = c ? c.points.filter((p) => p.included) : [];
    const feedback = [...reasons, note.trim()].filter(Boolean).join('. ');
    // Open on a latency (and statistic) the submission recorded, not always TTFT.
    const view = useChartView(c ? [c.points] : [], { extraLists: overlaid.map((b) => b.points.filter((p) => p.included)) });
    const { latency, stat, throughput } = view;

    // Like a pull request: whoever asked can't approve it themselves.
    const actorHandle = cleanHandle(actor);
    const submitterHandles = [cleanHandle(item.by), cleanHandle(c?.owner), cleanHandle(c?.attribution), cleanHandle(c?.requestedBy)].filter(Boolean);
    const isSameNamedUser = Boolean(actorHandle && actorHandle !== 'you' && submitterHandles.includes(actorHandle));
    const isPreviewSelf = Boolean(actorHandle === 'you' && submitterHandles.includes('you'));
    const blockingErrors = (item.checks || []).filter((chk) => chk.level === 'error');
    const warnings = (item.checks || []).filter((chk) => chk.level === 'warn');

    const switchMode = (nextMode) => {
        setMode((prev) => (prev === nextMode ? null : nextMode));
        setReasons([]);
        setNote('');
    };

    // One decision at a time: the buttons stay disabled until the server answers.
    const decide = async (decision, text) => {
        setBusy(true);
        try {
            await onDecide(item, decision, text);
        } finally {
            setBusy(false);
        }
    };

    const activeReasons = mode === 'decline' ? W.declineReasons : CHANGE_REASONS;

    return (
        <div className="space-y-6">
            <BackButton onClick={onBack}>Back to queue</BackButton>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <div className="kicker text-accent-600">{W.internal ? 'Request' : 'Review'}</div>
                    <h2 className="display-title mt-1 text-2xl text-zinc-900">{item.title}</h2>
                    <p className="mt-1 text-xs text-zinc-600">
                        {W.submitted} {item.submittedAt ? fmtDay(item.submittedAt) : ''} by <span className="font-medium text-zinc-900">{item.by}</span> · {summarize(item.checks)}
                    </p>
                    {/* Public results record the sign-off and where they go once approved;
                        an internal result goes to everyone on this Prism. */}
                    {item.kind === 'curve' && c && W.internal && (
                        <p className="mt-0.5 text-xs text-zinc-600">Becomes Official once you approve it, for everyone on this Prism.</p>
                    )}
                    {item.kind === 'curve' && c && !W.internal && (
                        <p className="mt-0.5 text-xs text-zinc-600">
                            {c.dco ? (
                                <>
                                    DCO {c.dco.version} signed by <span className="font-medium text-zinc-900">{c.dco.by}</span>
                                    {c.dco.at ? ` on ${fmtDay(c.dco.at)}` : ''}
                                </>
                            ) : (
                                <span className="text-amber-700">No DCO sign-off recorded</span>
                            )}
                            {' · '}
                            {c.publishVisibility === 'link' ? 'Link only once approved (not listed in the store)' : 'Listed in the store once approved'}
                        </p>
                    )}
                    {(item.editedFields?.length > 0 || item.duplicates?.length > 0) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.editedFields?.length > 0 && (
                                <Badge tone="warning" size="xs">
                                    Labels edited: {item.editedFields.join(' · ')}
                                </Badge>
                            )}
                            {item.duplicates?.length > 0 && (
                                <Badge tone="warning" size="xs">
                                    Shares runs with {W.live}: {item.duplicates.map((d) => d.name).join(', ')}
                                </Badge>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="dangerOutline" disabled={busy} onClick={() => switchMode('decline')}>
                        Decline
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => switchMode('changes')}>
                        Request changes
                    </Button>
                    <Button
                        size="sm"
                        disabled={busy || isSameNamedUser || blockingErrors.length > 0}
                        title={
                            isSameNamedUser
                                ? `You can’t approve your own ${W.item}`
                                : blockingErrors.length > 0
                                  ? 'Fix blocking validation errors before approving'
                                  : undefined
                        }
                        onClick={() => switchMode('approve')}
                    >
                        Approve…
                    </Button>
                </div>
            </header>

            {isSameNamedUser && (
                <Notice tone="warning">
                    {W.internal ? 'You asked for this' : 'You submitted this result'} (<span className="font-medium">{item.by}</span>), so another {W.reviewer} must approve it. You can
                    still request changes or decline it.
                </Notice>
            )}
            {blockingErrors.length > 0 && (
                <Notice tone="warning">
                    This {W.item} has {blockingErrors.length} blocking validation error{blockingErrors.length === 1 ? '' : 's'} ({blockingErrors.map((e) => e.text).join(' ')}) and cannot be
                    approved until resolved. Request changes so the {W.person} can fix it.
                </Notice>
            )}

            {mode === 'approve' && (
                <Panel
                    variant="editorial"
                    title={W.internal ? 'Confirm and mark official' : 'Confirm approval & publication'}
                    subtitle={
                        W.internal
                            ? `Marks this result Official, with ${item.by} recorded as the one who asked and you as the approver. You can undo right after approving.`
                            : c?.publishVisibility === 'link'
                              ? `Marks this result Published (link-only) attributed to ${item.by}. You can undo right after approving.`
                              : `Publishes this result to the store attributed to ${item.by}. You can undo right after approving.`
                    }
                >
                    <div className="space-y-3 text-xs text-zinc-700">
                        {W.internal ? (
                            <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5 sm:grid-cols-3">
                                <div>
                                    <div className="label-caps text-zinc-500">Requested by</div>
                                    <div className="mt-0.5 font-medium text-zinc-900">{item.by || 'Not recorded'}</div>
                                </div>
                                <div>
                                    <div className="label-caps text-zinc-500">Approver</div>
                                    <div className="mt-0.5 font-medium text-zinc-900">{actor}</div>
                                </div>
                                <div>
                                    <div className="label-caps text-zinc-500">Who sees it</div>
                                    <div className="mt-0.5 font-medium text-zinc-900">Everyone on this Prism</div>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-3.5 sm:grid-cols-3">
                                <div>
                                    <div className="label-caps text-zinc-500">Attribution</div>
                                    <div className="mt-0.5 font-medium text-zinc-900">{item.by || 'Not recorded'}</div>
                                </div>
                                <div>
                                    <div className="label-caps text-zinc-500">DCO sign-off</div>
                                    <div className="mt-0.5 font-medium text-zinc-900">{c?.dco ? `${c.dco.version} signed by ${c.dco.by}` : 'Not recorded'}</div>
                                </div>
                                <div>
                                    <div className="label-caps text-zinc-500">Visibility once approved</div>
                                    <div className="mt-0.5 font-medium text-zinc-900">{c?.publishVisibility === 'link' ? 'Anyone with the link' : 'Listed in the store'}</div>
                                </div>
                            </div>
                        )}
                        {isPreviewSelf && (
                            <Notice tone="warning">
                                Preview mode note: both {W.person} and {W.reviewer} are <span className="font-mono">@you</span> in this browser preview. In production, a {W.item} needs a second{' '}
                                {W.reviewer} to approve it.
                            </Notice>
                        )}
                        {item.editedFields?.length > 0 && (
                            <Notice tone="warning">
                                The {W.person} edited recorded labels: <span className="font-medium">{item.editedFields.join(', ')}</span>. Verify against the attached config files before
                                approving.
                            </Notice>
                        )}
                        {item.duplicates?.length > 0 && (
                            <Notice tone="warning">
                                Shares underlying runs with already-{W.live} result{item.duplicates.length === 1 ? '' : 's'}:{' '}
                                <span className="font-medium">{item.duplicates.map((d) => d.name).join(', ')}</span>.
                            </Notice>
                        )}
                        {warnings.length > 0 && (
                            <Notice tone="warning">
                                {warnings.length} validation warning{warnings.length === 1 ? '' : 's'} still open: {warnings.map((w) => w.text).join(' ')}
                            </Notice>
                        )}
                        <div className="flex justify-end gap-2 pt-1">
                            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                                Cancel
                            </Button>
                            <Button size="sm" disabled={busy || isSameNamedUser || blockingErrors.length > 0} onClick={() => decide('approve')}>
                                {W.internal ? 'Confirm & mark official' : 'Confirm & publish'}
                            </Button>
                        </div>
                    </div>
                </Panel>
            )}

            {(mode === 'changes' || mode === 'decline') && (
                <Panel
                    variant="editorial"
                    title={mode === 'decline' ? `Decline this ${W.item}` : `Request changes from the ${W.person}`}
                    subtitle={
                        W.internal
                            ? mode === 'decline'
                                ? 'Closes the request and marks the result “Declined” in the requester’s My work. Use this when the result shouldn’t be official.'
                                : 'Sends the result back to the requester’s My work as “Needs changes”, so they can fix labels or points and request again.'
                            : mode === 'decline'
                              ? 'Closes this review and marks the submission “Declined” in the contributor’s My work. Use this when the benchmark itself isn’t suitable to publish.'
                              : 'Sends the submission back to the contributor in My work as “Needs changes” so they can fix labels, points or attachments and resubmit.'
                    }
                >
                    <div className="flex flex-wrap gap-2">
                        {activeReasons.map((r) => (
                            <button
                                key={r}
                                type="button"
                                aria-pressed={reasons.includes(r)}
                                onClick={() => setReasons((prev) => (prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]))}
                                className={cn(
                                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                                    reasons.includes(r) ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                                )}
                            >
                                {r}
                            </button>
                        ))}
                    </div>
                    <div className="mt-4">
                        <Label surface="light" htmlFor="rs-review-note">
                            {mode === 'decline' ? `Why is this ${W.item} being declined?` : `What should the ${W.person} change?`}
                        </Label>
                        <Textarea
                            surface="light"
                            id="rs-review-note"
                            rows={3}
                            className="font-sans text-sm"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder={
                                mode === 'decline'
                                    ? `Explain why this result can’t be ${W.live} (shown to the ${W.person} in My work)…`
                                    : `Describe the label, stage or config fixes needed before ${W.internal ? 'requesting again' : 'resubmitting'}…`
                            }
                        />
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant={mode === 'decline' ? 'danger' : 'primary'} disabled={!feedback || busy} onClick={() => decide(mode, feedback)}>
                            {mode === 'decline' ? `Decline ${W.item}` : 'Send back for changes'}
                        </Button>
                    </div>
                </Panel>
            )}

            {c ? (
                <>
                    <ChartContainer
                        title={`Against ${W.live} results`}
                        subtitle={sameModel.length ? `${sameModel.length} ${W.live} result${sameModel.length === 1 ? '' : 's'} for ${c.meta.model} overlaid (dashed).` : `No ${W.live} result for this model yet.`}
                        actions={<MetricToggles view={view} />}
                    >
                        <CurveChart
                            latency={latency}
                            stat={stat}
                            throughput={throughput}
                            series={[
                                {
                                    id: c.id,
                                    name: 'Submission',
                                    color: seriesColor(0),
                                    points: seriesPoints(included, { latency, stat, throughput }),
                                    excluded: seriesPoints(c.points.filter((p) => !p.included), { latency, stat, throughput }),
                                },
                                ...overlaid.map((b, i) => ({
                                    id: b.id,
                                    name: b.name,
                                    color: seriesColor(i + 1),
                                    lineStyle: 'dashed',
                                    shape: 'diamond',
                                    points: seriesPoints(b.points.filter((p) => p.included), { latency, stat, throughput }),
                                })),
                            ]}
                        />
                    </ChartContainer>
                    <div className="grid gap-6 lg:grid-cols-2">
                        <Panel variant="editorial" title="Metadata" subtitle="Edited labels are highlighted. Measured values can’t be edited.">
                            <MetaGrid
                                columns={2}
                                items={[
                                    { label: 'Model', value: c.meta.model, was: c.meta.model !== c.original.model ? c.original.model : undefined },
                                    { label: 'Accelerator', value: c.meta.accelerator || 'Not recorded', was: c.meta.accelerator !== c.original.accelerator ? c.original.accelerator : undefined },
                                    { label: 'Category', value: c.meta.category, was: c.meta.category !== c.original.category ? c.original.category : undefined },
                                    { label: 'Workload', value: c.meta.workload, mono: true, was: c.original?.workload !== undefined && c.meta.workload !== c.original.workload ? c.original.workload : undefined },
                                    { label: 'Harness', value: c.meta.harness },
                                    { label: 'Points', value: `${included.length} of ${c.points.length} included`, mono: true },
                                    { label: 'Notes', value: c.meta.notes },
                                ]}
                            />
                        </Panel>
                        <Panel variant="editorial" title="Validation signals">
                            <CheckList checks={item.checks} readOnly />
                        </Panel>
                    </div>
                    <Panel variant="editorial" title="Lineage & attribution" subtitle={`${W.internal ? 'Requested by' : 'Attribution'}: ${item.by}`}>
                        <p className="mb-3 text-xs text-zinc-600">
                            Built from {c.builtFrom.runs} run{c.builtFrom.runs === 1 ? '' : 's'} · {c.builtFrom.label}
                        </p>
                        <HistoryList history={c.history} />
                    </Panel>
                    <Panel
                        variant="editorial"
                        title="Configs & logs"
                        subtitle={files.length ? 'Uploaded with the runs, as submitted.' : 'Nothing was uploaded with these runs, or the runs aren’t loaded here.'}
                    >
                        <Attachments files={files} />
                    </Panel>
                </>
            ) : (
                <EmptyState title="Run data isn’t loaded" message={`The ${W.item}’s files aren’t in this view yet. You can still approve it or request changes from its metadata.`} />
            )}
        </div>
    );
}

// One queue, oldest first, each with a summary of its automatic checks: the
// Review queue on the public store, the Approval queue on an internal one.
// `leaderboardOf(id)` says where an approved result now ranks, if it does.
export function ReviewQueueTab({
    localCurves,
    serverItems,
    actor,
    copy,
    instance = 'public',
    loading,
    error,
    runsById,
    runsFromKeys = () => [],
    baselines,
    leaderboardOf = () => null,
    onOpenLeaderboard,
    onRefresh,
    onDecide,
    onUndoApprove,
}) {
    const W = wordsFor(instance);
    const queueName = copy?.reviewTab || (W.internal ? 'Approval queue' : 'Review queue');
    const [activeId, setActiveId] = useState(null);
    const [lastApproved, setLastApproved] = useState(null);
    const items = useMemo(() => {
        const local = localCurves.map((c) => ({ kind: 'curve', id: c.id, title: c.name, by: c.requestedBy || c.attribution || c.owner, submittedAt: c.submittedAt, curve: c }));
        const remote = serverItems.map((s) => ({ kind: 'server', id: s.runId, runId: s.runId, title: s.title, by: s.by, submittedAt: s.submittedAt, state: s.state }));
        return [...local, ...remote].map((e) => toReviewItem(e, runsById, baselines)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    }, [localCurves, serverItems, runsById, baselines]);
    const active = items.find((i) => i.id === activeId);
    // Where the result just approved now ranks (once the approval has saved).
    const approvedTarget = lastApproved?.kind === 'curve' && onOpenLeaderboard ? leaderboardOf(lastApproved.id) : null;

    if (active) {
        return (
            <ReviewDetail
                key={active.id}
                item={active}
                actor={actor}
                words={W}
                baselines={baselines}
                runsFromKeys={runsFromKeys}
                onBack={() => setActiveId(null)}
                onDecide={async (item, decision, feedback) => {
                    const ok = await onDecide(item, decision, feedback);
                    // A refused decision keeps the reviewer on the item, note intact.
                    if (ok !== false) {
                        if (decision === 'approve') setLastApproved({ id: item.id, kind: item.kind, title: item.title });
                        else setLastApproved(null);
                        setActiveId(null);
                    }
                }}
            />
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="sr-only">{queueName}</h2>
            {lastApproved && onUndoApprove && (
                <Notice onDismiss={() => setLastApproved(null)}>
                    <span className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                            Approved <span className="font-medium text-zinc-900">“{lastApproved.title}”</span> and {W.internal ? 'marked it official' : 'published it'}.
                        </span>
                        <span className="flex flex-wrap gap-2">
                            {approvedTarget && (
                                <Button size="xs" variant="secondary" onClick={() => onOpenLeaderboard(approvedTarget)}>
                                    <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                                    See it on the Leaderboard
                                </Button>
                            )}
                            <Button
                                size="xs"
                                variant="secondary"
                                onClick={() => {
                                    onUndoApprove(lastApproved);
                                    setActiveId(lastApproved.id);
                                    setLastApproved(null);
                                }}
                            >
                                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                Undo approval
                            </Button>
                        </span>
                    </span>
                </Notice>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-zinc-600">
                    <span className="font-mono tabular-nums text-zinc-900">{items.length}</span> waiting · oldest first
                </p>
                <Button size="xs" variant="ghost" onClick={onRefresh} disabled={loading}>
                    {loading ? <Spinner size="xs" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                    Refresh
                </Button>
            </div>
            {/* An alert, so a failed load is read out when the message appears. */}
            {error && (
                <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    {error}
                </p>
            )}
            {items.length === 0 ? (
                <div className="rounded-3xl border border-zinc-200 bg-white">
                    <EmptyState
                        icon={<Inbox className="h-8 w-8" />}
                        title={W.internal ? 'Nothing to approve' : 'Nothing to review'}
                        message={W.internal ? 'Requests to mark results official show up here, oldest first.' : 'Submissions waiting for a reviewer show up here, oldest first.'}
                    />
                </div>
            ) : (
                <ul className="divide-y divide-zinc-100 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                    {items.map((item) => (
                        <li key={item.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-zinc-900">{item.title}</span>
                                    {/* Results submitted here live in this browser; server submissions really are shared. */}
                                    {item.kind === 'curve' ? (
                                        <ResultStatusChip status={item.curve.status} size="xs" />
                                    ) : (
                                        <StatusChip status={item.state === 'submitted_pending_processing' ? 'checks_running' : 'in_review'} size="xs" />
                                    )}
                                    {item.editedFields?.length > 0 && (
                                        <Badge tone="warning" size="xs">
                                            Labels edited
                                        </Badge>
                                    )}
                                    {item.duplicates?.length > 0 && (
                                        <Badge tone="warning" size="xs">
                                            Duplicate runs
                                        </Badge>
                                    )}
                                </div>
                                <p className="mt-0.5 text-micro text-zinc-500">
                                    {item.by} · {W.submitted.toLowerCase()} {item.submittedAt ? fmtDay(item.submittedAt) : 'recently'} ·{' '}
                                    {item.checks.length ? summarize(item.checks) : 'checks run when the files load'}
                                </p>
                            </div>
                            <Button size="xs" variant="secondary" onClick={() => setActiveId(item.id)}>
                                Review
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
