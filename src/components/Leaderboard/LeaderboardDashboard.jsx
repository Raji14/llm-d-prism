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
    Trophy,
    Sparkles,
    Flame,
    DollarSign,
    UploadCloud,
    ArrowLeft,
    Sliders,
    Award,
    Activity,
    Layers,
    RotateCcw,
    Cpu,
    Server,
    Zap,
    ExternalLink
} from 'lucide-react';
import { WellLitHeader } from '../ui/WellLitHeader.jsx';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import LeaderboardSummaryCards from './LeaderboardSummaryCards.jsx';
import MetricFiltersBar from './MetricFiltersBar.jsx';
import ParetoCurveChart from './ParetoCurveChart.jsx';
import LeaderboardTable from './LeaderboardTable.jsx';
import PricingConfigModal from './PricingConfigModal.jsx';
import CertificateModal from './CertificateModal.jsx';
import PrizeClaimDrawer from './PrizeClaimDrawer.jsx';
import RecipeDetailDrawer from './RecipeDetailDrawer.jsx';
import RecipeComparisonModal from './RecipeComparisonModal.jsx';
import SizingWizardModal from './SizingWizardModal.jsx';
import { buildLeaderboardDataset, SEED_LEADERBOARD_RECIPES } from '../../utils/leaderboardData.js';
import { loadCustomPricingRates, saveCustomPricingRates } from '../../utils/pricingEngine.js';

export default function LeaderboardDashboard({
    onNavigate,
    onNavigateBack,
    onToggleMobileNav,
    dashboardState,
    dashboardData
}) {
    // Filter and metric states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedModelFamily, setSelectedModelFamily] = useState('all');
    const [selectedHardware, setSelectedHardware] = useState('all');
    const [selectedEngine, setSelectedEngine] = useState('all');
    const [selectedScope, setSelectedScope] = useState('all');
    const [selectedContext, setSelectedContext] = useState('all');
    const [maxTtftSla, setMaxTtftSla] = useState(100);
    const [selectedHeadroom, setSelectedHeadroom] = useState('all');
    const [latencyMetric, setLatencyMetric] = useState('ttft_p50');
    const [throughputMetric, setThroughputMetric] = useState('tokens_per_sec');
    const [showParetoOnly, setShowParetoOnly] = useState(false);

    // Modals and Drawers
    const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
    const [isSizingWizardOpen, setIsSizingWizardOpen] = useState(false);
    const [isCertificateModalOpen, setIsCertificateModalOpen] = useState(false);
    const [isBountiesDrawerOpen, setIsBountiesDrawerOpen] = useState(false);
    const [isRecipeDrawerOpen, setIsRecipeDrawerOpen] = useState(false);
    const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
    const [selectedRecipe, setSelectedRecipe] = useState(null);

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

    // Construct raw dataset from seed recipes + uploaded runs
    const rawDataset = useMemo(() => {
        return buildLeaderboardDataset({
            seedRecipes: SEED_LEADERBOARD_RECIPES,
            brv02Runs: dashboardData?.brv02Runs || [],
            liveBenchmarkData: dashboardData?.data || [],
            customPricing,
            activeLatencyMetric: latencyMetric,
            activeThroughputMetric: throughputMetric
        });
    }, [dashboardData?.brv02Runs, dashboardData?.data, customPricing, latencyMetric, throughputMetric]);

    // Extract available filter values
    const availableModels = useMemo(() => {
        const set = new Set();
        rawDataset.forEach(d => {
            if (d.model_family) set.add(d.model_family);
        });
        return Array.from(set);
    }, [rawDataset]);

    // Filter dataset
    const filteredDataset = useMemo(() => {
        return rawDataset.filter(item => {
            // Search Query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchName = (item.recipe_name || '').toLowerCase().includes(q);
                const matchModel = (item.model_name || '').toLowerCase().includes(q);
                const matchAuthor = (item.author?.username || '').toLowerCase().includes(q) || (item.author?.display_name || '').toLowerCase().includes(q);
                const matchHw = (item.hardware_summary || '').toLowerCase().includes(q);
                if (!matchName && !matchModel && !matchAuthor && !matchHw) return false;
            }

            // Model family
            if (selectedModelFamily !== 'all' && item.model_family !== selectedModelFamily) {
                return false;
            }

            // Hardware
            if (selectedHardware !== 'all' && item.hardware?.accelerator_type !== selectedHardware) {
                return false;
            }

            // Engine
            if (selectedEngine !== 'all' && item.stack?.engine !== selectedEngine) {
                return false;
            }

            // Benchmark Scope (System E2E vs Unit Microbenchmark)
            if (selectedScope !== 'all' && (item.benchmark_scope || 'system') !== selectedScope) {
                return false;
            }

            // Max TTFT SLA Constraint
            if (maxTtftSla && maxTtftSla < 100) {
                const ttft = item.ttft_p50 || item.metrics?.ttft_ms?.p50 || 999;
                if (ttft > maxTtftSla) return false;
            }

            // Context Length Filter
            if (selectedContext === 'chat') {
                const inLen = item.workload?.input_tokens || 1024;
                const outLen = item.workload?.output_tokens || 512;
                if (inLen > 1024 || outLen > 512) return false;
            } else if (selectedContext === 'long') {
                const inLen = item.workload?.input_tokens || 1024;
                if (inLen < 2048) return false;
            } else if (selectedContext === 'reasoning') {
                const outLen = item.workload?.output_tokens || 512;
                if (outLen < 1024) return false;
            }

            // Memory Stability / Headroom Filter
            if (selectedHeadroom === 'safe') {
                const kvUsage = item.metrics?.kv_cache_usage_pct || 75;
                if (kvUsage > 80) return false;
            } else if (selectedHeadroom === 'moderate') {
                const kvUsage = item.metrics?.kv_cache_usage_pct || 75;
                if (kvUsage > 90) return false;
            }

            // Pareto Frontier Only
            if (showParetoOnly && !item.isParetoOptimal) {
                return false;
            }

            return true;
        });
    }, [rawDataset, searchQuery, selectedModelFamily, selectedHardware, selectedEngine, selectedScope, maxTtftSla, selectedContext, selectedHeadroom, showParetoOnly]);

    const handleResetAllFilters = () => {
        setSearchQuery('');
        setSelectedModelFamily('all');
        setSelectedHardware('all');
        setSelectedEngine('all');
        setSelectedScope('all');
        setSelectedContext('all');
        setMaxTtftSla(100);
        setSelectedHeadroom('all');
        setShowParetoOnly(false);
    };

    const handleApplyWizardConstraints = ({ model, hardware, recipe }) => {
        if (model) setSelectedModelFamily(model);
        if (hardware) setSelectedHardware(hardware);
        if (recipe) {
            setSelectedRecipe(recipe);
            setTimeout(() => {
                const rowElem = document.getElementById(`recipe-row-${recipe.id}`);
                if (rowElem) {
                    rowElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 150);
        }
    };

    const handleSelectRecipe = (recipe) => {
        setSelectedRecipe(recipe);
        setIsRecipeDrawerOpen(true);
        setTimeout(() => {
            const rowElem = document.getElementById(`recipe-row-${recipe.id}`);
            if (rowElem) {
                rowElem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }, 100);
    };

    const handleOpenCertificate = (recipe) => {
        setSelectedRecipe(recipe);
        setIsCertificateModalOpen(true);
    };

    const comparedRecipes = useMemo(() => {
        return rawDataset.filter(r => selectedForCompare.includes(r.id));
    }, [rawDataset, selectedForCompare]);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans antialiased relative overflow-x-hidden pt-16 bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
            {/* Ambient Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-amber-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-cyan-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            {/* Standard Well-Lit Path Header */}
            <WellLitHeader
                pageTitle="Model leaderboard"
                onNavigateBack={onNavigateBack}
                onToggleMobileNav={onToggleMobileNav}
                extraActions={
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setIsBountiesDrawerOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 text-xs font-semibold shadow-[0_0_15px_rgba(168,85,247,0.25)] transition-all cursor-pointer"
                        >
                            <Flame className="w-3.5 h-3.5 text-purple-400" />
                            <span className="hidden sm:inline">SOTA Milestones</span>
                            <span className="sm:hidden">Milestones</span>
                        </button>

                        <button
                            onClick={() => onNavigate && onNavigate('submit-benchmarks')}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold shadow-[0_0_15px_rgba(6,182,212,0.35)] transition-all cursor-pointer"
                        >
                            <UploadCloud className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Publish Recipe</span>
                            <span className="sm:hidden">Publish</span>
                        </button>
                    </div>
                }
            />

            {/* Main Content Area */}
            <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full z-10">
                {/* Unified Scenario & KPI Summary Control Panel */}
                <LeaderboardSummaryCards
                    dataset={filteredDataset}
                    onOpenBounties={() => setIsBountiesDrawerOpen(true)}
                    onSelectRecipe={handleSelectRecipe}
                />

                {/* Filters Bar */}
                <MetricFiltersBar
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    selectedModelFamily={selectedModelFamily}
                    setSelectedModelFamily={setSelectedModelFamily}
                    selectedHardware={selectedHardware}
                    setSelectedHardware={setSelectedHardware}
                    selectedEngine={selectedEngine}
                    setSelectedEngine={setSelectedEngine}
                    selectedScope={selectedScope}
                    setSelectedScope={setSelectedScope}
                    selectedContext={selectedContext}
                    setSelectedContext={setSelectedContext}
                    maxTtftSla={maxTtftSla}
                    setMaxTtftSla={setMaxTtftSla}
                    selectedHeadroom={selectedHeadroom}
                    setSelectedHeadroom={setSelectedHeadroom}
                    latencyMetric={latencyMetric}
                    setLatencyMetric={setLatencyMetric}
                    throughputMetric={throughputMetric}
                    setThroughputMetric={setThroughputMetric}
                    showParetoOnly={showParetoOnly}
                    setShowParetoOnly={setShowParetoOnly}
                    onOpenPricingModal={() => setIsPricingModalOpen(true)}
                    onOpenSizingWizard={() => setIsSizingWizardOpen(true)}
                    onOpenSubmitModal={() => onNavigate && onNavigate('submit-benchmarks')}
                    availableModels={availableModels}
                />

                {/* Pareto Curve Chart */}
                <ParetoCurveChart
                    dataset={filteredDataset}
                    latencyMetric={latencyMetric}
                    throughputMetric={throughputMetric}
                    onSelectRecipe={handleSelectRecipe}
                    selectedRecipe={selectedRecipe}
                />

                {/* Rankings Table */}
                <LeaderboardTable
                    dataset={filteredDataset}
                    onSelectRecipe={handleSelectRecipe}
                    onOpenCertificate={handleOpenCertificate}
                    onOpenBounties={() => setIsBountiesDrawerOpen(true)}
                    selectedRecipe={selectedRecipe}
                    selectedForCompare={selectedForCompare}
                    onToggleCompare={handleToggleCompare}
                    onOpenCompareModal={() => setIsCompareModalOpen(true)}
                    baselineRecipeId={baselineRecipeId}
                    onSetBaseline={setBaselineRecipeId}
                    onResetFilters={handleResetAllFilters}
                    onClearCompare={() => setSelectedForCompare([])}
                />
            </div>

            {/* Modals & Drawers */}
            <PricingConfigModal
                isOpen={isPricingModalOpen}
                onClose={() => setIsPricingModalOpen(false)}
                customRates={customPricing}
                onSaveRates={handleSaveRates}
                onResetDefaults={handleResetDefaults}
            />

            <SizingWizardModal
                isOpen={isSizingWizardOpen}
                onClose={() => setIsSizingWizardOpen(false)}
                dataset={rawDataset}
                onSelectRecipe={handleSelectRecipe}
                onOpenCertificate={handleOpenCertificate}
                onApplyConstraints={handleApplyWizardConstraints}
            />

            <CertificateModal
                isOpen={isCertificateModalOpen}
                onClose={() => setIsCertificateModalOpen(false)}
                recipe={selectedRecipe}
            />

            <PrizeClaimDrawer
                isOpen={isBountiesDrawerOpen}
                onClose={() => setIsBountiesDrawerOpen(false)}
                dataset={filteredDataset}
            />

            <RecipeDetailDrawer
                isOpen={isRecipeDrawerOpen}
                onClose={() => setIsRecipeDrawerOpen(false)}
                recipe={selectedRecipe}
                onOpenCertificate={handleOpenCertificate}
            />

            <RecipeComparisonModal
                isOpen={isCompareModalOpen}
                onClose={() => setIsCompareModalOpen(false)}
                recipes={comparedRecipes}
                baselineRecipeId={baselineRecipeId}
                onSetBaseline={setBaselineRecipeId}
            />
        </div>
    );
}
