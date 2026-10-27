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
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../Button';

// Prism 2.0 unified chart panel shell — shared across Well-Lit Path dashboards,
// Leaderboard Pareto frontier, and Regression telemetry charts.
//
// Supports both:
// 1. Structured Well-Lit shell (when kicker, metaPills, filters, onToggleFilters, or footer are provided)
// 2. Simple padded card shell (when only title/subtitle/actions/children are provided)
export function ChartContainer({
    kicker,
    title,
    subtitle,
    metaPills,
    actions,
    showFilters,
    onToggleFilters,
    filterToggleLabel = 'Filters',
    filters,
    banner,
    footer,
    canvasRef,
    canvasClassName,
    className,
    children,
}) {
    const isStructuredShell = Boolean(
        kicker || metaPills || filters || onToggleFilters || footer || banner
    );

    if (!isStructuredShell) {
        return (
            <div
                className={cn(
                    'surface-light bg-white border border-zinc-200 rounded-3xl p-5 sm:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all',
                    className
                )}
            >
                {(title || actions) && (
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                        <div className="min-w-0">
                            {title && (
                                <h3 className="text-base font-semibold tracking-tight text-zinc-900">
                                    {title}
                                </h3>
                            )}
                            {subtitle && <p className="text-xs text-zinc-700 mt-0.5">{subtitle}</p>}
                        </div>
                        {actions && (
                            // min-w-0, not shrink-0: in a narrow card the controls wrap inside it instead of running past its edge.
                            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
                                {actions}
                            </div>
                        )}
                    </div>
                )}
                {children}
            </div>
        );
    }

    return (
        <div
            className={cn(
                'surface-light rounded-3xl border border-zinc-200 bg-white flex flex-col w-full overflow-hidden relative shadow-[0_1px_2px_rgba(15,23,42,0.03)]',
                className
            )}
        >
            {/* Header Band */}
            <div className="px-5 sm:px-7 py-4 border-b border-zinc-200 bg-zinc-50/75 flex flex-wrap justify-between items-start gap-4">
                <div className="flex flex-col gap-1.5 min-w-0">
                    <div>
                        {kicker && (
                            <span className="kicker block text-accent-600 mb-0.5">
                                {kicker}
                            </span>
                        )}
                        {title && (
                            <h3 className="text-zinc-900 text-base sm:text-lg font-semibold tracking-tight">
                                {title}
                            </h3>
                        )}
                        {subtitle && (
                            <p className="text-xs text-zinc-700 mt-0.5">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {metaPills && (
                        <div className="flex flex-wrap items-center gap-2 pt-0.5 text-micro">
                            {metaPills}
                        </div>
                    )}
                </div>

                {(actions || onToggleFilters) && (
                    <div className="flex items-center gap-2 shrink-0">
                        {actions}
                        {onToggleFilters && (
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={onToggleFilters}
                                aria-expanded={Boolean(showFilters)}
                                className={cn(
                                    'flex items-center gap-1.5 cursor-pointer transition-colors',
                                    showFilters && 'bg-accent-50 border-accent-200 text-accent-800'
                                )}
                            >
                                <span>{filterToggleLabel}</span>
                                {showFilters ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-accent-700" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-zinc-700" />
                                )}
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* Collapsible Filter Bar */}
            {showFilters && filters && (
                <div className="bg-zinc-100/70 border-b border-zinc-200 px-5 sm:px-7 py-3 flex flex-col gap-2.5 w-full">
                    {filters}
                </div>
            )}

            {/* Optional Contextual Banner */}
            {banner}

            {/* Plot Canvas */}
            <div
                ref={canvasRef}
                className={cn(
                    'w-full relative px-3 sm:px-5 py-4 bg-white overflow-visible',
                    canvasClassName
                )}
            >
                {children}
            </div>

            {/* Bottom Legend & Encoding Footer */}
            {footer && (
                <div className="px-5 sm:px-7 py-3 border-t border-zinc-200 bg-zinc-50/75 flex flex-wrap items-center justify-between gap-4 text-xs">
                    {footer}
                </div>
            )}
        </div>
    );
}

export function ChartFilterRow({ children, className }) {
    return (
        <div
            className={cn(
                'flex flex-wrap items-center justify-between gap-3 w-full',
                className
            )}
        >
            {children}
        </div>
    );
}

export function ChartFilterGroup({ label, children, className, title }) {
    return (
        <div className={cn('flex items-center gap-1.5 shrink-0 min-w-0', className)} title={title}>
            {label && (
                <span className="label-caps text-zinc-700 shrink-0">
                    {label}
                </span>
            )}
            {children}
        </div>
    );
}

export function ChartCapControl({
    label = 'Cap:',
    value,
    min = 100,
    max = 5000,
    step = 100,
    unit = 'ms',
    isAuto = false,
    onAutoToggle,
    onChange,
    className,
}) {
    return (
        <div
            className={cn(
                'surface-light inline-flex items-center gap-2 bg-white border border-zinc-200 rounded-full px-2.5 py-0.5 shrink-0',
                className
            )}
        >
            <span className="label-caps text-zinc-700">{label}</span>
            {onAutoToggle && (
                <button
                    type="button"
                    aria-pressed={isAuto}
                    onClick={onAutoToggle}
                    className={cn(
                        'px-2 py-0.5 text-micro font-medium rounded-full transition-colors cursor-pointer',
                        isAuto
                            ? 'bg-accent-600 text-white shadow-xs'
                            : 'text-zinc-700 hover:text-zinc-900'
                    )}
                >
                    Auto
                </button>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                aria-label={`${label} slider`}
                className="w-20 sm:w-24 h-1 bg-zinc-200 rounded-lg appearance-none cursor-pointer accent-accent-600"
            />
            <span className="text-micro font-semibold text-zinc-900 tabular-nums min-w-[3.25rem] text-right">
                {value}
                <span className="text-zinc-600 font-normal ml-0.5">{unit}</span>
            </span>
        </div>
    );
}
