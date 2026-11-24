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

// Source health, in words people can act on. Shared by the Sources tab and
// Sync now, which both report what actually happened rather than a default.

import { fmtDay } from './catalog';

const DAY_MS = 24 * 60 * 60 * 1000;
// A nightly pipeline with nothing new for a week has probably stopped.
export const STALE_DAYS = 7;

// Sync errors in plain words ("access denied", not "HTTP error! status: 403").
export function plainSyncError(message) {
    const s = String(message || '');
    if (/\b40[13]\b|denied|forbidden|unauthori[sz]ed|permission/i.test(s)) return 'access denied';
    if (/\b404\b|not found|no such bucket/i.test(s)) return 'not found';
    if (/no data/i.test(s)) return 'no runs found';
    if (/failed to (connect|fetch)|connection failed|network|timed? ?out/i.test(s)) return 'couldn’t connect';
    return s ? s.charAt(0).toLowerCase() + s.slice(1) : 'unknown error';
}

// Why the results service (/api/results) didn't answer, for "Couldn't reach
// the results store (…)". `status` is the HTTP status (none when the request
// never got through) and `message` the server's error text. A bucket the
// server can't read comes back as 403, or as 500 from older servers whose
// message names the missing permission: both read "access denied".
export function serviceError(status, message = '') {
    const s = `${status || ''} ${message || ''}`;
    if (/\b40[13]\b|denied|forbidden|unauthori[sz]ed|permission|\baccess\b/i.test(s)) return 'access denied';
    if (/\b404\b|not found/i.test(s)) return 'not found';
    if (!status) return 'no connection';
    return status >= 500 ? `server error ${status}` : `error ${status}`;
}

// The error text of a failed response: its JSON `error`, else a short plain
// body. HTML error pages and long dumps aren't messages, so they give ''.
export async function responseError(res) {
    try {
        return readableError(await res.text());
    } catch {
        return '';
    }
}
export function readableError(text) {
    const s = String(text || '').trim();
    try {
        const json = JSON.parse(s);
        return String(json?.error || json?.message || '').trim();
    } catch {
        return s && s.length <= 200 && !s.startsWith('<') ? s : '';
    }
}

// "Couldn't reach the results store", with the server's explanation when it
// gave one (it names the bucket and the missing permission), else a reason.
export function serviceProblemText(status, message = '') {
    const detail = String(message || '').trim();
    if (detail) return `Couldn’t reach the results store. ${/[.!?]$/.test(detail) ? detail : `${detail}.`}`;
    return `Couldn’t reach the results store (${serviceError(status, detail)}).`;
}

// Health from what Prism actually knows. A live sync has its last good fetch
// (`lastSyncedAt`) and its error; a source without a profile is a static
// archive that isn't synced at all. `newest` is the source's newest run and
// `runs` how many it provided.
export function sourceHealth({ profile: p, newest, runs }, now) {
    if (p?.loading) return { status: 'processing', label: 'Syncing' };
    const lastGood = p?.lastSyncedAt ? fmtDay(Date.parse(p.lastSyncedAt)) : null;
    if (p?.error) return { status: 'failed', label: 'Sync failed', note: `${plainSyncError(p.error)} · ${lastGood ? `last good sync ${lastGood}` : 'no good sync yet'}` };
    const quietDays = newest ? Math.floor((now - newest) / DAY_MS) : null;
    const stale = quietDays != null && quietDays >= STALE_DAYS;
    if (!p) return { status: 'staged', label: 'Not synced', note: stale ? `Static files · newest run ${quietDays} days old` : 'Static files' };
    const synced = lastGood ? `synced ${lastGood}` : null;
    // It answered, but held nothing Prism could read: usually the wrong
    // bucket or folder, not a healthy source.
    if (runs === 0) return { status: 'action', label: 'No runs', note: ['no benchmark reports found', synced].filter(Boolean).join(' · ') };
    if (stale) return { status: 'action', label: 'Stale', note: [`no new runs in ${quietDays} days`, synced].filter(Boolean).join(' · ') };
    return { status: 'verified', label: 'Synced', note: synced };
}
