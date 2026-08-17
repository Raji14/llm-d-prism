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
import { Trophy, Zap, DollarSign, Award, Flame, Sparkles, Server, Cpu, Layers } from 'lucide-react';
import { Button } from '../ui/Button.jsx';

export default function LeaderboardSummaryCards({ dataset, onOpenBounties, onSelectRecipe }) {
    if (!dataset || dataset.length === 0) return null;

    // Compute top KPIs
    const sotaThroughput = dataset.reduce((max, cur) =>
        (cur.tokens_per_sec > (max?.tokens_per_sec || 0)) ? cur : max, dataset[0]);

    const lowestLatency = dataset.reduce((min, cur) =>
        (cur.ttft_p50 < (min?.ttft_p50 || 9999)) ? cur : min, dataset[0]);

    const bestValue = dataset.reduce((max, cur) =>
        ((cur.cost_analysis?.tokens_per_dollar || 0) > (max?.cost_analysis?.tokens_per_dollar || 0)) ? cur : max, dataset[0]);

    const paretoCount = dataset.filter(d => d.isParetoOptimal).length;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-6">
            {/* CARD 1: Benchmark Scenario / Top SOTA Recipe Spec (6 cols) */}
            <div
                onClick={() => onSelectRecipe && onSelectRecipe(sotaThroughput)}
                className="lg:col-span-6 border border-slate-800/80 rounded-xl bg-gradient-to-br from-slate-900 to-slate-950 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden cursor-pointer group hover:border-emerald-500/30 transition-all"
            >
                <div className="absolute -top-12 -left-12 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none" />

                <div className="mb-3 flex items-center justify-between">
                    <span className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest block">
                        #1 SOTA Benchmark Scenario
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        👑 Grandmaster
                    </span>
                </div>

                <div className="grid grid-cols-3 gap-4">
                    {/* Column 1: Infra Layer */}
                    <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            Infra Layer
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Machine Type</span>
                                <div className="flex items-center gap-1.5 font-mono font-bold text-white text-xs">
                                    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                    {sotaThroughput?.hardware?.machine_type || 'a3-highgpu-8g'}
                                </div>
                            </div>
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Accelerator</span>
                                <span className="font-mono font-bold text-white truncate block text-xs">{sotaThroughput?.hardware_summary}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Cluster Hourly</span>
                                <span className="font-mono font-bold text-emerald-400 truncate block text-xs">${sotaThroughput?.cost_analysis?.hourly_rate_usd?.toFixed(2)}/hr</span>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Model Serving Layer */}
                    <div className="flex flex-col gap-3 border-r border-slate-800/60 pr-4">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            Serving Layer
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Model Name</span>
                                <span className="font-mono font-bold text-white truncate block text-xs">{sotaThroughput?.model_family || 'Llama 3.1 70B'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Parallelism</span>
                                <span className="font-mono font-bold text-white truncate block text-xs">TP: {sotaThroughput?.stack?.tensor_parallel_size || 8} ({sotaThroughput?.stack?.quantization?.toUpperCase() || 'FP8'})</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Engine</span>
                                <span className="font-mono font-bold text-cyan-400 truncate block text-xs">{sotaThroughput?.stack?.engine?.toUpperCase()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Column 3: Workload */}
                    <div className="flex flex-col gap-3">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            Workload Trace
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Dataset</span>
                                <span className="font-mono font-bold text-white truncate block text-xs">{sotaThroughput?.workload?.dataset_name || 'ShareGPT Multi-Turn'}</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">Concurrency</span>
                                <span className="font-mono font-bold text-white truncate block text-xs">{sotaThroughput?.workload?.concurrency || 64} Users</span>
                            </div>
                            <div>
                                <span className="block text-[10px] text-slate-500 font-semibold mb-0.5">In / Out Length</span>
                                <span className="font-mono font-bold text-white truncate block text-xs">{sotaThroughput?.workload?.input_tokens || 1024} / {sotaThroughput?.workload?.output_tokens || 512}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CARD 2: Primary Outcomes Metric (3 cols) */}
            <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-emerald-500/30 transition-all">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-emerald-500/10" />
                <div>
                    <div className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-3 flex justify-between items-center">
                        Primary Outcomes
                        <span className="text-[10px] text-slate-400 font-mono">
                            {paretoCount} Pareto Records
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {/* TTFT Stat Box */}
                        <div
                            onClick={() => onSelectRecipe && onSelectRecipe(lowestLatency)}
                            className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-1.5 hover:border-emerald-500/20 transition-all grid grid-rows-[55px_1fr] h-[140px] cursor-pointer"
                        >
                            <div className="flex flex-col justify-start">
                                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                                    Lowest Latency
                                </h3>
                                <div className="text-[10px] text-slate-400 font-normal uppercase">
                                    (TTFT P50)
                                </div>
                            </div>
                            <div className="flex items-center justify-center">
                                <h4 className="text-3xl font-black text-emerald-400 flex items-baseline tracking-tight">
                                    {lowestLatency?.ttft_p50 ? `${lowestLatency.ttft_p50.toFixed(1)}ms` : '18.2ms'}
                                </h4>
                            </div>
                        </div>

                        {/* Throughput Stat Box */}
                        <div
                            onClick={() => onSelectRecipe && onSelectRecipe(sotaThroughput)}
                            className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-1.5 hover:border-cyan-500/20 transition-all grid grid-rows-[55px_1fr] h-[140px] cursor-pointer"
                        >
                            <div className="flex flex-col justify-start">
                                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                                    Peak Throughput
                                </h3>
                                <div className="text-[10px] text-slate-400 font-normal uppercase">
                                    (Output tok/s)
                                </div>
                            </div>
                            <div className="flex items-center justify-center">
                                <h4 className="text-3xl font-black text-cyan-400 flex items-baseline tracking-tight">
                                    {sotaThroughput?.tokens_per_sec ? `${(sotaThroughput.tokens_per_sec / 1000).toFixed(1)}k` : '4.8k'}
                                </h4>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* CARD 3: Price / Performance SOTA (3 cols) */}
            <div className="lg:col-span-3 border border-slate-800 rounded-xl bg-slate-900 p-4 flex flex-col justify-between shadow-lg relative overflow-hidden group hover:border-purple-500/30 transition-all">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl pointer-events-none transition-all group-hover:bg-purple-500/10" />
                <div>
                    <div className="text-[11px] font-extrabold text-emerald-400/90 uppercase tracking-widest mb-3 flex justify-between items-center">
                        Price / Performance SOTA
                        <span className="text-[10px] text-purple-300 font-mono">
                            GCP Pricing
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        {/* Cost Crusher $/1M Stat Box */}
                        <div
                            onClick={() => onSelectRecipe && onSelectRecipe(bestValue)}
                            className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-1.5 hover:border-emerald-500/20 transition-all grid grid-rows-[55px_1fr] h-[140px] cursor-pointer"
                        >
                            <div className="flex flex-col justify-start">
                                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                                    Lowest Cost
                                </h3>
                                <div className="text-[10px] text-slate-400 font-normal uppercase">
                                    ($ / 1M Out Tok)
                                </div>
                            </div>
                            <div className="flex items-center justify-center">
                                <h4 className="text-3xl font-black text-emerald-400 flex items-baseline tracking-tight">
                                    ${bestValue?.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(2) || '0.12'}
                                </h4>
                            </div>
                        </div>

                        {/* Tokens Per Dollar Stat Box */}
                        <div
                            onClick={() => onSelectRecipe && onSelectRecipe(bestValue)}
                            className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-1.5 hover:border-purple-500/20 transition-all grid grid-rows-[55px_1fr] h-[140px] cursor-pointer"
                        >
                            <div className="flex flex-col justify-start">
                                <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-0.5">
                                    Best Value
                                </h3>
                                <div className="text-[10px] text-slate-400 font-normal uppercase">
                                    (Tokens / $)
                                </div>
                            </div>
                            <div className="flex items-center justify-center">
                                <h4 className="text-3xl font-black text-purple-300 flex items-baseline tracking-tight">
                                    {bestValue?.cost_analysis?.tokens_per_dollar ? `${Math.round(bestValue.cost_analysis.tokens_per_dollar / 1000)}k` : '184k'}
                                </h4>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
