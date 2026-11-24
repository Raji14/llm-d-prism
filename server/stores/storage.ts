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

import fs from 'fs/promises';
import path from 'path';
import { storage as gcsClient } from '../results/gcs.ts';
import { DEFAULT_LOCAL_STORE_DIR } from './registry.ts';
import { StoredArtifactSchema, StoredResultSchema, type StoreConfig, type StoredArtifact, type StoredResult } from './schema.ts';

/* eslint-disable no-unused-vars */
export interface StoreAdapter {
    listResults(): Promise<StoredResult[]>;
    getResult(id: string): Promise<StoredResult | null>;
    saveResult(result: StoredResult): Promise<void>;
    deleteResult(id: string): Promise<void>;

    listArtifacts(): Promise<StoredArtifact[]>;
    getArtifact(slug: string): Promise<StoredArtifact | null>;
    saveArtifact(artifact: StoredArtifact): Promise<void>;
    deleteArtifact(slug: string): Promise<void>;
}
/* eslint-enable no-unused-vars */

const safeId = (id: string): string => id.replace(/[^a-zA-Z0-9._-]/g, '_');

class LocalFileStoreAdapter implements StoreAdapter {
    private resultsDir: string;
    private artifactsDir: string;

    constructor(storeId: string, baseDir = DEFAULT_LOCAL_STORE_DIR) {
        const root = path.join(baseDir, safeId(storeId));
        this.resultsDir = path.join(root, 'results');
        this.artifactsDir = path.join(root, 'artifacts');
    }

    private async ensureDir(dir: string): Promise<void> {
        await fs.mkdir(dir, { recursive: true });
    }

    async listResults(): Promise<StoredResult[]> {
        try {
            const entries = await fs.readdir(this.resultsDir);
            const items: StoredResult[] = [];
            for (const name of entries) {
                if (!name.endsWith('.json')) continue;
                try {
                    const raw = JSON.parse(await fs.readFile(path.join(this.resultsDir, name), 'utf8'));
                    const parsed = StoredResultSchema.safeParse(raw);
                    if (parsed.success) items.push(parsed.data);
                } catch {
                    // Skip unreadable/corrupt file rather than crashing list.
                }
            }
            return items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
                return [];
            }
            throw err;
        }
    }

    async getResult(id: string): Promise<StoredResult | null> {
        try {
            const file = path.join(this.resultsDir, `${safeId(id)}.json`);
            const raw = JSON.parse(await fs.readFile(file, 'utf8'));
            const parsed = StoredResultSchema.safeParse(raw);
            return parsed.success ? parsed.data : null;
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
                return null;
            }
            throw err;
        }
    }

    async saveResult(result: StoredResult): Promise<void> {
        await this.ensureDir(this.resultsDir);
        const file = path.join(this.resultsDir, `${safeId(result.id)}.json`);
        await fs.writeFile(file, JSON.stringify(result, null, 2), 'utf8');
    }

    async deleteResult(id: string): Promise<void> {
        const file = path.join(this.resultsDir, `${safeId(id)}.json`);
        await fs.rm(file, { force: true });
    }

    async listArtifacts(): Promise<StoredArtifact[]> {
        try {
            const entries = await fs.readdir(this.artifactsDir);
            const items: StoredArtifact[] = [];
            for (const name of entries) {
                if (!name.endsWith('.json')) continue;
                try {
                    const raw = JSON.parse(await fs.readFile(path.join(this.artifactsDir, name), 'utf8'));
                    const parsed = StoredArtifactSchema.safeParse(raw);
                    if (parsed.success) items.push(parsed.data);
                } catch {
                    // Skip unreadable artifact.
                }
            }
            return items.sort((a, b) => Number(b.curated) - Number(a.curated) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
                return [];
            }
            throw err;
        }
    }

    async getArtifact(slug: string): Promise<StoredArtifact | null> {
        try {
            const file = path.join(this.artifactsDir, `${safeId(slug)}.json`);
            const raw = JSON.parse(await fs.readFile(file, 'utf8'));
            const parsed = StoredArtifactSchema.safeParse(raw);
            return parsed.success ? parsed.data : null;
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
                return null;
            }
            throw err;
        }
    }

    async saveArtifact(artifact: StoredArtifact): Promise<void> {
        await this.ensureDir(this.artifactsDir);
        const file = path.join(this.artifactsDir, `${safeId(artifact.slug)}.json`);
        await fs.writeFile(file, JSON.stringify(artifact, null, 2), 'utf8');
    }

    async deleteArtifact(slug: string): Promise<void> {
        const file = path.join(this.artifactsDir, `${safeId(slug)}.json`);
        await fs.rm(file, { force: true });
    }
}

class GcsStoreAdapter implements StoreAdapter {
    private bucket: string;
    private resultsPrefix: string;
    private artifactsPrefix: string;

    constructor(storeId: string, bucket: string, prefix = 'prism-stores') {
        this.bucket = bucket;
        const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
        this.resultsPrefix = `${cleanPrefix}/${safeId(storeId)}/results/`;
        this.artifactsPrefix = `${cleanPrefix}/${safeId(storeId)}/artifacts/`;
    }

    async listResults(): Promise<StoredResult[]> {
        const [files] = await gcsClient.bucket(this.bucket).getFiles({ prefix: this.resultsPrefix });
        const jsonFiles = files.filter((f) => f.name.endsWith('.json'));
        const loaded = await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    const [buf] = await file.download();
                    const parsed = StoredResultSchema.safeParse(JSON.parse(buf.toString('utf8')));
                    return parsed.success ? parsed.data : null;
                } catch {
                    return null;
                }
            })
        );
        return loaded
            .filter((x): x is StoredResult => x !== null)
            .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }

    async getResult(id: string): Promise<StoredResult | null> {
        try {
            const [buf] = await gcsClient.bucket(this.bucket).file(`${this.resultsPrefix}${safeId(id)}.json`).download();
            const parsed = StoredResultSchema.safeParse(JSON.parse(buf.toString('utf8')));
            return parsed.success ? parsed.data : null;
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 404) return null;
            throw err;
        }
    }

    async saveResult(result: StoredResult): Promise<void> {
        const file = gcsClient.bucket(this.bucket).file(`${this.resultsPrefix}${safeId(result.id)}.json`);
        await file.save(JSON.stringify(result), { contentType: 'application/json' });
    }

    async deleteResult(id: string): Promise<void> {
        try {
            await gcsClient.bucket(this.bucket).file(`${this.resultsPrefix}${safeId(id)}.json`).delete();
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 404) return;
            throw err;
        }
    }

    async listArtifacts(): Promise<StoredArtifact[]> {
        const [files] = await gcsClient.bucket(this.bucket).getFiles({ prefix: this.artifactsPrefix });
        const jsonFiles = files.filter((f) => f.name.endsWith('.json'));
        const loaded = await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    const [buf] = await file.download();
                    const parsed = StoredArtifactSchema.safeParse(JSON.parse(buf.toString('utf8')));
                    return parsed.success ? parsed.data : null;
                } catch {
                    return null;
                }
            })
        );
        return loaded
            .filter((x): x is StoredArtifact => x !== null)
            .sort((a, b) => Number(b.curated) - Number(a.curated) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    }

    async getArtifact(slug: string): Promise<StoredArtifact | null> {
        try {
            const [buf] = await gcsClient.bucket(this.bucket).file(`${this.artifactsPrefix}${safeId(slug)}.json`).download();
            const parsed = StoredArtifactSchema.safeParse(JSON.parse(buf.toString('utf8')));
            return parsed.success ? parsed.data : null;
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 404) return null;
            throw err;
        }
    }

    async saveArtifact(artifact: StoredArtifact): Promise<void> {
        const file = gcsClient.bucket(this.bucket).file(`${this.artifactsPrefix}${safeId(artifact.slug)}.json`);
        await file.save(JSON.stringify(artifact), { contentType: 'application/json' });
    }

    async deleteArtifact(slug: string): Promise<void> {
        try {
            await gcsClient.bucket(this.bucket).file(`${this.artifactsPrefix}${safeId(slug)}.json`).delete();
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 404) return;
            throw err;
        }
    }
}

export function adapterForStore(store: StoreConfig): StoreAdapter {
    if (store.storage.type === 'gcs') {
        return new GcsStoreAdapter(store.id, store.storage.bucket, store.storage.prefix);
    }
    return new LocalFileStoreAdapter(store.id, store.storage.dir || DEFAULT_LOCAL_STORE_DIR);
}
