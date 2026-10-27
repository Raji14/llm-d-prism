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

// One codebase, two instance modes. The mode drives labels, the publish rule
// and whether the Review queue exists:
//   internal — pipeline-fed instance. Publishing marks a curve Official. Only
//              approvers (admins, signed in) can; Prism records who did it.
//              The word "public" is never shown.
//   public   — community store. Publishing submits a curve for review; an
//              admin approves it and it becomes Published.
// Set VITE_PRISM_INSTANCE=internal at build time. On the dev server only,
// `?instance=` overrides it so both modes can be previewed from one server.
// Production builds ignore it, so a URL can't relabel the deployed store.

export const INSTANCE_MODES = ['internal', 'public'];

export function readInstanceMode() {
    if (import.meta.env.DEV) {
        try {
            const fromUrl = new URLSearchParams(window.location.search).get('instance');
            if (INSTANCE_MODES.includes(fromUrl)) return fromUrl;
        } catch {
            // Not running in a browser.
        }
    }
    return import.meta.env.VITE_PRISM_INSTANCE === 'internal' ? 'internal' : 'public';
}

// `unofficialLabel` marks results that aren't Official / Published yet, for
// example a draft priced in a report.
export const INSTANCE_COPY = {
    internal: {
        name: 'Internal instance',
        rule: 'Only approvers can mark a result official. Prism records who did it and when.',
        publishVerb: 'Mark official',
        publishedStatus: 'official',
        publishedLabel: 'Official',
        unofficialLabel: 'Unofficial',
        mineSection: 'Official by me',
        uploadLabel: 'Upload runs',
        shareVisibility: 'instance',
        browseEmpty: 'No runs have synced from this instance’s sources yet.',
    },
    public: {
        name: 'Public store',
        rule: 'Results are published after a reviewer approves them.',
        publishVerb: 'Submit for review',
        publishedStatus: 'published',
        publishedLabel: 'Published',
        unofficialLabel: 'Unpublished',
        mineSection: 'Published by me',
        uploadLabel: 'Submit results',
        shareVisibility: 'link',
        browseEmpty: 'No published results match yet.',
    },
};

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
