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
import { UploadCloud, RotateCcw, FilterX, Inbox, MessageSquarePlus } from 'lucide-react';
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
import RecipeComparisonModal from './RecipeComparisonModal.jsx';
import LeaderboardFeedbackModal from './LeaderboardFeedbackModal.jsx';
import { SUBMIT, METHODOLOGY } from '../layout/navigation.js';
import {
    buildLeaderboardDataset,
    evaluateDatasetAtSlo,
    SEED_LEADERBOARD_RECIPES
} from '../../utils/leaderboardData.js';
import {
    DEFAULT_OBJECTIVE,
    normalizeObjective,
    objectiveFor,
    workloadFor,
    matchesSearchQuery,
    DEFAULT_SLA_PERCENTILE,
    normalizePercentile,
    latencyFor,
    removeDimensionTokens,
    removeQueryToken,
} from '../../utils/leaderboardFacets.js';
import { pickDefaultScope, annotateModelWorkloadGroupRanks } from '../../utils/runParity.js';
import { loadCustomPricingRates, saveCustomPricingRates } from '../../utils/pricingEngine.js';
import { recordRecipeView, getRecipeReproductionCount } from '../../utils/communityRewards.js';

// "a code generation run", "an offline batch run".
const withArticle = (phrase) => `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;

const VALID_CURVE_MODES = ['stack', 'hardware', 'overall'];
const VALID_X_METRICS = ['ttft_p50', 'itl_p50', 'output_tokens_per_sec', 'workload.concurrency'];
const VALID_Y_METRICS = ['tokens_per_sec_per_chip', 'tokens_per_sec', 'tokens_per_dollar'];
const VALID_SCALE_MODES = ['linear', 'log'];

const readInitialUrlParams = (navigationParams) => {
    try {
        const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
        const modelParam = navigationParams?.model ?? params.get('model');
        const workloadParam = navigationParams?.workload ?? params.get('workload');
        const hwParam = navigationParams?.hardware ?? params.get('hardware');
        const engineParam = navigationParams?.engine ?? params.get('engine');
        const sortParam = navigationParams?.sort ?? params.get('sort');
        const ttftParam = params.get('ttft_sla');
        const tpotParam = params.get('tpot_sla');
        const slaPctParam = params.get('sla_pct');
        const qParam = params.get('q') || '';
        const curvesParam = params.get('curves');
        const xParam = params.get('x');
        const yParam = params.get('y');
        const scaleParam = params.get('scale');
        const recipeParam = navigationParams?.recipe ?? params.get('recipe');
        const seedMatch = recipeParam ? SEED_LEADERBOARD_RECIPES.find((r) => r.id === recipeParam) : null;

        const initialHardware = hwParam || 'all';
        const initialEngine = engineParam || 'all';
        const initialWorkloadHint = workloadParam && (workloadParam === 'all' || workloadFor(workloadParam)) ? workloadParam : null;
        const hasQueryModel = /(?:^|\s)model:/i.test(qParam);

        const defaultScope = pickDefaultScope(SEED_LEADERBOARD_RECIPES, {
            workload: initialWorkloadHint || 'all',
            hardware: initialHardware,
            engine: initialEngine,
        });

        const resolvedModel = modelParam
            ? modelParam
            : hasQueryModel
                ? 'all'
                : defaultScope.model;

        const resolvedWorkload = initialWorkloadHint
            ? initialWorkloadHint
            : modelParam === 'all' || hasQueryModel
                ? 'all'
                : defaultScope.workload;

        return {
            searchQuery: qParam,
            model: resolvedModel,
            workload: resolvedWorkload,
            hardware: initialHardware,
            engine: initialEngine,
            rankingMetric: sortParam ? normalizeObjective(sortParam) : DEFAULT_OBJECTIVE,
            maxTtftSla: ttftParam ? Number(ttftParam) : null,
            maxTpotSla: tpotParam ? Number(tpotParam) : null,
            slaPercentile: normalizePercentile(slaPctParam, DEFAULT_SLA_PERCENTILE),
            chartCurveMode: VALID_CURVE_MODES.includes(curvesParam) ? curvesParam : 'stack',
            chartXMetric: VALID_X_METRICS.includes(xParam) ? xParam : 'ttft_p50',
            chartYMetric: VALID_Y_METRICS.includes(yParam) ? yParam : 'tokens_per_sec_per_chip',
            chartScaleMode: VALID_SCALE_MODES.includes(scaleParam) ? scaleParam : 'linear',
            selectedRecipe: seedMatch || null,
            isRecipeDrawerOpen: Boolean(seedMatch),
        };
    } catch {
        const fallbackScope = pickDefaultScope(SEED_LEADERBOARD_RECIPES);
        return {
            searchQuery: '',
            model: fallbackScope.model,
            workload: fallbackScope.workload,
            hardware: 'all',
            engine: 'all',
            rankingMetric: DEFAULT_OBJECTIVE,
            maxTtftSla: null,
            maxTpotSla: null,
            slaPercentile: DEFAULT_SLA_PERCENTILE,
            chartCurveMode: 'stack',
            chartXMetric: 'ttft_p50',
            chartYMetric: 'tokens_per_sec_per_chip',
            chartScaleMode: 'linear',
            selectedRecipe: null,
            isRecipeDrawerOpen: false,
        };
    }
};

export default function LeaderboardDashboard({
    onNavigate,
    onNavigateBack,
    onToggleMobileNav,
    dashboardData,
    navigationParams
}) {
    const [initial] = useState(() => readInitialUrlParams(navigationParams));

    // Filter and metric states
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
    const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
    const [selectedRecipe, setSelectedRecipe] = useState(initial.selectedRecipe);
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
                const seedMatch = SEED_LEADERBOARD_RECIPES.find((r) => r.id === navigationParams.recipe);
                if (seedMatch) {
                    setSelectedRecipe(seedMatch);
                    setIsRecipeDrawerOpen(true);
                }
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

    const handleToggleCompare = (recipeId) => {
        setSelectedForCompare(prev => {
            if (prev.includes(recipeId)) {
                return prev.filter(id => id !== recipeId);
            }
            if (prev.length >= 3) {
                return [prev[1], prev[2], recipeId];
            }
            return [...prev, recipeId];
        });
    };

    // Deep-linking: Synchronize state to URL without reloading
    useEffect(() => {
        try {
            if (typeof window === 'undefined') return;
            const current = new URLSearchParams(window.location.search);
            const params = new URLSearchParams();
            if (current.get('view')) params.set('view', current.get('view'));
            if (searchQuery.trim()) params.set('q', searchQuery.trim());
            params.set('model', selectedModelFamily);
            params.set('workload', selectedWorkload);
            if (selectedHardware !== 'all') params.set('hardware', selectedHardware);
            if (selectedEngine !== 'all') params.set('engine', selectedEngine);
            if (rankingMetric !== DEFAULT_OBJECTIVE) params.set('sort', rankingMetric);
            if (maxTtftSla !== null && maxTtftSla !== undefined) params.set('ttft_sla', String(maxTtftSla));
            if (maxTpotSla !== null && maxTpotSla !== undefined) params.set('tpot_sla', String(maxTpotSla));
            if (slaPercentile !== DEFAULT_SLA_PERCENTILE || maxTtftSla !== null || maxTpotSla !== null) {
                params.set('sla_pct', slaPercentile);
            }
            if (chartCurveMode !== 'stack') params.set('curves', chartCurveMode);
            if (chartXMetric !== 'ttft_p50') params.set('x', chartXMetric);
            if (chartYMetric !== 'tokens_per_sec_per_chip') params.set('y', chartYMetric);
            if (chartScaleMode !== 'linear') params.set('scale', chartScaleMode);
            if (selectedRecipe && isRecipeDrawerOpen) params.set('recipe', selectedRecipe.id);

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
        chartCurveMode,
        chartXMetric,
        chartYMetric,
        chartScaleMode,
        selectedRecipe,
        isRecipeDrawerOpen,
    ]);

    // Construct raw dataset from seed recipes + uploaded runs
    const rawDataset = useMemo(() => {
        return buildLeaderboardDataset({
            seedRecipes: SEED_LEADERBOARD_RECIPES,
            brv02Runs: dashboardData?.brv02Runs || [],
            liveBenchmarkData: dashboardData?.data || [],
            customPricing,
            activeLatencyMetric: chartXMetric,
            activeThroughputMetric: chartYMetric,
        });
    }, [dashboardData?.brv02Runs, dashboardData?.data, customPricing, chartXMetric, chartYMetric]);

    // Dynamically evaluate each run's optimal concurrency operating point at the active SLO
    const evaluatedDataset = useMemo(() => {
        return evaluateDatasetAtSlo(rawDataset, {
            maxTtftSla,
            maxTpotSla,
            slaPercentile
        });
    }, [rawDataset, maxTtftSla, maxTpotSla, slaPercentile]);

    // Extract available filter values and counts
    const { availableModels } = useMemo(() => {
        const counts = {};
        const models = [];
        evaluatedDataset.forEach(d => {
            if (d.model_family) {
                if (!counts[d.model_family]) {
                    counts[d.model_family] = 0;
                    models.push(d.model_family);
                }
                counts[d.model_family]++;
            }
        });
        return { availableModels: models };
    }, [evaluatedDataset]);

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

        const compareRuns = (a, b) => {
            // Qualifying runs always rank above runs that miss the active SLO
            if (Boolean(a.missesSlo) !== Boolean(b.missesSlo)) {
                return a.missesSlo ? 1 : -1;
            }
            if (rankingMetric === 'ttft_p50') {
                return (latencyFor(a, 'ttft', 'p50') ?? 99999) - (latencyFor(b, 'ttft', 'p50') ?? 99999);
            }
            if (rankingMetric === 'itl_p50') {
                return (latencyFor(a, 'itl', 'p50') ?? 99999) - (latencyFor(b, 'itl', 'p50') ?? 99999);
            }
            if (rankingMetric === 'cost_per_1m') {
                const costA = a.cost_analysis?.cost_per_1m_output_tokens_usd ?? 99999;
                const costB = b.cost_analysis?.cost_per_1m_output_tokens_usd ?? 99999;
                return costA - costB;
            }
            if (rankingMetric === 'reproductions' || rankingMetric === 'upvotes') {
                return getRecipeReproductionCount(b) - getRecipeReproductionCount(a);
            }
            return (b.tokens_per_sec_per_chip || 0) - (a.tokens_per_sec_per_chip || 0);
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
    ]);

    const missesSloCount = useMemo(
        () => filteredDataset.filter((r) => r.missesSlo).length,
        [filteredDataset]
    );

    const isScoped = selectedModelFamily !== 'all' || selectedWorkload !== 'all' || selectedHardware !== 'all' || selectedEngine !== 'all';
    const isGroupedByModel = selectedModelFamily === 'all';

    const hasSamples = filteredDataset.some((r) => r.is_sample);
    const selectedWorkloadMeta = workloadFor(selectedWorkload);
    const isUnmeasuredWorkload = Boolean(selectedWorkloadMeta) && !evaluatedDataset.some((r) => r.workload_class === selectedWorkload);

    const handleResetAllFilters = () => {
        const defaultScope = pickDefaultScope(rawDataset);
        setSearchQuery('');
        setSelectedModelFamily(defaultScope.model);
        setSelectedWorkload(defaultScope.workload);
        setSelectedHardware('all');
        setSelectedEngine('all');
        setMaxTtftSla(null);
        setMaxTpotSla(null);
        setSlaPercentile(DEFAULT_SLA_PERCENTILE);
        setRankingMetric(DEFAULT_OBJECTIVE);
    };

    const go = (e, view) => {
        if (!onNavigate || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate(view);
    };

    const handleSelectRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setIsRecipeDrawerOpen(true);
        recordRecipeView(recipe.id);
        setTimeout(() => {
            const rowElem = document.getElementById(`recipe-row-${recipe.id}`);
            if (rowElem) {
                rowElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    };

    const comparedRecipes = useMemo(() => {
        return evaluatedDataset.filter(r => selectedForCompare.includes(r.id));
    }, [evaluatedDataset, selectedForCompare]);

    const drawerRecipe = useMemo(
        () => (selectedRecipe && evaluatedDataset.find((r) => r.id === selectedRecipe.id)) || selectedRecipe,
        [evaluatedDataset, selectedRecipe]
    );

    const handleOpenCompare = () => {
        if (selectedForCompare.length >= 2) {
            if (onNavigate) {
                onNavigate('recipe-comparison', {
                    recipes: selectedForCompare,
                    baseline: baselineRecipeId || selectedForCompare[0]
                });
            } else {
                setIsCompareModalOpen(true);
            }
        }
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

    return (
        <div className="min-h-full bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-x-hidden">
            {/* Editorial Page Header */}
            <WellLitHeader
                kicker="Leaderboard"
                pageTitle="Find the top-performing serving stack"
                subtitle="Compare validated throughput and latency across models, accelerators, and stack components."
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
                        missesSloCount={missesSloCount}
                        hasSamples={hasSamples}
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

                {filteredDataset.length === 0 ? (
                    <div className="surface-light rounded-3xl border border-zinc-200 bg-white">
                        {isUnmeasuredWorkload ? (
                            <EmptyState
                                icon={<Inbox className="w-9 h-9 text-zinc-400 mx-auto" />}
                                title={`No ${selectedWorkloadMeta.label} runs yet`}
                                message={`Be the first to submit ${withArticle(selectedWorkloadMeta.display)} run — or request a benchmark for this workload.`}
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
                            onSelectRecipe={handleSelectRecipe}
                            selectedRecipe={selectedRecipe}
                            selectedForCompare={selectedForCompare}
                            onToggleCompare={handleToggleCompare}
                            onOpenCompareModal={handleOpenCompare}
                            baselineRecipeId={baselineRecipeId}
                            onSetBaseline={setBaselineRecipeId}
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
                recipe={drawerRecipe}
                onNavigate={onNavigate}
                onOpenFeedback={(type, recipe) => {
                    setIsRecipeDrawerOpen(false);
                    handleOpenFeedback(type, recipe);
                }}
            />

            <RecipeComparisonModal
                isOpen={isCompareModalOpen}
                onClose={() => setIsCompareModalOpen(false)}
                recipes={comparedRecipes}
                baselineRecipeId={baselineRecipeId}
                onSetBaseline={setBaselineRecipeId}
                onInspectRecipe={(recipe) => {
                    setIsCompareModalOpen(false);
                    handleSelectRecipe(recipe);
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
