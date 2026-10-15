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

import React, { useId, useMemo } from 'react';
import { Database, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button, Input, Label, Panel, Spinner, StatusChip, Switch, ToggleGroup } from '../ui';
import { cn } from '../../utils/cn';
import { LOADED_AT, fmtDay, sourceOf } from './catalog';
import { sourceHealth } from './sourceHealth';

const BUILT_IN = new Set(['llm-d-benchmarks', 'llm-d-benchmarks-staging']);

// Admins register each pipeline source once and check its health here. Sync
// now lives only on this page; everyone else just sees Source as a filter.
// `runs` must include hidden sources too, so a hidden one keeps its row (and
// its switch) and can be shown again. `uniqueRuns` (source key → count) is
// how many runs only that source provides.
export function SourcesTab({ runs, uniqueRuns, dashboardData, onSyncAll, syncing }) {
    const {
        gcsProfiles = [],
        selectedSources,
        setSelectedSources,
        hiddenSources,
        setHiddenSources,
        gcsLoading,
        gcsError,
        gcsSuccess,
        connectionType,
        setConnectionType,
        newBucketName,
        setNewBucketName,
        newBucketAlias,
        setNewBucketAlias,
        handleAddGCSBucket,
        handleAddAWSBucket,
        removeGCSBucket,
        removeAWSBucket,
    } = dashboardData;
    // Names the GCS / S3 toggle group after its visible "Storage" label.
    const storageLabelId = useId();

    const sources = useMemo(() => {
        const map = new Map();
        runs.forEach((r) => {
            if (r.isLocalOnly) return;
            const s = map.get(r.sourceRaw) || { key: r.sourceRaw, label: r.source, labels: new Map(), runs: 0, newest: 0, harnesses: new Set(), profile: null };
            s.runs += 1;
            s.newest = Math.max(s.newest, r.ts || 0);
            s.harnesses.add(r.harness);
            s.labels.set(r.source, (s.labels.get(r.source) || 0) + 1);
            map.set(r.sourceRaw, s);
        });
        // One pipeline can carry several archives (the Drive source holds both
        // the benchmarks and the results archive): name them all, biggest first.
        map.forEach((s) => {
            if (s.labels.size > 1) s.label = [...s.labels.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label).join(' + ');
        });
        gcsProfiles
            .filter((p) => p.type === 'gcs' || p.type === 'aws')
            .forEach((p) => {
                const key = `${p.type}:${p.bucketName}`;
                const s = map.get(key) || { key, label: p.alias || sourceOf({ source: key }).label, runs: 0, newest: 0, harnesses: new Set(), profile: null };
                s.profile = p;
                if (p.alias) s.label = p.alias;
                map.set(key, s);
            });
        // API sources sync too, so their health comes from their profile.
        gcsProfiles
            .filter((p) => p.type === 'giq')
            .forEach((p) => {
                const s = map.get(`giq:${p.bucketName}`);
                if (s) s.profile = p;
            });
        return [...map.values()].sort((a, b) => b.runs - a.runs);
    }, [runs, gcsProfiles]);

    // Show in Browse writes hiddenSources, which is saved with the registered
    // sources. It used to edit selectedSources, but sync adds every source it
    // loads back into that set (so a hide didn't survive a reload), and the
    // main dashboard filters on it too.
    const isShown = (key) => (!selectedSources || selectedSources.has(key)) && !hiddenSources?.has(key);
    const setShown = (key, show) => {
        setHiddenSources((prev) => {
            const next = new Set(prev);
            if (show) next.delete(key);
            else next.add(key);
            return next;
        });
        // Turning a source on also undoes it being unticked elsewhere (e.g. the
        // dashboard's source filter), so the switch never says Shown when it isn't.
        if (show && selectedSources && !selectedSources.has(key)) setSelectedSources(new Set([...selectedSources, key]));
    };
    const add = () => (connectionType === 'aws' ? handleAddAWSBucket(newBucketAlias) : handleAddGCSBucket(newBucketAlias));

    return (
        <div className="space-y-6">
            <Panel
                variant="editorial"
                padding="none"
                title="Sources"
                titleAs="h2"
                subtitle="Each pipeline is registered once. Its runs show up in Browse, labelled by source. Runs counts only what no other source has, so hiding a source removes exactly that many. Show in Browse choices are saved in this browser."
                actions={
                    <Button size="xs" variant="secondary" onClick={onSyncAll} disabled={syncing}>
                        {syncing ? <Spinner size="xs" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
                        Sync now
                    </Button>
                }
            >
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="border-b border-zinc-200 bg-zinc-50/70">
                            <tr className="label-caps text-zinc-500">
                                <th className="px-5 py-3 font-semibold">Source</th>
                                <th className="px-4 py-3 font-semibold">Harness</th>
                                <th className="px-4 py-3 text-right font-semibold">Runs</th>
                                <th className="px-4 py-3 font-semibold">Newest run</th>
                                <th className="px-4 py-3 font-semibold">Health</th>
                                <th className="px-4 py-3 font-semibold">Show in Browse</th>
                                <th className="px-4 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100">
                            {sources.map((s) => {
                                const p = s.profile;
                                const removable = p && (p.type === 'gcs' || p.type === 'aws') && !BUILT_IN.has(p.bucketName);
                                const shown = isShown(s.key);
                                const only = Math.min(s.runs, uniqueRuns?.get(s.key) ?? s.runs);
                                const health = sourceHealth(s, LOADED_AT);
                                return (
                                    <tr key={s.key} className={cn(!shown && 'bg-zinc-50/70')}>
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2">
                                                <Database className={cn('h-3.5 w-3.5 shrink-0', shown ? 'text-accent-600' : 'text-zinc-400')} aria-hidden="true" />
                                                <span className={cn('font-medium', shown ? 'text-zinc-900' : 'text-zinc-500')}>{s.label}</span>
                                            </div>
                                            <div className="mt-0.5 pl-5 font-mono text-tiny text-zinc-500">
                                                {p && p.type !== 'giq' ? `${p.type === 'gcs' ? 'gs://' : 's3://'}${p.bucketName}` : s.key}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-zinc-700">{[...s.harnesses].join(', ') || '—'}</td>
                                        <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900">
                                            {only}
                                            {only < s.runs && <div className="whitespace-nowrap font-sans text-tiny text-zinc-500">+{s.runs - only} also in another source</div>}
                                        </td>
                                        <td className="px-4 py-3 text-zinc-700">{s.newest ? fmtDay(s.newest) : '—'}</td>
                                        <td className="px-4 py-3">
                                            <StatusChip status={health.status} size="xs" label={health.label} />
                                            {health.note && <div className="mt-1 max-w-[220px] text-tiny text-zinc-500">{health.note}</div>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Switch
                                                checked={shown}
                                                onChange={(on) => setShown(s.key, on)}
                                                label={shown ? 'Shown' : 'Hidden'}
                                                aria-label={`Show ${s.label} (${s.key}) in Browse`}
                                            />
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {removable && (
                                                <Button
                                                    size="xs"
                                                    variant="ghost"
                                                    aria-label={`Remove ${s.label}`}
                                                    onClick={() => (p.type === 'gcs' ? removeGCSBucket(p.bucketName) : removeAWSBucket(p.bucketName))}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                                </Button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </Panel>

            <Panel
                variant="editorial"
                title="Register a source"
                titleAs="h2"
                subtitle="Point Prism at a pipeline bucket once. New runs sync automatically. For now it’s saved in this browser, so other admins won’t see it yet."
            >
                <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                    <div>
                        <Label surface="light" id={storageLabelId}>
                            Storage
                        </Label>
                        <ToggleGroup
                            size="xs"
                            aria-labelledby={storageLabelId}
                            value={connectionType}
                            onChange={setConnectionType}
                            options={[
                                { value: 'gcs', label: 'GCS' },
                                { value: 'aws', label: 'S3' },
                            ]}
                        />
                    </div>
                    <div>
                        <Label surface="light" htmlFor="rs-source-name">
                            Name
                        </Label>
                        <Input surface="light" id="rs-source-name" value={newBucketAlias} placeholder="e.g. Nightly pipeline" onChange={(e) => setNewBucketAlias(e.target.value)} />
                    </div>
                    <div>
                        <Label surface="light" htmlFor="rs-source-bucket">
                            Bucket
                        </Label>
                        <Input
                            surface="light"
                            id="rs-source-bucket"
                            value={newBucketName}
                            placeholder={connectionType === 'aws' ? 's3-bucket-name' : 'gs://bucket-name'}
                            onChange={(e) => setNewBucketName(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && newBucketName && add()}
                        />
                    </div>
                    <Button size="sm" onClick={add} disabled={gcsLoading || !newBucketName} isLoading={gcsLoading}>
                        {!gcsLoading && <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                        Register
                    </Button>
                </div>
                {/* Always in the page, so what Register reports is read out when it appears. */}
                <div aria-live="polite">
                    {gcsError && <p className="mt-3 text-xs text-red-700">{gcsError}</p>}
                    {gcsSuccess && <p className="mt-3 text-xs text-emerald-700">{gcsSuccess}</p>}
                </div>
            </Panel>
        </div>
    );
}
