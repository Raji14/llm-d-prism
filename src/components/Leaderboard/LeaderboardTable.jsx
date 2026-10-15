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
    Crown,
    FileText,
    Star,
    ArrowLeftRight,
    FilterX,
    RotateCcw,
    Flag,
    MoreHorizontal,
    Eye,
    ExternalLink
} from 'lucide-react';
import { Button, EmptyState, StatusChip } from '../ui';
import { cn } from '../../utils/cn';
import {
    getRecipeReproductionCount,
    getRecipeViewCount
} from '../../utils/communityRewards.js';
import {
    DEFAULT_OBJECTIVE,
    HARDWARE_OPTIONS,
    engineLabel,
    workloadFor,
    latencyFor
} from '../../utils/leaderboardFacets.js';
import {
    formatRunDate,
    isStaleRun,
    annotateModelWorkloadGroupRanks
} from '../../utils/runParity.js';

// Columns where a smaller value ranks higher; their first click sorts ascending.
const LOWER_IS_BETTER = new Set(['rank', 'ttft_p50', 'itl_p50', 'cost_per_1m']);
const OBJECTIVE_SORT_FIELDS = new Set(['tokens_per_sec_per_chip', 'ttft_p50', 'itl_p50', 'cost_per_1m']);

function formatShortHardware(item) {
    const count = item?.hardware?.accelerator_count || 1;
    const accId = item?.hardware?.accelerator_type;
    const match = HARDWARE_OPTIONS.find((h) => h.value === accId);
    if (match) return `${count}× ${match.short}`;
    if (accId === 'nvidia-a100-40gb') return `${count}× A100 40G`;
    if (item?.hardware_summary) {
        return item.hardware_summary
            .replace(/^(\d+)x\s+/i, '$1× ')
            .replace(/NVIDIA\s+/i, '')
            .replace(/Google\s+/i, '')
            .replace(/\s+SXM5|\s+Trillium|\s+80GB|\s+24GB|\s+G2\s+VM/gi, '');
    }
    return `${count}× GPU`;
}

export default function LeaderboardTable({
    dataset = [],
    rankingMetric = DEFAULT_OBJECTIVE,
    onChangeRankingMetric,
    isGroupedByModel,
    selectedModelFamily,
    selectedWorkload,
    onSelectRecipe,
    selectedRecipe,
    selectedForCompare = [],
    onToggleCompare,
    onOpenCompareModal,
    baselineRecipeId,
    onSetBaseline,
    onResetFilters,
    onClearCompare,
    onOpenFeedback,
    onNavigate
}) {
    const [sortField, setSortField] = useState(null);
    const [sortDirection, setSortDirection] = useState('desc');
    const [openActionMenuId, setOpenActionMenuId] = useState(null);

    const [sortedObjective, setSortedObjective] = useState(rankingMetric);
    if (sortedObjective !== rankingMetric) {
        setSortedObjective(rankingMetric);
        setSortField(null);
    }

    useEffect(() => {
        if (!openActionMenuId) return undefined;
        const handleOutsideClick = () => setOpenActionMenuId(null);
        window.addEventListener('click', handleOutsideClick);
        return () => window.removeEventListener('click', handleOutsideClick);
    }, [openActionMenuId]);

    const baseline = dataset?.find(r => r.id === baselineRecipeId) || null;

    // Determine whether rows should be grouped by (model × workload)
    const effectiveGrouped = useMemo(() => {
        if (typeof isGroupedByModel === 'boolean') return isGroupedByModel;
        if (selectedModelFamily !== undefined || selectedWorkload !== undefined) {
            return selectedModelFamily === 'all' || selectedWorkload === 'all';
        }
        const distinctGroups = new Set(
            (dataset || []).map((r) => `${r.model_family || 'Model'}|||${r.workload_class || 'chat'}`)
        );
        return distinctGroups.size > 1;
    }, [isGroupedByModel, selectedModelFamily, selectedWorkload, dataset]);

    // Annotate dataset with per-(model × workload) group ranks if not already annotated
    const annotatedDataset = useMemo(() => {
        const items = dataset || [];
        if (items.length === 0) return [];
        const qualifying = items.filter((r) => !r.missesSlo);
        const missed = items.filter((r) => r.missesSlo);

        const hasGroupAnnotations = qualifying.every((r) => r.groupKey && typeof r.groupRank === 'number');
        const withAnnotations = hasGroupAnnotations ? qualifying : annotateModelWorkloadGroupRanks(qualifying);

        if (!effectiveGrouped) return [...withAnnotations, ...missed];

        // Keep runs of the same (model × workload) group contiguous in order of first appearance
        const groupedMap = new Map();
        withAnnotations.forEach((item) => {
            const key = item.groupKey || `${item.model_family || 'Model'}|||${item.workload_class || 'chat'}`;
            if (!groupedMap.has(key)) groupedMap.set(key, []);
            groupedMap.get(key).push(item);
        });
        const contiguous = [];
        groupedMap.forEach((groupItems) => {
            groupItems.forEach((item, idx) => {
                contiguous.push({
                    ...item,
                    groupRank: item.groupRank ?? (idx + 1),
                    groupSize: item.groupSize ?? groupItems.length
                });
            });
        });
        return [...contiguous, ...missed];
    }, [dataset, effectiveGrouped]);

    // Cost quartiles and per-group minimum cost so only top cost performers are highlighted green
    const costStats = useMemo(() => {
        const costs = (annotatedDataset || [])
            .filter((r) => !r.missesSlo)
            .map((r) => r.cost_analysis?.cost_per_1m_output_tokens_usd ?? r.cost_per_1m)
            .filter((c) => typeof c === 'number' && Number.isFinite(c) && c > 0)
            .sort((a, b) => a - b);

        if (costs.length === 0) {
            return { q25: 0, q75: Infinity, groupMin: new Map() };
        }
        const q25Idx = Math.max(0, Math.floor((costs.length - 1) * 0.25));
        const q75Idx = Math.min(costs.length - 1, Math.ceil((costs.length - 1) * 0.75));
        const groupMin = new Map();
        const groupCounts = new Map();
        annotatedDataset.forEach((r) => {
            if (r.missesSlo) return;
            const c = r.cost_analysis?.cost_per_1m_output_tokens_usd ?? r.cost_per_1m;
            if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return;
            const gKey = r.groupKey || `${r.model_family}|||${r.workload_class}`;
            groupCounts.set(gKey, (groupCounts.get(gKey) || 0) + 1);
            if (!groupMin.has(gKey) || c < groupMin.get(gKey)) {
                groupMin.set(gKey, c);
            }
        });
        groupMin.forEach((_, key) => {
            if ((groupCounts.get(key) || 0) < 2) groupMin.delete(key);
        });

        return {
            q25: costs[q25Idx],
            q75: costs.length >= 3 ? costs[q75Idx] : Infinity,
            groupMin
        };
    }, [annotatedDataset]);

    const handleSort = (field) => {
        // When clicking an objective column, also sync the top-level sentence objective when sorting in its canonical direction
        if (OBJECTIVE_SORT_FIELDS.has(field) && onChangeRankingMetric && sortField !== field) {
            onChangeRankingMetric(field);
            setSortField(null);
            return;
        }
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection(LOWER_IS_BETTER.has(field) ? 'asc' : 'desc');
        }
    };

    const normalizedObjective = rankingMetric === 'upvotes' ? 'reproductions' : rankingMetric;
    const indicatorField = sortField ?? normalizedObjective;
    const indicatorDirection = sortField ? sortDirection : (LOWER_IS_BETTER.has(normalizedObjective) ? 'asc' : 'desc');
    const sortArrow = (field) => indicatorField === field && (
        <span className="text-accent-600">{indicatorDirection === 'asc' ? '↑' : '↓'}</span>
    );

    let qualifyingRankCounter = 0;
    const rankedData = annotatedDataset.map((item) => {
        if (item.missesSlo) {
            return { item, rank: null };
        }
        qualifyingRankCounter += 1;
        return {
            item,
            rank: effectiveGrouped ? (item.groupRank || qualifyingRankCounter) : qualifyingRankCounter
        };
    });

    const sortValue = ({ item, rank }) => {
        if (sortField === 'rank') return rank ?? 9999;
        if (sortField === 'contributor') return (item.author?.github_id || item.author?.name || '').toLowerCase();
        if (sortField === 'cost_per_1m') return item.cost_analysis?.cost_per_1m_output_tokens_usd || 0;
        if (sortField === 'reproductions' || sortField === 'upvotes') return getRecipeReproductionCount(item);
        if (sortField === 'views') return getRecipeViewCount(item.id);
        return item[sortField];
    };

    const sortedData = !sortField ? rankedData : [...rankedData].sort((a, b) => {
        if (Boolean(a.item.missesSlo) !== Boolean(b.item.missesSlo)) {
            return a.item.missesSlo ? 1 : -1;
        }
        const valA = sortValue(a);
        const valB = sortValue(b);

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleExportCsv = () => {
        const metadata = [
            '# llm-d Prism Serving Performance Leaderboard',
            `# Export Timestamp: ${new Date().toISOString()}`,
            `# Total Evaluated Configurations: ${sortedData.length}`,
            '# Platform: llm-d-prism (https://github.com/llm-d/llm-d)',
            '#'
        ];
        const headers = [
            'Rank',
            'Model Family',
            'Recipe Name',
            'Contributor',
            'Team',
            'Hardware Summary',
            'Engine',
            'Workload Class',
            'Operating Concurrency',
            'Throughput (tok/s)',
            'Throughput per Chip (tok/s)',
            'TTFT P50 (ms)',
            'TPOT P50 (ms)',
            'Cost per 1M ($)',
            'Tokens per Dollar ($)',
            'Hourly Rate ($/hr)',
            'Reproductions',
            'Container Image',
            'Run Date',
            'Verification Status',
            'Git SHA'
        ];
        const rows = sortedData.map(({ item, rank }) => [
            rank ?? 'Misses SLO',
            `"${(item.model_family || '').replace(/"/g, '""')}"`,
            `"${(item.recipe_name || '').replace(/"/g, '""')}"`,
            `"${(item.author?.github_id || item.author?.display_name || item.author?.username || '').replace(/"/g, '""')}"`,
            `"${(item.author?.team || '').replace(/"/g, '""')}"`,
            `"${(item.hardware_summary || '').replace(/"/g, '""')}"`,
            engineLabel(item.stack?.engine),
            item.workload_class || '',
            item.operatingConcurrency ?? item.workload?.concurrency ?? 32,
            Math.round(item.tokens_per_sec || 0),
            Number(item.tokens_per_sec_per_chip || 0).toFixed(1),
            item.ttft_p50 || 0,
            item.itl_p50 || 0,
            item.cost_analysis?.cost_per_1m_output_tokens_usd || 0,
            Math.round(item.cost_analysis?.tokens_per_dollar || 0),
            item.cost_analysis?.hourly_rate_usd || 0,
            getRecipeReproductionCount(item),
            `"${(item.container_image || 'Not reported').replace(/"/g, '""')}"`,
            `"${(formatRunDate(item.created_at) || 'Not reported').replace(/"/g, '""')}"`,
            item.verification_status || '',
            item.git_commit_sha || ''
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent([...metadata, headers.join(','), ...rows.map(e => e.join(','))].join('\n'));
        const link = document.createElement('a');
        link.setAttribute('href', csvContent);
        link.setAttribute('download', `prism_leaderboard_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getRankBadge = (rank, missesSlo) => {
        if (missesSlo || rank === null) {
            return (
                <span
                    className="inline-flex items-center rounded-full bg-rose-50 px-1.5 py-0.5 font-mono text-tiny font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20"
                    title="Does not meet the active latency SLO at any measured concurrency point"
                >
                    SLO
                </span>
            );
        }
        if (rank === 1) {
            return (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-2 py-0.5 font-mono text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20" title="Rank #1">
                    <Crown className="w-3 h-3 text-amber-600 fill-amber-500 shrink-0" />
                    <span>#1</span>
                </span>
            );
        }
        if (rank === 2 || rank === 3) {
            return (
                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 font-mono text-xs font-semibold text-zinc-700 ring-1 ring-inset ring-zinc-300/60" title={`Rank #${rank}`}>
                    <span>#{rank}</span>
                </span>
            );
        }
        return (
            <span className="font-mono text-xs text-zinc-600 font-semibold">
                #{rank}
            </span>
        );
    };

    const showGroupHeaders = effectiveGrouped && !sortField;
    const qualifyingCount = sortedData.filter((d) => !d.item.missesSlo).length;
    const missesCount = sortedData.length - qualifyingCount;

    return (
        <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden mb-12">
            {/* Table Header with Summary & Actions */}
            <div className="px-5 sm:px-6 py-3.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/75">
                <div>
                    <h3 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight flex flex-wrap items-center gap-2">
                        <span>Serving performance rankings</span>
                        <span className="inline-flex items-center rounded-full bg-zinc-200/70 px-2.5 py-0.5 text-micro font-mono font-medium text-zinc-700">
                            {missesCount > 0
                                ? `${qualifyingCount} ranked · ${missesCount} miss SLO`
                                : `${sortedData.length} ${sortedData.length === 1 ? 'run' : 'runs'}`}
                        </span>
                    </h3>
                </div>

                <div className="flex items-center gap-2">
                    {selectedForCompare.length >= 2 && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onOpenCompareModal}
                            className="flex items-center gap-1.5 cursor-pointer"
                        >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            <span>Compare {selectedForCompare.length} selected →</span>
                        </Button>
                    )}

                    {baseline && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-accent-50 border border-accent-200 rounded-full text-xs">
                            <Star className="w-3.5 h-3.5 text-accent-600 fill-accent-500" />
                            <span className="text-zinc-700">
                                Baseline: <strong className="text-zinc-900 font-semibold">{baseline.recipe_name}</strong>
                            </span>
                            <button
                                type="button"
                                onClick={() => onSetBaseline && onSetBaseline(null)}
                                className="text-micro text-zinc-600 hover:text-zinc-900 underline ml-1 cursor-pointer"
                            >
                                Clear
                            </button>
                        </div>
                    )}

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleExportCsv}
                        className="flex items-center gap-1.5 cursor-pointer"
                        title="Export table as CSV"
                    >
                        <FileText className="w-3.5 h-3.5 text-zinc-600" />
                        <span>Export CSV</span>
                    </Button>
                </div>
            </div>

            {/* Table Body — compact 11-column layout fitting 1280px without horizontal scroll */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-zinc-700 border-collapse">
                    <thead className="label-caps text-zinc-700 font-semibold bg-zinc-100/80 border-b border-zinc-200 select-none">
                        <tr>
                            <th scope="col" className="px-1.5 py-2.5 w-7 text-center" title="Select up to 3 setups to compare side-by-side">
                                <span className="sr-only">Compare</span>
                            </th>
                            <th scope="col" className="px-1 py-2.5 w-9 text-center cursor-pointer hover:text-zinc-900 transition-colors" onClick={() => handleSort('rank')}>
                                <div className="flex items-center justify-center gap-0.5">
                                    <span>#</span> {sortArrow('rank')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 cursor-pointer hover:text-zinc-900 transition-colors" onClick={() => handleSort('model_family')}>
                                <div className="flex items-center gap-1">
                                    <span>Model &amp; recipe</span> {sortArrow('model_family')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 cursor-pointer hover:text-zinc-900 transition-colors" onClick={() => handleSort('contributor')}>
                                <div className="flex items-center gap-1">
                                    <span>Contributor</span> {sortArrow('contributor')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 cursor-pointer hover:text-zinc-900 transition-colors" onClick={() => handleSort('hardware_summary')}>
                                <div className="flex items-center gap-1">
                                    <span>Hardware</span> {sortArrow('hardware_summary')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 whitespace-nowrap">Stack components</th>
                            <th
                                scope="col"
                                className="px-1.5 py-2.5 text-right cursor-pointer hover:text-zinc-900 transition-colors whitespace-nowrap"
                                onClick={() => handleSort('tokens_per_sec_per_chip')}
                                title="Output tokens per second per chip at the active SLO operating point."
                            >
                                <div className="flex items-center justify-end gap-1 text-zinc-900">
                                    <span>Tok/s/chip</span> {sortArrow('tokens_per_sec_per_chip')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 text-right cursor-pointer hover:text-zinc-900 transition-colors whitespace-nowrap" onClick={() => handleSort('ttft_p50')}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>TTFT</span> {sortArrow('ttft_p50')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 text-right cursor-pointer hover:text-zinc-900 transition-colors whitespace-nowrap" onClick={() => handleSort('itl_p50')}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>TPOT</span> {sortArrow('itl_p50')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 text-right cursor-pointer hover:text-zinc-900 transition-colors whitespace-nowrap" onClick={() => handleSort('cost_per_1m')}>
                                <div className="flex items-center justify-end gap-1">
                                    <span>$/1M</span> {sortArrow('cost_per_1m')}
                                </div>
                            </th>
                            <th scope="col" className="px-1.5 py-2.5 text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1">
                                    <span>Status</span>
                                </div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200/80">
                        {sortedData.length === 0 && (
                            <tr>
                                <td colSpan={11} className="py-12 text-center">
                                    <EmptyState
                                        icon={<FilterX className="w-9 h-9 text-zinc-400 mx-auto" />}
                                        title="No matching benchmark configurations"
                                        message="No hardware or model setups match your active combination of filters. Try clearing your search query or adjusting your filters."
                                        action={
                                            onResetFilters && (
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={onResetFilters}
                                                    className="flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                    <span>Reset all filters</span>
                                                </Button>
                                            )
                                        }
                                    />
                                </td>
                            </tr>
                        )}
                        {sortedData.map(({ item, rank }, idx) => {
                            const isSelected = selectedRecipe && selectedRecipe.id === item.id;
                            const isCompared = selectedForCompare.includes(item.id);
                            const isBaseline = baseline && baseline.id === item.id;
                            const chips = Math.max(1, item.hardware?.accelerator_count || 1);
                            const tpsPerChip = item.tokens_per_sec_per_chip ?? (item.tokens_per_sec || 0) / chips;
                            const concurrency = item.operatingConcurrency ?? item.workload?.concurrency ?? 32;

                            const groupKey = item.groupKey || `${item.model_family || 'Model'}|||${item.workload_class || 'chat'}`;
                            const prevItem = idx > 0 ? sortedData[idx - 1].item : null;
                            const prevGroupKey = prevItem
                                ? (prevItem.groupKey || `${prevItem.model_family || 'Model'}|||${prevItem.workload_class || 'chat'}`)
                                : null;
                            const isFirstMissSlo = Boolean(item.missesSlo && (!prevItem || !prevItem.missesSlo));
                            const isNewGroup = showGroupHeaders && !item.missesSlo && groupKey !== prevGroupKey;

                            const wlMeta = workloadFor(item.workload_class);
                            const workloadLabel = wlMeta ? wlMeta.label : (item.workload_class || 'Chat');
                            const groupLabel = item.groupLabel || `${item.model_family || item.model_name} · ${workloadLabel}`;
                            const groupSize = item.groupSize || 1;

                            const runDate = formatRunDate(item.created_at);
                            const stale = isStaleRun(item);
                            const githubHandle = item.author?.github_id || item.author?.username;
                            const authorDisplay = githubHandle ? `@${githubHandle}` : (item.author?.display_name || item.author?.name || 'Community');
                            const authorTeam = item.author?.team || '';

                            const shortHw = formatShortHardware(item);
                            const stackName = engineLabel(item.stack?.engine);
                            const isLlmdStack = String(item.stack?.engine || '').toLowerCase() === 'llm-d';
                            const quantLabel = item.stack?.quantization ? String(item.stack.quantization).toUpperCase() : null;

                            const ttftP50 = latencyFor(item, 'ttft', 'p50');
                            const ttftP90 = latencyFor(item, 'ttft', 'p90');
                            const tpotP50 = latencyFor(item, 'itl', 'p50');
                            const tpotP90 = latencyFor(item, 'itl', 'p90');

                            const costVal = item.cost_analysis?.cost_per_1m_output_tokens_usd ?? item.cost_per_1m ?? 0;
                            const isGroupMinCost = !item.missesSlo && costStats.groupMin.has(groupKey) && costVal <= costStats.groupMin.get(groupKey);
                            const isLowestQuartileCost = !item.missesSlo && costVal > 0 && (costVal <= costStats.q25 || isGroupMinCost);
                            const isHighestQuartileCost = costVal > costStats.q25 && costVal >= costStats.q75;

                            const rowStatus = item.missesSlo
                                ? 'misses_slo'
                                : item.well_lit_path
                                    ? 'well_lit_path'
                                    : item.verification_status || 'verified';

                            return (
                                <React.Fragment key={item.id}>
                                    {isFirstMissSlo && (
                                        <tr className="bg-rose-50/60 border-y border-rose-200/80">
                                            <td colSpan={11} className="px-3.5 py-1.5">
                                                <div className="flex items-center justify-between gap-2 text-xs text-rose-900">
                                                    <span className="font-semibold">
                                                        Exceeds active latency SLO across all concurrency levels
                                                    </span>
                                                    <span className="text-micro font-mono text-rose-700">
                                                        Showing lowest-latency operating point (8c) for reference
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {isNewGroup && (
                                        <tr className="bg-zinc-50 border-y border-zinc-200">
                                            <td colSpan={11} className="px-3.5 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-semibold text-zinc-800 tracking-tight">
                                                        {groupLabel}
                                                    </span>
                                                    <span className="text-micro font-mono text-zinc-600 bg-white border border-zinc-200 px-2 py-0.5 rounded-full">
                                                        {groupSize} {groupSize === 1 ? 'run' : 'runs'} · ranked within group
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    <tr
                                        id={`recipe-row-${item.id}`}
                                        onClick={() => {
                                            if (onSelectRecipe) onSelectRecipe(item);
                                        }}
                                        className={cn(
                                            'hover:bg-zinc-50/90 transition-colors cursor-pointer group',
                                            item.missesSlo && 'opacity-70 bg-zinc-50/40',
                                            rank === 1 && !item.missesSlo && !isSelected && !isBaseline && 'bg-accent-50/35 hover:bg-accent-50/60',
                                            isSelected && 'bg-accent-50/65',
                                            isBaseline && 'bg-accent-50/50'
                                        )}
                                    >
                                        {/* 1. Compare Checkbox */}
                                        <td className="py-2 px-1.5 w-7 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isCompared}
                                                disabled={!isCompared && selectedForCompare.length >= 3}
                                                onChange={() => onToggleCompare && onToggleCompare(item.id)}
                                                className="w-4 h-4 rounded border-zinc-300 bg-white text-accent-600 focus:ring-accent-500/20 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer accent-accent-600"
                                                aria-label={`Compare ${item.model_family || item.model_name} on ${shortHw}`}
                                                title={!isCompared && selectedForCompare.length >= 3 ? 'Max 3 setups can be compared.' : 'Select to compare side-by-side (up to 3)'}
                                            />
                                        </td>

                                        {/* 2. Rank */}
                                        <td className="py-2 px-1 w-9 text-center whitespace-nowrap">
                                            <div className="flex items-center justify-center">
                                                {getRankBadge(rank, item.missesSlo)}
                                            </div>
                                        </td>

                                        {/* 3. Model & recipe (concise optimization recipe without duplicate stack/hardware) */}
                                        <td className="py-2 px-1.5 max-w-[240px]">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (onSelectRecipe) onSelectRecipe(item);
                                                    }}
                                                    className="font-semibold text-zinc-900 group-hover:text-accent-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 rounded text-left transition-colors shrink-0 text-sm cursor-pointer"
                                                    title={`Inspect ${item.model_family || item.model_name} (${item.recipe_name}${runDate ? ` · ${runDate}` : ''})`}
                                                >
                                                    {item.model_family || item.model_name}
                                                </button>
                                                <span className="text-zinc-400 shrink-0">·</span>
                                                <span
                                                    className="text-xs text-zinc-700 font-mono truncate"
                                                    title={`${item.recipe_name} · ${workloadLabel}${runDate ? ` · ${runDate}` : ''}`}
                                                >
                                                    {item.recipe_name}
                                                </span>
                                                {stale && (
                                                    <span
                                                        className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0.5 text-tiny font-medium text-amber-800 border border-amber-200 shrink-0"
                                                        title="Stale run: recorded over 180 days ago or evaluated on an archived serving engine version"
                                                    >
                                                        Stale
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 4. Contributor */}
                                        <td className="py-2 px-1.5 max-w-[118px] whitespace-nowrap">
                                            <span
                                                className="font-mono text-xs font-medium text-zinc-700 truncate block"
                                                title={authorTeam ? `${authorDisplay} (${authorTeam})` : authorDisplay}
                                            >
                                                {authorDisplay}
                                            </span>
                                        </td>

                                        {/* 5. Hardware (only accelerator type & chip count per PM feedback) */}
                                        <td className="py-2 px-1.5 whitespace-nowrap">
                                            <span className="text-zinc-900 font-mono text-sm font-medium">
                                                {shortHw}
                                            </span>
                                        </td>

                                        {/* 6. Stack components */}
                                        <td className="py-2 px-1.5 whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1.5 font-mono text-xs">
                                                <span
                                                    className={cn(
                                                        'font-semibold',
                                                        isLlmdStack
                                                            ? 'px-1.5 py-0.5 rounded-md bg-accent-50 text-accent-700 border border-accent-200/80'
                                                            : 'text-zinc-900'
                                                    )}
                                                >
                                                    {stackName}
                                                </span>
                                                <span className="text-zinc-600 font-medium">TP{item.stack?.tensor_parallel_size || 1}</span>
                                                {quantLabel && (
                                                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-tiny text-zinc-600">
                                                        {quantLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 7. Tok/s/chip */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={`${Math.round(item.tokens_per_sec || 0).toLocaleString()} total tok/s @ ${concurrency}c`}
                                        >
                                            <span className="font-semibold text-zinc-900 text-sm">
                                                {Math.round(tpsPerChip).toLocaleString()}
                                            </span>
                                        </td>

                                        {/* 8. TTFT */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={ttftP90 != null ? `P90: ${ttftP90.toFixed(0)} ms` : undefined}
                                        >
                                            <span className="font-medium text-zinc-900 text-sm">
                                                {ttftP50 != null ? `${ttftP50.toFixed(1)} ms` : '—'}
                                            </span>
                                        </td>

                                        {/* 9. TPOT */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={tpotP90 != null ? `P90: ${tpotP90.toFixed(1)} ms` : undefined}
                                        >
                                            <span className="font-medium text-zinc-900 text-sm">
                                                {tpotP50 != null ? `${tpotP50.toFixed(1)} ms` : '—'}
                                            </span>
                                        </td>

                                        {/* 10. $/1M tokens */}
                                        <td className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                                            <span
                                                className={cn(
                                                    'text-sm',
                                                    isLowestQuartileCost
                                                        ? 'text-emerald-700 font-semibold'
                                                        : isHighestQuartileCost
                                                            ? 'text-zinc-700'
                                                            : 'text-zinc-900 font-medium'
                                                )}
                                            >
                                                ${costVal.toFixed(3)}
                                            </span>
                                        </td>

                                        {/* 11. Status + Compact Row Actions Menu */}
                                        <td className="py-2 px-1.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                            <div className="inline-flex items-center justify-end gap-1.5">
                                                <StatusChip
                                                    status={rowStatus}
                                                    size="xs"
                                                />

                                                <div className="relative">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenActionMenuId(openActionMenuId === item.id ? null : item.id);
                                                        }}
                                                        className="p-1 rounded-full text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 transition-colors cursor-pointer"
                                                        aria-label={`More actions for ${item.recipe_name}`}
                                                        title="Row actions"
                                                    >
                                                        <MoreHorizontal className="w-4 h-4" />
                                                    </button>

                                                    {openActionMenuId === item.id && (
                                                        <div
                                                            className="absolute right-0 mt-1 w-48 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg z-30 text-left text-xs font-sans"
                                                            onClick={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setOpenActionMenuId(null);
                                                                    if (onSelectRecipe) onSelectRecipe(item);
                                                                }}
                                                                className="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2 cursor-pointer"
                                                            >
                                                                <Eye className="w-3.5 h-3.5 text-zinc-600" />
                                                                <span>Inspect recipe</span>
                                                            </button>
                                                            {onSetBaseline && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setOpenActionMenuId(null);
                                                                        onSetBaseline(isBaseline ? null : item.id);
                                                                    }}
                                                                    className="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2 cursor-pointer"
                                                                >
                                                                    <Star className="w-3.5 h-3.5 text-zinc-600" />
                                                                    <span>{isBaseline ? 'Clear baseline' : 'Set as baseline'}</span>
                                                                </button>
                                                            )}
                                                            {item.well_lit_path && (
                                                                <a
                                                                    href={`?view=${item.well_lit_path}`}
                                                                    onClick={(e) => {
                                                                        setOpenActionMenuId(null);
                                                                        if (onNavigate && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
                                                                            e.preventDefault();
                                                                            onNavigate(item.well_lit_path);
                                                                        }
                                                                    }}
                                                                    className="w-full px-3 py-1.5 text-left text-accent-700 hover:bg-accent-50 flex items-center gap-2 cursor-pointer font-medium"
                                                                >
                                                                    <ExternalLink className="w-3.5 h-3.5 text-accent-600" />
                                                                    <span>Deploy with llm-d</span>
                                                                </a>
                                                            )}
                                                            {onOpenFeedback && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setOpenActionMenuId(null);
                                                                        onOpenFeedback('challenge_result', item);
                                                                    }}
                                                                    className="w-full px-3 py-1.5 text-left text-amber-800 hover:bg-amber-50 flex items-center gap-2 cursor-pointer"
                                                                >
                                                                    <Flag className="w-3.5 h-3.5 text-amber-700" />
                                                                    <span>Flag / challenge this run</span>
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Floating Comparison Pill Bar */}
            {selectedForCompare.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900 text-white rounded-full px-5 py-2.5 shadow-xl flex items-center gap-4 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center gap-2 text-xs font-medium text-zinc-200">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-accent-600" />
                        <span>
                            <strong className="text-white font-mono">{selectedForCompare.length}/3</strong> selected
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onClearCompare ? onClearCompare() : onToggleCompare && selectedForCompare.forEach(id => onToggleCompare(id))}
                            className="text-micro text-zinc-400 hover:text-white underline px-1 cursor-pointer"
                        >
                            Clear
                        </button>
                        <button
                            type="button"
                            onClick={onOpenCompareModal}
                            disabled={selectedForCompare.length < 2}
                            className="px-3.5 py-1 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-xs transition-colors cursor-pointer"
                        >
                            Compare side-by-side {selectedForCompare.length < 2 ? '(Select 1 more)' : '→'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
