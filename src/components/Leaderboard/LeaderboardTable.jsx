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
    ExternalLink,
    AlertTriangle
} from 'lucide-react';
import { Button, EmptyState, StatusChip } from '../ui';
import { cn } from '../../utils/cn';
import {
    DEFAULT_OBJECTIVE,
    DEFAULT_SLO,
    describeSlo,
    engineLabel,
    formatHardwareShort,
    latencyFor,
    provenanceStatus,
    workloadFor,
} from '../../utils/leaderboardFacets.js';
import {
    formatRunDate,
    isStaleRun,
    annotateModelWorkloadGroupRanks
} from '../../utils/runParity.js';

// Columns where a smaller value ranks higher; their first click sorts ascending.
const LOWER_IS_BETTER = new Set(['rank', 'ttft_p50', 'itl_p50', 'cost_per_1m']);
const OBJECTIVE_SORT_FIELDS = new Set(['tokens_per_sec_per_chip', 'ttft_p50', 'itl_p50', 'cost_per_1m']);

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const groupKeyOf = (item) => item?.groupKey || `${item?.model_family || 'Model'}|||${item?.workload_class || 'chat'}`;
const costOf = (item) => {
    const c = item?.cost_analysis?.cost_per_1m_output_tokens_usd ?? item?.cost_per_1m;
    return isNum(c) && c > 0 ? c : null;
};

// "+12%" against the pinned baseline; green when it's better for that metric.
function DeltaLine({ value, base, lowerIsBetter = false }) {
    if (!isNum(value) || !isNum(base) || base === 0) return null;
    const pct = ((value - base) / base) * 100;
    if (Math.abs(pct) < 0.05) {
        return <span className="block text-tiny font-mono text-zinc-500">same</span>;
    }
    const better = lowerIsBetter ? pct < 0 : pct > 0;
    return (
        <span className={cn('block text-tiny font-mono font-semibold', better ? 'text-emerald-700' : 'text-rose-600')}>
            {pct > 0 ? '+' : '−'}{Math.abs(pct).toFixed(Math.abs(pct) < 10 ? 1 : 0)}%
        </span>
    );
}

export default function LeaderboardTable({
    dataset = [],
    rankingMetric = DEFAULT_OBJECTIVE,
    onChangeRankingMetric,
    isGroupedByModel,
    selectedModelFamily,
    selectedWorkload,
    latencyPercentile = DEFAULT_SLO.percentile,
    slo = DEFAULT_SLO,
    onSelectRecipe,
    selectedRecipe,
    selectedForCompare = [],
    onToggleCompare,
    onOpenCompareModal,
    baselineRecipeId,
    onSetBaseline,
    onCompareWithBaseline,
    onResetFilters,
    onClearCompare,
    onOpenFeedback,
    onNavigate
}) {
    const [sortField, setSortField] = useState(null);
    const [sortDirection, setSortDirection] = useState('desc');
    const [openActionMenuId, setOpenActionMenuId] = useState(null);
    const pct = latencyPercentile;
    const pctLabel = String(pct).toUpperCase();

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

    // The pinned baseline, reduced to the numbers rows compare against.
    const baseline = useMemo(() => {
        const b = (dataset || []).find((r) => r.id === baselineRecipeId);
        if (!b) return null;
        return {
            id: b.id,
            recipeName: b.recipe_name,
            group: b.groupKey || `${b.model_family || 'Model'}|||${b.workload_class || 'chat'}`,
            perChip: b.tokens_per_sec_per_chip,
            ttft: latencyFor(b, 'ttft', pct),
            tpot: latencyFor(b, 'itl', pct),
            cost: costOf(b),
        };
    }, [dataset, baselineRecipeId, pct]);

    // How many setups Compare will open (the baseline joins if there's room),
    // and whether they span more than one model or workload.
    const compareSummary = useMemo(() => {
        const ids = new Set(selectedForCompare);
        const baselineAdds = Boolean(baseline && !ids.has(baseline.id));
        const groups = new Set(
            (dataset || [])
                .filter((r) => ids.has(r.id) || (baselineAdds && r.id === baseline.id))
                .map((r) => r.groupKey || `${r.model_family || 'Model'}|||${r.workload_class || 'chat'}`)
        );
        return {
            baselineAdds,
            count: Math.min(3, selectedForCompare.length + (baselineAdds ? 1 : 0)),
            crossesGroups: groups.size > 1,
        };
    }, [dataset, selectedForCompare, baseline]);

    // Determine whether rows should be grouped by (model × workload)
    const effectiveGrouped = useMemo(() => {
        if (typeof isGroupedByModel === 'boolean') return isGroupedByModel;
        if (selectedModelFamily !== undefined || selectedWorkload !== undefined) {
            return selectedModelFamily === 'all' || selectedWorkload === 'all';
        }
        const distinctGroups = new Set(
            (dataset || []).map((r) => r.groupKey || `${r.model_family || 'Model'}|||${r.workload_class || 'chat'}`)
        );
        return distinctGroups.size > 1;
    }, [isGroupedByModel, selectedModelFamily, selectedWorkload, dataset]);

    // Annotate dataset with per-(model × workload) group ranks if not already annotated
    const annotatedDataset = useMemo(() => {
        const items = dataset || [];
        if (items.length === 0) return [];
        const qualifying = items.filter((r) => !r.missesSlo);
        const overLimit = items.filter((r) => r.missesSlo && r.sloReason !== 'not-recorded');
        const notRecorded = items.filter((r) => r.missesSlo && r.sloReason === 'not-recorded');

        const hasGroupAnnotations = qualifying.every((r) => r.groupKey && typeof r.groupRank === 'number');
        const withAnnotations = hasGroupAnnotations ? qualifying : annotateModelWorkloadGroupRanks(qualifying);

        if (!effectiveGrouped) return [...withAnnotations, ...overLimit, ...notRecorded];

        // Keep runs of the same (model × workload) group contiguous in order of first appearance
        const groupedMap = new Map();
        withAnnotations.forEach((item) => {
            const key = groupKeyOf(item);
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
        return [...contiguous, ...overLimit, ...notRecorded];
    }, [dataset, effectiveGrouped]);

    // Cost quartiles and per-group minimum cost so only top cost performers are highlighted green
    const costStats = useMemo(() => {
        const costs = (annotatedDataset || [])
            .filter((r) => !r.missesSlo)
            .map(costOf)
            .filter((c) => c != null)
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
            const c = costOf(r);
            if (c == null) return;
            const gKey = groupKeyOf(r);
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

    const indicatorField = sortField ?? rankingMetric;
    const indicatorDirection = sortField ? sortDirection : (LOWER_IS_BETTER.has(rankingMetric) ? 'asc' : 'desc');
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

    // Latency columns sort at the active percentile, the one they display.
    const sortValue = ({ item, rank }) => {
        if (sortField === 'rank') return rank ?? Infinity;
        if (sortField === 'contributor') return (item.author?.github_id || item.author?.username || '').toLowerCase();
        if (sortField === 'model_family') return String(item.model_family || '').toLowerCase();
        if (sortField === 'hardware_summary') return formatHardwareShort(item).toLowerCase();
        if (sortField === 'cost_per_1m') return costOf(item);
        if (sortField === 'ttft_p50') return latencyFor(item, 'ttft', pct);
        if (sortField === 'itl_p50') return latencyFor(item, 'itl', pct);
        return item[sortField];
    };

    const sortedData = !sortField ? rankedData : [...rankedData].sort((a, b) => {
        if (Boolean(a.item.missesSlo) !== Boolean(b.item.missesSlo)) {
            return a.item.missesSlo ? 1 : -1;
        }
        const valA = sortValue(a);
        const valB = sortValue(b);
        // Missing values always sort last, whichever way the column points.
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;
        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const handleExportCsv = () => {
        const metadata = [
            '# llm-d Prism Serving Performance Leaderboard',
            `# Export Timestamp: ${new Date().toISOString()}`,
            `# Operating point: each run's highest-throughput point within ${describeSlo(slo)}`,
            `# Total Evaluated Configurations: ${sortedData.length}`,
            '# Platform: llm-d-prism (https://github.com/llm-d/llm-d)',
            '#'
        ];
        const headers = [
            'Rank',
            'Source',
            'Model Family',
            'Recipe Name',
            'Contributor',
            'Hardware',
            'Stack',
            'Workload Class',
            'Operating Concurrency',
            'Total Throughput (tok/s)',
            'Throughput per Chip (tok/s)',
            'Throughput Estimated',
            `TTFT ${pctLabel} (ms)`,
            `TPOT ${pctLabel} (ms)`,
            'Cost per 1M tokens ($)',
            'Tokens per Dollar',
            'Container Image',
            'Run Date',
            'Git SHA'
        ];
        const rows = sortedData.map(({ item, rank }) => [
            rank ?? (item.sloReason === 'not-recorded' ? 'SLO not checkable' : 'Misses SLO'),
            provenanceStatus(item),
            csvCell(item.model_family),
            csvCell(item.recipe_name),
            csvCell(item.author?.github_id || item.author?.display_name || item.author?.username || ''),
            csvCell(formatHardwareShort(item)),
            csvCell(item.stack?.engine ? engineLabel(item.stack.engine) : ''),
            item.workload_class || '',
            item.operatingConcurrency ?? '',
            isNum(item.tokens_per_sec) ? Math.round(item.tokens_per_sec) : '',
            isNum(item.tokens_per_sec_per_chip) ? item.tokens_per_sec_per_chip.toFixed(1) : '',
            item.operatingPoint?.total_estimated ? 'yes' : 'no',
            latencyFor(item, 'ttft', pct) ?? '',
            latencyFor(item, 'itl', pct) ?? '',
            costOf(item) ?? '',
            isNum(item.cost_analysis?.tokens_per_dollar) ? Math.round(item.cost_analysis.tokens_per_dollar) : '',
            csvCell(item.container_image || 'Not reported'),
            csvCell(formatRunDate(item.created_at) || 'Not reported'),
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

    const getRankBadge = (rank, item) => {
        if (item.missesSlo || rank === null) {
            const notRecorded = item.sloReason === 'not-recorded';
            return (
                <span
                    className={cn(
                        'inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-tiny font-medium ring-1 ring-inset',
                        notRecorded ? 'bg-zinc-100 text-zinc-600 ring-zinc-300/60' : 'bg-rose-50 text-rose-700 ring-rose-600/20'
                    )}
                    title={notRecorded
                        ? `This run didn't record ${pctLabel} latency, so it can't be checked against the SLO`
                        : 'Doesn’t meet the active latency SLO at any measured load'}
                >
                    {notRecorded ? 'n/a' : 'SLO'}
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

    const { baselineAdds, count: effectiveCompareCount, crossesGroups } = compareSummary;

    return (
        <div className="surface-light rounded-3xl border border-zinc-200 bg-white overflow-hidden mb-12">
            {/* Table Header with Summary & Actions */}
            <div className="px-5 sm:px-6 py-3.5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/75">
                <div>
                    <h3 className="text-base sm:text-lg font-semibold text-zinc-900 tracking-tight flex flex-wrap items-center gap-2">
                        <span>Serving performance rankings</span>
                        <span className="inline-flex items-center rounded-full bg-zinc-200/70 px-2.5 py-0.5 text-micro font-mono font-medium text-zinc-700">
                            {missesCount > 0
                                ? `${qualifyingCount} ranked · ${missesCount} below the line`
                                : `${sortedData.length} ${sortedData.length === 1 ? 'run' : 'runs'}`}
                        </span>
                    </h3>
                    <p className="text-micro text-zinc-600 mt-0.5">
                        Each run at its highest-throughput point within {describeSlo(slo)}.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {effectiveCompareCount >= 2 && (
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={onOpenCompareModal}
                            className="flex items-center gap-1.5 cursor-pointer"
                        >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                            <span>Compare {effectiveCompareCount} →</span>
                        </Button>
                    )}

                    {baseline && (
                        <div
                            className="flex items-center gap-2 px-3 py-1 bg-accent-50 border border-accent-200 rounded-full text-xs"
                            title="Rows of the same model and workload show their difference from this run"
                        >
                            <Star className="w-3.5 h-3.5 text-accent-600 fill-accent-500" />
                            <span className="text-zinc-700">
                                Baseline: <strong className="text-zinc-900 font-semibold">{baseline.recipeName}</strong>
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
                            <th scope="col" className="px-1.5 py-2.5 w-7 text-center" title="Select up to 3 setups to compare side by side">
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
                                title="Total (input + output) tokens per second, per chip, at each run's operating point. The line below shows total throughput and the concurrency it was measured at."
                            >
                                <div className="flex items-center justify-end gap-1 text-zinc-900">
                                    <span>Tok/s/chip</span> {sortArrow('tokens_per_sec_per_chip')}
                                </div>
                            </th>
                            <th
                                scope="col"
                                className="px-1.5 py-2.5 text-right cursor-pointer hover:text-zinc-900 transition-colors whitespace-nowrap"
                                onClick={() => handleSort('ttft_p50')}
                                title={`Time to first token at ${pctLabel}, the percentile the SLO uses`}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    <span>TTFT {pctLabel}</span> {sortArrow('ttft_p50')}
                                </div>
                            </th>
                            <th
                                scope="col"
                                className="px-1.5 py-2.5 text-right cursor-pointer hover:text-zinc-900 transition-colors whitespace-nowrap"
                                onClick={() => handleSort('itl_p50')}
                                title={`Time per output token at ${pctLabel}, the percentile the SLO uses`}
                            >
                                <div className="flex items-center justify-end gap-1">
                                    <span>TPOT {pctLabel}</span> {sortArrow('itl_p50')}
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
                            const showDeltas = Boolean(baseline && !isBaseline && !item.missesSlo && groupKeyOf(item) === baseline.group);
                            const tpsPerChip = item.tokens_per_sec_per_chip;
                            const concurrency = item.operatingConcurrency;
                            const estimated = Boolean(item.operatingPoint?.total_estimated);

                            const groupKey = groupKeyOf(item);
                            const prevItem = idx > 0 ? sortedData[idx - 1].item : null;
                            const prevGroupKey = prevItem ? groupKeyOf(prevItem) : null;
                            const isNotRecorded = item.missesSlo && item.sloReason === 'not-recorded';
                            const prevNotRecorded = Boolean(prevItem?.missesSlo && prevItem?.sloReason === 'not-recorded');
                            const isFirstOverLimit = Boolean(item.missesSlo && !isNotRecorded && (!prevItem || !prevItem.missesSlo));
                            const isFirstNotRecorded = Boolean(isNotRecorded && !prevNotRecorded);
                            const isNewGroup = showGroupHeaders && !item.missesSlo && groupKey !== prevGroupKey;

                            const wlMeta = workloadFor(item.workload_class);
                            const workloadLabel = wlMeta ? wlMeta.label : (item.workload_class || 'Chat');
                            const groupLabel = item.groupLabel || `${item.model_family || item.model_name} · ${workloadLabel}`;
                            const groupSize = item.groupSize || 1;

                            const runDate = formatRunDate(item.created_at);
                            const stale = isStaleRun(item);
                            const githubHandle = item.author?.github_id || item.author?.username;
                            const authorDisplay = githubHandle ? `@${githubHandle}` : (item.author?.display_name || 'Not recorded');
                            const authorTeam = item.author?.team || '';

                            const shortHw = formatHardwareShort(item);
                            const hasStack = Boolean(item.stack?.engine);
                            const stackName = engineLabel(item.stack?.engine);
                            const isLlmdStack = String(item.stack?.engine || '').toLowerCase() === 'llm-d';
                            const quantLabel = item.stack?.quantization ? String(item.stack.quantization).toUpperCase() : null;
                            const tpLabel = item.stack?.tensor_parallel_size ? `TP${item.stack.tensor_parallel_size}` : null;

                            const ttft = latencyFor(item, 'ttft', pct);
                            const tpot = latencyFor(item, 'itl', pct);
                            const otherPcts = (kind) => ['p50', 'p90', 'p99']
                                .filter((p) => p !== pct)
                                .map((p) => [p, latencyFor(item, kind, p)])
                                .filter(([, v]) => v != null)
                                .map(([p, v]) => `${p.toUpperCase()}: ${v.toFixed(1)} ms`)
                                .join(' · ');

                            const costVal = costOf(item);
                            const isGroupMinCost = !item.missesSlo && costVal != null && costStats.groupMin.has(groupKey) && costVal <= costStats.groupMin.get(groupKey);
                            const isLowestQuartileCost = !item.missesSlo && costVal != null && (costVal <= costStats.q25 || isGroupMinCost);
                            const isHighestQuartileCost = costVal != null && costVal > costStats.q25 && costVal >= costStats.q75;

                            const rowStatus = provenanceStatus(item);

                            return (
                                <React.Fragment key={item.id}>
                                    {isFirstOverLimit && (
                                        <tr className="bg-rose-50/60 border-y border-rose-200/80">
                                            <td colSpan={11} className="px-3.5 py-1.5">
                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-rose-900">
                                                    <span className="font-semibold">
                                                        Doesn&apos;t meet {describeSlo(slo)} at any measured load
                                                    </span>
                                                    <span className="text-micro font-mono text-rose-700">
                                                        Each row shows the point that comes closest
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                    {isFirstNotRecorded && (
                                        <tr className="bg-zinc-100/80 border-y border-zinc-200">
                                            <td colSpan={11} className="px-3.5 py-1.5">
                                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-800">
                                                    <span className="font-semibold">
                                                        Can&apos;t be checked against this SLO: these runs didn&apos;t record {pctLabel} latency
                                                    </span>
                                                    <span className="text-micro font-mono text-zinc-600">
                                                        Try another percentile · rows show their peak for reference
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
                                                title={!isCompared && selectedForCompare.length >= 3
                                                    ? 'You can compare up to 3 setups. Clear one to add another.'
                                                    : 'Select to compare side by side (up to 3)'}
                                            />
                                        </td>

                                        {/* 2. Rank */}
                                        <td className="py-2 px-1 w-9 text-center whitespace-nowrap">
                                            <div className="flex flex-col items-center justify-center gap-0.5">
                                                {getRankBadge(rank, item)}
                                                {isBaseline && (
                                                    <span className="text-tiny font-mono font-semibold text-accent-700">Base</span>
                                                )}
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
                                                className={cn('font-mono text-xs font-medium truncate block', githubHandle ? 'text-zinc-700' : 'text-zinc-500')}
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
                                                {hasStack ? (
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
                                                ) : (
                                                    <span className="text-zinc-500" title="The run didn't record its serving stack">Not recorded</span>
                                                )}
                                                {tpLabel && <span className="text-zinc-600 font-medium">{tpLabel}</span>}
                                                {quantLabel && (
                                                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-tiny text-zinc-600">
                                                        {quantLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* 7. Tok/s/chip with total throughput and the concurrency it was measured at */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={estimated
                                                ? 'Total throughput estimated from the measured output rate and the result’s prompt and output lengths'
                                                : undefined}
                                        >
                                            <span className="font-semibold text-zinc-900 text-sm">
                                                {estimated && <span className="text-zinc-500 font-normal">≈</span>}
                                                {isNum(tpsPerChip) ? Math.round(tpsPerChip).toLocaleString() : '—'}
                                            </span>
                                            <span className="block text-tiny text-zinc-600">
                                                {isNum(item.tokens_per_sec) ? `${estimated ? '≈' : ''}${Math.round(item.tokens_per_sec).toLocaleString()} total` : ''}
                                                {concurrency != null ? ` · ${concurrency}c` : ''}
                                            </span>
                                            {showDeltas && <DeltaLine value={tpsPerChip} base={baseline.perChip} />}
                                            {isBaseline && <span className="block text-tiny font-mono text-accent-700">baseline</span>}
                                        </td>

                                        {/* 8. TTFT at the active percentile */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={otherPcts('ttft') || undefined}
                                        >
                                            <span className={cn('font-medium text-sm', ttft != null ? 'text-zinc-900' : 'text-zinc-500')}>
                                                {ttft != null ? `${ttft.toFixed(1)} ms` : '—'}
                                            </span>
                                            {showDeltas && <DeltaLine value={ttft} base={baseline.ttft} lowerIsBetter />}
                                        </td>

                                        {/* 9. TPOT at the active percentile */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={otherPcts('itl') || undefined}
                                        >
                                            <span className={cn('font-medium text-sm', tpot != null ? 'text-zinc-900' : 'text-zinc-500')}>
                                                {tpot != null ? `${tpot.toFixed(1)} ms` : '—'}
                                            </span>
                                            {showDeltas && <DeltaLine value={tpot} base={baseline.tpot} lowerIsBetter />}
                                        </td>

                                        {/* 10. $/1M tokens */}
                                        <td
                                            className="py-2 px-1.5 text-right font-mono tabular-nums whitespace-nowrap"
                                            title={costVal == null ? 'No list price for this accelerator. Set your own rate under Pricing.' : undefined}
                                        >
                                            <span
                                                className={cn(
                                                    'text-sm',
                                                    costVal == null
                                                        ? 'text-zinc-500'
                                                        : isLowestQuartileCost
                                                            ? 'text-emerald-700 font-semibold'
                                                            : isHighestQuartileCost
                                                                ? 'text-zinc-700'
                                                                : 'text-zinc-900 font-medium'
                                                )}
                                            >
                                                {costVal != null ? `$${costVal.toFixed(3)}` : '—'}
                                            </span>
                                            {showDeltas && <DeltaLine value={costVal} base={baseline.cost} lowerIsBetter />}
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
                                                            className="absolute right-0 mt-1 w-52 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg z-30 text-left text-xs font-sans"
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
                                                            {baseline && !isBaseline && onCompareWithBaseline && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setOpenActionMenuId(null);
                                                                        onCompareWithBaseline(item.id);
                                                                    }}
                                                                    className="w-full px-3 py-1.5 text-left text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 flex items-center gap-2 cursor-pointer"
                                                                >
                                                                    <ArrowLeftRight className="w-3.5 h-3.5 text-zinc-600" />
                                                                    <span>Compare with baseline</span>
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
                        <ArrowLeftRight className="w-3.5 h-3.5 text-accent-400" />
                        <span>
                            <strong className="text-white font-mono">{selectedForCompare.length}/3</strong> selected
                            {baselineAdds && effectiveCompareCount > selectedForCompare.length && ' · plus baseline'}
                        </span>
                        {crossesGroups && (
                            <span
                                className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-micro text-amber-200"
                                title="These setups ran different models or workloads. Compare will list what differs, so throughput gaps aren't read as stack gains."
                            >
                                <AlertTriangle className="w-3 h-3" />
                                Different models or workloads
                            </span>
                        )}
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
                            disabled={effectiveCompareCount < 2}
                            className="px-3.5 py-1 rounded-full bg-accent-600 hover:bg-accent-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium text-xs transition-colors cursor-pointer"
                        >
                            Compare side by side {effectiveCompareCount < 2 ? '(select 1 more)' : '→'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
