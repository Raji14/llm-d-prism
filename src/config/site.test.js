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

// Unit tests for src/config/site.js. Run: npx tsx src/config/site.test.js
import assert from 'node:assert/strict';
import {
    MAX_PINNED_REPORTS,
    displayNameFor,
    documentTitleFor,
    parseReportIds,
    readBrand,
    readInstanceMode,
    readPinnedReports,
    readSiteName,
    readSiteProfile,
} from './site.js';

console.log('Running site config unit tests...');

// Pretend to be a page whose server injected `env` (server/server.js).
const withPage = (env, search, fn) => {
    const previous = globalThis.window;
    globalThis.window = { env, location: { search } };
    try {
        return fn();
    } finally {
        if (previous === undefined) delete globalThis.window;
        else globalThis.window = previous;
    }
};
const withEnv = (env, fn) => withPage(env, '', fn);

// 1. Nothing configured: a public Prism wearing its own mark, every report.
assert.equal(readInstanceMode(), 'public');
assert.equal(readBrand(), 'prism');
assert.equal(readSiteName(), null);
assert.equal(readPinnedReports(), null);

// 2. llm-d Prism as deployed (deploy/prod.env).
withEnv({ PRISM_INSTANCE: 'public', PRISM_BRAND: 'llm-d', SITE_NAME: 'llm-d' }, () => {
    const site = readSiteProfile();
    assert.equal(site.instance, 'public');
    assert.equal(site.brand, 'llm-d');
    assert.equal(site.displayName, 'llm-d Prism');
    assert.equal(site.documentTitle, 'Prism · llm-d inference benchmarks');
});

// 3. Internal Prism (deploy/internal.env.example).
withEnv(
    { PRISM_INSTANCE: 'internal', PRISM_BRAND: 'prism', SITE_NAME: ' Google Cloud ', PRISM_PINNED_REPORTS: 'agentic-serving inference-scheduling' },
    () => {
        const site = readSiteProfile();
        assert.equal(site.instance, 'internal');
        assert.equal(site.brand, 'prism');
        assert.equal(site.siteName, 'Google Cloud');
        assert.deepEqual(site.pinnedReports, ['agentic-serving', 'inference-scheduling']);
        assert.equal(site.displayName, 'Google Cloud Prism');
        assert.equal(site.documentTitle, 'Prism · Google Cloud');
    }
);

// 4. Values the app doesn't know fall back to the defaults.
withEnv({ PRISM_INSTANCE: 'staging', PRISM_BRAND: 'ibm' }, () => {
    assert.equal(readInstanceMode(), 'public');
    assert.equal(readBrand(), 'prism');
});

// 5. Pinned ids: any separator, duplicates count once, at most four; blank = default.
assert.deepEqual(parseReportIds('a, b|c  d'), ['a', 'b', 'c', 'd']);
assert.deepEqual(parseReportIds(undefined), []);
withEnv({ PRISM_PINNED_REPORTS: 'a,b,a,c,d,e' }, () => {
    assert.deepEqual(readPinnedReports(), ['a', 'b', 'c', 'd']);
    assert.equal(readPinnedReports().length, MAX_PINNED_REPORTS);
});
withEnv({ PRISM_PINNED_REPORTS: '   ' }, () => assert.equal(readPinnedReports(), null));

// 6. Names and titles without a site name.
assert.equal(displayNameFor({ brand: 'prism', siteName: null }), 'Prism');
assert.equal(documentTitleFor({ brand: 'prism', siteName: null }), 'Prism · inference benchmarks');
assert.equal(displayNameFor({ brand: 'llm-d', siteName: 'Anything' }), 'llm-d Prism');

// 7. Dev preview params never apply outside the dev server (this is plain Node).
withPage({}, '?instance=internal&brand=llm-d&site=X&pinned=a', () => {
    assert.equal(readInstanceMode(), 'public');
    assert.equal(readBrand(), 'prism');
    assert.equal(readSiteName(), null);
    assert.equal(readPinnedReports(), null);
});

console.log('site config: all tests passed');
