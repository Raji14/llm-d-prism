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

// Where the Results Store saves people's work until it's stored on the
// server, and a light read of it for the site header. Deliberately tiny, with
// no imports: the header is in the main bundle, the Results Store isn't.

export const RESULTS_WORKSPACE_KEY = 'prism_results_workspace_v1';

/**
 * How many results wait for an approver on this instance: requests to mark
 * official (internal) or results submitted for review (public), as saved in
 * this browser. Never throws: unreadable storage means none.
 */
export function countWaitingResults(instance, storage = globalThis.localStorage) {
    try {
        const saved = JSON.parse(storage?.getItem(RESULTS_WORKSPACE_KEY) || '{}');
        const curves = saved?.[instance]?.curves;
        return Array.isArray(curves) ? curves.filter((c) => c?.status === 'in_review').length : 0;
    } catch {
        return 0;
    }
}
