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

// The navigation model: header order, the Docs menu, view ids and aliases, and
// which URL params survive a move between views.
// Run: npx tsx src/components/layout/navigation.test.js
import assert from 'node:assert';
import {
    DOCS_URL,
    LLMD_URL,
    NAV,
    REPORT_FORMAT_URL,
    isActive,
    isKnownView,
    planNavigation,
    readNavigationParams,
    resolveView,
    sameNavigationParams,
} from './navigation.js';

const query = (search) => Object.fromEntries(new URLSearchParams(search));

// ---------- Header ----------
// Spec order: Leaderboard · Results store · Well-lit paths · Regressions · Docs.
assert.deepStrictEqual(NAV.map((n) => n.id), ['leaderboard', 'results-store', 'paths', 'regressions', 'docs']);
// Every top-level place says what it's for (validating an optimization lives in the Results store).
NAV.filter((n) => n.view).forEach((n) => assert.ok(n.desc, `${n.id} has a description`));
assert.match(NAV.find((n) => n.id === 'results-store').desc, /validate an optimization/i);
// The Docs menu: How we measure (in Prism), the report format and llm-d's docs (outside).
const docs = NAV.find((n) => n.id === 'docs').items;
assert.deepStrictEqual(docs.map((d) => d.label), ['How we measure', 'Report format', 'llm-d docs']);
assert.strictEqual(docs[0].view, 'methodology');
assert.strictEqual(docs[1].href, REPORT_FORMAT_URL);
assert.strictEqual(docs[2].href, DOCS_URL);
assert.strictEqual(REPORT_FORMAT_URL, 'https://github.com/llm-d/llm-d-benchmark/blob/main/docs/benchmark_report.md');
assert.strictEqual(DOCS_URL, 'https://llm-d.ai/docs', 'Docs opens the docs, not the home page');
assert.strictEqual(LLMD_URL, 'https://llm-d.ai');
// Docs is the current section on Methodology; external items never match a view.
assert.strictEqual(isActive(NAV.find((n) => n.id === 'docs'), 'methodology'), true);
assert.strictEqual(isActive(NAV.find((n) => n.id === 'docs'), undefined), false);
assert.strictEqual(isActive(NAV.find((n) => n.id === 'paths'), 'agentic-serving'), true);
assert.strictEqual(isActive(NAV.find((n) => n.id === 'results-store'), 'submit-benchmarks'), true);

// ---------- Views ----------
assert.strictEqual(resolveView(null), 'home');
assert.strictEqual(resolveView(''), 'home');
assert.strictEqual(resolveView('intelligent-routing'), 'inference-scheduling', 'old routing share links still open');
assert.strictEqual(resolveView('benchmark-comparison'), 'benchmark-browser');
assert.strictEqual(resolveView('manage-benchmarks'), 'results-store');
assert.strictEqual(resolveView('model-leaderboard'), 'model-leaderboard');
assert.strictEqual(resolveView('does-not-exist'), 'does-not-exist', 'unknown ids pass through to the not-found page');
assert.strictEqual(isKnownView('does-not-exist'), false);
assert.strictEqual(isKnownView(resolveView('intelligent-routing')), true);
NAV.flatMap((n) => (n.items ? n.items : [n])).filter((n) => n.view).forEach((n) => assert.ok(isKnownView(n.view), `${n.view} is a route`));

// ---------- Results store params never ride along (RS-3) ----------
const compare = '?view=results-store&compare=abc&q=gemma&f.hardware=H100&sort=peak&tab=mywork';
// Leaving the store through Home drops its screen, tab and Browse filters…
let next = planNavigation(compare, 'results-store', 'home');
assert.deepStrictEqual(query(next.search), { view: 'home' });
// …even when an old URL still carries them, and "Results store" opens Browse.
next = planNavigation('?view=home&compare=abc&run=r1&curve=c1', 'home', 'results-store');
assert.deepStrictEqual(query(next.search), { view: 'results-store' });
// The nav's "Results store" from inside the store starts over too.
next = planNavigation(compare, 'results-store', 'results-store');
assert.deepStrictEqual(query(next.search), { view: 'results-store' });
// Explicit targets still open where they point.
next = planNavigation(compare, 'model-leaderboard', 'results-store', { curve: 'c9' });
assert.deepStrictEqual(query(next.search), { view: 'results-store', curve: 'c9' });
next = planNavigation('?view=home', 'home', 'results-store', { tab: 'review' });
assert.deepStrictEqual(query(next.search), { view: 'results-store', tab: 'review' });
next = planNavigation('?view=home', 'home', 'results-store', { intent: 'compare' });
assert.deepStrictEqual(query(next.search), { view: 'results-store', intent: 'compare' });
assert.strictEqual(next.navigationParams.intent, 'compare');
// Instance previews (dev server) survive every move.
next = planNavigation('?view=results-store&instance=internal&brand=prism&run=r1', 'results-store', 'methodology');
assert.deepStrictEqual(query(next.search), { view: 'methodology', instance: 'internal', brand: 'prism' });

// ---------- Leaderboard filters ----------
const board = '?view=model-leaderboard&workload=chat&q=llama&sort=cost_per_1m&pricing=cud_3yr&pin=r1';
// Comparing recipes and coming back is one flow: filters, prices and the pin stay.
next = planNavigation(board, 'model-leaderboard', 'recipe-comparison', { recipes: ['a', 'b'], baseline: 'a' });
assert.deepStrictEqual(query(next.search), { view: 'recipe-comparison', workload: 'chat', q: 'llama', sort: 'cost_per_1m', pricing: 'cud_3yr', pin: 'r1', recipes: 'a,b', baseline: 'a' });
assert.deepStrictEqual(next.navigationParams, { recipes: 'a,b', baseline: 'a', intent: null });
// Anywhere else starts clean.
next = planNavigation(board, 'model-leaderboard', 'regressions-analysis');
assert.deepStrictEqual(query(next.search), { view: 'regressions-analysis' });
// Home's chips pre-filter the leaderboard.
next = planNavigation('?view=home&goal=x', 'home', 'model-leaderboard', { workload: 'rag', hardware: 'H100', model: 'llama' });
assert.deepStrictEqual(query(next.search), { view: 'model-leaderboard', model: 'llama', workload: 'rag', hardware: 'H100' });
assert.deepStrictEqual(next.navigationParams, { model: 'llama' });

// ---------- Intents and anchors ----------
next = planNavigation('?view=home', 'home', 'submit-benchmarks', 'submit-review');
assert.deepStrictEqual(query(next.search), { view: 'submit-benchmarks', intent: 'submit-review' });
next = planNavigation('?view=submit-benchmarks&intent=x', 'submit-benchmarks', 'methodology', { hash: 'samples' });
assert.deepStrictEqual(query(next.search), { view: 'methodology' });
assert.strictEqual(next.hash, '#samples');
assert.strictEqual(planNavigation('?view=home', 'home', 'methodology').hash, '');

// ---------- navigationParams ----------
assert.deepStrictEqual(readNavigationParams('?view=model-leaderboard&recipe=r1'), { intent: null, recipes: null, baseline: null, recipe: 'r1', model: null });
// Same values, same object: popstate within a view doesn't re-apply them.
assert.strictEqual(sameNavigationParams({}, readNavigationParams('?view=home')), true);
assert.strictEqual(sameNavigationParams({ recipe: 'r1' }, readNavigationParams('?recipe=r1')), true);
assert.strictEqual(sameNavigationParams({ recipe: 'r1' }, readNavigationParams('?recipe=r2')), false);

console.log('navigation.test.js: all assertions passed');
