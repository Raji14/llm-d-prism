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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { StoreConfigSchema, type StoreCapabilities, type StoreConfig, type StorePublicSummary } from './schema.ts';
import type { PermissionLevel } from '../iam.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_LOCAL_STORE_DIR = path.resolve(
    process.env.PRISM_STORE_DATA_DIR || path.join(__dirname, '../../.prism-stores')
);

export interface CallerContext {
    username: string | null;
    permission: PermissionLevel;
    /** Dev-only store profile override ('public' | 'multi' | 'internal'). */
    devStoreProfile?: string | null;
}

function defaultPublicStore(env: Record<string, string | undefined>): StoreConfig {
    const rawBuckets = env.DEFAULT_BUCKETS || '';
    const firstBucket = rawBuckets.split(',').map((b) => b.trim()).filter(Boolean)[0];
    const useGcs = Boolean(firstBucket && env.PRISM_STORE_BACKEND === 'gcs');
    return StoreConfigSchema.parse({
        id: 'llm-d',
        name: 'llm-d',
        description: 'Community-governed fleet-scale inference and systems benchmark store.',
        brand: 'llm-d',
        defaultTarget: true,
        governance: {
            readAccess: 'anyone',
            writeAccess: 'members',
            approvalRequired: true,
            dcoRequired: true,
            approverOrg: env.PRISM_GITHUB_ADMIN_ORG || 'llm-d',
        },
        storage: useGcs
            ? { type: 'gcs', bucket: firstBucket, prefix: 'prism-stores' }
            : { type: 'local', dir: DEFAULT_LOCAL_STORE_DIR },
    });
}

function defaultInternalStore(env: Record<string, string | undefined>): StoreConfig {
    const customName = (env.SITE_NAME || '').trim();
    const rawBuckets = env.DEFAULT_BUCKETS || '';
    const firstBucket = rawBuckets.split(',').map((b) => b.trim()).filter(Boolean)[0];
    const useGcs = Boolean(firstBucket && env.PRISM_STORE_BACKEND === 'gcs');
    return StoreConfigSchema.parse({
        id: 'internal',
        name: customName || 'Result store',
        description: 'Team result store for experiments, baselines, and curated artifacts.',
        brand: 'none',
        defaultTarget: true,
        governance: {
            readAccess: 'anyone', // Behind org IAP / perimeter; permissions enforce writes & approvals.
            writeAccess: 'members',
            approvalRequired: false,
            dcoRequired: false,
            approverOrg: env.PRISM_GITHUB_ADMIN_ORG || undefined,
        },
        storage: useGcs
            ? { type: 'gcs', bucket: firstBucket, prefix: 'prism-stores' }
            : { type: 'local', dir: DEFAULT_LOCAL_STORE_DIR },
    });
}

/**
 * Loads the configured single-digit list of logical stores.
 *
 * Precedence:
 * 1. Dev-only preview profile (`multi` = internal + llm-d, `internal` = internal only, `public` = llm-d only)
 * 2. `PRISM_STORES` env var (JSON array of StoreConfig objects or path to a JSON file)
 * 3. Backward-compatible synthesis from `PRISM_INSTANCE` / `SITE_NAME` / `PRISM_BRAND`
 */
export function loadConfiguredStores(
    env: Record<string, string | undefined> = process.env,
    devStoreProfile?: string | null
): StoreConfig[] {
    const isProd = env.NODE_ENV === 'production';

    if (!isProd && devStoreProfile) {
        if (devStoreProfile === 'multi') {
            return [
                defaultInternalStore({ ...env, SITE_NAME: env.SITE_NAME && env.SITE_NAME !== 'llm-d' ? env.SITE_NAME : 'Google Cloud' }),
                { ...defaultPublicStore(env), defaultTarget: false },
            ];
        }
        if (devStoreProfile === 'internal') {
            return [defaultInternalStore({ ...env, SITE_NAME: env.SITE_NAME === 'llm-d' ? '' : env.SITE_NAME })];
        }
        if (devStoreProfile === 'public') {
            return [defaultPublicStore(env)];
        }
    }

    const raw = (env.PRISM_STORES || '').trim();
    if (raw) {
        let parsed: unknown;
        if (raw.startsWith('[')) {
            parsed = JSON.parse(raw);
        } else if (fs.existsSync(raw)) {
            parsed = JSON.parse(fs.readFileSync(raw, 'utf8'));
        } else {
            throw new Error(`PRISM_STORES must be a JSON array or path to an existing JSON file (got: ${raw})`);
        }
        const list = z.array(StoreConfigSchema).min(1).max(9).parse(parsed);
        // Ensure at least one store is marked as the default publish target.
        if (!list.some((s) => s.defaultTarget)) {
            list[0] = { ...list[0], defaultTarget: true };
        }
        return list;
    }

    if (env.PRISM_INSTANCE === 'internal') {
        const internal = defaultInternalStore(env);
        // Optional federation with public llm-d store when enabled.
        if (env.PRISM_CONNECT_PUBLIC_STORE !== 'false') {
            return [internal, { ...defaultPublicStore(env), defaultTarget: false }];
        }
        return [internal];
    }

    return [defaultPublicStore(env)];
}

/**
 * Resolves what the caller can do in a logical store.
 * Permissions govern visibility — never hardcoded "public" vs "private" UI boxes.
 */
export function resolveStoreCapabilities(store: StoreConfig, caller: CallerContext, isDev = process.env.NODE_ENV !== 'production'): StoreCapabilities {
    const isSignedIn = Boolean(caller.username);
    const isMember = caller.permission === 'user' || caller.permission === 'admin';
    const isApprover = caller.permission === 'admin';

    // In local dev without GitHub OAuth configured, allow exploring & testing writes cleanly.
    const devFallbackWrite = isDev && !process.env.GITHUB_CLIENT_ID;

    let canRead = true;
    if (store.governance.readAccess === 'authenticated') {
        canRead = isSignedIn || devFallbackWrite;
    } else if (store.governance.readAccess === 'members') {
        canRead = isMember || devFallbackWrite;
    }

    let canWrite = false;
    if (store.governance.writeAccess === 'authenticated') {
        canWrite = isSignedIn || devFallbackWrite;
    } else if (store.governance.writeAccess === 'members') {
        canWrite = isMember || devFallbackWrite;
    } else if (store.governance.writeAccess === 'approvers') {
        canWrite = isApprover || devFallbackWrite;
    }

    const canApprove = isApprover || devFallbackWrite;

    return {
        canRead,
        canWrite,
        canApprove,
        approvalRequired: store.governance.approvalRequired,
        dcoRequired: store.governance.dcoRequired,
    };
}

/** Strips storage backend details (buckets/paths) before sending stores to clients. */
export function toPublicStoreSummary(
    store: StoreConfig,
    capabilities: StoreCapabilities,
    stats?: StorePublicSummary['stats']
): StorePublicSummary {
    return {
        id: store.id,
        name: store.name,
        description: store.description || '',
        brand: store.brand,
        defaultTarget: Boolean(store.defaultTarget),
        capabilities,
        ...(stats ? { stats } : {}),
    };
}

/**
 * Returns only the logical stores visible to the caller.
 */
export function listAccessibleStores(
    caller: CallerContext,
    env: Record<string, string | undefined> = process.env
): Array<{ config: StoreConfig; capabilities: StoreCapabilities }> {
    const isDev = env.NODE_ENV !== 'production';
    const configured = loadConfiguredStores(env, caller.devStoreProfile);
    return configured
        .map((config) => ({ config, capabilities: resolveStoreCapabilities(config, caller, isDev) }))
        .filter((entry) => entry.capabilities.canRead);
}
