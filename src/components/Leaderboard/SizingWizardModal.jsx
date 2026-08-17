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
import { X, Sparkles, Target, Zap, DollarSign, Layers, Cpu, CheckCircle2, ArrowRight, Star, ShieldCheck, Filter } from 'lucide-react';
import { TIER_CONFIG } from '../../utils/gamificationEngine.js';

export default function SizingWizardModal({
    isOpen,
    onClose,
    dataset = [],
    onSelectRecipe,
    onOpenCertificate,
    onApplyConstraints
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Wizard input constraints
    const [targetConcurrency, setTargetConcurrency] = useState(32);
    const [maxTtftSla, setMaxTtftSla] = useState(35);
    const [contextPreset, setContextPreset] = useState('chat'); // 'chat' | 'code' | 'reasoning'
    const [maxBudgetHourly, setMaxBudgetHourly] = useState(30);

    // Matching logic
    const matchingRecipes = useMemo(() => {
        return (dataset || []).filter(item => {
            // SLA check (TTFT P50 <= target)
            const ttft = item.ttft_p50 || 999;
            if (ttft > maxTtftSla) return false;

            // Budget check
            const hourlyRate = item.cost_analysis?.hourly_rate_usd || 999;
            if (hourlyRate > maxBudgetHourly) return false;

            // Context suitability
            if (contextPreset === 'reasoning') {
                const outLen = item.workload?.output_tokens || 512;
                if (outLen < 1024) return false;
            }

            return true;
        }).sort((a, b) => {
            // Rank primarily by lowest cost per 1M tokens, with Pareto as tiebreaker
            if (a.isParetoOptimal && !b.isParetoOptimal) return -1;
            if (!a.isParetoOptimal && b.isParetoOptimal) return 1;
            const costA = a.cost_analysis?.cost_per_1m_output_tokens_usd || 999;
            const costB = b.cost_analysis?.cost_per_1m_output_tokens_usd || 999;
            return costA - costB;
        });
    }, [dataset, maxTtftSla, maxBudgetHourly, contextPreset]);

    const bestValueMatch = matchingRecipes[0] || null;
    const lowestLatencyMatch = useMemo(() => {
        if (matchingRecipes.length === 0) return null;
        return [...matchingRecipes].sort((a, b) => (a.ttft_p50 || 999) - (b.ttft_p50 || 999))[0];
    }, [matchingRecipes]);

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl relative text-slate-200 overflow-hidden">
                {/* Header */}
                <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500/20 to-yellow-500/20 text-amber-400 border border-amber-500/30">
                            <Target className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                SLA & Workload Sizing Wizard
                                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                    Solutions Architect Tool
                                </span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Inverse-lookup mathematically optimal serving architectures matching customer latency SLAs and budgets.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Main Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Constraints Inputs Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-950/80 p-4 rounded-2xl border border-slate-800 text-xs">
                        {/* Concurrency */}
                        <div>
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Target Concurrency
                            </label>
                            <select
                                value={targetConcurrency}
                                onChange={(e) => setTargetConcurrency(Number(e.target.value))}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-cyan-500 font-mono"
                            >
                                <option value={16}>16 Concurrent Users</option>
                                <option value={32}>32 Concurrent Users</option>
                                <option value={64}>64 Concurrent Users</option>
                                <option value={128}>128 Concurrent Users</option>
                            </select>
                        </div>

                        {/* Max TTFT SLA */}
                        <div>
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                                <span>Max TTFT SLA</span>
                                <span className="font-mono text-cyan-300 font-bold">&le; {maxTtftSla} ms</span>
                            </label>
                            <input
                                type="range"
                                min="15"
                                max="75"
                                step="5"
                                value={maxTtftSla}
                                onChange={(e) => setMaxTtftSla(Number(e.target.value))}
                                className="w-full mt-2 accent-cyan-400 cursor-pointer"
                            />
                        </div>

                        {/* Workload Context */}
                        <div>
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                                Context Profile
                            </label>
                            <select
                                value={contextPreset}
                                onChange={(e) => setContextPreset(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-700 text-white rounded-xl px-3 py-2 focus:outline-none focus:border-purple-500 font-mono"
                            >
                                <option value="chat">Chat (1k In / 512 Out)</option>
                                <option value="code">Code (2k In / 1k Out)</option>
                                <option value="reasoning">Deep Reasoning (2k In / 2k Out)</option>
                            </select>
                        </div>

                        {/* Max Hourly Budget */}
                        <div>
                            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                                <span>Max Cluster Budget</span>
                                <span className="font-mono text-emerald-300 font-bold">&le; ${maxBudgetHourly}/hr</span>
                            </label>
                            <input
                                type="range"
                                min="5"
                                max="60"
                                step="5"
                                value={maxBudgetHourly}
                                onChange={(e) => setMaxBudgetHourly(Number(e.target.value))}
                                className="w-full mt-2 accent-emerald-400 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Results Overview */}
                    <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-400">
                            Found <strong className="text-white font-mono">{matchingRecipes.length}</strong> qualifying recipe architectures meeting strict SLA constraints:
                        </div>
                    </div>

                    {/* Highlighted Recommendation Cards */}
                    {bestValueMatch && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* #1 Best Value Match */}
                            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border border-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.15)] flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-400/40">
                                            <Star className="w-3 h-3 fill-emerald-400" /> #1 Best Cost/Performance Match
                                        </span>
                                        <span className="text-xs font-mono font-bold text-emerald-400">
                                            ${bestValueMatch.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3)} / 1M Tok
                                        </span>
                                    </div>

                                    <h3 className="font-bold text-white text-base truncate">{bestValueMatch.recipe_name}</h3>
                                    <p className="text-xs text-slate-400 font-mono truncate">{bestValueMatch.model_name}</p>

                                    <div className="grid grid-cols-3 gap-2 mt-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-center">
                                        <div>
                                            <span className="text-[10px] text-slate-500 block">TTFT P50</span>
                                            <span className="text-cyan-300 font-bold">{bestValueMatch.ttft_p50?.toFixed(1)} ms</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-500 block">Throughput</span>
                                            <span className="text-amber-300 font-bold">{Math.round(bestValueMatch.tokens_per_sec).toLocaleString()} tok/s</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-slate-500 block">Cluster Rate</span>
                                            <span className="text-slate-200 font-bold">${bestValueMatch.cost_analysis?.hourly_rate_usd?.toFixed(2)}/hr</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800 text-xs">
                                    <span className="text-[11px] text-slate-400 font-mono">{bestValueMatch.hardware_summary}</span>
                                    <div className="flex items-center gap-2">
                                        {onApplyConstraints && (
                                            <button
                                                onClick={() => {
                                                    onApplyConstraints({
                                                        model: bestValueMatch.model_family,
                                                        hardware: bestValueMatch.hardware?.accelerator_type,
                                                        recipe: bestValueMatch
                                                    });
                                                    onClose();
                                                }}
                                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                                                title="Filter dashboard to match this configuration profile"
                                            >
                                                <Filter className="w-3 h-3 text-cyan-400" />
                                                <span>Filter Board</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => {
                                                if (onSelectRecipe) onSelectRecipe(bestValueMatch);
                                                onClose();
                                            }}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all"
                                        >
                                            <span>Inspect</span>
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Lowest Latency Match */}
                            {lowestLatencyMatch && (
                                <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900 to-slate-950 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)] flex flex-col justify-between">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold border border-cyan-400/40">
                                                <Zap className="w-3 h-3" /> Fastest Interactive Latency
                                            </span>
                                            <span className="text-xs font-mono font-bold text-cyan-300">
                                                {lowestLatencyMatch.ttft_p50?.toFixed(1)} ms TTFT
                                            </span>
                                        </div>

                                        <h3 className="font-bold text-white text-base truncate">{lowestLatencyMatch.recipe_name}</h3>
                                        <p className="text-xs text-slate-400 font-mono truncate">{lowestLatencyMatch.model_name}</p>

                                        <div className="grid grid-cols-3 gap-2 mt-3 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 font-mono text-xs text-center">
                                            <div>
                                                <span className="text-[10px] text-slate-500 block">TTFT P50</span>
                                                <span className="text-cyan-300 font-bold">{lowestLatencyMatch.ttft_p50?.toFixed(1)} ms</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-slate-500 block">Throughput</span>
                                                <span className="text-amber-300 font-bold">{Math.round(lowestLatencyMatch.tokens_per_sec).toLocaleString()} tok/s</span>
                                            </div>
                                            <div>
                                                <span className="text-[10px] text-slate-500 block">Cost / 1M</span>
                                                <span className="text-emerald-300 font-bold">${lowestLatencyMatch.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3)}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-slate-800 text-xs">
                                        <span className="text-[11px] text-slate-400 font-mono">{lowestLatencyMatch.hardware_summary}</span>
                                        <div className="flex items-center gap-2">
                                            {onApplyConstraints && (
                                                <button
                                                    onClick={() => {
                                                        onApplyConstraints({
                                                            model: lowestLatencyMatch.model_family,
                                                            hardware: lowestLatencyMatch.hardware?.accelerator_type,
                                                            recipe: lowestLatencyMatch
                                                        });
                                                        onClose();
                                                    }}
                                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition-all cursor-pointer"
                                                    title="Filter dashboard to match this configuration profile"
                                                >
                                                    <Filter className="w-3 h-3 text-cyan-400" />
                                                    <span>Filter Board</span>
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    if (onSelectRecipe) onSelectRecipe(lowestLatencyMatch);
                                                    onClose();
                                                }}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)] transition-all"
                                            >
                                                <span>Inspect</span>
                                                <ArrowRight className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Ranked Table of all Matches */}
                    <div className="bg-slate-950/60 rounded-2xl border border-slate-800 overflow-hidden">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider bg-slate-950/80">
                                    <th className="py-2.5 px-3">Recipe & Model</th>
                                    <th className="py-2.5 px-3">Hardware & Stack</th>
                                    <th className="py-2.5 px-3 text-right">TTFT P50</th>
                                    <th className="py-2.5 px-3 text-right">Throughput</th>
                                    <th className="py-2.5 px-3 text-right">$/1M Output</th>
                                    <th className="py-2.5 px-3 text-right">Cluster $/hr</th>
                                    <th className="py-2.5 px-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-850 text-slate-300 font-mono">
                                {matchingRecipes.map((item, idx) => (
                                    <tr key={item.id} className="hover:bg-slate-850/50 transition-colors">
                                        <td className="py-2.5 px-3 font-sans font-medium text-white">
                                            <div className="truncate max-w-[200px]">{item.recipe_name}</div>
                                            <div className="text-[10px] text-slate-500 truncate">{item.model_name}</div>
                                        </td>
                                        <td className="py-2.5 px-3 font-sans text-xs">
                                            <div className="text-slate-300 font-mono">{item.hardware_summary}</div>
                                            <div className="text-[10px] text-cyan-400">{item.stack?.engine?.toUpperCase()} (TP={item.stack?.tensor_parallel_size})</div>
                                        </td>
                                        <td className="py-2.5 px-3 text-right text-cyan-300 font-bold">
                                            {item.ttft_p50?.toFixed(1)} ms
                                        </td>
                                        <td className="py-2.5 px-3 text-right text-white">
                                            {Math.round(item.tokens_per_sec).toLocaleString()} tok/s
                                        </td>
                                        <td className="py-2.5 px-3 text-right text-emerald-300 font-bold">
                                            ${item.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right text-slate-300">
                                            ${item.cost_analysis?.hourly_rate_usd?.toFixed(2)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right">
                                            <button
                                                onClick={() => {
                                                    if (onSelectRecipe) onSelectRecipe(item);
                                                    onClose();
                                                }}
                                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-sans font-medium cursor-pointer"
                                            >
                                                Inspect
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-800 flex justify-end bg-slate-950/60">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs transition-colors cursor-pointer"
                    >
                        Close Wizard
                    </button>
                </div>
            </div>
        </div>
    );
}
