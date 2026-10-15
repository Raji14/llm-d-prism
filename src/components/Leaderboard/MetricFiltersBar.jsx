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

import React, { useState, useMemo } from 'react';
import {
    Search,
    DollarSign,
    RotateCcw,
    Timer,
    Clock,
    X,
    SlidersHorizontal,
    ChevronDown,
    Code2,
    Sparkles
} from 'lucide-react';
import { cn } from '../../utils/cn';
import { PERCENTILES, DEFAULT_SLA_PERCENTILE, parseQueryTokens, workloadFor } from '../../utils/leaderboardFacets.js';

const SEARCH_SYNTAX_CHIPS = [
    { label: 'stack:llm-d', query: 'stack:llm-d' },
    { label: 'hw:h100', query: 'hw:h100' },
    { label: 'status:verified', query: 'status:verified' },
    { label: 'quant:fp8', query: 'quant:fp8' },
    { label: 'tp:8', query: 'tp:8' },
];

const FALLBACK_INTERACTIVE_SLO = {
    percentile: 'p90',
    ttft: 100,
    tpot: 25,
    label: 'Interactive',
};

// Secondary controls docked directly below LeaderboardAsk: free-text + property:value
// + regex search, SLO latency operating-point selector, and cloud pricing overrides.
export default function MetricFiltersBar({
    searchQuery,
    setSearchQuery,
    onRemoveQueryToken,
    selectedWorkload = 'all',
    isScoped = false,
    maxTtftSla = null,
    setMaxTtftSla,
    maxTpotSla = null,
    setMaxTpotSla,
    slaPercentile = DEFAULT_SLA_PERCENTILE,
    setSlaPercentile,
    onOpenPricingModal,
    onResetFilters,
    hasCustomPricing = false
}) {
    const [showSlaControls, setShowSlaControls] = useState(false);
    const [showSyntaxHelp, setShowSyntaxHelp] = useState(false);

    const activeWorkload = useMemo(() => workloadFor(selectedWorkload), [selectedWorkload]);
    const defaultSlo = useMemo(() => {
        if (activeWorkload?.defaultSlo) {
            return { ...activeWorkload.defaultSlo, label: activeWorkload.label };
        }
        return FALLBACK_INTERACTIVE_SLO;
    }, [activeWorkload]);

    const isSlaActive = (maxTtftSla !== null && maxTtftSla > 0) || (maxTpotSla !== null && maxTpotSla > 0);
    const isFiltered = isScoped || searchQuery.trim() !== '' || isSlaActive;
    const hasStructuredOrRegex = /(?:^|\s)(model|hardware|hw|gpu|tpu|acc|stack|engine|workload|quant|tp|author|contributor|status):|^\/.+\/[gimsuy]*$|[|^*+?[\]()]/.test(searchQuery.trim());

    const activeTokens = useMemo(() => parseQueryTokens(searchQuery), [searchQuery]);
    const activePercentileLabel = PERCENTILES.find((p) => p.value === slaPercentile)?.label || 'P90';

    const sloButtonLabel = useMemo(() => {
        if (!isSlaActive) return 'Latency SLO: Any (peak)';
        const parts = [];
        if (maxTtftSla !== null && maxTtftSla > 0) parts.push(`TTFT ≤${maxTtftSla}ms`);
        if (maxTpotSla !== null && maxTpotSla > 0) parts.push(`TPOT ≤${maxTpotSla}ms`);
        return `SLO (${activePercentileLabel}): ${parts.join(' · ')}`;
    }, [isSlaActive, activePercentileLabel, maxTtftSla, maxTpotSla]);

    const TTFT_PRESETS = [
        { label: 'Any', value: null },
        { label: '≤ 50ms', value: 50 },
        { label: '≤ 100ms', value: 100 },
        { label: '≤ 250ms', value: 250 },
        { label: '≤ 500ms', value: 500 }
    ];

    const TPOT_PRESETS = [
        { label: 'Any', value: null },
        { label: '≤ 15ms', value: 15 },
        { label: '≤ 25ms', value: 25 },
        { label: '≤ 40ms', value: 40 },
        { label: '≤ 60ms', value: 60 }
    ];

    const handleApplyWorkloadSlo = () => {
        if (!defaultSlo) return;
        if (setSlaPercentile && defaultSlo.percentile) setSlaPercentile(defaultSlo.percentile);
        if (setMaxTtftSla) setMaxTtftSla(defaultSlo.ttft ?? null);
        if (setMaxTpotSla) setMaxTpotSla(defaultSlo.tpot ?? null);
    };

    const handleClearSlo = () => {
        if (setMaxTtftSla) setMaxTtftSla(null);
        if (setMaxTpotSla) setMaxTpotSla(null);
    };

    const handleToggleSyntaxChip = (chipQuery) => {
        const current = searchQuery.trim();
        if (current === chipQuery) {
            setSearchQuery('');
        } else if (!current) {
            setSearchQuery(chipQuery);
        } else if (current.includes(chipQuery)) {
            setSearchQuery(current.replace(chipQuery, '').replace(/\s+/g, ' ').trim());
        } else {
            setSearchQuery(`${current} ${chipQuery}`);
        }
    };

    const handleRemoveToken = (rawToken) => {
        if (onRemoveQueryToken) {
            onRemoveQueryToken(rawToken);
        } else {
            setSearchQuery(
                activeTokens
                    .filter((t) => t.raw !== rawToken)
                    .map((t) => t.raw)
                    .join(' ')
            );
        }
    };

    const handleCustomTtftChange = (e) => {
        if (!setMaxTtftSla) return;
        const val = e.target.value;
        if (val === '') {
            setMaxTtftSla(null);
            return;
        }
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) {
            setMaxTtftSla(Math.min(10000, Math.round(num)));
        }
    };

    const handleCustomTpotChange = (e) => {
        if (!setMaxTpotSla) return;
        const val = e.target.value;
        if (val === '') {
            setMaxTpotSla(null);
            return;
        }
        const num = Number(val);
        if (Number.isFinite(num) && num > 0) {
            setMaxTpotSla(Math.min(5000, Math.round(num)));
        }
    };

    return (
        <div className="surface-light rounded-b-2xl border-x border-b border-zinc-200/90 bg-zinc-100/70 px-3.5 py-2 space-y-2">
            {/* Primary Filter & Operating Point Row — fixed height so controls never jump */}
            <div className="flex flex-wrap items-center gap-2 text-xs min-h-[34px]">
                {/* Search Bar with property:value & regex support */}
                <div className="relative flex-1 min-w-[220px] max-sm:basis-full">
                    <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter by text, regex, or key:value (e.g. stack:llm-d hw:h100 status:verified)..."
                        aria-label="Filter leaderboard by text, property:value, or regular expression"
                        className="w-full pl-9 pr-20 py-1.5 bg-white border border-zinc-200 rounded-full text-xs text-zinc-900 placeholder-zinc-500 focus:outline-none focus:border-accent-400 focus:ring-2 focus:ring-accent-500/15 transition-all font-sans"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        {hasStructuredOrRegex && (
                            <span
                                className="px-1.5 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200 font-mono text-tiny font-medium"
                                title="Property or regular-expression filter active"
                            >
                                query
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowSyntaxHelp(!showSyntaxHelp)}
                            className={cn(
                                'p-1 rounded-full transition-colors cursor-pointer',
                                showSyntaxHelp ? 'bg-zinc-200 text-zinc-900' : 'text-zinc-500 hover:text-zinc-800'
                            )}
                            title="Toggle search syntax examples (stack:, hw:, status:, quant:, tp:, regex)"
                            aria-label="Toggle search syntax examples"
                        >
                            <Code2 className="w-3.5 h-3.5" />
                        </button>
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                className="p-0.5 text-zinc-500 hover:text-zinc-800 cursor-pointer"
                                aria-label="Clear search query"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Latency SLO Operating Point Selector */}
                <button
                    type="button"
                    onClick={() => setShowSlaControls(!showSlaControls)}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer shrink-0',
                        isSlaActive
                            ? 'bg-accent-50 text-accent-800 border-accent-300 font-semibold'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:text-zinc-900 hover:border-zinc-300'
                    )}
                    title="Set TTFT / TPOT latency SLO to evaluate each run's optimal concurrency operating point"
                >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-accent-600" />
                    <span className="font-mono text-micro">{sloButtonLabel}</span>
                    <ChevronDown className={cn('w-3 h-3 transition-transform', showSlaControls && 'rotate-180')} />
                </button>

                {/* Stable SLO Preset / Clear Slot: swaps in-place without adding/removing a vertical row */}
                {isSlaActive ? (
                    <button
                        type="button"
                        onClick={handleClearSlo}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-accent-200 bg-white hover:bg-accent-50 text-micro font-mono font-semibold text-accent-800 transition-colors cursor-pointer shrink-0"
                        title="Clear active latency SLO constraint"
                    >
                        <span>Clear SLO</span>
                        <X className="w-3 h-3 text-accent-600" />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={handleApplyWorkloadSlo}
                        className="hidden md:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-dashed border-accent-300 bg-white/80 hover:bg-accent-50/70 text-micro font-mono font-medium text-accent-800 transition-colors cursor-pointer shrink-0"
                        title={`Apply recommended ${defaultSlo.label} SLO (${defaultSlo.percentile.toUpperCase()} TTFT ≤ ${defaultSlo.ttft}ms, TPOT ≤ ${defaultSlo.tpot}ms)`}
                    >
                        <Sparkles className="w-3 h-3 text-accent-600" />
                        <span>{defaultSlo.label} SLO ({defaultSlo.percentile.toUpperCase()} ≤{defaultSlo.ttft}ms / ≤{defaultSlo.tpot}ms)</span>
                    </button>
                )}

                {/* Pricing Rates Modal Button */}
                {onOpenPricingModal && (
                    <button
                        type="button"
                        onClick={onOpenPricingModal}
                        className={cn(
                            'flex items-center gap-1.5 py-1.5 px-3 rounded-full border text-xs font-medium transition-all cursor-pointer shrink-0',
                            hasCustomPricing
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold'
                                : 'bg-white border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:border-zinc-300'
                        )}
                        title="Customize GCP GPU/TPU hourly pricing rates and CUD discount presets"
                    >
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Pricing</span>
                        {hasCustomPricing && (
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        )}
                    </button>
                )}

                {/* Always-present Reset Button so neighboring buttons never shift horizontally */}
                {onResetFilters && (
                    <button
                        type="button"
                        onClick={onResetFilters}
                        disabled={!isFiltered}
                        className={cn(
                            'flex items-center gap-1 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors shrink-0',
                            isFiltered
                                ? 'bg-white hover:bg-zinc-50 border-zinc-200 text-zinc-700 cursor-pointer'
                                : 'bg-zinc-100/60 border-zinc-200/60 text-zinc-400 cursor-not-allowed'
                        )}
                        title="Reset all active filters and SLO limits"
                    >
                        <RotateCcw className="w-3 h-3" />
                        <span>Reset</span>
                    </button>
                )}
            </div>

            {/* Active Search Query Token Chips (only when user types search tokens) */}
            {activeTokens.length > 0 && (
                <div className="pt-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-micro text-zinc-600 font-semibold">
                        Search filters:
                    </span>
                    {activeTokens.map((token, idx) => (
                        <button
                            key={`${token.raw}-${idx}`}
                            type="button"
                            onClick={() => handleRemoveToken(token.raw)}
                            className="inline-flex items-center gap-1 rounded-full bg-white border border-zinc-200 px-2.5 py-0.5 font-mono text-micro font-medium text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                            title={`Remove filter "${token.raw}"`}
                        >
                            <span>{token.raw}</span>
                            <X className="w-3 h-3 text-zinc-600" />
                        </button>
                    ))}
                </div>
            )}

            {/* Quick Property / Regex Filter Syntax Strip */}
            {showSyntaxHelp && (
                <div className="pt-2 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-micro text-zinc-600 font-semibold mr-1">
                            Filter syntax:
                        </span>
                        {SEARCH_SYNTAX_CHIPS.map((chip) => {
                            const active = searchQuery.includes(chip.query);
                            return (
                                <button
                                    key={chip.label}
                                    type="button"
                                    onClick={() => handleToggleSyntaxChip(chip.query)}
                                    className={cn(
                                        'px-2.5 py-0.5 rounded-full font-mono text-micro transition-colors cursor-pointer border',
                                        active
                                             ? 'bg-zinc-900 text-white border-zinc-900'
                                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900'
                                    )}
                                >
                                    {chip.label}
                                </button>
                            );
                        })}
                        <span className="text-micro text-zinc-600 font-mono ml-1 hidden md:inline">
                            Keys: model: hw: stack: workload: status: contributor: quant: tp: or /regex/
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowSyntaxHelp(false)}
                        className="text-zinc-500 hover:text-zinc-800 p-0.5 cursor-pointer"
                        title="Hide syntax bar"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                </div>
            )}

            {/* Compact Latency SLO Operating Point Drawer */}
            {showSlaControls && (
                <div className="pt-2.5 border-t border-zinc-200/80 space-y-2 text-xs animate-in slide-in-from-top-1 duration-150">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-zinc-700">
                        <span>
                            Each submission is a throughput-vs-latency sweep across concurrency levels. Setting a latency SLO selects each run&apos;s highest-throughput operating point that meets your threshold.
                        </span>
                        {defaultSlo && (
                            <button
                                type="button"
                                onClick={handleApplyWorkloadSlo}
                                className="inline-flex items-center gap-1 font-mono font-semibold text-accent-700 hover:text-accent-900 underline decoration-accent-300 underline-offset-2 cursor-pointer"
                            >
                                Apply {defaultSlo.label} default ({defaultSlo.percentile.toUpperCase()} TTFT ≤{defaultSlo.ttft}ms, TPOT ≤{defaultSlo.tpot}ms)
                            </button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                        {/* SLA Percentile Selector */}
                        {setSlaPercentile && (
                            <div className="flex items-center gap-2">
                                <span className="text-zinc-700 font-semibold">Percentile:</span>
                                <div
                                    role="group"
                                    aria-label="SLO latency percentile"
                                    className="inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5"
                                >
                                    {PERCENTILES.map((p) => (
                                        <button
                                            key={p.value}
                                            type="button"
                                            onClick={() => setSlaPercentile(p.value)}
                                            className={cn(
                                                'px-2 py-0.5 rounded-full font-mono text-micro font-medium transition-colors cursor-pointer',
                                                slaPercentile === p.value
                                                    ? 'bg-zinc-900 text-white'
                                                    : 'text-zinc-700 hover:text-zinc-900'
                                            )}
                                        >
                                            {p.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TTFT SLO Limits */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-zinc-700 font-semibold flex items-center gap-1">
                                <Timer className="w-3.5 h-3.5 text-accent-600" />
                                <span>Max {activePercentileLabel} TTFT:</span>
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                                {TTFT_PRESETS.map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => setMaxTtftSla && setMaxTtftSla(preset.value)}
                                        className={cn(
                                            'px-2.5 py-0.5 rounded-full text-micro font-mono font-medium transition-all cursor-pointer',
                                            maxTtftSla === preset.value
                                                ? 'bg-zinc-900 text-white'
                                                : 'bg-white text-zinc-700 border border-zinc-200 hover:text-zinc-900'
                                        )}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <input
                                    type="number"
                                    min="1"
                                    max="10000"
                                    value={maxTtftSla ?? ''}
                                    onChange={handleCustomTtftChange}
                                    placeholder="Custom ms"
                                    aria-label={`Custom max ${activePercentileLabel} TTFT in milliseconds`}
                                    className="w-24 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200 text-micro font-mono text-zinc-900 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 tabular-nums"
                                />
                            </div>
                        </div>

                        {/* TPOT SLO Limits */}
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-zinc-700 font-semibold flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Max {activePercentileLabel} TPOT:</span>
                            </span>
                            <div className="flex flex-wrap items-center gap-1">
                                {TPOT_PRESETS.map((preset) => (
                                    <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => setMaxTpotSla && setMaxTpotSla(preset.value)}
                                        className={cn(
                                            'px-2.5 py-0.5 rounded-full text-micro font-mono font-medium transition-all cursor-pointer',
                                            maxTpotSla === preset.value
                                                ? 'bg-zinc-900 text-white'
                                                : 'bg-white text-zinc-700 border border-zinc-200 hover:text-zinc-900'
                                        )}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <input
                                    type="number"
                                    min="1"
                                    max="5000"
                                    value={maxTpotSla ?? ''}
                                    onChange={handleCustomTpotChange}
                                    placeholder="Custom ms"
                                    aria-label={`Custom max ${activePercentileLabel} TPOT in milliseconds`}
                                    className="w-24 px-2.5 py-0.5 rounded-full bg-white border border-zinc-200 text-micro font-mono text-zinc-900 placeholder-zinc-500 focus:outline-none focus:border-zinc-400 tabular-nums"
                                />
                            </div>
                        </div>

                        {/* Close SLO controls */}
                        <button
                            type="button"
                            onClick={() => setShowSlaControls(false)}
                            className="text-zinc-400 hover:text-zinc-700 ml-auto p-1 cursor-pointer"
                            title="Close SLO controls"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
