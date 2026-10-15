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
import { ChevronDown, X, Sparkles, Cpu, Layers, HardDrive, Box } from 'lucide-react';
import { StatusChip } from '../ui';
import { cn } from '../../utils/cn';
import {
    OBJECTIVES,
    WORKLOADS,
    ENGINE_OPTIONS,
    hardwareOptionsFor,
    objectiveFor,
    workloadFor,
    engineLabel,
} from '../../utils/leaderboardFacets.js';
import { pickDefaultScope } from '../../utils/runParity.js';

// Objectives whose numbers move with model size: ranked across model
// families they compare an 8B model with a 671B one.
const SIZE_SENSITIVE_OBJECTIVES = new Set(['tokens_per_sec_per_chip', 'ttft_p50', 'itl_p50', 'cost_per_1m']);

const runs = (n) => `${n} ${n === 1 ? 'run' : 'runs'}`;

// `display` is the primary label in the facet cell; `label` is the native <option> text with run count.
const opt = (value, display, n, label = display) => ({ value, display, label: `${label} · ${runs(n)}` });

/**
 * Fixed-width, fixed-height facet cell in the 5-column conversational query grid.
 * Because each cell sits in a fixed CSS Grid column and truncates its value and subtitle
 * to a single line, selecting options of different lengths never shifts neighboring controls
 * or causes line-wrap jumps.
 */
function QueryFacetCell({
    connector,
    ariaLabel,
    icon: Icon,
    value,
    onChange,
    options,
    subtitle,
    isScoped = false,
    onReset,
}) {
    const current = options.find((o) => o.value === value) || options[0];
    const displayValue = current?.display ?? current?.label ?? value;

    return (
        <div
            className={cn(
                'relative min-w-0 px-3.5 py-2.5 transition-colors group select-none',
                isScoped ? 'bg-accent-50/35 hover:bg-accent-50/60' : 'bg-white hover:bg-zinc-50/90'
            )}
        >
            {/* Row 1: Natural-language connector + chevron / clear button */}
            <div className="flex items-center justify-between gap-1 mb-0.5 h-4">
                <span className="inline-flex items-center gap-1 text-tiny font-mono uppercase tracking-wide text-zinc-600 font-semibold truncate">
                    {Icon && <Icon className="w-3 h-3 text-accent-600 shrink-0" />}
                    <span className="truncate">{connector}</span>
                </span>
                <div className="flex items-center gap-0.5 shrink-0">
                    {isScoped && onReset && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onReset();
                            }}
                            className="relative z-10 w-4 h-4 inline-flex items-center justify-center rounded-full text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/70 transition-colors cursor-pointer"
                            title={`Reset ${ariaLabel.toLowerCase()} to all`}
                            aria-label={`Reset ${ariaLabel}`}
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                    <ChevronDown
                        aria-hidden="true"
                        className="w-3.5 h-3.5 text-accent-600 group-hover:translate-y-0.5 transition-transform"
                        strokeWidth={2.25}
                    />
                </div>
            </div>

            {/* Row 2: Selected value (single-line truncated so width/height never jumps) */}
            <div
                className="text-sm sm:text-[15px] font-semibold text-zinc-900 truncate leading-snug group-hover:text-accent-700 transition-colors"
                title={displayValue}
            >
                {displayValue}
            </div>

            {/* Row 3: Fixed single-line contextual subtitle */}
            <div className="text-tiny font-mono text-zinc-600 truncate mt-0.5" title={subtitle}>
                {subtitle}
            </div>

            {/* Accessible full-cell native <select> overlay */}
            <select
                aria-label={ariaLabel}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none text-sm z-0"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

export default function LeaderboardAsk({
    dataset = [],
    results,
    rankingMetric,
    setRankingMetric,
    selectedModelFamily,
    setSelectedModelFamily,
    selectedWorkload = 'all',
    setSelectedWorkload,
    selectedHardware,
    setSelectedHardware,
    selectedEngine,
    setSelectedEngine,
    availableModels = [],
    matchCount,
    missesSloCount = 0,
    hasSamples = false,
    onOpenFeedback,
}) {
    const selection = {
        model: selectedModelFamily,
        workload: selectedWorkload,
        hardware: selectedHardware,
        engine: selectedEngine,
    };
    const inScope = (s) => (r) =>
        (s.model === 'all' || r.model_family === s.model) &&
        (s.workload === 'all' || r.workload_class === s.workload) &&
        (s.hardware === 'all' || r.hardware?.accelerator_type === s.hardware) &&
        (s.engine === 'all' || r.stack?.engine === s.engine);

    const countWith = (patch) => dataset.filter(inScope({ ...selection, ...patch })).length;

    const withSelected = (options, key) =>
        !selection[key] || selection[key] === 'all' || options.some((o) => o.value === selection[key])
            ? options
            : [...options, opt(selection[key], selection[key], countWith({}))];

    const objectiveOptions = OBJECTIVES.map((o) => ({
        value: o.value,
        display: o.label.charAt(0).toUpperCase() + o.label.slice(1),
        label: `${o.label.charAt(0).toUpperCase() + o.label.slice(1)} (rank by ${o.by})`,
    }));

    const modelOptions = withSelected(
        [
            opt('all', 'All models', countWith({ model: 'all' })),
            ...availableModels.map((m) => opt(m, m, countWith({ model: m }))),
        ],
        'model'
    );

    const workloadOptions = withSelected(
        [
            opt('all', 'All workloads', countWith({ workload: 'all' })),
            ...WORKLOADS.map((w) =>
                opt(
                    w.value,
                    w.label,
                    countWith({ workload: w.value }),
                    `${w.label} (${w.islOslLabel || w.rule})`
                )
            ),
        ],
        'workload'
    );

    const hwList = hardwareOptionsFor(dataset);
    const hardwareOptions = withSelected(
        [
            opt('all', 'Any accelerator', countWith({ hardware: 'all' })),
            ...hwList.map((h) => opt(h.value, h.label, countWith({ hardware: h.value }))),
        ],
        'hardware'
    );

    const engineOptions = withSelected(
        [
            opt('all', 'Any component', countWith({ engine: 'all' })),
            ...ENGINE_OPTIONS.map((e) => opt(e.value, e.label, countWith({ engine: e.value }))),
        ],
        'engine'
    );

    const total = dataset.length;
    const ranked = results ?? dataset.filter(inScope(selection));
    const n = matchCount ?? ranked.length;
    const qualifyingCount = Math.max(0, n - missesSloCount);
    const familyCount = new Set(ranked.map((r) => r.model_family).filter(Boolean)).size;
    const mixesModelSizes =
        selectedModelFamily === 'all' && familyCount > 1 && SIZE_SENSITIVE_OBJECTIVES.has(rankingMetric);

    const recommendedScope = pickDefaultScope(dataset, {
        workload: selectedWorkload,
        hardware: selectedHardware,
        engine: selectedEngine,
    });
    const topModel =
        recommendedScope.model !== 'all' ? recommendedScope.model : availableModels[0] || 'Llama 3.1 70B';

    const activeObjective = objectiveFor(rankingMetric);
    const activeWorkload = workloadFor(selectedWorkload);
    const activeHw = hwList.find((h) => h.value === selectedHardware);

    // Subtitles for each fixed cell so metadata never pops in/out of external rows
    const objectiveSubtitle = `Ranked by ${activeObjective.by}`;
    const modelSubtitle =
        selectedModelFamily === 'all'
            ? `Across ${availableModels.length || familyCount} model families`
            : `${runs(countWith({}))} for this model`;
    const workloadSubtitle = activeWorkload
        ? activeWorkload.islOslLabel || activeWorkload.rule
        : 'All ISL / OSL token profiles';
    const hardwareSubtitle = activeHw
        ? `${runs(countWith({}))} on ${activeHw.short || activeHw.label}`
        : 'GPU & TPU configurations';
    const engineSubtitle =
        selectedEngine === 'all'
            ? 'llm-d, vLLM, SGLang'
            : `Filtered to ${engineLabel(selectedEngine)}`;

    return (
        <div className="surface-light rounded-t-2xl border border-zinc-200/90 bg-white overflow-hidden">
            {/* Fixed 5-Column Conversational Query Grid — zero horizontal or vertical layout jump */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-zinc-200/80">
                <QueryFacetCell
                    connector="Show me the"
                    ariaLabel="Objective"
                    icon={Sparkles}
                    value={rankingMetric}
                    onChange={setRankingMetric}
                    options={objectiveOptions}
                    subtitle={objectiveSubtitle}
                    isScoped={false}
                />
                <QueryFacetCell
                    connector="To serve model"
                    ariaLabel="Model"
                    icon={Box}
                    value={selectedModelFamily}
                    onChange={setSelectedModelFamily}
                    options={modelOptions}
                    subtitle={modelSubtitle}
                    isScoped={selectedModelFamily !== 'all'}
                    onReset={setSelectedModelFamily ? () => setSelectedModelFamily('all') : undefined}
                />
                <QueryFacetCell
                    connector="For workload"
                    ariaLabel="Workload"
                    icon={Layers}
                    value={selectedWorkload}
                    onChange={setSelectedWorkload}
                    options={workloadOptions}
                    subtitle={workloadSubtitle}
                    isScoped={selectedWorkload !== 'all'}
                    onReset={setSelectedWorkload ? () => setSelectedWorkload('all') : undefined}
                />
                <QueryFacetCell
                    connector="On accelerator"
                    ariaLabel="Accelerator"
                    icon={Cpu}
                    value={selectedHardware}
                    onChange={setSelectedHardware}
                    options={hardwareOptions}
                    subtitle={hardwareSubtitle}
                    isScoped={selectedHardware !== 'all'}
                    onReset={setSelectedHardware ? () => setSelectedHardware('all') : undefined}
                />
                <QueryFacetCell
                    connector="With stack components"
                    ariaLabel="Stack components"
                    icon={HardDrive}
                    value={selectedEngine}
                    onChange={setSelectedEngine}
                    options={engineOptions}
                    subtitle={engineSubtitle}
                    isScoped={selectedEngine !== 'all'}
                    onReset={setSelectedEngine ? () => setSelectedEngine('all') : undefined}
                />
            </div>

            {/* Single-line fixed-height Scope Status Bar */}
            <div className="px-3.5 sm:px-4 py-2 bg-zinc-50/90 border-t border-zinc-200/70 flex items-center justify-between gap-3 text-xs text-zinc-700 min-h-[38px]">
                <div className="flex items-center gap-2 min-w-0 overflow-hidden" aria-live="polite">
                    <span className="inline-flex items-center rounded-full bg-accent-50 border border-accent-200 px-2.5 py-0.5 font-mono text-micro font-semibold text-accent-800 shrink-0">
                        {missesSloCount > 0
                            ? `${qualifyingCount} meet SLO · ${missesSloCount} miss`
                            : n === total
                                ? `All ${runs(total)}`
                                : `${n} of ${runs(total)} in scope`}
                    </span>

                    {selectedModelFamily === 'all' ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-micro font-medium text-amber-900 shrink-0">
                            <span>{mixesModelSizes ? 'Grouped by model size' : 'Grouped by model'}</span>
                            {setSelectedModelFamily && topModel && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedModelFamily(topModel)}
                                    className="font-semibold text-amber-950 underline decoration-amber-400 underline-offset-2 hover:text-accent-700 cursor-pointer"
                                >
                                    Scope to {topModel}
                                </button>
                            )}
                        </span>
                    ) : (
                        setSelectedModelFamily && (
                            <button
                                type="button"
                                onClick={() => setSelectedModelFamily('all')}
                                className="inline-flex items-center gap-1 rounded-full bg-white hover:bg-zinc-100 border border-zinc-200 px-2.5 py-0.5 text-micro font-medium text-zinc-700 hover:text-zinc-900 transition-colors cursor-pointer shrink-0"
                            >
                                Compare all models
                            </button>
                        )
                    )}

                    {hasSamples && (
                        <span className="hidden md:inline-flex items-center gap-1.5 text-micro text-zinc-600 truncate" role="note">
                            <span className="text-zinc-400" aria-hidden="true">·</span>
                            <StatusChip status="sample" size="xs" />
                            <span className="truncate">Includes reference curves</span>
                        </span>
                    )}
                </div>

                {onOpenFeedback && (
                    <button
                        type="button"
                        onClick={() => onOpenFeedback('missing_workload')}
                        className="text-micro font-medium text-zinc-700 underline decoration-zinc-300 underline-offset-4 transition-colors hover:text-accent-700 hover:decoration-accent-400 cursor-pointer shrink-0 whitespace-nowrap"
                    >
                        Missing a workload or hardware? Request one →
                    </button>
                )}
            </div>
        </div>
    );
}
