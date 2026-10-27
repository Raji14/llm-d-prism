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

// Results store: find, curate and publish benchmark results.
//
// Nouns in the UI: Runs (measured, read-only), Sweeps (runs of one setup
// across concurrency levels), Results (curated views over runs; "curves" in
// code) and Watches & reports. Three tabs: Browse, My work, Watches & reports,
// plus a Review queue for reviewers on the public store and Sources for
// admins. The instance mode (see ResultsStore/instance.js) decides whether
// publishing marks a result Official (internal) or submits it for review.
// Sweeps and runs publish in one step; the result is created behind the scenes.

import React, { Suspense, lazy, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronDown, CircleAlert, Github, LogOut, Shield, Upload, X } from 'lucide-react';
import { Badge, Button, Input, LoadingState, Modal, PageHeader, Spinner, TabPanel, Tabs, ToggleGroup } from './ui';
import { cn } from '../utils/cn';
import { useGitHubAuth } from '../hooks/useGitHubAuth.js';
import { decodeShareLink } from '../utils/shareLinkEncoder';
import { parseReportV02, stageToEntry } from '../utils/benchmarkReportV02Parser';
import { buildStagedBundle, queueBundlesForWizard } from '../utils/stagedBundle';
import { BROWSER_NOTE, INSTANCE_COPY, readInstanceMode, resultStatusLabel } from './ResultsStore/instance';
import {
    LATENCY_METRICS,
    LATENCY_STATS,
    THROUGHPUT_METRICS,
    autoCurveName,
    buildRows,
    buildRuns,
    concRange,
    curveChecks,
    curveConfig,
    curveConfigKey,
    curveDraftFromRuns,
    fmtDay,
    handleOf,
    isPublishedState,
    loadOrder,
    runKeyOf,
    runsConfig,
} from './ResultsStore/catalog';
import { WorkspaceProvider } from './ResultsStore/WorkspaceProvider';
import { useWorkspace } from './ResultsStore/workspaceContext';
import { BrowseTab } from './ResultsStore/BrowseTab';
import { RunDetail } from './ResultsStore/RunDetail';
import { CompareView } from './ResultsStore/CompareView';
import { CurveEditor } from './ResultsStore/CurveEditor';
import { MyWorkTab } from './ResultsStore/MyWorkTab';
import { AddToDashboardDialog, DashboardsTab, NewWatchDialog } from './ResultsStore/DashboardsTab';
import { ReviewQueueTab } from './ResultsStore/ReviewQueueTab';
import { SourcesTab } from './ResultsStore/SourcesTab';
import { plainSyncError } from './ResultsStore/sourceHealth';
import { PublishDialog } from './ResultsStore/PublishDialog';
import { GlossaryDialog } from './ResultsStore/Glossary';
import { CopyButton, Notice } from './ResultsStore/parts';

const ClassicResultsStore = lazy(() => import('./ResultsStore/ClassicResultsStore'));

const TABS = ['browse', 'mywork', 'dashboards', 'review', 'sources'];
const DEV = import.meta.env.DEV;
const PREVIEW_ROLES = ['admin', 'contributor'];
// What Back buttons call the place they return to.
const TAB_NAMES = { browse: 'Browse', mywork: 'My work', dashboards: 'Watches & reports', review: 'Review queue', sources: 'Sources' };
const SCREEN_NAMES = { run: 'the run', compare: 'the comparison', curve: 'the result' };

const readParam = (name) => {
    try {
        return new URLSearchParams(window.location.search).get(name);
    } catch {
        return null;
    }
};

const uniqueRuns = (list = []) => [...new Map(list.filter(Boolean).map((r) => [r.key, r])).values()];

// Compare/share links carry their items in the URL as base64url JSON:
// { v: 2, i: [[type, value, ref?], …], m: [latency, throughput, stat?] }, where
//   u = one run (key) · s = a fixed set of runs (keys) · c = a result (id)
//   r = a Browse row (key; only in links made before v2).
// Sweeps travel as `s` with their exact runs, so a link doesn't drift to the
// next nightly batch. ref = 1 marks an added baseline (drawn dashed). Results are
// saved in one browser for now, so `c` only opens there; the share dialog
// warns and offers the source runs instead. v1 links were a bare array, and
// links without a statistic open on the default one.
const toB64url = (text) => {
    let bin = '';
    new TextEncoder().encode(text).forEach((b) => {
        bin += String.fromCharCode(b);
    });
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)));

// A fixed set of runs: a sweep pinned to one batch, or a result's source runs.
const runsItem = (keys) => ({ type: 'runs', keys, key: keys.join('+') });

const encodeShare = (list, view) => toB64url(JSON.stringify(view ? { v: 2, i: list, m: [view.latency, view.throughput, view.stat || null] } : { v: 2, i: list }));

const decodeShare = (s) => {
    try {
        const json = JSON.parse(fromB64url(s));
        const list = Array.isArray(json) ? json : Array.isArray(json?.i) ? json.i : [];
        const items = list
            .map((entry) => {
                const [t, v, ref] = Array.isArray(entry) ? entry : [];
                let item = null;
                if (t === 'c' && typeof v === 'string') item = { type: 'curve', id: v };
                else if (t === 's' && Array.isArray(v) && v.length && v.every((k) => typeof k === 'string')) item = runsItem(v);
                else if ((t === 'u' || t === 'r') && typeof v === 'string') item = { type: t === 'u' ? 'run' : 'row', key: v };
                return item && ref ? { ...item, baseline: true } : item;
            })
            .filter(Boolean);
        const [latency, throughput, stat] = Array.isArray(json?.m) ? json.m : [];
        const view = {
            latency: LATENCY_METRICS.some((m) => m.value === latency) ? latency : null,
            throughput: THROUGHPUT_METRICS.some((m) => m.value === throughput) ? throughput : null,
            stat: LATENCY_STATS.some((m) => m.value === stat) ? stat : null,
        };
        return { items, view: view.latency || view.throughput || view.stat ? view : null };
    } catch {
        return { items: [], view: null };
    }
};

function initialStack() {
    const run = readParam('run');
    const curve = readParam('curve');
    const compare = readParam('compare');
    if (curve) return [{ type: 'curve', id: curve }];
    if (run) return [{ type: 'run', key: run }];
    if (compare) {
        const { items, view } = decodeShare(compare);
        if (items.length) return [{ type: 'compare', items, view }];
    }
    return [];
}

function initialTab() {
    const fromUrl = readParam('tab');
    if (TABS.includes(fromUrl)) return fromUrl;
    try {
        // The upload wizard leaves these flags when it hands back to the store.
        if (
            localStorage.getItem('prism_show_post_upload_dialog') ||
            localStorage.getItem('prism_activate_staged_filter') === 'true' ||
            localStorage.getItem('prism_activate_my_submissions_filter') === 'true' ||
            readParam('own') === 'true'
        ) {
            return 'mywork';
        }
    } catch {
        // Storage unavailable.
    }
    return 'browse';
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
                Sign in with GitHub
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
                        {user?.permission === 'none' ? (
                            <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-tiny text-amber-800">
                                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                You’re not in the Results store beta yet.
                            </p>
                        ) : (
                            <p className="mt-1 flex items-center gap-1.5 text-tiny text-zinc-500">
                                <Shield className="h-3 w-3 text-accent-600" aria-hidden="true" />
                                Role: {user?.permission}
                            </p>
                        )}
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

// Says what the link carries, and warns before sending anything nobody else
// can open: results (saved in this browser for now) and runs uploaded here.
function ShareDialog({ target, url, curve, curves = [], localRuns = 0, copy, onClose, onShareRunsInstead }) {
    const kind = target?.kind;
    const one = curves.length === 1;
    const sourceRuns = new Set(curves.flatMap((c) => c.builtFrom.runKeys || [])).size;
    const excludes = curves.some((c) => c.points.some((p) => !p.included));
    const subtitle =
        kind === 'run'
            ? localRuns
                ? 'This run was uploaded only to this browser, so nobody else can open the link.'
                : 'Anyone who can open the Results store can open this run.'
            : kind === 'compare'
              ? 'The link opens the same runs, metric and baselines.'
              : 'Results are saved in this browser for now, so this link only opens here.';
    return (
        <Modal
            isOpen={!!target}
            onClose={onClose}
            size="md"
            title={kind === 'compare' ? 'Share this view' : `Share ${kind === 'run' ? 'run' : 'result'}`}
            subtitle={subtitle}
            footer={
                <Button size="sm" variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            <div className="surface-light space-y-4 text-sm text-zinc-700">
                <div className="flex gap-2">
                    <Input surface="light" readOnly value={url} onFocus={(e) => e.target.select()} className="font-mono text-xs" aria-label="Share link" />
                    <CopyButton text={url} size="sm" />
                </div>
                {curves.length > 0 && sourceRuns > 0 && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
                        <p className="font-semibold">
                            {kind === 'curve' ? 'Nobody else can open this link yet.' : `${one ? '1 result' : `${curves.length} results`} in this view won’t open for anyone else.`}
                        </p>
                        <p className="mt-1">
                            Share {one ? 'its' : 'their'} {sourceRuns} source run{sourceRuns === 1 ? '' : 's'} instead and the link works for everyone
                            {excludes ? `, though it shows every point, including the ones ${one ? 'the result excludes' : 'the results exclude'}` : ''}.
                        </p>
                        <Button size="xs" variant="secondary" className="mt-3" onClick={onShareRunsInstead}>
                            Share source runs instead
                        </Button>
                    </div>
                )}
                {kind !== 'run' && localRuns > 0 && (
                    <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                        {localRuns} run{localRuns === 1 ? ' was' : 's were'} uploaded only to this browser, so {localRuns === 1 ? 'it' : 'they'} won’t open for anyone else.
                    </p>
                )}
                {curve && (
                    <div className="rounded-2xl bg-zinc-50 p-4 text-xs leading-relaxed">
                        <div className="label-caps mb-1 text-zinc-500">Opens with provenance</div>
                        {curve.status === copy.publishedStatus
                            ? `${resultStatusLabel(curve.status, copy)} · marked by ${curve.markedBy || curve.owner} on ${fmtDay(curve.markedAt)}`
                            : curve.status === 'in_review'
                              ? resultStatusLabel('in_review', copy)
                              : 'Draft'}{' '}
                        · {curve.meta.harness} · {curve.builtFrom.runs} source run{curve.builtFrom.runs === 1 ? '' : 's'} · {curve.meta.source}
                    </div>
                )}
            </div>
        </Modal>
    );
}

// Dev server only. Role overrides your real role either way, so a signed-in
// admin can check the contributor view too; picking your real role clears it.
function PreviewBar({ instance, onInstance, isAdmin, signedInAdmin, onPreviewRole }) {
    return (
        <div className="my-1.5 flex flex-wrap items-center gap-2.5 rounded-full border border-dashed border-zinc-300 bg-zinc-50/70 px-3 py-1 text-micro text-zinc-600">
            <span className="label-caps text-zinc-500">Preview · dev only</span>
            <span className="flex items-center gap-1.5">
                Instance
                <ToggleGroup
                    size="xs"
                    aria-label="Preview instance"
                    value={instance}
                    onChange={onInstance}
                    options={[
                        { value: 'internal', label: 'Internal' },
                        { value: 'public', label: 'Public' },
                    ]}
                />
            </span>
            <span className="flex items-center gap-1.5">
                Role
                <ToggleGroup
                    size="xs"
                    aria-label="Preview role"
                    value={isAdmin ? 'admin' : 'contributor'}
                    onChange={(v) => onPreviewRole(v === (signedInAdmin ? 'admin' : 'contributor') ? null : v)}
                    options={[
                        { value: 'contributor', label: 'Contributor' },
                        { value: 'admin', label: instance === 'internal' ? 'Admin / approver' : 'Admin / reviewer' },
                    ]}
                />
                {signedInAdmin && !isAdmin && <span className="text-zinc-500">You’re signed in as an admin</span>}
            </span>
        </div>
    );
}

function ResultsStoreView({ onNavigate, onNavigateBack, dashboardState, dashboardData, auth, instance, onInstance, previewRole, onPreviewRole, onOpenClassic }) {
    const ws = useWorkspace();
    const copy = INSTANCE_COPY[instance];
    const { user, isAuthenticated, login, isConfigured } = auth;
    const {
        data = [],
        selectedSources,
        hiddenSources,
        gcsProfiles,
        submissions = [],
        submissionsMap = {},
        updateSubmissionStatus,
        brv02Runs = [],
        loadAllData,
        addToast,
        toasts = [],
        removeToast,
        injectDynamicEntries,
        loading,
    } = dashboardData;
    const { setSelectedBenchmarks } = dashboardState;

    const signedInAdmin = user?.permission === 'admin';
    // On the dev server the preview bar can override the real role either way.
    const isAdmin = DEV && previewRole ? previewRole === 'admin' : signedInAdmin;
    const isReviewer = instance === 'public' && isAdmin;
    // Internal instance: only approvers mark a result official, and only when
    // signed in, so Prism records who did it. Approvers are admins: llm-d org
    // admins or people on the admin allowlist (specs/main/completed/results-api/iam.md).
    // On the dev server a preview role stands in for a signed-in account.
    // Null when allowed (always on the public store), else why not: 'signin' or 'approver'.
    const signedIn = !!(isAuthenticated && user?.username);
    const previewing = DEV && !!previewRole;
    const officialBlock = instance !== 'internal' ? null : !signedIn && !previewing ? 'signin' : isAdmin ? null : 'approver';

    const [tab, setTab] = useState(initialTab);
    const [stack, setStack] = useState(initialStack);
    const [browse, setBrowse] = useState(() => ({ query: '', filters: {}, sort: 'newest', kind: 'all', selected: new Set(), addTo: null }));
    const [dashActive, setDashActive] = useState(null);
    const [share, setShare] = useState(null);
    const [watchDialog, setWatchDialog] = useState(null);
    const [glossary, setGlossary] = useState(false);
    const [dashDialog, setDashDialog] = useState(null);
    const [quick, setQuick] = useState(null);
    const [queue, setQueue] = useState({ items: [], loading: false, error: null });
    const [syncing, setSyncing] = useState(false);
    const [noticeDismissed, setNoticeDismissed] = useState(() => {
        try {
            return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('prism_results_notice_dismissed') === '1';
        } catch {
            return false;
        }
    });
    const dismissNotice = useCallback(() => {
        setNoticeDismissed(true);
        try {
            sessionStorage.setItem('prism_results_notice_dismissed', '1');
        } catch {
            // sessionStorage unavailable
        }
    }, []);
    // Ties the section tabs to the panel that shows their content.
    const tabsId = useId();
    const screen = stack[stack.length - 1] || null;

    const notify = useCallback((message, type = 'success') => addToast?.(message, type), [addToast]);

    // Which runs belong to the current user (uploaded from this browser or
    // submitted under their GitHub account). On the public store, only your
    // own uploaded runs show in My work's Uploads section or can be submitted
    // for review.
    const ownsRuns = useCallback(
        (list = []) => {
            if (instance === 'internal') return list.length > 0;
            const me = user?.username?.toLowerCase();
            return list.length > 0 && list.every((r) => r && (r.isLocalOnly || (me && r.author && r.author.toLowerCase() === me)));
        },
        [instance, user]
    );
    // Anyone may curate (edit, make sandbox draft results from) catalog runs or
    // sweeps on either instance.
    const canCurate = useCallback((list = []) => list.length > 0, []);
    // Who may publish them in one step: on the internal instance, approvers
    // (see officialBlock); on the public store, only the owner of the uploaded runs.
    const canPublish = useCallback((list = []) => ownsRuns(list) && !officialBlock, [ownsRuns, officialBlock]);

    // ------------------------------------------------------------ catalog
    const aliases = useMemo(
        () => Object.fromEntries((gcsProfiles || []).filter((p) => p.alias).map((p) => [`${p.type}:${p.bucketName}`, p.alias])),
        [gcsProfiles]
    );
    // Runs from sources switched off under Sources → Show in Browse (saved in
    // this browser) are left out. Uploads from this browser always show.
    const visibleData = useMemo(
        () =>
            data.filter((d) => {
                const key = d.source || 'local';
                if (String(key).startsWith('brv02:')) return true;
                return (!selectedSources || selectedSources.has(key)) && !hiddenSources?.has(key);
            }),
        [data, selectedSources, hiddenSources]
    );
    const runs = useMemo(() => buildRuns(visibleData, { aliases, submissionsMap }), [visibleData, aliases, submissionsMap]);
    // The Sources table lists every pipeline, shown or hidden, so a hidden one
    // keeps its switch. Runs are built per source: the same run can sit in two
    // (the Drive archive and its live sync), and building them together would
    // file it under one and drop the other from the table.
    const sourceRuns = useMemo(() => {
        if (tab !== 'sources' || !isAdmin) return [];
        const bySource = new Map();
        data.forEach((d) => {
            const key = String(d.source || 'local');
            if (key.startsWith('brv02:')) return;
            if (!bySource.has(key)) bySource.set(key, []);
            bySource.get(key).push(d);
        });
        return [...bySource.values()].flatMap((list) => buildRuns(list, { aliases, submissionsMap }));
    }, [tab, isAdmin, data, aliases, submissionsMap]);
    // Runs only this source provides, which is exactly what hiding it removes
    // from Browse. A run that also sits in another source (an archive and its
    // live sync) still shows from there, so it doesn't count. Building without
    // each source reuses buildRuns' own cross-source dedupe.
    const uniqueRunCounts = useMemo(() => {
        if (tab !== 'sources' || !isAdmin) return new Map();
        const pipeline = data.filter((d) => !String(d.source || 'local').startsWith('brv02:'));
        const total = buildRuns(pipeline, { aliases, submissionsMap }).length;
        const keys = [...new Set(pipeline.map((d) => String(d.source || 'local')))];
        return new Map(keys.map((key) => [key, total - buildRuns(pipeline.filter((d) => String(d.source || 'local') !== key), { aliases, submissionsMap }).length]));
    }, [tab, isAdmin, data, aliases, submissionsMap]);
    const runsByKey = useMemo(() => new Map(runs.map((r) => [r.key, r])), [runs]);
    const runsById = useMemo(() => new Map(runs.filter((r) => r.runId).map((r) => [r.runId, r])), [runs]);
    const browseRuns = useMemo(() => runs.filter((r) => !r.isUpload || isPublishedState(r.submissionState)), [runs]);
    const allRows = useMemo(() => buildRows(browseRuns), [browseRuns]);
    const rowsByKey = useMemo(() => new Map(allRows.map((r) => [r.key, r])), [allRows]);
    const rowOfRun = useMemo(() => {
        const m = new Map();
        allRows.forEach((row) => row.kind === 'suggested' && row.repeats.forEach((rep) => rep.runs.forEach((r) => m.set(r.key, { ...row, runs: rep.runs, points: rep.runs.map((x) => x.points[0]), ts: rep.ts }))));
        return m;
    }, [allRows]);

    const publishedCurves = useMemo(() => ws.curves.filter((c) => c.status === copy.publishedStatus), [ws.curves, copy.publishedStatus]);
    const curvedRunKeys = useMemo(() => new Set(ws.curves.flatMap((c) => c.builtFrom.runKeys || [])), [ws.curves]);
    const uploads = useMemo(
        () => runs.filter((r) => r.isUpload && [null, 'staged', 'unlisted'].includes(r.submissionState) && !curvedRunKeys.has(r.key) && ownsRuns([r])),
        [runs, curvedRunKeys, ownsRuns]
    );
    const serverItems = useMemo(
        () => submissions.filter((s) => !String(s.id).startsWith('dyn-') && !uploads.some((r) => r.runId === s.runId)),
        [submissions, uploads]
    );

    const actor = ws.actor;
    const mineOf = useCallback(
        (x) => (x.curve ? x.curve.owner === actor : !!(x.author && user?.username && x.author.toLowerCase() === user.username.toLowerCase())),
        [actor, user]
    );

    // A run key is `${source}|${id}`. The same run can sit in two sources (an
    // archive and its copy) and Browse keeps one copy, which can differ from
    // one load to the next, so a key saved in a link or a result may name the
    // copy this browser didn't keep. Fall back to the run's id in that case.
    const runsByIdPart = useMemo(() => {
        const m = new Map();
        runs.forEach((r) => {
            const i = r.key.indexOf('|');
            if (i > 0 && !m.has(r.key.slice(i + 1))) m.set(r.key.slice(i + 1), r);
        });
        return m;
    }, [runs]);
    const runOfKey = useCallback(
        (k) => {
            if (!k) return undefined;
            const exact = runsByKey.get(k);
            if (exact) return exact;
            const i = String(k).indexOf('|');
            return i > 0 ? runsByIdPart.get(String(k).slice(i + 1)) : undefined;
        },
        [runsByKey, runsByIdPart]
    );
    const runsFromKeys = useCallback((keys = []) => keys.map((k) => runOfKey(k)).filter(Boolean), [runOfKey]);

    // Rows go into links as their exact runs, so a shared sweep keeps showing
    // the batch the sender saw (see encodeShare).
    const encodeItems = useCallback(
        (items, view) =>
            encodeShare(
                items.map((i) => {
                    let entry;
                    if (i.type === 'curve') entry = ['c', i.id];
                    else if (i.type === 'runs') entry = ['s', i.keys];
                    else if (i.type === 'run') entry = ['u', i.key];
                    else {
                        const keys = (rowsByKey.get(i.key)?.runs || []).map((r) => r.key);
                        entry = keys.length > 1 ? ['s', keys] : keys.length ? ['u', keys[0]] : ['r', i.key];
                    }
                    return i.baseline ? [...entry, 1] : entry;
                }),
                view
            ),
        [rowsByKey]
    );

    // A series for Compare: name, points and runs, plus `config` (what it
    // measured) for the like-for-like check. Results use their curated labels.
    const resolve = useCallback(
        (item) => {
            if (item.type === 'curve') {
                const c = ws.getCurve(item.id);
                if (!c) return null;
                return {
                    id: c.id,
                    name: c.name,
                    kindLabel: `Result · v${c.version}`,
                    points: c.points.filter((p) => p.included),
                    runs: runsFromKeys(c.builtFrom.runKeys),
                    curve: c,
                    config: curveConfig(c),
                };
            }
            if (item.type === 'runs') {
                const list = runsFromKeys(item.keys);
                if (!list.length) return null;
                const first = list[0];
                const missing = item.keys.length - list.length;
                const points = loadOrder(list.flatMap((r) => r.points)).points;
                return {
                    id: item.key,
                    name: first.title,
                    kindLabel: [list.length > 1 ? `${list.length} runs` : `Run ${first.idLabel}`, fmtDay(Math.max(0, ...list.map((r) => r.ts || 0))), missing ? `${missing} not loaded` : null]
                        .filter(Boolean)
                        .join(' · '),
                    points,
                    runs: list,
                    config: runsConfig(list),
                };
            }
            if (item.type === 'row') {
                const row = rowsByKey.get(item.key);
                if (!row) return null;
                return {
                    id: row.key,
                    name: row.title,
                    kindLabel: row.kind === 'suggested' ? `Sweep · ${row.runs.length} runs · ${fmtDay(row.ts)}` : `Run · ${fmtDay(row.ts)}`,
                    points: row.points,
                    runs: row.runs,
                    config: runsConfig(row.runs),
                };
            }
            const run = runOfKey(item.key);
            if (!run) return null;
            return { id: run.key, name: run.title, kindLabel: `Run ${run.idLabel} · ${fmtDay(run.ts)}`, points: run.points, runs: [run], config: runsConfig([run]) };
        },
        [ws, rowsByKey, runOfKey, runsFromKeys]
    );

    // Everything that can be a baseline, each with what it measured so
    // Compare can list the closest matches first.
    const baselineOptions = useMemo(
        () => [
            ...publishedCurves.map((c) => ({
                id: c.id,
                name: c.name,
                note: `${resultStatusLabel(c.status, copy)} · ${c.markedBy || c.reviewedBy || c.owner} · ${fmtDay(c.markedAt)}`,
                group: `${copy.publishedLabel} results`,
                item: { type: 'curve', id: c.id },
                points: c.points.filter((p) => p.included),
                config: curveConfig(c),
            })),
            ...allRows.map((r) => ({
                id: r.key,
                name: r.title,
                note: [r.kind === 'suggested' ? `Sweep · ${r.runs.length} runs` : `${r.points.length} point${r.points.length === 1 ? '' : 's'}`, r.harness, fmtDay(r.ts)].join(' · '),
                group: 'Runs and sweeps',
                item: { type: 'row', key: r.key },
                points: r.points,
                config: runsConfig(r.runs),
            })),
        ],
        [publishedCurves, allRows, copy]
    );

    const resolveBaseline = useCallback(
        (b) => {
            if (b.ref?.type === 'curve') {
                const c = ws.getCurve(b.ref.id);
                if (c) return c.points.filter((p) => p.included);
            }
            return b.points || [];
        },
        [ws]
    );

    // ------------------------------------------------------------ navigation
    const loadReviewQueue = useCallback(async () => {
        setQueue((q) => ({ ...q, loading: true, error: null }));
        try {
            const headers = {};
            const token = localStorage.getItem('prism_github_token');
            if (token) headers['X-Prism-Github-Token'] = token;
            const res = await fetch('/api/results?status=submitted_pending_review&limit=50', { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            const items = (json.items || []).map((it) => {
                const by = handleOf(it.user) || handleOf(it.github_author);
                return {
                    runId: it.runId,
                    title: `${it.model_name || 'Model not recorded'} · ${it.hardware?.hardware_name || 'Hardware not recorded'}`,
                    by: by ? `@${by}` : 'Unknown contributor',
                    submittedAt: Date.parse(it.submitted_at) || 0,
                    state: it.state,
                };
            });
            setQueue({ items, loading: false, error: null });
        } catch {
            setQueue({ items: [], loading: false, error: 'The review service isn’t reachable right now, so only reviews submitted from this browser are listed.' });
        }
    }, []);

    // Set once the queue has been asked for, by a tab click or on arrival.
    const queueRequested = useRef(false);
    const goTab = useCallback(
        (t) => {
            setTab(t);
            setStack([]);
            if (t === 'review') {
                queueRequested.current = true;
                loadReviewQueue();
            }
        },
        [loadReviewQueue]
    );

    // A link or reload that opens straight onto the Review queue loads it too;
    // before, only clicking the tab did, so the queue looked empty.
    useEffect(() => {
        if (queueRequested.current || tab !== 'review' || !isReviewer) return;
        queueRequested.current = true;
        loadReviewQueue();
    }, [tab, isReviewer, loadReviewQueue]);

    const push = useCallback((next) => setStack((s) => [...s, next]), []);

    // Results made from exactly these runs, any status.
    const resultsOfRuns = useCallback(
        (list = []) => {
            const keys = new Set(list.filter(Boolean).map((r) => r.key));
            if (!keys.size) return [];
            return ws.curves.filter((c) => (c.builtFrom.runKeys || []).length === keys.size && c.builtFrom.runKeys.every((k) => keys.has(k)));
        },
        [ws.curves]
    );
    // The one to reuse for a report: the live Official / Published result
    // first, then one in review, then the newest draft.
    const resultFromRuns = useCallback(
        (list = []) => {
            const rank = (c) => (['official', 'published'].includes(c.status) ? 0 : c.status === 'in_review' ? 1 : ['draft', 'needs_changes'].includes(c.status) ? 2 : null);
            return (
                resultsOfRuns(list)
                    .filter((c) => rank(c) != null)
                    .sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt)[0] || null
            );
        },
        [resultsOfRuns]
    );

    const makeCurve = useCallback(
        (curveRuns) => {
            const unique = uniqueRuns(curveRuns);
            if (!unique.length) {
                notify('Those runs aren’t loaded yet. Try again in a moment.', 'error');
                return;
            }
            setBrowse((b) => ({ ...b, selected: new Set() }));
            // A draft of exactly these runs already exists (say, one a report
            // made): open it rather than start a second one with the same name.
            const draft = resultsOfRuns(unique)
                .filter((c) => ['draft', 'needs_changes'].includes(c.status))
                .sort((a, b) => b.updatedAt - a.updatedAt)[0];
            if (draft) {
                push({ type: 'curve', id: draft.id });
                return;
            }
            const id = ws.createCurve(unique);
            push({ type: 'curve', id });
            notify('Draft saved. Only you can see it.');
        },
        [ws, push, notify, resultsOfRuns]
    );

    const runsFromItems = useCallback(
        (items) =>
            items.flatMap((i) => {
                if (i.type === 'curve') {
                    const c = ws.getCurve(i.id);
                    return c ? runsFromKeys(c.builtFrom.runKeys) : [];
                }
                if (i.type === 'runs') return runsFromKeys(i.keys);
                if (i.type === 'row') return rowsByKey.get(i.key)?.runs || [];
                const run = runOfKey(i.key);
                return run ? [run] : [];
            }),
        [ws, rowsByKey, runOfKey, runsFromKeys]
    );

    const canCurateItems = useCallback((items) => canCurate(runsFromItems(items)), [canCurate, runsFromItems]);

    // The result already published (or in review) from exactly these runs, so
    // a sweep or run is never offered for publishing twice.
    const resultOf = useCallback(
        (list = []) => {
            const keys = new Set(list.filter(Boolean).map((r) => r.key));
            if (!keys.size) return null;
            return (
                ws.curves.find(
                    (c) => ['official', 'published', 'in_review'].includes(c.status) && (c.builtFrom.runKeys || []).length === keys.size && c.builtFrom.runKeys.every((k) => keys.has(k))
                ) || null
            );
        },
        [ws.curves]
    );

    // Where Back goes, named: the screen underneath, else the tab.
    const prevScreen = stack.length > 1 ? stack[stack.length - 2] : null;
    const backLabel = prevScreen ? `Back to ${SCREEN_NAMES[prevScreen.type] || 'the previous screen'}` : `Back to ${TAB_NAMES[tab] || 'Browse'}`;

    const nav = useMemo(
        () => ({
            goTab,
            back: () => setStack((s) => s.slice(0, -1)),
            backLabel,
            openRun: (key) => push({ type: 'run', key }),
            // A comparison uses up the selection that made it, so picks hidden
            // by later filters never slip into the next one.
            openCompare: (items) => {
                setBrowse((b) => (b.selected?.size ? { ...b, selected: new Set() } : b));
                push({ type: 'compare', items });
            },
            openCurve: (id) => push({ type: 'curve', id }),
            makeCurve,
            makeCurveFromItems: (items) => makeCurve(runsFromItems(items)),
            addRunsTo: (id) => {
                setBrowse((b) => ({ ...b, addTo: id, selected: new Set() }));
                setTab('browse');
                setStack([]);
            },
            // One step from a sweep or run to Official / In review. Already
            // published? Open that result instead of making a duplicate. Only
            // approvers mark results official (officialBlock).
            publish: (list) => {
                const unique = uniqueRuns(list);
                const existing = resultOf(unique);
                if (existing) push({ type: 'curve', id: existing.id });
                else if (unique.length && canPublish(unique)) setQuick({ runs: unique });
            },
            // A watch always follows one setup ({ configKey }), or starts from
            // Browse filters and asks which setup ({ filters }).
            watchSetup: (initial) => setWatchDialog(initial),
        }),
        [goTab, push, makeCurve, runsFromItems, resultOf, canPublish, backLabel]
    );

    const addSelectionToCurve = useCallback(
        (items) => {
            const id = browse.addTo;
            const picked = runsFromItems(items);
            ws.addRunsToCurve(id, picked);
            setBrowse((b) => ({ ...b, addTo: null, selected: new Set() }));
            setStack([{ type: 'curve', id }]);
            notify(`Added ${picked.length} run${picked.length === 1 ? '' : 's'} to the result.`);
        },
        [browse.addTo, runsFromItems, ws, notify]
    );

    // A report holds results of any status; ones that aren't Official /
    // Published are marked Unofficial / Unpublished there. Compare's runs and
    // sweeps go in as the result already made from them, or as a new draft.
    // Returns the result ids and how many drafts it made.
    const reportIdsFor = (items = []) => {
        const made = new Map();
        let created = 0;
        const ids = items
            .map((i) => {
                if (i.type === 'curve') return i.id;
                const list = uniqueRuns(runsFromItems([i]));
                if (!list.length) return null;
                const sig = list
                    .map((r) => r.key)
                    .sort()
                    .join('+');
                if (!made.has(sig)) {
                    let id = resultFromRuns(list)?.id;
                    if (!id) {
                        id = ws.createCurve(list);
                        created += 1;
                    }
                    made.set(sig, id);
                }
                return made.get(sig);
            })
            .filter(Boolean);
        return { ids: [...new Set(ids)], created };
    };

    // "Add to a report" for Compare's series or one result. Runs and sweeps
    // wait in `raw` until the dialog actually adds them, so cancelling makes nothing.
    const openReportDialog = (items = []) =>
        setDashDialog({ curveIds: items.filter((i) => i.type === 'curve').map((i) => i.id), raw: items.filter((i) => i.type !== 'curve') });

    // Turns the dialog's runs and sweeps into results once, so adding to a
    // second report reuses the same ones.
    const resolveReportDialog = () => {
        if (!dashDialog?.raw?.length) return { ids: dashDialog?.curveIds || [], created: 0 };
        const { ids, created } = reportIdsFor(dashDialog.raw);
        const all = [...new Set([...dashDialog.curveIds, ...ids])];
        setDashDialog({ curveIds: all, raw: [] });
        return { ids: all, created };
    };
    const draftsNote = (n) => (n ? ` ${n === 1 ? 'A new draft was' : `${n} new drafts were`} saved in My work.` : '');

    // ------------------------------------------------------------ hand-offs
    const onUpload = () => onNavigate('submit-benchmarks', { intent: instance === 'public' ? 'submit-review' : 'stage-locally' });

    // Uploaded runs that live on the server move into the review queue too.
    // Reports how many needed sending and how many the server refused (the
    // hook's own toast says why).
    const sendRunsForReview = async (runIds = []) => {
        const serverIds = runIds.filter((id) => ['unlisted', 'rejected'].includes(submissionsMap[id]?.status));
        let failed = 0;
        for (const id of serverIds) {
            const ok = await updateSubmissionStatus?.(id, 'submitted_pending_review', '', { quiet: true });
            if (ok !== true) failed += 1;
        }
        return { sent: serverIds.length, failed };
    };

    // What reached reviewers, in words. Results themselves can't leave this
    // browser yet; only uploaded runs that live on the server can.
    const reviewOutcome = (serverRunCount, { sent, failed }) => {
        if (failed) {
            return {
                ok: false,
                message:
                    failed === sent
                        ? 'Not submitted: the uploaded runs couldn’t be sent for review. Nothing was changed.'
                        : `Not submitted: only ${sent - failed} of ${sent} uploaded runs reached the review queue. Try again.`,
            };
        }
        return {
            ok: true,
            message: serverRunCount
                ? 'Submitted for review. Track it in My work.'
                : 'Saved for review in this browser only. Reviewers can’t see it until results are stored on the server.',
        };
    };

    const submitForReview = async (curve, { attribution }) => {
        const serverRunIds = curve.submissionRunIds || [];
        const outcome = reviewOutcome(serverRunIds.length, await sendRunsForReview(serverRunIds));
        if (outcome.ok) ws.submitForReview(curve.id, { attribution });
        notify(outcome.message, outcome.ok ? 'success' : 'error');
    };

    const continueUpload = ({ localRunIds = [] }) => {
        const local = brv02Runs.filter((r) => localRunIds.includes(r.runId));
        if (!local.length) {
            notify('Those uploads are no longer in this browser. Upload the files again.', 'error');
            return;
        }
        queueBundlesForWizard(local.map(buildStagedBundle), 'submit-review');
        onNavigate('submit-benchmarks', { intent: 'submit-review' });
    };

    // One-step publish: the result is built behind the scenes from the runs.
    const quickSubject = useMemo(() => {
        if (!quick) return null;
        const draft = curveDraftFromRuns(quick.runs);
        return { ...draft, name: autoCurveName(draft.meta), baselines: [] };
    }, [quick]);
    const quickChecks = useMemo(() => (quickSubject ? curveChecks(quickSubject) : []), [quickSubject]);
    const quickSummary = quickSubject
        ? [
              `${quick.runs.length} run${quick.runs.length === 1 ? '' : 's'}`,
              concRange(quickSubject.points),
              quickSubject.meta.setup,
              fmtDay(Math.max(0, ...quick.runs.map((r) => r.ts || 0))),
          ]
              .filter(Boolean)
              .join(' · ')
        : '';

    // Resolves false when the server refuses (the hook's toast says why), so
    // the review screen can keep the item open; success is only said after.
    const decide = async (item, decision, feedback = '') => {
        if (item.kind === 'curve') {
            ws.review(item.id, decision, { feedback });
        } else {
            const ok =
                decision === 'approve'
                    ? await updateSubmissionStatus?.(item.runId, 'public', '', { quiet: true })
                    : await updateSubmissionStatus?.(item.runId, 'rejected', decision === 'decline' ? `Declined: ${feedback}` : feedback, { quiet: true });
            loadReviewQueue();
            if (ok !== true) return false;
        }
        notify(decision === 'approve' ? 'Approved and published.' : decision === 'decline' ? 'Declined. The contributor sees your note in My work.' : 'Sent back with your note.');
        return true;
    };

    const openInBrowser = (selectedRuns) => {
        const keys = new Set(selectedRuns.map((r) => r.benchmarkKey));
        if (!keys.size) return;
        setSelectedBenchmarks?.(keys);
        onNavigate('benchmark-browser');
    };

    // Says exactly what synced and what didn't; loadAllData reports each source.
    const syncAll = async () => {
        setSyncing(true);
        try {
            const report = await loadAllData?.(null, true);
            if (!report) {
                notify('Sync finished, but Prism couldn’t tell which sources synced.', 'error');
                return;
            }
            const { synced, failed } = report;
            if (failed.length) {
                const why = failed.map((f) => `${f.name}, ${plainSyncError(f.error)}`).join('; ');
                notify(`${synced.length} synced, ${failed.length} failed: ${why}`, 'error');
            } else {
                notify(`${synced.length} source${synced.length === 1 ? '' : 's'} synced.`);
            }
        } catch (e) {
            notify(`Sync failed: ${plainSyncError(e?.message)}`, 'error');
        } finally {
            setSyncing(false);
        }
    };

    const shareUrl = (target) => {
        if (!target) return '';
        const p = new URLSearchParams({ view: 'results-store' });
        if (DEV && readParam('instance')) p.set('instance', instance);
        if (target.kind === 'run') p.set('run', target.key);
        if (target.kind === 'curve') p.set('curve', target.id);
        if (target.kind === 'compare') p.set('compare', encodeItems(target.items, target.view));
        return `${window.location.origin}${window.location.pathname}?${p.toString()}`;
    };

    // What in a share can't open for anyone else: results (saved in this
    // browser for now) and runs uploaded only here.
    const shareCurves = useMemo(() => {
        if (!share) return [];
        const ids = share.kind === 'curve' ? [share.id] : share.kind === 'compare' ? share.items.filter((i) => i.type === 'curve').map((i) => i.id) : [];
        return ids.map((id) => ws.getCurve(id)).filter(Boolean);
    }, [share, ws]);
    const shareLocalRuns = useMemo(() => {
        if (!share) return 0;
        const list = share.kind === 'run' ? runsFromKeys([share.key]) : share.kind === 'compare' ? runsFromItems(share.items.filter((i) => i.type !== 'curve')) : [];
        return uniqueRuns(list).filter((r) => r.isLocalOnly).length;
    }, [share, runsFromKeys, runsFromItems]);

    // Swaps each result in a share for its source runs: a link that works for
    // everyone. Baselines stay baselines.
    const shareRunsInstead = () => {
        const swap = (item) => {
            const keys = ws.getCurve(item.id)?.builtFrom.runKeys || [];
            if (!keys.length) return item;
            return item.baseline ? { ...runsItem(keys), baseline: true } : runsItem(keys);
        };
        if (share?.kind === 'curve') setShare({ kind: 'compare', items: [swap({ type: 'curve', id: share.id })], title: 'Source runs' });
        else if (share?.kind === 'compare') setShare({ ...share, items: share.items.map((i) => (i.type === 'curve' ? swap(i) : i)) });
    };

    // ------------------------------------------------------------ effects
    // Keep the address bar shareable: tab + whatever screen is open.
    useEffect(() => {
        const p = new URLSearchParams(window.location.search);
        ['tab', 'run', 'curve', 'compare', 'kpiFilter', 'own', 'includeUnlisted'].forEach((k) => p.delete(k));
        if (tab !== 'browse') p.set('tab', tab);
        if (screen?.type === 'run') p.set('run', screen.key);
        if (screen?.type === 'curve') p.set('curve', screen.id);
        if (screen?.type === 'compare') p.set('compare', encodeItems(screen.items, screen.view));
        const next = `${window.location.pathname}?${p.toString()}`;
        if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(null, '', next);
    }, [tab, screen, encodeItems]);

    // The upload wizard's hand-back flags have done their job (initialTab).
    useEffect(() => {
        try {
            ['prism_show_post_upload_dialog', 'prism_activate_staged_filter', 'prism_activate_my_submissions_filter'].forEach((k) => localStorage.removeItem(k));
        } catch {
            // Storage unavailable.
        }
    }, []);

    useEffect(() => {
        if (sessionStorage.getItem('prism_show_submit_dialog_after_login') === 'true' && isAuthenticated) {
            sessionStorage.removeItem('prism_show_submit_dialog_after_login');
            onNavigate('submit-benchmarks', { intent: 'submit-review' });
        }
    }, [isAuthenticated, onNavigate]);

    // Legacy share links (?benchmarks=<uuids>) open straight into Compare.
    const handledShareLink = useRef(false);
    useEffect(() => {
        const param = readParam('benchmarks');
        if (param === null || handledShareLink.current) return;
        handledShareLink.current = true;
        const clear = () => {
            const p = new URLSearchParams(window.location.search);
            p.delete('benchmarks');
            window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
        };
        let uuids = [];
        try {
            uuids = param ? decodeShareLink(param) : [];
        } catch {
            addToast?.('Invalid share link format', 'error');
        }
        if (!uuids.length) {
            clear();
            return;
        }
        (async () => {
            const keys = new Set();
            const headers = {};
            const token = localStorage.getItem('prism_github_token');
            if (token) headers['X-Prism-Github-Token'] = token;
            let failed = 0;
            await Promise.all(
                uuids.map(async (uuid) => {
                    const existing = data.find((d) => d.run_id === uuid || (d.source && d.source.endsWith(uuid)));
                    if (existing) {
                        keys.add(runKeyOf(existing));
                        return;
                    }
                    try {
                        const res = await fetch(`/api/results/${uuid}`, { headers });
                        if (!res.ok) throw new Error(String(res.status));
                        const payload = await res.json();
                        const entries = (payload.entries || [])
                            .map((stage) => {
                                const parsed = stage.raw_report ? parseReportV02(stage.raw_report, stage.filename) : null;
                                if (!parsed) return null;
                                Object.assign(parsed, {
                                    runId: payload.runId,
                                    runLabel: payload.runLabel,
                                    github_author: payload.github_author,
                                    submission_state: payload.submission_state || 'public',
                                    submitted_at: payload.submitted_at,
                                    well_lit_path: payload.well_lit_path || null,
                                });
                                const entry = stageToEntry(parsed);
                                entry.run_id = payload.runId;
                                entry.source = 'gcs:llm-d-benchmarks';
                                entry.source_info = {
                                    type: 'benchmark_report_v02',
                                    origin: 'gcs:llm-d-benchmarks',
                                    submission_state: payload.submission_state || 'public',
                                    file_identifier: payload.runId,
                                };
                                return entry;
                            })
                            .filter(Boolean);
                        if (entries.length) {
                            injectDynamicEntries?.(entries);
                            keys.add(runKeyOf(entries[0]));
                        } else failed += 1;
                    } catch {
                        failed += 1;
                    }
                })
            );
            if (failed) addToast?.(`${failed} shared benchmark${failed > 1 ? 's' : ''} couldn’t be found or accessed`, 'error');
            if (keys.size) setStack([{ type: 'compare', items: [...keys].map((key) => ({ type: 'run', key })) }]);
            clear();
        })();
    }, [data, addToast, injectDynamicEntries]);

    // ------------------------------------------------------------ render
    const workCount = ws.curves.filter((c) => c.status === 'draft' || c.status === 'needs_changes').length + uploads.length;
    const tabs = [
        { value: 'browse', label: 'Browse' },
        { value: 'mywork', label: 'My work', count: workCount || null },
        { value: 'dashboards', label: 'Watches & reports', count: ws.watches.length + ws.showcases.length || null },
        ...(isReviewer ? [{ value: 'review', label: 'Review queue', count: ws.curves.filter((c) => c.status === 'in_review').length + queue.items.length || null }] : []),
        ...(isAdmin ? [{ value: 'sources', label: 'Sources' }] : []),
    ];
    const activeTab = tabs.some((t) => t.value === tab) ? tab : 'browse';
    const addToCurve = browse.addTo ? ws.getCurve(browse.addTo) : null;

    let content;
    if (screen?.type === 'run') {
        const shownRun = runOfKey(screen.key);
        const runKey = shownRun?.key || screen.key;
        content = (
            <RunDetail
                key={screen.key}
                run={shownRun}
                parentRow={rowOfRun.get(runKey)}
                curvesUsingRun={ws.curves.filter((c) => c.points.some((p) => p.runKey === runKey || p.runKey === screen.key))}
                copy={copy}
                canCurate={canCurate}
                canPublish={canPublish}
                resultOf={resultOf}
                nav={nav}
                onShare={setShare}
            />
        );
    } else if (screen?.type === 'compare') {
        content = (
            <CompareView
                key={screen.items.map((i) => `${i.type}|${i.id || i.key}${i.baseline ? '|ref' : ''}`).join(',')}
                items={screen.items}
                initialView={screen.view}
                resolve={resolve}
                baselineOptions={baselineOptions}
                copy={copy}
                canCurate={canCurate}
                nav={nav}
                onShare={setShare}
                onAddToDashboard={openReportDialog}
                onOpenInBrowser={openInBrowser}
            />
        );
    } else if (screen?.type === 'curve') {
        const shownCurve = ws.getCurve(screen.id);
        const curveRuns = shownCurve ? runsFromKeys(shownCurve.builtFrom?.runKeys || []) : [];
        const ownsCurve =
            instance !== 'public' ||
            (shownCurve && ((shownCurve.localRunIds?.length || 0) + (shownCurve.submissionRunIds?.length || 0) > 0 || ownsRuns(curveRuns)));
        content = (
            <CurveEditor
                key={screen.id}
                curve={shownCurve}
                copy={copy}
                baselineOptions={baselineOptions}
                resolveBaseline={resolveBaseline}
                isReviewer={isReviewer}
                officialBlock={officialBlock}
                publicBlock={!ownsCurve ? 'ownership' : null}
                onUpload={onUpload}
                onSignIn={() => login?.()}
                signInReady={!!isConfigured}
                nav={nav}
                notify={notify}
                onShare={setShare}
                onAddToDashboard={(curveIds) => setDashDialog({ curveIds, raw: [] })}
                onWatch={(c) => setWatchDialog({ configKey: curveConfigKey(c, runsByKey), refCurveId: c.id })}
                onSubmitForReview={submitForReview}
                onContinueUpload={continueUpload}
            />
        );
    } else if (activeTab === 'mywork') {
        content = (
            <MyWorkTab
                curves={ws.curves}
                uploads={uploads}
                serverItems={serverItems}
                instance={instance}
                copy={copy}
                actor={actor}
                canPublish={canPublish}
                officialBlock={officialBlock}
                nav={nav}
                onOpenClassic={onOpenClassic}
                onUpload={onUpload}
            />
        );
    } else if (activeTab === 'dashboards') {
        content = (
            <DashboardsTab
                runs={browseRuns}
                runsByKey={runsByKey}
                copy={copy}
                activeId={dashActive}
                onSelect={setDashActive}
                nav={nav}
                onNewWatch={() => setWatchDialog({})}
                onNewShowcase={() => setDashDialog({ curveIds: [], raw: [] })}
            />
        );
    } else if (activeTab === 'review') {
        content = (
            <ReviewQueueTab
                localCurves={ws.curves.filter((c) => c.status === 'in_review')}
                serverItems={queue.items}
                loading={queue.loading}
                error={queue.error}
                runsById={runsById}
                baselines={publishedCurves}
                onRefresh={loadReviewQueue}
                onDecide={decide}
            />
        );
    } else if (activeTab === 'sources') {
        content = <SourcesTab runs={sourceRuns} uniqueRuns={uniqueRunCounts} dashboardData={dashboardData} onSyncAll={syncAll} syncing={syncing} />;
    } else {
        content = (
            <>
                {addToCurve && (
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent-200 bg-accent-50 px-4 py-3 text-xs text-accent-800">
                        <span>
                            Pick runs to add to <span className="font-semibold">{addToCurve.name}</span>, then choose <span className="font-semibold">Add to result</span>.
                        </span>
                        <Button size="xs" variant="ghost" onClick={() => setBrowse((b) => ({ ...b, addTo: null }))}>
                            Cancel
                        </Button>
                    </div>
                )}
                <BrowseTab
                    runs={browseRuns}
                    curves={publishedCurves}
                    copy={copy}
                    instance={instance}
                    isLoading={loading}
                    state={browse}
                    setState={setBrowse}
                    nav={nav}
                    mineOf={mineOf}
                    canCurate={canCurate}
                    canCurateItems={canCurateItems}
                    canPublish={canPublish}
                    officialBlock={officialBlock}
                    resultOf={resultOf}
                    addTo={addToCurve}
                    onAddToCurve={addSelectionToCurve}
                    onWatchFilters={(filters) => setWatchDialog({ filters })}
                    onUpload={onUpload}
                    onOpenClassic={onOpenClassic}
                />
            </>
        );
    }

    const shareCurve = share?.kind === 'curve' ? ws.getCurve(share.id) : null;

    return (
        <div className="surface-light relative flex min-h-full flex-col bg-white font-sans text-zinc-900 antialiased">
            <PageHeader
                kicker="Prism toolkit"
                title="Results store"
                subtitle="Find, curate and publish benchmark results."
                onNavigateBack={onNavigateBack}
                badge={
                    <Badge size="xs" title={copy.rule}>
                        {copy.name}
                    </Badge>
                }
                actions={
                    <>
                        <AccountMenu auth={auth} />
                        <Button size="sm" variant="ghost" onClick={() => setGlossary(true)}>
                            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                            Glossary
                        </Button>
                        <Button size="sm" variant={instance === 'public' ? 'primary' : 'secondary'} onClick={onUpload}>
                            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                            {copy.uploadLabel}
                        </Button>
                    </>
                }
            />

            <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 shadow-[inset_0_-1px_0_0_var(--color-zinc-200)]">
                    <Tabs tabs={tabs} value={activeTab} onChange={goTab} ariaLabel="Results store sections" idBase={tabsId} className="shadow-none" />
                    {DEV && (
                        <PreviewBar
                            instance={instance}
                            onInstance={(v) => {
                                setStack([]);
                                setBrowse((b) => ({ ...b, selected: new Set(), addTo: null }));
                                onInstance(v);
                            }}
                            isAdmin={isAdmin}
                            signedInAdmin={signedInAdmin}
                            onPreviewRole={onPreviewRole}
                        />
                    )}
                </div>
                {!noticeDismissed && (
                    <Notice className="mt-3" onDismiss={dismissNotice} dismissLabel="Dismiss browser storage note">
                        {BROWSER_NOTE}
                    </Notice>
                )}
            </div>

            {/* The tabs' panel, not a <main>: App.jsx already wraps every view in one. */}
            <TabPanel idBase={tabsId} value={activeTab} className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
                {content}
            </TabPanel>

            <ShareDialog
                target={share}
                url={shareUrl(share)}
                curve={shareCurve}
                curves={shareCurves}
                localRuns={shareLocalRuns}
                copy={copy}
                onClose={() => setShare(null)}
                onShareRunsInstead={shareRunsInstead}
            />

            <GlossaryDialog isOpen={glossary} onClose={() => setGlossary(false)} copy={copy} />

            {quick && quickSubject && (
                <PublishDialog
                    isOpen
                    subject={quickSubject}
                    summary={quickSummary}
                    checks={quickChecks}
                    copy={copy}
                    instance={instance}
                    actor={actor}
                    onClose={() => setQuick(null)}
                    onEditFirst={() => {
                        const picked = quick.runs;
                        setQuick(null);
                        makeCurve(picked);
                    }}
                    onMarkOfficial={() => {
                        if (officialBlock) return;
                        ws.publishRuns(quick.runs);
                        // Like Edit, publishing uses up the selection: the sweep
                        // now shows as its result, so a pick on it would linger.
                        setBrowse((b) => ({ ...b, selected: new Set() }));
                        setQuick(null);
                        notify(`Marked official: ${quickSubject.name}. It’s saved in this browser for now.`);
                    }}
                    onSubmit={async ({ attribution }) => {
                        const picked = quick.runs;
                        setQuick(null);
                        const serverRunIds = picked.filter((r) => r.isUpload && !r.isLocalOnly && r.runId).map((r) => r.runId);
                        const outcome = reviewOutcome(serverRunIds.length, await sendRunsForReview(serverRunIds));
                        if (outcome.ok) {
                            ws.publishRuns(picked, { attribution });
                            setBrowse((b) => ({ ...b, selected: new Set() }));
                        }
                        notify(outcome.message, outcome.ok ? 'success' : 'error');
                    }}
                    onContinueUpload={() => {
                        const picked = quick.runs;
                        ws.createCurve(picked);
                        setQuick(null);
                        continueUpload({ localRunIds: picked.filter((r) => r.isLocalOnly).map((r) => r.runId) });
                    }}
                />
            )}

            {watchDialog && (
                <NewWatchDialog
                    isOpen
                    onClose={() => setWatchDialog(null)}
                    runs={browseRuns}
                    runsByKey={runsByKey}
                    initial={watchDialog}
                    referenceCurves={publishedCurves}
                    onCreate={(def) => {
                        const id = ws.createWatch(def);
                        setWatchDialog(null);
                        setDashActive(id);
                        goTab('dashboards');
                        notify('Watch created. Each time you open it, it checks the newest runs of this setup against the baseline.');
                    }}
                />
            )}

            {dashDialog && (
                <AddToDashboardDialog
                    isOpen
                    copy={copy}
                    curveIds={dashDialog.curveIds}
                    pending={dashDialog.raw?.length || 0}
                    showcases={ws.showcases}
                    onClose={() => setDashDialog(null)}
                    onAdd={(showcaseId) => {
                        const { ids, created } = resolveReportDialog();
                        ids.forEach((id) => ws.addToShowcase(showcaseId, id));
                        notify(`Added to the report.${draftsNote(created)}`);
                    }}
                    onCreate={(name) => {
                        const { ids, created } = resolveReportDialog();
                        const id = ws.createShowcase({ name, curveIds: ids });
                        setDashDialog(null);
                        setDashActive(id);
                        goTab('dashboards');
                        notify(`Report created.${draftsNote(created)}`);
                    }}
                />
            )}

            {/* Top right, under the header: the bottom edge holds the result editor's sticky actions. */}
            <div className="fixed right-4 top-20 z-[100] flex flex-col gap-2" aria-live="polite">
                {toasts.map((t) => (
                    <div key={t.id} className="flex max-w-sm items-start gap-3 rounded-2xl bg-zinc-900 px-4 py-3 text-sm text-white shadow-lg">
                        <span
                            aria-hidden="true"
                            className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', t.type === 'error' ? 'bg-red-400' : t.type === 'success' ? 'bg-emerald-400' : 'bg-sky-400')}
                        />
                        <span className="flex-1">{t.message}</span>
                        <button type="button" onClick={() => removeToast?.(t.id)} aria-label="Dismiss" className="rounded-full p-0.5 text-white/70 hover:bg-white/10 hover:text-white">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function ResultsStore(props) {
    const auth = useGitHubAuth();
    const [instance, setInstance] = useState(readInstanceMode);
    // Dev-only role preview: 'admin' or 'contributor' overrides your real role,
    // so either view can be checked from one dev server. null = your real role.
    const [previewRole, setPreviewRole] = useState(() => (DEV && PREVIEW_ROLES.includes(readParam('role')) ? readParam('role') : null));
    const [classic, setClassic] = useState(() => readParam('classic') === '1');
    const actor = auth.user?.username ? `@${auth.user.username}` : 'you';

    const setUrlParam = (name, value) => {
        const p = new URLSearchParams(window.location.search);
        if (value == null) p.delete(name);
        else p.set(name, value);
        window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
    };

    if (classic) {
        return (
            <Suspense fallback={<LoadingState size="md" />}>
                <ClassicResultsStore
                    {...props}
                    onExitClassic={() => {
                        setUrlParam('classic', null);
                        setClassic(false);
                    }}
                />
            </Suspense>
        );
    }

    return (
        <WorkspaceProvider instance={instance} actor={actor}>
            <ResultsStoreView
                {...props}
                auth={auth}
                instance={instance}
                onInstance={(v) => {
                    setUrlParam('instance', v);
                    setInstance(v);
                }}
                previewRole={previewRole}
                onPreviewRole={(v) => {
                    setUrlParam('role', v);
                    setPreviewRole(v);
                }}
                onOpenClassic={() => {
                    setUrlParam('classic', '1');
                    setClassic(true);
                }}
            />
        </WorkspaceProvider>
    );
}
