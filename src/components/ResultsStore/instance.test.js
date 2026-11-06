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

// One set of words per instance, and per role on Internal Prism.
// Run: npx tsx src/components/ResultsStore/instance.test.js
import assert from 'node:assert';
import { INSTANCE_COPY, copyFor } from './instance.js';

// The public store: submit a run, then submit the result for review.
const pub = copyFor('public');
assert.strictEqual(pub.uploadLabel, 'Submit a run');
assert.strictEqual(pub.publishVerb, 'Submit for review');
assert.strictEqual(pub.resubmitVerb, 'Submit again');
assert.strictEqual(pub.reviewTab, 'Review queue');
assert.deepStrictEqual(pub.steps, ['Submit a run', 'Curate the result', 'Submit for review']);
assert.strictEqual(copyFor('public', { canApprove: false, siteName: 'Elsewhere' }), INSTANCE_COPY.public, 'public words never change by role or name');

// Internal approvers mark results official; the badge carries the instance's name.
const approver = copyFor('internal', { siteName: 'Google Cloud' });
assert.strictEqual(approver.name, 'Google Cloud');
assert.strictEqual(approver.uploadLabel, 'Upload runs');
assert.strictEqual(approver.publishVerb, 'Mark official');
assert.strictEqual(approver.publishSweepVerb, 'Mark sweep official');
assert.strictEqual(approver.reviewTab, 'Approval queue');
assert.strictEqual(copyFor('internal').name, 'Internal', 'no site name: a plain label, never "Internal instance"');

// Everyone else on Internal Prism takes the same step under its own name.
const asker = copyFor('internal', { canApprove: false, siteName: 'Google Cloud' });
assert.strictEqual(asker.publishVerb, 'Request official');
assert.strictEqual(asker.publishSweepVerb, 'Request official for this sweep');
assert.strictEqual(asker.resubmitVerb, 'Request again');
assert.deepStrictEqual(asker.steps, ['Upload runs', 'Curate the result', 'Request official']);
assert.strictEqual(asker.name, 'Google Cloud');

// Internal Prism never says "public" or "community".
for (const words of [approver, asker]) {
    const text = JSON.stringify(words).toLowerCase();
    assert.ok(!text.includes('public') && !text.includes('community'), 'no public or community words on Internal Prism');
}

console.log('instance: all tests passed');
