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

// Cloud Storage failures, as HTTP answers. When the server's credentials
// can't use the results bucket (a missing IAM role, no credentials at all),
// that's configuration, not a crash: the API answers 403 and names the bucket
// and the permission, so the UI can say it couldn't reach the results store
// and an operator knows what to grant. Anything else stays a server error.

export type StorageAction = 'list' | 'read' | 'write' | 'delete';

export interface StorageErrorBody {
    error: string;
    code?: 'storage_access_denied';
    bucket?: string;
    permission?: string;
    details?: string;
}

// The permission each action needs when the error message doesn't name one.
const PERMISSION_FOR: Record<StorageAction, string> = {
    list: 'storage.objects.list',
    read: 'storage.objects.get',
    write: 'storage.objects.create',
    delete: 'storage.objects.delete',
};

/** The HTTP status Cloud Storage answered with (ApiError.code), if any. */
export function storageStatus(error: unknown): number | null {
    let e: unknown = error;
    // Follow wrapped errors (Error.cause) a few levels down.
    for (let depth = 0; e && typeof e === 'object' && depth < 4; depth++) {
        const { code, response, cause } = e as { code?: unknown; response?: { status?: unknown }; cause?: unknown };
        if (typeof code === 'number') return code;
        if (typeof response?.status === 'number') return response.status;
        e = cause;
    }
    return null;
}

/** The IAM permission a Cloud Storage error says is missing, e.g. "storage.objects.list". */
export function missingPermission(error: unknown): string | null {
    const message = error instanceof Error ? error.message : String(error ?? '');
    const match = message.match(/Permission '([\w.]+)' denied/) || message.match(/does not have ([\w.]+) access/);
    return match ? match[1] : null;
}

/** True when the failure is the server's storage access (401/403), not a bug or an outage. */
export function isStorageAccessError(error: unknown): boolean {
    const status = storageStatus(error);
    return status === 401 || status === 403;
}

/**
 * The status and JSON body for a failed results-store operation.
 * Access problems → 403 with bucket and permission; anything else →
 * `fallbackStatus` (500 by default) with `fallbackMessage` and the details.
 */
export function storageFailure(
    error: unknown,
    { bucket, action, fallbackMessage, fallbackStatus = 500 }: { bucket: string; action: StorageAction; fallbackMessage: string; fallbackStatus?: number }
): { status: number; body: StorageErrorBody } {
    if (isStorageAccessError(error)) {
        const noCredentials = storageStatus(error) === 401;
        const permission = missingPermission(error) || PERMISSION_FOR[action];
        return {
            status: 403,
            body: {
                error: noCredentials
                    ? `The Prism server has no valid credentials for the results store (gs://${bucket}).`
                    : `The Prism server can't use the results store: it lacks ${permission} on gs://${bucket}.`,
                code: 'storage_access_denied',
                bucket,
                permission,
            },
        };
    }
    const details = error instanceof Error ? error.message : String(error);
    return { status: fallbackStatus, body: { error: fallbackMessage, details } };
}
