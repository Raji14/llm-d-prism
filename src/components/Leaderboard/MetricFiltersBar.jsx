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
import { Search, Filter, Sliders, DollarSign, UploadCloud, Sparkles, Layers, Zap } from 'lucide-react';
import { ToggleGroup, Button, Badge } from '../ui';

export default function MetricFiltersBar({
    searchQuery,
    setSearchQuery,
    selectedModelFamily,
    setSelectedModelFamily,
    selectedHardware,
    setSelectedHardware,
    selectedEngine,
    setSelectedEngine,
    selectedScope = 'all',
    setSelectedScope,
    selectedContext,
    setSelectedContext,
    maxTtftSla,
    setMaxTtftSla,
    selectedHeadroom,
    setSelectedHeadroom,
    latencyMetric,
    setLatencyMetric,
    throughputMetric,
    setThroughputMetric,
    showParetoOnly,
    setShowParetoOnly,
    onOpenPricingModal,
    onOpenSizingWizard,
    onOpenSubmitModal,
    availableModels = [],
    availableHardware = [],
    availableEngines = []
}) {
    return (
        <div className="bg-theme-card dark:bg-slate-900/60 border border-theme-border dark:border-slate-800/80 rounded-2xl p-3.5 mb-6 backdrop-blur-xl shadow-xl flex flex-col gap-3">
            {/* Row 1: Search, Entity Selectors, Action Modals */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search recipes, models, or authors..."
                        className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 transition-colors font-mono"
                    />
                </div>

                {/* Model Selector */}
                <select
                    value={selectedModelFamily}
                    onChange={(e) => setSelectedModelFamily(e.target.value)}
                    className="bg-slate-950/80 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                    <option value="all">Model: All</option>
                    {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>

                {/* Hardware Selector */}
                <select
                    value={selectedHardware}
                    onChange={(e) => setSelectedHardware(e.target.value)}
                    className="bg-slate-950/80 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                    <option value="all">Hardware: All</option>
                    <option value="nvidia-h100-80gb">H100 (80GB)</option>
                    <option value="nvidia-a100-80gb">A100 (80GB)</option>
                    <option value="nvidia-l4">L4 (24GB)</option>
                    <option value="tpu-v6e-trillium">TPU v6e (Trillium)</option>
                    <option value="tpu-v5e">TPU v5e (Lite Pod)</option>
                </select>

                {/* Engine Selector */}
                <select
                    value={selectedEngine}
                    onChange={(e) => setSelectedEngine(e.target.value)}
                    className="bg-slate-950/80 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                    <option value="all">Stack: All</option>
                    <option value="llm-d">llm-d</option>
                    <option value="vllm">vLLM</option>
                    <option value="sglang">SGLang</option>
                    <option value="tensorrt-llm">TensorRT-LLM</option>
                </select>

                {/* Scope Selector */}
                <select
                    value={selectedScope}
                    onChange={(e) => setSelectedScope && setSelectedScope(e.target.value)}
                    className="bg-slate-950/80 border border-slate-800 text-slate-200 text-xs rounded-xl px-2.5 py-1.5 focus:outline-none focus:border-purple-500/50 cursor-pointer font-mono"
                >
                    <option value="all">Scope: All</option>
                    <option value="system">System E2E</option>
                    <option value="unit">Microbenchmark</option>
                </select>

                {/* Actions: Sizing Wizard & Pricing Settings */}
                <div className="flex items-center gap-2 ml-auto">
                    {onOpenSizingWizard && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={onOpenSizingWizard}
                            className="flex items-center gap-1.5 bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20 py-1"
                            title="Interactive SLA and Budget Sizing Wizard"
                        >
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            <span>Sizing Wizard</span>
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onOpenPricingModal}
                        className="flex items-center gap-1.5 py-1"
                        title="Customize GCP GPU/TPU hourly pricing rates"
                    >
                        <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                        <span>GCP Pricing</span>
                    </Button>
                </div>
            </div>

            {/* Row 2: Metric segmented toggles & Pareto Filter */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/60 text-xs">
                {/* Latency Axis Switcher */}
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Sliders className="w-3.5 h-3.5 text-cyan-400" /> Latency:
                    </span>
                    <ToggleGroup
                        size="xs"
                        value={latencyMetric}
                        onChange={setLatencyMetric}
                        options={[
                            { value: 'ttft_p50', label: 'TTFT P50' },
                            { value: 'ttft_p90', label: 'TTFT P90' },
                            { value: 'ttft_mean', label: 'Mean' },
                            { value: 'itl_p50', label: 'ITL' },
                        ]}
                    />
                </div>

                {/* Throughput Axis Switcher */}
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-amber-400" /> Throughput:
                    </span>
                    <ToggleGroup
                        size="xs"
                        value={throughputMetric}
                        onChange={setThroughputMetric}
                        options={[
                            { value: 'tokens_per_sec', label: 'Total Tok/s' },
                            { value: 'output_tokens_per_sec', label: 'Out Tok/s' },
                            { value: 'tokens_per_dollar', label: 'Tok / $' },
                        ]}
                    />
                </div>

                {/* Pareto Frontier Only Toggle */}
                <button
                    onClick={() => setShowParetoOnly(!showParetoOnly)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-xl border text-xs transition-all cursor-pointer ${
                        showParetoOnly
                            ? 'bg-amber-500/20 border-amber-400/60 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.25)] font-semibold'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Pareto Frontier Only</span>
                </button>
            </div>
        </div>
    );
}
