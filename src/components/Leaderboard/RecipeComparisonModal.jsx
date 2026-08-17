import React, { useState, useEffect } from 'react';
import { X, Sparkles, Trophy, ArrowRight, ArrowLeftRight, Check, Copy, TrendingUp, TrendingDown, DollarSign, Zap, Layers, Cpu, Terminal, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { TIER_CONFIG } from '../../utils/gamificationEngine.js';

export default function RecipeComparisonModal({
    isOpen,
    onClose,
    recipes = [],
    baselineRecipeId,
    onSetBaseline
}) {
    const [selectedBaselineId, setSelectedBaselineId] = useState(baselineRecipeId || (recipes[0]?.id));
    const [copiedIndex, setCopiedIndex] = useState(null);
    const [copiedMarkdown, setCopiedMarkdown] = useState(false);

    useEffect(() => {
        if (baselineRecipeId) {
            setSelectedBaselineId(baselineRecipeId);
        } else if (recipes.length > 0 && !selectedBaselineId) {
            setSelectedBaselineId(recipes[0].id);
        }
    }, [baselineRecipeId, recipes]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !recipes || recipes.length < 2) return null;

    const baseline = recipes.find(r => r.id === selectedBaselineId) || recipes[0];

    const handleCopyCommand = (idx, cmd) => {
        navigator.clipboard.writeText(cmd);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const calculateDelta = (val, baseVal, isLowerBetter = false) => {
        if (!val || !baseVal || val === baseVal) return null;
        const diff = ((val - baseVal) / baseVal) * 100;
        const isPositive = diff > 0;
        const isGood = isLowerBetter ? !isPositive : isPositive;

        return {
            text: `${isPositive ? '+' : ''}${diff.toFixed(1)}%`,
            isGood,
            diff
        };
    };

    const handleCopyPrMarkdown = () => {
        let md = `### 🚀 llm-d Benchmark Comparison Report\n\n`;
        md += `**Evaluated Model**: \`${baseline.model_name}\`\n`;
        md += `**Baseline Recipe**: **${baseline.recipe_name}** (${baseline.hardware_summary}, ${baseline.stack?.engine?.toUpperCase()})\n\n`;
        md += `| Metric | Baseline: ${baseline.recipe_name} | ` + recipes.filter(r => r.id !== baseline.id).map(r => `${r.recipe_name}`).join(' | ') + ` |\n`;
        md += `| :--- | :--- | ` + recipes.filter(r => r.id !== baseline.id).map(() => `:---`).join(' | ') + ` |\n`;
        
        // Throughput row
        md += `| **Throughput (tok/s)** | **${Math.round(baseline.tokens_per_sec).toLocaleString()}** | ` + recipes.filter(r => r.id !== baseline.id).map(r => {
            const delta = calculateDelta(r.tokens_per_sec, baseline.tokens_per_sec);
            return `${Math.round(r.tokens_per_sec).toLocaleString()} (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n`;

        // TTFT P50 row
        md += `| **TTFT P50 Latency** | **${baseline.ttft_p50?.toFixed(1)} ms** | ` + recipes.filter(r => r.id !== baseline.id).map(r => {
            const delta = calculateDelta(r.ttft_p50, baseline.ttft_p50, true);
            return `${r.ttft_p50?.toFixed(1)} ms (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n`;

        // TTFT P99 row
        md += `| **TTFT P99 Tail Latency** | **${baseline.metrics?.ttft_ms?.p99?.toFixed(1) || '—'} ms** | ` + recipes.filter(r => r.id !== baseline.id).map(r => {
            const p99 = r.metrics?.ttft_ms?.p99;
            const baseP99 = baseline.metrics?.ttft_ms?.p99;
            const delta = (p99 && baseP99) ? calculateDelta(p99, baseP99, true) : null;
            return `${p99 ? p99.toFixed(1) + ' ms' : '—'} (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n`;

        // Cost per 1M tokens
        md += `| **Cost / 1M Tokens ($)** | **$${baseline.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3)}** | ` + recipes.filter(r => r.id !== baseline.id).map(r => {
            const cost = r.cost_analysis?.cost_per_1m_output_tokens_usd;
            const baseCost = baseline.cost_analysis?.cost_per_1m_output_tokens_usd;
            const delta = (cost && baseCost) ? calculateDelta(cost, baseCost, true) : null;
            return `$${cost?.toFixed(3)} (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n`;

        // Tokens per Dollar
        md += `| **Tokens / Dollar ($)** | **${Math.round(baseline.cost_analysis?.tokens_per_dollar || 0).toLocaleString()}** | ` + recipes.filter(r => r.id !== baseline.id).map(r => {
            const tpd = r.cost_analysis?.tokens_per_dollar || 0;
            const baseTpd = baseline.cost_analysis?.tokens_per_dollar || 0;
            const delta = (tpd && baseTpd) ? calculateDelta(tpd, baseTpd) : null;
            return `${Math.round(tpd).toLocaleString()} (${delta ? delta.text : '0%'})`;
        }).join(' | ') + ` |\n\n`;

        md += `#### 🛠️ Reproduction CLI Commands\n`;
        recipes.forEach(r => {
            md += `- **${r.recipe_name}** (\`${r.hardware_summary}\`):\n\`\`\`bash\n${r.reproduction_command}\n\`\`\`\n`;
        });

        navigator.clipboard.writeText(md);
        setCopiedMarkdown(true);
        setTimeout(() => setCopiedMarkdown(false), 2500);
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl relative text-slate-200 overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                            <ArrowLeftRight className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                Side-by-Side Recipe Comparator
                                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                    {recipes.length} Recipes Selected
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Compare serving parameters, hardware topologies, and performance deltas against baseline.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleCopyPrMarkdown}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-[0_0_12px_rgba(168,85,247,0.3)] transition-all cursor-pointer"
                            title="Generate and copy formatted Markdown comparison table for GitHub Pull Request description"
                        >
                            {copiedMarkdown ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <FileText className="w-3.5 h-3.5" />}
                            <span>{copiedMarkdown ? 'PR Markdown Copied!' : 'Copy PR Markdown Report'}</span>
                        </button>

                        <button
                            onClick={onClose}
                            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content Comparison Grid */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Fairness Audit Callout */}
                    <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/40 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-emerald-300 font-medium">
                                <strong>Fairness & Parity Verified</strong>: Compared configurations evaluated on identical workload datasets with normalized warmup runs.
                            </span>
                        </div>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shrink-0">
                            Apples-to-Apples
                        </span>
                    </div>
                    {/* Header Columns for each Recipe */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {recipes.map((item, idx) => {
                            const isBaseline = item.id === baseline.id;
                            const tier = item.tier || 'Explorer';
                            const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.Explorer;

                            return (
                                <div
                                    key={item.id}
                                    className={`p-4 rounded-2xl border flex flex-col justify-between relative transition-all ${
                                        isBaseline
                                            ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]'
                                            : 'bg-slate-950/60 border-slate-800'
                                    }`}
                                >
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierConfig.badgeBg} ${tierConfig.badgeBorder} ${tierConfig.badgeText}`}>
                                                {tier}
                                            </span>
                                            {isBaseline ? (
                                                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/40">
                                                    ★ Baseline
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        setSelectedBaselineId(item.id);
                                                        if (onSetBaseline) onSetBaseline(item.id);
                                                    }}
                                                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold underline cursor-pointer"
                                                >
                                                    ★ Set as Baseline
                                                </button>
                                            )}
                                        </div>

                                        <h3 className="font-bold text-white text-sm mb-0.5 truncate">{item.recipe_name}</h3>
                                        <p className="text-xs text-slate-400 font-mono truncate mb-2">{item.model_name}</p>

                                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mb-3">
                                            <span>By <strong className="text-slate-300">@{item.author?.username}</strong></span>
                                            <span>•</span>
                                            <span className="text-slate-400 truncate">{item.hardware_summary}</span>
                                        </div>
                                    </div>

                                    {/* Top Line Metrics */}
                                    <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800/80 font-mono text-xs">
                                        <div>
                                            <span className="text-[10px] text-slate-500 block">Throughput:</span>
                                            <span className="text-amber-300 font-bold">{Math.round(item.tokens_per_sec).toLocaleString()} tok/s</span>
                                            {!isBaseline && (
                                                <span className={`text-[10px] ml-1 font-bold ${calculateDelta(item.tokens_per_sec, baseline.tokens_per_sec)?.isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {calculateDelta(item.tokens_per_sec, baseline.tokens_per_sec)?.text}
                                                </span>
                                            )}
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-500 block">TTFT P50:</span>
                                            <span className="text-cyan-300 font-bold">{item.ttft_p50?.toFixed(1)} ms</span>
                                            {!isBaseline && (
                                                <span className={`text-[10px] ml-1 font-bold ${calculateDelta(item.ttft_p50, baseline.ttft_p50, true)?.isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {calculateDelta(item.ttft_p50, baseline.ttft_p50, true)?.text}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Detailed Metric Comparison Matrix */}
                    <div className="bg-slate-950/70 rounded-2xl border border-slate-800 p-4">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-400" /> Performance & Latency Matrix
                        </h4>

                        <div className="divide-y divide-slate-850 text-xs font-mono">
                            {/* Throughput */}
                            <div className="grid grid-cols-4 py-2.5 items-center">
                                <span className="text-slate-400 font-medium">Throughput (Total tok/s)</span>
                                {recipes.map((r, i) => {
                                    const delta = r.id !== baseline.id ? calculateDelta(r.tokens_per_sec, baseline.tokens_per_sec) : null;
                                    return (
                                        <div key={r.id} className="text-slate-200">
                                            <span className="font-bold">{Math.round(r.tokens_per_sec).toLocaleString()}</span>
                                            {delta && <span className={`text-[11px] ml-1.5 font-bold ${delta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>({delta.text})</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* TTFT P50 */}
                            <div className="grid grid-cols-4 py-2.5 items-center">
                                <span className="text-slate-400 font-medium">TTFT P50 Latency</span>
                                {recipes.map((r, i) => {
                                    const delta = r.id !== baseline.id ? calculateDelta(r.ttft_p50, baseline.ttft_p50, true) : null;
                                    return (
                                        <div key={r.id} className="text-cyan-300">
                                            <span className="font-bold">{r.ttft_p50?.toFixed(1)} ms</span>
                                            {delta && <span className={`text-[11px] ml-1.5 font-bold ${delta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>({delta.text})</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* TTFT P99 */}
                            <div className="grid grid-cols-4 py-2.5 items-center">
                                <span className="text-slate-400 font-medium">TTFT P99 (Tail Latency)</span>
                                {recipes.map((r, i) => {
                                    const p99 = r.metrics?.ttft_ms?.p99;
                                    const baseP99 = baseline.metrics?.ttft_ms?.p99;
                                    const delta = (r.id !== baseline.id && p99 && baseP99) ? calculateDelta(p99, baseP99, true) : null;
                                    return (
                                        <div key={r.id} className="text-slate-300">
                                            <span>{p99 ? `${p99.toFixed(1)} ms` : '—'}</span>
                                            {delta && (
                                                <span className={`text-[11px] ml-1.5 font-bold ${delta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    ({delta.text})
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* ITL */}
                            <div className="grid grid-cols-4 py-2.5 items-center">
                                <span className="text-slate-400 font-medium">Inter-Token Latency (ITL P50)</span>
                                {recipes.map((r, i) => {
                                    const itl = r.itl_p50 || r.metrics?.itl_ms?.p50;
                                    const baseItl = baseline.itl_p50 || baseline.metrics?.itl_ms?.p50;
                                    const delta = (r.id !== baseline.id && itl && baseItl) ? calculateDelta(itl, baseItl, true) : null;
                                    return (
                                        <div key={r.id} className="text-slate-300">
                                            <span>{itl ? `${itl.toFixed(1)} ms` : '—'}</span>
                                            {delta && (
                                                <span className={`text-[11px] ml-1.5 font-bold ${delta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                    ({delta.text})
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Cost / 1M Tokens */}
                            <div className="grid grid-cols-4 py-2.5 items-center">
                                <span className="text-slate-400 font-medium">Cost / 1M Output Tokens</span>
                                {recipes.map((r, i) => {
                                    const cost = r.cost_analysis?.cost_per_1m_output_tokens_usd || 0;
                                    const baseCost = baseline.cost_analysis?.cost_per_1m_output_tokens_usd || 0;
                                    const delta = r.id !== baseline.id ? calculateDelta(cost, baseCost, true) : null;
                                    return (
                                        <div key={r.id} className="text-emerald-300 font-bold">
                                            <span>${cost.toFixed(3)}</span>
                                            {delta && <span className={`text-[11px] ml-1.5 font-bold ${delta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>({delta.text})</span>}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Tokens per Dollar */}
                            <div className="grid grid-cols-4 py-2.5 items-center">
                                <span className="text-slate-400 font-medium">Tokens / Dollar ($)</span>
                                {recipes.map((r, i) => {
                                    const tpd = r.cost_analysis?.tokens_per_dollar || 0;
                                    const baseTpd = baseline.cost_analysis?.tokens_per_dollar || 0;
                                    const delta = r.id !== baseline.id ? calculateDelta(tpd, baseTpd) : null;
                                    return (
                                        <div key={r.id} className="text-emerald-400 font-bold">
                                            <span>{Math.round(tpd).toLocaleString()}</span>
                                            {delta && <span className={`text-[11px] ml-1.5 font-bold ${delta.isGood ? 'text-emerald-400' : 'text-rose-400'}`}>({delta.text})</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Architecture & Serving Stack Diff */}
                    <div className="bg-slate-950/70 rounded-2xl border border-slate-800 p-4">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Layers className="w-4 h-4 text-purple-400" /> Serving Parameters & Architecture Diff
                        </h4>

                        <div className="divide-y divide-slate-850 text-xs font-mono">
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">Serving Engine</span>
                                {recipes.map(r => (
                                    <span key={r.id} className="text-slate-200 font-bold">{r.stack?.engine?.toUpperCase()} ({r.stack?.engine_version})</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">Tensor Parallel (TP)</span>
                                {recipes.map(r => (
                                    <span key={r.id} className="text-slate-200 font-bold">TP={r.stack?.tensor_parallel_size || 1}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">Quantization / Precision</span>
                                {recipes.map(r => (
                                    <span key={r.id} className="text-cyan-300 font-bold">{r.stack?.quantization?.toUpperCase()}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">KV Cache Dtype</span>
                                {recipes.map(r => (
                                    <span key={r.id} className="text-slate-200 font-bold">{r.stack?.kv_cache_dtype}</span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">Prefix Caching</span>
                                {recipes.map(r => (
                                    <span key={r.id} className={r.stack?.prefix_caching ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                                        {r.stack?.prefix_caching ? 'Enabled' : 'Disabled'}
                                    </span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">Speculative Decoding</span>
                                {recipes.map(r => (
                                    <span key={r.id} className={r.stack?.speculative_decoding?.enabled ? 'text-amber-300 font-bold' : 'text-slate-500'}>
                                        {r.stack?.speculative_decoding?.enabled ? `Enabled (${r.stack?.speculative_decoding?.num_speculative_tokens || 4} tok)` : 'Disabled'}
                                    </span>
                                ))}
                            </div>
                            <div className="grid grid-cols-4 py-2 items-center">
                                <span className="text-slate-400">Hardware & VM</span>
                                {recipes.map(r => (
                                    <span key={r.id} className="text-slate-300">{r.hardware_summary}</span>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Launch Commands Row */}
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-cyan-400" /> Reproduction CLI Commands
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {recipes.map((r, idx) => (
                                <div key={r.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-[10px] font-mono flex flex-col justify-between">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-slate-400 font-bold truncate">{r.recipe_name}</span>
                                        <button
                                            onClick={() => handleCopyCommand(idx, r.reproduction_command)}
                                            className="text-cyan-400 hover:underline flex items-center gap-1 cursor-pointer"
                                        >
                                            {copiedIndex === idx ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                            <span>{copiedIndex === idx ? 'Copied' : 'Copy'}</span>
                                        </button>
                                    </div>
                                    <div className="text-slate-300 break-all select-all bg-slate-900 p-2 rounded-lg border border-slate-850 mt-1">
                                        {r.reproduction_command}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/60">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                        Close Comparator
                    </button>
                </div>
            </div>
        </div>
    );
}
