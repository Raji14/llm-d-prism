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

// Shared Prism 2.0 navigation model: the site header, mobile menu and footer
// all render from this list, so every linked view is reachable from every page.
//
// Next-gen framing (decided 2026-11-03): the Leaderboard is for consumers and
// the Results Store is for everybody else, so both sit at the top level. The
// benchmark browser, workload catalog and schema explorer aren't linked from
// anywhere any more. Their routes still resolve, so old links and share links
// keep working, until we decide whether to delete them (specs/changes/next-gen-framing).
import { Trophy, Route, Database, Compass, Split, Server, Activity, UploadCloud } from 'lucide-react';

export const REPO_URL = 'https://github.com/llm-d/llm-d-prism';
export const DOCS_URL = 'https://llm-d.ai';

export const NAV = [
    { id: 'leaderboard', label: 'Leaderboard', view: 'model-leaderboard', icon: Trophy, also: ['recipe-comparison'] },
    // Uploading runs is the first step of the Results Store journey.
    { id: 'results-store', label: 'Results store', view: 'results-store', icon: Server, also: ['submit-benchmarks'] },
    {
        id: 'paths',
        label: 'Well-lit paths',
        items: [
            { label: 'Intelligent routing', view: 'inference-scheduling', icon: Route, desc: 'Prefix- and load-aware routing' },
            { label: 'Prefix cache offloading', view: 'prefix-cache-offloading', icon: Database, desc: 'KV cache on CPU and storage tiers' },
            { label: 'Agentic serving', view: 'agentic-serving', icon: Compass, desc: 'Multi-turn sessions at scale' },
            { label: 'Prefill/decode disaggregation', view: 'pd-disaggregation', icon: Split, desc: 'Split prefill and decode', badge: 'Preview' },
        ],
    },
    { id: 'regressions', label: 'Regressions', view: 'regressions-analysis', icon: Activity },
];

export const SUBMIT = { label: 'Submit a run', view: 'submit-benchmarks', icon: UploadCloud };

// Same page, words that match the instance's publish rule: a public Prism
// takes runs for review; on an internal one people upload runs and an approver
// marks a result Official (src/config/site.js).
export function submitFor(instance) {
    return instance === 'internal' ? { ...SUBMIT, label: 'Upload runs' } : SUBMIT;
}

// How runs are produced, validated and ranked. Linked from Home, the footer
// and the leaderboard's sample-data notice.
export const METHODOLOGY = { label: 'How we measure', view: 'methodology' };

export function isActive(entry, currentView) {
    if (entry.view) return entry.view === currentView || (entry.also || []).includes(currentView);
    return (entry.items || []).some((i) => i.view === currentView);
}
