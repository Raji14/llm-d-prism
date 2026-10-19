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

// Watches & reports. A Watch follows exactly one setup and compares each new
// batch with a baseline, so a different deployment is never flagged as a
// regression. A Report collects Official / Published results to present, with
// a price per accelerator type. (Reports are stored as "showcases".)

import React, { useId, useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { Activity, LayoutDashboard, Plus, Trash2, X } from 'lucide-react';
import {
    Badge,
    Button,
    CHART_STATUS,
    ChartContainer,
    ChartTooltip,
    ChartTooltipRow,
    ChartXAxis,
    ChartYAxis,
    EmptyState,
    Input,
    Label,
    Modal,
    Panel,
    Select,
    StatusChip,
    ToggleGroup,
    cursorProps,
    getAxisConfig,
    getChartTheme,
    gridProps,
    seriesColor,
} from '../ui';
import { cn } from '../../utils/cn';
import { loadCustomPricingRates } from '../../utils/pricingEngine';
import { CurveChart, MetricToggles } from './CurveChart';
import { fileSlug, mdTable, toCsv } from './exporters';
import { resultStatusLabel } from './instance';
import { ExportActions, Notice, ResultStatusChip } from './parts';
import { useChartView } from './useChartView';
import { useWorkspace } from './workspaceContext';
import {
    FACETS,
    OPERATING_TTFT_MS,
    accelTypeOf,
    buildRows,
    chipsOf,
    configKeyOf,
    configLabelOf,
    costPerMillion,
    curveConfigKey,
    fmtCount,
    fmtDay,
    fmtMoney,
    fmtMs,
    fmtShortDay,
    fmtPct,
    fmtTput,
    latencyLabel,
    listPrice,
    nearestPoint,
    pricingPoint,
    runMatches,
    seriesPoints,
    setupsOf,
    typicalStat,
    watchConfigKey,
    watchRefPoints,
    watchSeries,
} from './catalog';

const WATCH_FACETS = FACETS.filter((f) => ['source', 'harness', 'model', 'hardware', 'workload'].includes(f.id));
const THRESHOLDS = [-3, -5, -10, -15];

// Where a report prices each result: its highest throughput within a TTFT
// limit (ms), or its peak however slow. Saved with the report as `priceAt`.
const PRICE_AT_OPTIONS = [
    ...[...new Set([1000, 2000, 3000, 5000, OPERATING_TTFT_MS])].sort((a, b) => a - b).map((ms) => ({ value: ms, label: `TTFT ≤ ${ms / 1000} s` })),
    { value: 'peak', label: 'Peak' },
];

// Browse filters that can narrow the setup list (date, search and "mine" can't).
const watchFilters = (filters = {}) => Object.fromEntries(WATCH_FACETS.filter((f) => filters[f.id] != null).map((f) => [f.id, filters[f.id]]));

// "Llama-3.1-70B · H100 ×16 · 9999/1000 · 4: 3P-TP4 1D-TP4" → the part after the model.
const withoutModel = (label, model) => (label.startsWith(`${model} · `) ? label.slice(model.length + 3) : label);

// "c=1, 8, 32, 64, 128", or "c=1–512" when there are too many to list.
const levelsLabel = (concs) => (concs.length <= 8 ? `c=${concs.join(', ')}` : `c=${concs[0]}–${concs[concs.length - 1]}`);

// Keeps "TTFT ≤ 2 s" or "TTFT 2.64 s" together when a narrow cell wraps.
const nobreak = (s) => s.replace(/ /g, '\u00a0');

// "TTFT p50 2.64 s": a point's TTFT, naming the statistic it is.
const ttftLabel = (p) => (Number.isFinite(p.ttft) ? `${latencyLabel('ttft', typicalStat(p, 'ttft'))} ${fmtMs(p.ttft)}` : 'TTFT not recorded');

// "c=128 · TTFT p50 2.64 s": the point a price was worked out at.
const pointLabel = (p) => [p.conc != null ? `c=${p.conc}` : null, nobreak(ttftLabel(p))].filter(Boolean).join('\u00a0· ');

// ------------------------------------------------------------- dialogs

export function NewWatchDialog({ isOpen, onClose, runs, runsByKey, initial = {}, referenceCurves, onCreate }) {
    const scoped = useMemo(() => {
        const f = watchFilters(initial.filters);
        return Object.keys(f).length ? runs.filter((r) => runMatches(r, f)) : runs;
    }, [runs, initial.filters]);
    const setups = useMemo(() => setupsOf(scoped), [scoped]);
    const [setupKey, setSetupKey] = useState(() => (setups.some((s) => s.key === initial.configKey) ? initial.configKey : setups[0]?.key || ''));
    const [refChoice, setRefChoice] = useState(initial.refCurveId || 'auto');
    const [atConc, setAtConc] = useState('');
    const [threshold, setThreshold] = useState(-5);
    const [name, setName] = useState('');

    const setup = setups.find((s) => s.key === setupKey) || null;
    const rows = useMemo(() => buildRows(setup?.runs || []), [setup]);
    const batches = rows.reduce((n, row) => n + row.repeats.length, 0);
    const newestBatch = rows.find((row) => row.points.length > 1) || rows[0] || null;
    // Only results of this same setup can be its baseline.
    const refs = useMemo(() => referenceCurves.filter((c) => curveConfigKey(c, runsByKey) === setupKey), [referenceCurves, runsByKey, setupKey]);
    const pinned = newestBatch ? { kind: 'pinned', name: `Pinned batch · ${fmtDay(newestBatch.ts)}`, points: newestBatch.points } : null;
    const chosen = refs.find((c) => c.id === refChoice) || (refChoice === 'pinned' ? null : refs[0]);
    const ref = chosen ? { kind: 'curve', id: chosen.id, name: chosen.name, points: chosen.points.filter((p) => p.included) } : pinned;
    const concs = [...new Set((ref?.points || []).map((p) => p.conc).filter((c) => c != null))].sort((a, b) => a - b);
    const conc = concs.includes(Number(atConc)) ? Number(atConc) : null;
    const byModel = setups.reduce((m, s) => m.set(s.model, [...(m.get(s.model) || []), s]), new Map());
    const scopedByFilters = scoped !== runs;

    const create = () =>
        onCreate({
            name: name.trim() || `${setup.label} vs. baseline`,
            configKey: setup.key,
            setupLabel: setup.label,
            filters: {},
            ref: ref.kind === 'pinned' ? { kind: 'pinned', name: ref.name, points: ref.points } : { kind: 'curve', id: ref.id, name: ref.name },
            atConc: conc,
            threshold: Number(threshold),
            metric: 'output',
        });

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title="Watch for regressions"
            subtitle="Pick one setup. Each new batch of it is compared with a baseline, and drops past the threshold are flagged."
            footer={
                <>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button size="sm" disabled={!setup || !ref} onClick={create}>
                        Create watch
                    </Button>
                </>
            }
        >
            <div className="surface-light space-y-5 text-sm">
                {setups.length === 0 ? (
                    <p className="text-xs text-zinc-600">No runs to watch yet. Runs from your sources show up here once they sync.</p>
                ) : (
                    <div>
                        <Label surface="light" htmlFor="rs-watch-setup">
                            Setup
                        </Label>
                        <Select surface="light" id="rs-watch-setup" value={setupKey} onChange={(e) => setSetupKey(e.target.value)}>
                            {[...byModel.entries()].map(([model, list]) => (
                                <optgroup key={model} label={model}>
                                    {list.map((s) => (
                                        <option key={s.key} value={s.key}>
                                            {withoutModel(s.label, model)} · {s.harness} · newest {fmtDay(s.ts)}
                                        </option>
                                    ))}
                                </optgroup>
                            ))}
                        </Select>
                        <p className="mt-2 text-micro text-zinc-500">
                            {setup ? (
                                <>
                                    <span className="font-mono tabular-nums">{batches}</span> batch{batches === 1 ? '' : 'es'} so far.{' '}
                                </>
                            ) : null}
                            Only repeats of this exact setup are compared, so a different deployment is never flagged.
                            {scopedByFilters ? ' Showing setups that match your Browse filters.' : ''}
                        </p>
                    </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <Label surface="light" htmlFor="rs-watch-ref">
                            Baseline
                        </Label>
                        <Select surface="light" id="rs-watch-ref" value={ref?.kind === 'curve' ? ref.id : 'pinned'} onChange={(e) => setRefChoice(e.target.value)} disabled={!setup}>
                            {refs.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.name} ({resultStatusLabel(c.status)})
                                </option>
                            ))}
                            <option value="pinned" disabled={!pinned}>
                                {pinned ? `Pin the newest batch of this setup (${fmtDay(newestBatch.ts)})` : 'No batch to pin yet'}
                            </option>
                        </Select>
                    </div>
                    <div>
                        <Label surface="light" htmlFor="rs-watch-metric">
                            Metric
                        </Label>
                        <Select surface="light" id="rs-watch-metric" value={conc ?? ''} onChange={(e) => setAtConc(e.target.value)}>
                            <option value="">Peak output throughput</option>
                            {concs.map((c) => (
                                <option key={c} value={c}>
                                    Output throughput at c={c}
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div>
                        <Label surface="light" htmlFor="rs-watch-threshold">
                            Flag drops of
                        </Label>
                        <Select surface="light" id="rs-watch-threshold" value={threshold} onChange={(e) => setThreshold(e.target.value)}>
                            {THRESHOLDS.map((t) => (
                                <option key={t} value={t}>
                                    {t}% or worse
                                </option>
                            ))}
                        </Select>
                    </div>
                    <div className="sm:col-span-2">
                        <Label surface="light" htmlFor="rs-watch-name">
                            Name
                        </Label>
                        <Input surface="light" id="rs-watch-name" value={name} placeholder={setup ? `${setup.label} vs. baseline` : 'Name this watch'} onChange={(e) => setName(e.target.value)} />
                    </div>
                </div>
            </div>
        </Modal>
    );
}

export function AddToDashboardDialog({ isOpen, onClose, curveIds, showcases, onAdd, onCreate, copy }) {
    const [name, setName] = useState('');
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="md"
            title="Add to a report"
            subtitle={`Only ${copy.publishedLabel} results can go in a report, so it doesn’t change under you.`}
            footer={
                <Button size="sm" variant="ghost" onClick={onClose}>
                    Done
                </Button>
            }
        >
            <div className="surface-light space-y-4">
                {showcases.length > 0 && (
                    <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
                        {showcases.map((s) => {
                            const has = curveIds.every((id) => s.curveIds.includes(id));
                            return (
                                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                    <div className="min-w-0">
                                        <div className="truncate text-sm font-medium text-zinc-900">{s.name}</div>
                                        <div className="text-micro text-zinc-500">
                                            {s.curveIds.length} result{s.curveIds.length === 1 ? '' : 's'}
                                        </div>
                                    </div>
                                    <Button size="xs" variant="secondary" disabled={has} onClick={() => onAdd(s.id)}>
                                        {has ? 'Added' : 'Add'}
                                    </Button>
                                </li>
                            );
                        })}
                    </ul>
                )}
                <div>
                    <Label surface="light" htmlFor="rs-new-showcase">
                        New report
                    </Label>
                    <div className="flex gap-2">
                        <Input surface="light" id="rs-new-showcase" value={name} placeholder="e.g. Qwen3-32B on TPU · leadership review" onChange={(e) => setName(e.target.value)} />
                        <Button size="sm" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>
                            Create
                        </Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

// ------------------------------------------------------------- watch

function WatchTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    return (
        <ChartTooltip title={fmtDay(p.ts)} subtitle={p.setup || p.title}>
            <ChartTooltipRow color={p.flagged ? CHART_STATUS.critical : seriesColor(0)} label="vs. baseline" value={fmtPct(p.delta)} />
            <ChartTooltipRow label={p.conc != null ? `Output at c=${p.conc}` : 'Output throughput'} value={fmtTput(p.value)} unit=" tok/s" />
            {p.flagged && <div className="pt-1 text-tiny font-semibold text-red-700">Flagged: past the threshold</div>}
            {p.isRef && !p.flagged && <div className="pt-1 text-tiny text-zinc-600">The batch the baseline was made from</div>}
        </ChartTooltip>
    );
}

function WatchView({ watch, runs, runsByKey, nav, onDelete, headingId }) {
    const ws = useWorkspace();
    const refPoints = watchRefPoints(watch, ws.getCurve);
    const configKey = watchConfigKey(watch, { getCurve: ws.getCurve, runsByKey });
    // Only repeats of the watched setup: never another deployment.
    const matching = useMemo(() => (configKey ? runs.filter((r) => configKeyOf(r) === configKey) : []), [runs, configKey]);
    const series = useMemo(() => watchSeries(buildRows(matching), refPoints, watch), [matching, refPoints, watch]);
    const flagged = series.filter((s) => s.flagged);
    // One batch, or only the batch the baseline was made from, shows no trend
    // and proves nothing, so don't present it as a pass.
    const waiting = !flagged.length && (series.length < 2 || series.every((s) => s.isRef));
    const ref = nearestPoint(refPoints, watch.atConc);
    const refConcs = [...new Set(refPoints.map((p) => p.conc).filter((c) => c != null))].sort((a, b) => a - b);
    const theme = getChartTheme();
    const metricLabel = watch.atConc != null ? `Output throughput at c=${watch.atConc}` : 'Peak output throughput';
    const setupLabel = watch.setupLabel || (matching[0] ? configLabelOf(matching[0]) : null);
    const fromFilters = !watch.configKey;
    // Keep the threshold line in view, with room for its label, even when every batch is above it.
    const deltas = series.map((s) => s.delta);
    const yLow = Math.min(watch.threshold, 0, ...deltas);
    const yHigh = Math.max(0, ...deltas);
    const yAxis = getAxisConfig([yLow - Math.max(1, (yHigh - yLow) * 0.15), yHigh], false, { includeZero: true });
    const waitingMessage = series.every((s) => s.isRef)
        ? `So far this setup has only the batch${series.length === 1 ? '' : 'es'} the baseline was made from, so there’s nothing to compare yet. Each new batch is compared with the baseline, and drops of ${watch.threshold}% or worse are flagged.`
        : `This setup has one batch so far (${fmtPct(series[0]?.delta)} against the baseline). It takes a second batch to show a trend. Drops of ${watch.threshold}% or worse are flagged.`;
    // The chart's accessible summary; the table under it lists every batch.
    const chartDesc = `${series.length} batch${series.length === 1 ? '' : 'es'}, ${
        flagged.length ? `${flagged.length} flagged at ${watch.threshold}% or worse` : `none past the ${watch.threshold}% threshold`
    }. The table below the chart lists every batch.`;

    return (
        <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="kicker text-accent-600">Watch</div>
                    <h2 id={headingId} className="display-title mt-1 text-2xl text-zinc-900">
                        {watch.name}
                    </h2>
                    {setupLabel && (
                        <div className="mt-2">
                            <Badge size="xs">Setup: {setupLabel}</Badge>
                        </div>
                    )}
                    <p className="mt-2 text-xs text-zinc-600">
                        Baseline: <span className="font-medium text-zinc-900">{watch.ref?.name}</span> · {metricLabel} · flag drops of {watch.threshold}% or worse
                    </p>
                    {watch.atConc == null && refConcs.length > 1 && (
                        <p className="mt-1 text-micro text-zinc-500">
                            Peaks are compared over the concurrency levels the baseline includes ({levelsLabel(refConcs)}), so a point left out of the baseline can’t skew the result.
                        </p>
                    )}
                </div>
                <div className="flex gap-2">
                    <StatusChip
                        status={flagged.length ? 'misses_slo' : waiting ? 'waiting' : 'verified'}
                        label={flagged.length ? `${flagged.length} flagged` : waiting ? 'Waiting for the next batch' : 'No drops past threshold'}
                    />
                    <Button size="xs" variant="ghost" onClick={onDelete}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                    </Button>
                </div>
            </header>

            {fromFilters && configKey && (
                <Notice>
                    This watch was set up with filters, which compared different deployments with one baseline. It now follows only its baseline’s setup
                    {setupLabel ? ` (${setupLabel})` : ''}, so other deployments aren’t flagged.
                </Notice>
            )}

            {!ref ? (
                <EmptyState title="The baseline is gone" message="Its result was discarded or has no point at this concurrency. Delete this watch and create a new one." />
            ) : !configKey ? (
                <EmptyState title="This watch can’t tell which setup to follow" message="Its baseline runs aren’t loaded. Delete it and start a new watch from a sweep." />
            ) : series.length === 0 ? (
                <div className="rounded-3xl border border-zinc-200 bg-white">
                    <EmptyState icon={<Activity className="h-8 w-8" />} title="No batches yet" message="New runs of this setup join automatically." />
                </div>
            ) : (
                <>
                    {waiting ? (
                        <div className="rounded-3xl border border-zinc-200 bg-white">
                            <EmptyState icon={<Activity className="h-8 w-8" />} title="Waiting for the next batch" message={waitingMessage} />
                        </div>
                    ) : (
                        <ChartContainer
                            title="Change vs. baseline"
                            subtitle={`${series.length} batch${series.length === 1 ? '' : 'es'} · baseline ${fmtTput(ref.output)} tok/s${ref.conc != null ? ` at c=${ref.conc}` : ''}`}
                        >
                            <div style={{ height: 280 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart aria-label={`Change vs. baseline: ${metricLabel}`} desc={chartDesc} data={series} margin={{ top: 10, right: 40, bottom: 45, left: 60 }}>
                                        <CartesianGrid {...gridProps()} />
                                        <ChartXAxis type="number" dataKey="ts" domain={['dataMin', 'dataMax']} tickFormatter={fmtShortDay} label="Run date" scale="time" />
                                        <ChartYAxis type="number" dataKey="delta" domain={yAxis.domain} ticks={yAxis.ticks} tickFormatter={(v) => `${v}%`} label="Δ vs baseline (%)" />
                                        <ReferenceLine y={0} stroke={theme.tick} strokeDasharray="2 4" />
                                        <ReferenceLine
                                            y={watch.threshold}
                                            ifOverflow="extendDomain"
                                            stroke={CHART_STATUS.critical}
                                            strokeDasharray="6 4"
                                            label={{ value: `Threshold ${watch.threshold}%`, position: 'insideBottomRight', fill: theme.label, fontSize: 11 }}
                                        />
                                        <Tooltip cursor={cursorProps()} content={<WatchTooltip />} isAnimationActive={false} />
                                        <Line
                                            type="linear"
                                            dataKey="delta"
                                            stroke={seriesColor(0)}
                                            strokeWidth={2}
                                            isAnimationActive={false}
                                            dot={(props) => (
                                                <circle
                                                    key={props.payload.key}
                                                    cx={props.cx}
                                                    cy={props.cy}
                                                    r={props.payload.flagged ? 5 : 3.5}
                                                    fill={props.payload.flagged ? CHART_STATUS.critical : seriesColor(0)}
                                                    stroke={theme.surface}
                                                    strokeWidth={1.5}
                                                />
                                            )}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </ChartContainer>
                    )}
                    <div className="overflow-x-auto rounded-3xl border border-zinc-200 bg-white">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-zinc-200 bg-zinc-50/70">
                                <tr className="label-caps text-zinc-500">
                                    <th className="px-4 py-3 font-semibold">Date</th>
                                    <th className="px-4 py-3 font-semibold">Runs</th>
                                    <th className="px-4 py-3 text-right font-semibold">Output (tok/s)</th>
                                    <th className="px-4 py-3 text-right font-semibold">Baseline</th>
                                    <th className="px-4 py-3 text-right font-semibold">Change</th>
                                    <th className="px-4 py-3 font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {[...series].reverse().map((s) => (
                                    <tr key={s.key}>
                                        <td className="px-4 py-2.5 text-zinc-800">{fmtDay(s.ts)}</td>
                                        <td className="px-4 py-2.5">
                                            <button type="button" onClick={() => nav.openRun(s.runs[0].key)} className="text-left text-zinc-700 hover:text-accent-700 hover:underline">
                                                {s.setup || s.title}
                                            </button>
                                            <span className="ml-1 text-tiny text-zinc-500">· {s.runs.length} run{s.runs.length === 1 ? '' : 's'}</span>
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-900">
                                            {fmtTput(s.value)}
                                            {watch.atConc == null && s.conc != null && <span className="ml-1 font-sans text-tiny text-zinc-500">c={s.conc}</span>}
                                        </td>
                                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-zinc-600">{fmtTput(s.ref)}</td>
                                        <td className={cn('px-4 py-2.5 text-right font-mono tabular-nums', s.flagged ? 'font-semibold text-red-700' : 'text-zinc-700')}>{fmtPct(s.delta)}</td>
                                        <td className="px-4 py-2.5">
                                            <StatusChip
                                                status={s.flagged ? 'failed' : s.isRef ? 'waiting' : 'verified'}
                                                size="xs"
                                                label={s.flagged ? 'Flagged' : s.isRef ? 'Baseline batch' : 'OK'}
                                            />
                                            {s.missing?.length > 0 && <div className="mt-1 text-tiny text-amber-700">No {levelsLabel(s.missing)} in this batch</div>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
}

// ------------------------------------------------------------- report

// "models (a, b) and workloads (x, y)" for whatever differs across results.
function mixedSummary(curves) {
    const parts = [
        ['models', new Set(curves.map((c) => c.meta.model))],
        ['workloads', new Set(curves.map((c) => c.meta.workload || 'not recorded'))],
    ].filter(([, values]) => values.size > 1);
    return parts.map(([label, values]) => `${label} (${[...values].join(', ')})`).join(' and ');
}

const PRICE_SOURCE = { custom: 'Your Leaderboard rate', list: 'GCP list price' };

function ReportView({ showcase, copy, nav, onDelete, headingId }) {
    const ws = useWorkspace();
    const hintId = useId();
    const curves = showcase.curveIds.map((id) => ws.getCurve(id)).filter(Boolean);
    // Results that never recorded TTFT open on a metric they have, not an empty chart.
    const view = useChartView(curves.map((c) => c.points.filter((p) => p.included)));
    const { latency, stat, throughput } = view;
    // Rates saved on the Leaderboard, read once per report view.
    const customRates = useMemo(() => loadCustomPricingRates(), []);
    // An H100 hour and a TPU hour cost different amounts: one price per type.
    const accelTypes = [...new Set(curves.map((c) => accelTypeOf(c.meta.accelerator)))];
    const prices = { ...(showcase.prices || {}) };
    // Older reports kept one price for everything; reuse it only where it can't be wrong.
    if (showcase.price != null && !showcase.prices && accelTypes.length === 1) prices[accelTypes[0]] = showcase.price;
    // What you entered, else a starting price where Prism knows the accelerator.
    const priceOf = (type) => {
        const entered = prices[type] == null ? NaN : Number(prices[type]);
        if (Number.isFinite(entered) && entered > 0) return { price: entered, source: 'entered' };
        return listPrice(type, customRates) || { price: null, source: null };
    };
    const mixed = curves.length > 1 ? mixedSummary(curves) : '';
    // Price each result at a usable point by default: its peak can be an
    // overloaded one (a 53 s TTFT) that makes the hardware look cheaper.
    const priceAt = PRICE_AT_OPTIONS.some((o) => o.value === showcase.priceAt) ? showcase.priceAt : OPERATING_TTFT_MS;
    const atPeak = priceAt === 'peak';
    const limitLabel = atPeak ? 'Peak' : `TTFT ≤ ${priceAt / 1000} s`;

    const rows = curves.map((c, i) => {
        const type = accelTypeOf(c.meta.accelerator);
        const { price, source } = priceOf(type);
        const { point, reason, fastest } = pricingPoint(c.points.filter((p) => p.included), priceAt);
        // The count in the result's label: what people see, and may have corrected.
        const chips = chipsOf(c.meta);
        const cpm = costPerMillion(price, chips, point?.output);
        // Say why there's no price rather than fall back to an overloaded point.
        const unpriced =
            reason === 'over-limit'
                ? [`${nobreak('No point with')} ${nobreak(limitLabel)}`, fastest ? `Fastest:\u00a0${pointLabel(fastest)}` : '']
                : reason === 'no-ttft'
                  ? ['TTFT not recorded', 'Choose Peak to price its peak instead.']
                  : ['No points to price', ''];
        return { c, i, type, price, source, point, chips, cpm, unpriced };
    });

    const exportRows = rows.map((r) => ({
        ...r,
        status: resultStatusLabel(r.c.status, copy),
        sourceLabel: r.source === 'entered' ? 'Entered' : PRICE_SOURCE[r.source] || '',
        note: r.point ? '' : r.unpriced.filter(Boolean).join('. ').replace(/\u00a0/g, ' '),
    }));
    const csv = () =>
        toCsv(
            [
                { label: 'Result', get: (r) => r.c.name },
                { label: 'Status', get: (r) => r.status },
                { label: 'Accelerator', get: (r) => r.type },
                { label: 'Chips', get: (r) => r.chips },
                { label: 'Priced at concurrency', get: (r) => r.point?.conc },
                { label: 'TTFT (ms)', get: (r) => r.point?.ttft },
                { label: 'TTFT statistic', get: (r) => (r.point ? typicalStat(r.point, 'ttft') || 'not recorded' : '') },
                { label: 'Output (tok/s)', get: (r) => r.point?.output },
                { label: '$ per chip-hour', get: (r) => r.price },
                { label: 'Price source', get: (r) => r.sourceLabel },
                { label: '$ per 1M output tokens', get: (r) => r.cpm },
                { label: 'Tokens per $', get: (r) => (r.cpm != null ? 1e6 / r.cpm : null) },
                { label: 'Not priced because', get: (r) => r.note },
            ],
            exportRows
        );
    const markdown = [
        `**${showcase.name}** · cost at ${atPeak ? 'peak throughput' : limitLabel}`,
        mdTable(
            ['Result', 'Accelerator', 'Chips', atPeak ? 'Peak output (tok/s)' : 'Output (tok/s)', 'Priced at', '$ / chip-hour', '$ / 1M output tokens', 'Tokens per $'],
            exportRows.map((r) => [
                r.c.name,
                r.type,
                r.chips,
                fmtTput(r.point?.output),
                r.point ? pointLabel(r.point).replace(/\u00a0/g, ' ') : r.note,
                r.price ? `${fmtMoney(r.price)}${r.sourceLabel && r.source !== 'entered' ? ` (${r.sourceLabel})` : ''}` : '',
                r.cpm != null ? fmtMoney(r.cpm) : '',
                r.cpm != null ? fmtCount(1e6 / r.cpm) : '',
            ]),
            ['l', 'l', 'r', 'r', 'l', 'r', 'r', 'r']
        ),
        atPeak
            ? 'Each result is priced at its highest throughput, however slow that point is.'
            : `Each result is priced at its highest throughput with ${limitLabel} (TTFT is the p50 where the harness reported one, otherwise the mean).`,
        mixed ? `> **Not like-for-like:** these results use different ${mixed}.` : null,
    ]
        .filter(Boolean)
        .join('\n\n');

    return (
        <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="kicker text-accent-600">Report</div>
                    <h2 id={headingId} className="display-title mt-1 text-2xl text-zinc-900">
                        {showcase.name}
                    </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {curves.length > 0 && <ExportActions filename={`${fileSlug(showcase.name)}.csv`} csv={csv} markdown={markdown} />}
                    <Button size="xs" variant="ghost" onClick={onDelete}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                    </Button>
                </div>
            </header>

            {curves.length === 0 ? (
                <div className="rounded-3xl border border-zinc-200 bg-white">
                    <EmptyState icon={<LayoutDashboard className="h-8 w-8" />} title="No results yet" message={`Open an ${copy.publishedLabel} result and choose Add to report.`} />
                </div>
            ) : (
                <>
                    {mixed && (
                        <Notice tone="warning">
                            These results use different {mixed}, so throughput and cost per token aren’t a like-for-like comparison.
                        </Notice>
                    )}
                    <ChartContainer title="Throughput vs latency" actions={<MetricToggles view={view} />}>
                        <CurveChart
                            series={curves.map((c, i) => ({ id: c.id, name: c.name, color: seriesColor(i), points: seriesPoints(c.points.filter((p) => p.included), { latency, stat, throughput }) }))}
                            latency={latency}
                            stat={stat}
                            throughput={throughput}
                        />
                    </ChartContainer>
                    <Panel
                        variant="editorial"
                        padding="none"
                        title={atPeak ? 'Cost at peak throughput' : `Cost at ${limitLabel}`}
                        subtitle={`${
                            atPeak
                                ? 'Each result is priced at its highest throughput, however slow that point is.'
                                : `Each result is priced at its highest throughput with ${limitLabel} (the p50 where the harness reported one, otherwise the mean), so an overloaded point can’t make it look cheaper.`
                        } Prices start at your Leaderboard rate or the GCP list price where Prism knows the accelerator; enter what you pay to override. Your prices and this choice are saved with the report.`}
                        actions={
                            <div className="flex items-center gap-2">
                                <span className="text-micro text-zinc-500">Price at</span>
                                <ToggleGroup size="xs" aria-label="Price at" value={priceAt} onChange={(v) => ws.updateShowcase(showcase.id, { priceAt: v })} options={PRICE_AT_OPTIONS} />
                            </div>
                        }
                    >
                        <div className="flex flex-wrap gap-x-8 gap-y-3 border-b border-zinc-100 px-5 py-4">
                            {accelTypes.map((t, idx) => {
                                const start = listPrice(t, customRates);
                                const { source } = priceOf(t);
                                const startLabel = start ? (start.source === 'custom' ? 'your Leaderboard rate' : 'the GCP list price') : '';
                                return (
                                    <div key={t} className="space-y-1">
                                        <label className="flex items-center gap-2 text-xs text-zinc-600">
                                            <span className="font-medium text-zinc-900">{t}</span>$ per chip-hour
                                            <Input
                                                surface="light"
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                value={prices[t] ?? ''}
                                                placeholder={start ? start.price.toFixed(2) : 'e.g. 2.70'}
                                                aria-describedby={`${hintId}-${idx}`}
                                                onChange={(e) => ws.setReportPrice(showcase.id, t, e.target.value === '' ? null : Number(e.target.value))}
                                                className="w-24 py-1.5 text-right font-mono text-xs"
                                            />
                                        </label>
                                        <p id={`${hintId}-${idx}`} className="text-micro text-zinc-500">
                                            {source === 'entered'
                                                ? start
                                                    ? `Your price. Clear it to use ${startLabel} (${fmtMoney(start.price)}).`
                                                    : 'Your price.'
                                                : start
                                                  ? `${PRICE_SOURCE[start.source]} for ${start.name}`
                                                  : 'No list price for this accelerator. Enter yours.'}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="border-b border-zinc-200 bg-zinc-50/70">
                                    <tr className="label-caps text-zinc-500">
                                        <th className="px-5 py-3 font-semibold">Result</th>
                                        <th className="px-4 py-3 font-semibold">Accelerator</th>
                                        <th className="px-4 py-3 text-right font-semibold">Chips</th>
                                        <th className="px-4 py-3 text-right font-semibold">{atPeak ? 'Peak output (tok/s)' : 'Output (tok/s)'}</th>
                                        <th className="px-4 py-3 text-right font-semibold">$ / chip-hour</th>
                                        <th className="px-4 py-3 text-right font-semibold">$ / 1M output tokens</th>
                                        <th className="px-4 py-3 text-right font-semibold">Tokens per $</th>
                                        <th className="px-4 py-3">
                                            <span className="sr-only">Actions</span>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {rows.map(({ c, i, type, price, source, point, chips, cpm, unpriced }) => (
                                        <tr key={c.id}>
                                            <td className="px-5 py-3">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: seriesColor(i) }} aria-hidden="true" />
                                                    <button type="button" onClick={() => nav.openCurve(c.id)} className="text-left font-medium text-zinc-900 hover:text-accent-700">
                                                        {c.name}
                                                    </button>
                                                    <ResultStatusChip status={c.status} copy={copy} size="xs" />
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-zinc-700">{type}</td>
                                            <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700">{chips}</td>
                                            <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-900">{fmtTput(point?.output)}</td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="font-mono tabular-nums text-zinc-700">{price ? fmtMoney(price) : '—'}</div>
                                                {price && source !== 'entered' && <div className="mt-0.5 text-tiny text-zinc-500">{PRICE_SOURCE[source]}</div>}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {point ? (
                                                    <>
                                                        <div className="font-mono tabular-nums text-zinc-900">{cpm != null ? fmtMoney(cpm) : `Enter a ${type} price`}</div>
                                                        <div className="mt-0.5 text-tiny text-zinc-500">at {pointLabel(point)}</div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <div className="font-medium text-amber-700">{unpriced[0]}</div>
                                                        {unpriced[1] && <div className="mt-0.5 text-tiny text-zinc-500">{unpriced[1]}</div>}
                                                    </>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-mono tabular-nums text-zinc-700">{cpm != null ? fmtCount(1e6 / cpm) : '—'}</td>
                                            <td className="py-3 pl-2 pr-4 text-right">
                                                <button
                                                    type="button"
                                                    aria-label={`Remove ${c.name} from this report`}
                                                    title="Remove from report"
                                                    onClick={() => ws.removeFromShowcase(showcase.id, c.id)}
                                                    className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                                                >
                                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Panel>
                </>
            )}
        </div>
    );
}

// ------------------------------------------------------------- tab

export function DashboardsTab({ runs, runsByKey, copy, activeId, onSelect, nav, onNewWatch, onNewShowcase }) {
    const ws = useWorkspace();
    // The open watch or report's h2, which names the region it's shown in.
    const viewHeadingId = useId();
    const all = [...ws.watches.map((w) => ({ ...w, kind: 'watch' })), ...ws.showcases.map((s) => ({ ...s, kind: 'showcase' }))];
    const active = all.find((d) => d.id === activeId) || all[0] || null;

    const item = (d) => (
        <li key={d.id}>
            <button
                type="button"
                onClick={() => onSelect(d.id)}
                aria-current={active?.id === d.id ? 'true' : undefined}
                className={cn(
                    'w-full rounded-2xl px-3 py-2 text-left transition-colors',
                    active?.id === d.id ? 'bg-accent-50 text-accent-700' : 'text-zinc-700 hover:bg-zinc-50'
                )}
            >
                <span className="block truncate text-xs font-medium">{d.name}</span>
                <span className="block text-tiny text-zinc-500">
                    {d.kind === 'watch' ? 'Updates itself' : `${d.curveIds.length} result${d.curveIds.length === 1 ? '' : 's'}`}
                </span>
            </button>
        </li>
    );

    return (
        <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            {/* Picks which watch or report the region beside it shows. */}
            <nav aria-label="Watches and reports" className="space-y-5">
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <h2 className="kicker text-zinc-500">Watch</h2>
                        <Button size="xs" variant="ghost" aria-label="New watch" onClick={onNewWatch}>
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New
                        </Button>
                    </div>
                    {ws.watches.length ? (
                        <ul className="space-y-1">{all.filter((d) => d.kind === 'watch').map(item)}</ul>
                    ) : (
                        <p className="px-3 text-micro text-zinc-500">Follows one setup and flags drops against a baseline.</p>
                    )}
                </div>
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <h2 className="kicker text-zinc-500">Report</h2>
                        <Button size="xs" variant="ghost" aria-label="New report" onClick={onNewShowcase}>
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New
                        </Button>
                    </div>
                    {ws.showcases.length ? (
                        <ul className="space-y-1">{all.filter((d) => d.kind === 'showcase').map(item)}</ul>
                    ) : (
                        <p className="px-3 text-micro text-zinc-500">Hand-picked {copy.publishedLabel} results, with your own prices.</p>
                    )}
                </div>
            </nav>
            <section aria-labelledby={active ? viewHeadingId : undefined}>
                {!active ? (
                    <div className="rounded-3xl border border-zinc-200 bg-white">
                        <EmptyState
                            icon={<LayoutDashboard className="h-8 w-8" />}
                            title="No watches or reports yet"
                            message="A watch follows one setup and flags drops against a baseline. A report collects results to present, with your own prices."
                            action={
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button size="xs" variant="secondary" onClick={onNewWatch}>
                                        <Activity className="h-3.5 w-3.5" aria-hidden="true" /> New watch
                                    </Button>
                                    <Button size="xs" variant="ghost" onClick={onNewShowcase}>
                                        <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" /> New report
                                    </Button>
                                </div>
                            }
                        />
                    </div>
                ) : active.kind === 'watch' ? (
                    <WatchView key={active.id} watch={active} runs={runs} runsByKey={runsByKey} nav={nav} onDelete={() => ws.deleteWatch(active.id)} headingId={viewHeadingId} />
                ) : (
                    <ReportView key={active.id} showcase={active} copy={copy} nav={nav} onDelete={() => ws.deleteShowcase(active.id)} headingId={viewHeadingId} />
                )}
            </section>
        </div>
    );
}
