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
import { Trophy, Route, Database, Compass, Split, Server, Activity, UploadCloud, BookOpen, FileJson, Ruler } from 'lucide-react';

export const REPO_URL = 'https://github.com/llm-d/llm-d-prism';
// llm-d's home page (the project) and its docs (deploying and running it).
export const LLMD_URL = 'https://llm-d.ai';
export const DOCS_URL = 'https://llm-d.ai/docs';
// The Benchmark Report v0.2 format (schema + example live next to it in
// llm-d-benchmark/benchmark-report/). One constant for every "Report format" link.
export const REPORT_FORMAT_URL = 'https://github.com/llm-d/llm-d-benchmark/blob/main/docs/benchmark_report.md';

// How runs are produced, validated and ranked. Linked from Home, the footer,
// the Docs menu and the leaderboard's sample-data notice.
export const METHODOLOGY = { label: 'How we measure', view: 'methodology' };

// `desc` says what each place is for in a few words (shown on hover and focus
// in the header, and under the label in the mobile menu), so every job on Home
// can be found from the header alone: validating an optimization lives in the
// Results store, the report format under Docs.
export const NAV = [
    { id: 'leaderboard', label: 'Leaderboard', view: 'model-leaderboard', icon: Trophy, also: ['recipe-comparison'], desc: 'Top stacks, ranked at your latency target' },
    // Uploading runs is the first step of the Results Store journey.
    { id: 'results-store', label: 'Results store', view: 'results-store', icon: Server, also: ['submit-benchmarks'], desc: 'Compare runs and validate an optimization' },
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
    { id: 'regressions', label: 'Regressions', view: 'regressions-analysis', icon: Activity, desc: 'Nightly well-lit path runs against their history' },
    // Items with `href` leave Prism (new tab); items with `view` stay in it.
    {
        id: 'docs',
        label: 'Docs',
        items: [
            { label: METHODOLOGY.label, view: METHODOLOGY.view, icon: Ruler, desc: 'How runs are validated and ranked' },
            { label: 'Report format', href: REPORT_FORMAT_URL, icon: FileJson, desc: 'Benchmark Report v0.2 fields and schema' },
            { label: 'llm-d docs', href: DOCS_URL, icon: BookOpen, desc: 'Deploy and run the llm-d stack' },
        ],
    },
];

export const SUBMIT = { label: 'Submit a run', view: 'submit-benchmarks', icon: UploadCloud };

// Same page, words that match the instance's publish rule: a public Prism
// takes runs for review; on an internal one people upload runs and an approver
// marks a result Official (src/config/site.js).
export function submitFor(instance) {
    return instance === 'internal' ? { ...SUBMIT, label: 'Upload runs' } : SUBMIT;
}

export function isActive(entry, currentView) {
    if (entry.view) return entry.view === currentView || (entry.also || []).includes(currentView);
    return (entry.items || []).some((i) => i.view && i.view === currentView);
}

// ---------- Routes ----------
// Every view App renders. Anything else in ?view= gets the not-found page.
export const VIEWS = new Set([
    'home',
    'methodology',
    'model-leaderboard',
    'recipe-comparison',
    'inference-scheduling',
    'agentic-serving',
    'prefix-cache-offloading',
    'pd-disaggregation',
    'regressions-analysis',
    'results-store',
    'submit-benchmarks',
    'benchmark-browser',
    'schema-explorer',
    'workload-catalog',
    'guided-analysis',
]);

// Old or alternative view ids still found in links people have shared.
export const VIEW_ALIASES = {
    // Legacy comparison links land on the benchmark browser, where the
    // comparison renders inline once brv02 runs are submitted.
    'benchmark-comparison': 'benchmark-browser',
    'manage-benchmarks': 'results-store',
    // The routing guide's Share link used to say its path's name.
    'intelligent-routing': 'inference-scheduling',
};

/** The view a ?view= value opens: aliases map to their view, no value is Home. */
export function resolveView(raw) {
    const id = String(raw ?? '').trim() || 'home';
    return VIEW_ALIASES[id] || id;
}

export const isKnownView = (view) => VIEWS.has(view);

// Leaderboard filters live in the URL so a filtered ranking can be shared and
// linked from Home. Only the leaderboard reads them; WorkloadCatalog reads its
// own `workload` id, which shares the name, so they never carry across views.
// `pricing` is the pricing preset or custom rates (RecipeComparisonPage reads
// it too) and `pin` the pinned baseline row.
export const LEADERBOARD_PARAMS = ['workload', 'hardware', 'engine', 'sort', 'q', 'ttft_sla', 'tpot_sla', 'sla_pct', 'samples', 'layout', 'curves', 'x', 'y', 'scale', 'pricing', 'pin'];

// The Results store's place in the URL: the open run, result or comparison,
// the tab, and Browse's search and filters (ResultsStore.jsx). `q` and `sort`
// are Browse's too, but the leaderboard shares those names (LEADERBOARD_PARAMS).
export const RESULTS_STORE_PARAMS = [
    'run',
    'curve',
    'compare',
    'tab',
    'kpiFilter',
    'own',
    'includeUnlisted',
    'benchmarks',
    'kind',
    'f.date',
    'f.mine',
    'f.source',
    'f.harness',
    'f.category',
    'f.model',
    'f.hardware',
    'f.workload',
];

// Params App hands to views (navigationParams), read from a query string.
export function readNavigationParams(search) {
    const params = new URLSearchParams(search);
    return {
        intent: params.get('intent') || null,
        recipes: params.get('recipes') || null,
        baseline: params.get('baseline') || null,
        recipe: params.get('recipe') || null,
        model: params.get('model') || null,
    };
}

/** True when two navigationParams objects say the same thing (keeps React state stable). */
export function sameNavigationParams(a, b) {
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    return [...keys].every((k) => (a?.[k] ?? null) === (b?.[k] ?? null));
}

/**
 * Where an in-app navigation from view `from` to view `to` goes (App's
 * handleNavigate): the new query string, the optional #hash, and the params
 * handed to the view. `extra` is what the caller passed: an object of params,
 * or a submit intent string.
 */
export function planNavigation(search, from, to, extra = {}) {
    const params = new URLSearchParams(search);
    params.set('view', to);
    if (to !== 'home') {
        ['goal', 'm', 'hw', 'wl'].forEach((k) => params.delete(k));
    }
    // A different view starts clean: leaderboard filters never leak into it.
    // Comparing recipes and coming back keeps them, as the two views are one flow.
    const leaderboardFlow = ['model-leaderboard', 'recipe-comparison'];
    if (to !== from && !(leaderboardFlow.includes(to) && leaderboardFlow.includes(from))) {
        LEADERBOARD_PARAMS.forEach((k) => params.delete(k));
    }
    // The store's open screen, tab and Browse filters are its own too: they
    // never ride along to another view (where a later "Results store" click
    // would reopen an old comparison), and a plain link to the store opens Browse.
    RESULTS_STORE_PARAMS.forEach((k) => params.delete(k));
    if (to === 'results-store' || from === 'results-store') {
        ['q', 'sort'].forEach((k) => params.delete(k));
    }

    const obj = extra && typeof extra === 'object' ? extra : {};
    const resolved = {};
    if (to === 'submit-benchmarks') {
        const intent = typeof extra === 'string' ? extra : obj.intent;
        if (intent) params.set('intent', intent);
        else params.delete('intent');
        resolved.intent = intent || null;
    } else if (to === 'recipe-comparison') {
        if (obj.recipes) {
            const recStr = Array.isArray(obj.recipes) ? obj.recipes.join(',') : obj.recipes;
            params.set('recipes', recStr);
            resolved.recipes = recStr;
        }
        if (obj.baseline) {
            params.set('baseline', obj.baseline);
            resolved.baseline = obj.baseline;
        }
        params.delete('intent');
        resolved.intent = null;
    } else if (to === 'model-leaderboard') {
        if (obj.recipe) {
            params.set('recipe', obj.recipe);
            resolved.recipe = obj.recipe;
        }
        if (obj.model) {
            params.set('model', obj.model);
            resolved.model = obj.model;
        }
        // Pre-filtered entry points (Home's workload and accelerator chips).
        LEADERBOARD_PARAMS.forEach((k) => {
            if (obj[k] != null && obj[k] !== '') params.set(k, String(obj[k]));
        });
        ['intent', 'recipes', 'baseline'].forEach((k) => params.delete(k));
    } else if (to === 'results-store' && (obj.curve || obj.tab || obj.intent === 'compare')) {
        // A link into one result (the Leaderboard drawer), one tab (the header's
        // queue pill) or Compare (Home's "Validate an optimization") opens there,
        // not wherever the store was left.
        ['intent', 'recipes', 'baseline', 'recipe', 'model'].forEach((k) => params.delete(k));
        if (obj.curve) params.set('curve', obj.curve);
        if (obj.tab) params.set('tab', obj.tab);
        if (obj.intent === 'compare') params.set('intent', 'compare');
        resolved.intent = obj.intent === 'compare' ? 'compare' : null;
    } else {
        ['intent', 'recipes', 'baseline', 'recipe', 'model'].forEach((k) => params.delete(k));
        resolved.intent = null;
    }

    // Optional in-page anchor; the target view scrolls to it once mounted.
    const hash = obj.hash ? `#${obj.hash}` : '';
    return { search: `?${params.toString()}`, hash, navigationParams: resolved };
}
