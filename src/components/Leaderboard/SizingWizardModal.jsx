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

import React, { useState, useMemo, useEffect } from 'react';
import {
    X,
    Sparkles,
    ArrowRight,
    ArrowLeft,
    Star,
    RotateCcw,
    CheckCircle2,
    Sliders,
    Activity,
    DollarSign,
    Cpu,
    Zap,
    Layers,
    Globe,
    FileText,
    Copy,
    Check
} from 'lucide-react';
import {
    ResponsiveContainer,
    ScatterChart,
    Scatter,
    ZAxis,
    Tooltip,
    Cell,
    CartesianGrid,
    ReferenceArea
} from 'recharts';
import { ChartTooltip, ChartTooltipRow } from '../ui/charts/ChartTooltip.jsx';
import { buildDistributionPoints } from '../../utils/distributionData.js';
import { CHART_SERIES, CHART_STATUS, ChartXAxis, ChartYAxis, GoogleMark, getChartTheme, gridProps } from '../ui';
import { cn } from '../../utils/cn';

export default function SizingWizardModal({
    isOpen,
    onClose,
    dataset = [],
    onSelectRecipe,
    onOpenCertificate,
    onApplyConstraints
}) {
    // Current Step in 3-Step Optimization Workflow (1, 2, or 3)
    const [currentStep, setCurrentStep] = useState(1);

    // STEP 1: Performance Boundary Constraints
    const [selectedModelFamily, setSelectedModelFamily] = useState('all');
    const [maxTtftSla, setMaxTtftSla] = useState(45);
    const [maxTpotSla, setMaxTpotSla] = useState(18);
    const [targetConcurrency, setTargetConcurrency] = useState(32);

    // STEP 2: Selected Accelerator for Distribution Visualization
    const [selectedAccelerator, setSelectedAccelerator] = useState('all');
    const [scatterXAxis, setScatterXAxis] = useState('ttft_p50');

    // STEP 3: Cloud Cost & Pricing Parameters
    const [selectedRegion, setSelectedRegion] = useState('us-central1');
    const [commitmentType, setCommitmentType] = useState('1yr_cud'); // 'on_demand' | '1yr_cud' | '3yr_cud'
    const [copiedMarkdown, setCopiedMarkdown] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    // Available model families
    const availableModelFamilies = useMemo(() => {
        const set = new Set();
        (dataset || []).forEach(d => {
            if (d && d.model_family) set.add(d.model_family);
            else if (d && d.model_name) set.add(d.model_name);
        });
        return Array.from(set).filter(Boolean).sort();
    }, [dataset]);

    // STEP 1: Matching & Filtered Recipes (Sorted by Throughput Descending)
    const matchingRecipes = useMemo(() => {
        if (!isOpen) return [];
        return (dataset || []).filter(item => {
            if (!item) return false;
            // Model Filter
            if (selectedModelFamily !== 'all' && item.model_family !== selectedModelFamily && item.model_name !== selectedModelFamily) {
                return false;
            }
            // Strict TTFT Boundary
            const ttft = item.ttft_p50 || item.metrics?.ttft_ms?.p50 || 0;
            if (ttft > maxTtftSla) return false;

            // Strict TPOT Boundary
            const tpot = item.itl_p50 || item.metrics?.itl_ms?.p50 || 8;
            if (tpot > maxTpotSla) return false;

            // Concurrency Headroom
            const maxStreams = item.stability_telemetry?.oom_headroom_concurrency || 64;
            if (maxStreams < targetConcurrency) return false;

            return true;
        }).sort((a, b) => (b.tokens_per_sec || 0) - (a.tokens_per_sec || 0)); // Optimized for maximum throughput
    }, [dataset, isOpen, selectedModelFamily, maxTtftSla, maxTpotSla, targetConcurrency]);

    const bestThroughputMatch = matchingRecipes[0] || null;
    const otherMatches = matchingRecipes.slice(1);

    // Available Accelerators from Step 1 matching candidates
    const availableAccelerators = useMemo(() => {
        const set = new Set();
        matchingRecipes.forEach(r => {
            if (r && r.hardware_summary) set.add(r.hardware_summary);
        });
        return Array.from(set).filter(Boolean);
    }, [matchingRecipes]);

    // Auto-select first accelerator when moving to Step 2 if not set
    useEffect(() => {
        if (availableAccelerators.length > 0) {
            if (selectedAccelerator === 'all' || !availableAccelerators.includes(selectedAccelerator)) {
                setSelectedAccelerator(availableAccelerators[0]);
            }
        } else {
            setSelectedAccelerator('all');
        }
    }, [availableAccelerators, selectedAccelerator]);

    // STEP 2: Build Multi-Dimensional Performance Points for Selected Hardware & Model
    const distributionPoints = useMemo(() => {
        if (matchingRecipes.length === 0) {
            if (selectedModelFamily !== 'all') {
                const familyRecipes = (dataset || []).filter(item =>
                    item && (item.model_family === selectedModelFamily || item.model_name === selectedModelFamily)
                );
                if (familyRecipes.length > 0) {
                    return buildDistributionPoints(familyRecipes);
                }
            }
            return buildDistributionPoints(dataset || []);
        }

        const candidateDataset = selectedAccelerator === 'all'
            ? matchingRecipes
            : matchingRecipes.filter(r => r && r.hardware_summary === selectedAccelerator);

        return buildDistributionPoints(candidateDataset.length > 0 ? candidateDataset : matchingRecipes);
    }, [matchingRecipes, selectedAccelerator, dataset, selectedModelFamily]);

    // STEP 3: Real-World Cost Calculations with Region & CUD Presets
    const pricingMultiplier = useMemo(() => {
        let regionMult = 1.0;
        if (selectedRegion === 'europe-west4') regionMult = 1.08;
        if (selectedRegion === 'asia-southeast1') regionMult = 1.15;
        if (selectedRegion === 'us-east4') regionMult = 1.02;

        let cudDiscount = 1.0;
        if (commitmentType === '1yr_cud') cudDiscount = 0.63; // 37% off
        if (commitmentType === '3yr_cud') cudDiscount = 0.45; // 55% off

        return regionMult * cudDiscount;
    }, [selectedRegion, commitmentType]);

    const costBreakdown = useMemo(() => {
        if (!bestThroughputMatch) return null;
        const baseHourly = bestThroughputMatch.cost_analysis?.hourly_rate_usd || 15.0;
        const adjustedHourly = baseHourly * pricingMultiplier;
        const monthlyCost = adjustedHourly * 730;
        const baseCostPer1M = bestThroughputMatch.cost_analysis?.cost_per_1m_output_tokens_usd || 1.0;
        const adjustedCostPer1M = baseCostPer1M * pricingMultiplier;
        const tokensPerDollar = Math.round(1000000 / (adjustedCostPer1M || 1));

        return {
            hourly: (adjustedHourly || 0).toFixed(2),
            monthly: Math.round(monthlyCost || 0).toLocaleString(),
            costPer1M: (adjustedCostPer1M || 0).toFixed(3),
            tokensPerDollar: (tokensPerDollar || 0).toLocaleString()
        };
    }, [bestThroughputMatch, pricingMultiplier]);

    const handleCopyReport = () => {
        if (!bestThroughputMatch || !costBreakdown) return;
        const engineName = bestThroughputMatch.stack?.engine ? bestThroughputMatch.stack.engine.toUpperCase() : 'LLM-D';
        const tpSize = bestThroughputMatch.stack?.tensor_parallel_size || 1;
        const ttftVal = bestThroughputMatch.ttft_p50 != null ? bestThroughputMatch.ttft_p50.toFixed(1) : '0.0';
        const tpotVal = bestThroughputMatch.itl_p50 || 8;
        const tpsVal = Math.round(bestThroughputMatch.tokens_per_sec || 0).toLocaleString();

        const md = `### 🚀 Optimal LLM Hardware & Cost Recommendation\n\n` +
            `- **Model**: \`${bestThroughputMatch.model_family || bestThroughputMatch.model_name || 'Standard LLM'}\`\n` +
            `- **Recommended Hardware**: **${bestThroughputMatch.hardware_summary || 'Standard Hardware'}** (${bestThroughputMatch.hardware?.machine_type || 'GCP Cloud Node'})\n` +
            `- **Serving Engine**: \`${engineName}\` (TP=${tpSize})\n` +
            `- **Latency Achieved**: TTFT P50: **${ttftVal} ms** (SLA: ≤${maxTtftSla}ms) • TPOT: **${tpotVal} ms** (SLA: ≤${maxTpotSla}ms)\n` +
            `- **Peak Throughput**: **${tpsVal} tok/s** at N=${targetConcurrency} concurrency\n` +
            `- **Estimated Run Rate**: **$${costBreakdown.hourly}/hr** (~$${costBreakdown.monthly}/mo in ${selectedRegion}, ${commitmentType.toUpperCase().replace('_', ' ')})\n` +
            `- **Cost Efficiency**: **$${costBreakdown.costPer1M} / 1M tokens** (${costBreakdown.tokensPerDollar} tokens/$)\n\n` +
            `#### Reproduction CLI Command:\n\`\`\`bash\n${bestThroughputMatch.reproduction_command || `vllm serve ${bestThroughputMatch.model_name || 'model'} --tensor-parallel-size ${tpSize}`}\n\`\`\``;

        if (navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(md);
        }
        setCopiedMarkdown(true);
        setTimeout(() => setCopiedMarkdown(false), 2500);
    };

    if (!isOpen) return null;

    const chartTheme = getChartTheme();

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="relative w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header & 3-Step Stepper Progress Bar */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-800 bg-slate-950/80 relative">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-accent-600/20 text-accent-700 border border-accent-600/30">
                                <Zap className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-white leading-tight">
                                    Hardware & cost sizing
                                </h2>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Stepper Navigation Bar */}
                    <div className="grid grid-cols-3 gap-2 text-xs font-semibold">
                        {/* Step 1 Tab */}
                        <button
                            onClick={() => setCurrentStep(1)}
                            className={cn('flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer', currentStep === 1
                                    ? 'bg-accent-600/20 text-accent-800 border-accent-600/40 shadow-sm'
                                    : currentStep > 1
                                    ? 'bg-slate-900 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-900/50 text-slate-500 border-slate-800')}
                        >
                            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-tiny font-bold', currentStep === 1 ? 'bg-accent-600 text-slate-950' : currentStep > 1 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400')}>
                                {currentStep > 1 ? '✓' : '1'}
                            </span>
                            <span className="truncate">1. Filter boundaries</span>
                        </button>

                        {/* Step 2 Tab */}
                        <button
                            onClick={() => setCurrentStep(2)}
                            className={cn('flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer', currentStep === 2
                                    ? 'bg-accent-600/20 text-accent-800 border-accent-600/40 shadow-sm'
                                    : currentStep > 2
                                    ? 'bg-slate-900 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-900/50 text-slate-500 border-slate-800')}
                        >
                            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-tiny font-bold', currentStep === 2 ? 'bg-accent-600 text-slate-950' : currentStep > 2 ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400')}>
                                {currentStep > 2 ? '✓' : '2'}
                            </span>
                            <span className="truncate">2. Hardware distribution</span>
                        </button>

                        {/* Step 3 Tab */}
                        <button
                            onClick={() => setCurrentStep(3)}
                            className={cn('flex items-center gap-2 p-2.5 rounded-xl border transition-all cursor-pointer', currentStep === 3
                                    ? 'bg-accent-600/20 text-accent-800 border-accent-600/40 shadow-sm'
                                    : 'bg-slate-900/50 text-slate-500 border-slate-800')}
                        >
                            <span className={cn('w-5 h-5 rounded-full flex items-center justify-center text-tiny font-bold', currentStep === 3 ? 'bg-accent-600 text-slate-950' : 'bg-slate-800 text-slate-400')}>
                                3
                            </span>
                            <span className="truncate">3. Real-world costs</span>
                        </button>
                    </div>
                </div>

                {/* Modal Body Content (Dynamic by Step) */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">

                    {/* ======================================================== */}
                    {/* STEP 1: FILTER BY PERFORMANCE BOUNDARIES                 */}
                    {/* ======================================================== */}
                    {currentStep === 1 && (
                        <div className="space-y-6">
                            {/* Controls Card */}
                            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* 1. Target AI Model */}
                                    <div>
                                        <label htmlFor="wizard-target-model-select" className="text-micro font-medium text-slate-400 block mb-1 cursor-pointer">
                                            1. Model
                                        </label>
                                        <select
                                            id="wizard-target-model-select"
                                            value={selectedModelFamily}
                                            onChange={(e) => setSelectedModelFamily(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent-600 font-mono text-xs cursor-pointer"
                                        >
                                            <option value="all">All evaluated models ({dataset.length} recipes)</option>
                                            {availableModelFamilies.map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* 2. Max TTFT Boundary */}
                                    <div>
                                        <div className="flex items-center justify-between text-micro font-medium text-slate-400 mb-1">
                                            <span>2. Max TTFT</span>
                                            <span className="font-mono text-accent-800 font-semibold">&le; {maxTtftSla} ms</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="15"
                                            max="80"
                                            step="1"
                                            value={maxTtftSla}
                                            onChange={(e) => setMaxTtftSla(Number(e.target.value))}
                                            className="w-full accent-accent-700 cursor-pointer h-2 bg-slate-800 rounded-lg mt-1"
                                        />
                                    </div>

                                    {/* 3. Max TPOT Boundary */}
                                    <div>
                                        <div className="flex items-center justify-between text-micro font-medium text-slate-400 mb-1">
                                            <span>3. Max TPOT</span>
                                            <span className="font-mono text-accent-800 font-semibold">&le; {maxTpotSla} ms</span>
                                        </div>
                                        <input
                                            type="range"
                                            min="6"
                                            max="30"
                                            step="1"
                                            value={maxTpotSla}
                                            onChange={(e) => setMaxTpotSla(Number(e.target.value))}
                                            className="w-full accent-accent-700 cursor-pointer h-2 bg-slate-800 rounded-lg mt-1"
                                        />
                                    </div>

                                    {/* 4. Concurrency Level */}
                                    <div>
                                        <label className="text-micro font-medium text-slate-400 block mb-1">
                                            4. Concurrency
                                        </label>
                                        <select
                                            value={targetConcurrency}
                                            onChange={(e) => setTargetConcurrency(Number(e.target.value))}
                                            className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-1.5 focus:outline-none focus:border-accent-600 font-mono text-xs cursor-pointer"
                                        >
                                            <option value={16}>16 active streams</option>
                                            <option value={32}>32 active streams (Standard)</option>
                                            <option value={64}>64 active streams (Heavy)</option>
                                            <option value={128}>128 active streams (Stress)</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Step 1 Results: Top Throughput Champion & Qualifying List */}
                            {bestThroughputMatch ? (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-slate-300">
                                            <strong className="text-emerald-400">{matchingRecipes.length}</strong> qualifying configuration{matchingRecipes.length !== 1 ? 's' : ''}
                                        </span>
                                        <span className="text-micro text-slate-400">
                                            Sorted by throughput
                                        </span>
                                    </div>

                                    {/* #1 Highest-Throughput Winner Spotlight Card */}
                                    <div className="p-5 rounded-2xl bg-gradient-to-br from-accent-50/30 via-slate-900 to-slate-950 border border-accent-600/40 shadow-lg relative overflow-hidden">
                                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent-600/20 text-accent-800 text-xs font-semibold border border-accent-700/40">
                                                <Star className="w-3.5 h-3.5 fill-accent-700 text-accent-700" />
                                                #1 Throughput
                                            </span>
                                            <span className="text-xs font-mono font-bold text-emerald-400">
                                                ${(bestThroughputMatch.cost_analysis?.cost_per_1m_output_tokens_usd ?? 0).toFixed(3)} / 1M tokens
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                                            <div className="lg:col-span-7 space-y-1.5">
                                                <h3 className="font-bold text-white text-base leading-snug">
                                                    {bestThroughputMatch.model_family || bestThroughputMatch.model_name || 'Model'} · {bestThroughputMatch.hardware_summary}
                                                </h3>
                                                <p className="text-xs text-slate-400 font-mono">
                                                    {bestThroughputMatch.recipe_name} · {bestThroughputMatch.stack?.engine || 'llm-d'} TP={bestThroughputMatch.stack?.tensor_parallel_size || 1}
                                                </p>
                                            </div>

                                            <div className="lg:col-span-5 grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center font-mono text-xs">
                                                <div>
                                                    <span className="text-tiny text-slate-500 uppercase block font-sans">TTFT (P50)</span>
                                                    <span className="text-accent-800 font-bold">{(bestThroughputMatch.ttft_p50 ?? 0).toFixed(1)} ms</span>
                                                </div>
                                                <div>
                                                    <span className="text-tiny text-slate-500 uppercase block font-sans">Throughput</span>
                                                    <span className="text-amber-300 font-bold">{Math.round(bestThroughputMatch.tokens_per_sec || 0).toLocaleString()} tok/s</span>
                                                </div>
                                                <div>
                                                    <span className="text-tiny text-slate-500 uppercase block font-sans">Hourly Rate</span>
                                                    <span className="text-white font-bold">${(bestThroughputMatch.cost_analysis?.hourly_rate_usd ?? 0).toFixed(2)}/hr</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Alternative Qualifying Hardware Setups Table */}
                                    {otherMatches.length > 0 && (
                                        <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead className="label-caps text-slate-400 bg-slate-950 border-b border-slate-800">
                                                    <tr>
                                                        <th className="py-2.5 px-3.5">Model & recipe</th>
                                                        <th className="py-2.5 px-3.5">Hardware & topology</th>
                                                        <th className="py-2.5 px-3.5 text-right">TTFT (P50)</th>
                                                        <th className="py-2.5 px-3.5 text-right">Throughput</th>
                                                        <th className="py-2.5 px-3.5 text-right">Cost / 1M</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-800/60 font-mono text-xs text-slate-300">
                                                    {otherMatches.map((item) => (
                                                        <tr key={item.id || item.recipe_name} className="hover:bg-slate-800/30">
                                                            <td className="py-2.5 px-3.5 font-sans font-medium text-white">
                                                                <div className="truncate max-w-[200px]">{item.model_family || item.model_name}</div>
                                                                <div className="text-tiny text-slate-400 font-mono truncate">{item.recipe_name}</div>
                                                            </td>
                                                            <td className="py-2.5 px-3.5 font-sans">
                                                                <div className="text-slate-200 font-mono font-medium truncate max-w-[180px]">{item.hardware_summary}</div>
                                                                <div className="text-tiny text-slate-400 font-mono">{item.stack?.engine ? item.stack.engine.toUpperCase() : 'LLM-D'} TP{item.stack?.tensor_parallel_size || 1}</div>
                                                            </td>
                                                            <td className="py-2.5 px-3.5 text-right text-accent-800 font-bold">{(item.ttft_p50 ?? 0).toFixed(1)} ms</td>
                                                            <td className="py-2.5 px-3.5 text-right text-amber-300 font-bold">{Math.round(item.tokens_per_sec || 0).toLocaleString()} tok/s</td>
                                                            <td className="py-2.5 px-3.5 text-right text-emerald-400 font-bold">${(item.cost_analysis?.cost_per_1m_output_tokens_usd ?? 0).toFixed(3)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-950/60 text-slate-400 space-y-2">
                                    <div className="text-amber-400 font-bold text-sm">No hardware configurations meet both boundaries</div>
                                    <p className="text-xs">Try increasing TTFT to &ge; 40 ms or TPOT to &ge; 15 ms to view qualifying options.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* STEP 2: VISUALIZE DISTRIBUTIONS BY HARDWARE              */}
                    {/* ======================================================== */}
                    {currentStep === 2 && (
                        <div className="space-y-5">
                            {/* Accelerator Selector Pill Bar */}
                            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <label className="text-tiny uppercase font-semibold text-slate-400 block mb-1">
                                        Select hardware accelerator to visualize
                                    </label>
                                    <div className="flex flex-wrap gap-1.5">
                                        {availableAccelerators.map(acc => (
                                            <button
                                                key={acc}
                                                onClick={() => setSelectedAccelerator(acc)}
                                                className={cn('px-3 py-1 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer', selectedAccelerator === acc
                                                        ? 'bg-accent-600 text-slate-950 shadow-[0_0_15px_rgba(6,182,212,0.3)]'
                                                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:text-white')}
                                            >
                                                {acc}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 font-mono text-micro">
                                    <span className="text-slate-400">X-Axis:</span>
                                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                                        {['ttft_p50', 'ttft_p99'].map(m => (
                                            <button
                                                key={m}
                                                onClick={() => setScatterXAxis(m)}
                                                className={cn('px-2 py-0.5 rounded text-tiny font-semibold cursor-pointer', scatterXAxis === m ? 'bg-accent-600 text-slate-950' : 'text-slate-400 hover:text-white')}
                                            >
                                                {m.toUpperCase().replace('_', ' ')}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Scatter Distribution Chart */}
                            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                                    <span>Performance distribution: Throughput vs. Latency for {selectedAccelerator !== 'all' ? selectedAccelerator : 'All Accelerators'}</span>
                                    <span className="font-mono text-accent-700 font-normal">Bubble size = System tok/s</span>
                                </div>

                                <div className="w-full h-[320px] relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ScatterChart margin={{ top: 10, right: 20, bottom: 25, left: 10 }}>
                                            <CartesianGrid {...gridProps()} opacity={0.6} />
                                            <ChartXAxis
                                                type="number"
                                                dataKey={scatterXAxis}
                                                name="Latency"
                                                unit=" ms"
                                                label={`${scatterXAxis.toUpperCase().replace('_', ' ')} (ms) — Prefill Latency`}
                                            />
                                            <ChartYAxis
                                                type="number"
                                                dataKey="tokens_per_sec"
                                                name="Throughput"
                                                unit=" tok/s"
                                                label="Aggregate Throughput (Tokens/s)"
                                            />
                                            <ZAxis type="number" dataKey="tokens_per_sec" range={[50, 220]} />

                                            {/* SLA Bounding Area */}
                                            <ReferenceArea
                                                x1={0}
                                                x2={maxTtftSla}
                                                y1={0}
                                                fill={CHART_STATUS.good}
                                                fillOpacity={0.06}
                                                stroke={CHART_STATUS.good}
                                                strokeDasharray="4 4"
                                                strokeOpacity={0.4}
                                            />

                                            <Tooltip
                                                content={({ active, payload }) => {
                                                    if (!active || !payload || !payload.length) return null;
                                                    const item = payload[0]?.payload;
                                                    if (!item) return null;
                                                    return (
                                                        <ChartTooltip className="min-w-[240px] font-mono text-xs">
                                                            <div className="font-bold text-white mb-1">{item.model_family || item.model_name || 'Recipe'} ({item.concurrencyLabel || `N=${item.concurrency || 32}`})</div>
                                                            <div className="text-tiny text-accent-800 mb-2">{item.hardware_summary}</div>
                                                            <div className="space-y-1">
                                                                <ChartTooltipRow color={item.color} label="Throughput" value={`${(item.tokens_per_sec || 0).toLocaleString()} tok/s`} />
                                                                <ChartTooltipRow color={item.color} label="TTFT (P50)" value={`${item.ttft_p50 ?? 0} ms`} />
                                                                <ChartTooltipRow color={item.color} label="TPOT (P50)" value={`${item.tpot_p50 ?? 0} ms`} />
                                                                <ChartTooltipRow color={item.color} label="KV Cache Usage" value={`${item.kv_cache_usage_pct ?? 0}%`} />
                                                            </div>
                                                        </ChartTooltip>
                                                    );
                                                }}
                                            />

                                            <Scatter name="Runs" data={distributionPoints}>
                                                {distributionPoints.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-${index}`}
                                                        fill={entry.color || CHART_SERIES[1]}
                                                        fillOpacity={entry.isBaseRun ? 0.9 : 0.65}
                                                        stroke={entry.isBaseRun ? chartTheme.surface : entry.color || CHART_SERIES[1]}
                                                        strokeWidth={entry.isBaseRun ? 1.5 : 1}
                                                    />
                                                ))}
                                            </Scatter>
                                        </ScatterChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* STEP 3: CALCULATE REAL-WORLD COSTS                       */}
                    {/* ======================================================== */}
                    {currentStep === 3 && (
                        bestThroughputMatch && costBreakdown ? (
                            <div className="space-y-5">
                                {/* Pricing Controls Card */}
                                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Region Selector */}
                                        <div>
                                            <label className="text-micro font-medium text-slate-400 block mb-1">
                                                1. Region
                                            </label>
                                            <select
                                                value={selectedRegion}
                                                onChange={(e) => setSelectedRegion(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-accent-600 font-mono text-xs cursor-pointer"
                                            >
                                                <option value="us-central1">us-central1 (Iowa, USA) — Standard Baseline</option>
                                                <option value="us-east4">us-east4 (N. Virginia, USA) — +2% Premium</option>
                                                <option value="europe-west4">europe-west4 (Eemshaven, NL) — +8% Premium</option>
                                                <option value="asia-southeast1">asia-southeast1 (Singapore) — +15% Premium</option>
                                            </select>
                                        </div>

                                        {/* Contract / Commitment Type */}
                                        <div>
                                            <label className="text-micro font-medium text-slate-400 block mb-1">
                                                2. Commitment discount (CUD)
                                            </label>
                                            <select
                                                value={commitmentType}
                                                onChange={(e) => setCommitmentType(e.target.value)}
                                                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-accent-600 font-mono text-xs cursor-pointer"
                                            >
                                                <option value="on_demand">On-Demand / Pay-as-you-go (Full List Price)</option>
                                                <option value="1yr_cud">1-Year Committed Use Discount (37% Discount)</option>
                                                <option value="3yr_cud">3-Year Committed Use Discount (55% Discount)</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Cost Breakdown Spotlight Matrix */}
                                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/40 shadow-xl space-y-4">
                                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                                        <div>
                                            <h3 className="font-bold text-white text-base">
                                                {bestThroughputMatch.model_family || bestThroughputMatch.model_name} · {bestThroughputMatch.hardware_summary}
                                            </h3>
                                        </div>
                                        <button
                                            onClick={handleCopyReport}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer border border-slate-700 transition-colors"
                                        >
                                            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                            <span>{copiedMarkdown ? 'Copied report!' : 'Copy report'}</span>
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono">
                                            <span className="text-tiny text-slate-400 uppercase font-sans block mb-1">Hourly cluster rate</span>
                                            <span className="text-lg font-bold text-white">${costBreakdown.hourly}</span>
                                            <span className="text-tiny text-slate-500 block">/ hour</span>
                                        </div>

                                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono">
                                            <span className="text-tiny text-slate-400 uppercase font-sans block mb-1">Monthly run rate</span>
                                            <span className="text-lg font-bold text-emerald-400">${costBreakdown.monthly}</span>
                                            <span className="text-tiny text-slate-500 block">730 hrs/mo</span>
                                        </div>

                                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono">
                                            <span className="text-tiny text-slate-400 uppercase font-sans block mb-1">Cost / 1M tokens</span>
                                            <span className="text-lg font-bold text-accent-800">${costBreakdown.costPer1M}</span>
                                            <span className="text-tiny text-slate-500 block">per million</span>
                                        </div>

                                        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-center font-mono">
                                            <span className="text-tiny text-slate-400 uppercase font-sans block mb-1">Efficiency value</span>
                                            <span className="text-lg font-bold text-amber-300">{costBreakdown.tokensPerDollar}</span>
                                            <span className="text-tiny text-slate-500 block">tokens / $</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-8 text-center rounded-2xl border border-slate-800 bg-slate-950/60 text-slate-400 space-y-3">
                                <div className="text-amber-400 font-bold text-sm">No qualifying configuration selected for pricing</div>
                                <p className="text-xs">Return to Step 1 to adjust latency boundaries or select a model with qualifying hardware recipes.</p>
                                <button
                                    onClick={() => setCurrentStep(1)}
                                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-accent-700 text-xs font-semibold cursor-pointer border border-slate-700 transition-colors inline-flex items-center gap-1.5"
                                >
                                    <ArrowLeft className="w-3.5 h-3.5" />
                                    <span>Return to Step 1: Filter boundaries</span>
                                </button>
                            </div>
                        )
                    )}
                </div>

                {/* Modal Footer: Navigation Controls */}
                <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs">
                    {currentStep > 1 ? (
                        <button
                            onClick={() => setCurrentStep(currentStep - 1)}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer border border-slate-700 transition-colors"
                        >
                            <ArrowLeft className="w-3.5 h-3.5" />
                            <span>Back to step {currentStep - 1}</span>
                        </button>
                    ) : (
                        <div />
                    )}

                    <div className="flex items-center gap-2">
                        {currentStep < 3 ? (
                            <button
                                onClick={() => setCurrentStep(currentStep + 1)}
                                disabled={!bestThroughputMatch}
                                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-slate-950 font-bold text-xs cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all disabled:opacity-50"
                            >
                                <span>Proceed to step {currentStep + 1}: {currentStep === 1 ? 'Visualize hardware distribution' : 'Calculate real-world costs'}</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    if (bestThroughputMatch) {
                                        if (onApplyConstraints) {
                                            onApplyConstraints({
                                                model: bestThroughputMatch.model_family,
                                                hardware: bestThroughputMatch.hardware_summary,
                                                recipe: bestThroughputMatch
                                            });
                                        }
                                        if (onSelectRecipe) onSelectRecipe(bestThroughputMatch);
                                    }
                                    onClose();
                                }}
                                disabled={!bestThroughputMatch}
                                className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Inspect full recipe manifest</span>
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
