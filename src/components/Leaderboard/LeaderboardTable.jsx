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

import React, { useState } from 'react';
import {
    Trophy,
    Crown,
    Award,
    Zap,
    Sparkles,
    ShieldCheck,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Copy,
    Check,
    ExternalLink,
    FileText,
    DollarSign,
    Terminal,
    Flame,
    Star,
    ArrowLeftRight,
    SlidersHorizontal,
    Layers,
    Shield,
    Globe,
    FilterX,
    RotateCcw
} from 'lucide-react';
import { TIER_CONFIG } from '../../utils/gamificationEngine.js';
import { Button } from '../ui/Button.jsx';

export default function LeaderboardTable({
    dataset,
    onSelectRecipe,
    onOpenCertificate,
    onOpenBounties,
    selectedRecipe,
    selectedForCompare = [],
    onToggleCompare,
    onOpenCompareModal,
    baselineRecipeId,
    onSetBaseline,
    onResetFilters,
    onClearCompare
}) {
    const [sortField, setSortField] = useState('tokens_per_sec');
    const [sortDirection, setSortDirection] = useState('desc');
    const [expandedRowId, setExpandedRowId] = useState(null);
    const [copiedId, setCopiedId] = useState(null);

    const baseline = dataset?.find(r => r.id === baselineRecipeId) || null;

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const handleCopyCommand = (e, id, command) => {
        e.stopPropagation();
        if (!command) return;
        navigator.clipboard.writeText(command);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const handleExportCsv = () => {
        const headers = [
            'Rank',
            'Recipe Name',
            'Model Name',
            'Author',
            'Hardware',
            'Engine',
            'Scope',
            'TP Size',
            'Quantization',
            'TTFT P50 (ms)',
            'TTFT P99 (ms)',
            'ITL P50 (ms)',
            'Throughput (tok/s)',
            'Cost per 1M ($)',
            'Tokens per Dollar',
            'Cluster Rate ($/hr)',
            'Git SHA'
        ];
        const rows = sortedData.map(item => [
            item.rank || 0,
            `"${(item.recipe_name || '').replace(/"/g, '""')}"`,
            `"${(item.model_name || '').replace(/"/g, '""')}"`,
            `"${(item.author?.username || '').replace(/"/g, '""')}"`,
            `"${(item.hardware_summary || '').replace(/"/g, '""')}"`,
            item.stack?.engine || '',
            item.benchmark_scope || 'system',
            item.stack?.tensor_parallel_size || 1,
            item.stack?.quantization || 'fp8',
            item.ttft_p50 || 0,
            item.metrics?.ttft_ms?.p99 || 0,
            item.itl_p50 || 0,
            Math.round(item.tokens_per_sec || 0),
            item.cost_analysis?.cost_per_1m_output_tokens_usd || 0,
            item.cost_analysis?.tokens_per_dollar || 0,
            item.cost_analysis?.hourly_rate_usd || 0,
            item.git_commit_sha || ''
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `prism_leaderboard_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const calculateDelta = (val, baseVal, isLowerBetter = false) => {
        if (!val || !baseVal || val === baseVal) return null;
        const diff = ((val - baseVal) / baseVal) * 100;
        const isPositive = diff > 0;
        const isGood = isLowerBetter ? !isPositive : isPositive;

        return {
            text: `${isPositive ? '+' : ''}${diff.toFixed(1)}%`,
            isGood
        };
    };

    // Sort items
    const sortedData = [...(dataset || [])].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (sortField === 'cost_per_1m') {
            valA = a.cost_analysis?.cost_per_1m_output_tokens_usd || 0;
            valB = b.cost_analysis?.cost_per_1m_output_tokens_usd || 0;
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const getRankIcon = (rank) => {
        if (rank === 1) return <Crown className="w-4 h-4 text-amber-400 fill-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.8)]" />;
        if (rank === 2) return <Award className="w-4 h-4 text-purple-300 drop-shadow-[0_0_6px_rgba(168,85,247,0.6)]" />;
        if (rank === 3) return <Award className="w-4 h-4 text-cyan-300 drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]" />;
        return <span className="font-mono text-xs text-slate-500 font-bold">#{rank}</span>;
    };

    return (
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl overflow-hidden backdrop-blur-md shadow-2xl relative mb-12">
            {/* Table Header with Baseline Info */}
            <div className="p-4 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                        Rankings & Recipe Showcase ({sortedData.length} entries)
                    </h3>
                </div>

                <div className="flex items-center gap-3">
                    {/* Export CSV Button */}
                    <button
                        onClick={handleExportCsv}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
                        title="Download complete benchmark dataset as CSV"
                    >
                        <FileText className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Export CSV</span>
                    </button>

                    {/* Active Baseline indicator */}
                    {baseline && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-cyan-950/40 border border-cyan-500/40 rounded-xl text-xs">
                            <Star className="w-3.5 h-3.5 text-cyan-400 fill-cyan-400" />
                            <span className="text-slate-300">
                                Baseline: <strong className="text-cyan-300">{baseline.recipe_name}</strong>
                            </span>
                            <button
                                onClick={() => onSetBaseline && onSetBaseline(null)}
                                className="text-[10px] text-slate-400 hover:text-white underline ml-1 cursor-pointer"
                            >
                                Clear
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Table Body */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider select-none">
                            <th className="py-3 px-3 w-10 text-center">Compare</th>
                            <th className="py-3 px-3 w-12 text-center cursor-pointer" onClick={() => handleSort('rank')}>
                                Rank
                            </th>
                            <th className="py-3 px-4 min-w-[240px] cursor-pointer hover:text-slate-200" onClick={() => handleSort('recipe_name')}>
                                Recipe & Model
                            </th>
                            <th className="py-3 px-4 min-w-[140px]">Author</th>
                            <th className="py-3 px-4 min-w-[160px]">Hardware & Topology</th>
                            <th className="py-3 px-4 min-w-[100px]">Stack</th>
                            <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('ttft_p50')}>
                                TTFT P50 {sortField === 'ttft_p50' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('tokens_per_sec')}>
                                Tokens/s {sortField === 'tokens_per_sec' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="py-3 px-4 text-right cursor-pointer hover:text-slate-200" onClick={() => handleSort('cost_per_1m')}>
                                $/1M Tok {sortField === 'cost_per_1m' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="py-3 px-4 text-center">Stability</th>
                            <th className="py-3 px-4 text-center">Tier</th>
                            <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850 text-xs text-slate-300">
                        {sortedData.length === 0 && (
                            <tr>
                                <td colSpan={12} className="py-16 text-center">
                                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto p-6 bg-slate-950/60 rounded-2xl border border-slate-800/80 shadow-xl">
                                        <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mb-3 shadow-[0_0_15px_rgba(245,158,11,0.15)]">
                                            <FilterX className="w-6 h-6" />
                                        </div>
                                        <h4 className="text-sm font-bold text-white mb-1">No matching configurations</h4>
                                        <p className="text-xs text-slate-400 mb-4 text-center">
                                            No benchmark recipes match your current combination of model, hardware, engine, and scope filters.
                                        </p>
                                        {onResetFilters && (
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={onResetFilters}
                                                className="flex items-center gap-1.5 bg-slate-900 border-slate-700 text-cyan-300 hover:bg-slate-800 cursor-pointer"
                                            >
                                                <RotateCcw className="w-3.5 h-3.5" />
                                                <span>Reset All Filters</span>
                                            </Button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        )}
                        {sortedData.map((item, index) => {
                            const rank = index + 1;
                            const isSelected = selectedRecipe && selectedRecipe.id === item.id;
                            const isExpanded = expandedRowId === item.id;
                            const isCompared = selectedForCompare.includes(item.id);
                            const isBaseline = baseline && baseline.id === item.id;
                            const tier = item.tier || 'Explorer';
                            const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.Explorer;
                            const isCopied = copiedId === item.id;

                            // Stability Headroom
                            const kvUsage = item.metrics?.kv_cache_usage_pct || 75;
                            const isSafeHeadroom = kvUsage <= 80;
                            const isMultiNode = (item.hardware?.accelerator_count || 1) > 8 || (item.hardware_summary || '').toLowerCase().includes('nodes');

                            // Baseline Deltas
                            const tpsDelta = (!isBaseline && baseline) ? calculateDelta(item.tokens_per_sec, baseline.tokens_per_sec) : null;
                            const ttftDelta = (!isBaseline && baseline) ? calculateDelta(item.ttft_p50, baseline.ttft_p50, true) : null;
                            const costDelta = (!isBaseline && baseline) ? calculateDelta(item.cost_analysis?.cost_per_1m_output_tokens_usd, baseline.cost_analysis?.cost_per_1m_output_tokens_usd, true) : null;

                            return (
                                <React.Fragment key={item.id}>
                                    <tr
                                        id={`recipe-row-${item.id}`}
                                        onClick={() => {
                                            setExpandedRowId(isExpanded ? null : item.id);
                                            if (onSelectRecipe) onSelectRecipe(item);
                                        }}
                                        className={`group cursor-pointer transition-all duration-200 ${
                                            isBaseline
                                                ? 'bg-cyan-950/30 border-l-2 border-cyan-400'
                                                : isSelected
                                                    ? 'bg-cyan-950/30 border-l-2 border-cyan-400/80 shadow-[inset_0_0_15px_rgba(6,182,212,0.1)]'
                                                    : item.isParetoOptimal
                                                        ? 'bg-amber-500/[0.03] hover:bg-slate-850/60'
                                                        : 'hover:bg-slate-850/50'
                                        }`}
                                    >
                                        {/* Compare Checkbox */}
                                        <td className="py-3.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isCompared}
                                                disabled={!isCompared && selectedForCompare.length >= 3}
                                                onChange={() => onToggleCompare && onToggleCompare(item.id)}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-500/40 disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer"
                                                title={!isCompared && selectedForCompare.length >= 3 ? "Max 3 recipes can be compared. Uncheck one first." : "Select to compare side-by-side (up to 3)"}
                                            />
                                        </td>

                                        {/* Rank */}
                                        <td className="py-3.5 px-3 text-center">
                                            <div className="flex items-center justify-center">
                                                {getRankIcon(rank)}
                                            </div>
                                        </td>

                                        {/* Recipe & Model */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-white group-hover:text-cyan-300 transition-colors">
                                                    {item.recipe_name}
                                                </span>
                                                <span className="text-[11px] text-slate-400 font-mono truncate max-w-[220px]">
                                                    {item.model_name}
                                                </span>
                                            </div>
                                        </td>

                                        {/* Author */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-2">
                                                {item.author?.avatar_url ? (
                                                    <img
                                                        src={item.author.avatar_url}
                                                        alt={item.author.username}
                                                        className="w-6 h-6 rounded-full border border-slate-700 object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-300">
                                                        {(item.author?.username || 'E')[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-medium text-slate-200 truncate">
                                                        {item.author?.display_name || item.author?.username}
                                                    </span>
                                                    <span className="text-[10px] text-slate-500 truncate">
                                                        {item.author?.team || 'Field Engineer'}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Hardware & Multi-Node */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-300 font-mono text-[11px]">
                                                    {item.hardware_summary}
                                                </span>
                                                {isMultiNode && (
                                                    <span className="flex items-center gap-1 text-[9px] text-purple-300 font-mono">
                                                        <Globe className="w-2.5 h-2.5" /> Distributed Cluster
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Stack */}
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-1">
                                                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px] uppercase font-semibold">
                                                    {item.stack?.engine}
                                                </span>
                                                <span className="text-[10px] text-slate-500 font-mono">
                                                    TP{item.stack?.tensor_parallel_size || 1}
                                                </span>
                                            </div>
                                        </td>

                                        {/* TTFT Latency */}
                                        <td className="py-3.5 px-4 text-right font-mono">
                                            <div className="flex flex-col items-end">
                                                <span className="font-medium text-cyan-300">
                                                    {item.ttft_p50 ? `${item.ttft_p50.toFixed(1)} ms` : '—'}
                                                </span>
                                                {ttftDelta && (
                                                    <span className={`text-[10px] font-bold ${ttftDelta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {ttftDelta.text}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Total Throughput */}
                                        <td className="py-3.5 px-4 text-right font-mono">
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-white">
                                                    {Math.round(item.tokens_per_sec || 0).toLocaleString()} <span className="text-[10px] font-normal text-slate-400">tok/s</span>
                                                </span>
                                                {tpsDelta && (
                                                    <span className={`text-[10px] font-bold ${tpsDelta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {tpsDelta.text}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Cost / 1M Tokens */}
                                        <td className="py-3.5 px-4 text-right font-mono">
                                            <div className="flex flex-col items-end">
                                                <span className="text-emerald-300 font-medium">
                                                    ${item.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3) || '0.00'}
                                                </span>
                                                {costDelta && (
                                                    <span className={`text-[10px] font-bold ${costDelta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {costDelta.text}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Stability Headroom */}
                                        <td className="py-3.5 px-4 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-medium ${
                                                isSafeHeadroom
                                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                                                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                            }`}>
                                                {isSafeHeadroom ? '<80% KV' : '>90% KV'}
                                            </span>
                                        </td>

                                        {/* Tier Badge */}
                                        <td className="py-3.5 px-4 text-center">
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierConfig.badgeBg} ${tierConfig.badgeBorder} ${tierConfig.badgeText} ${tierConfig.badgeGlow}`}>
                                                {tier}
                                            </span>
                                        </td>

                                        {/* Row Actions */}
                                        <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1.5">
                                                {/* Baseline Button */}
                                                <button
                                                    onClick={() => onSetBaseline && onSetBaseline(isBaseline ? null : item.id)}
                                                    className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                                        isBaseline
                                                            ? 'bg-cyan-500/30 text-cyan-300 border-cyan-400'
                                                            : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border-slate-700'
                                                    }`}
                                                    title={isBaseline ? "Active Baseline" : "Set as Baseline for Comparison"}
                                                >
                                                    <Star className={`w-3.5 h-3.5 ${isBaseline ? 'fill-cyan-400' : ''}`} />
                                                </button>

                                                {/* Certificate Button */}
                                                <button
                                                    onClick={() => onOpenCertificate && onOpenCertificate(item)}
                                                    className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-amber-500/20 text-slate-400 hover:text-amber-300 border border-slate-700 transition-colors cursor-pointer"
                                                    title="View Verifiable Achievement Certificate"
                                                >
                                                    <Award className="w-3.5 h-3.5" />
                                                </button>

                                                {/* Inspect Chevron */}
                                                <button
                                                    onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                                                    className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors cursor-pointer"
                                                    title="Expand Details"
                                                >
                                                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>

                                    {/* Expanded Detail Panel */}
                                    {isExpanded && (
                                        <tr className="bg-slate-950/80 border-b border-slate-800">
                                            <td colSpan={12} className="p-4">
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                                    {/* Latency & Throughput Distribution */}
                                                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                                                            <Zap className="w-3.5 h-3.5 text-cyan-400" /> Latency & Token Rates
                                                        </span>
                                                        <div className="space-y-1 font-mono text-[11px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">TTFT (Mean / P50 / P99):</span>
                                                                <span className="text-slate-200">{item.metrics?.ttft_ms?.mean?.toFixed(1)} / {item.metrics?.ttft_ms?.p50?.toFixed(1)} / {item.metrics?.ttft_ms?.p99?.toFixed(1)} ms</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Inter-Token Latency (ITL):</span>
                                                                <span className="text-slate-200">{item.metrics?.itl_ms?.p50?.toFixed(1)} ms</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Per-Stream Output Rate:</span>
                                                                <span className="text-slate-200">{item.metrics?.output_tokens_per_sec?.p50?.toFixed(1)} tok/s</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Prefix Cache Hit Rate:</span>
                                                                <span className="text-emerald-400 font-bold">{item.metrics?.prefix_cache_hit_rate_pct || 80}%</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Workload & Hardware Details */}
                                                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800">
                                                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 block flex items-center gap-1.5">
                                                            <DollarSign className="w-3.5 h-3.5 text-emerald-400" /> Cost & Workload Breakdown
                                                        </span>
                                                        <div className="space-y-1 font-mono text-[11px]">
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Cluster Hourly Rate:</span>
                                                                <span className="text-slate-200">${item.cost_analysis?.hourly_rate_usd?.toFixed(2)}/hr</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Tokens per Dollar:</span>
                                                                <span className="text-emerald-300 font-bold">{Math.round(item.cost_analysis?.tokens_per_dollar || 0).toLocaleString()}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Workload (In / Out / Conc):</span>
                                                                <span className="text-slate-200">{item.workload?.input_tokens} / {item.workload?.output_tokens} / {item.workload?.concurrency}</span>
                                                            </div>
                                                            <div className="flex justify-between">
                                                                <span className="text-slate-500">Quantization & KV Cache:</span>
                                                                <span className="text-cyan-300 font-bold">{item.stack?.quantization?.toUpperCase()} ({item.stack?.kv_cache_dtype})</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Reproduction Command */}
                                                    <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-800 flex flex-col justify-between">
                                                        <div>
                                                            <div className="flex items-center justify-between mb-1.5">
                                                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                                                    <Terminal className="w-3.5 h-3.5 text-purple-400" /> Reproduction CLI
                                                                </span>
                                                                <button
                                                                    onClick={(e) => handleCopyCommand(e, item.id, item.reproduction_command)}
                                                                    className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                                                                >
                                                                    {isCopied ? 'Copied!' : 'Copy'}
                                                                </button>
                                                            </div>
                                                            <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-300 break-all select-all">
                                                                {item.reproduction_command}
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-800 text-[10px]">
                                                            <span className="text-slate-500">Status: <strong className="text-emerald-400">Verified Reproducible</strong></span>
                                                            <button
                                                                onClick={() => onSelectRecipe && onSelectRecipe(item)}
                                                                className="text-cyan-400 hover:underline font-semibold cursor-pointer"
                                                            >
                                                                Open Full Recipe Spec &rarr;
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Floating Comparison Drawer Bar */}
            {selectedForCompare.length > 0 && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-slate-900/95 border border-cyan-500/60 rounded-2xl px-5 py-3 shadow-2xl backdrop-blur-md flex items-center gap-4 animate-in slide-in-from-bottom duration-200">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                        <ArrowLeftRight className="w-4 h-4 text-cyan-400" />
                        <span>
                            <strong className="text-cyan-300 font-mono">{selectedForCompare.length}/3</strong> Recipes Selected for Comparison
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onClearCompare ? onClearCompare() : onToggleCompare && selectedForCompare.forEach(id => onToggleCompare(id))}
                            className="text-[11px] text-slate-400 hover:text-white underline px-1 cursor-pointer"
                        >
                            Clear All
                        </button>
                        <button
                            onClick={onOpenCompareModal}
                            disabled={selectedForCompare.length < 2}
                            className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all cursor-pointer"
                        >
                            Compare Side-by-Side {selectedForCompare.length < 2 ? '(Pick 1 more)' : ''}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
