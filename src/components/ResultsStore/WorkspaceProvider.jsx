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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { WorkspaceContext } from './workspaceContext';
import { autoCurveName, chipsOf, curveDraftFromRuns, droppedStages, snapshotPoints, withChips } from './catalog';

// Curves, Watch dashboards and Showcases are saved in this browser, per
// instance mode, until the server-side curve entity exists (see the
// results-store simplification design doc). Curves reference runs and hold a
// read-only snapshot of their measured values; runs are never copied or edited.
// The UI calls curves Results and showcases Reports; storage keeps the old names.
const STORAGE_KEY = 'prism_results_workspace_v1';
const EMPTY = { curves: [], watches: [], showcases: [] };

// Names nobody edited follow the suggestion as it improves (it now names
// the setup, so a baseline and its optimization no longer share a name).
const refreshNames = (w) => ({ ...EMPTY, ...w, curves: (w?.curves || []).map((c) => (c.autoName && c.meta ? { ...c, name: autoCurveName(c.meta) } : c)) });

function load() {
    try {
        const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return { internal: refreshNames(raw.internal), public: refreshNames(raw.public) };
    } catch {
        return { internal: { ...EMPTY }, public: { ...EMPTY } };
    }
}

const newId = (prefix) => `${prefix}-${String(globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)).slice(0, 8)}`;
const slugify = (s) => String(s || 'dashboard').toLowerCase().replace(/×/g, 'x').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const log = (curve, by, what) => [...(curve.history || []), { at: Date.now(), by, what }];
// Label edits arrive one keystroke at a time: consecutive edits of one field by
// one person within ten minutes make one lineage entry, so history stays readable.
const EDIT_WINDOW_MS = 10 * 60 * 1000;
const logEdit = (curve, by, what) => {
    const history = curve.history || [];
    const last = history[history.length - 1];
    if (last && last.by === by && last.what === what && Date.now() - last.at < EDIT_WINDOW_MS) return [...history.slice(0, -1), { ...last, at: Date.now() }];
    return [...history, { at: Date.now(), by, what }];
};
const FIELD_NAMES = { accelerator: 'accelerator', model: 'model', category: 'category', workload: 'workload', notes: 'notes' };
// How a point is named in lineage: by its load level, else its run.
const pointLabel = (p) => (p.conc != null ? `c=${p.conc}` : p.rate != null ? `${p.rate} req/s` : `run ${p.idLabel}`);

export function WorkspaceProvider({ instance, actor, children }) {
    const [state, setState] = useState(load);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
            // Storage full or unavailable: keep working in memory.
        }
    }, [state]);

    const update = useCallback(
        (fn) => setState((prev) => ({ ...prev, [instance]: fn(prev[instance] || EMPTY) })),
        [instance]
    );

    const patchCurve = useCallback(
        (id, fn) =>
            update((w) => ({
                ...w,
                curves: w.curves.map((c) => (c.id === id ? { ...fn(c), updatedAt: Date.now() } : c)),
            })),
        [update]
    );

    // Publishing a new version retires the one it replaces (history stays).
    const retireSuperseded = useCallback(
        (curves, curve) =>
            curves.map((c) =>
                curve.supersedes && c.id === curve.supersedes
                    ? { ...c, status: 'superseded', supersededBy: curve.id, history: log(c, actor, `Replaced by v${curve.version}`) }
                    : c
            ),
        [actor]
    );

    const ws = state[instance] || EMPTY;

    const api = useMemo(() => {
        const getCurve = (id) => ws.curves.find((c) => c.id === id) || null;

        // A new draft result over these runs (the runs themselves are never copied).
        const draftCurve = (runs, { name } = {}) => {
            const draft = curveDraftFromRuns(runs);
            const now = Date.now();
            return {
                id: newId('curve'),
                version: 1,
                supersedes: null,
                supersededBy: null,
                name: name || autoCurveName(draft.meta),
                autoName: !name,
                status: 'draft',
                visibility: 'me',
                owner: actor,
                createdAt: now,
                updatedAt: now,
                markedBy: null,
                markedAt: null,
                submittedAt: null,
                reviewedBy: null,
                featured: false,
                feedback: '',
                baselines: [],
                history: [{ at: now, by: actor, what: `Created from ${runs.length} run${runs.length === 1 ? '' : 's'}` }],
                ...draft,
            };
        };

        return {
            instance,
            actor,
            curves: ws.curves,
            watches: ws.watches,
            showcases: ws.showcases,
            getCurve,

            createCurve(runs, { name } = {}) {
                const curve = draftCurve(runs, { name });
                update((w) => ({ ...w, curves: [curve, ...w.curves] }));
                return curve.id;
            },

            // Publishing straight from a sweep or run: the result is created
            // behind the scenes, then marked Official (internal) or sent for
            // review (public) in the same step. `visibility` is who sees it once
            // approved ('public' or 'link'), `dco` the sign-off as given, and
            // `reach` how many of its uploaded runs reviewers can actually see.
            publishRuns(runs, { attribution, visibility, dco, reach = 0 } = {}) {
                const curve = draftCurve(runs);
                const now = curve.createdAt;
                const published =
                    instance === 'internal'
                        ? { status: 'official', visibility: 'instance', markedBy: actor, markedAt: now, history: [...curve.history, { at: now, by: actor, what: 'Marked official' }] }
                        : {
                              status: 'in_review',
                              visibility: 'reviewers',
                              publishVisibility: visibility === 'link' ? 'link' : 'public',
                              submittedAt: now,
                              attribution: attribution || actor,
                              dco: dco || null,
                              reviewReach: reach,
                              history: [...curve.history, { at: now, by: actor, what: dco ? `Submitted for review · DCO ${dco.version} signed` : 'Submitted for review' }],
                          };
                update((w) => ({ ...w, curves: [{ ...curve, ...published }, ...w.curves] }));
                return curve.id;
            },

            renameCurve(id, name) {
                patchCurve(id, (c) => ({ ...c, name, autoName: false, history: logEdit(c, actor, 'Renamed') }));
            },

            addRunsToCurve(id, runs) {
                patchCurve(id, (c) => {
                    const have = new Set(c.points.map((p) => p.key));
                    const added = snapshotPoints(runs).filter((p) => !have.has(p.key));
                    const points = [...c.points, ...added];
                    const allConc = points.every((p) => p.conc != null);
                    points.sort((a, b) => (allConc ? a.conc - b.conc : a.output - b.output));
                    const runKeys = [...new Set([...(c.builtFrom.runKeys || []), ...runs.map((r) => r.key)])];
                    return {
                        ...c,
                        points,
                        builtFrom: { ...c.builtFrom, runs: runKeys.length, runKeys },
                        submissionRunIds: [...new Set([...(c.submissionRunIds || []), ...runs.filter((r) => r.isUpload && !r.isLocalOnly && r.runId).map((r) => r.runId)])],
                        localRunIds: [...new Set([...(c.localRunIds || []), ...runs.filter((r) => r.isLocalOnly).map((r) => r.runId)])],
                        // Stages that reported 0 tok/s, so the publish check can name them.
                        dropped: [...(c.dropped || []), ...droppedStages(runs).filter((s) => !(c.dropped || []).some((d) => d.runKey === s.runKey && d.conc === s.conc && d.stage === s.stage))],
                        history: log(c, actor, `Added ${added.length} point${added.length === 1 ? '' : 's'} from ${runs.length} run${runs.length === 1 ? '' : 's'}`),
                    };
                });
            },

            setMeta(id, field, value) {
                patchCurve(id, (c) => {
                    const meta = { ...c.meta, [field]: value };
                    // Per-chip throughput follows the chip count in the label people
                    // see (and correct). Measured values never change.
                    const points = field === 'accelerator' ? withChips(c.points, chipsOf(meta)) : c.points;
                    return { ...c, meta, points, name: c.autoName ? autoCurveName(meta) : c.name, history: logEdit(c, actor, `Edited ${FIELD_NAMES[field] || field}`) };
                });
            },

            togglePoint(id, pointKey, reason) {
                patchCurve(id, (c) => {
                    const target = c.points.find((p) => p.key === pointKey);
                    if (!target) return c;
                    const why = target.included ? reason || 'Excluded by you' : '';
                    return {
                        ...c,
                        points: c.points.map((p) => (p.key === pointKey ? { ...p, included: !p.included, reason: why } : p)),
                        history: log(c, actor, target.included ? `Excluded ${pointLabel(target)}${reason ? ` (${String(reason).split(':')[0].toLowerCase()})` : ''}` : `Included ${pointLabel(target)} again`),
                    };
                });
            },

            addBaseline(id, baseline) {
                patchCurve(id, (c) => ({
                    ...c,
                    baselines: c.baselines.some((b) => b.id === baseline.id) ? c.baselines : [...c.baselines, baseline],
                }));
            },

            removeBaseline(id, baselineId) {
                patchCurve(id, (c) => ({ ...c, baselines: c.baselines.filter((b) => b.id !== baselineId) }));
            },

            setVisibility(id, visibility) {
                patchCurve(id, (c) => ({ ...c, visibility, history: log(c, actor, `Shared: ${visibility}`) }));
            },

            markOfficial(id) {
                update((w) => {
                    const target = w.curves.find((c) => c.id === id);
                    if (!target) return w;
                    const now = Date.now();
                    const marked = {
                        ...target,
                        status: 'official',
                        visibility: 'instance',
                        markedBy: actor,
                        markedAt: now,
                        updatedAt: now,
                        history: log(target, actor, 'Marked official'),
                    };
                    return { ...w, curves: retireSuperseded(w.curves, marked).map((c) => (c.id === id ? marked : c)) };
                });
            },

            // `visibility` is who sees it once approved ('public' or 'link'),
            // `dco` the sign-off as given ({ version, by, at }), and `reach` how
            // many of its uploaded runs reviewers can actually see (0 = only here).
            submitForReview(id, { attribution, visibility, dco, reach = 0 } = {}) {
                patchCurve(id, (c) => ({
                    ...c,
                    status: 'in_review',
                    visibility: 'reviewers',
                    publishVisibility: visibility === 'link' ? 'link' : 'public',
                    submittedAt: Date.now(),
                    attribution: attribution || c.attribution || actor,
                    dco: dco || c.dco || null,
                    reviewReach: reach,
                    feedback: '',
                    history: log(c, actor, dco ? `Submitted for review · DCO ${dco.version} signed` : 'Submitted for review'),
                }));
            },

            review(id, decision, { feedback = '' } = {}) {
                update((w) => {
                    const target = w.curves.find((c) => c.id === id);
                    if (!target) return w;
                    const now = Date.now();
                    if (decision === 'approve') {
                        const published = {
                            ...target,
                            status: 'published',
                            // As the author chose when submitting: listed, or link only.
                            visibility: target.publishVisibility === 'link' ? 'link' : 'public',
                            reviewedBy: actor,
                            markedAt: now,
                            updatedAt: now,
                            history: log(target, actor, 'Approved and published'),
                        };
                        return { ...w, curves: retireSuperseded(w.curves, published).map((c) => (c.id === id ? published : c)) };
                    }
                    const status = decision === 'decline' ? 'declined' : 'needs_changes';
                    return {
                        ...w,
                        curves: w.curves.map((c) =>
                            c.id === id
                                ? {
                                      ...c,
                                      status,
                                      visibility: 'me',
                                      feedback,
                                      reviewedBy: actor,
                                      updatedAt: now,
                                      history: log(c, actor, decision === 'decline' ? 'Declined' : 'Changes requested'),
                                  }
                                : c
                        ),
                    };
                });
            },

            // Undo an accidental approval right from the review queue: returns the
            // result to `in_review` and restores any prior version it superseded.
            unapprove(id) {
                update((w) => {
                    const target = w.curves.find((c) => c.id === id);
                    if (!target) return w;
                    const now = Date.now();
                    return {
                        ...w,
                        curves: w.curves.map((c) => {
                            if (c.id === id) {
                                return {
                                    ...c,
                                    status: 'in_review',
                                    visibility: 'reviewers',
                                    reviewedBy: null,
                                    markedAt: null,
                                    updatedAt: now,
                                    history: log(c, actor, 'Approval undone · returned to review'),
                                };
                            }
                            if (target.supersedes && c.id === target.supersedes && c.supersededBy === id) {
                                return {
                                    ...c,
                                    status: 'published',
                                    supersededBy: null,
                                    updatedAt: now,
                                    history: log(c, actor, 'Restored after approval was undone'),
                                };
                            }
                            return c;
                        }),
                    };
                });
            },

            // A declined result goes back to a draft its owner can fix and submit
            // again; the reviewer's note stays visible until it's resubmitted.
            reopenCurve(id) {
                patchCurve(id, (c) => (c.status === 'declined' ? { ...c, status: 'draft', visibility: 'me', history: log(c, actor, 'Reopened as a draft') } : c));
            },

            toggleFeatured(id) {
                patchCurve(id, (c) => ({ ...c, featured: !c.featured, history: log(c, actor, c.featured ? 'Unfeatured' : 'Featured') }));
            },

            discardCurve(id) {
                update((w) => ({
                    ...w,
                    curves: w.curves.filter((c) => c.id !== id),
                    showcases: w.showcases.map((s) => ({ ...s, curveIds: s.curveIds.filter((cid) => cid !== id) })),
                }));
            },

            // Editing an Official/Published curve opens a new draft version;
            // the live one stays until the new version replaces it.
            newVersion(id) {
                const source = getCurve(id);
                if (!source) return null;
                const now = Date.now();
                const nextId = newId('curve');
                const draft = {
                    ...source,
                    id: nextId,
                    version: source.version + 1,
                    supersedes: source.id,
                    supersededBy: null,
                    status: 'draft',
                    visibility: 'me',
                    owner: actor,
                    createdAt: now,
                    updatedAt: now,
                    markedBy: null,
                    markedAt: null,
                    submittedAt: null,
                    reviewedBy: null,
                    featured: false,
                    feedback: '',
                    history: [{ at: now, by: actor, what: `Draft v${source.version + 1} started from v${source.version}` }],
                };
                update((w) => ({ ...w, curves: [draft, ...w.curves] }));
                return nextId;
            },

            createWatch(def) {
                const id = newId('watch');
                update((w) => ({ ...w, watches: [{ ...def, id, owner: actor, createdAt: Date.now() }, ...w.watches] }));
                return id;
            },

            updateWatch(id, patch) {
                update((w) => ({ ...w, watches: w.watches.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
            },

            deleteWatch(id) {
                update((w) => ({ ...w, watches: w.watches.filter((x) => x.id !== id) }));
            },

            createShowcase({ name, description = '', curveIds = [] }) {
                const id = newId('showcase');
                const handle = String(actor || 'you').replace(/^@/, '');
                update((w) => ({
                    ...w,
                    showcases: [
                        { id, name, description, slug: `/u/${handle}/${slugify(name)}`, curveIds, price: null, owner: actor, createdAt: Date.now() },
                        ...w.showcases,
                    ],
                }));
                return id;
            },

            updateShowcase(id, patch) {
                const handle = String(actor || 'you').replace(/^@/, '');
                update((w) => ({
                    ...w,
                    showcases: w.showcases.map((s) =>
                        s.id === id ? { ...s, ...patch, ...(patch.name ? { slug: `/u/${handle}/${slugify(patch.name)}` } : {}) } : s
                    ),
                }));
            },

            // Reports price each accelerator type on its own ($ per chip-hour).
            setReportPrice(id, accelType, value) {
                update((w) => ({
                    ...w,
                    showcases: w.showcases.map((s) => (s.id === id ? { ...s, prices: { ...(s.prices || {}), [accelType]: value } } : s)),
                }));
            },

            addToShowcase(id, curveId) {
                update((w) => ({
                    ...w,
                    showcases: w.showcases.map((s) =>
                        s.id === id && !s.curveIds.includes(curveId) ? { ...s, curveIds: [...s.curveIds, curveId] } : s
                    ),
                }));
            },

            removeFromShowcase(id, curveId) {
                update((w) => ({
                    ...w,
                    showcases: w.showcases.map((s) => (s.id === id ? { ...s, curveIds: s.curveIds.filter((c) => c !== curveId) } : s)),
                }));
            },

            deleteShowcase(id) {
                update((w) => ({ ...w, showcases: w.showcases.filter((s) => s.id !== id) }));
            },
        };
    }, [ws, instance, actor, update, patchCurve, retireSuperseded]);

    return <WorkspaceContext.Provider value={api}>{children}</WorkspaceContext.Provider>;
}
