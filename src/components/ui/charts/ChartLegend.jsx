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
import { cn } from '../../../utils/cn';

// Swatch legend for multi-series charts. Required whenever a chart renders
// ≥2 series (see skills/style.md); single-series charts are named by their
// title and need none. entries: [{ label, color, variant? }]
// variant 'outline' renders a ring swatch — use it for point *state* encodings
// (e.g. "on frontier", "selected") that are drawn as strokes, not fills.
const SERIES_SHAPES = ['circle', 'diamond', 'triangle', 'square'];

export function getSeriesShape(index = 0) {
    return SERIES_SHAPES[Math.abs(index) % SERIES_SHAPES.length];
}

export function SeriesMarkerSvg({ shape = 'circle', color, size = 11, opacity = 1, className }) {
    const half = size / 2;
    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className={cn('shrink-0', className)}
            style={{ opacity }}
            aria-hidden="true"
        >
            {shape === 'diamond' && (
                <polygon
                    points={`${half},0.8 ${size - 0.8},${half} ${half},${size - 0.8} 0.8,${half}`}
                    fill={color}
                />
            )}
            {shape === 'circle' && (
                <circle cx={half} cy={half} r={half - 1} fill={color} />
            )}
            {shape === 'triangle' && (
                <polygon
                    points={`${half},1 ${size - 0.8},${size - 1} 0.8,${size - 1}`}
                    fill={color}
                />
            )}
            {shape === 'square' && (
                <rect
                    x={1.2}
                    y={1.2}
                    width={size - 2.4}
                    height={size - 2.4}
                    rx={1.5}
                    fill={color}
                />
            )}
        </svg>
    );
}

// Recharts custom dot with redundant shape encoding for WCAG 1.4.1 CVD accessibility
export function CustomSeriesDot({
    cx,
    cy,
    stroke,
    fill,
    r = 4,
    shape = 'circle',
    surfaceColor = '#ffffff',
    strokeWidth = 1.5,
}) {
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
    const dotFill = fill && fill !== '#fff' && fill !== '#ffffff' ? fill : stroke;
    return (
        <g aria-hidden="true">
            {shape === 'diamond' && (
                <polygon
                    points={`${cx},${cy - r * 1.25} ${cx + r * 1.25},${cy} ${cx},${cy + r * 1.25} ${cx - r * 1.25},${cy}`}
                    fill={dotFill}
                    stroke={surfaceColor}
                    strokeWidth={strokeWidth}
                />
            )}
            {shape === 'circle' && (
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={dotFill}
                    stroke={surfaceColor}
                    strokeWidth={strokeWidth}
                />
            )}
            {shape === 'triangle' && (
                <polygon
                    points={`${cx},${cy - r * 1.2} ${cx + r * 1.15},${cy + r * 0.95} ${cx - r * 1.15},${cy + r * 0.95}`}
                    fill={dotFill}
                    stroke={surfaceColor}
                    strokeWidth={strokeWidth}
                />
            )}
            {shape === 'square' && (
                <rect
                    x={cx - r * 0.95}
                    y={cy - r * 0.95}
                    width={r * 1.9}
                    height={r * 1.9}
                    rx={1.5}
                    fill={dotFill}
                    stroke={surfaceColor}
                    strokeWidth={strokeWidth}
                />
            )}
        </g>
    );
}

export function SeriesLineSwatch({
    color,
    shape = 'circle',
    lineStyle,
    variant,
    opacity = 1,
    width = 40,
    className,
}) {
    const resolvedStyle = lineStyle || variant || 'solid';
    const height = 12;
    const cx = width / 2;
    const cy = height / 2;
    const r = 3.2;
    const strokeW = resolvedStyle === 'solid' ? 2.5 : 2;
    const dashArray =
        resolvedStyle === 'dashed' ? '5 3' : resolvedStyle === 'dotted' ? '2 2.5' : undefined;

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className={cn('shrink-0', className)}
            style={{ opacity }}
            aria-hidden="true"
        >
            <line
                x1={0}
                y1={cy}
                x2={cx - 5.5}
                y2={cy}
                stroke={color}
                strokeWidth={strokeW}
                strokeDasharray={dashArray}
                strokeLinecap="butt"
            />
            <line
                x1={cx + 5.5}
                y1={cy}
                x2={width}
                y2={cy}
                stroke={color}
                strokeWidth={strokeW}
                strokeDasharray={dashArray}
                strokeLinecap="butt"
            />
            {shape === 'diamond' && (
                <polygon
                    points={`${cx},${cy - r * 1.25} ${cx + r * 1.25},${cy} ${cx},${cy + r * 1.25} ${cx - r * 1.25},${cy}`}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1}
                />
            )}
            {shape === 'circle' && (
                <circle
                    cx={cx}
                    cy={cy}
                    r={r}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1}
                />
            )}
            {shape === 'triangle' && (
                <polygon
                    points={`${cx},${cy - r * 1.2} ${cx + r * 1.15},${cy + r * 0.95} ${cx - r * 1.15},${cy + r * 0.95}`}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1}
                />
            )}
            {shape === 'square' && (
                <rect
                    x={cx - r * 0.95}
                    y={cy - r * 0.95}
                    width={r * 1.9}
                    height={r * 1.9}
                    rx={1.2}
                    fill={color}
                    stroke="#ffffff"
                    strokeWidth={1}
                />
            )}
        </svg>
    );
}

export function ChartLegend({ entries, items, className }) {
    const list = entries ?? items ?? [];
    return (
        <div className={cn('flex items-center gap-5 flex-wrap', className)}>
            {list.map((e) => (
                <span
                    key={e.key || e.label}
                    className={cn(
                        'inline-flex items-center gap-2 text-xs text-zinc-700 font-medium',
                        e.muted && 'opacity-40'
                    )}
                >
                    {e.variant === 'outline' ? (
                        <span
                            className="w-3 h-3 rounded-full shrink-0 bg-white"
                            style={{ boxShadow: `inset 0 0 0 1.75px ${e.color}` }}
                            aria-hidden="true"
                        />
                    ) : (
                        <SeriesLineSwatch
                            color={e.color}
                            shape={e.shape || 'circle'}
                            lineStyle={e.lineStyle || 'solid'}
                            opacity={e.opacity ?? 1}
                        />
                    )}
                    <span>{e.label}</span>
                </span>
            ))}
        </div>
    );
}

const PERCENTILE_META = {
    Mean: { id: 'Mean', label: 'Mean', lineStyle: 'solid', barOpacity: 1 },
    P50: { id: 'P50', label: 'P50', lineStyle: 'solid', barOpacity: 1 },
    P90: { id: 'P90', label: 'P90', lineStyle: 'dashed', barOpacity: 0.65 },
    P99: { id: 'P99', label: 'P99', lineStyle: 'dotted', barOpacity: 0.4 },
};

// Explicit series × percentile legend so every series displays its P50, P90, P99
// (or Mean, P90) line+marker swatches in its own color.
export function SeriesPercentileLegend({
    series = [],
    percentiles = ['P50', 'P90', 'P99'],
    activePercentiles,
    onTogglePercentile,
    className,
}) {
    const resolvedActive = activePercentiles ?? percentiles;
    const useGrid = series.length > 3;

    return (
        <div
            className={cn(
                useGrid
                    ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-2 w-full'
                    : 'flex flex-col items-start gap-2 w-full',
                className
            )}
        >
            {series.map((s) => (
                <div
                    key={s.key || s.label}
                    className="flex flex-wrap items-center gap-x-6 gap-y-1.5"
                >
                    {percentiles.map((p) => {
                        const meta = PERCENTILE_META[p] || {
                            id: p,
                            label: p,
                            lineStyle: 'solid',
                            barOpacity: 1,
                        };
                        const isActive =
                            !resolvedActive ||
                            resolvedActive.includes(p) ||
                            resolvedActive.includes(p.toLowerCase());
                        const Tag = onTogglePercentile ? 'button' : 'span';

                        return (
                            <Tag
                                key={`${s.key || s.label}-${p}`}
                                type={onTogglePercentile ? 'button' : undefined}
                                onClick={
                                    onTogglePercentile ? () => onTogglePercentile(p) : undefined
                                }
                                className={cn(
                                    'inline-flex items-center gap-2 text-xs text-zinc-700 font-medium transition-opacity',
                                    onTogglePercentile && 'cursor-pointer hover:text-zinc-950',
                                    !isActive && 'opacity-35'
                                )}
                            >
                                <SeriesLineSwatch
                                    color={s.color}
                                    shape={s.shape || 'circle'}
                                    lineStyle={meta.lineStyle}
                                />
                                <span>
                                    {s.label}{' '}
                                    <span className="font-semibold text-zinc-900">
                                        ({meta.label})
                                    </span>
                                </span>
                            </Tag>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}

export function PercentileLegendKey({
    mode = 'line',
    items,
    percentiles,
    activeIds,
    swatchColor,
    className,
}) {
    const resolvedActiveIds = activeIds ?? percentiles;
    const defaultItems =
        percentiles && percentiles.includes('Mean')
            ? [
                  { id: 'Mean', label: 'Mean', style: 'solid', opacity: 1 },
                  { id: 'P90', label: 'P90', style: 'dashed', opacity: 0.55 },
              ]
            : [
                  { id: 'P50', label: 'P50', style: 'solid', opacity: 1 },
                  { id: 'P90', label: 'P90', style: 'dashed', opacity: 0.6 },
                  { id: 'P99', label: 'P99', style: 'dotted', opacity: 0.35 },
              ];
    const resolvedItems = items ?? defaultItems;
    return (
        <div className={cn('flex items-center gap-3.5 flex-wrap', className)}>
            {resolvedItems.map((item) => {
                const isActive = !resolvedActiveIds || resolvedActiveIds.includes(item.id);
                return (
                    <span
                        key={item.id}
                        className={cn(
                            'inline-flex items-center gap-1.5 text-micro text-zinc-800 font-medium transition-opacity',
                            !isActive && 'opacity-35'
                        )}
                    >
                        {mode === 'bar' ? (
                            <span
                                className="w-3 h-3 rounded-sm shrink-0"
                                style={{
                                    backgroundColor: swatchColor || 'var(--chart-axis)',
                                    opacity: item.opacity ?? 1,
                                }}
                                aria-hidden="true"
                            />
                        ) : (
                            <span className="w-5 h-3 inline-flex items-center shrink-0" aria-hidden="true">
                                <span
                                    className={cn(
                                        'w-full h-0 border-t-2 border-zinc-700',
                                        item.style === 'dashed' && 'border-dashed',
                                        item.style === 'dotted' && 'border-dotted'
                                    )}
                                />
                            </span>
                        )}
                        <span className="font-mono text-zinc-800 font-semibold">{item.label}</span>
                    </span>
                );
            })}
        </div>
    );
}
