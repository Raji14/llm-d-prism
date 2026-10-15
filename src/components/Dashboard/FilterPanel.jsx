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
import { Filter, ChevronUp, ChevronDown, X, RotateCcw } from 'lucide-react';
import { MultiSelectDropdown } from '../common';
import { Panel, Button, Badge } from '../ui';
import { cn } from '../../utils/cn';
import { USE_CASE_META, formatOriginLabel } from '../../utils/dashboardHelpers';

export const FilterPanel = ({
    showFilterPanel,
    filterOptions,
    activeFilters,
    facetCounts,
    toggleFilter,
    selectedModels,
    modelStats,
    filteredBySource,
    showSelectedOnly,
    setShowSelectedOnly,
    selectedBenchmarks,
    setSelectedBenchmarks,
    setActiveFilters,
    expandedModels,
    toggleBenchmark,
    toggleModelExpansion,
    baselineBenchmarkKey,
    setBaselineBenchmarkKey,
    UnifiedDataTable,
    brv02CustomLabels
}) => {
    // Default collapsed if benchmarks are selected to avoid scrolling
    const [isFiltersExpanded, setIsFiltersExpanded] = useState(() => {
        return !(selectedBenchmarks && selectedBenchmarks.size >= 2);
    });

    // Compute active filter pills for quick viewing and 1-click removal
    const activeFilterPills = useMemo(() => {
        const pills = [];
        if (!activeFilters) return pills;

        const categoryLabels = {
            models: 'Model',
            hardware: 'HW',
            machines: 'Machine',
            precisions: 'Precision',
            tp: 'TP',
            isl: 'ISL',
            osl: 'OSL',
            ratio: 'Workload',
            modelServer: 'Server',
            servingStack: 'Stack',
            optimizations: 'Opt',
            components: 'Comp',
            pdRatio: 'P/D',
            acc_count: 'Chips',
            useCase: 'Use Case',
            origins: 'Origin'
        };

        Object.entries(activeFilters).forEach(([catKey, valSet]) => {
            if (valSet instanceof Set && valSet.size > 0) {
                valSet.forEach(val => {
                    pills.push({
                        id: `${catKey}-${val}`,
                        categoryKey: catKey,
                        category: categoryLabels[catKey] || catKey,
                        val,
                        label: String(val)
                    });
                });
            }
        });

        return pills;
    }, [activeFilters]);

    const activeFilterCount = activeFilterPills.length;

    const handleClearAllFilters = () => {
        setActiveFilters({
            models: new Set(),
            hardware: new Set(),
            machines: new Set(),
            precisions: new Set(),
            tp: new Set(),
            isl: new Set(),
            osl: new Set(),
            ratio: new Set(),
            acc_count: new Set(),
            modelServer: new Set(),
            useCase: new Set(),
            servingStack: new Set(),
            optimizations: new Set(),
            components: new Set(),
            pdRatio: new Set(),
            origins: new Set()
        });
        setShowSelectedOnly(false);
    };

    if (!showFilterPanel) return null;

    return (
        <Panel padding="none" className="p-2.5 mb-2">
            {/* Header & Active Filters Bar */}
            <div className="flex flex-col gap-2.5">
                <div className="flex justify-between items-center flex-wrap gap-2 py-0.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h2 className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Filter size={13} className="text-accent-700" />
                            Benchmark Filters
                        </h2>

                        {/* Active Filter Count & Removable Pills */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {activeFilterCount > 0 ? (
                                <>
                                    <Badge tone="info" size="xs">
                                        {activeFilterCount} active
                                    </Badge>

                                    {activeFilterPills.slice(0, isFiltersExpanded ? 8 : 4).map(pill => (
                                        <span
                                            key={pill.id}
                                            className="inline-flex items-center gap-1 text-micro bg-slate-800 text-accent-800 border border-slate-700/80 px-2 py-0.5 rounded-full font-sans"
                                        >
                                            <span className="text-slate-400">{pill.category}:</span>
                                            <span className="font-semibold truncate max-w-[120px]" title={pill.label}>{pill.label}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleFilter(pill.categoryKey, pill.val);
                                                }}
                                                className="hover:text-red-400 p-0.5 ml-0.5 rounded-full hover:bg-slate-700 transition-colors"
                                                title="Remove filter"
                                            >
                                                <X size={10} />
                                            </button>
                                        </span>
                                    ))}

                                    {activeFilterPills.length > (isFiltersExpanded ? 8 : 4) && (
                                        <span className="text-tiny text-slate-400 font-mono">
                                            +{activeFilterPills.length - (isFiltersExpanded ? 8 : 4)} more
                                        </span>
                                    )}

                                    <button
                                        onClick={handleClearAllFilters}
                                        className="text-micro text-slate-400 hover:text-red-400 underline ml-1 flex items-center gap-1"
                                    >
                                        <RotateCcw size={10} /> Clear all
                                    </button>
                                </>
                            ) : (
                                <span className="text-micro text-slate-500">
                                    (Showing all matching runs)
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {isFiltersExpanded && filterOptions.origins?.length > 0 && (
                            <div className="w-48 opacity-80 hover:opacity-100 transition-opacity">
                                <MultiSelectDropdown 
                                    label="Origin / Folder"
                                    options={filterOptions.origins || []}
                                    selected={activeFilters.origins}
                                    onChange={(val) => toggleFilter('origins', val)}
                                    counts={facetCounts.origins || {}}
                                    formatLabel={formatOriginLabel}
                                />
                            </div>
                        )}

                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={() => setIsFiltersExpanded(!isFiltersExpanded)}
                            className="text-slate-300 hover:text-white"
                        >
                            <span>{isFiltersExpanded ? "Collapse Filters" : `Expand Filters (${activeFilterCount} Active)`}</span>
                            {isFiltersExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </Button>
                    </div>
                </div>

                {/* Filter Groups - Expandable Layout */}
                {isFiltersExpanded && (
                    <div className="flex flex-col md:flex-row gap-4 border-t border-slate-700/50 pt-2.5 animate-in fade-in duration-200">
                        {/* Section 1: Application / Model Server */}
                        <div className="flex-1 min-w-[200px]">
                            <h4 className="text-tiny font-semibold uppercase text-slate-400 mb-1 px-1">Application / Model Server</h4>
                            <div className="grid grid-cols-2 gap-1">
                                <MultiSelectDropdown 
                                    label="Models"
                                    options={filterOptions.models}
                                    selected={activeFilters.models}
                                    onChange={(val) => toggleFilter('models', val)}
                                    counts={facetCounts.models}
                                />
                                <MultiSelectDropdown 
                                    label="Precisions"
                                    options={filterOptions.precisions}
                                    selected={activeFilters.precisions}
                                    onChange={(val) => toggleFilter('precisions', val)}
                                    counts={facetCounts.precisions}
                                />
                                <MultiSelectDropdown 
                                    label="Model Server"
                                    options={filterOptions.modelServer}
                                    selected={activeFilters.modelServer}
                                    onChange={(val) => toggleFilter('modelServer', val)}
                                    counts={facetCounts.modelServer}
                                />
                                <MultiSelectDropdown 
                                    label="Tensor Parallelism (TP)"
                                    options={filterOptions.tp || []}
                                    selected={activeFilters.tp}
                                    onChange={(val) => toggleFilter('tp', val)}
                                    counts={facetCounts.tp}
                                />
                            </div>
                        </div>

                        <div className="hidden md:block w-px bg-slate-700/60 mx-1" />
                        
                        {/* Section 2: Hardware Infrastructure */}
                        <div className="flex-1 min-w-[200px]">
                            <h4 className="text-tiny font-semibold uppercase text-slate-400 mb-1 px-1">Hardware Infrastructure</h4>
                            <div className="grid grid-cols-2 gap-1">
                                <MultiSelectDropdown 
                                    label="Machine Type"
                                    options={filterOptions.machines}
                                    selected={activeFilters.machines}
                                    onChange={(val) => toggleFilter('machines', val)}
                                    counts={facetCounts.machines}
                                />
                                <MultiSelectDropdown 
                                    label="Accelerators"
                                    options={filterOptions.hardware}
                                    selected={activeFilters.hardware}
                                    onChange={(val) => toggleFilter('hardware', val)}
                                    counts={facetCounts.hardware}
                                />
                                <MultiSelectDropdown 
                                    label="Accelerator Count"
                                    options={filterOptions.acc_count}
                                    selected={activeFilters.acc_count}
                                    onChange={(val) => toggleFilter('acc_count', val)}
                                    counts={facetCounts.acc_count}
                                />
                            </div>
                        </div>

                        <div className="hidden md:block w-px bg-slate-700/60 mx-1" />

                        {/* Section 3: Orchestration */}
                        <div className="flex-1 min-w-[200px]">
                            <h4 className="text-tiny font-semibold uppercase text-slate-400 mb-1 px-1">Orchestration / Serving Framework</h4>
                            <div className="grid grid-cols-2 gap-1">
                                <MultiSelectDropdown 
                                    label="Serving Stack"
                                    options={filterOptions.servingStack || []}
                                    selected={activeFilters.servingStack}
                                    onChange={(val) => toggleFilter('servingStack', val)}
                                    counts={facetCounts.servingStack || {}}
                                />
                                <MultiSelectDropdown 
                                    label="Optimizations"
                                    options={[
                                        "Atomic / Gang Scheduling",
                                        "Topology Aware Scheduling",
                                        "P/D Disaggregation",
                                        "Horizontal Pod Autoscaling",
                                        "Body based routing",
                                        "Approximate prefix aware routing",
                                        "Precise prefix aware routing"
                                    ]}
                                    selected={activeFilters.optimizations}
                                    onChange={(val) => toggleFilter('optimizations', val)}
                                    counts={facetCounts.optimizations}
                                />
                                <MultiSelectDropdown 
                                    label="Components"
                                    options={["Inference Gateway", "Inference Scheduler", "LeaderWorkerSet"]}
                                    selected={activeFilters.components}
                                    onChange={(val) => toggleFilter('components', val)}
                                    counts={facetCounts.components}
                                />
                                <MultiSelectDropdown 
                                    label="P/D Node Ratio"
                                    options={filterOptions.pdRatio}
                                    selected={activeFilters.pdRatio}
                                    onChange={(val) => toggleFilter('pdRatio', val)}
                                    counts={facetCounts.pdRatio}
                                />
                            </div>
                        </div>

                        <div className="hidden md:block w-px bg-slate-700/60 mx-1" />

                        {/* Section 4: Benchmark Load */}
                        <div className="flex-1 min-w-[200px]">
                            <h4 className="text-tiny font-semibold uppercase text-slate-400 mb-1 px-1">Benchmark Load</h4>
                            <div className="grid grid-cols-2 gap-1">
                                <MultiSelectDropdown 
                                    label="Input (ISL)"
                                    options={filterOptions.isl}
                                    selected={activeFilters.isl}
                                    onChange={(val) => toggleFilter('isl', val)}
                                    counts={facetCounts.isl}
                                />
                                <MultiSelectDropdown 
                                    label="Output (OSL)"
                                    options={filterOptions.osl}
                                    selected={activeFilters.osl}
                                    onChange={(val) => toggleFilter('osl', val)}
                                    counts={facetCounts.osl}
                                />
                                <MultiSelectDropdown 
                                    label="Workload Type"
                                    options={filterOptions.ratio}
                                    selected={activeFilters.ratio}
                                    onChange={(val) => toggleFilter('ratio', val)}
                                    counts={facetCounts.ratio}
                                />
                                <MultiSelectDropdown 
                                    label="Use Case"
                                    options={filterOptions.useCase}
                                    selected={activeFilters.useCase}
                                    onChange={(val) => toggleFilter('useCase', val)}
                                    counts={facetCounts.useCase}
                                    formatLabel={(opt) => {
                                        const meta = USE_CASE_META[opt];
                                        return meta ? `${opt} ${meta}` : opt;
                                    }}
                                />
                            </div>
                        </div>
                    </div>
                )}
                
                {/* Unified Data Table is ALWAYS mounted so collapsing filters never hides the table */}
                <div className="border-t border-slate-700/40 pt-2">
                    <UnifiedDataTable
                        modelStats={modelStats}
                        selectedModels={selectedModels}
                        filteredBySource={filteredBySource}
                        showSelectedOnly={showSelectedOnly}
                        setShowSelectedOnly={setShowSelectedOnly}
                        selectedBenchmarks={selectedBenchmarks}
                        setSelectedBenchmarks={setSelectedBenchmarks}
                        setActiveFilters={setActiveFilters}
                        expandedModels={expandedModels}
                        toggleBenchmark={toggleBenchmark}
                        toggleModelExpansion={toggleModelExpansion}
                        baselineBenchmarkKey={baselineBenchmarkKey}
                        setBaselineBenchmarkKey={setBaselineBenchmarkKey}
                        brv02CustomLabels={brv02CustomLabels}
                    />
                </div>
            </div>
        </Panel>
    );
};

