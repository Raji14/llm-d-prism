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
import { UploadCloud, RotateCcw, FilterX, Inbox, MessageSquarePlus, Database, Eye, Info, X, ArrowRight } from 'lucide-react';
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
import { submitFor, METHODOLOGY } from '../layout/navigation.js';
import { readInstanceMode } from '../ResultsStore/instance.js';
import { feedbackDestinationsFor } from '../../config/site.js';
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
    parseQueryTokens,
    readSloParams,
    writeSloParams,
    latencyFor,
    removeDimensionTokens,
    removeQueryToken,
} from '../../utils/leaderboardFacets.js';
import { pickDefaultScope, annotateModelWorkloadGroupRanks } from '../../utils/runParity.js';
import {
    LIST_PRICE_PRESET,
    PRICING_URL_PARAM,
    loadPricingSelection,
    pricingFromParam,
    pricingLabelFor,
    pricingParamForUrl,
    savePricingSelection,
    withPricingParam,
} from '../../utils/pricingEngine.js';

// "a code generation run", "an offline batch run".
const withArticle = (phrase) => `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;

const VALID_CURVE_MODES = ['stack', 'hardware', 'overall'];
const VALID_X_METRICS = ['ttft_p50', 'itl_p50', 'output_tokens_per_sec', 'workload.concurrency'];
const VALID_Y_METRICS = ['tokens_per_sec_per_chip', 'tokens_per_sec', 'tokens_per_dollar'];
const VALID_SCALE_MODES = ['linear', 'log'];

// Opening a result's details pushes a history entry marked with this key, so
// browser Back closes the drawer instead of leaving the Leaderboard.
const DRAWER_HISTORY_KEY = 'prismLeaderboardRecipe';

const currentParams = () => {
    try {
        return new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    } catch {
        return new URLSearchParams();
    }
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

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
    // Opened on one result (the Results Store's "See it on the Leaderboard"):
    // land on its model and workload, so its row sits beside its drawer.
    const linked = recipeParam && !modelParam && !initialWorkloadHint && !hasQueryModel ? scopePool.find((r) => r.id === recipeParam) : null;
    const defaultScope = linked?.model_family
        ? { model: linked.model_family, workload: linked.workload_class || 'all' }
        : pickDefaultScope(scopePool, {
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
        // The pinned baseline row rides in the URL, so it survives Compare → Back.
        baselineRecipeId: params.get('pin') || null,
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
    // Internal Prism never sends result details to a public destination.
    const destinations = useMemo(() => feedbackDestinationsFor(instance), [instance]);
    const submit = submitFor(instance);
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
    // A linked result that isn't on the Leaderboard (any more): said, not ignored.
    const [missingRecipeId, setMissingRecipeId] = useState(null);
    const [feedbackModal, setFeedbackModal] = useState({
        isOpen: false,
        type: 'missing_workload',
        recipe: null,
        prefillScope: false,
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

    // ...and the other way: a key:value token for a sentence dimension decides
    // that dimension, so `model:8b` searches every model, not just the one the
    // sentence had picked.
    const handleSearchChange = (next) => {
        setSearchQuery(next);
        const dims = new Set(parseQueryTokens(next).filter((t) => t.dimension && t.value).map((t) => t.dimension));
        if (dims.has('model')) setSelectedModelFamily('all');
        if (dims.has('workload')) setSelectedWorkload('all');
        if (dims.has('hardware')) setSelectedHardware('all');
        if (dims.has('engine')) setSelectedEngine('all');
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

    // Comparison and Baseline states
    const [selectedForCompare, setSelectedForCompare] = useState([]);
    const [baselineRecipeId, setBaselineRecipeId] = useState(initial.baselineRecipeId);
    // The scope you were on when hiding samples moved you, to go back to it.
    const [scopeBeforeHidingSamples, setScopeBeforeHidingSamples] = useState(null);

    // The prices this view uses: a shared link's (pricing=…) wins, so the
    // recipient sees the sender's $/1M; otherwise the ones saved in this browser.
    const [pricing, setPricing] = useState(() => pricingFromParam(currentParams().get(PRICING_URL_PARAM)) || loadPricingSelection());
    const customPricing = pricing.rates;
    const pricingLabel = pricingLabelFor(pricing);
    // What Share copies (and challenges link back to): exactly this view,
    // prices included, so a recipient with other saved prices sees the same numbers.
    const getShareUrl = () => (typeof window !== 'undefined' ? withPricingParam(window.location.href, pricing) : '');

    const handleSavePricing = (rates, preset) => {
        setPricing(savePricingSelection({ preset, rates }));
    };

    const handleResetDefaults = () => {
        setPricing(savePricingSelection({ preset: LIST_PRICE_PRESET }));
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
            // Which-Prism preview params (dev server only, src/config/site.js) ride along.
            ['instance', 'brand', 'site', 'pinned'].forEach((k) => {
                if (current.get(k) != null) params.set(k, current.get(k));
            });
            if (searchQuery.trim()) params.set('q', searchQuery.trim());
            params.set('model', selectedModelFamily);
            params.set('workload', selectedWorkload);
            if (selectedHardware !== 'all') params.set('hardware', selectedHardware);
            if (selectedEngine !== 'all') params.set('engine', selectedEngine);
            if (rankingMetric !== DEFAULT_OBJECTIVE) params.set('sort', rankingMetric);
            writeSloParams(params, { ttft: maxTtftSla, tpot: maxTpotSla, percentile: slaPercentile });
            if (includeSamples !== initial.defaultIncludeSamples) params.set('samples', includeSamples ? '1' : '0');
            const pricingParam = pricingParamForUrl(pricing, loadPricingSelection());
            if (pricingParam) params.set(PRICING_URL_PARAM, pricingParam);
            if (baselineRecipeId) params.set('pin', baselineRecipeId);
            if (chartCurveMode !== 'stack') params.set('curves', chartCurveMode);
            if (chartXMetric !== 'ttft_p50') params.set('x', chartXMetric);
            if (chartYMetric !== 'tokens_per_sec_per_chip') params.set('y', chartYMetric);
            if (chartScaleMode !== 'linear') params.set('scale', chartScaleMode);
            if (selectedRecipeId && isRecipeDrawerOpen) params.set('recipe', selectedRecipeId);

            const queryString = params.toString();
            const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
            // Keep the entry's state: it marks the entry the drawer pushed.
            window.history.replaceState(window.history.state, '', newUrl);
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
        pricing,
        baselineRecipeId,
        chartCurveMode,
        chartXMetric,
        chartYMetric,
        chartScaleMode,
        selectedRecipeId,
        isRecipeDrawerOpen,
    ]);

    // Back and Forward move between the board and a result's details: the
    // URL's recipe param says whether the drawer is open.
    useEffect(() => {
        const onPopState = () => {
            const params = currentParams();
            if (params.get('view') && params.get('view') !== 'model-leaderboard') return;
            const recipe = params.get('recipe');
            if (recipe) {
                setSelectedRecipeId(recipe);
                setIsRecipeDrawerOpen(true);
            } else {
                setIsRecipeDrawerOpen(false);
            }
        };
        window.addEventListener('popstate', onPopState);
        return () => window.removeEventListener('popstate', onPopState);
    }, []);

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

        // Samples never rank above real results: when both are in scope, the
        // real ones are ranked and the samples follow, unnumbered.
        const separateSamples = filtered.some((r) => r.is_sample) && filtered.some((r) => !r.is_sample);
        if (!separateSamples) {
            const sorted = filtered.sort(compareRuns);
            return annotateModelWorkloadGroupRanks(sorted, compareRuns);
        }
        const real = filtered.filter((r) => !r.is_sample).sort(compareRuns);
        const samples = filtered.filter((r) => r.is_sample).sort(compareRuns).map((r) => ({ ...r, unrankedSample: true }));
        return [...annotateModelWorkloadGroupRanks(real, compareRuns), ...samples];
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

    // P90 is offered only where some run in scope recorded it (the Results
    // Store keeps P50 and P99), so it's never a dead end.
    const p90Recorded = useMemo(
        () => filteredDataset.some((r) => (r.sweep_points || []).some((pt) => isNum(pt.ttft_p90) || isNum(pt.itl_p90))),
        [filteredDataset]
    );

    const isScoped = selectedModelFamily !== 'all' || selectedWorkload !== 'all' || selectedHardware !== 'all' || selectedEngine !== 'all';
    const isGroupedByModel = selectedModelFamily === 'all';

    const publishedCount = published.entries.length;
    const sampleCount = includeSamples ? SEED_LEADERBOARD_RECIPES.length : 0;
    const selectedWorkloadMeta = workloadFor(selectedWorkload);
    const isUnmeasuredWorkload = Boolean(selectedWorkloadMeta) && !evaluatedDataset.some((r) => r.workload_class === selectedWorkload);
    const onlySamples = includeSamples && publishedCount === 0;

    // Where runs do exist when the sentence finds none: the same workload on
    // other models first, then the same model on other workloads.
    const scopeSuggestions = useMemo(() => {
        if (filteredDataset.length > 0) return [];
        const groups = new Map();
        evaluatedDataset.forEach((r) => {
            if (searchQuery.trim() && !matchesSearchQuery(r, searchQuery)) return;
            if (selectedHardware !== 'all' && r.hardware?.accelerator_type !== selectedHardware) return;
            if (selectedEngine !== 'all' && r.stack?.engine !== selectedEngine) return;
            const sameWorkload = selectedWorkload !== 'all' && r.workload_class === selectedWorkload;
            const sameModel = selectedModelFamily !== 'all' && r.model_family === selectedModelFamily;
            if (!sameWorkload && !sameModel) return;
            const key = `${r.model_family}|||${r.workload_class}`;
            const g = groups.get(key) || { model: r.model_family, workload: r.workload_class, n: 0, sameWorkload };
            g.n += 1;
            groups.set(key, g);
        });
        return [...groups.values()]
            .sort((a, b) => Number(b.sameWorkload) - Number(a.sameWorkload) || b.n - a.n)
            .slice(0, 3);
    }, [filteredDataset.length, evaluatedDataset, searchQuery, selectedHardware, selectedEngine, selectedWorkload, selectedModelFamily]);

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
        // sentence on a model that only samples had...
        const pool = buildLeaderboardDataset({
            seedRecipes: next ? SEED_LEADERBOARD_RECIPES : [],
            publishedResults: published.entries,
        });
        const hasModel = (model) => model === 'all' || pool.some((r) => r.model_family === model);
        // ...and showing them again returns to the scope you were on.
        if (next && scopeBeforeHidingSamples && hasModel(scopeBeforeHidingSamples.model)) {
            setSelectedModelFamily(scopeBeforeHidingSamples.model);
            setSelectedWorkload(scopeBeforeHidingSamples.workload);
            setScopeBeforeHidingSamples(null);
            return;
        }
        if (!hasModel(selectedModelFamily)) {
            if (!next) setScopeBeforeHidingSamples({ model: selectedModelFamily, workload: selectedWorkload });
            const scope = pickDefaultScope(pool);
            setSelectedModelFamily(scope.model);
            setSelectedWorkload(scope.workload);
        }
    };

    const go = (e, view, extra) => {
        if (!onNavigate || e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate(view, extra);
    };

    // Opening details pushes a history entry; closing them pops it, so the
    // next Back returns to wherever the user came from.
    const openRecipeDrawer = (recipeId) => {
        setSelectedRecipeId(recipeId);
        setIsRecipeDrawerOpen(true);
        setMissingRecipeId(null);
        try {
            const params = currentParams();
            params.set('recipe', recipeId);
            window.history.pushState(
                { ...(window.history.state || {}), [DRAWER_HISTORY_KEY]: recipeId },
                '',
                `${window.location.pathname}?${params.toString()}`
            );
        } catch {
            // ignore history errors
        }
    };

    // keepHistory: the drawer is closing because the user is going to another
    // view, which pushes its own entry; Back from there reopens the drawer.
    const closeRecipeDrawer = ({ keepHistory = false } = {}) => {
        if (!keepHistory && typeof window !== 'undefined' && window.history.state?.[DRAWER_HISTORY_KEY]) {
            window.history.back();
            return;
        }
        setIsRecipeDrawerOpen(false);
    };

    const handleSelectRecipe = (recipe) => {
        openRecipeDrawer(recipe.id);
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

    // A link to a result that isn't here: say so and drop it from the URL, so
    // it isn't shared on.
    if (isRecipeDrawerOpen && selectedRecipeId && !selectedRecipe) {
        setMissingRecipeId(selectedRecipeId);
        setIsRecipeDrawerOpen(false);
        setSelectedRecipeId(null);
    }

    // Request a workload prefills only what's missing: the scope when it has
    // no runs; nothing when it's already measured.
    const handleOpenFeedback = (type = 'missing_workload', recipe = null) => {
        setFeedbackModal({
            isOpen: true,
            type,
            recipe,
            prefillScope: type === 'missing_workload' && filteredDataset.length === 0,
        });
    };

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
    const nothingYet = instance === 'internal' ? 'Nothing is marked Official yet' : 'Nothing is published yet';
    const methodologySamplesHref = `?view=${METHODOLOGY.view}#samples`;
    const openMethodologySamples = (e) => go(e, METHODOLOGY.view, { hash: 'samples' });

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
                contactHref={destinations.discussUrl}
                getShareUrl={getShareUrl}
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
                        methodologySamplesHref={methodologySamplesHref}
                        onOpenMethodologySamples={openMethodologySamples}
                    />
                    <MetricFiltersBar
                        searchQuery={searchQuery}
                        setSearchQuery={handleSearchChange}
                        onRemoveQueryToken={(rawToken) => setSearchQuery((prev) => removeQueryToken(prev, rawToken))}
                        selectedWorkload={selectedWorkload}
                        isScoped={isScoped}
                        maxTtftSla={maxTtftSla}
                        setMaxTtftSla={setMaxTtftSla}
                        maxTpotSla={maxTpotSla}
                        setMaxTpotSla={setMaxTpotSla}
                        slaPercentile={slaPercentile}
                        setSlaPercentile={setSlaPercentile}
                        p90Recorded={p90Recorded}
                        onOpenPricingModal={() => setIsPricingModalOpen(true)}
                        onResetFilters={handleResetAllFilters}
                        hasCustomPricing={pricing.preset !== LIST_PRICE_PRESET}
                        pricingLabel={pricingLabel}
                    />
                </div>

                {missingRecipeId && (
                    <div role="status" className="surface-light flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-2.5 text-xs text-amber-950">
                        <span className="flex items-start gap-2 min-w-0">
                            <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold">That result isn&apos;t on the Leaderboard any more.</strong>{' '}
                                The link pointed to <code className="font-mono break-all">{missingRecipeId}</code>, which may have been replaced or withdrawn.
                            </span>
                        </span>
                        <button
                            type="button"
                            onClick={() => setMissingRecipeId(null)}
                            aria-label="Dismiss"
                            className="shrink-0 p-1 rounded-full text-amber-700 hover:text-amber-950 hover:bg-amber-100 cursor-pointer"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}

                {/* Only samples: say so above everything else, at every size. */}
                {onlySamples && !nothingToRank && (
                    <div role="note" className="surface-light flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-2xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-xs text-zinc-800">
                        <p className="flex items-start gap-2.5 min-w-0">
                            <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold text-zinc-900">Every row below is an illustrative sample, not a measured run.</strong>{' '}
                                {nothingYet}, so the Leaderboard shows made-up examples of how ranking works. Don&apos;t quote their numbers.
                            </span>
                        </p>
                        <div className="flex items-center gap-3 shrink-0 pl-6 sm:pl-0">
                            <a
                                href={methodologySamplesHref}
                                onClick={openMethodologySamples}
                                className="font-semibold text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-accent-700"
                            >
                                About sample data
                            </a>
                            <button
                                type="button"
                                onClick={handleToggleSamples}
                                className="font-semibold text-zinc-800 underline decoration-zinc-300 underline-offset-2 hover:text-accent-700 cursor-pointer"
                            >
                                Hide samples
                            </button>
                        </div>
                    </div>
                )}

                {nothingToRank ? (
                    <div className="surface-light rounded-3xl border border-zinc-200 bg-white">
                        <EmptyState
                            icon={<Database className="w-9 h-9 text-zinc-400 mx-auto" />}
                            title={instance === 'internal' ? 'Nothing official yet' : 'Nothing published yet'}
                            message={
                                instance === 'internal'
                                    ? 'The Leaderboard ranks results once an approver marks them Official in the Results Store. Mark one there, or show the illustrative samples to see how ranking works.'
                                    : "The Leaderboard ranks results once they're published from the Results Store. Publish one there, or show the illustrative samples to see how ranking works."
                            }
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
                                message={
                                    instance === 'internal'
                                        ? `Upload ${withArticle(selectedWorkloadMeta.display)} run for an approver to mark Official, or request a benchmark for this workload.`
                                        : `Be the first to submit ${withArticle(selectedWorkloadMeta.display)} run, or request a benchmark for this workload.`
                                }
                                action={
                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                        <Button variant="primary" size="sm" href={`?view=${submit.view}`} onClick={(e) => go(e, submit.view)}>
                                            <UploadCloud className="w-3.5 h-3.5" />
                                            {submit.label}
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
                                message={
                                    scopeSuggestions.length > 0
                                        ? `Runs exist nearby: switch to one of these, broaden the sentence above, or request a benchmark for this configuration.`
                                        : 'Broaden the sentence above, clear the search query, or request a benchmark for this configuration.'
                                }
                                action={
                                    <div className="flex flex-col items-center gap-3">
                                        {scopeSuggestions.length > 0 && (
                                            <ul className="flex flex-col items-center gap-1.5" aria-label="Where runs exist">
                                                {scopeSuggestions.map((s) => (
                                                    <li key={`${s.model}|${s.workload}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                handleModelChange(s.model);
                                                                handleWorkloadChange(s.workload);
                                                            }}
                                                            className="inline-flex items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50/60 px-3 py-1 text-xs font-medium text-accent-800 hover:bg-accent-50 hover:border-accent-300 cursor-pointer"
                                                        >
                                                            <span>
                                                                {workloadFor(s.workload)?.label || s.workload} runs exist for {s.model} ({s.n})
                                                            </span>
                                                            <span className="font-semibold">Switch</span>
                                                            <ArrowRight className="w-3 h-3" />
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                            <Button variant="primary" size="sm" onClick={() => handleOpenFeedback('missing_workload')}>
                                                <MessageSquarePlus className="w-3.5 h-3.5" />
                                                Request this configuration
                                            </Button>
                                            {clearFiltersButton}
                                        </div>
                                    </div>
                                }
                            />
                        )}
                    </div>
                ) : (
                    <section aria-labelledby="leaderboard-results-heading" className="space-y-4">
                        {/* The page's h1 is the header; the chart and table titles are h3s. */}
                        <h2 id="leaderboard-results-heading" className="sr-only">
                            Results for {scopeLabel}
                        </h2>

                        {/* 2. Compact #1 Top-Entry Strip */}
                        <LeaderboardSummaryCards
                            dataset={filteredDataset}
                            isGroupedByModel={isGroupedByModel}
                            onSelectModel={handleModelChange}
                            onSelectRecipe={handleSelectRecipe}
                            objective={objectiveFor(rankingMetric)}
                            latencyPercentile={slaPercentile}
                            slo={slo}
                            pricingLabel={pricingLabel}
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
                            pricingLabel={pricingLabel}
                            getShareUrl={getShareUrl}
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
                            onToggleSamples={includeSamples ? handleToggleSamples : undefined}
                            onNavigate={onNavigate}
                        />
                    </section>
                )}
            </div>

            {/* Modals & Drawers */}
            <PricingConfigModal
                isOpen={isPricingModalOpen}
                onClose={() => setIsPricingModalOpen(false)}
                customRates={customPricing}
                activePreset={pricing.preset}
                onSaveRates={handleSavePricing}
                onResetDefaults={handleResetDefaults}
            />

            <RecipeDetailDrawer
                isOpen={isRecipeDrawerOpen}
                onClose={closeRecipeDrawer}
                recipe={selectedRecipe}
                latencyPercentile={slaPercentile}
                slo={slo}
                pricingLabel={pricingLabel}
                getShareUrl={getShareUrl}
                onNavigate={onNavigate}
                // The challenge form opens over the details, so Cancel returns to them.
                onOpenFeedback={handleOpenFeedback}
            />

            <LeaderboardFeedbackModal
                isOpen={feedbackModal.isOpen}
                onClose={() => setFeedbackModal(prev => ({ ...prev, isOpen: false }))}
                initialType={feedbackModal.type}
                targetRecipe={feedbackModal.recipe}
                activeFilters={feedbackModal.prefillScope ? {
                    model: selectedModelFamily,
                    workload: selectedWorkload,
                    hardware: selectedHardware,
                    engine: selectedEngine
                } : {}}
                destinations={destinations}
                slo={slo}
                pricingLabel={pricingLabel}
                getShareUrl={getShareUrl}
                onNavigate={onNavigate}
            />
        </div>
    );
}
