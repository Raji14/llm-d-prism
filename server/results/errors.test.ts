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

// Storage access problems answer 403 with the bucket and permission; real
// failures stay 500.
// Run: npx tsx server/results/errors.test.ts
import assert from 'node:assert/strict';
import { isStorageAccessError, missingPermission, storageFailure, storageStatus } from './errors';

// What @google-cloud/storage throws (ApiError: an Error with a numeric code).
const apiError = (code: number, message: string) => Object.assign(new Error(message), { code });
const denied = apiError(
    403,
    "someone@example.com does not have storage.objects.list access to the Google Cloud Storage bucket. Permission 'storage.objects.list' denied on resource (or it may not exist)."
);

assert.equal(storageStatus(denied), 403);
assert.equal(storageStatus(new Error('boom')), null);
assert.equal(storageStatus(Object.assign(new Error('wrapped'), { cause: denied })), 403, 'wrapped errors keep their status');
assert.equal(missingPermission(denied), 'storage.objects.list');
assert.equal(missingPermission(new Error('x does not have storage.objects.get access to y')), 'storage.objects.get');
assert.equal(missingPermission(new Error('boom')), null);
assert.equal(isStorageAccessError(denied), true);
assert.equal(isStorageAccessError(apiError(404, 'No such object')), false);

// Permission denied → 403, bucket and permission named, no principal leaked.
let out = storageFailure(denied, { bucket: 'llm-d-benchmarks-staging', action: 'list', fallbackMessage: 'Failed to list results' });
assert.equal(out.status, 403);
assert.equal(out.body.code, 'storage_access_denied');
assert.equal(out.body.bucket, 'llm-d-benchmarks-staging');
assert.equal(out.body.permission, 'storage.objects.list');
assert.match(out.body.error, /lacks storage\.objects\.list on gs:\/\/llm-d-benchmarks-staging/);
assert.ok(!JSON.stringify(out.body).includes('someone@example.com'), 'the service account stays in the server log');

// A 403 without a named permission falls back to the one the action needs.
out = storageFailure(apiError(403, 'Forbidden'), { bucket: 'b', action: 'delete', fallbackMessage: 'x' });
assert.equal(out.body.permission, 'storage.objects.delete');

// No credentials at all (401 from Storage) is still access, still 403 (our 401 means "sign in").
out = storageFailure(apiError(401, 'Anonymous caller'), { bucket: 'b', action: 'read', fallbackMessage: 'x' });
assert.equal(out.status, 403);
assert.match(out.body.error, /no valid credentials/);

// Everything else keeps its server-error status and details.
out = storageFailure(new Error('socket hang up'), { bucket: 'b', action: 'list', fallbackMessage: 'Failed to list results' });
assert.deepEqual(out, { status: 500, body: { error: 'Failed to list results', details: 'socket hang up' } });
out = storageFailure(apiError(503, 'Backend unavailable'), { bucket: 'b', action: 'write', fallbackMessage: 'Failed', fallbackStatus: 502 });
assert.equal(out.status, 502);

console.log('errors.test: all checks passed');
