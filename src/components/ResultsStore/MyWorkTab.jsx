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

import React from 'react';
import { Check, CircleAlert, Inbox, Upload } from 'lucide-react';
import { Button, EmptyState, Panel, StatusChip, VisibilityChip } from '../ui';
import { cn } from '../../utils/cn';
import { ResultVisibilityChip } from './parts';
import { resultAudience, resultStatusLabel } from './instance';
import { curveChecks, fmtDay, mapSubmissionState } from './catalog';

// Each step says what actually happened: done · now · warn · todo.
function Timeline({ steps }) {
    return (
        <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            {steps.map((step, i) => (
                <li key={step.label} className="flex items-center gap-2">
                    <span
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-tiny font-medium',
                            step.state === 'done' ? 'bg-emerald-500/10 text-emerald-700' : step.state === 'todo' ? 'bg-zinc-100 text-zinc-500' : 'bg-amber-500/10 text-amber-700'
                        )}
                    >
                        {step.state === 'done' && <Check className="h-3 w-3" aria-hidden="true" />}
                        {step.state === 'warn' && <CircleAlert className="h-3 w-3" aria-hidden="true" />}
                        {step.label}
                    </span>
                    {i < steps.length - 1 && <span className="h-px w-3 bg-zinc-300" aria-hidden="true" />}
                </li>
            ))}
        </ol>
    );
}

// Server submissions: automatic checks run first, and an item only reaches
// the review queue once they pass (server/results/processing.ts).
function serverSteps(status) {
    const checking = status === 'submitted_pending_processing';
    const published = status === 'published' || status === 'public';
    return [
        { label: 'Submitted', state: 'done' },
        { label: checking ? 'Checks running' : 'Checks passed', state: checking ? 'now' : 'done' },
        { label: 'In review', state: published ? 'done' : checking ? 'todo' : 'now' },
        { label: 'Published', state: published ? 'done' : 'todo' },
    ];
}

// Results saved in this browser: Prism's own checks as they stand now, and
// whether reviewers can see anything. Only uploaded runs that live on the
// server reach them; the result itself can't leave this browser yet.
function localSteps(curve) {
    const checks = curveChecks(curve);
    const errors = checks.filter((c) => c.level === 'error').length;
    const warns = checks.filter((c) => c.level === 'warn').length;
    const onServer = (curve.submissionRunIds || []).length > 0;
    return [
        { label: 'Saved in this browser', state: 'done' },
        errors
            ? { label: `Checks: ${errors} failed`, state: 'warn' }
            : warns
              ? { label: `Checks: ${warns} need${warns === 1 ? 's' : ''} attention`, state: 'warn' }
              : { label: 'Checks passed', state: 'done' },
        onServer ? { label: 'Reviewers see the uploaded runs', state: 'now' } : { label: 'Reviewers can’t see it yet', state: 'todo' },
        { label: 'Published', state: 'todo' },
    ];
}

// `chip` replaces the visibility chip (saved results say where they live).
function WorkRow({ title, status, statusLabel, visibility, chip, detail, meta, action, children }) {
    return (
        <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{title}</span>
                    <StatusChip status={status} size="xs" label={statusLabel} />
                    {chip || (visibility && <VisibilityChip visibility={visibility} size="xs" />)}
                </div>
                {detail && <p className="mt-1 text-xs text-zinc-700">{detail}</p>}
                {meta && <p className="mt-0.5 text-micro text-zinc-500">{meta}</p>}
                {children}
            </div>
            {action && <div className="flex shrink-0 gap-2">{action}</div>}
        </li>
    );
}

// The kicker ("Drafts · 3") is the section's only label, so it's the heading.
function Section({ title, count, subtitle, children }) {
    if (!count) return null;
    return (
        <Panel variant="editorial" padding="none" kicker={`${title} · ${count}`} kickerAs="h2" subtitle={subtitle}>
            <ul className="divide-y divide-zinc-100">{children}</ul>
        </Panel>
    );
}

// Everything you're curating, apart from browsing: drafts, uploads, what's
// waiting on a reviewer and what you've published.
export function MyWorkTab({ curves, uploads, serverItems, instance, copy, actor, nav, onOpenClassic, onUpload }) {
    const mine = curves.filter((c) => c.owner === actor || !c.owner);
    const by = (status) => mine.filter((c) => c.status === status).sort((a, b) => b.updatedAt - a.updatedAt);
    const drafts = by('draft');
    const needsChanges = by('needs_changes');
    const inReview = by('in_review');
    const published = by(copy.publishedStatus);
    const declined = by('declined');
    const isPublic = instance === 'public';

    const mapped = serverItems.map((s) => ({ ...s, ui: mapSubmissionState(s.status, { feedback: s.feedback, instance }) })).filter((s) => s.ui);
    const serverDrafts = mapped.filter((s) => s.ui.status === 'draft' && !uploads.some((r) => r.runId === s.runId));
    const serverChanges = mapped.filter((s) => s.ui.status === 'needs_changes' || s.ui.status === 'declined');
    const serverReview = mapped.filter((s) => s.ui.status === 'in_review');
    const serverPublished = mapped.filter((s) => s.ui.status === copy.publishedStatus);

    const total =
        drafts.length + uploads.length + serverDrafts.length + needsChanges.length + inReview.length + published.length + declined.length + serverChanges.length + serverReview.length + serverPublished.length;

    if (!total) {
        return (
            <div className="rounded-3xl border border-zinc-200 bg-white">
                <EmptyState
                    icon={<Inbox className="h-8 w-8" />}
                    title="Nothing here yet"
                    message={
                        isPublic
                            ? 'Submit your results to get started. Drafts, reviews and what you publish show up here.'
                            : 'Mark a sweep official in Browse, or upload runs. Drafts and what you publish show up here.'
                    }
                    action={
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button size="xs" variant="secondary" onClick={() => nav.goTab('browse')}>
                                Browse runs
                            </Button>
                            <Button size="xs" variant="ghost" onClick={onUpload}>
                                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                                {copy.uploadLabel}
                            </Button>
                        </div>
                    }
                />
            </div>
        );
    }

    const curveRow = (c, extra = {}) => (
        <WorkRow
            key={c.id}
            title={c.name}
            status={c.status}
            statusLabel={resultStatusLabel(c.status, copy)}
            chip={resultAudience(c.status) ? null : <ResultVisibilityChip curve={c} size="xs" />}
            meta={`v${c.version} · updated ${fmtDay(c.updatedAt)} · ${c.points.filter((p) => p.included).length} points`}
            action={
                <Button size="xs" variant={extra.primary ? 'secondary' : 'ghost'} onClick={() => nav.openCurve(c.id)}>
                    {extra.label || 'Open'}
                </Button>
            }
            {...extra.rowProps}
        />
    );

    return (
        <div className="space-y-6">
            <Section title="Drafts" count={drafts.length} subtitle="Only you can see a draft.">
                {drafts.map((c) => curveRow(c, { label: 'Edit', primary: true }))}
            </Section>

            <Section
                title="Uploaded runs"
                count={uploads.length + serverDrafts.length}
                subtitle={`Runs you uploaded that aren’t in a result yet. ${copy.publishVerb} in one step, or edit first to prune points or fix labels.`}
            >
                {uploads.map((r) => {
                    const ui = mapSubmissionState(r.submissionState, { instance }) || { status: 'draft', visibility: 'me' };
                    return (
                        <WorkRow
                            key={r.key}
                            title={r.title}
                            status={ui.status}
                            visibility={ui.visibility}
                            meta={`${r.isLocalOnly ? 'Only in this browser' : 'Uploaded'} · ${fmtDay(r.ts)} · ${r.points.length} stage${r.points.length === 1 ? '' : 's'}`}
                            action={
                                <>
                                    <Button size="xs" variant="ghost" onClick={() => nav.openRun(r.key)}>
                                        View run
                                    </Button>
                                    <Button size="xs" variant="ghost" onClick={() => nav.makeCurve([r])}>
                                        Edit
                                    </Button>
                                    <Button size="xs" variant="secondary" onClick={() => nav.publish([r])}>
                                        {copy.publishVerb}
                                    </Button>
                                </>
                            }
                        />
                    );
                })}
                {serverDrafts.map((s) => (
                    <WorkRow
                        key={s.runId}
                        title={`${s.model} · ${s.hardware}`}
                        status={s.ui.status}
                        visibility={s.ui.visibility}
                        meta={`Uploaded ${s.submittedAt}`}
                        action={
                            <Button size="xs" variant="ghost" onClick={onOpenClassic}>
                                Open in classic view
                            </Button>
                        }
                    />
                ))}
            </Section>

            {isPublic && (
                <Section title="Needs changes" count={needsChanges.length + declined.length + serverChanges.length} subtitle="A reviewer sent these back. Fix and submit again.">
                    {[...needsChanges, ...declined].map((c) =>
                        curveRow(c, { label: c.status === 'declined' ? 'Open' : 'Fix', primary: true, rowProps: { detail: c.feedback ? `“${c.feedback}”` : undefined } })
                    )}
                    {serverChanges.map((s) => (
                        <WorkRow
                            key={s.runId}
                            title={`${s.model} · ${s.hardware}`}
                            status={s.ui.status}
                            visibility={s.ui.visibility}
                            detail={s.feedback ? `“${s.feedback}”` : undefined}
                            meta={`Submitted ${s.submittedAt}`}
                            action={
                                <Button size="xs" variant="ghost" onClick={onOpenClassic}>
                                    Open in classic view
                                </Button>
                            }
                        />
                    ))}
                </Section>
            )}

            {isPublic && (
                <Section
                    title="In review"
                    count={inReview.length + serverReview.length}
                    subtitle={
                        inReview.length
                            ? 'Results are saved in this browser for now, so reviewers only see runs you uploaded to the server.'
                            : 'Waiting for a reviewer. Nothing to do.'
                    }
                >
                    {inReview.map((c) =>
                        curveRow(c, {
                            rowProps: {
                                detail: `Saved for review ${fmtDay(c.submittedAt)} as ${c.attribution || actor}`,
                                children: <Timeline steps={localSteps(c)} />,
                            },
                        })
                    )}
                    {serverReview.map((s) => (
                        <WorkRow key={s.runId} title={`${s.model} · ${s.hardware}`} status="in_review" visibility="reviewers" detail={s.ui.detail} meta={`Submitted ${s.submittedAt}`}>
                            <Timeline steps={serverSteps(s.status)} />
                        </WorkRow>
                    ))}
                </Section>
            )}

            <Section
                title={copy.mineSection}
                count={published.length + serverPublished.length}
                subtitle={
                    published.length
                        ? 'Results you publish here are saved in this browser for now. Editing opens a new version.'
                        : isPublic
                          ? 'Live for everyone.'
                          : 'Everyone on this instance can see these.'
                }
            >
                {published.map((c) =>
                    curveRow(c, {
                        rowProps: {
                            detail: c.markedBy ? `${copy.publishedLabel} · ${c.markedBy} · ${fmtDay(c.markedAt)}` : undefined,
                        },
                    })
                )}
                {serverPublished.map((s) => (
                    <WorkRow
                        key={s.runId}
                        title={`${s.model} · ${s.hardware}`}
                        status={s.ui.status}
                        statusLabel={copy.publishedLabel}
                        visibility={s.ui.visibility}
                        meta={`Submitted ${s.submittedAt}${s.ui.featured ? ' · Featured' : ''}`}
                    />
                ))}
            </Section>
        </div>
    );
}
