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

// Publishing, in one dialog for both ways in: from the result editor, or in
// one step from a sweep or run (the result is created behind the scenes).
// Internal: Mark official, by an approver (signed in, admin). Public: Submit
// for review with attribution and the DCO. `onEditFirst` (one-step only) opens the editor.

import React, { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button, Checkbox, Input, Label, Modal, ToggleGroup } from '../ui';

// `localRuns` counts source runs uploaded only to this browser (the caller
// knows them even when the result's own list is out of date), and
// `reviewRuns` the uploaded runs reviewers would actually get (on the server
// and not public yet).
export function PublishDialog({
    subject,
    summary,
    checks,
    copy,
    instance,
    actor,
    localRuns = 0,
    reviewRuns,
    isOpen,
    onClose,
    onMarkOfficial,
    onSubmit,
    onContinueUpload,
    onEditFirst,
    onSignIn,
    signInReady = false,
}) {
    // Without sign-in the actor is just the word "you": don't record it as a name.
    const signedIn = typeof actor === 'string' && actor.startsWith('@');
    const [attribution, setAttribution] = useState(signedIn ? actor : '');
    const [dco, setDco] = useState(false);
    // Who sees it once a reviewer approves it: listed in the store, or only
    // people with the link (spec §4 CUJ 2: Public vs Link only).
    const [visibility, setVisibility] = useState('public');
    const blocking = checks.filter((c) => c.level === 'error');
    // Only three warnings are listed: relabelled hardware or model goes first,
    // since it changes what the numbers claim to be.
    const LABEL_IDS = ['hw', 'model'];
    const warnings = checks.filter((c) => c.level === 'warn').sort((a, b) => Number(LABEL_IDS.includes(b.id)) - Number(LABEL_IDS.includes(a.id)));
    const localOnly = Math.max(subject.localRunIds?.length || 0, localRuns);
    const serverRuns = reviewRuns ?? (subject.submissionRunIds?.length || 0);
    const internal = instance === 'internal';
    // The sign-off as given, kept with the submission so reviewers can see it.
    const dcoRecord = () => ({ version: '1.1', by: attribution.trim() || actor, at: Date.now() });

    const footer = (
        <>
            <Button size="sm" variant="ghost" onClick={onClose}>
                Cancel
            </Button>
            {onEditFirst && (
                <Button size="sm" variant={blocking.length ? 'primary' : 'secondary'} onClick={onEditFirst}>
                    Edit first
                </Button>
            )}
            {internal ? (
                <Button size="sm" disabled={blocking.length > 0} onClick={onMarkOfficial}>
                    Mark official
                </Button>
            ) : localOnly ? (
                <Button size="sm" disabled={blocking.length > 0 || !dco} onClick={() => onContinueUpload({ attribution })}>
                    Continue to upload
                </Button>
            ) : (
                <Button size="sm" disabled={blocking.length > 0 || !dco || !attribution.trim()} onClick={() => onSubmit({ attribution: attribution.trim(), visibility, dco: dcoRecord() })}>
                    Submit for review
                </Button>
            )}
        </>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md" title={internal ? 'Mark as official?' : 'Submit for review'} footer={footer}>
            <div className="surface-light space-y-4 text-sm text-zinc-700">
                <div>
                    <div className="font-semibold text-zinc-900">{subject.name}</div>
                    {summary && <p className="mt-0.5 text-xs text-zinc-600">{summary}</p>}
                </div>
                {internal ? (
                    // Only approvers get here: signed in, or previewing a role on the dev server.
                    <>
                        <p>
                            It becomes Official, with <span className="font-semibold text-zinc-900">{actor}</span> recorded as the approver today. The source runs don’t change.
                        </p>
                        {localOnly > 0 && (
                            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                {localOnly} of its runs {localOnly === 1 ? 'was' : 'were'} uploaded only to this browser, so nobody else can check {localOnly === 1 ? 'it' : 'them'}. Once results
                                are stored on the server, those runs must be uploaded before a result can be marked official.
                            </p>
                        )}
                    </>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-2 text-tiny text-zinc-600">
                            <span className="font-semibold text-zinc-900">1. Upload runs</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-semibold text-zinc-900">2. Curate result</span>
                            <span aria-hidden="true">→</span>
                            <span className="font-semibold text-accent-700">3. Submit for review</span>
                        </div>
                        {!signedIn && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                <span>
                                    <span className="font-semibold">GitHub sign-in required for server submissions:</span> sign in to link your GitHub account, or enter an attribution handle below to save for review in this browser.
                                </span>
                                {onSignIn && (
                                    <Button size="xs" variant="secondary" disabled={!signInReady} onClick={onSignIn}>
                                        Sign in with GitHub
                                    </Button>
                                )}
                            </div>
                        )}
                        <div>
                            <Label surface="light" htmlFor="rs-attribution">
                                Attribution
                            </Label>
                            <Input surface="light" id="rs-attribution" value={attribution} onChange={(e) => setAttribution(e.target.value)} placeholder="@github-user or organization" />
                        </div>
                        <div>
                            <div className="mb-1.5 text-xs font-semibold text-zinc-900">Once approved</div>
                            <ToggleGroup
                                size="xs"
                                aria-label="Who can see it once approved"
                                value={visibility}
                                onChange={setVisibility}
                                options={[
                                    { value: 'public', label: 'Listed in the store' },
                                    { value: 'link', label: 'Anyone with the link' },
                                ]}
                            />
                            <p className="mt-1.5 text-micro text-zinc-500">
                                {visibility === 'link'
                                    ? 'Anyone with the link can open it (unlisted), but it isn’t listed in Browse.'
                                    : 'Everyone can find it in Browse and compare against it.'}
                            </p>
                        </div>
                        <Checkbox
                            surface="light"
                            checked={dco}
                            onChange={(e) => setDco(e.target.checked)}
                            label="I certify these results under the Developer Certificate of Origin 1.1."
                        />
                        <div className="rounded-2xl bg-zinc-50 p-4 text-xs leading-relaxed">
                            <div className="label-caps mb-1 text-zinc-500">What happens next</div>
                            Automatic checks (a few minutes) → a reviewer looks at it → Published. You’ll find it in <span className="font-semibold">My work</span>.
                            {localOnly > 0 && (
                                <p className="mt-2 text-amber-800">
                                    {localOnly} run{localOnly === 1 ? ' is' : 's are'} only in this browser, so {localOnly === 1 ? 'it needs' : 'they need'} uploading first. Continue to upload opens the
                                    upload wizard, which sends the runs themselves for review. This result stays a draft in this browser.
                                </p>
                            )}
                        </div>
                    </>
                )}
                {blocking.length > 0 && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                        <div className="mb-1 flex items-center gap-1.5 font-semibold">
                            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" /> Fix before publishing
                        </div>
                        <ul className="list-disc space-y-0.5 pl-5">
                            {blocking.map((c) => (
                                <li key={c.id}>{c.text}</li>
                            ))}
                        </ul>
                        {onEditFirst && <p className="mt-2">Choose Edit first to fix it.</p>}
                    </div>
                )}
                {warnings.length > 0 && blocking.length === 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        <div className="mb-1 font-semibold">
                            {warnings.length} check{warnings.length === 1 ? '' : 's'} still need{warnings.length === 1 ? 's' : ''} attention
                        </div>
                        <ul className="list-disc space-y-0.5 pl-5">
                            {warnings.slice(0, 3).map((c) => (
                                <li key={c.id}>{c.text}</li>
                            ))}
                            {warnings.length > 3 && <li>…and {warnings.length - 3} more.</li>}
                        </ul>
                        {onEditFirst && <p className="mt-2">You can publish anyway, or choose Edit first to exclude points.</p>}
                    </div>
                )}
                {!internal && copy && <p className="text-micro text-zinc-500">{copy.rule}</p>}
                <p className="text-micro text-zinc-500">
                    {internal
                        ? 'For now the result is saved in this browser, so only you can see it.'
                        : serverRuns > 0
                          ? 'For now the result itself is saved in this browser. Reviewers see the runs you uploaded.'
                          : 'For now the result is saved in this browser only, so reviewers can’t see it yet.'}
                </p>
            </div>
        </Modal>
    );
}
