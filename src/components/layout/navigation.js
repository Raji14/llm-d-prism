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
// all render from this list so every view stays reachable from every page.
import {
    Trophy, Route, Database, Compass, Split, BarChart2, Server, Activity, Blocks, FileCode, UploadCloud,
} from 'lucide-react';

export const REPO_URL = 'https://github.com/llm-d/llm-d-prism';
export const DOCS_URL = 'https://llm-d.ai';

export const NAV = [
    { id: 'leaderboard', label: 'Leaderboard', view: 'model-leaderboard', icon: Trophy, also: ['recipe-comparison'] },
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
    {
        id: 'tools',
        label: 'Tools',
        items: [
            { label: 'Benchmark browser', view: 'benchmark-browser', icon: BarChart2, desc: 'Plot any metric against any other' },
            { label: 'Results store', view: 'results-store', icon: Server, desc: 'Stage, validate and manage runs' },
            { label: 'Regressions', view: 'regressions-analysis', icon: Activity, desc: 'Nightly trends against history' },
            { label: 'Workload catalog', view: 'workload-catalog', icon: Blocks, desc: 'Production-shaped workloads' },
            { label: 'Schema explorer', view: 'schema-explorer', icon: FileCode, desc: 'Benchmark Report v0.2 structure' },
        ],
    },
];

export const SUBMIT = { label: 'Submit a run', view: 'submit-benchmarks', icon: UploadCloud };

// How runs are produced, validated and ranked. Linked from Home, the footer
// and the leaderboard's sample-data notice.
export const METHODOLOGY = { label: 'How we measure', view: 'methodology' };

export function isActive(entry, currentView) {
    if (entry.view) return entry.view === currentView || (entry.also || []).includes(currentView);
    return (entry.items || []).some((i) => i.view === currentView);
}
