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
import { Check, CircleAlert, Inbox, Trophy, Upload } from 'lucide-react';
import { Button, EmptyState, Panel, StatusChip, VisibilityChip } from '../ui';
import { cn } from '../../utils/cn';
import { ResultVisibilityChip } from './parts';
import { resultAudience, resultStatusLabel } from './instance';
import { curveChecks, fmtDay, formsSweep, mapSubmissionState } from './catalog';

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
// server reach them, and only if they were sent when it was submitted
// (`reviewReach`); the result itself can't leave this browser yet. An
// internal request waits for an approver and ends at Official.
function localSteps(curve, copy) {
    const checks = curveChecks(curve);
    const errors = checks.filter((c) => c.level === 'error').length;
    const warns = checks.filter((c) => c.level === 'warn').length;
    const reached = curve.reviewReach || 0;
    const checkStep = errors
        ? { label: `Checks: ${errors} failed`, state: 'warn' }
        : warns
          ? { label: `Checks: ${warns} need${warns === 1 ? 's' : ''} attention`, state: 'warn' }
          : { label: 'Checks passed', state: 'done' };
    if (copy.publishedStatus === 'official') {
        return [
            { label: 'Saved in this browser', state: 'done' },
            checkStep,
            { label: 'Waiting for an approver', state: 'now' },
            { label: copy.publishedLabel, state: 'todo' },
        ];
    }
    return [
        { label: 'Saved in this browser', state: 'done' },
        checkStep,
        reached
            ? { label: `Reviewers see its ${reached} uploaded run${reached === 1 ? '' : 's'}`, state: 'now' }
            : { label: 'Reviewers can’t see it yet', state: 'todo' },
        { label: copy.publishedLabel, state: 'todo' },
    ];
}

// `chip` replaces the visibility chip (saved results say where they live).
// `status` is left out where the section heading already says it.
function WorkRow({ title, status, statusLabel, visibility, chip, detail, meta, action, children }) {
    return (
        <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">{title}</span>
                    {status && <StatusChip status={status} size="xs" label={statusLabel} />}
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
function Section({ title, count, subtitle, actions, children }) {
    if (!count) return null;
    return (
        <Panel variant="editorial" padding="none" kicker={`${title} · ${count}`} kickerAs="h2" subtitle={subtitle} actions={actions}>
            <ul className="divide-y divide-zinc-100">{children}</ul>
        </Panel>
    );
}

// Everything you're curating, apart from browsing: drafts, uploads, what's
// waiting on an approver or reviewer, and what you've published. The sections
// are the same on both instances; only the words differ. `runOfId` finds a
// server submission's run when it's loaded, and `leaderboardOf` where a live
// result ranks.
export function MyWorkTab({
    curves,
    uploads,
    serverItems,
    instance,
    copy,
    actor,
    canPublish,
    officialBlock,
    nav,
    runOfId = () => null,
    leaderboardOf = () => null,
    onOpenLeaderboard,
    onUpload,
    onSignIn,
    signInReady = false,
}) {
    // Results saved before signing in are owned by 'you'; they're still in
    // this browser, so they stay in My Work after sign-in.
    const mine = curves.filter((c) => c.owner === actor || !c.owner || c.owner === 'you');
    const by = (status) => mine.filter((c) => c.status === status).sort((a, b) => b.updatedAt - a.updatedAt);
    const drafts = by('draft');
    const needsChanges = by('needs_changes');
    const inReview = by('in_review');
    const published = by(copy.publishedStatus);
    const declined = by('declined');
    const isPublic = instance === 'public';
    const signedIn = typeof actor === 'string' && actor.startsWith('@');
    const uploadsFormSweep = uploads.length >= 2 && formsSweep(uploads);
    // "1. Submit a run → 2. Curate the result → 3. Submit for review", in this instance's words.
    const flow = copy.steps.map((step, i) => `${i + 1}. ${step}`).join(' → ');
    const whoSentBack = copy.reviewer === 'approver' ? 'An approver' : 'A reviewer';
    const resubmit = copy.resubmitVerb.toLowerCase();

    const mapped = serverItems.map((s) => ({ ...s, ui: mapSubmissionState(s.status, { feedback: s.feedback, instance }) })).filter((s) => s.ui);
    const serverDrafts = mapped.filter((s) => s.ui.status === 'draft' && !uploads.some((r) => r.runId === s.runId));
    const serverChanges = mapped.filter((s) => s.ui.status === 'needs_changes' || s.ui.status === 'declined');
    const serverReview = mapped.filter((s) => s.ui.status === 'in_review');
    const serverPublished = mapped.filter((s) => s.ui.status === copy.publishedStatus);

    const total =
        drafts.length + uploads.length + serverDrafts.length + needsChanges.length + inReview.length + published.length + declined.length + serverChanges.length + serverReview.length + serverPublished.length;

    if (!total) {
        const message = isPublic
            ? `How it works: ${flow} (GitHub sign-in needed to submit). Drafts, reviews and what you publish show up here.`
            : officialBlock === 'signin'
              ? 'Edit a sweep in Browse to start a draft, or upload runs. Sign in to mark results official, or to ask an approver to.'
              : officialBlock === 'approver'
                ? `How it works: ${flow}. Drafts, your requests and what’s marked official show up here.`
                : `How it works: ${flow}. Drafts and what you mark official show up here.`;
        return (
            <div className="rounded-3xl border border-zinc-200 bg-white">
                <EmptyState
                    icon={<Inbox className="h-8 w-8" />}
                    title="Nothing here yet"
                    message={message}
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

    // A server submission's run, opened right here once it's loaded.
    const runAction = (s) => {
        const run = runOfId(s.runId);
        return run ? (
            <Button size="xs" variant="ghost" onClick={() => nav.openRun(run.key)}>
                View run
            </Button>
        ) : null;
    };

    // `leaderboard` adds the way to a live result's row on the Leaderboard.
    const curveRow = (c, extra = {}) => {
        const target = extra.leaderboard && onOpenLeaderboard ? leaderboardOf(c) : null;
        return (
            <WorkRow
                key={c.id}
                title={c.name}
                status={c.status}
                statusLabel={resultStatusLabel(c.status, copy)}
                chip={resultAudience(c.status) ? null : <ResultVisibilityChip curve={c} size="xs" />}
                meta={`v${c.version} · updated ${fmtDay(c.updatedAt)} · ${c.points.filter((p) => p.included).length} points`}
                action={
                    <>
                        {target && (
                            <Button size="xs" variant="ghost" onClick={() => onOpenLeaderboard(target)}>
                                <Trophy className="h-3.5 w-3.5" aria-hidden="true" /> Leaderboard
                            </Button>
                        )}
                        <Button size="xs" variant={extra.primary ? 'secondary' : 'ghost'} onClick={() => nav.openCurve(c.id)}>
                            {extra.label || 'Open'}
                        </Button>
                    </>
                }
                {...extra.rowProps}
            />
        );
    };

    // Who stands behind a live result, in one line: who asked (Internal
    // Prism), who marked it official or approved it, and when.
    const lineage = (c) => {
        const when = c.markedAt ? ` · ${fmtDay(c.markedAt)}` : '';
        if (c.status === 'official' && c.markedBy) {
            const asked = c.requestedBy && c.requestedBy !== c.markedBy ? `Requested by ${c.requestedBy} · ` : '';
            return `${asked}Marked official by ${c.markedBy}${when}`;
        }
        return c.reviewedBy ? `Approved by ${c.reviewedBy}${when}` : undefined;
    };

    return (
        <div className="space-y-6">
            {isPublic && !signedIn && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-700">
                    <div>
                        <span className="font-semibold text-zinc-900">Submission flow:</span> 1. {copy.steps[0]} → 2. {copy.steps[1]} (prune overloaded stages, check labels) → 3.{' '}
                        {copy.steps[2]}. <span className="text-zinc-500">Sign in with GitHub to submit runs to the public review queue.</span>
                    </div>
                    {onSignIn && (
                        <Button size="xs" variant="secondary" disabled={!signInReady} onClick={onSignIn}>
                            Sign in with GitHub
                        </Button>
                    )}
                </div>
            )}
            {!isPublic && officialBlock === 'signin' && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 text-xs text-zinc-700">
                    <div>
                        <span className="font-semibold text-zinc-900">How it works:</span> 1. {copy.steps[0]} → 2. {copy.steps[1]} (prune overloaded stages, check labels) → 3. Mark
                        it official, or ask an approver to. <span className="text-zinc-500">Sign in so Prism can record who asked and who approved.</span>
                    </div>
                    {onSignIn && (
                        <Button size="xs" variant="secondary" disabled={!signInReady} onClick={onSignIn}>
                            Sign in with GitHub
                        </Button>
                    )}
                </div>
            )}
            {/* First: the only section that's waiting on you. */}
            <Section
                title="Needs changes"
                count={needsChanges.length + declined.length + serverChanges.length}
                subtitle={
                    declined.length
                        ? `${whoSentBack} sent these back. Fix and ${resubmit}; reopen a declined result as a draft to change it.`
                        : `${whoSentBack} sent these back. Fix and ${resubmit}.`
                }
            >
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
                        meta={`Submitted ${s.submittedAt} · upload a fixed run to try again`}
                        action={
                            <>
                                {runAction(s)}
                                <Button size="xs" variant="ghost" onClick={onUpload}>
                                    {copy.uploadLabel}
                                </Button>
                            </>
                        }
                    />
                ))}
            </Section>

            <Section title="Drafts" count={drafts.length} subtitle="Only you can see a draft.">
                {/* The heading says Draft and the subtitle says who sees it, so rows only flag a draft someone shared. */}
                {drafts.map((c) =>
                    curveRow(c, { label: 'Edit', primary: true, rowProps: { status: null, chip: c.visibility !== 'me' ? <ResultVisibilityChip curve={c} size="xs" /> : null } })
                )}
            </Section>

            <Section
                title="Uploaded runs"
                count={uploads.length + serverDrafts.length}
                subtitle={`Runs you uploaded that aren’t in a result yet. ${
                    officialBlock === 'signin'
                        ? 'Edit one to prune points or fix labels; sign in to mark it official, or to ask an approver to.'
                        : `${copy.publishVerb} in one step, or edit first to prune points or fix labels.`
                }`}
                actions={
                    uploadsFormSweep ? (
                        <Button size="xs" variant="secondary" onClick={() => nav.makeCurve(uploads)}>
                            Combine {uploads.length} runs into 1 Result
                        </Button>
                    ) : null
                }
            >
                {/* Every upload here is unpublished, so rows say who can see them, not a status. */}
                {uploads.map((r) => {
                    const ui = mapSubmissionState(r.submissionState, { instance }) || { status: 'draft', visibility: 'me' };
                    return (
                        <WorkRow
                            key={r.key}
                            title={r.title}
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
                                    {canPublish([r]) && (
                                        <Button size="xs" variant="secondary" onClick={() => nav.publish([r])}>
                                            {copy.publishVerb}
                                        </Button>
                                    )}
                                </>
                            }
                        />
                    );
                })}
                {serverDrafts.map((s) => (
                    <WorkRow key={s.runId} title={`${s.model} · ${s.hardware}`} visibility={s.ui.visibility} meta={`Uploaded ${s.submittedAt}`} action={runAction(s)} />
                ))}
            </Section>

            <Section
                title="In review"
                count={inReview.length + serverReview.length}
                subtitle={
                    !isPublic
                        ? inReview.length
                            ? 'Waiting for an approver. Requests are saved in this browser until results are stored on the server.'
                            : 'Waiting for an approver. Nothing to do.'
                        : inReview.length
                          ? 'Results are saved in this browser for now, so reviewers only see runs you uploaded to the server.'
                          : 'Waiting for a reviewer. Nothing to do.'
                }
            >
                {inReview.map((c) =>
                    curveRow(c, {
                        rowProps: {
                            detail: isPublic ? `Saved for review ${fmtDay(c.submittedAt)} as ${c.attribution || actor}` : `Requested ${fmtDay(c.submittedAt)} by ${c.requestedBy || actor}`,
                            children: <Timeline steps={localSteps(c, copy)} />,
                        },
                    })
                )}
                {serverReview.map((s) => (
                    <WorkRow key={s.runId} title={`${s.model} · ${s.hardware}`} status="in_review" visibility="reviewers" detail={s.ui.detail} meta={`Submitted ${s.submittedAt}`}>
                        <Timeline steps={serverSteps(s.status)} />
                    </WorkRow>
                ))}
            </Section>

            <Section
                title={copy.mineSection}
                count={published.length + serverPublished.length}
                subtitle={published.length ? 'Editing one opens a new version.' : isPublic ? 'Live for everyone.' : 'Everyone on this instance can see these.'}
            >
                {published.map((c) =>
                    // The heading and chip already say Official / Published: say who and when.
                    curveRow(c, { leaderboard: true, rowProps: { detail: lineage(c) } })
                )}
                {serverPublished.map((s) => (
                    <WorkRow
                        key={s.runId}
                        title={`${s.model} · ${s.hardware}`}
                        status={s.ui.status}
                        statusLabel={copy.publishedLabel}
                        visibility={s.ui.visibility}
                        meta={`Submitted ${s.submittedAt}${s.ui.featured ? ' · Featured' : ''}`}
                        action={runAction(s)}
                    />
                ))}
            </Section>
        </div>
    );
}
