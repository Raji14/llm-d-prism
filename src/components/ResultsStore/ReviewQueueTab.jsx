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
import { Inbox, RefreshCw } from 'lucide-react';
import { Button, ChartContainer, EmptyState, Label, Panel, Spinner, StatusChip, Textarea, seriesColor } from '../ui';
import { cn } from '../../utils/cn';
import { CurveChart, MetricToggles } from './CurveChart';
import { BackButton, CheckList, HistoryList, MetaGrid, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { closeness, curveChecks, curveConfig, curveDraftFromRuns, fmtDay, seriesPoints } from './catalog';

const REASONS = ['Failed requests over 5%', 'Hardware or labels look wrong', 'Configs or logs missing', 'Too few points', 'Duplicates a published result'];

const summarize = (checks) => {
    const bad = checks.filter((c) => c.level === 'warn' || c.level === 'error').length;
    const ok = checks.filter((c) => c.level === 'ok').length;
    return bad ? `${ok} checks passed · ${bad} need${bad === 1 ? 's' : ''} attention` : `${ok} checks passed`;
};

// A server submission becomes a curve-shaped object so the reviewer sees the
// same evidence either way. Runs that aren't loaded show metadata only.
function toReviewItem(entry, runsById) {
    if (entry.kind === 'curve') return { ...entry, checks: curveChecks(entry.curve) };
    const run = runsById.get(entry.runId);
    const draft = run ? curveDraftFromRuns([run]) : null;
    const curve = draft
        ? { ...draft, id: entry.runId, name: run.title, baselines: [], status: 'in_review', visibility: 'reviewers', history: [], version: 1 }
        : null;
    return { ...entry, curve, checks: curve ? curveChecks(curve) : [] };
}

function ReviewDetail({ item, baselines, onBack, onDecide }) {
    const [mode, setMode] = useState(null);
    const [reasons, setReasons] = useState([]);
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);
    const c = item.curve;
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
    // One decision at a time: the buttons stay disabled until the server answers.
    const decide = async (decision, text) => {
        setBusy(true);
        try {
            await onDecide(item, decision, text);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <BackButton onClick={onBack}>Back to queue</BackButton>
            <header className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-0">
                    <div className="kicker text-accent-600">Review</div>
                    <h2 className="display-title mt-1 text-2xl text-zinc-900">{item.title}</h2>
                    <p className="mt-1 text-xs text-zinc-600">
                        Submitted {item.submittedAt ? fmtDay(item.submittedAt) : ''} by <span className="font-medium text-zinc-900">{item.by}</span> · {summarize(item.checks)}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="dangerOutline" disabled={busy} onClick={() => setMode('decline')}>
                        Decline
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setMode('changes')}>
                        Request changes
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => decide('approve')}>
                        Approve
                    </Button>
                </div>
            </header>

            {mode && (
                <Panel variant="editorial" title={mode === 'decline' ? 'Decline this submission' : 'Request changes'} subtitle="The contributor sees this note in My work.">
                    <div className="flex flex-wrap gap-2">
                        {REASONS.map((r) => (
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
                            Note
                        </Label>
                        <Textarea surface="light" id="rs-review-note" rows={3} className="font-sans text-sm" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What should change?" />
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
                            Cancel
                        </Button>
                        <Button size="sm" variant={mode === 'decline' ? 'danger' : 'primary'} disabled={!feedback || busy} onClick={() => decide(mode, feedback)}>
                            {mode === 'decline' ? 'Decline' : 'Send to contributor'}
                        </Button>
                    </div>
                </Panel>
            )}

            {c ? (
                <>
                    <ChartContainer
                        title="Against published results"
                        subtitle={sameModel.length ? `${sameModel.length} published result${sameModel.length === 1 ? '' : 's'} for ${c.meta.model} overlaid (dashed).` : 'No published result for this model yet.'}
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
                                    { label: 'Workload', value: c.meta.workload, mono: true },
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
                    <Panel variant="editorial" title="Lineage & attribution" subtitle={`Attribution: ${item.by}`}>
                        <p className="mb-3 text-xs text-zinc-600">
                            Built from {c.builtFrom.runs} run{c.builtFrom.runs === 1 ? '' : 's'} · {c.builtFrom.label}
                        </p>
                        <HistoryList history={c.history} />
                    </Panel>
                </>
            ) : (
                <EmptyState title="Run data isn’t loaded" message="The submission’s files aren’t in this view yet. Approve or request changes from its metadata, or open it in the classic view." />
            )}
        </div>
    );
}

// One queue, oldest first, each with a summary of its automatic checks.
export function ReviewQueueTab({ localCurves, serverItems, loading, error, runsById, baselines, onRefresh, onDecide }) {
    const [activeId, setActiveId] = useState(null);
    const items = useMemo(() => {
        const local = localCurves.map((c) => ({ kind: 'curve', id: c.id, title: c.name, by: c.attribution || c.owner, submittedAt: c.submittedAt, curve: c }));
        const remote = serverItems.map((s) => ({ kind: 'server', id: s.runId, runId: s.runId, title: s.title, by: s.by, submittedAt: s.submittedAt, state: s.state }));
        return [...local, ...remote].map((e) => toReviewItem(e, runsById)).sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));
    }, [localCurves, serverItems, runsById]);
    const active = items.find((i) => i.id === activeId);

    if (active) {
        return (
            <ReviewDetail
                key={active.id}
                item={active}
                baselines={baselines}
                onBack={() => setActiveId(null)}
                onDecide={async (item, decision, feedback) => {
                    const ok = await onDecide(item, decision, feedback);
                    // A refused decision keeps the reviewer on the item, note intact.
                    if (ok !== false) setActiveId(null);
                }}
            />
        );
    }

    return (
        <div className="space-y-4">
            <h2 className="sr-only">Review queue</h2>
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
                    <EmptyState icon={<Inbox className="h-8 w-8" />} title="Nothing to review" message="Submissions waiting for a reviewer show up here, oldest first." />
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
                                </div>
                                <p className="mt-0.5 text-micro text-zinc-500">
                                    {item.by} · submitted {item.submittedAt ? fmtDay(item.submittedAt) : 'recently'} · {item.checks.length ? summarize(item.checks) : 'checks run when the files load'}
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
