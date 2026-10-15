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

// Health from what Prism actually knows. A live sync has its last good fetch
// (`lastSyncedAt`) and its error; a source without a profile is a static
// archive that isn't synced at all. `newest` is the source's newest run.
export function sourceHealth({ profile: p, newest }, now) {
    if (p?.loading) return { status: 'processing', label: 'Syncing' };
    const lastGood = p?.lastSyncedAt ? fmtDay(Date.parse(p.lastSyncedAt)) : null;
    if (p?.error) return { status: 'failed', label: 'Sync failed', note: `${plainSyncError(p.error)} · ${lastGood ? `last good sync ${lastGood}` : 'no good sync yet'}` };
    const quietDays = newest ? Math.floor((now - newest) / DAY_MS) : null;
    const stale = quietDays != null && quietDays >= STALE_DAYS;
    if (!p) return { status: 'staged', label: 'Not synced', note: stale ? `Static files · newest run ${quietDays} days old` : 'Static files' };
    const synced = lastGood ? `synced ${lastGood}` : null;
    if (stale) return { status: 'action', label: 'Stale', note: [`no new runs in ${quietDays} days`, synced].filter(Boolean).join(' · ') };
    return { status: 'verified', label: 'Synced', note: synced };
}
