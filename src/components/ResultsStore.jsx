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

// Simplified, agent-native, multi-store Results Store.
//
// Three primitives:
//   1. Stores    — permission-governed logical collections (no buckets, no public/private boxes)
//   2. Results   — unified immutable-evidence records across serving, storage, routing, protocol, and fleet scale
//   3. Artifacts — shareable declarative building-block dashboards or sandboxed HTML backed by Result IDs
//
// Two primary tabs (Explore, Artifacts) plus a conditional Review queue for approvers.
// Nightly regression monitoring lives in top-level Regressions.

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
    Activity,
    BookOpen,
    Check,
    ChevronDown,
    Code2,
    GitCompare,
    Github,
    Layers,
    LogOut,
    Plus,
    Server,
    Shield,
    Sparkles,
    X,
} from 'lucide-react';
import { Badge, Button, Checkbox, EmptyState, Input, LoadingState, PageHeader, Panel, Select, Spinner, StatusChip, TabPanel, Tabs, ToggleGroup } from './ui';
import { cn } from '../utils/cn';
import { useGitHubAuth } from '../hooks/useGitHubAuth.js';
import { buildRows, buildRuns } from './ResultsStore/catalog';
import {
    RESULT_DOMAINS,
    SCALE_FILTERS,
    adaptCatalogRowToResult,
    computeResultDeltas,
    domainLabelOf,
    fleetLabelOf,
    formatMetricValue,
    primaryMetricOf,
    rankLocalBaselines,
    scaleTierOf,
    signedPct,
    storeApi,
    storeHeaderBranding,
} from './ResultsStore/storeClient';
import { IngestDialog } from './ResultsStore/IngestDialog';
import { ResultDetailView } from './ResultsStore/ResultDetailView';
import { UnifiedCompareView } from './ResultsStore/UnifiedCompareView';
import { ArtifactBuilderDialog, ArtifactViewer, ArtifactsTab } from './ResultsStore/ArtifactsTab';
import { GlossaryDialog } from './ResultsStore/Glossary';

const DEV = import.meta.env.DEV;
const STORE_PROFILES = ['public', 'multi', 'internal'];
const DEV_ROLES = ['admin', 'contributor', 'signedout'];

const readParam = (name) => {
    try {
        return new URLSearchParams(window.location.search).get(name);
    } catch {
        return null;
    }
};

function setUrlParams(updates) {
    try {
        const p = new URLSearchParams(window.location.search);
        Object.entries(updates).forEach(([k, v]) => {
            if (v == null || v === '' || v === 'all') p.delete(k);
            else p.set(k, String(v));
        });
        window.history.replaceState(window.history.state, '', `${window.location.pathname}?${p.toString()}`);
    } catch {
        // Ignore history errors in restricted environments.
    }
}

function AccountMenu({ auth }) {
    const { isAuthenticated, user, login, logout, isConfigured, isLoading } = auth;
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    if (isLoading) {
        return (
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50">
                <Spinner size="sm" className="text-zinc-500" />
            </span>
        );
    }
    if (!isConfigured || !isAuthenticated) {
        return (
            <Button variant="secondary" size="sm" onClick={login} disabled={!isConfigured} title={isConfigured ? undefined : 'GitHub sign-in isn’t configured on this server.'}>
                <Github className="h-3.5 w-3.5" aria-hidden="true" />
                Sign in
            </Button>
        );
    }
    return (
        <div className="relative" ref={ref}>
            <Button variant="secondary" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
                {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="h-5 w-5 shrink-0 rounded-full border border-zinc-300 object-cover" />
                ) : (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-tiny font-bold text-zinc-800">
                        {user?.username ? user.username.slice(0, 2).toUpperCase() : 'GH'}
                    </span>
                )}
                <span className="max-w-[120px] truncate">{user?.username}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 text-zinc-500 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </Button>
            {open && (
                <div className="absolute right-0 z-[100] mt-2 w-56 rounded-2xl border border-zinc-200 bg-white py-1.5 shadow-lg">
                    <div className="border-b border-zinc-200 px-4 py-2">
                        <p className="text-xs text-zinc-500">Signed in as</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-zinc-900">@{user?.username}</p>
                        <p className="mt-1 flex items-center gap-1.5 text-tiny text-zinc-500">
                            <Shield className="h-3 w-3 text-accent-600" aria-hidden="true" />
                            Role: {user?.permission || 'none'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setOpen(false);
                            logout();
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left text-xs font-semibold text-red-700 hover:bg-zinc-50"
                    >
                        <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}

function DevPreviewBar({ storeProfile, onStoreProfile, devRole, onDevRole }) {
    return (
        <div className="my-1.5 flex flex-wrap items-center gap-3 rounded-full border border-dashed border-zinc-300 bg-zinc-50/80 px-3 py-1 text-micro text-zinc-600">
            <span className="label-caps text-zinc-500">Dev preview</span>
            <span className="flex items-center gap-1.5">
                Stores
                <ToggleGroup
                    size="xs"
                    aria-label="Preview store setup"
                    value={storeProfile}
                    onChange={onStoreProfile}
                    options={[
                        { value: 'multi', label: 'Google Cloud + llm-d' },
                        { value: 'public', label: 'llm-d only' },
                        { value: 'internal', label: 'Result store only' },
                    ]}
                />
            </span>
            <span className="flex items-center gap-1.5">
                Role
                <ToggleGroup
                    size="xs"
                    aria-label="Preview role"
                    value={devRole}
                    onChange={onDevRole}
                    options={[
                        { value: 'admin', label: 'Approver' },
                        { value: 'contributor', label: 'Contributor' },
                        { value: 'signedout', label: 'Visitor' },
                    ]}
                />
            </span>
        </div>
    );
}

function StoreChip({ store, active, count, onClick }) {
    const isLlmd = store?.brand === 'llm-d';
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                active
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
            )}
        >
            {isLlmd ? (
                <img
                    src="/llm-d-logotype-and-icon.png"
                    alt="llm-d"
                    className={cn('h-3.5 object-contain', active && 'brightness-0 invert')}
                />
            ) : (
                <span>{store.name}</span>
            )}
            {count != null && (
                <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-tiny tabular-nums', active ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600')}>
                    {count}
                </span>
            )}
        </button>
    );
}

export default function ResultsStore({ onNavigate, onNavigateBack, dashboardData }) {
    const auth = useGitHubAuth();
    const { data = [], gcsProfiles = [], submissionsMap = {}, addToast, toasts = [], removeToast, loading: catalogLoading } = dashboardData || {};
    const notify = useCallback((message, type = 'success') => addToast?.(message, type), [addToast]);

    // Dev-only multi-store & role preview (defaults to multi-store in dev so both stores + branding are immediately inspectable).
    const [devStoreProfile, setDevStoreProfile] = useState(() => {
        if (!DEV) return null;
        const p = readParam('stores');
        return STORE_PROFILES.includes(p) ? p : 'multi';
    });
    const [devRole, setDevRole] = useState(() => {
        if (!DEV) return null;
        const r = readParam('role');
        return DEV_ROLES.includes(r) ? r : 'admin';
    });

    const apiCtx = useMemo(
        () => ({ devStoreProfile: DEV ? devStoreProfile : null, devRole: DEV ? devRole : null }),
        [devStoreProfile, devRole]
    );

    const [stores, setStores] = useState([]);
    const [serverResults, setServerResults] = useState([]);
    const [artifacts, setArtifacts] = useState([]);
    const [loadingStores, setLoadingStores] = useState(true);
    const [storeError, setStoreError] = useState(null);

    const [activeStoreId, setActiveStoreId] = useState(() => readParam('store') || 'all');
    const [tab, setTab] = useState(() => {
        const t = readParam('tab');
        if (['explore', 'artifacts', 'review'].includes(t)) return t;
        if (readParam('artifact')) return 'artifacts';
        return 'explore';
    });

    // Active detail screen: null | { type: 'result', id, storeId } | { type: 'compare', results, baselineId } | { type: 'artifact', artifact, results }
    const [screen, setScreen] = useState(null);

    // Explore filters
    const [query, setQuery] = useState(() => readParam('q') || '');
    const [domainFilter, setDomainFilter] = useState(() => readParam('domain') || 'all');
    const [scaleFilter, setScaleFilter] = useState(() => readParam('scale') || 'all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortBy, setSortBy] = useState('newest');
    const [mineOnly, setMineOnly] = useState(false);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [visibleLimit, setVisibleLimit] = useState(30);

    // Dialogs
    const [ingestDialog, setIngestDialog] = useState(() => ({ open: readParam('ingest') === '1', mode: 'form' }));
    const [artifactBuilder, setArtifactBuilder] = useState(null);
    const [glossaryOpen, setGlossaryOpen] = useState(false);
    // Inline review feedback state in Review queue tab so reviewers never send blank change requests.
    const [reviewFeedback, setReviewFeedback] = useState({ id: null, action: null, note: '' });

    const tabsId = useId();
    const actor = auth.user?.username ? `@${auth.user.username}` : DEV && devRole !== 'signedout' ? `@dev-${devRole}` : 'you';

    // Load stores, server-persisted results, and artifacts.
    const refreshStoreData = useCallback(async () => {
        setLoadingStores(true);
        setStoreError(null);
        try {
            const [storesRes, resultsRes, artifactsRes] = await Promise.all([
                storeApi.listStores(apiCtx),
                storeApi.listResults({ limit: 200 }, apiCtx),
                storeApi.listArtifacts({}, apiCtx),
            ]);
            const nextStores = storesRes.stores || [];
            setStores(nextStores);
            setServerResults(resultsRes.items || []);
            setArtifacts(artifactsRes.items || []);

            // Notify top-level site chrome so header branding stays neutral in multi-store / internal mode.
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('prism:stores-changed', { detail: { stores: nextStores } }));
            }

            // If activeStoreId is no longer visible, fall back cleanly.
            setActiveStoreId((prev) => {
                if (prev === 'all') return nextStores.length === 1 ? nextStores[0].id : 'all';
                return nextStores.some((s) => s.id === prev) ? prev : nextStores.length === 1 ? nextStores[0].id : 'all';
            });
        } catch (err) {
            setStoreError(err.message || 'Could not reach the Result store API.');
        } finally {
            setLoadingStores(false);
        }
    }, [apiCtx]);

    useEffect(() => {
        refreshStoreData();
    }, [refreshStoreData]);

    // Deep-link hydration for ?artifact=<storeId>/<slug> or /artifacts/<storeId>/<slug>
    const hydratedArtifactRef = useRef(false);
    useEffect(() => {
        if (hydratedArtifactRef.current || loadingStores) return;
        const pathMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/artifacts\/([^/]+)\/([^/]+)$/) : null;
        const paramVal = readParam('artifact');
        const target = pathMatch ? { storeId: decodeURIComponent(pathMatch[1]), slug: decodeURIComponent(pathMatch[2]) } : paramVal?.includes('/') ? { storeId: paramVal.split('/')[0], slug: paramVal.split('/').slice(1).join('/') } : null;
        if (!target) return;
        hydratedArtifactRef.current = true;
        storeApi
            .getArtifact(target.storeId, target.slug, apiCtx)
            .then((res) => {
                if (res?.artifact) {
                    setTab('artifacts');
                    setScreen({ type: 'artifact', artifact: res.artifact, results: res.results || [] });
                }
            })
            .catch(() => {});
    }, [loadingStores, apiCtx]);

    // Adapt real loaded GCS/archive serving runs into the unified Result list (attached to llm-d store when present).
    const catalogResults = useMemo(() => {
        if (!data.length) return [];
        const aliases = Object.fromEntries((gcsProfiles || []).filter((p) => p.alias).map((p) => [`${p.type}:${p.bucketName}`, p.alias]));
        const runs = buildRuns(data, { aliases, submissionsMap });
        const rows = buildRows(runs);
        const catalogStoreId = stores.some((s) => s.id === 'llm-d') ? 'llm-d' : stores[0]?.id || 'llm-d';
        return rows.map((row) => adaptCatalogRowToResult(row, catalogStoreId)).filter(Boolean);
    }, [data, gcsProfiles, submissionsMap, stores]);

    const storesById = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
    const accessibleStoreIds = useMemo(() => new Set(stores.map((s) => s.id)), [stores]);

    // Combined results across server-persisted store records + adapted catalog sweeps.
    const allResults = useMemo(() => {
        const scopedCatalog = catalogResults.filter((r) => accessibleStoreIds.has(r.storeId));
        return [...serverResults, ...scopedCatalog];
    }, [serverResults, catalogResults, accessibleStoreIds]);

    const resultsById = useMemo(() => new Map(allResults.map((r) => [r.id, r])), [allResults]);

    // Deep-link hydration for ?result=<id> and ?compare=<id1>,<id2>&baseline=<id>
    const hydratedDeepLinkRef = useRef(false);
    useEffect(() => {
        if (hydratedDeepLinkRef.current || loadingStores || !allResults.length) return;
        const compareParam = readParam('compare');
        if (compareParam) {
            const ids = compareParam
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const matched = ids.map((id) => resultsById.get(id)).filter(Boolean);
            if (matched.length) {
                hydratedDeepLinkRef.current = true;
                setScreen({ type: 'compare', results: matched, baselineId: readParam('baseline') || null });
                return;
            }
        }
        const rid = readParam('result');
        if (!rid) return;
        const found = resultsById.get(rid);
        if (found) {
            hydratedDeepLinkRef.current = true;
            setScreen({ type: 'result', id: found.id, storeId: found.storeId });
        }
    }, [loadingStores, allResults.length, resultsById]);

    const hasNonPublished = useMemo(
        () =>
            allResults.some((r) => (activeStoreId === 'all' || r.storeId === activeStoreId) && r.status !== 'published'),
        [allResults, activeStoreId]
    );

    // Filtered list for Explore tab
    const filteredResults = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const me = (auth.user?.username || (DEV && devRole !== 'signedout' ? `dev-${devRole}` : '')).toLowerCase();

        const list = allResults.filter((r) => {
            if (activeStoreId !== 'all' && r.storeId !== activeStoreId) return false;
            if (domainFilter !== 'all' && r.domain !== domainFilter) return false;
            if (scaleFilter !== 'all' && scaleTierOf(r) !== scaleFilter) return false;
            if (statusFilter !== 'all' && r.status !== statusFilter) return false;
            if (mineOnly && (!me || String(r.author || '').toLowerCase() !== me)) return false;
            if (needle) {
                const hay = [
                    r.title,
                    r.summary,
                    r.domain,
                    r.model,
                    r.hardware,
                    r.workload,
                    r.harness,
                    r.author,
                    r.storeId,
                    r.fleet?.topology,
                    r.lineage?.experimentGroup,
                    ...(r.tags || []),
                    ...Object.entries(r.variables || {}).map(([k, v]) => `${k}=${v}`),
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                if (!hay.includes(needle)) return false;
            }
            return true;
        });

        list.sort((a, b) => {
            if (sortBy === 'nodes') return (b.fleet?.nodes || 1) - (a.fleet?.nodes || 1);
            if (sortBy === 'metric') return (primaryMetricOf(b)?.value || 0) - (primaryMetricOf(a)?.value || 0);
            return Date.parse(b.updatedAt || b.createdAt || 0) - Date.parse(a.updatedAt || a.createdAt || 0);
        });
        return list;
    }, [allResults, activeStoreId, domainFilter, scaleFilter, statusFilter, mineOnly, query, sortBy, auth.user, devRole]);

    // Review queue items (only for stores where caller can approve)
    const canApproveAny = useMemo(() => stores.some((s) => s.capabilities?.canApprove && s.capabilities?.approvalRequired), [stores]);
    const reviewItems = useMemo(
        () =>
            serverResults.filter((r) => {
                if (r.status !== 'in_review') return false;
                if (activeStoreId !== 'all' && r.storeId !== activeStoreId) return false;
                return Boolean(storesById.get(r.storeId)?.capabilities?.canApprove);
            }),
        [serverResults, activeStoreId, storesById]
    );

    const visibleArtifacts = useMemo(
        () => (activeStoreId === 'all' ? artifacts : artifacts.filter((a) => a.storeId === activeStoreId)),
        [artifacts, activeStoreId]
    );

    const canWriteAny = useMemo(() => stores.some((s) => s.capabilities?.canWrite), [stores]);
    const branding = useMemo(() => storeHeaderBranding(stores, activeStoreId), [stores, activeStoreId]);

    const toggleSelect = (id) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const openCompare = (list, baselineId = null) => {
        if (!list?.length) return;
        setSelectedIds(new Set());
        setScreen({ type: 'compare', results: list, baselineId });
    };

    const openQuickCompare = (result) => {
        const ranked = rankLocalBaselines(result, allResults, 1);
        const base = ranked[0]?.result || null;
        openCompare(base ? [result, base] : [result], base?.id || null);
    };

    const openArtifact = async (artifact) => {
        setUrlParams({ artifact: `${artifact.storeId}/${artifact.slug}`, result: null });
        try {
            const res = await storeApi.getArtifact(artifact.storeId, artifact.slug, apiCtx);
            const hydrated = [...(res.results || [])];
            const have = new Set(hydrated.map((r) => r.id));
            (artifact.resultIds || []).forEach((id) => {
                if (!have.has(id) && resultsById.has(id)) hydrated.push(resultsById.get(id));
            });
            setScreen({ type: 'artifact', artifact: res.artifact || artifact, results: hydrated });
        } catch {
            const localHydrated = (artifact.resultIds || []).map((id) => resultsById.get(id)).filter(Boolean);
            setScreen({ type: 'artifact', artifact, results: localHydrated });
        }
    };

    const deleteArtifact = async (artifact) => {
        try {
            await storeApi.deleteArtifact(artifact.storeId, artifact.slug, apiCtx);
            setArtifacts((prev) => prev.filter((a) => !(a.storeId === artifact.storeId && a.slug === artifact.slug)));
            setScreen(null);
            setUrlParams({ artifact: null });
            notify(`Deleted artifact "${artifact.title}".`);
        } catch (err) {
            notify(err.message || 'Could not delete artifact.', 'error');
        }
    };

    const quickApprove = async (item, action, feedback = '') => {
        try {
            const res = await storeApi.transitionResult(item.storeId, item.id, { action, ...(feedback ? { feedback } : {}) }, apiCtx);
            setServerResults((prev) => prev.map((r) => (r.id === res.result.id ? res.result : r)));
            setReviewFeedback({ id: null, action: null, note: '' });
            notify(action === 'approve' ? `Published "${item.title}".` : `Updated "${item.title}" (${res.result.status}).`);
        } catch (err) {
            notify(err.message || 'Review action failed.', 'error');
        }
    };

    const toggleArtifactCurated = async (artifact) => {
        try {
            const nextCurated = !artifact.curated;
            const res = await storeApi.saveArtifact(
                artifact.storeId,
                {
                    slug: artifact.slug,
                    title: artifact.title,
                    description: artifact.description,
                    kind: artifact.kind,
                    resultIds: artifact.resultIds,
                    blocks: artifact.blocks,
                    html: artifact.html,
                    curated: nextCurated,
                    domain: artifact.domain,
                    tags: artifact.tags,
                    generatedBy: artifact.generatedBy,
                },
                apiCtx
            );
            const updated = res.artifact;
            setArtifacts((prev) => prev.map((a) => (a.storeId === updated.storeId && a.slug === updated.slug ? updated : a)));
            setScreen((prev) => (prev?.type === 'artifact' ? { ...prev, artifact: updated } : prev));
            notify(nextCurated ? `Pinned "${updated.title}" as a curated well-lit path.` : `Unpinned "${updated.title}".`);
        } catch (err) {
            notify(err.message || 'Could not update well-lit path pin.', 'error');
        }
    };

    const promoteBaseline = async (candidate, oldBaseline) => {
        try {
            const res = await storeApi.patchResult(
                candidate.storeId,
                candidate.id,
                {
                    lineage: {
                        ...candidate.lineage,
                        supersedes: oldBaseline.id,
                        baselineId: oldBaseline.id,
                        baselineStoreId: oldBaseline.storeId,
                    },
                },
                apiCtx
            );
            setServerResults((prev) => prev.map((r) => (r.id === res.result.id ? res.result : r)));
            notify(`Promoted "${candidate.title}" as the new baseline.`);
            return res.result;
        } catch (err) {
            notify(err.message || 'Could not promote baseline.', 'error');
            return null;
        }
    };

    const syncCompareUrl = useCallback((ids, baseId) => {
        setUrlParams({ compare: ids?.length ? ids.join(',') : null, baseline: baseId || null, result: null, artifact: null });
    }, []);

    const tabs = [
        { value: 'explore', label: 'Explore', count: filteredResults.length || null },
        { value: 'artifacts', label: 'Artifacts', count: visibleArtifacts.length || null },
        ...(canApproveAny || reviewItems.length > 0 ? [{ value: 'review', label: 'Review queue', count: reviewItems.length || null }] : []),
    ];
    const activeTab = tabs.some((t) => t.value === tab) ? tab : 'explore';

    const selectedResults = useMemo(() => [...selectedIds].map((id) => resultsById.get(id)).filter(Boolean), [selectedIds, resultsById]);

    const storeCounts = useMemo(() => {
        const map = new Map();
        allResults.forEach((r) => map.set(r.storeId, (map.get(r.storeId) || 0) + 1));
        return map;
    }, [allResults]);

    const writableStores = useMemo(() => stores.filter((s) => s.capabilities?.canWrite), [stores]);

    let body;
    if (screen?.type === 'result') {
        const current = resultsById.get(screen.id);
        body = (
            <ResultDetailView
                result={current}
                store={current ? storesById.get(current.storeId) : null}
                writableStores={writableStores}
                allResults={allResults}
                apiCtx={apiCtx}
                onBack={() => {
                    setScreen(null);
                    setUrlParams({ result: null });
                }}
                onCompare={(list, baseId) => openCompare(list, baseId)}
                onOpenResult={(r) => {
                    setUrlParams({ result: r.id, compare: null, baseline: null });
                    setScreen({ type: 'result', id: r.id, storeId: r.storeId });
                }}
                onBuildArtifact={(list) => setArtifactBuilder({ results: list, baselineId: list[1]?.id || null })}
                onStatusChanged={(updated) => {
                    setServerResults((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
                }}
                onSavedToStore={(saved) => {
                    setServerResults((prev) => [saved, ...prev]);
                    setUrlParams({ result: saved.id, store: saved.storeId });
                    setScreen({ type: 'result', id: saved.id, storeId: saved.storeId });
                }}
                onTrackRegressions={(r) => onNavigate?.('regressions-analysis', { model: r.model || undefined, hardware: r.fleet?.accelerator || r.hardware || undefined })}
                notify={notify}
            />
        );
    } else if (screen?.type === 'compare') {
        body = (
            <UnifiedCompareView
                initialResults={screen.results}
                initialBaselineId={screen.baselineId}
                allResults={allResults}
                storesById={storesById}
                onBack={() => {
                    setScreen(null);
                    setUrlParams({ compare: null, baseline: null });
                }}
                onOpenResult={(r) => {
                    setUrlParams({ result: r.id, compare: null, baseline: null });
                    setScreen({ type: 'result', id: r.id, storeId: r.storeId });
                }}
                onBuildArtifact={(list, baseId) => setArtifactBuilder({ results: list, baselineId: baseId })}
                onPromoteBaseline={promoteBaseline}
                onCompareUrlSync={syncCompareUrl}
            />
        );
    } else if (screen?.type === 'artifact') {
        const stCaps = storesById.get(screen.artifact.storeId)?.capabilities;
        const canWrite = Boolean(stCaps?.canWrite);
        const canApprove = Boolean(stCaps?.canApprove);
        body = (
            <ArtifactViewer
                artifact={screen.artifact}
                results={screen.results}
                storesById={storesById}
                onBack={() => {
                    setScreen(null);
                    setUrlParams({ artifact: null });
                }}
                onOpenResult={(r) => {
                    setUrlParams({ result: r.id, artifact: null });
                    setScreen({ type: 'result', id: r.id, storeId: r.storeId });
                }}
                onEdit={canWrite ? (art) => setArtifactBuilder({ artifact: art, results: screen.results, baselineId: null }) : null}
                onToggleCurated={canApprove ? toggleArtifactCurated : null}
                onDelete={canWrite ? deleteArtifact : null}
            />
        );
    } else if (activeTab === 'artifacts') {
        body = (
            <ArtifactsTab
                artifacts={visibleArtifacts}
                storesById={storesById}
                onOpenArtifact={openArtifact}
                onNewArtifact={() => setArtifactBuilder({ results: [], baselineId: null })}
                canWrite={canWriteAny}
            />
        );
    } else if (activeTab === 'review') {
        body = (
            <Panel
                variant="editorial"
                padding="none"
                title="Review queue"
                subtitle="Submissions awaiting approval across stores where you are an approver."
            >
                {!reviewItems.length ? (
                    <div className="p-8">
                        <EmptyState title="Nothing waiting for review" description="All submissions in your approval-gated stores are up to date." />
                    </div>
                ) : (
                    <ul className="divide-y divide-zinc-100">
                        {reviewItems.map((item) => {
                            const pm = primaryMetricOf(item);
                            const st = storesById.get(item.storeId);
                            const askingNote = reviewFeedback.id === item.id;
                            const topMatch = rankLocalBaselines(item, allResults.filter((r) => r.status === 'published'), 1)[0] || null;
                            const topDelta = topMatch ? computeResultDeltas(topMatch.result, item)[0] : null;
                            return (
                                <li key={item.id} className="space-y-3 px-5 py-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setScreen({ type: 'result', id: item.id, storeId: item.storeId })}
                                                    className="text-left text-sm font-semibold text-zinc-900 hover:text-accent-700 hover:underline"
                                                >
                                                    {item.title}
                                                </button>
                                                <Badge size="xs" tone={st?.brand === 'llm-d' ? 'brand' : 'neutral'}>
                                                    {st?.name || item.storeId}
                                                </Badge>
                                                <Badge size="xs">{domainLabelOf(item.domain)}</Badge>
                                            </div>
                                            <p className="mt-0.5 text-micro text-zinc-500">
                                                Submitted by {item.author}
                                                {fleetLabelOf(item) ? ` · ${fleetLabelOf(item)}` : ''}
                                                {pm ? ` · ${pm.label || pm.name}: ${formatMetricValue(pm.value, pm.unit)}` : ''}
                                            </p>
                                            {topMatch && (
                                                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/70 px-3 py-1.5 text-tiny text-zinc-700">
                                                    <span className="font-semibold text-zinc-900">vs. {topMatch.result.title}:</span>
                                                    {topDelta && (
                                                        <span
                                                            className={cn(
                                                                'font-mono font-semibold',
                                                                topDelta.verdict === 'better' ? 'text-emerald-700' : topDelta.verdict === 'worse' ? 'text-red-700' : 'text-zinc-600'
                                                            )}
                                                        >
                                                            {topDelta.label} {signedPct(topDelta.deltaPct)} ({topDelta.verdict})
                                                        </span>
                                                    )}
                                                    <span className="text-zinc-500">· {topMatch.summary}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openCompare([item, topMatch.result], topMatch.result.id)}
                                                        className="ml-auto font-semibold text-accent-700 hover:underline"
                                                    >
                                                        Side-by-side →
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button size="xs" variant="ghost" onClick={() => setScreen({ type: 'result', id: item.id, storeId: item.storeId })}>
                                                Inspect
                                            </Button>
                                            <Button
                                                size="xs"
                                                variant="secondary"
                                                onClick={() => setReviewFeedback({ id: item.id, action: 'request_changes', note: '' })}
                                            >
                                                Request changes
                                            </Button>
                                            <Button size="xs" onClick={() => quickApprove(item, 'approve')}>
                                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                                Approve
                                            </Button>
                                        </div>
                                    </div>
                                    {askingNote && (
                                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                                            <Input
                                                surface="light"
                                                value={reviewFeedback.note}
                                                onChange={(e) => setReviewFeedback((f) => ({ ...f, note: e.target.value }))}
                                                placeholder="Explain what needs to change so the contributor can fix it…"
                                                className="min-w-[220px] flex-1"
                                            />
                                            <Button
                                                size="xs"
                                                disabled={!reviewFeedback.note.trim()}
                                                onClick={() => quickApprove(item, reviewFeedback.action, reviewFeedback.note.trim())}
                                            >
                                                Send feedback
                                            </Button>
                                            <Button size="xs" variant="ghost" onClick={() => setReviewFeedback({ id: null, action: null, note: '' })}>
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Panel>
        );
    } else {
        body = (
            <div className="space-y-5">
                {/* Compact filter bar */}
                <div className="flex flex-wrap items-center gap-2.5" role="search" aria-label="Search results">
                    <Input
                        surface="light"
                        type="search"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setUrlParams({ q: e.target.value });
                        }}
                        placeholder="Search models, storage, protocols, fleet topology, variables…"
                        className="min-w-[240px] flex-1"
                    />
                    <Select
                        surface="light"
                        aria-label="Filter by stack layer"
                        value={domainFilter}
                        onChange={(e) => {
                            setDomainFilter(e.target.value);
                            setUrlParams({ domain: e.target.value });
                        }}
                        className="w-44"
                    >
                        <option value="all">All layers</option>
                        {RESULT_DOMAINS.map((d) => (
                            <option key={d.value} value={d.value}>
                                {d.label}
                            </option>
                        ))}
                    </Select>
                    <Select
                        surface="light"
                        aria-label="Filter by scale"
                        value={scaleFilter}
                        onChange={(e) => {
                            setScaleFilter(e.target.value);
                            setUrlParams({ scale: e.target.value });
                        }}
                        className="w-40"
                    >
                        {SCALE_FILTERS.map((s) => (
                            <option key={s.value} value={s.value}>
                                {s.label}
                            </option>
                        ))}
                    </Select>
                    {hasNonPublished && (
                        <Select surface="light" aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-36">
                            <option value="all">All statuses</option>
                            <option value="published">Published</option>
                            <option value="in_review">In review</option>
                            <option value="draft">Drafts</option>
                        </Select>
                    )}
                    <Select surface="light" aria-label="Sort results" value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="w-36">
                        <option value="newest">Newest</option>
                        <option value="nodes">Largest fleet</option>
                        <option value="metric">Top metric</option>
                    </Select>
                    {(auth.isAuthenticated || (DEV && devRole !== 'signedout')) && (
                        <Button size="sm" variant={mineOnly ? 'primary' : 'secondary'} aria-pressed={mineOnly} onClick={() => setMineOnly((m) => !m)}>
                            Mine
                        </Button>
                    )}
                </div>

                {/* Quiet summary & regression pointer */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
                    <span>
                        Showing <strong className="font-semibold text-zinc-900">{Math.min(visibleLimit, filteredResults.length)}</strong> of{' '}
                        <strong className="font-semibold text-zinc-900">{filteredResults.length}</strong> results
                        {catalogLoading ? ' (loading catalog sweeps…)' : ''}
                    </span>
                    <button
                        type="button"
                        onClick={() => onNavigate?.('regressions-analysis')}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-accent-700"
                    >
                        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                        Nightly regression tracking lives in Regressions →
                    </button>
                </div>

                {storeError && (
                    <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                        {storeError}
                    </div>
                )}

                {loadingStores && !allResults.length ? (
                    <LoadingState size="md" label="Loading stores…" />
                ) : !filteredResults.length ? (
                    <EmptyState
                        icon={Layers}
                        title="No matching results"
                        description="Drop in a serving sweep, storage benchmark, or protocol experiment via UI or the agent API."
                        action={
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button size="sm" onClick={() => setIngestDialog({ open: true, mode: 'form' })}>
                                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                    Add result
                                </Button>
                                {(query || domainFilter !== 'all' || scaleFilter !== 'all' || statusFilter !== 'all' || mineOnly) && (
                                    <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => {
                                            setQuery('');
                                            setDomainFilter('all');
                                            setScaleFilter('all');
                                            setStatusFilter('all');
                                            setMineOnly(false);
                                            setUrlParams({ q: null, domain: null, scale: null });
                                        }}
                                    >
                                        Clear filters
                                    </Button>
                                )}
                            </div>
                        }
                    />
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <ul className="divide-y divide-zinc-100">
                            {filteredResults.slice(0, visibleLimit).map((r) => {
                                const selected = selectedIds.has(r.id);
                                const pm = primaryMetricOf(r);
                                const fleetLabel = fleetLabelOf(r);
                                const isFleet = scaleTierOf(r) === 'fleet';
                                const st = storesById.get(r.storeId);
                                return (
                                    <li key={r.id} className={cn('px-4 py-3.5 transition-colors hover:bg-zinc-50/70', selected && 'bg-accent-50/40')}>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <Checkbox surface="light" checked={selected} onChange={() => toggleSelect(r.id)} aria-label={`Select ${r.title}`} />
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setUrlParams({ result: r.id });
                                                            setScreen({ type: 'result', id: r.id, storeId: r.storeId });
                                                        }}
                                                        className="min-w-0 truncate text-left text-sm font-semibold text-zinc-900 hover:text-accent-700 hover:underline"
                                                    >
                                                        {r.title}
                                                    </button>
                                                    {stores.length > 1 && (
                                                        <Badge size="xs" tone={st?.brand === 'llm-d' ? 'brand' : 'neutral'}>
                                                            {st?.name || r.storeId}
                                                        </Badge>
                                                    )}
                                                    <Badge size="xs">{domainLabelOf(r.domain)}</Badge>
                                                    {isFleet && (
                                                        <Badge size="xs" tone="brand">
                                                            <Server className="h-3 w-3" aria-hidden="true" />
                                                            {r.fleet.nodes} nodes
                                                        </Badge>
                                                    )}
                                                    {r.status !== 'published' && <StatusChip status={r.status} size="xs" />}
                                                </div>
                                                <p className="mt-0.5 truncate text-micro text-zinc-500">
                                                    {[fleetLabel, r.workload, r.lineage?.experimentGroup && `exp: ${r.lineage.experimentGroup}`, r.author && r.author !== 'catalog' && `by ${r.author}`]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {pm && (
                                                    <div className="hidden text-right md:block">
                                                        <div className="font-mono text-xs font-semibold tabular-nums text-zinc-900">
                                                            {formatMetricValue(pm.value, pm.unit)}
                                                        </div>
                                                        <div className="text-tiny text-zinc-500">{pm.at || pm.label || pm.name}</div>
                                                    </div>
                                                )}
                                                <Button size="xs" variant="ghost" onClick={() => openQuickCompare(r)}>
                                                    <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                                                    Compare
                                                </Button>
                                            </div>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                        {filteredResults.length > visibleLimit && (
                            <div className="border-t border-zinc-100 bg-zinc-50/50 px-4 py-3 text-center">
                                <Button size="xs" variant="secondary" onClick={() => setVisibleLimit((n) => n + 40)}>
                                    Show more ({filteredResults.length - visibleLimit} remaining)
                                </Button>
                            </div>
                        )}
                    </div>
                )}

                {/* Sticky bulk compare & artifact toolbar */}
                {selectedResults.length > 0 && (
                    <div
                        role="toolbar"
                        aria-label="Selection actions"
                        className="sticky bottom-4 z-30 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-full border border-zinc-200 bg-zinc-900 px-5 py-2.5 text-xs text-white shadow-xl"
                    >
                        <span className="font-medium">
                            {selectedResults.length} selected
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="xs" variant="secondary" onClick={() => openCompare(selectedResults)}>
                                <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                                Compare before / after
                            </Button>
                            <Button size="xs" variant="secondary" onClick={() => setArtifactBuilder({ results: selectedResults, baselineId: selectedResults[1]?.id || null })}>
                                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                                Publish as Artifact
                            </Button>
                            <button
                                type="button"
                                onClick={() => setSelectedIds(new Set())}
                                className="rounded-full px-2 py-1 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="surface-light relative flex min-h-full flex-col bg-white font-sans text-zinc-900 antialiased">
            <PageHeader
                kicker={branding.showLlmdBrand ? 'Community benchmark store' : 'Prism'}
                title={branding.title}
                subtitle={branding.subtitle}
                onNavigateBack={onNavigateBack}
                badge={
                    branding.showLlmdBrand ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-2.5 py-0.5 text-tiny font-semibold text-accent-800">
                            <img src="/llm-d-logotype-and-icon.png" alt="llm-d" className="h-3.5 object-contain" />
                        </span>
                    ) : branding.storeBadge ? (
                        <Badge size="xs">{branding.storeBadge}</Badge>
                    ) : null
                }
                actions={
                    <>
                        <AccountMenu auth={auth} />
                        <Button size="sm" variant="ghost" onClick={() => setGlossaryOpen(true)}>
                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            Glossary
                        </Button>
                        <Button size="sm" onClick={() => setIngestDialog({ open: true, mode: 'form' })}>
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            Add result
                        </Button>
                    </>
                }
            />

            <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
                {/* Flat permission-governed store selector — hidden when only 1 store is configured. */}
                {stores.length > 1 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Available result stores">
                        <button
                            type="button"
                            onClick={() => {
                                setActiveStoreId('all');
                                setUrlParams({ store: null });
                            }}
                            aria-pressed={activeStoreId === 'all'}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
                                activeStoreId === 'all'
                                    ? 'border-zinc-900 bg-zinc-900 text-white'
                                    : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                            )}
                        >
                            <span>All stores</span>
                            <span className={cn('rounded-full px-1.5 py-0.5 font-mono text-tiny tabular-nums', activeStoreId === 'all' ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-600')}>
                                {allResults.length}
                            </span>
                        </button>
                        {stores.map((s) => (
                            <StoreChip
                                key={s.id}
                                store={s}
                                active={activeStoreId === s.id}
                                count={storeCounts.get(s.id) || 0}
                                onClick={() => {
                                    setActiveStoreId(s.id);
                                    setUrlParams({ store: s.id });
                                }}
                            />
                        ))}
                    </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 shadow-[inset_0_-1px_0_0_var(--color-zinc-200)]">
                    <Tabs
                        tabs={tabs}
                        value={activeTab}
                        onChange={(nextTab) => {
                            setTab(nextTab);
                            setScreen(null);
                            setUrlParams({ tab: nextTab === 'explore' ? null : nextTab, result: null, artifact: null });
                        }}
                        ariaLabel="Result store sections"
                        idBase={tabsId}
                        className="shadow-none"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button size="xs" variant="ghost" onClick={() => setIngestDialog({ open: true, mode: 'agent' })}>
                            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Agent API
                        </Button>
                        {DEV && (
                            <DevPreviewBar
                                storeProfile={devStoreProfile}
                                onStoreProfile={(v) => {
                                    setDevStoreProfile(v);
                                    setUrlParams({ stores: v });
                                    setScreen(null);
                                }}
                                devRole={devRole}
                                onDevRole={(v) => {
                                    setDevRole(v);
                                    setUrlParams({ role: v });
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>

            <TabPanel idBase={tabsId} value={activeTab} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
                {body}
            </TabPanel>

            <IngestDialog
                isOpen={ingestDialog.open}
                initialMode={ingestDialog.mode}
                onClose={() => setIngestDialog((d) => ({ ...d, open: false }))}
                stores={stores}
                defaultStoreId={activeStoreId !== 'all' ? activeStoreId : null}
                existingResults={allResults}
                actor={actor}
                apiCtx={apiCtx}
                onCreated={(created, store) => {
                    setServerResults((prev) => [created, ...prev]);
                    setScreen({ type: 'result', id: created.id, storeId: created.storeId });
                    setUrlParams({ result: created.id, store: created.storeId });
                    notify(
                        created.status === 'in_review'
                            ? `Submitted "${created.title}" to ${store.name} for review.`
                            : `Saved "${created.title}" in ${store.name}.`
                    );
                }}
            />

            {artifactBuilder && (
                <ArtifactBuilderDialog
                    isOpen
                    onClose={() => setArtifactBuilder(null)}
                    stores={stores}
                    defaultStoreId={activeStoreId !== 'all' ? activeStoreId : null}
                    initialArtifact={artifactBuilder.artifact || null}
                    initialResults={artifactBuilder.results || []}
                    initialBaselineId={artifactBuilder.baselineId}
                    allResults={allResults}
                    apiCtx={apiCtx}
                    onSaved={(created) => {
                        setArtifacts((prev) => [created, ...prev.filter((a) => !(a.storeId === created.storeId && a.slug === created.slug))]);
                        setTab('artifacts');
                        openArtifact(created);
                        notify(`Published artifact "${created.title}".`);
                    }}
                />
            )}

            <GlossaryDialog isOpen={glossaryOpen} onClose={() => setGlossaryOpen(false)} />

            <div className="fixed right-4 top-20 z-[100] flex flex-col gap-2" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className="flex max-w-sm items-start gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg">
                        <span
                            aria-hidden="true"
                            className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', t.type === 'error' ? 'bg-red-400' : t.type === 'success' ? 'bg-emerald-400' : 'bg-sky-400')}
                        />
                        <span className="flex-1">{t.message}</span>
                        <button type="button" onClick={() => removeToast?.(t.id)} aria-label="Dismiss" className="rounded-full p-0.5 text-white/70 hover:bg-white/10 hover:text-white">
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
