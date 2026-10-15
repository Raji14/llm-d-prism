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

import React, { useId, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, ChevronRight, Search, Sparkles, Star, Upload } from 'lucide-react';
import { Badge, Button, Checkbox, EmptyState, FilterPill, Input, LoadingState, Select, ToggleGroup } from '../ui';
import { cn } from '../../utils/cn';
import { Sparkline } from './CurveChart';
import { ResultStatusChip } from './parts';
import {
    DATE_OPTIONS,
    FACETS,
    LOADED_AT,
    buildRows,
    concRange,
    configKeyOf,
    facetOptions,
    fmtDay,
    fmtTput,
    peakOutput,
    runMatches,
} from './catalog';

const PAGE = 40;
// Sweeps on the shelf before "Show all".
const SHELF = 3;

const SORTS = [
    { value: 'newest', label: 'Newest first' },
    { value: 'oldest', label: 'Oldest first' },
    { value: 'peak', label: 'Highest peak throughput' },
    { value: 'model', label: 'Model A–Z' },
];

// Toolbar keys: ←/→ step between the toolbar's buttons (wrapping) and Home/End
// jump to the ends. The buttons also stay in the Tab order, so this is a shortcut.
function onToolbarKeyDown(event) {
    const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')];
    const at = buttons.indexOf(event.target);
    if (at < 0) return;
    const next = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: buttons.length - 1 }[event.key];
    if (next == null) return;
    event.preventDefault();
    buttons[(next + buttons.length) % buttons.length].focus();
}

// Official / Published curves are listed next to runs so people find them the
// same way. Their facets come from the curve's (possibly edited) labels.
function curveRow(c) {
    const points = c.points.filter((p) => p.included);
    return {
        key: `curve|${c.id}`,
        kind: 'curve',
        curve: c,
        title: c.name,
        model: c.meta.model,
        hwLabel: c.meta.accelerator,
        workload: c.meta.workload,
        harness: c.meta.harness,
        source: c.meta.source,
        category: c.meta.category,
        setup: c.meta.setup,
        ts: c.markedAt || c.updatedAt,
        points,
        peak: peakOutput(points),
        count: 1,
        repeats: [],
        searchText: [c.name, c.meta.model, c.meta.accelerator, c.meta.harness, c.meta.source, c.meta.category, c.owner].join(' ').toLowerCase(),
    };
}

function curveMatches(row, filters, query, mineOf) {
    const asRun = {
        source: row.source,
        harness: row.harness,
        category: row.category,
        model: row.model,
        hwLabel: row.hwLabel,
        workload: row.workload,
        ts: row.ts,
        searchText: row.searchText,
    };
    return runMatches(asRun, filters, { query, mineOf: mineOf ? () => mineOf(row) : null });
}

function KindBadge({ row, copy }) {
    if (row.kind === 'suggested') {
        return (
            <Badge tone="brand" size="xs">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Sweep · {row.runs.length} runs
            </Badge>
        );
    }
    if (row.kind === 'curve') {
        return (
            <>
                <ResultStatusChip status={row.curve.status} copy={copy} size="xs" />
                {row.curve.featured && (
                    <Badge tone="brand" size="xs">
                        <Star className="h-3 w-3" aria-hidden="true" />
                        Featured
                    </Badge>
                )}
            </>
        );
    }
    const n = row.points.length;
    return <Badge size="xs">{n > 1 ? `Run · ${n} stages` : row.run.conc != null ? `Run · c=${row.run.conc}` : 'Run'}</Badge>;
}

function RepeatsList({ row, nav, curate }) {
    if (row.kind === 'suggested') {
        return (
            <div className="space-y-3 border-t border-zinc-100 bg-zinc-50/60 px-4 py-3 sm:pl-[8.5rem]">
                {row.repeats.map((rep, i) => (
                    <div key={rep.ts + String(i)} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <span className="w-24 text-xs font-medium text-zinc-700">{fmtDay(rep.ts)}</span>
                        <span className="text-xs text-zinc-600">
                            {rep.runs.length} runs · {concRange(rep.runs.map((r) => r.points[0]))}
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                            {rep.runs.map((r) => (
                                <button
                                    key={r.key}
                                    type="button"
                                    onClick={() => nav.openRun(r.key)}
                                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-tiny text-zinc-700 hover:border-accent-200 hover:text-accent-700"
                                    title={`Open run ${r.runId}`}
                                >
                                    c={r.conc} · {r.idLabel}
                                </button>
                            ))}
                        </span>
                        {curate && (
                            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => nav.makeCurve(rep.runs)}>
                                Edit this batch
                            </Button>
                        )}
                    </div>
                ))}
                <div className="flex justify-end border-t border-zinc-100 pt-3">
                    <Button size="xs" variant="ghost" onClick={() => nav.watchSetup({ configKey: configKeyOf(row.runs[0]) })}>
                        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                        Watch this setup
                    </Button>
                </div>
            </div>
        );
    }
    return (
        <div className="divide-y divide-zinc-100 border-t border-zinc-100 bg-zinc-50/60 sm:pl-[8.5rem]">
            {row.repeats.map(({ runs: [r] }) => (
                <div key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2">
                    <span className="w-24 text-xs font-medium text-zinc-700">{fmtDay(r.ts)}</span>
                    <span className="font-mono text-tiny text-zinc-600">run {r.idLabel}</span>
                    <span className="font-mono text-tiny tabular-nums text-zinc-600">peak {fmtTput(peakOutput(r.points))} tok/s</span>
                    <Button size="xs" variant="ghost" className="ml-auto" onClick={() => nav.openRun(r.key)}>
                        Open
                    </Button>
                </div>
            ))}
        </div>
    );
}

function BrowseRow({ row, selected, onToggle, expanded, onExpand, nav, copy, curate, published }) {
    const canExpand = row.kind === 'suggested' || row.count > 1;
    const open = () => {
        if (row.kind === 'run') nav.openRun(row.run.key);
        else if (row.kind === 'curve') nav.openCurve(row.curve.id);
        else onExpand();
    };
    // A sweep publishes in one step; Edit opens it first to prune or relabel.
    // Already a result: its status sits by the title (with its audience it's
    // too wide for the actions on a phone) and the action opens it. Where
    // people can't curate (others' runs on the public store), Compare.
    const actions =
        row.kind !== 'suggested' ? (
            <Button size="xs" variant="ghost" onClick={open}>
                Open
            </Button>
        ) : published ? (
            <Button size="xs" variant="ghost" onClick={() => nav.openCurve(published.id)}>
                Open result
            </Button>
        ) : curate ? (
            <>
                <Button size="xs" variant="ghost" onClick={() => nav.makeCurve(row.runs)}>
                    Edit
                </Button>
                <Button size="xs" variant="secondary" onClick={() => nav.publish(row.runs)}>
                    {copy.publishVerb}
                </Button>
            </>
        ) : (
            <Button size="xs" variant="ghost" onClick={() => nav.openCompare([{ type: 'row', key: row.key }])}>
                Compare
            </Button>
        );
    const meta = [row.harness, row.source, row.category !== 'Uncategorized' && row.category, row.setup].filter(Boolean).join(' · ');

    return (
        <li className={cn(selected && 'bg-accent-50/40')}>
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
                <Checkbox surface="light" checked={selected} onChange={onToggle} aria-label={`Select ${row.title}`} />
                <Sparkline points={row.points} className="hidden sm:block" colorIndex={row.kind === 'curve' ? 0 : 1} />
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <button type="button" onClick={open} className="min-w-0 truncate text-left text-sm font-semibold text-zinc-900 hover:text-accent-700">
                            {row.title}
                        </button>
                        <KindBadge row={row} copy={copy} />
                        {published && <ResultStatusChip status={published.status} copy={copy} size="xs" />}
                    </div>
                    <p className="mt-0.5 truncate text-micro text-zinc-500">{meta}</p>
                </div>
                <div className="col-span-3 flex items-center justify-end gap-3 sm:col-span-1">
                    <div className="hidden text-right md:block">
                        <div className="font-mono text-xs tabular-nums text-zinc-900">{fmtTput(row.peak)} tok/s</div>
                        <div className="text-tiny text-zinc-500">peak · {concRange(row.points) || `${row.points.length} point${row.points.length === 1 ? '' : 's'}`}</div>
                    </div>
                    <span className="w-20 text-right text-xs text-zinc-600">{fmtDay(row.ts)}</span>
                    {row.count > 1 ? (
                        <button
                            type="button"
                            onClick={onExpand}
                            className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 font-mono text-tiny font-semibold tabular-nums text-zinc-700 hover:border-zinc-300"
                            title={`${row.count} repeats of this configuration`}
                        >
                            ×{row.count}
                        </button>
                    ) : (
                        <span className="w-8" aria-hidden="true" />
                    )}
                    {actions}
                    <button
                        type="button"
                        onClick={onExpand}
                        disabled={!canExpand}
                        aria-expanded={expanded}
                        aria-label={expanded ? 'Collapse' : 'Show runs'}
                        className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 disabled:invisible"
                    >
                        <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} />
                    </button>
                </div>
            </div>
            {expanded && <RepeatsList row={row} nav={nav} curate={curate} />}
        </li>
    );
}

function SuggestedCard({ row, nav, copy, curate, published }) {
    return (
        <article className="flex flex-col rounded-3xl border border-zinc-200 bg-white p-5">
            <div className="flex items-center justify-between gap-2">
                <span className="kicker text-accent-600">Sweep</span>
                <span className="text-micro text-zinc-500">{fmtDay(row.ts)}</span>
            </div>
            <h3 className="mt-2 text-sm font-semibold leading-snug text-zinc-900">{row.title}</h3>
            <p className="mt-1 truncate text-micro text-zinc-500">{[row.harness, row.setup || row.source].filter(Boolean).join(' · ')}</p>
            <div className="mt-3 rounded-2xl bg-zinc-50 px-3 py-2">
                <Sparkline points={row.points} width={260} height={56} colorIndex={1} />
            </div>
            <p className="mt-3 text-xs text-zinc-600">
                <span className="font-mono tabular-nums">{row.runs.length}</span> runs · {concRange(row.points)} · peak{' '}
                <span className="font-mono tabular-nums">{fmtTput(row.peak)}</span> tok/s
                {row.count > 1 && <span> · ×{row.count} batches</span>}
            </p>
            {/* Status on its own line: next to both buttons it pushed Compare onto a line of its own. */}
            {published && <ResultStatusChip status={published.status} copy={copy} size="xs" className="mt-3 self-start" />}
            <div className={cn('flex flex-wrap items-center gap-2', published ? 'mt-3' : 'mt-4')}>
                {published ? (
                    <Button size="xs" variant="ghost" onClick={() => nav.openCurve(published.id)}>
                        Open result
                    </Button>
                ) : (
                    curate && (
                        <>
                            <Button size="xs" variant="secondary" onClick={() => nav.publish(row.runs)}>
                                {copy.publishVerb}
                            </Button>
                            <Button size="xs" variant="ghost" onClick={() => nav.makeCurve(row.runs)}>
                                Edit
                            </Button>
                        </>
                    )
                )}
                <Button size="xs" variant={curate || published ? 'ghost' : 'secondary'} onClick={() => nav.openCompare([{ type: 'row', key: row.key }])}>
                    Compare
                </Button>
            </div>
        </article>
    );
}

export function BrowseTab({ runs, curves, copy, instance, isLoading, state, setState, nav, mineOf, canCurate, canCurateItems, resultOf, addTo, onAddToCurve, onWatchFilters, onShareView, onUpload, onOpenClassic }) {
    const { query, filters, sort, kind, selected, sweepsExpanded = false } = state;
    const [expanded, setExpanded] = useState(() => new Set());
    const [limit, setLimit] = useState(PAGE);
    const sweepsRef = useRef(null);
    const sweepsId = useId();
    const sweepsHeadingId = useId();
    const runsHeadingId = useId();
    const q = query.trim().toLowerCase();

    const filteredRuns = useMemo(() => runs.filter((r) => runMatches(r, filters, { query: q, mineOf })), [runs, filters, q, mineOf]);

    const { rows, resultCount } = useMemo(() => {
        const runRows = buildRows(filteredRuns);
        const curveRows = curves.map(curveRow).filter((row) => curveMatches(row, filters, q, mineOf));
        const all = [...curveRows, ...runRows].filter((row) =>
            kind === 'all' ? true : kind === 'curves' ? row.kind === 'curve' : kind === 'suggested' ? row.kind === 'suggested' : row.kind === 'run'
        );
        const by = {
            newest: (a, b) => b.ts - a.ts,
            oldest: (a, b) => a.ts - b.ts,
            peak: (a, b) => (b.peak || 0) - (a.peak || 0),
            model: (a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }),
        }[sort];
        return { rows: all.sort(by), resultCount: all.filter((row) => row.kind === 'curve').length };
    }, [filteredRuns, curves, filters, q, mineOf, kind, sort]);

    // The Sweeps shelf ignores search, filters and the list's kind toggle. Those
    // controls sit with the list and only change the list, so using them never
    // hides the shelf or shifts the page under you.
    const allSweeps = useMemo(() => buildRows(runs).filter((r) => r.kind === 'suggested').sort((a, b) => b.ts - a.ts), [runs]);
    const shelf = sweepsExpanded ? allSweeps : allSweeps.slice(0, SHELF);

    const facetOpts = useMemo(
        () => Object.fromEntries(FACETS.map((f) => [f.id, facetOptions(runs, filters, f, { query: q, mineOf })])),
        [runs, filters, q, mineOf]
    );
    const dateOpts = useMemo(
        () =>
            DATE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                count: runs.filter((r) => r.ts && LOADED_AT - r.ts <= o.ms && runMatches(r, filters, { query: q, skip: 'date', mineOf })).length,
            })),
        [runs, filters, q, mineOf]
    );

    const activeCount = Object.values(filters).filter((v) => v != null && v !== false).length;
    const mineAvailable = runs.some((r) => r.author) || curves.length > 0;
    const setFilter = (id, value) => setState((s) => ({ ...s, filters: { ...s.filters, [id]: value } }));
    const toggleSelected = (key) =>
        setState((s) => {
            const next = new Set(s.selected);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return { ...s, selected: next };
        });
    const toggleExpanded = (key) =>
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    // Show all / Show fewer expands the shelf in place: the page doesn't move and
    // the control stays where you clicked it. Kept in Browse state so the shelf
    // is still open when you come back from a sweep.
    const toggleSweeps = () => setState((s) => ({ ...s, sweepsExpanded: !s.sweepsExpanded }));
    // The bottom "Show fewer" sits under a long grid. Collapsing it would leave
    // you in the middle of the list, so bring the shelf back into view.
    const collapseSweeps = () => {
        setState((s) => ({ ...s, sweepsExpanded: false }));
        requestAnimationFrame(() => sweepsRef.current?.scrollIntoView({ block: 'nearest' }));
    };
    const selectedItems = [...selected].map((key) => (key.startsWith('curve|') ? { type: 'curve', id: key.slice(6) } : { type: 'row', key }));

    if (isLoading && runs.length === 0) return <LoadingState label="Loading runs…" />;

    if (runs.length === 0 && curves.length === 0) {
        return (
            <EmptyState
                icon={<Upload className="h-8 w-8" />}
                title="No runs yet"
                message={copy.browseEmpty}
                action={
                    <Button size="sm" variant="secondary" onClick={onUpload}>
                        {copy.uploadLabel}
                    </Button>
                }
            />
        );
    }

    return (
        <div className="space-y-10">
            {allSweeps.length > 0 && (
                <section ref={sweepsRef} aria-labelledby={sweepsHeadingId} className="scroll-mt-6">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                        <div>
                            <h2 id={sweepsHeadingId} className="kicker text-zinc-500">
                                Sweeps
                            </h2>
                            <p className="mt-1 text-xs text-zinc-600">
                                Runs of one setup across concurrency levels, grouped for you.
                                {instance === 'internal' ? ' Mark one official in one step, or edit it first.' : ''}
                            </p>
                        </div>
                        {allSweeps.length > SHELF && (
                            <Button
                                size="xs"
                                variant="link"
                                onClick={toggleSweeps}
                                aria-expanded={sweepsExpanded}
                                aria-controls={sweepsId}
                                className="px-0 py-0 text-accent-600 no-underline hover:text-accent-700 hover:underline"
                            >
                                {sweepsExpanded ? 'Show fewer' : `Show all ${allSweeps.length} sweeps`}
                                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', sweepsExpanded && 'rotate-180')} aria-hidden="true" />
                            </Button>
                        )}
                    </div>
                    <div id={sweepsId} className="grid gap-4 md:grid-cols-3">
                        {shelf.map((row) => (
                            <SuggestedCard key={row.key} row={row} nav={nav} copy={copy} curate={canCurate(row.runs)} published={resultOf(row.runs)} />
                        ))}
                    </div>
                    {sweepsExpanded && allSweeps.length > SHELF * 2 && (
                        <div className="mt-4 flex justify-center">
                            <Button size="sm" variant="secondary" onClick={collapseSweeps} aria-controls={sweepsId}>
                                Show fewer sweeps
                            </Button>
                        </div>
                    )}
                </section>
            )}

            <section aria-labelledby={runsHeadingId}>
                {/* Screen readers only: visually, the search box starts this section. */}
                <h2 id={runsHeadingId} className="sr-only">
                    Runs
                </h2>
                <div role="search" aria-label="Find runs" className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
                            <Input
                                surface="light"
                                type="search"
                                value={query}
                                onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
                                placeholder="Search model, hardware, harness or run ID"
                                aria-label="Search runs"
                                className="rounded-full pl-10"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-xs text-zinc-500">
                            Sort
                            <Select
                                surface="light"
                                value={sort}
                                onChange={(e) => setState((s) => ({ ...s, sort: e.target.value }))}
                                className="w-auto rounded-full py-1.5 text-xs"
                            >
                                {SORTS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </Select>
                        </label>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {FACETS.map((f) => (
                            <FilterPill key={f.id} label={f.label} value={filters[f.id] ?? null} options={facetOpts[f.id]} onChange={(v) => setFilter(f.id, v)} />
                        ))}
                        <FilterPill label="Date" value={filters.date ?? null} options={dateOpts} onChange={(v) => setFilter('date', v)} />
                        {mineAvailable && (
                            <button
                                type="button"
                                aria-pressed={!!filters.mine}
                                onClick={() => setFilter('mine', filters.mine ? null : true)}
                                className={cn(
                                    'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
                                    filters.mine ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300'
                                )}
                            >
                                Mine
                            </button>
                        )}
                        {activeCount > 0 && (
                            <Button size="xs" variant="ghost" onClick={() => setState((s) => ({ ...s, filters: {} }))}>
                                Clear filters
                            </Button>
                        )}
                    </div>
                </div>
                <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <p className="text-xs text-zinc-600">
                            <span className="font-mono tabular-nums text-zinc-900">{filteredRuns.length}</span> run{filteredRuns.length === 1 ? '' : 's'}
                            {resultCount > 0 && (
                                <>
                                    {' · '}
                                    <span className="font-mono tabular-nums text-zinc-900">{resultCount}</span> {copy.publishedLabel.toLowerCase()} result{resultCount === 1 ? '' : 's'}
                                </>
                            )}
                        </p>
                        {/* Next to the count, not in the filter row: appearing there it
                            wrapped to a new line and pushed the list down. */}
                        {activeCount > 0 && (
                            <Button size="xs" variant="secondary" onClick={() => onWatchFilters(filters)}>
                                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                                Watch for regressions
                            </Button>
                        )}
                    </div>
                    <ToggleGroup
                        size="xs"
                        aria-label="Show"
                        value={kind}
                        onChange={(v) => setState((s) => ({ ...s, kind: v }))}
                        options={[
                            { value: 'all', label: 'All' },
                            { value: 'suggested', label: 'Sweeps' },
                            { value: 'runs', label: 'Runs' },
                            { value: 'curves', label: `${copy.publishedLabel} results` },
                        ]}
                    />
                </div>
                {rows.length === 0 ? (
                    <div className="rounded-3xl border border-zinc-200 bg-white">
                        <EmptyState
                            icon={<Search className="h-8 w-8" />}
                            title="Nothing matches"
                            message="Try fewer filters or a different search."
                            action={
                                <Button size="xs" variant="secondary" onClick={() => setState((s) => ({ ...s, filters: {}, query: '', kind: 'all' }))}>
                                    Clear search and filters
                                </Button>
                            }
                        />
                    </div>
                ) : (
                    <ul className="divide-y divide-zinc-100 overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                        {rows.slice(0, limit).map((row) => (
                            <BrowseRow
                                key={row.key}
                                row={row}
                                copy={copy}
                                nav={nav}
                                curate={row.kind === 'suggested' && canCurate(row.runs)}
                                published={row.kind === 'suggested' ? resultOf(row.runs) : null}
                                selected={selected.has(row.key)}
                                onToggle={() => toggleSelected(row.key)}
                                expanded={expanded.has(row.key)}
                                onExpand={() => toggleExpanded(row.key)}
                            />
                        ))}
                    </ul>
                )}
                {rows.length > limit && (
                    <div className="mt-4 flex justify-center">
                        <Button size="sm" variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                            Show {Math.min(PAGE, rows.length - limit)} more
                        </Button>
                    </div>
                )}
                <p className="mt-6 text-center text-micro text-zinc-500">
                    Looking for the previous table?{' '}
                    <button type="button" onClick={onOpenClassic} className="font-medium text-accent-600 hover:underline">
                        Open the classic view
                    </button>
                </p>
            </section>

            {selected.size > 0 && (
                <div
                    role="toolbar"
                    aria-label="Selection actions"
                    onKeyDown={onToolbarKeyDown}
                    className="sticky bottom-4 z-30 mx-auto flex w-fit flex-wrap items-center gap-2 rounded-full border border-zinc-200 bg-white/95 px-3 py-2 shadow-lg backdrop-blur"
                >
                    <span className="px-2 text-xs font-medium text-zinc-700">
                        <span className="font-mono tabular-nums">{selected.size}</span> selected
                    </span>
                    {addTo ? (
                        <Button size="xs" onClick={() => onAddToCurve(selectedItems)}>
                            Add to result
                        </Button>
                    ) : (
                        <>
                            <Button size="xs" onClick={() => nav.openCompare(selectedItems)}>
                                Compare
                            </Button>
                            {canCurateItems(selectedItems) && (
                                <Button size="xs" variant="secondary" onClick={() => nav.makeCurveFromItems(selectedItems)}>
                                    Make result
                                </Button>
                            )}
                            <Button size="xs" variant="secondary" onClick={() => onShareView(selectedItems)}>
                                Share view
                            </Button>
                        </>
                    )}
                    <Button size="xs" variant="ghost" onClick={() => setState((s) => ({ ...s, selected: new Set() }))}>
                        Clear
                    </Button>
                </div>
            )}
        </div>
    );
}
