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

// Which GitHub org's admins approve on which Prism.
// Run: npx tsx server/oauth.test.ts
import assert from 'node:assert/strict';
import { githubAdminOrg } from './oauth';

assert.equal(githubAdminOrg({ PRISM_BRAND: 'llm-d', PRISM_INSTANCE: 'public' }), 'llm-d', 'llm-d Prism trusts the llm-d org, as before');
assert.equal(githubAdminOrg({}), null, 'a Prism with nothing set trusts no org: only its allowlists');
assert.equal(githubAdminOrg({ PRISM_BRAND: 'prism', PRISM_INSTANCE: 'internal' }), null, 'an internal Prism trusts no org by default');
assert.equal(githubAdminOrg({ PRISM_BRAND: 'prism', PRISM_GITHUB_ADMIN_ORG: ' my-org ' }), 'my-org', 'a deployment can name its own org');
assert.equal(githubAdminOrg({ PRISM_BRAND: 'llm-d', PRISM_GITHUB_ADMIN_ORG: 'other-org' }), 'other-org', 'a named org wins on llm-d Prism too');
assert.equal(githubAdminOrg({ PRISM_BRAND: 'llm-d', PRISM_GITHUB_ADMIN_ORG: '   ' }), 'llm-d', 'a blank name falls back to the brand');

console.log('oauth.test: 6 checks passed');
