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
import {
    X,
    ArrowLeftRight,
    Check,
    Copy,
    Zap,
    Layers,
    Terminal,
    FileText,
    CheckCircle2,
    AlertTriangle,
    ExternalLink
} from 'lucide-react';
import { getRecipeReproductionCount } from '../../utils/communityRewards.js';
import {
    computeParity,
    diffConfigs,
    isIsolatedChange,
    formatRunDate
} from '../../utils/runParity.js';
import { engineLabel } from '../../utils/leaderboardFacets.js';
import { Button } from '../ui/Button.jsx';
import { cn } from '../../utils/cn';

const getCostPer1M = (r) => r?.cost_analysis?.cost_per_1m_output_tokens_usd ?? r?.cost_per_1m ?? null;

const getPerChipTps = (r) => {
    if (!r) return 0;
    if (typeof r.tokens_per_sec_per_chip === 'number' && Number.isFinite(r.tokens_per_sec_per_chip)) {
        return r.tokens_per_sec_per_chip;
    }
    const chips = Math.max(1, r.hardware?.accelerator_count || 1);
    return (r.tokens_per_sec || 0) / chips;
};

export default function RecipeComparisonModal({
    isOpen,
    onClose,
    recipes = [],
    baselineRecipeId,
    onSetBaseline,
    onInspectRecipe
}) {
    const [selectedBaselineId, setSelectedBaselineId] = useState(baselineRecipeId || (recipes[0]?.id));
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [copiedMarkdown, setCopiedMarkdown] = useState(false);

    const [prevPropBaselineId, setPrevPropBaselineId] = useState(baselineRecipeId);
    if (baselineRecipeId !== prevPropBaselineId) {
        setPrevPropBaselineId(baselineRecipeId);
        if (baselineRecipeId) {
            setSelectedBaselineId(baselineRecipeId);
        }
    }

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

    const parity = useMemo(() => computeParity(recipes), [recipes]);

    if (!isOpen || !recipes || recipes.length < 2) return null;

    const baseline = recipes.find((r) => r.id === selectedBaselineId) || recipes[0];
    const gridColsClass = recipes.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-3';

    const handleSelectBaseline = (id) => {
        setSelectedBaselineId(id);
        if (onSetBaseline) onSetBaseline(id);
    };

    const handleCopyCommand = (idx, cmd) => {
        if (cmd && navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(cmd);
            setCopiedIndex(idx);
            setTimeout(() => setCopiedIndex(null), 2000);
        }
    };

    const calculateDelta = (val, baseVal, isLowerBetter = false) => {
        if (val == null || baseVal == null || baseVal === 0 || val === baseVal) return null;
        const diff = ((val - baseVal) / baseVal) * 100;
        const ratio = isLowerBetter ? baseVal / val : val / baseVal;
        const isPositive = diff > 0;
        const isGood = isLowerBetter ? !isPositive : isPositive;

        return {
            text: `${isPositive ? '+' : ''}${diff.toFixed(1)}%`,
            ratioText: Number.isFinite(ratio) && ratio > 0 ? `${ratio.toFixed(2)}×` : null,
            isGood,
            diff
        };
    };

    const handleCopyPrMarkdown = () => {
        let md = `### llm-d Benchmark Comparison Report\n\n`;
        md += `**Parity Status**: ${parity.likeForLike ? 'Workload & harness parity verified (Like-for-like)' : `Not like-for-like (${parity.mismatches.length} workload differences)`}\n`;
        md += `**Baseline Recipe**: **${baseline.recipe_name}** (${baseline.hardware_summary}, ${engineLabel(baseline.stack?.engine)})\n\n`;
        md += `| Metric | Baseline: ${baseline.recipe_name} | ` + recipes.filter((r) => r.id !== baseline.id).map((r) => `${r.recipe_name}`).join(' | ') + ` |\n`;
        md += `| :--- | :--- | ` + recipes.filter((r) => r.id !== baseline.id).map(() => `:---`).join(' | ') + ` |\n`;

        // Per-chip throughput row
        md += `| **Tok/s per chip** | **${Math.round(getPerChipTps(baseline)).toLocaleString()}** | ` + recipes.filter((r) => r.id !== baseline.id).map((r) => {
            const delta = calculateDelta(getPerChipTps(r), getPerChipTps(baseline));
            return `${Math.round(getPerChipTps(r)).toLocaleString()} (${delta ? `${delta.text}${delta.ratioText ? `, ${delta.ratioText}` : ''}` : '0%'})`;
        }).join(' | ') + ` |\n`;

        // Throughput row
        md += `| **Total Throughput (tok/s)** | **${Math.round(baseline.tokens_per_sec || 0).toLocaleString()}** | ` + recipes.filter((r) => r.id !== baseline.id).map((r) => {
            const delta = calculateDelta(r.tokens_per_sec, baseline.tokens_per_sec);
            return `${Math.round(r.tokens_per_sec || 0).toLocaleString()} (${delta ? `${delta.text}${delta.ratioText ? `, ${delta.ratioText}` : ''}` : '0%'})`;
        }).join(' | ') + ` |\n`;

        // TTFT P50 row
        md += `| **TTFT P50 Latency** | **${baseline.ttft_p50 ? `${baseline.ttft_p50.toFixed(1)} ms` : '—'}** | ` + recipes.filter((r) => r.id !== baseline.id).map((r) => {
            const delta = calculateDelta(r.ttft_p50, baseline.ttft_p50, true);
            return `${r.ttft_p50 ? `${r.ttft_p50.toFixed(1)} ms` : '—'} (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n`;

        // Cost per 1M tokens
        const baseCost = getCostPer1M(baseline);
        md += `| **Cost / 1M Tokens ($)** | **${baseCost != null ? `$${baseCost.toFixed(3)}` : '—'}** | ` + recipes.filter((r) => r.id !== baseline.id).map((r) => {
            const cost = getCostPer1M(r);
            const delta = (cost != null && baseCost != null) ? calculateDelta(cost, baseCost, true) : null;
            return `${cost != null ? `$${cost.toFixed(3)}` : '—'} (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n\n`;

        md += `#### Reproduction CLI Commands\n`;
        recipes.forEach((r) => {
            md += `- **${r.recipe_name}** (\`${r.hardware_summary}\`):\n\`\`\`bash\n${r.reproduction_command || 'inference-perf --config_file config.yml'}\n\`\`\`\n`;
        });

        navigator.clipboard?.writeText(md);
        setCopiedMarkdown(true);
        setTimeout(() => setCopiedMarkdown(false), 2500);
    };

    return (
        <div
            className="surface-light fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-white border border-zinc-200 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl relative text-zinc-900 overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 border-b border-zinc-200 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-2xl bg-accent-50 text-accent-600 border border-accent-200">
                            <ArrowLeftRight className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-900 flex flex-wrap items-center gap-2">
                                <span>Recipe comparison</span>
                                <span className="text-xs font-mono px-2.5 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200">
                                    {recipes.length} setups compared
                                </span>
                            </h2>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={handleCopyPrMarkdown}
                        >
                            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <FileText className="w-3.5 h-3.5" />}
                            <span>{copiedMarkdown ? 'Copied for AI / PR' : 'Copy for AI / PR'}</span>
                        </Button>

                        <button
                            onClick={onClose}
                            aria-label="Close comparison modal"
                            className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content Comparison Grid */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Computed Fairness & Parity Callout */}
                    {parity.likeForLike ? (
                        <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                    <span className="text-emerald-950 font-semibold">
                                        Workload & harness parity verified · Like-for-like comparison
                                    </span>
                                </div>
                                <span className="text-tiny font-mono font-medium px-2.5 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200 shrink-0">
                                    Like-for-like
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {parity.matched.map((m) => (
                                    <span
                                        key={m.key}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white border border-emerald-200/80 text-micro font-mono text-emerald-900"
                                    >
                                        <span className="text-emerald-700 font-sans font-medium">{m.label}:</span>
                                        <span className="font-semibold">{m.value}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 space-y-2 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                                    <span className="text-amber-950 font-semibold">
                                        {`Not like-for-like · ${parity.mismatches.length} workload ${parity.mismatches.length === 1 ? 'difference' : 'differences'}`}
                                    </span>
                                </div>
                                <span className="text-tiny font-mono font-medium px-2.5 py-0.5 rounded-full bg-white text-amber-800 border border-amber-200 shrink-0">
                                    Confounded comparison
                                </span>
                            </div>
                            <ul className="space-y-1 font-mono text-micro text-amber-950 list-disc list-inside">
                                {parity.mismatches.map((m) => (
                                    <li key={m.key}>
                                        <strong className="font-sans font-semibold">{m.label}:</strong>{' '}
                                        {m.values.map((v) => v.value).join(' vs ')}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Symmetric Configuration & Workload Diff */}
                    <div className="p-4 rounded-2xl bg-zinc-50/80 border border-zinc-200 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {recipes.filter((r) => r.id !== baseline.id).map((comp) => {
                                const parityForPair = computeParity([baseline, comp]);
                                const configDiff = diffConfigs(baseline, comp);

                                const tpsDelta = calculateDelta(getPerChipTps(comp), getPerChipTps(baseline));
                                const costDelta = calculateDelta(getCostPer1M(comp), getCostPer1M(baseline), true);

                                return (
                                    <div key={comp.id} className="p-3.5 rounded-2xl bg-white border border-zinc-200 space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <span className="font-semibold text-zinc-900">
                                                    {comp.recipe_name} vs Baseline
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                {tpsDelta && (
                                                    <span className={cn(
                                                        'text-tiny px-2 py-0.5 rounded-full font-mono font-semibold',
                                                        tpsDelta.isGood ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
                                                    )}>
                                                        {tpsDelta.text} tok/s/chip
                                                    </span>
                                                )}
                                                {costDelta && (
                                                    <span className={cn(
                                                        'text-tiny px-2 py-0.5 rounded-full font-mono font-semibold',
                                                        costDelta.isGood ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                                                    )}>
                                                        {costDelta.text} $/1M
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <ul className="text-zinc-700 space-y-1 list-disc list-inside text-xs">
                                            {parityForPair.mismatches.map((mismatch) => (
                                                <li key={`wl-${mismatch.key}`} className="text-amber-900">
                                                    <strong className="font-semibold">Workload — {mismatch.label}:</strong>{' '}
                                                    <span className="font-mono">{mismatch.values[0]?.value} → {mismatch.values[1]?.value}</span>
                                                </li>
                                            ))}
                                            {configDiff.diffs.map((d) => (
                                                <li key={d.key}>
                                                    <strong className="text-zinc-900 font-semibold">{d.label}:</strong>{' '}
                                                    <span className="font-mono text-zinc-600">{d.baselineValue}</span>
                                                    <span className="text-zinc-400 mx-1">→</span>
                                                    <span className="font-mono font-semibold text-zinc-900">{d.challengerValue}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Header Columns for each Recipe */}
                    <div className={cn('grid gap-4', gridColsClass)}>
                        {recipes.map((item, idx) => {
                            const isBaseline = item.id === baseline.id;
                            const githubUrl = item.pull_request_url || `https://github.com/llm-d/llm-d/tree/main/recipes/${(item.model_family || 'llama').toLowerCase().replace(/\s+/g, '-')}`;
                            const perChip = getPerChipTps(item);
                            const runDate = formatRunDate(item.created_at) || 'Date not reported';
                            const shortHw = `${item.hardware?.accelerator_count || 1}× ${({
                                'nvidia-h100-80gb': 'H100',
                                'nvidia-a100-80gb': 'A100',
                                'nvidia-a100-40gb': 'A100 40GB',
                                'nvidia-l4': 'L4',
                                'tpu-v6e-trillium': 'TPU v6e',
                                'tpu-v5e': 'TPU v5e',
                            })[item.hardware?.accelerator_type] || item.hardware_summary}`;

                            return (
                                <div
                                    key={item.id}
                                    className={cn(
                                        'p-4 rounded-2xl border flex flex-col justify-between relative transition-all',
                                        isBaseline
                                            ? 'bg-white border-zinc-900 ring-1 ring-zinc-900/5'
                                            : 'bg-white border-zinc-200'
                                    )}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs text-zinc-500 font-mono">
                                                Config #{idx + 1} · {engineLabel(item.stack?.engine)}
                                            </span>
                                            {isBaseline ? (
                                                <span className="text-tiny font-mono font-semibold px-2.5 py-0.5 rounded-full bg-accent-50 text-accent-700 border border-accent-200">
                                                    ★ Baseline
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectBaseline(item.id)}
                                                    className="text-tiny font-mono text-zinc-500 hover:text-zinc-900 underline cursor-pointer"
                                                >
                                                    Set as baseline
                                                </button>
                                            )}
                                        </div>

                                        <h3 className="font-semibold text-zinc-900 text-sm mb-0.5 truncate" title={item.recipe_name}>
                                            {item.recipe_name}
                                        </h3>
                                        <p className="text-xs text-zinc-600 font-mono truncate mb-2" title={shortHw}>
                                            {item.model_family || item.model_name?.split('/')?.pop() || item.model_name} · {shortHw}
                                        </p>

                                        {/* Author Row */}
                                        <div className="flex items-center justify-between gap-2 mb-2 p-2 rounded-xl bg-zinc-50 border border-zinc-200 text-micro">
                                            <div className="flex items-center gap-1.5 min-w-0">
                                                {item.author?.avatar_url ? (
                                                    <img src={item.author.avatar_url} alt="Author" className="w-5 h-5 rounded-full border border-zinc-200 object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-5 h-5 rounded-full bg-white text-zinc-700 border border-zinc-200 flex items-center justify-center font-semibold text-tiny shrink-0">
                                                        {(item.author?.username || 'U')[0].toUpperCase()}
                                                    </div>
                                                )}
                                                <span className="font-medium text-zinc-800 truncate max-w-[120px]" title={item.author?.display_name || item.author?.username}>
                                                    {item.author?.display_name || item.author?.username || 'Community'}
                                                </span>
                                            </div>
                                            <span className="font-mono text-tiny text-zinc-500 truncate">{runDate}</span>
                                        </div>

                                        <div className="text-micro text-zinc-500 flex items-center justify-end gap-1 mb-3">
                                            <a
                                                href={githubUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-tiny text-zinc-600 hover:text-zinc-900 flex items-center gap-1 shrink-0"
                                                title="View source on GitHub"
                                            >
                                                <span>GitHub</span>
                                                <ExternalLink className="w-2.5 h-2.5" />
                                            </a>
                                        </div>
                                    </div>

                                    {/* Top Line Metrics */}
                                    <div className="grid grid-cols-2 gap-2 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200 font-mono text-xs">
                                        <div>
                                            <span className="text-tiny text-zinc-500 block">Tok/s per chip:</span>
                                            <span className="text-zinc-900 font-semibold">{Math.round(perChip).toLocaleString()}</span>
                                            {!isBaseline && (
                                                <span className={cn('text-tiny ml-1 font-semibold', calculateDelta(perChip, getPerChipTps(baseline))?.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                    {calculateDelta(perChip, getPerChipTps(baseline))?.text}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <span className="text-tiny text-zinc-500 block">TTFT P50:</span>
                                            <span className="text-zinc-900 font-semibold">{item.ttft_p50 ? `${item.ttft_p50.toFixed(1)} ms` : '—'}</span>
                                            {!isBaseline && (
                                                <span className={cn('text-tiny ml-1 font-semibold', calculateDelta(item.ttft_p50, baseline.ttft_p50, true)?.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                    {calculateDelta(item.ttft_p50, baseline.ttft_p50, true)?.text}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons for this Recipe */}
                                    <div className="mt-3 flex items-center gap-2">
                                        <button
                                            onClick={() => onInspectRecipe && onInspectRecipe(item)}
                                            className="flex-1 py-1.5 px-2 rounded-full bg-zinc-900 hover:bg-zinc-700 text-white text-micro font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                                            title="Inspect complete recipe specs and deployment manifests"
                                        >
                                            <Terminal className="w-3 h-3" />
                                            <span>Inspect & deploy</span>
                                        </button>
                                        {item.reproduction_command && (
                                            <button
                                                onClick={() => handleCopyCommand(idx, item.reproduction_command)}
                                                className="p-1.5 rounded-full bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-200 text-micro transition-colors cursor-pointer"
                                                title="Copy reproduction CLI command"
                                            >
                                                {copiedIndex === idx ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Detailed Metric Comparison Matrix */}
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500" /> Performance & latency matrix
                            </h4>
                            <span className="text-tiny text-zinc-500 font-mono">Deltas compared to baseline ★</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="label-caps text-zinc-500 bg-zinc-50/70 border-b border-zinc-200 select-none">
                                    <tr>
                                        <th className="py-3 px-4 w-1/4">Metric</th>
                                        {recipes.map((r) => (
                                            <th key={r.id} className="py-3 px-4 text-zinc-900">
                                                <div className="truncate max-w-[220px]">{r.recipe_name}</div>
                                                {r.id === baseline.id && (
                                                    <span className="text-tiny font-mono text-accent-700 normal-case block">★ Baseline</span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-mono text-xs text-zinc-700">
                                    {/* Per-chip throughput */}
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">
                                            Per-chip throughput (tok/s/chip)
                                        </td>
                                        {recipes.map((r) => {
                                            const perChip = getPerChipTps(r);
                                            const basePerChip = getPerChipTps(baseline);
                                            const delta = r.id !== baseline.id ? calculateDelta(perChip, basePerChip) : null;
                                            return (
                                                <td key={r.id} className="py-2.5 px-4 text-zinc-900">
                                                    <span className="font-semibold">{Math.round(perChip).toLocaleString()}</span>
                                                    {delta && (
                                                        <span className={cn('text-micro ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                            ({delta.text})
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Throughput */}
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">
                                            Throughput (total tok/s)
                                        </td>
                                        {recipes.map((r) => {
                                            const delta = r.id !== baseline.id ? calculateDelta(r.tokens_per_sec, baseline.tokens_per_sec) : null;
                                            return (
                                                <td key={r.id} className="py-2.5 px-4 text-zinc-900">
                                                    <span className="font-semibold">{Math.round(r.tokens_per_sec || 0).toLocaleString()}</span>
                                                    {delta && (
                                                        <span className={cn('text-micro ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                            ({delta.text})
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* TTFT P50 */}
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">
                                            TTFT P50 latency
                                        </td>
                                        {recipes.map((r) => {
                                            const delta = r.id !== baseline.id ? calculateDelta(r.ttft_p50, baseline.ttft_p50, true) : null;
                                            return (
                                                <td key={r.id} className="py-2.5 px-4 text-zinc-900">
                                                    <span className="font-semibold">{r.ttft_p50 ? `${r.ttft_p50.toFixed(1)} ms` : '—'}</span>
                                                    {delta && (
                                                        <span className={cn('text-micro ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                            ({delta.text})
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* TTFT P99 */}
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">
                                            TTFT P99 (tail latency)
                                        </td>
                                        {recipes.map((r) => {
                                            const p99 = r.metrics?.ttft_ms?.p99;
                                            const baseP99 = baseline.metrics?.ttft_ms?.p99;
                                            const delta = (r.id !== baseline.id && p99 && baseP99) ? calculateDelta(p99, baseP99, true) : null;
                                            return (
                                                <td key={r.id} className="py-2.5 px-4 text-zinc-700">
                                                    <span>{p99 ? `${p99.toFixed(1)} ms` : '—'}</span>
                                                    {delta && (
                                                        <span className={cn('text-micro ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                            ({delta.text})
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* ITL */}
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">
                                            Time per output token (TPOT P50)
                                        </td>
                                        {recipes.map((r) => {
                                            const itl = r.itl_p50 ?? r.metrics?.itl_ms?.p50;
                                            const baseItl = baseline.itl_p50 ?? baseline.metrics?.itl_ms?.p50;
                                            const delta = (r.id !== baseline.id && itl && baseItl) ? calculateDelta(itl, baseItl, true) : null;
                                            return (
                                                <td key={r.id} className="py-2.5 px-4 text-zinc-700">
                                                    <span>{itl ? `${itl.toFixed(1)} ms` : '—'}</span>
                                                    {delta && (
                                                        <span className={cn('text-micro ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                            ({delta.text})
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>

                                    {/* Cost / 1M Tokens */}
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">
                                            Cost / 1M tokens
                                        </td>
                                        {recipes.map((r) => {
                                            const cost = getCostPer1M(r);
                                            const baseCost = getCostPer1M(baseline);
                                            const delta = r.id !== baseline.id ? calculateDelta(cost, baseCost, true) : null;
                                            return (
                                                <td key={r.id} className="py-2.5 px-4 text-emerald-700 font-semibold">
                                                    <span>{cost != null ? `$${cost.toFixed(3)}` : '—'}</span>
                                                    {delta && (
                                                        <span className={cn('text-micro ml-1.5 font-semibold', delta.isGood ? 'text-emerald-700' : 'text-rose-600')}>
                                                            ({delta.text})
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Architecture & Serving Stack Diff */}
                    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 flex items-center justify-between">
                            <h4 className="text-xs font-semibold text-zinc-900 uppercase tracking-wider flex items-center gap-2">
                                <Layers className="w-4 h-4 text-accent-600" /> Serving parameters & architecture diff
                            </h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead className="label-caps text-zinc-500 bg-zinc-50/70 border-b border-zinc-200 select-none">
                                    <tr>
                                        <th className="py-3 px-4 w-1/4">Parameter</th>
                                        {recipes.map((r) => (
                                            <th key={r.id} className="py-3 px-4 text-zinc-900">
                                                <div className="truncate max-w-[220px]">{r.recipe_name}</div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-200 font-mono text-xs text-zinc-700">
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Evaluated model</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4 text-zinc-900 font-semibold font-sans">
                                                <div className="truncate max-w-[200px]">{r.model_family || r.model_name?.split('/')?.pop() || r.model_name}</div>
                                                <div className="text-tiny text-zinc-500 font-mono truncate">{r.model_name}</div>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Hardware</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4 text-zinc-900 font-semibold font-mono">
                                                <div className="truncate max-w-[200px]">{r.hardware_summary}</div>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Serving stack</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4 text-zinc-900 font-semibold">
                                                {engineLabel(r.stack?.engine)}{r.stack?.engine_version && r.stack.engine_version !== 'latest' ? ` (${r.stack.engine_version})` : ''}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Container image</td>
                                        {recipes.map((r) => {
                                            const img = r.container_image || r.stack?.container_image || null;
                                            return (
                                                <td key={r.id} className={cn('py-2.5 px-4', img ? 'text-accent-700 font-medium' : 'text-zinc-500')}>
                                                    {img || 'Not reported'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Tensor parallel (TP)</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4 text-zinc-900 font-semibold">
                                                TP={r.stack?.tensor_parallel_size || 1}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Quantization / precision</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4 text-accent-700 font-semibold">
                                                {(r.stack?.quantization || 'fp16').toUpperCase()}
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Prefix caching & routing</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4">
                                                <span className={r.stack?.prefix_caching ? 'text-emerald-700 font-semibold' : 'text-zinc-500'}>
                                                    {r.stack?.prefix_caching ? (r.stack?.routing ? `Enabled (${r.stack.routing})` : 'Enabled') : 'Disabled'}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                    <tr className="hover:bg-zinc-50 transition-colors">
                                        <td className="py-2.5 px-4 font-sans font-medium text-zinc-600">Speculative decoding</td>
                                        {recipes.map((r) => (
                                            <td key={r.id} className="py-2.5 px-4">
                                                <span className={r.stack?.speculative_decoding?.enabled ? 'text-amber-700 font-semibold' : 'text-zinc-500'}>
                                                    {r.stack?.speculative_decoding?.enabled ? `Enabled (${r.stack?.speculative_decoding?.num_speculative_tokens || 4} tok)` : 'Disabled'}
                                                </span>
                                            </td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Launch Commands Row */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-accent-600" /> Reproduction CLI commands
                        </h4>
                        <div className={cn('grid gap-3', gridColsClass)}>
                            {recipes.map((r, idx) => (
                                <div key={r.id} className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 text-tiny font-mono flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-zinc-800 font-semibold truncate">{r.recipe_name}</span>
                                        {r.reproduction_command && (
                                            <button
                                                onClick={() => handleCopyCommand(idx, r.reproduction_command)}
                                                className="text-accent-600 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                                            >
                                                {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="text-zinc-200 break-all select-all bg-zinc-950 p-2.5 rounded-xl border border-zinc-800 mt-1">
                                        {r.reproduction_command || 'inference-perf --config_file config.yml'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-zinc-200 flex justify-end bg-zinc-50/70">
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
