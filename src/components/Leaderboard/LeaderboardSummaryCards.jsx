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

import React, { useMemo } from 'react';
import {
    Crown,
    Sparkles,
    ArrowRight,
    Layers
} from 'lucide-react';
import { GoogleMark, StatusChip } from '../ui';
import { getActivePricingLabel } from '../../utils/pricingEngine.js';
import {
    OBJECTIVES,
    DEFAULT_SLO,
    describeSlo,
    engineLabel,
    formatHardwareShort,
    latencyFor,
    provenanceStatus,
} from '../../utils/leaderboardFacets.js';

const fmtMs = (v) => (typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}ms` : '—');

export default function LeaderboardSummaryCards({
    dataset = [],
    isGroupedByModel = false,
    onSelectModel,
    onSelectRecipe,
    objective = OBJECTIVES[0],
    latencyPercentile = DEFAULT_SLO.percentile,
    slo = DEFAULT_SLO,
    customPricing = {},
    onOpenPricingModal
}) {
    const activePricingLabel = useMemo(() => getActivePricingLabel(customPricing), [customPricing]);
    const pctLabel = String(latencyPercentile).toUpperCase();

    const qualifyingDataset = useMemo(
        () => (dataset || []).filter((r) => !r.missesSlo),
        [dataset]
    );

    const perModelLeaders = useMemo(() => {
        if (!qualifyingDataset.length) return [];
        const leaders = [];
        const seenModels = new Set();
        qualifyingDataset.forEach((r) => {
            const model = r.model_family || r.model_name || 'Model';
            if (!seenModels.has(model)) {
                seenModels.add(model);
                leaders.push({ model, recipe: r });
            }
        });
        return leaders;
    }, [qualifyingDataset]);

    if (!dataset || dataset.length === 0) {
        return null;
    }

    if (qualifyingDataset.length === 0) {
        return (
            <div className="surface-light px-4 py-3 rounded-2xl border border-amber-200 bg-amber-50/70 flex items-center justify-between gap-3 text-xs text-amber-900">
                <div className="flex items-center gap-2.5">
                    <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                        No run in this scope meets {describeSlo(slo)} at any measured load. Relax the SLO above, or inspect the closest runs below.
                    </span>
                </div>
            </div>
        );
    }

    // When comparing across multiple model sizes ("All models"), keep the exact same 2-line card height (68px)
    if (isGroupedByModel && perModelLeaders.length > 1) {
        return (
            <div className="surface-light rounded-2xl border border-accent-200/85 bg-gradient-to-r from-accent-50/80 via-white to-zinc-50/70 px-4 py-2.5 min-h-[68px] flex items-center">
                <div className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-600 text-white px-2.5 py-0.5 text-micro font-semibold shrink-0">
                                <Layers className="w-3 h-3 text-amber-300" />
                                <span>Per-model #1 leaders</span>
                            </span>
                            <span className="text-xs text-zinc-700 truncate">
                                Select a model family to compare like-for-like across stacks &amp; hardware:
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-micro">
                            {perModelLeaders.map(({ model, recipe }) => {
                                const tputPerChip = recipe.tokens_per_sec_per_chip;
                                return (
                                    <button
                                        key={model}
                                        type="button"
                                        onClick={() => (onSelectModel ? onSelectModel(model) : onSelectRecipe && onSelectRecipe(recipe))}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 font-medium text-zinc-900 hover:border-accent-400 hover:bg-accent-50/40 transition-colors cursor-pointer shrink-0"
                                        title={`Scope leaderboard to ${model}`}
                                    >
                                        <span className="font-semibold text-zinc-900">{model}</span>
                                        <span className="text-zinc-300">·</span>
                                        <span className="font-mono text-micro text-accent-700 font-semibold">{engineLabel(recipe.stack?.engine)}</span>
                                        <span className="font-mono text-micro text-zinc-700 tabular-nums font-medium">
                                            {typeof tputPerChip === 'number' ? `${Math.round(tputPerChip).toLocaleString()} tok/s/chip` : '—'}
                                        </span>
                                        {recipe.is_sample && <StatusChip status="sample" size="xs" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {activePricingLabel && onOpenPricingModal && (
                        <button
                            type="button"
                            onClick={onOpenPricingModal}
                            className="text-micro font-mono text-zinc-700 bg-white border border-zinc-200 px-3 py-1.5 rounded-full hover:bg-zinc-50 transition-colors cursor-pointer shrink-0 font-medium"
                            title="Click to inspect active pricing rates"
                        >
                            {activePricingLabel}
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const winnerRecipe = qualifyingDataset[0];
    if (!winnerRecipe) return null;

    const winnerThroughput = winnerRecipe.tokens_per_sec;
    const winnerThroughputPerChip = winnerRecipe.tokens_per_sec_per_chip;
    const winnerTtft = latencyFor(winnerRecipe, 'ttft', latencyPercentile);
    const winnerTpot = latencyFor(winnerRecipe, 'itl', latencyPercentile);
    const winnerCostPer1M = winnerRecipe.cost_analysis?.cost_per_1m_output_tokens_usd;
    const winnerModel = winnerRecipe.model_family || winnerRecipe.model_name || 'Model not recorded';
    const winnerConcurrency = winnerRecipe.operatingConcurrency;
    const winnerHandle = winnerRecipe.author?.github_id || winnerRecipe.author?.username || null;
    const winnerStatus = provenanceStatus(winnerRecipe);
    const stackParts = [
        engineLabel(winnerRecipe.stack?.engine),
        winnerRecipe.stack?.tensor_parallel_size ? `TP${winnerRecipe.stack.tensor_parallel_size}` : null,
        winnerRecipe.stack?.quantization ? String(winnerRecipe.stack.quantization).toUpperCase() : null,
    ].filter(Boolean);

    return (
        <div className="surface-light rounded-2xl border border-accent-200/85 bg-gradient-to-r from-accent-50/80 via-white to-zinc-50/70 px-4 py-2.5 min-h-[68px] flex items-center">
            <div className="w-full flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                {/* Left: #1 Identity, Stack, Hardware & Contributor */}
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-600 text-white px-2.5 py-0.5 text-micro font-semibold shrink-0">
                            <Crown className="w-3 h-3 text-amber-300 fill-amber-300" />
                            <span>#1 {objective.label}</span>
                        </span>
                        <span className="font-semibold text-sm text-zinc-900 truncate" title={winnerRecipe.recipe_name || winnerModel}>
                            {winnerModel} · {winnerRecipe.recipe_name}
                        </span>
                        <StatusChip status={winnerStatus} size="xs" />
                    </div>
                    <div className="flex items-center gap-2 text-micro min-w-0 overflow-hidden">
                        <span className="font-mono font-semibold text-accent-700 bg-white border border-accent-200 px-2 py-0.5 rounded-full shrink-0">
                            {stackParts.join(' · ')}
                        </span>
                        <span className="inline-flex items-center gap-1 font-mono text-zinc-700 shrink-0">
                            {winnerRecipe.hardware?.cloud_provider === 'gcp' && <GoogleMark />}
                            <span>{formatHardwareShort(winnerRecipe)}</span>
                        </span>
                        {winnerHandle && (
                            <>
                                <span className="text-zinc-400 shrink-0">·</span>
                                <span className="text-zinc-600 font-mono shrink-0">by @{winnerHandle}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* Right: Compact Inline Metrics + Inspect CTA */}
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 shrink-0">
                    <div className="flex flex-wrap items-center divide-x divide-zinc-200/90 rounded-xl bg-white border border-zinc-200/85 px-3 py-1.5 text-xs">
                        <div className="pr-3">
                            <span className="text-tiny uppercase tracking-wider text-zinc-600 font-semibold mr-1.5">Tok/s/chip</span>
                            <span className="font-mono font-bold text-sm text-zinc-900 tabular-nums">
                                {typeof winnerThroughputPerChip === 'number' ? Math.round(winnerThroughputPerChip).toLocaleString() : '—'}
                            </span>
                            {typeof winnerThroughput === 'number' && (
                                <span className="text-tiny font-mono text-zinc-600 ml-1 tabular-nums hidden sm:inline">
                                    ({Math.round(winnerThroughput).toLocaleString()}{winnerConcurrency != null ? ` @ ${winnerConcurrency}c` : ''})
                                </span>
                            )}
                        </div>
                        <div className="px-3">
                            <span className="text-tiny uppercase tracking-wider text-zinc-600 font-semibold mr-1.5">TTFT {pctLabel}</span>
                            <span className="font-mono font-semibold text-zinc-900 tabular-nums">{fmtMs(winnerTtft)}</span>
                        </div>
                        <div className="px-3">
                            <span className="text-tiny uppercase tracking-wider text-zinc-600 font-semibold mr-1.5">TPOT {pctLabel}</span>
                            <span className="font-mono font-semibold text-zinc-900 tabular-nums">{fmtMs(winnerTpot)}</span>
                        </div>
                        <div className="pl-3">
                            <span className="text-tiny uppercase tracking-wider text-zinc-600 font-semibold mr-1.5">$/1M</span>
                            <span
                                className="font-mono font-semibold text-emerald-700 tabular-nums"
                                title={typeof winnerCostPer1M === 'number' ? undefined : 'No list price for this accelerator. Set your own rate under Pricing.'}
                            >
                                {typeof winnerCostPer1M === 'number' ? `$${winnerCostPer1M.toFixed(3)}` : '—'}
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => onSelectRecipe && onSelectRecipe(winnerRecipe)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-zinc-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors cursor-pointer"
                    >
                        <span>Inspect recipe</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
