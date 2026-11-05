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
import { UploadCloud, RotateCcw, FilterX, Inbox, MessageSquarePlus, Database, Eye } from 'lucide-react';
import { WellLitHeader } from '../ui/WellLitHeader.jsx';
import { Button } from '../ui/Button.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import LeaderboardSummaryCards from './LeaderboardSummaryCards.jsx';
import MetricFiltersBar from './MetricFiltersBar.jsx';
import LeaderboardAsk from './LeaderboardAsk.jsx';
import ParetoCurveChart from './ParetoCurveChart.jsx';
import LeaderboardTable from './LeaderboardTable.jsx';
import PricingConfigModal from './PricingConfigModal.jsx';
import RecipeDetailDrawer from './RecipeDetailDrawer.jsx';
import LeaderboardFeedbackModal from './LeaderboardFeedbackModal.jsx';
import { SUBMIT, METHODOLOGY } from '../layout/navigation.js';
import { readInstanceMode } from '../ResultsStore/instance.js';
import {
    buildLeaderboardDataset,
    evaluateDatasetAtSlo,
    SEED_LEADERBOARD_RECIPES
} from '../../utils/leaderboardData.js';
import { loadPublishedResults, RESULTS_WORKSPACE_KEY } from '../../utils/leaderboardSources.js';
import {
    DEFAULT_OBJECTIVE,
    DEFAULT_SLO,
    normalizeObjective,
    objectiveFor,
    workloadFor,
    matchesSearchQuery,
    readSloParams,
    writeSloParams,
    latencyFor,
    removeDimensionTokens,
    removeQueryToken,
} from '../../utils/leaderboardFacets.js';
import { pickDefaultScope, annotateModelWorkloadGroupRanks } from '../../utils/runParity.js';
import { loadCustomPricingRates, saveCustomPricingRates } from '../../utils/pricingEngine.js';

// "a code generation run", "an offline batch run".
const withArticle = (phrase) => `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;

const VALID_CURVE_MODES = ['stack', 'hardware', 'overall'];
const VALID_X_METRICS = ['ttft_p50', 'itl_p50', 'output_tokens_per_sec', 'workload.concurrency'];
const VALID_Y_METRICS = ['tokens_per_sec_per_chip', 'tokens_per_sec', 'tokens_per_dollar'];
const VALID_SCALE_MODES = ['linear', 'log'];

const currentParams = () => {
    try {
        return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    } catch {
        return new URLSearchParams();
    }
};

// Samples are shown by default only while nothing has been published, so the
// page is never empty but real results never sit behind made-up ones.
const readInitialState = (navigationParams, publishedEntries) => {
    const params = currentParams();
    const defaultIncludeSamples = publishedEntries.length === 0;
    const samplesParam = params.get('samples');
    const includeSamples = samplesParam === '1' ? true : samplesParam === '0' ? false : defaultIncludeSamples;

    const modelParam = navigationParams?.model ?? params.get('model');
    const workloadParam = navigationParams?.workload ?? params.get('workload');
    const hwParam = navigationParams?.hardware ?? params.get('hardware');
    const engineParam = navigationParams?.engine ?? params.get('engine');
    const sortParam = navigationParams?.sort ?? params.get('sort');
    const qParam = params.get('q') || '';
    const curvesParam = params.get('curves');
    const xParam = params.get('x');
    const yParam = params.get('y');
    const scaleParam = params.get('scale');
    const recipeParam = navigationParams?.recipe ?? params.get('recipe');
    const slo = readSloParams(params);

    const initialHardware = hwParam || 'all';
    const initialEngine = engineParam || 'all';
    const initialWorkloadHint = workloadParam && (workloadParam === 'all' || workloadFor(workloadParam)) ? workloadParam : null;
    const hasQueryModel = /(?:^|\s)model:/i.test(qParam);

    const scopePool = buildLeaderboardDataset({
        seedRecipes: includeSamples ? SEED_LEADERBOARD_RECIPES : [],
        publishedResults: publishedEntries,
    });
    const defaultScope = pickDefaultScope(scopePool, {
        workload: initialWorkloadHint || 'all',
        hardware: initialHardware,
        engine: initialEngine,
    });

    return {
        defaultIncludeSamples,
        includeSamples,
        searchQuery: qParam,
        model: modelParam ? modelParam : hasQueryModel ? 'all' : defaultScope.model,
        workload: initialWorkloadHint
            ? initialWorkloadHint
            : modelParam === 'all' || hasQueryModel
                ? 'all'
                : defaultScope.workload,
        hardware: initialHardware,
        engine: initialEngine,
        rankingMetric: sortParam ? normalizeObjective(sortParam) : DEFAULT_OBJECTIVE,
        maxTtftSla: slo.ttft,
        maxTpotSla: slo.tpot,
        slaPercentile: slo.percentile,
        chartCurveMode: VALID_CURVE_MODES.includes(curvesParam) ? curvesParam : 'stack',
        chartXMetric: VALID_X_METRICS.includes(xParam) ? xParam : 'ttft_p50',
        chartYMetric: VALID_Y_METRICS.includes(yParam) ? yParam : 'tokens_per_sec_per_chip',
        chartScaleMode: VALID_SCALE_MODES.includes(scaleParam) ? scaleParam : 'linear',
        selectedRecipeId: recipeParam || null,
        isRecipeDrawerOpen: Boolean(recipeParam),
    };
};

// Rows that meet the SLO rank first, then rows that miss it, then rows whose
// numbers can't be checked because the run never recorded that percentile.
const missOrder = (r) => (!r.missesSlo ? 0 : r.sloReason === 'not-recorded' ? 2 : 1);
const numberOr = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

export default function LeaderboardDashboard({
    onNavigate,
    onNavigateBack,
    onToggleMobileNav,
    navigationParams
}) {
    const instance = useMemo(() => readInstanceMode(), []);
    const [published, setPublished] = useState(() => loadPublishedResults({ instance }));
    const [initial] = useState(() => readInitialState(navigationParams, published.entries));

    // Results published in another tab show up without a reload.
    useEffect(() => {
        const onStorage = (e) => {
            if (e.key === RESULTS_WORKSPACE_KEY) setPublished(loadPublishedResults({ instance }));
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [instance]);

    // Filter and metric states
    const [includeSamples, setIncludeSamples] = useState(initial.includeSamples);
    const [searchQuery, setSearchQuery] = useState(initial.searchQuery);
    const [selectedModelFamily, setSelectedModelFamily] = useState(initial.model);
    const [selectedWorkload, setSelectedWorkload] = useState(initial.workload);
    const [selectedHardware, setSelectedHardware] = useState(initial.hardware);
    const [selectedEngine, setSelectedEngine] = useState(initial.engine);
    const [rankingMetric, setRankingMetric] = useState(initial.rankingMetric);
    const [maxTtftSla, setMaxTtftSla] = useState(initial.maxTtftSla);
    const [maxTpotSla, setMaxTpotSla] = useState(initial.maxTpotSla);
    const [slaPercentile, setSlaPercentile] = useState(initial.slaPercentile);

    // Chart state synced with URL
    const [chartCurveMode, setChartCurveMode] = useState(initial.chartCurveMode);
    const [chartXMetric, setChartXMetric] = useState(initial.chartXMetric);
    const [chartYMetric, setChartYMetric] = useState(initial.chartYMetric);
    const [chartScaleMode, setChartScaleMode] = useState(initial.chartScaleMode);

    // Modals and Drawers
    const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
    const [isRecipeDrawerOpen, setIsRecipeDrawerOpen] = useState(initial.isRecipeDrawerOpen);
    const [selectedRecipeId, setSelectedRecipeId] = useState(initial.selectedRecipeId);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: 'missing_workload',
        recipe: null
    });

    // Two-way synchronization between sentence dropdowns and search query tokens
    const handleModelChange = (model) => {
        setSelectedModelFamily(model);
        setSearchQuery((prev) => removeDimensionTokens(prev, 'model'));
    };

    const handleWorkloadChange = (workload) => {
        setSelectedWorkload(workload);
        setSearchQuery((prev) => removeDimensionTokens(prev, 'workload'));
    };

    const handleHardwareChange = (hardware) => {
        setSelectedHardware(hardware);
        setSearchQuery((prev) => removeDimensionTokens(prev, 'hardware'));
    };

    const handleEngineChange = (engine) => {
        setSelectedEngine(engine);
        setSearchQuery((prev) => removeDimensionTokens(prev, 'engine'));
    };

    // Sync incoming navigationParams changes during render
    const [prevNavParams, setPrevNavParams] = useState(navigationParams);
    if (navigationParams !== prevNavParams) {
        setPrevNavParams(navigationParams);
        if (navigationParams) {
            if (navigationParams.model) setSelectedModelFamily(navigationParams.model);
            if (navigationParams.workload && (navigationParams.workload === 'all' || workloadFor(navigationParams.workload))) {
                setSelectedWorkload(navigationParams.workload);
            }
            if (navigationParams.hardware) setSelectedHardware(navigationParams.hardware);
            if (navigationParams.engine) setSelectedEngine(navigationParams.engine);
            if (navigationParams.sort) setRankingMetric(normalizeObjective(navigationParams.sort));
            if (navigationParams.recipe) {
                setSelectedRecipeId(navigationParams.recipe);
                setIsRecipeDrawerOpen(true);
            }
        }
    }

    const handleOpenFeedback = (type = 'missing_workload', recipe = null) => {
        setFeedbackModal({
            isOpen: true,
            type,
            recipe
        });
    };

    // Comparison and Baseline states
    const [selectedForCompare, setSelectedForCompare] = useState([]);
    const [baselineRecipeId, setBaselineRecipeId] = useState(null);

    // Custom Pricing Overrides State
    const [customPricing, setCustomPricing] = useState(() => loadCustomPricingRates());

    const handleSaveRates = (newRates) => {
        setCustomPricing(newRates);
        saveCustomPricingRates(newRates);
    };

    const handleResetDefaults = () => {
        setCustomPricing({});
        saveCustomPricingRates({});
    };

    // Up to three setups; a fourth checkbox stays disabled until one is cleared.
    const handleToggleCompare = (recipeId) => {
        setSelectedForCompare((prev) => {
            if (prev.includes(recipeId)) return prev.filter((id) => id !== recipeId);
            return prev.length >= 3 ? prev : [...prev, recipeId];
        });
    };

    // Deep-linking: Synchronize state to URL without reloading
    useEffect(() => {
        try {
            if (typeof window === 'undefined') return;
            const current = new URLSearchParams(window.location.search);
            const params = new URLSearchParams();
            if (current.get('view')) params.set('view', current.get('view'));
            if (current.get('instance')) params.set('instance', current.get('instance'));
            if (searchQuery.trim()) params.set('q', searchQuery.trim());
            params.set('model', selectedModelFamily);
            params.set('workload', selectedWorkload);
            if (selectedHardware !== 'all') params.set('hardware', selectedHardware);
            if (selectedEngine !== 'all') params.set('engine', selectedEngine);
            if (rankingMetric !== DEFAULT_OBJECTIVE) params.set('sort', rankingMetric);
            writeSloParams(params, { ttft: maxTtftSla, tpot: maxTpotSla, percentile: slaPercentile });
            if (includeSamples !== initial.defaultIncludeSamples) params.set('samples', includeSamples ? '1' : '0');
            if (chartCurveMode !== 'stack') params.set('curves', chartCurveMode);
            if (chartXMetric !== 'ttft_p50') params.set('x', chartXMetric);
            if (chartYMetric !== 'tokens_per_sec_per_chip') params.set('y', chartYMetric);
            if (chartScaleMode !== 'linear') params.set('scale', chartScaleMode);
            if (selectedRecipeId && isRecipeDrawerOpen) params.set('recipe', selectedRecipeId);

            const queryString = params.toString();
            const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
            window.history.replaceState(null, '', newUrl);
        } catch {
            // ignore URL state errors
        }
    }, [
        searchQuery,
        selectedModelFamily,
        selectedWorkload,
        selectedHardware,
        selectedEngine,
        rankingMetric,
        maxTtftSla,
        maxTpotSla,
        slaPercentile,
        includeSamples,
        initial.defaultIncludeSamples,
        chartCurveMode,
        chartXMetric,
        chartYMetric,
        chartScaleMode,
        selectedRecipeId,
        isRecipeDrawerOpen,
    ]);

    // Published Results Store results, plus the illustrative samples when shown.
    const rawDataset = useMemo(() => {
        return buildLeaderboardDataset({
            seedRecipes: includeSamples ? SEED_LEADERBOARD_RECIPES : [],
            publishedResults: published.entries,
            customPricing,
        });
    }, [includeSamples, published.entries, customPricing]);

    // Each run's operating point at the active SLO: every number on its row comes from it.
    const evaluatedDataset = useMemo(() => {
        return evaluateDatasetAtSlo(rawDataset, {
            maxTtftSla,
            maxTpotSla,
            slaPercentile
        });
    }, [rawDataset, maxTtftSla, maxTpotSla, slaPercentile]);

    const availableModels = useMemo(
        () => [...new Set(evaluatedDataset.map((d) => d.model_family).filter(Boolean))],
        [evaluatedDataset]
    );

    // Filter and rank dataset
    const filteredDataset = useMemo(() => {
        const filtered = evaluatedDataset.filter(item => {
            if (searchQuery.trim() && !matchesSearchQuery(item, searchQuery)) {
                return false;
            }
            if (selectedModelFamily !== 'all' && item.model_family !== selectedModelFamily) {
                return false;
            }
            if (selectedWorkload !== 'all' && item.workload_class !== selectedWorkload) {
                return false;
            }
            if (selectedHardware !== 'all' && item.hardware?.accelerator_type !== selectedHardware) {
                return false;
            }
            if (selectedEngine !== 'all' && item.stack?.engine !== selectedEngine) {
                return false;
            }
            return true;
        });

        // Latency objectives rank at the active percentile, the same one every
        // latency column shows.
        const compareRuns = (a, b) => {
            const byMiss = missOrder(a) - missOrder(b);
            if (byMiss) return byMiss;
            if (rankingMetric === 'ttft_p50') {
                return numberOr(latencyFor(a, 'ttft', slaPercentile), 1e12) - numberOr(latencyFor(b, 'ttft', slaPercentile), 1e12);
            }
            if (rankingMetric === 'itl_p50') {
                return numberOr(latencyFor(a, 'itl', slaPercentile), 1e12) - numberOr(latencyFor(b, 'itl', slaPercentile), 1e12);
            }
            if (rankingMetric === 'cost_per_1m') {
                return numberOr(a.cost_per_1m, 1e12) - numberOr(b.cost_per_1m, 1e12);
            }
            return numberOr(b.tokens_per_sec_per_chip, 0) - numberOr(a.tokens_per_sec_per_chip, 0);
        };

        const sorted = filtered.sort(compareRuns);
        return annotateModelWorkloadGroupRanks(sorted, compareRuns);
    }, [
        evaluatedDataset,
        searchQuery,
        selectedModelFamily,
        selectedWorkload,
        selectedHardware,
        selectedEngine,
        rankingMetric,
        slaPercentile,
    ]);

    const sloCounts = useMemo(() => ({
        overLimit: filteredDataset.filter((r) => r.missesSlo && r.sloReason !== 'not-recorded').length,
        notRecorded: filteredDataset.filter((r) => r.missesSlo && r.sloReason === 'not-recorded').length,
    }), [filteredDataset]);

    const isScoped = selectedModelFamily !== 'all' || selectedWorkload !== 'all' || selectedHardware !== 'all' || selectedEngine !== 'all';
    const isGroupedByModel = selectedModelFamily === 'all';

    const publishedCount = published.entries.length;
    const sampleCount = includeSamples ? SEED_LEADERBOARD_RECIPES.length : 0;
    const selectedWorkloadMeta = workloadFor(selectedWorkload);
    const isUnmeasuredWorkload = Boolean(selectedWorkloadMeta) && !evaluatedDataset.some((r) => r.workload_class === selectedWorkload);

    const handleResetAllFilters = () => {
        const defaultScope = pickDefaultScope(rawDataset);
        setSearchQuery('');
        setSelectedModelFamily(defaultScope.model);
        setSelectedWorkload(defaultScope.workload);
        setSelectedHardware('all');
        setSelectedEngine('all');
        setMaxTtftSla(DEFAULT_SLO.ttft);
        setMaxTpotSla(DEFAULT_SLO.tpot);
        setSlaPercentile(DEFAULT_SLO.percentile);
        setRankingMetric(DEFAULT_OBJECTIVE);
    };

    const handleToggleSamples = () => {
        const next = !includeSamples;
        setIncludeSamples(next);
        // Hiding samples drops only the sample picks; real ones stay selected.
        if (!next) {
            const sampleIds = new Set(SEED_LEADERBOARD_RECIPES.map((r) => r.id));
            setSelectedForCompare((prev) => prev.filter((id) => !sampleIds.has(id)));
            setBaselineRecipeId((prev) => (prev && sampleIds.has(prev) ? null : prev));
        }
        // Re-scope to where the data is, so hiding samples never strands the
        // sentence on a model that only samples had.
        const pool = buildLeaderboardDataset({
            seedRecipes: next ? SEED_LEADERBOARD_RECIPES : [],
            publishedResults: published.entries,
        });
        if (selectedModelFamily !== 'all' && !pool.some((r) => r.model_family === selectedModelFamily)) {
            const scope = pickDefaultScope(pool);
            setSelectedModelFamily(scope.model);
            setSelectedWorkload(scope.workload);
        }
    };

    const go = (e, view) => {
        if (!onNavigate || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate(view);
    };

    const handleSelectRecipe = (recipe) => {
        setSelectedRecipeId(recipe.id);
        setIsRecipeDrawerOpen(true);
        setTimeout(() => {
            const rowElem = document.getElementById(`recipe-row-${recipe.id}`);
            if (rowElem) {
                rowElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    };

    const selectedRecipe = useMemo(
        () => (selectedRecipeId ? evaluatedDataset.find((r) => r.id === selectedRecipeId) || null : null),
        [evaluatedDataset, selectedRecipeId]
    );

    // The Comparison page reads the SLO from the URL, which carries over within
    // the leaderboard flow, so it evaluates every setup at the same points.
    const openComparison = (ids, baseline) => {
        if (ids.length < 2) return;
        if (onNavigate) {
            onNavigate('recipe-comparison', { recipes: ids, baseline });
            return;
        }
        const params = currentParams();
        params.set('view', 'recipe-comparison');
        params.set('recipes', ids.join(','));
        params.set('baseline', baseline);
        window.location.assign(`${window.location.pathname}?${params.toString()}`);
    };

    const handleOpenCompare = () => {
        let ids = [...selectedForCompare];
        if (baselineRecipeId && !ids.includes(baselineRecipeId)) ids = [baselineRecipeId, ...ids].slice(0, 3);
        openComparison(ids, baselineRecipeId && ids.includes(baselineRecipeId) ? baselineRecipeId : ids[0]);
    };

    const handleCompareWithBaseline = (recipeId) => {
        if (!baselineRecipeId || recipeId === baselineRecipeId) return;
        openComparison([baselineRecipeId, recipeId], baselineRecipeId);
    };

    const clearFiltersButton = (
        <Button variant="secondary" size="sm" onClick={handleResetAllFilters}>
            <RotateCcw className="w-3.5 h-3.5" />
            Reset scope
        </Button>
    );

    const scopeLabel = selectedModelFamily !== 'all'
        ? `${selectedModelFamily}${selectedWorkloadMeta ? ` · ${selectedWorkloadMeta.label}` : ''}`
        : 'Multiple models';

    const slo = { ttft: maxTtftSla, tpot: maxTpotSla, percentile: slaPercentile };
    const nothingToRank = rawDataset.length === 0;

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-x-hidden">
            {/* Editorial Page Header */}
            <WellLitHeader
                kicker="Leaderboard"
                pageTitle="Find the top-performing serving stack"
                subtitle="Compare throughput and latency across models, accelerators, and serving stacks. Every run is ranked at a load it can actually serve."
                badgeLabel={null}
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
                getShareUrl={() => typeof window !== 'undefined' ? window.location.href : ''}
                extraActions={
                    <Button
                        variant="ghost"
                        size="sm"
                        href={`?view=${METHODOLOGY.view}`}
                        onClick={(e) => go(e, METHODOLOGY.view)}
                        className="h-9 text-zinc-600 hover:text-zinc-900"
                    >
                        {METHODOLOGY.label}
                    </Button>
                }
            />

            {/* Main Content Dashboard Container */}
            <div className="mx-auto max-w-6xl w-full px-4 sm:px-6 py-5 space-y-4 z-10">
                {/* 1. Unified Scope & Filter Card (Natural-language sentence + search, SLO operating point, pricing) */}
                <div>
                    <LeaderboardAsk
                        dataset={evaluatedDataset}
                        results={filteredDataset}
                        rankingMetric={rankingMetric}
                        setRankingMetric={setRankingMetric}
                        selectedModelFamily={selectedModelFamily}
                        setSelectedModelFamily={handleModelChange}
                        selectedWorkload={selectedWorkload}
                        setSelectedWorkload={handleWorkloadChange}
                        selectedHardware={selectedHardware}
                        setSelectedHardware={handleHardwareChange}
                        selectedEngine={selectedEngine}
                        setSelectedEngine={handleEngineChange}
                        availableModels={availableModels}
                        matchCount={filteredDataset.length}
                        overLimitCount={sloCounts.overLimit}
                        notRecordedCount={sloCounts.notRecorded}
                        publishedCount={publishedCount}
                        sampleCount={sampleCount}
                        includeSamples={includeSamples}
                        onToggleSamples={handleToggleSamples}
                        skippedResults={published.skipped}
                        instance={instance}
                        onOpenFeedback={handleOpenFeedback}
                    />
                    <MetricFiltersBar
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        onRemoveQueryToken={(rawToken) => setSearchQuery((prev) => removeQueryToken(prev, rawToken))}
                        selectedWorkload={selectedWorkload}
                        isScoped={isScoped}
                        maxTtftSla={maxTtftSla}
                        setMaxTtftSla={setMaxTtftSla}
                        maxTpotSla={maxTpotSla}
                        setMaxTpotSla={setMaxTpotSla}
                        slaPercentile={slaPercentile}
                        setSlaPercentile={setSlaPercentile}
                        onOpenPricingModal={() => setIsPricingModalOpen(true)}
                        onResetFilters={handleResetAllFilters}
                        hasCustomPricing={Object.keys(customPricing || {}).length > 0}
                    />
                </div>

                {nothingToRank ? (
                    <div className="surface-light rounded-3xl border border-zinc-200 bg-white">
                        <EmptyState
                            icon={<Database className="w-9 h-9 text-zinc-400 mx-auto" />}
                            title="Nothing published yet"
                            message="The Leaderboard ranks results once they're published from the Results Store. Publish one there, or show the illustrative samples to see how ranking works."
                            action={
                                <div className="flex flex-wrap items-center justify-center gap-2">
                                    <Button variant="primary" size="sm" href="?view=results-store" onClick={(e) => go(e, 'results-store')}>
                                        <UploadCloud className="w-3.5 h-3.5" />
                                        Open the Results Store
                                    </Button>
                                    <Button variant="secondary" size="sm" onClick={handleToggleSamples}>
                                        <Eye className="w-3.5 h-3.5" />
                                        Show samples
                                    </Button>
                                </div>
                            }
                        />
                    </div>
                ) : filteredDataset.length === 0 ? (
                    <div className="surface-light rounded-3xl border border-zinc-200 bg-white">
                        {isUnmeasuredWorkload ? (
                            <EmptyState
                                icon={<Inbox className="w-9 h-9 text-zinc-400 mx-auto" />}
                                title={`No ${selectedWorkloadMeta.label} runs yet`}
                                message={`Be the first to submit ${withArticle(selectedWorkloadMeta.display)} run, or request a benchmark for this workload.`}
                                action={
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        <Button variant="primary" size="sm" href={`?view=${SUBMIT.view}`} onClick={(e) => go(e, SUBMIT.view)}>
                                            <UploadCloud className="w-3.5 h-3.5" />
                                            {SUBMIT.label}
                                        </Button>
                                        <Button variant="secondary" size="sm" onClick={() => handleOpenFeedback('missing_workload')}>
                                            <MessageSquarePlus className="w-3.5 h-3.5" />
                                            Request this workload
                                        </Button>
                                        {clearFiltersButton}
                                    </div>
                                }
                            />
                        ) : (
                            <EmptyState
                                icon={<FilterX className="w-9 h-9 text-zinc-400 mx-auto" />}
                                title="No runs match these filters"
                                message="Broaden the sentence above, clear the search query, or request a benchmark for this configuration."
                                action={
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        <Button variant="primary" size="sm" onClick={() => handleOpenFeedback('missing_workload')}>
                                            <MessageSquarePlus className="w-3.5 h-3.5" />
                                            Request this configuration
                                        </Button>
                                        {clearFiltersButton}
                                    </div>
                                }
                            />
                        )}
                    </div>
                ) : (
                    <>
                        {/* 2. Compact #1 Top-Entry Strip */}
                        <LeaderboardSummaryCards
                            dataset={filteredDataset}
                            isGroupedByModel={isGroupedByModel}
                            onSelectModel={handleModelChange}
                            onSelectRecipe={handleSelectRecipe}
                            objective={objectiveFor(rankingMetric)}
                            latencyPercentile={slaPercentile}
                            slo={slo}
                            customPricing={customPricing}
                            onOpenPricingModal={() => setIsPricingModalOpen(true)}
                        />

                        {/* 3. Overlaid Concurrency Curves & Pareto Frontier Chart */}
                        <ParetoCurveChart
                            dataset={filteredDataset}
                            isComparableScope={selectedModelFamily !== 'all' && selectedWorkload !== 'all'}
                            scopeLabel={scopeLabel}
                            curveGroupMode={chartCurveMode}
                            onCurveGroupModeChange={setChartCurveMode}
                            latencyMetric={chartXMetric}
                            onLatencyMetricChange={setChartXMetric}
                            throughputMetric={chartYMetric}
                            onThroughputMetricChange={setChartYMetric}
                            scaleMode={chartScaleMode}
                            onScaleModeChange={setChartScaleMode}
                            maxTtftSla={maxTtftSla}
                            maxTpotSla={maxTpotSla}
                            slaPercentile={slaPercentile}
                            onSelectRecipe={handleSelectRecipe}
                            selectedRecipe={selectedRecipe}
                        />

                        {/* 4. Ranked Configurations Table */}
                        <LeaderboardTable
                            dataset={filteredDataset}
                            rankingMetric={rankingMetric}
                            onChangeRankingMetric={setRankingMetric}
                            isGroupedByModel={isGroupedByModel}
                            latencyPercentile={slaPercentile}
                            slo={slo}
                            onSelectRecipe={handleSelectRecipe}
                            selectedRecipe={selectedRecipe}
                            selectedForCompare={selectedForCompare}
                            onToggleCompare={handleToggleCompare}
                            onOpenCompareModal={handleOpenCompare}
                            baselineRecipeId={baselineRecipeId}
                            onSetBaseline={setBaselineRecipeId}
                            onCompareWithBaseline={handleCompareWithBaseline}
                            onResetFilters={handleResetAllFilters}
                            onClearCompare={() => setSelectedForCompare([])}
                            onOpenFeedback={handleOpenFeedback}
                            onNavigate={onNavigate}
                        />
                    </>
                )}
            </div>

            {/* Modals & Drawers */}
            <PricingConfigModal
                isOpen={isPricingModalOpen}
                onClose={() => setIsPricingModalOpen(false)}
                customRates={customPricing}
                onSaveRates={handleSaveRates}
                onResetDefaults={handleResetDefaults}
            />

            <RecipeDetailDrawer
                isOpen={isRecipeDrawerOpen}
                onClose={() => setIsRecipeDrawerOpen(false)}
                recipe={selectedRecipe}
                latencyPercentile={slaPercentile}
                slo={slo}
                onNavigate={onNavigate}
                onOpenFeedback={(type, recipe) => {
                    setIsRecipeDrawerOpen(false);
                    handleOpenFeedback(type, recipe);
                }}
            />

            <LeaderboardFeedbackModal
                isOpen={feedbackModal.isOpen}
                onClose={() => setFeedbackModal(prev => ({ ...prev, isOpen: false }))}
                initialType={feedbackModal.type}
                targetRecipe={feedbackModal.recipe}
                activeFilters={{
                    model: selectedModelFamily,
                    workload: selectedWorkload,
                    hardware: selectedHardware,
                    engine: selectedEngine
                }}
                onNavigate={onNavigate}
            />
        </div>
    );
}
