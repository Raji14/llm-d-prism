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

import React from 'react';
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, ZAxis } from 'recharts';
import {
    ChartLegend,
    ChartTooltip,
    ChartTooltipRow,
    ChartXAxis,
    ChartYAxis,
    CustomSeriesDot,
    Switch,
    ToggleGroup,
    cursorProps,
    getAxisConfig,
    getChartTheme,
    gridProps,
    seriesColor,
} from '../ui';
import { Notice } from './parts';
import { LATENCY_METRICS, LATENCY_STATS, THROUGHPUT_METRICS, fmtInt, latencyAxis, throughputMetric } from './catalog';

function PointTooltip({ active, payload, xLabel, yLabel }) {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    const subtitle = p.conc != null ? `Concurrency ${p.conc}` : p.idLabel ? `Run ${p.idLabel}` : undefined;
    return (
        <ChartTooltip title={p.seriesName} subtitle={subtitle}>
            <ChartTooltipRow color={p.color} label={xLabel} value={fmtInt(p.x)} />
            <ChartTooltipRow label={yLabel} value={fmtInt(p.y)} />
            {p.statUnknown && <div className="pt-1 text-tiny text-zinc-600">p50 or mean: not recorded</div>}
            {p.excluded && <div className="pt-1 text-tiny text-zinc-600">Excluded{p.reason ? `: ${p.reason}` : ''}</div>}
        </ChartTooltip>
    );
}

// What the chart shows, for its accessible description: "2 series: This
// result, 6 points, 1 excluded; Reference: v1, 5 points."
function describeSeries(series) {
    const points = (n) => `${n} point${n === 1 ? '' : 's'}`;
    const each = series.map((s) => [s.name, points(s.points.length), s.excluded?.length ? `${s.excluded.length} excluded` : null].filter(Boolean).join(', '));
    return `${series.length} series: ${each.join('; ')}. The table after the chart lists every point.`;
}

// Every plotted point as a table, for screen readers: the chart itself shows
// values only in its tooltip, on hover or with the arrow keys. Wrapped in an
// sr-only box so a wide table can't widen the page.
function PointsTable({ caption, series, xLabel, yLabel }) {
    const rows = series.flatMap((s) => [
        ...s.points.map((p, i) => ({ key: `${s.id}|p|${p.key ?? i}`, name: s.name, p })),
        ...(s.excluded || []).map((p, i) => ({ key: `${s.id}|x|${p.key ?? i}`, name: `${s.name} (excluded${p.reason ? `: ${p.reason}` : ''})`, p })),
    ]);
    return (
        <div className="sr-only">
            <table>
                <caption>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col">Series</th>
                        <th scope="col">Point</th>
                        <th scope="col">{xLabel}</th>
                        <th scope="col">{yLabel}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(({ key, name, p }) => (
                        <tr key={key}>
                            <td>{name}</td>
                            <td>{p.conc != null ? `c=${p.conc}` : p.idLabel ? `Run ${p.idLabel}` : '—'}</td>
                            <td>{fmtInt(p.x)}</td>
                            <td>{fmtInt(p.y)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Throughput (x) vs latency (y), one line per series, drawn as connected
// points in concurrency order. Baselines are dashed with a different marker
// shape, and excluded points stay visible as hollow, muted marks. The y axis
// names the statistic (`stat`: 'mean' | 'p50' | 'p99') it plots.
//
// series: [{ id, name, color?, shape?, lineStyle?: 'solid'|'dashed'|'dotted',
//            points: [{ x, y, conc, idLabel, statUnknown? }], excluded?: [{ x, y, conc, reason }] }]
export function CurveChart({ series, latency = 'ttft', stat = null, throughput = 'output', height = 340, showLegend = true, emptyMessage }) {
    const theme = getChartTheme();
    const resolved = series.map((s, i) => ({
        ...s,
        color: s.color || seriesColor(i),
        shape: s.shape || 'circle',
        lineStyle: s.lineStyle || 'solid',
    }));
    const all = resolved.flatMap((s) => [...s.points, ...(s.excluded || [])]);
    // Points saved before Prism kept each statistic show their typical value.
    // When that's every point, the axis can't name a statistic at all.
    const unknown = all.filter((p) => p.statUnknown).length;
    const xLabel = throughputMetric(throughput).axis;
    const yLabel = latencyAxis(latency, unknown && unknown === all.length ? null : stat);

    if (!all.length) {
        return (
            <div className="flex items-center justify-center rounded-2xl border border-dashed border-zinc-200 text-xs text-zinc-500" style={{ height }}>
                {emptyMessage || 'No points to plot for this metric.'}
            </div>
        );
    }

    const xCfg = getAxisConfig(all.map((p) => p.x), false, { includeZero: true });
    const yCfg = getAxisConfig(all.map((p) => p.y), false, { includeZero: true });
    // Recharts' keyboard layer makes the plot a focusable role="application",
    // so name it (aria-label, not an svg <title>, which would also pop a native
    // hover tooltip over the chart's own) and summarize it (svg <desc>).
    const chartTitle = `${xLabel} vs ${yLabel}`;

    return (
        <div>
            <div style={{ height }}>
                <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart aria-label={chartTitle} desc={describeSeries(resolved)} margin={{ top: 10, right: 24, bottom: 45, left: 60 }}>
                        <CartesianGrid {...gridProps()} />
                        <ChartXAxis type="number" dataKey="x" name={xLabel} domain={xCfg.domain} ticks={xCfg.ticks} label={xLabel} />
                        <ChartYAxis type="number" dataKey="y" name={yLabel} domain={yCfg.domain} ticks={yCfg.ticks} label={yLabel} />
                        <ZAxis range={[48, 48]} />
                        <Tooltip cursor={cursorProps()} content={<PointTooltip xLabel={xLabel} yLabel={yLabel} />} isAnimationActive={false} />
                        {resolved.map((s) => (
                            <Scatter
                                key={s.id}
                                name={s.name}
                                data={s.points.map((p) => ({ ...p, seriesName: s.name, color: s.color }))}
                                fill={s.color}
                                line={{
                                    strokeWidth: s.lineStyle === 'solid' ? 2 : 1.5,
                                    strokeDasharray: s.lineStyle === 'dashed' ? '6 4' : s.lineStyle === 'dotted' ? '2 4' : undefined,
                                }}
                                lineType="joint"
                                isAnimationActive={false}
                                shape={(props) => (
                                    <CustomSeriesDot {...props} r={4} shape={s.shape} stroke={s.color} fill={s.color} surfaceColor={theme.surface} />
                                )}
                            />
                        ))}
                        {resolved
                            .filter((s) => s.excluded?.length)
                            .map((s) => (
                                <Scatter
                                    key={`${s.id}-excluded`}
                                    name={`${s.name} · excluded`}
                                    data={s.excluded.map((p) => ({ ...p, seriesName: s.name, color: theme.muted, excluded: true }))}
                                    fill={theme.surface}
                                    stroke={theme.muted}
                                    strokeWidth={1.5}
                                    isAnimationActive={false}
                                    legendType="none"
                                />
                            ))}
                    </ScatterChart>
                </ResponsiveContainer>
            </div>
            {showLegend && (resolved.length > 1 || resolved.some((s) => s.excluded?.length)) && (
                <ChartLegend
                    className="mt-3 pl-14"
                    entries={[
                        ...resolved.map((s) => ({ key: s.id, label: s.name, color: s.color, shape: s.shape, lineStyle: s.lineStyle })),
                        ...(resolved.some((s) => s.excluded?.length)
                            ? [{ key: 'excluded', label: 'Excluded point', color: theme.muted, variant: 'outline' }]
                            : []),
                    ]}
                />
            )}
            {unknown > 0 && (
                <Notice className="mt-3">
                    {unknown === 1 ? '1 point was' : `${unknown} points were`} saved before Prism recorded which statistic each latency is, so{' '}
                    {unknown === 1 ? 'it shows' : 'they show'} the p50 where the harness reported one, otherwise the mean.
                </Notice>
            )}
            <PointsTable caption={`Chart data: ${chartTitle}`} series={resolved} xLabel={xLabel} yLabel={yLabel} />
        </div>
    );
}

// Charts open on a latency the data recorded, in this order. Some archive runs
// have no TTFT, and opening on it showed an empty chart.
const DEFAULT_LATENCY_ORDER = ['ttft', 'tpot', 'e2e', 'itl'];

// `available` comes from availableMetrics(). Falls back to TTFT when nothing
// was recorded, so the chart shows its empty message.
// eslint-disable-next-line react-refresh/only-export-components -- pure helper the charts' callers share; edits here just reload the page
export function defaultLatency(available) {
    return DEFAULT_LATENCY_ORDER.find((m) => available?.latency?.has(m)) || 'ttft';
}

const perChipKey = (base, perChip) => THROUGHPUT_METRICS.find((m) => m.base === base && Boolean(m.perChip) === perChip)?.value || base;

// Latency (TTFT | TPOT | ITL | E2E), statistic (Mean | P50 | P99) and
// throughput (Output | Total, optionally per chip) pickers for a chart's
// `view` (useChartView). Choices nobody recorded are disabled, not hidden.
export function MetricToggles({ view }) {
    const { latency, stat, throughput, available } = view;
    const tp = throughputMetric(throughput);
    const stats = available?.stats?.[latency];
    const has = (key) => !available || available.throughput.has(key);
    return (
        <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
                size="xs"
                aria-label="Latency metric"
                value={latency}
                onChange={view.setLatency}
                options={LATENCY_METRICS.map((m) => ({ value: m.value, label: m.label, disabled: available ? !available.latency.has(m.value) : false }))}
            />
            <ToggleGroup
                size="xs"
                aria-label="Latency statistic"
                value={stat}
                onChange={view.setStat}
                options={LATENCY_STATS.map((s) => ({ value: s.value, label: s.label, disabled: stats ? !stats.has(s.value) : false }))}
            />
            <ToggleGroup
                size="xs"
                aria-label="Throughput metric"
                value={tp.base}
                onChange={(base) => view.setThroughput(perChipKey(base, Boolean(tp.perChip)))}
                options={['output', 'total'].map((base) => ({ value: base, label: throughputMetric(base).label, disabled: !has(base) }))}
            />
            <Switch
                checked={Boolean(tp.perChip)}
                onChange={(on) => view.setThroughput(perChipKey(tp.base, on))}
                disabled={!tp.perChip && !has(perChipKey(tp.base, true))}
                label="Per chip"
                title="Divide throughput by the accelerator count in the hardware label"
            />
        </div>
    );
}

// Plain-SVG thumbnail of a curve (throughput vs latency) for rows and cards.
// Latency is TTFT where recorded, so a run without it isn't a blank thumbnail.
export function Sparkline({ points, width = 96, height = 32, colorIndex = 0, className }) {
    // The typical value (p50 or mean): a thumbnail doesn't pick a statistic.
    const lat = defaultLatency({ latency: new Set(DEFAULT_LATENCY_ORDER.filter((m) => points.some((p) => Number.isFinite(p[m])))) });
    const usable = points.filter((p) => Number.isFinite(p.output) && Number.isFinite(p[lat]));
    if (usable.length < 2) {
        return (
            <svg width={width} height={height} className={className} aria-hidden="true">
                {usable.length === 1 && <circle cx={width / 2} cy={height / 2} r={3.5} fill={seriesColor(colorIndex)} />}
            </svg>
        );
    }
    const xs = usable.map((p) => p.output);
    const ys = usable.map((p) => p[lat]);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
    const pad = 3;
    const sx = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (width - pad * 2);
    const sy = (v) => height - pad - ((v - y0) / (y1 - y0 || 1)) * (height - pad * 2);
    const path = usable.map((p) => `${sx(p.output).toFixed(1)},${sy(p[lat]).toFixed(1)}`).join(' ');
    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
            <polyline points={path} fill="none" stroke={seriesColor(colorIndex)} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
            {usable.map((p) => (
                <circle key={p.key} cx={sx(p.output)} cy={sy(p[lat])} r={1.75} fill={seriesColor(colorIndex)} />
            ))}
        </svg>
    );
}
