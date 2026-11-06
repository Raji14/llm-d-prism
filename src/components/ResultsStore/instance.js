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

// One codebase, two instance modes, and the same journey on both: upload runs,
// curate a result, get it approved, see it on the Leaderboard. The mode only
// changes the words and who approves:
//   internal — pipeline-fed instance. Approvers (admins, signed in) mark a
//              result Official; anyone else signed in asks for it with
//              Request official, and it waits in the Approval queue. Prism
//              records who asked and who approved. The word "public" is never shown.
//   public   — community store. Publishing submits a result for review; an
//              admin approves it in the Review queue and it becomes Published.
// Each instance is its own deployment: the deploy sets PRISM_INSTANCE, and
// src/config/site.js reads it at runtime (VITE_PRISM_INSTANCE still works at
// build time). On the dev server only, `?instance=` picks the mode, so both can
// be previewed from one server. Production builds ignore it, so a URL can't
// relabel the deployed store.

export { INSTANCE_MODES, readInstanceMode } from '../../config/site.js';

// One set of words per instance, used everywhere a step is named: the site
// header, the store header, My work and the publish dialog.
// `unofficialLabel` marks results that aren't Official / Published yet, for
// example a draft priced in a report. `steps` is the journey in three words.
export const INSTANCE_COPY = {
    internal: {
        // The badge shows the instance's own name when it has one (copyFor).
        name: 'Internal',
        rule: 'Only approvers can mark a result official. Prism records who did it and when.',
        publishVerb: 'Mark official',
        publishSweepVerb: 'Mark sweep official',
        requestVerb: 'Request official',
        requestSweepVerb: 'Request official for this sweep',
        requestRule: 'An approver marks a result official. Prism records who asked and who approved.',
        resubmitVerb: 'Request again',
        publishedStatus: 'official',
        publishedLabel: 'Official',
        unofficialLabel: 'Unofficial',
        mineSection: 'Official by me',
        uploadLabel: 'Upload runs',
        shareVisibility: 'instance',
        reviewTab: 'Approval queue',
        reviewer: 'approver',
        steps: ['Upload runs', 'Curate the result', 'Mark official'],
        browseEmpty: 'No runs have synced from this instance’s sources yet.',
    },
    public: {
        name: 'Public store',
        rule: 'Results are published after a reviewer approves them.',
        publishVerb: 'Submit for review',
        publishSweepVerb: 'Submit sweep for review',
        resubmitVerb: 'Submit again',
        publishedStatus: 'published',
        publishedLabel: 'Published',
        unofficialLabel: 'Unpublished',
        mineSection: 'Published by me',
        uploadLabel: 'Submit a run',
        shareVisibility: 'link',
        reviewTab: 'Review queue',
        reviewer: 'reviewer',
        steps: ['Submit a run', 'Curate the result', 'Submit for review'],
        browseEmpty: 'No published results match yet.',
    },
};

/**
 * The words for this instance and this person. On Internal Prism, people who
 * can't approve take the same step under another name (Request official), and
 * the store badge carries the instance's name ("Google Cloud") so the page
 * has one identity, the same one as the site header.
 */
export function copyFor(instance, { canApprove = true, siteName = null } = {}) {
    const base = INSTANCE_COPY[instance] || INSTANCE_COPY.public;
    if (instance !== 'internal') return base;
    const named = { ...base, name: siteName || base.name };
    if (canApprove) return named;
    return {
        ...named,
        publishVerb: base.requestVerb,
        publishSweepVerb: base.requestSweepVerb,
        rule: base.requestRule,
        steps: [base.steps[0], base.steps[1], base.requestVerb],
    };
}

// Until results are stored on the server, everything people create here lives
// in their own browser. Shown on every screen so no label overpromises.
export const BROWSER_NOTE = 'Preview: results, watches and reports you create are saved in this browser only. Other people can’t see them yet.';

// Status chips that imply other people can see a result (Official, Published,
// In review) add this, as in "Official · only in this browser". Set it to ''
// once results are stored on the server, and the chips go back to the bare status.
export const BROWSER_AUDIENCE = 'only in this browser';

// Result statuses that tell people others can see the result.
const AUDIENCE_STATUS = { official: 'Official', published: 'Published', in_review: 'In review' };

// Who a result's status chip says can see it, or '' when the status doesn't
// imply an audience. When it's set, a visibility chip next to it only repeats it.
export const resultAudience = (status) => (AUDIENCE_STATUS[status] ? BROWSER_AUDIENCE : '');

// A result's status in words, with the audience where the status implies one:
// "Official · only in this browser". `copy` keeps the instance's word for
// Official / Published. Undefined means StatusChip's own label.
export function resultStatusLabel(status, copy) {
    const word = copy && (status === 'official' || status === 'published') ? copy.publishedLabel : AUDIENCE_STATUS[status];
    if (!word) return undefined;
    const audience = resultAudience(status);
    return audience ? `${word} · ${audience}` : word;
}
