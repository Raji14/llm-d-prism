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

import React, { useState, useEffect, useMemo } from 'react';
import {
    ArrowLeft,
    CheckCircle2,
    AlertTriangle,
    Terminal,
    Check,
    Copy,
    Zap,
    Layers,
    ExternalLink,
    Sparkles,
    ChevronDown
} from 'lucide-react';
import { WellLitHeader } from '../ui/WellLitHeader.jsx';
import { Button } from '../ui/Button.jsx';
import RecipeDetailDrawer from './RecipeDetailDrawer.jsx';
import { buildLeaderboardDataset, SEED_LEADERBOARD_RECIPES } from '../../utils/leaderboardData.js';
import { loadCustomPricingRates } from '../../utils/pricingEngine.js';
import { getRecipeReproductionCount } from '../../utils/communityRewards.js';
import {
    computeParity,
    diffConfigs,
    isIsolatedChange,
    pickComparisonDefault,
    formatRunDate
} from '../../utils/runParity.js';
import { engineLabel } from '../../utils/leaderboardFacets.js';
import { cn } from '../../utils/cn';

const getCostPer1M = (r) => r?.cost_analysis?.cost_per_1m_output_tokens_usd ?? r?.cost_per_1m ?? null;

const getPerChipTps = (r) => {
    if (!r) return 0;
    if (typeof r.tokens_per_sec_per_chip === 'number' && Number.isFinite(r.tokens_per_sec_per_chip)) {
        return r.tokens_per_sec_per_chip;
    }
    const chips = Math.max(1, r.hardware?.accelerator_count || 1);
    return (r.tokens_per_sec || 0) / chips;
};

export default function RecipeComparisonPage({
    onNavigateBack,
    onNavigate,
    onToggleMobileNav,
    dashboardData,
    navigationParams
}) {
    // 1. Build dataset
    const customPricing = useMemo(() => loadCustomPricingRates(), []);
    const allRecipes = useMemo(() => {
        return buildLeaderboardDataset({
            seedRecipes: SEED_LEADERBOARD_RECIPES,
            brv02Runs: dashboardData?.brv02Runs || [],
            liveBenchmarkData: dashboardData?.data || [],
            customPricing,
            activeLatencyMetric: 'ttft_p50',
            activeThroughputMetric: 'tokens_per_sec_per_chip'
        });
    }, [dashboardData?.brv02Runs, dashboardData?.data, customPricing]);

    // 2. Resolve compared recipes from URL params or navigation props
    const [selectedBaselineId, setSelectedBaselineId] = useState(() => {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        return params?.get('baseline') || navigationParams?.baseline || null;
    });

    const [copiedIndex, setCopiedIndex] = useState(null);
    const [copiedAiPrompt, setCopiedAiPrompt] = useState(false);
    const [showIdenticalParams, setShowIdenticalParams] = useState(false);

    // Sidepanel Drawer state for inspecting individual recipes
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [drawerRecipe, setDrawerRecipe] = useState(null);

    // Parse recipes to compare
    const comparedRecipes = useMemo(() => {
        let recipeIds = [];
        if (navigationParams?.recipes) {
            if (Array.isArray(navigationParams.recipes)) {
                recipeIds = navigationParams.recipes;
            } else if (typeof navigationParams.recipes === 'string') {
                recipeIds = navigationParams.recipes.split(',').filter(Boolean);
            }
        }
        if (recipeIds.length === 0 && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const urlRecipes = params.get('recipes');
            if (urlRecipes) {
                recipeIds = urlRecipes.split(',').filter(Boolean);
            }
        }

        // Preserve order from recipeIds when provided
        let matched = recipeIds
            .map((id) => allRecipes.find((r) => r.id === id))
            .filter(Boolean);

        if (matched.length < 2) {
            matched = pickComparisonDefault(allRecipes);
        }
        return matched;
    }, [allRecipes, navigationParams]);

    // Ensure baseline is valid
    const baselineRecipe = useMemo(() => {
        if (selectedBaselineId) {
            const found = comparedRecipes.find((r) => r.id === selectedBaselineId);
            if (found) return found;
        }
        return comparedRecipes[0] || null;
    }, [comparedRecipes, selectedBaselineId]);

    // Computed parity across all compared setups
    const parity = useMemo(() => computeParity(comparedRecipes), [comparedRecipes]);

    // Sync URL parameters
    useEffect(() => {
        try {
            if (typeof window === 'undefined') return;
            const params = new URLSearchParams(window.location.search);
            params.set('view', 'recipe-comparison');
            if (comparedRecipes.length > 0) {
                params.set('recipes', comparedRecipes.map((r) => r.id).join(','));
            }
            if (baselineRecipe?.id) {
                params.set('baseline', baselineRecipe.id);
            }
            const newUrl = `${window.location.pathname}?${params.toString()}`;
            window.history.replaceState(null, '', newUrl);
        } catch {
            // ignore URL errors
        }
    }, [comparedRecipes, baselineRecipe]);

    const handleCopyCommand = (idx, cmd) => {
        if (cmd && navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(cmd);
            setCopiedIndex(idx);
            setTimeout(() => setCopiedIndex(null), 2000);
        }
    };

    const handleInspectRecipe = (recipe) => {
        setDrawerRecipe(recipe);
        setIsDrawerOpen(true);
    };

    const calculateDelta = (val, baseVal, isLowerBetter = false) => {
        if (val == null || baseVal == null || baseVal === 0 || val === baseVal) return null;
        const diff = ((val - baseVal) / baseVal) * 100;
        const ratio = isLowerBetter ? baseVal / val : val / baseVal;
        const isPositive = diff > 0;
        const isGood = isLowerBetter ? !isPositive : isPositive;

        return {
            text: `${isPositive ? '+' : ''}${diff.toFixed(1)}%`,
            ratioText: Number.isFinite(ratio) && ratio > 0 ? `${ratio.toFixed(2)}×` : null,
            isGood,
            diff
        };
    };

    // Parameter diff rows: compute values across comparedRecipes and partition into differing vs identical
    const parameterRows = useMemo(() => {
        if (!comparedRecipes || comparedRecipes.length === 0) return { differing: [], identical: [] };
        const specs = [
            {
                key: 'model',
                label: 'Evaluated model',
                extract: (r) => `${r.model_family || r.model_name?.split('/')?.pop() || r.model_name} (${r.model_name})`,
                render: (r) => (
                    <div className="font-sans">
                        <div className="font-semibold text-zinc-900 truncate max-w-[200px]">{r.model_family || r.model_name?.split('/')?.pop() || r.model_name}</div>
                        <div className="text-xs text-zinc-500 font-mono font-normal truncate">{r.model_name}</div>
                    </div>
                )
            },
            {
                key: 'hardware',
                label: 'Hardware',
                extract: (r) => `${r.hardware?.accelerator_count || 1}× ${({
                    'nvidia-h100-80gb': 'H100',
                    'nvidia-a100-80gb': 'A100',
                    'nvidia-a100-40gb': 'A100 40GB',
                    'nvidia-l4': 'L4',
                    'tpu-v6e-trillium': 'TPU v6e',
                    'tpu-v5e': 'TPU v5e',
                })[r.hardware?.accelerator_type] || r.hardware_summary}`,
                render: (r) => (
                    <span className="font-mono font-semibold text-zinc-900">
                        {r.hardware?.accelerator_count || 1}× {({
                            'nvidia-h100-80gb': 'H100',
                            'nvidia-a100-80gb': 'A100',
                            'nvidia-a100-40gb': 'A100 40GB',
                            'nvidia-l4': 'L4',
                            'tpu-v6e-trillium': 'TPU v6e',
                            'tpu-v5e': 'TPU v5e',
                        })[r.hardware?.accelerator_type] || r.hardware_summary}
                    </span>
                )
            },
            {
                key: 'stack',
                label: 'Serving stack & version',
                extract: (r) => `${engineLabel(r.stack?.engine)}${r.stack?.engine_version && r.stack.engine_version !== 'latest' ? ` (${r.stack.engine_version})` : ''}`,
                render: (r) => (
                    <span className="font-semibold text-zinc-900">
                        {engineLabel(r.stack?.engine)}{r.stack?.engine_version && r.stack.engine_version !== 'latest' ? ` (${r.stack.engine_version})` : ''}
                    </span>
                )
            },
            {
                key: 'pd_topology',
                label: 'Prefill / decode topology',
                extract: (r) => (r.stack?.pd_disaggregation ? 'Disaggregated P/D' : 'Colocated'),
                render: (r) => (
                    <span className={r.stack?.pd_disaggregation ? 'text-accent-700 font-semibold' : 'text-zinc-700'}>
                        {r.stack?.pd_disaggregation ? 'Disaggregated P/D' : 'Colocated'}
                    </span>
                )
            },
            {
                key: 'prefix_routing',
                label: 'Prefix caching & routing',
                extract: (r) => (r.stack?.prefix_caching ? (r.stack?.routing ? `Enabled (${r.stack.routing})` : 'Enabled') : 'Disabled'),
                render: (r) => (
                    <span className={r.stack?.prefix_caching ? 'text-emerald-700 font-semibold' : 'text-zinc-500'}>
                        {r.stack?.prefix_caching ? (r.stack?.routing ? `Enabled (${r.stack.routing})` : 'Enabled') : 'Disabled'}
                    </span>
                )
            },
            {
                key: 'spec_decoding',
                label: 'Speculative decoding',
                extract: (r) => (r.stack?.speculative_decoding?.enabled ? `Enabled (${r.stack?.speculative_decoding?.num_speculative_tokens || 4} tok)` : 'Disabled'),
                render: (r) => (
                    <span className={r.stack?.speculative_decoding?.enabled ? 'text-amber-700 font-semibold' : 'text-zinc-500'}>
                        {r.stack?.speculative_decoding?.enabled ? `Enabled (${r.stack?.speculative_decoding?.num_speculative_tokens || 4} tok)` : 'Disabled'}
                    </span>
                )
            },
            {
                key: 'parallelism',
                label: 'Parallelism & replicas',
                extract: (r) => `TP=${r.stack?.tensor_parallel_size || 1} (PP=${r.stack?.pipeline_parallel_size || 1})`,
                render: (r) => (
                    <span className="text-zinc-900 font-semibold">
                        TP={r.stack?.tensor_parallel_size || 1} (PP={r.stack?.pipeline_parallel_size || 1})
                    </span>
                )
            },
            {
                key: 'quantization',
                label: 'Quantization / precision',
                extract: (r) => (r.stack?.quantization || 'fp16').toUpperCase(),
                render: (r) => (
                    <span className="text-zinc-900 font-semibold">
                        {(r.stack?.quantization || 'fp16').toUpperCase()}
                    </span>
                )
            },
            {
                key: 'kv_cache_dtype',
                label: 'KV cache dtype',
                extract: (r) => (r.stack?.kv_cache_dtype || 'auto').toUpperCase(),
                render: (r) => (
                    <span className="text-zinc-700 font-medium">
                        {(r.stack?.kv_cache_dtype || 'auto').toUpperCase()}
                    </span>
                )
            },
            {
                key: 'container_image',
                label: 'Container image',
                extract: (r) => r.container_image || r.stack?.container_image || 'Not reported',
                render: (r) => {
                    const img = r.container_image || r.stack?.container_image || null;
                    return (
                        <span className={cn('font-mono text-xs font-medium', img ? 'text-accent-700' : 'text-zinc-500')}>
                            {img || 'Not reported'}
                        </span>
                    );
                }
            },
            {
                key: 'workload',
                label: 'Workload profile (ISL / OSL)',
                extract: (r) => `${r.workload?.dataset_name || 'Not reported'} · ${r.workload?.input_tokens ?? '—'} in / ${r.workload?.output_tokens ?? '—'} out · concurrency ${r.workload?.concurrency ?? '—'}`,
                render: (r) => (
                    <span className="text-zinc-700 text-xs">
                        {r.workload?.dataset_name || 'Not reported'} · {r.workload?.input_tokens ?? '—'} in / {r.workload?.output_tokens ?? '—'} out · concurrency {r.workload?.concurrency ?? '—'}
                    </span>
                )
            },
        ];

        const differing = [];
        const identical = [];
        specs.forEach((spec) => {
            const vals = comparedRecipes.map((r) => spec.extract(r));
            const allSame = vals.every((v) => v === vals[0]);
            if (allSame) {
                identical.push({ ...spec, isDiff: false, values: vals });
            } else {
                differing.push({ ...spec, isDiff: true, values: vals });
            }
        });
        return { differing, identical };
    }, [comparedRecipes]);

    const handleCopyAiPrompt = () => {
        if (!baselineRecipe || comparedRecipes.length === 0) return;
        const lines = [
            `# LLM Serving Configuration Comparison (llm-d Prism)`,
            `Comparability: ${parity.likeForLike ? 'Like-for-like (same model & workload profile)' : `Confounded (${parity.mismatches.map((m) => m.label).join(', ')} differ)`}`,
            `Baseline: ${baselineRecipe.recipe_name} (${engineLabel(baselineRecipe.stack?.engine)})`,
            ``,
            `## 1. Performance Metrics Summary`,
            `| Metric | ${comparedRecipes.map((r) => `${r.recipe_name}${r.id === baselineRecipe.id ? ' (Baseline)' : ''}`).join(' | ')} |`,
            `| :--- | ${comparedRecipes.map(() => ':---').join(' | ')} |`,
            `| Tok/s/chip | ${comparedRecipes.map((r) => {
                const v = Math.round(getPerChipTps(r));
                const d = r.id !== baselineRecipe.id ? calculateDelta(getPerChipTps(r), getPerChipTps(baselineRecipe)) : null;
                return `${v} tok/s/chip${d ? ` (${d.text}, ${d.ratioText})` : ''}`;
            }).join(' | ')} |`,
            `| Total Tok/s | ${comparedRecipes.map((r) => `${Math.round(r.tokens_per_sec || 0)} tok/s`).join(' | ')} |`,
            `| TTFT P50 | ${comparedRecipes.map((r) => `${r.ttft_p50?.toFixed(1) ?? '—'} ms`).join(' | ')} |`,
            `| TPOT P50 | ${comparedRecipes.map((r) => `${(r.itl_p50 ?? r.metrics?.itl_ms?.p50)?.toFixed(1) ?? '—'} ms`).join(' | ')} |`,
            `| Cost / 1M tok | ${comparedRecipes.map((r) => `$${(getCostPer1M(r) ?? 0).toFixed(3)}`).join(' | ')} |`,
            ``,
            `## 2. Differing Serving Parameters`,
            ...parameterRows.differing.map((row) => `- **${row.label}**: ${comparedRecipes.map((r, i) => `${r.recipe_name}: \`${row.values[i]}\``).join(' vs ')}`),
            ``,
            `## 3. Identical Parameters`,
            ...parameterRows.identical.map((row) => `- **${row.label}**: \`${row.values[0]}\``),
            ``,
            `Please analyze why the top-performing configuration achieves higher throughput per chip and/or lower latency, and recommend which flags or architectural optimizations account for the delta.`
        ];
        navigator.clipboard?.writeText(lines.join('\n'));
        setCopiedAiPrompt(true);
        setTimeout(() => setCopiedAiPrompt(false), 2500);
    };

    if (!baselineRecipe || comparedRecipes.length === 0) {
        return (
            <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative">
                <WellLitHeader
                    pageTitle="Recipe comparison"
                    badgeLabel={null}
                    onNavigateBack={() => onNavigate ? onNavigate('model-leaderboard') : onNavigateBack && onNavigateBack()}
                    onToggleMobileNav={onToggleMobileNav}
                    getShareUrl={() => typeof window !== 'undefined' ? window.location.href : ''}
                />
                <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
                    <p className="text-slate-400 text-sm">No configurations currently selected for comparison.</p>
                    <Button variant="primary" size="md" onClick={() => onNavigate && onNavigate('model-leaderboard')}>
                        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Leaderboard
                    </Button>
                </div>
            </div>
        );
    }

    const modelNameHeader = parity.likeForLike
        ? (baselineRecipe.model_family || baselineRecipe.model_name?.split('/')?.pop() || baselineRecipe.model_name)
        : 'Multi-model / custom scope';

    const gridColsClass = comparedRecipes.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3';

    const baselineStackBrand = engineLabel(baselineRecipe.stack?.engine);
    const baselineStackVer = baselineRecipe.stack?.engine_version && baselineRecipe.stack.engine_version !== 'latest'
        ? ` ${baselineRecipe.stack.engine_version}`
        : '';

    const visibleParamRows = showIdenticalParams
        ? [...parameterRows.differing, ...parameterRows.identical]
        : parameterRows.differing;

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-x-hidden">
            {/* Editorial Page Header */}
            <WellLitHeader
                pageTitle="Recipe comparison"
                badgeLabel={null}
                onNavigateBack={() => onNavigate ? onNavigate('model-leaderboard') : onNavigateBack && onNavigateBack()}
                onToggleMobileNav={onToggleMobileNav}
                getShareUrl={() => typeof window !== 'undefined' ? window.location.href : ''}
            />

            {/* Main Content Container */}
            <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-8 space-y-6 z-10">
                {/* 1. Navigation, Context & AI Prompt Export Bar */}
                <div className="surface-light flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-zinc-200">
                    <div className="flex items-center gap-3 text-xs">
                        <button
                            onClick={() => onNavigate ? onNavigate('model-leaderboard') : onNavigateBack && onNavigateBack()}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 font-medium transition-colors cursor-pointer"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Back to Leaderboard</span>
                        </button>
                        <div className="h-4 w-px bg-zinc-200 hidden sm:block" />
                        <div className="flex items-center gap-2 font-mono text-micro">
                            <span className="px-3 py-0.5 rounded-full bg-zinc-100 text-zinc-800 font-medium">
                                {modelNameHeader}
                            </span>
                            <span className="px-3 py-0.5 rounded-full bg-accent-50 text-accent-700 ring-1 ring-inset ring-accent-600/20 font-medium">
                                {comparedRecipes.length} setups compared
                            </span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={handleCopyAiPrompt}
                        className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-medium transition-all cursor-pointer',
                            copiedAiPrompt
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold'
                                : 'bg-white text-zinc-800 border-zinc-200 hover:border-accent-300 hover:text-accent-700'
                        )}
                        title="Copy a structured Markdown summary of this comparison (metrics, parameter diffs, parity) to paste into Gemini or any LLM"
                    >
                        {copiedAiPrompt ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Sparkles className="w-3.5 h-3.5 text-accent-600" />}
                        <span>{copiedAiPrompt ? 'Copied comparison prompt for AI!' : 'Copy comparison for AI analysis'}</span>
                    </button>
                </div>

                {/* 2. Computed Workload & Harness Parity Callout */}
                {parity.likeForLike ? (
                    <div className="surface-light p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span className="text-emerald-950 font-semibold">
                                    Workload & harness parity verified · Like-for-like comparison
                                </span>
                            </div>
                            <span className="text-tiny font-mono font-medium px-2.5 py-1 rounded-full bg-white text-emerald-700 border border-emerald-200 shrink-0">
                                Like-for-like
                            </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                            {parity.matched.map((m) => (
                                <span
                                    key={m.key}
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-emerald-200/80 text-micro font-mono text-emerald-900"
                                >
                                    <span className="text-emerald-700 font-sans font-medium">{m.label}:</span>
                                    <span className="font-semibold">{m.value}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="surface-light p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2.5 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                <span className="text-amber-950 font-semibold">
                                    {`Not like-for-like · ${parity.mismatches.length} workload ${parity.mismatches.length === 1 ? 'difference' : 'differences'}`}
                                </span>
                            </div>
                            <span className="text-tiny font-mono font-medium px-2.5 py-1 rounded-full bg-white text-amber-800 border border-amber-200 shrink-0">
                                Confounded comparison
                            </span>
                        </div>
                        <p className="text-amber-900 leading-relaxed">
                            These runs were evaluated under different models or workload shapes. Throughput and latency deltas reflect both configuration and workload differences:
                        </p>
                        <ul className="space-y-1 font-mono text-micro text-amber-950 list-disc list-inside">
                            {parity.mismatches.map((m) => (
                                <li key={m.key}>
                                    <strong className="font-sans font-semibold">{m.label}:</strong>{' '}
                                    {m.values.map((v) => v.value).join(' vs ')}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* 3. Symmetric Configuration Diff & Honest Attribution Summary */}
                <div className="surface-light rounded-3xl bg-white border border-zinc-200 overflow-hidden">
                    <div className="px-5 sm:px-6 py-4 border-b border-zinc-200 bg-zinc-50/75 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight">
                                Comparison against baseline: {baselineRecipe.recipe_name}
                            </h3>
                        </div>
                        <span className="text-micro font-mono px-2.5 py-1 rounded-full bg-white text-zinc-700 border border-zinc-200">
                            Baseline: {baselineStackBrand}{baselineStackVer} · TP{baselineRecipe.stack?.tensor_parallel_size || 1}
                        </span>
                    </div>

                    <div className={cn(
                        'p-5 sm:p-6 grid gap-4 text-xs',
                        comparedRecipes.filter((r) => r.id !== baselineRecipe.id).length === 1
                            ? 'grid-cols-1'
                            : 'grid-cols-1 md:grid-cols-2'
                    )}>
                        {comparedRecipes.filter((r) => r.id !== baselineRecipe.id).map((comp) => {
                            const parityForPair = computeParity([baselineRecipe, comp]);
                            const configDiff = diffConfigs(baselineRecipe, comp);

                            const compPerChip = getPerChipTps(comp);
                            const basePerChip = getPerChipTps(baselineRecipe);
                            const tpsDelta = calculateDelta(compPerChip, basePerChip);
                            const ttftDelta = calculateDelta(comp.ttft_p50, baselineRecipe.ttft_p50, true);
                            const costDelta = calculateDelta(
                                getCostPer1M(comp),
                                getCostPer1M(baselineRecipe),
                                true
                            );

                            return (
                                <div key={comp.id} className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200 space-y-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <span className="font-semibold text-zinc-900 text-sm">
                                                {comp.recipe_name} vs {baselineRecipe.recipe_name}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                                            {tpsDelta && (
                                                <span className={cn(
                                                    'text-micro px-2.5 py-0.5 rounded-full font-mono font-medium',
                                                    tpsDelta.isGood
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                                                        : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20'
                                                )}>
                                                    {tpsDelta.text} ({tpsDelta.ratioText}) tok/s/chip
                                                </span>
                                            )}
                                            {ttftDelta && (
                                                <span className={cn(
                                                    'text-micro px-2.5 py-0.5 rounded-full font-mono font-medium',
                                                    ttftDelta.isGood
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                                                        : 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20'
                                                )}>
                                                    {ttftDelta.text} TTFT
                                                </span>
                                            )}
                                            {costDelta && (
                                                <span className={cn(
                                                    'text-micro px-2.5 py-0.5 rounded-full font-mono font-medium',
                                                    costDelta.isGood
                                                        ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20'
                                                        : 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20'
                                                )}>
                                                    {costDelta.text} $/1M
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <ul className="text-zinc-700 space-y-1.5 list-disc list-inside text-xs leading-relaxed">
                                        {parityForPair.mismatches.map((mismatch) => (
                                            <li key={`wl-${mismatch.key}`} className="text-amber-900">
                                                <strong className="font-semibold">Workload confounder — {mismatch.label}:</strong>{' '}
                                                <span className="font-mono">
                                                    {mismatch.values[0]?.value} → {mismatch.values[1]?.value}
                                                </span>
                                            </li>
                                        ))}
                                        {configDiff.diffs.map((d) => (
                                            <li key={d.key}>
                                                <strong className="text-zinc-900 font-semibold">{d.label}:</strong>{' '}
                                                <span className="font-mono text-zinc-600">{d.baselineValue}</span>
                                                <span className="text-zinc-400 mx-1.5">→</span>
                                                <span className="font-mono font-semibold text-zinc-900">{d.challengerValue}</span>
                                            </li>
                                        ))}
                                        {parityForPair.mismatches.length === 0 && configDiff.diffs.length === 0 && (
                                            <li>
                                                <strong className="text-zinc-900 font-semibold">Identical stack & workload configuration:</strong>{' '}
                                                Both entries report the same hardware, serving stack, precision, and workload parameters.
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* 4. Recipe Cards Grid (2-col when comparing 2 setups, 3-col when 3) */}
                <div className={cn('surface-light grid gap-4', gridColsClass)}>
                    {comparedRecipes.map((item, idx) => {
                        const isBaseline = item.id === baselineRecipe.id;
                        const githubUrl = item.pull_request_url || `https://github.com/llm-d/llm-d/tree/main/recipes/${(item.model_family || 'llama').toLowerCase().replace(/\s+/g, '-')}`;
                        const perChip = getPerChipTps(item);
                        const runDate = formatRunDate(item.created_at) || 'Date not reported';
                        const shortHw = `${item.hardware?.accelerator_count || 1}× ${({
                            'nvidia-h100-80gb': 'H100',
                            'nvidia-a100-80gb': 'A100',
                            'nvidia-a100-40gb': 'A100 40GB',
                            'nvidia-l4': 'L4',
                            'tpu-v6e-trillium': 'TPU v6e',
                            'tpu-v5e': 'TPU v5e',
                        })[item.hardware?.accelerator_type] || item.hardware_summary}`;

                        return (
                            <div
                                key={item.id}
                                className={cn(
                                    'p-5 rounded-3xl border flex flex-col justify-between relative transition-all',
                                    isBaseline
                                        ? 'bg-accent-50/35 border-accent-300'
                                        : 'bg-white border-zinc-200'
                                )}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-micro font-mono font-medium text-zinc-500">
                                            Config #{idx + 1} · {engineLabel(item.stack?.engine)}
                                        </span>
                                        {isBaseline ? (
                                            <span className="text-tiny font-mono font-semibold px-2.5 py-0.5 rounded-full bg-accent-600 text-white">
                                                ★ Baseline
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedBaselineId(item.id)}
                                                className="text-tiny font-mono text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
                                            >
                                                Set as baseline
                                            </button>
                                        )}
                                    </div>

                                    <h3 className="font-semibold text-zinc-900 text-base mb-0.5 truncate" title={item.recipe_name}>
                                        {item.recipe_name}
                                    </h3>
                                    <p className="text-xs text-zinc-600 font-mono truncate mb-3" title={`${item.model_family || item.model_name} · ${shortHw}`}>
                                        {item.model_family || item.model_name?.split('/')?.pop() || item.model_name} · {shortHw}
                                    </p>

                                    {/* Author Row */}
                                    <div className="flex items-center justify-between gap-2 mb-3 p-2 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-micro">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {item.author?.avatar_url ? (
                                                <img src={item.author.avatar_url} alt="Author" className="w-5 h-5 rounded-full border border-zinc-200 object-cover shrink-0" />
                                            ) : (
                                                <div className="w-5 h-5 rounded-full bg-white text-zinc-700 flex items-center justify-center font-semibold text-tiny shrink-0 border border-zinc-200">
                                                    {(item.author?.username || 'U')[0].toUpperCase()}
                                                </div>
                                            )}
                                            <span className="font-medium text-zinc-800 truncate max-w-[140px]" title={item.author?.display_name || item.author?.username}>
                                                {item.author?.display_name || item.author?.username || 'Community'}
                                            </span>
                                        </div>
                                        <span className="font-mono text-tiny text-zinc-500 truncate">{runDate}</span>
                                    </div>

                                    <div className="text-micro text-zinc-500 flex items-center justify-end gap-1 mb-3">
                                        <a
                                            href={githubUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="text-micro text-zinc-600 hover:text-zinc-900 flex items-center gap-1 shrink-0"
                                            title="View source on GitHub"
                                        >
                                            <span>GitHub</span>
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                </div>

                                {/* Top Line Metrics */}
                                <div className="grid grid-cols-3 gap-2 bg-zinc-50/80 p-3 rounded-2xl border border-zinc-200/80 font-mono text-xs">
                                    <div>
                                        <span className="text-tiny text-zinc-500 block">Per-Chip</span>
                                        <span className="text-zinc-900 font-semibold text-xs tabular-nums">{Math.round(perChip).toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-tiny text-zinc-500 block">Total Tput</span>
                                        <span className="text-zinc-900 font-semibold text-xs tabular-nums">{Math.round(item.tokens_per_sec || 0).toLocaleString()}</span>
                                    </div>
                                    <div>
                                        <span className="text-tiny text-zinc-500 block">TTFT P50</span>
                                        <span className="text-zinc-900 font-semibold text-xs tabular-nums">{item.ttft_p50 ? `${item.ttft_p50.toFixed(1)}ms` : '—'}</span>
                                    </div>
                                </div>

                                {/* Action Buttons: Inspect Recipe & Copy CLI */}
                                <div className="mt-4 flex items-center gap-2">
                                    <button
                                        onClick={() => handleInspectRecipe(item)}
                                        className="flex-1 py-2 px-3 rounded-full bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                                        title="Inspect recipe details"
                                    >
                                        <Terminal className="w-3.5 h-3.5" />
                                        <span>Inspect recipe</span>
                                    </button>
                                    {item.reproduction_command && (
                                        <button
                                            onClick={() => handleCopyCommand(idx, item.reproduction_command)}
                                            className="p-2 rounded-full bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 text-xs transition-colors cursor-pointer"
                                            title="Copy reproduction command"
                                        >
                                            {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 5. Detailed Performance & Latency Matrix (.surface-light) */}
                <div className="surface-light overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                    <div className="px-5 sm:px-6 py-4 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" /> Performance & latency metrics
                            </h3>
                        </div>
                        <span className="text-xs text-zinc-500 font-mono">Deltas (% and × multiplier) calculated relative to baseline ★</span>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="kicker text-zinc-500 bg-zinc-50/80 border-b border-zinc-200 select-none">
                                <tr>
                                    <th className="py-3.5 px-4 w-1/4">Metric</th>
                                    {comparedRecipes.map((r) => (
                                        <th key={r.id} className="py-3.5 px-4 text-zinc-900">
                                            <div className="truncate max-w-[220px]">{r.recipe_name}</div>
                                            {r.id === baselineRecipe.id && (
                                                <span className="text-tiny font-mono text-accent-600 normal-case block mt-0.5">★ Baseline</span>
                                            )}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/80 font-mono text-sm text-zinc-700">
                                {/* Per-Chip Throughput */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        Per-chip throughput (tok/s/chip)
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const perChipTps = getPerChipTps(r);
                                        const basePerChipTps = getPerChipTps(baselineRecipe);
                                        const delta = r.id !== baselineRecipe.id ? calculateDelta(perChipTps, basePerChipTps) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-zinc-900">
                                                <span className="font-semibold">{Math.round(perChipTps).toLocaleString()}</span>
                                                <span className="text-xs text-zinc-600 font-medium ml-1">/chip</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text}{delta.ratioText ? ` · ${delta.ratioText}` : ''})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* Total Throughput */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        Total cluster throughput (tok/s)
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const delta = r.id !== baselineRecipe.id ? calculateDelta(r.tokens_per_sec, baselineRecipe.tokens_per_sec) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-zinc-900">
                                                <span className="font-semibold">{Math.round(r.tokens_per_sec || 0).toLocaleString()}</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text}{delta.ratioText ? ` · ${delta.ratioText}` : ''})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* TTFT P50 */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        TTFT P50 latency
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const delta = r.id !== baselineRecipe.id ? calculateDelta(r.ttft_p50, baselineRecipe.ttft_p50, true) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-zinc-900">
                                                <span className="font-semibold">{r.ttft_p50 ? `${r.ttft_p50.toFixed(1)} ms` : '—'}</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text}{delta.ratioText ? ` · ${delta.ratioText}` : ''})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* TTFT P99 */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        TTFT P99 (tail latency)
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const p99 = r.metrics?.ttft_ms?.p99;
                                        const baseP99 = baselineRecipe.metrics?.ttft_ms?.p99;
                                        const delta = (r.id !== baselineRecipe.id && p99 && baseP99) ? calculateDelta(p99, baseP99, true) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-zinc-700">
                                                <span>{p99 ? `${p99.toFixed(1)} ms` : '—'}</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* ITL / TPOT */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        Time per output token (TPOT P50)
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const itl = r.itl_p50 ?? r.metrics?.itl_ms?.p50;
                                        const baseItl = baselineRecipe.itl_p50 ?? baselineRecipe.metrics?.itl_ms?.p50;
                                        const delta = (r.id !== baselineRecipe.id && itl && baseItl) ? calculateDelta(itl, baseItl, true) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-zinc-700">
                                                <span>{itl ? `${itl.toFixed(1)} ms` : '—'}</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* Cost / 1M Tokens */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        Cost / 1M tokens
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const cost = getCostPer1M(r);
                                        const baseCost = getCostPer1M(baselineRecipe);
                                        const delta = r.id !== baselineRecipe.id ? calculateDelta(cost, baseCost, true) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-emerald-700 font-semibold">
                                                <span>{cost != null ? `$${cost.toFixed(3)}` : '—'}</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>

                                {/* Tokens per Dollar */}
                                <tr className="hover:bg-zinc-50/80 transition-colors">
                                    <td className="py-3.5 px-4 font-sans font-medium text-zinc-600">
                                        Tokens / dollar ($)
                                    </td>
                                    {comparedRecipes.map((r) => {
                                        const tpd = r.cost_analysis?.tokens_per_dollar || 0;
                                        const baseTpd = baselineRecipe.cost_analysis?.tokens_per_dollar || 0;
                                        const delta = r.id !== baselineRecipe.id ? calculateDelta(tpd, baseTpd) : null;
                                        return (
                                            <td key={r.id} className="py-3.5 px-4 text-emerald-700 font-semibold">
                                                <span>{Math.round(tpd).toLocaleString()}</span>
                                                {delta && (
                                                    <span className={cn('text-xs ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                        ({delta.text})
                                                    </span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 6. Architecture, Container & Serving Stack Diff (Differing rows first, identical collapsed) */}
                <div className="surface-light overflow-hidden rounded-3xl border border-zinc-200 bg-white">
                    <div className="px-5 sm:px-6 py-4 bg-white border-b border-zinc-200 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-base font-semibold text-zinc-900 flex items-center gap-2">
                                <Layers className="w-4 h-4 text-accent-600" /> Serving parameters & configuration diff
                            </h3>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                            <span className="px-2.5 py-0.5 rounded-full bg-accent-50 border border-accent-200 font-mono text-micro font-semibold text-accent-800">
                                {parameterRows.differing.length} differing
                            </span>
                            {parameterRows.identical.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowIdenticalParams(!showIdenticalParams)}
                                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border border-zinc-200 bg-white hover:bg-zinc-50 font-mono text-micro font-medium text-zinc-700 cursor-pointer"
                                >
                                    <span>
                                        {showIdenticalParams
                                            ? `Hide ${parameterRows.identical.length} identical`
                                            : `Show ${parameterRows.identical.length} identical parameters`}
                                    </span>
                                    <ChevronDown className={cn('w-3 h-3 transition-transform', showIdenticalParams && 'rotate-180')} />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-sm">
                            <thead className="kicker text-zinc-500 bg-zinc-50/80 border-b border-zinc-200 select-none">
                                <tr>
                                    <th className="py-3.5 px-4 w-1/4">Parameter</th>
                                    {comparedRecipes.map((r) => (
                                        <th key={r.id} className="py-3.5 px-4 text-zinc-900">
                                            <div className="truncate max-w-[220px]">{r.recipe_name}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-200/80 font-mono text-sm text-zinc-700">
                                {visibleParamRows.map((row) => (
                                    <tr
                                        key={row.key}
                                        className={cn(
                                            'transition-colors',
                                            row.isDiff
                                                ? 'bg-accent-50/20 hover:bg-accent-50/40'
                                                : 'opacity-75 hover:bg-zinc-50/80'
                                        )}
                                    >
                                        <td className="py-3 px-4 font-sans font-medium text-zinc-700">
                                            <div className="flex items-center gap-2">
                                                <span>{row.label}</span>
                                                {row.isDiff ? (
                                                    <span className="px-1.5 py-0.2 rounded bg-accent-50 text-accent-700 border border-accent-200 font-mono text-tiny font-semibold uppercase">
                                                        Diff
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-500 font-mono text-tiny">
                                                        Same
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        {comparedRecipes.map((r) => (
                                            <td key={r.id} className="py-3 px-4">
                                                {row.render(r)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* 7. Reproduction CLI Commands Row (.surface-light) */}
                <div className="surface-light space-y-3 pb-8">
                    <h3 className="text-sm font-semibold text-zinc-900 flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-accent-600" /> Reproduction CLI commands
                    </h3>
                    <div className={cn('grid gap-3', gridColsClass)}>
                        {comparedRecipes.map((r, idx) => (
                            <div key={r.id} className="bg-white p-4 rounded-2xl border border-zinc-200 text-xs font-mono flex flex-col justify-between">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-zinc-900 font-semibold truncate">{r.recipe_name}</span>
                                    {r.reproduction_command && (
                                        <button
                                            onClick={() => handleCopyCommand(idx, r.reproduction_command)}
                                            className="text-accent-600 hover:text-accent-700 flex items-center gap-1 cursor-pointer font-semibold"
                                        >
                                            {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                            <span>{copiedIndex === idx ? 'Copied' : 'Copy CLI'}</span>
                                        </button>
                                    )}
                                </div>
                                <div className="text-zinc-200 break-all select-all bg-zinc-950 p-3 rounded-xl border border-zinc-800 mt-1 leading-relaxed text-tiny">
                                    {r.reproduction_command || 'inference-perf --config_file config.yml'}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* 8. Inspect Recipe Slide-Over Drawer */}
            <RecipeDetailDrawer
                isOpen={isDrawerOpen}
                onClose={() => setIsDrawerOpen(false)}
                recipe={drawerRecipe}
                onNavigate={onNavigate}
            />
        </div>
    );
}
