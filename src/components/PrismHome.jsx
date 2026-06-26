import React, { useState } from 'react';
import { Activity, Zap, BarChart2, ArrowRight, Server, Cpu, CheckCircle, Shield, TrendingUp, HelpCircle, FileCode, Link, Database, Upload, Sliders, Layers, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

const PrismHome = ({ onNavigate }) => {
    const [isComingSoonExpanded, setIsComingSoonExpanded] = useState(false);
    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-emerald-600/15 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            <div className="max-w-6xl w-full z-10 flex flex-col items-center">
                {/* Hero Header */}
                <header className="mb-10 text-center relative pt-6 flex flex-col items-center">
                    <div className="flex items-center justify-center mb-2 space-x-3">
                        <a href="https://llm-d.ai" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-9 object-contain" />
                        </a>
                        <a href="https://github.com/llm-d/llm-d-prism" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                                Prism
                            </h1>
                        </a>
                    </div>
                    <p className="text-xl text-slate-400 max-w-3xl leading-relaxed font-light tracking-wide mb-4">
                        Performance analysis for distributed inference systems and agentic workflows
                    </p>
                </header>




                {/* Results Store landing Front Door */}
                <section className="mb-16 w-full max-w-5xl bg-slate-900/15 border border-slate-900 rounded-2xl relative overflow-hidden backdrop-blur-xl shadow-2xl">
                    {/* Grid mesh backdrop decorative lines */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1.5px,transparent_1.5px),linear-gradient(to_bottom,#1e293b_1.5px,transparent_1.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="relative p-6 md:p-8 z-10">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                            <div>
                                <div className="flex items-center gap-2.5 mb-1.5">
                                    <Database className="h-5 w-5 text-cyan-400" />
                                    <h2 className="text-lg font-bold tracking-wider text-white uppercase font-mono">Results Store</h2>
                                </div>
                                <p className="text-[12px] text-slate-400 max-w-xl leading-relaxed">
                                    The open-source repository for system and workload telemetry. Compare, validate, and reproduce distributed inference performance benchmark reports.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[9px] text-slate-400 border border-slate-800/80 px-2.5 py-1 rounded bg-slate-950/40 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Schema Sync (v0.2)
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {/* Action 1: Browse Results */}
                            <div 
                                onClick={() => onNavigate('benchmark-browser')}
                                className="bg-gradient-to-b from-slate-950/40 to-slate-950/80 p-5 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-slate-800/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(6,182,212,0.06)] relative overflow-hidden h-full min-h-[300px]"
                            >
                                <div>
                                    {/* Tech Illustration */}
                                    <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900/80 overflow-hidden flex items-center justify-center group-hover:border-cyan-500/10 transition-colors">
                                        <div className="absolute inset-0 bg-[linear-gradient(to_right,#090d16_1px,transparent_1px),linear-gradient(to_bottom,#090d16_1px,transparent_1px)] bg-[size:10px_10px]" />
                                        <svg className="w-full h-full p-4 relative z-10" viewBox="0 0 200 80" fill="none">
                                            <line x1="15" y1="10" x2="15" y2="70" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
                                            <line x1="15" y1="70" x2="185" y2="70" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
                                            <path d="M15 65 Q 50 30, 80 50 T 140 25 T 185 15" stroke="rgba(34, 211, 238, 0.08)" strokeWidth="6" strokeLinecap="round" fill="none" />
                                            <path 
                                                d="M15 65 Q 50 30, 80 50 T 140 25 T 185 15" 
                                                stroke="url(#chart-cyan-grad)" 
                                                strokeWidth="1.5" 
                                                strokeLinecap="round" 
                                                fill="none"
                                            />
                                            <circle cx="80" cy="50" r="3" fill="#22d3ee" className="animate-ping opacity-60" />
                                            <circle cx="80" cy="50" r="1.5" fill="#22d3ee" />
                                            <circle cx="140" cy="25" r="3" fill="#06b6d4" className="animate-ping opacity-60" style={{ animationDelay: '0.4s' }} />
                                            <circle cx="140" cy="25" r="1.5" fill="#06b6d4" />
                                            <defs>
                                                <linearGradient id="chart-cyan-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#0891b2" />
                                                    <stop offset="50%" stopColor="#22d3ee" />
                                                    <stop offset="100%" stopColor="#6366f1" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2 text-slate-200 group-hover:text-cyan-400 transition-colors">
                                        <BarChart2 className="h-4 w-4" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Browse Results</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-relaxed mb-4">
                                        Analyze live benchmark runs. Filter by hardware (H100, L4), TPU topology, model servers, and workload context.
                                    </p>
                                </div>
                                <div className="text-[10px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 uppercase tracking-wider font-mono mt-auto">
                                    Open Browser <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>

                            {/* Action 2: Add/Submit */}
                            <div 
                                onClick={() => onNavigate('manage-benchmarks')}
                                className="bg-gradient-to-b from-slate-950/40 to-slate-950/80 p-5 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-slate-800/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(6,182,212,0.06)] relative overflow-hidden h-full min-h-[300px]"
                            >
                                <div>
                                    {/* Tech Illustration */}
                                    <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900/80 overflow-hidden flex items-center justify-center group-hover:border-blue-500/10 transition-colors">
                                        <div className="absolute inset-0 bg-[radial-gradient(#0c1322_1px,transparent_1px)] bg-[size:8px_8px]" />
                                        <svg className="w-full h-full p-4 relative z-10" viewBox="0 0 200 80" fill="none">
                                            <rect x="65" y="45" width="70" height="20" rx="3" fill="#0b0f19" stroke="#1e293b" strokeWidth="1" />
                                            <line x1="72" y1="51" x2="82" y2="51" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round" />
                                            <line x1="72" y1="57" x2="95" y2="57" stroke="#334155" strokeWidth="1" strokeLinecap="round" />
                                            <circle cx="123" cy="55" r="1.5" fill="#10b981" />
                                            <circle cx="129" cy="55" r="1.5" fill="#6366f1" />
                                            <line x1="100" y1="45" x2="100" y2="18" stroke="url(#upload-beam-grad)" strokeWidth="1.5" strokeDasharray="3 3" />
                                            <path d="M94 24 L100 18 L106 24 M100 18 L100 32" stroke="#60a5fa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="animate-bounce" />
                                            <defs>
                                                <linearGradient id="upload-beam-grad" x1="0%" y1="100%" x2="0%" y2="0%">
                                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
                                                    <stop offset="100%" stopColor="#60a5fa" stopOpacity="0.8" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2 text-slate-200 group-hover:text-cyan-400 transition-colors">
                                        <Upload className="h-4.5 w-4.5" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Add Benchmark</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-relaxed mb-4">
                                        Onboard and submit run telemetries. Validates files against standard schemas before uploading to staging GCS bucket.
                                    </p>
                                </div>
                                <div className="text-[10px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 uppercase tracking-wider font-mono mt-auto">
                                    Submit Run <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>

                            {/* Action 3: Manage Submissions */}
                            <div 
                                onClick={() => onNavigate('manage-benchmarks')}
                                className="bg-gradient-to-b from-slate-950/40 to-slate-950/80 p-5 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-slate-800/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(6,182,212,0.06)] relative overflow-hidden h-full min-h-[300px]"
                            >
                                <div>
                                    {/* Tech Illustration */}
                                    <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900/80 overflow-hidden flex items-center justify-center group-hover:border-purple-500/10 transition-colors">
                                        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(168,85,247,0.01)_1px,transparent_1px)] bg-[size:100%_4px]" />
                                        <svg className="w-full h-full p-4 relative z-10" viewBox="0 0 200 80" fill="none">
                                            <line x1="45" y1="36" x2="100" y2="36" stroke="#1e293b" strokeWidth="1" />
                                            <line x1="100" y1="36" x2="155" y2="36" stroke="#1e293b" strokeWidth="1" />
                                            <circle cx="45" cy="36" r="6" fill="#111827" stroke="#4f46e5" strokeWidth="1" />
                                            <circle cx="45" cy="36" r="2.5" fill="#818cf8" />
                                            <circle cx="100" cy="36" r="9" fill="#1e152a" stroke="#a855f7" strokeWidth="1" />
                                            <circle cx="100" cy="36" r="3.5" fill="#c084fc" className="animate-pulse" />
                                            <circle cx="155" cy="36" r="6" fill="#111827" stroke="#059669" strokeWidth="1" />
                                            <circle cx="155" cy="36" r="2.5" fill="#34d399" />
                                            <text x="45" y="55" textAnchor="middle" fill="#475569" className="font-mono text-[6px] uppercase tracking-wider font-bold">Staged</text>
                                            <text x="100" y="58" textAnchor="middle" fill="#c084fc" className="font-mono text-[6.5px] uppercase tracking-wider font-bold">Review</text>
                                            <text x="155" y="55" textAnchor="middle" fill="#475569" className="font-mono text-[6px] uppercase tracking-wider font-bold">Public</text>
                                        </svg>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2 text-slate-200 group-hover:text-cyan-400 transition-colors">
                                        <Sliders className="h-4.5 w-4.5" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Manage Submissions</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-relaxed mb-4">
                                        Track compliance transitions. Monitor run submissions through Staged, Processing, Review, and Public states.
                                    </p>
                                </div>
                                <div className="text-[10px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 uppercase tracking-wider font-mono mt-auto">
                                    Track Progress <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Well-lit paths */}
                <section className="mb-20 w-full max-w-5xl">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                        Well-lit paths
                    </h2>
                    <p className="text-xs text-slate-500 leading-relaxed text-center mb-8">Live benchmarked serving configurations and architectural templates</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full items-stretch">
                        {/* Path 1: Inference scheduling */}
                        <div 
                            onClick={() => onNavigate('inference-scheduling')}
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/50 hover:border-cyan-500/30 h-full overflow-hidden"
                        >
                            <div>
                                <h3 className="text-xs xl:text-sm font-bold mb-1.5 text-white group-hover:text-cyan-400 transition-colors leading-tight uppercase font-mono tracking-wide">
                                    Intelligent routing
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2">
                                    <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Prefix-cache</span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Load balance</span>
                                </div>
                                <p className="text-slate-400 text-[10.5px] leading-relaxed mb-3">
                                    Optimize request routing to maximize performance. Leverage GKE Inference Gateway and cache introspection to reduce tail latency.
                                </p>
                                
                                {/* Visual Preview / Metrics */}
                                <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2.5 mb-3">
                                    <div className="space-y-0.5 mb-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">SLA compliance</span>
                                            <span className="text-cyan-400 font-mono font-bold">98.5%</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                             <span className="text-slate-400">Context scale</span>
                                             <span className="text-cyan-400 font-mono font-bold">163k Tok</span>
                                        </div>
                                    </div>
                                    {/* Monochromatic Preview Chart */}
                                    <div className="h-6 flex items-end justify-between space-x-0.5 border-b border-slate-700/30 pb-px">
                                        <div className="w-full bg-cyan-500 h-1.5 rounded-t-sm opacity-30"></div>
                                        <div className="w-full bg-cyan-500 h-3 rounded-t-sm opacity-50"></div>
                                        <div className="w-full bg-cyan-500 h-4.5 rounded-t-sm opacity-80"></div>
                                        <div className="w-full bg-cyan-500 h-3.5 rounded-t-sm opacity-60"></div>
                                        <div className="w-full bg-cyan-500 h-6 rounded-t-sm"></div>
                                    </div>
                                </div>
                            </div>
 
                            <div className="flex gap-2 mt-auto pt-2">
                                <button className="flex-1 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all">
                                    Launch <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onNavigate('workload-catalog'); }}
                                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 hover:text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors"
                                    title="View GKE config template to reproduce this optimized routing schema in your cluster"
                                >
                                    Reproduce This
                                </button>
                            </div>
                        </div>

                        {/* Path 2: Agentic Workloads */}
                        <div 
                            onClick={() => onNavigate('agentic-serving')}
                            className="group relative bg-slate-900/80 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,211,238,0.15)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/50 hover:border-cyan-500/30 h-full overflow-hidden"
                        >
                            <div>
                                <h3 className="text-xs xl:text-sm font-bold mb-1.5 text-white group-hover:text-cyan-400 transition-colors leading-tight uppercase font-mono tracking-wide">
                                    Agentic serving
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2">
                                    <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Multi-turn</span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded-full font-medium border border-cyan-500/20 whitespace-nowrap">Tool use</span>
                                </div>
                                <p className="text-slate-400 text-[10.5px] leading-relaxed mb-3">
                                    Optimize multi-turn conversations using prefix-aware routing, KV-offloading, and queue depth load balancing.
                                </p>
                                
                                {/* Visual Preview / Metrics */}
                                <div className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-2.5 mb-3">
                                    <div className="space-y-0.5 mb-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Workload</span>
                                            <span className="text-cyan-400 font-mono font-bold">Code Generation</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Num Turns</span>
                                            <span className="text-cyan-400 font-mono font-bold">230</span>
                                        </div>
                                    </div>
                                    <div className="h-6 flex items-end justify-between space-x-0.5 px-0.5 relative border-b border-slate-700/30 pb-px">
                                         <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-2/6 bg-cyan-500 h-4 rounded-t-sm relative opacity-90">
                                             <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-cyan-400 uppercase tracking-wide">Active</span>
                                         </div>
                                         <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-2/6 bg-cyan-500 h-4 rounded-t-sm opacity-90 relative">
                                             <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-cyan-400 uppercase tracking-wide">Offload</span>
                                         </div>
                                    </div>
                                </div>
                            </div>
 
                            <div className="flex gap-2 mt-auto pt-2">
                                <button className="flex-1 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all">
                                    Launch <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onNavigate('workload-catalog'); }}
                                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-750 hover:text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors"
                                    title="View GKE config template to reproduce this optimized routing schema in your cluster"
                                >
                                    Reproduce This
                                </button>
                            </div>
                        </div>

                        {/* Card 3: Consolidated Roadmap (Coming Soon Stack) */}
                        <div 
                            onClick={() => setIsComingSoonExpanded(!isComingSoonExpanded)}
                            className={`group relative bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-4 transition-all duration-305 cursor-pointer flex flex-col justify-between overflow-hidden ${
                                isComingSoonExpanded 
                                ? 'shadow-[0_0_30px_rgba(168,85,247,0.12)] border-purple-500/35 h-auto' 
                                : 'hover:border-purple-500/20 hover:shadow-[0_4px_20px_rgba(168,85,247,0.06)] h-full min-h-[280px]'
                            }`}
                        >
                            {/* Layered Cards background visual effect when collapsed */}
                            {!isComingSoonExpanded && (
                                <>
                                    <div className="absolute bottom-2 left-6 right-6 h-10 bg-slate-950 border border-slate-850 rounded-lg -z-10 translate-y-3 opacity-60 scale-95 transition-all duration-300 group-hover:translate-y-4" />
                                    <div className="absolute bottom-2 left-4 right-4 h-10 bg-slate-900 border border-slate-800 rounded-lg -z-10 translate-y-1.5 opacity-80 scale-98 transition-all duration-300 group-hover:translate-y-2" />
                                </>
                            )}

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <Layers className="h-4.5 w-4.5 text-purple-400" />
                                        <h3 className="text-xs xl:text-sm font-bold text-white group-hover:text-purple-400 transition-colors uppercase font-mono tracking-wide">Roadmap</h3>
                                    </div>
                                    <span className="text-[8.5px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 uppercase font-black tracking-wider">
                                        {isComingSoonExpanded ? 'Active Deck' : 'Expand (4 Items)'}
                                    </span>
                                </div>
                                <p className="text-slate-400 text-[10.5px] leading-relaxed mb-4">
                                    Upcoming performance optimizations and architectural templates on the Prism roadmap.
                                </p>

                                {isComingSoonExpanded ? (
                                    <div className="space-y-2.5 my-2 animate-fadeIn">
                                        {/* Roadmap Item 1 */}
                                        <div className="p-2 bg-slate-950/60 border border-slate-850 rounded-lg flex items-start gap-2.5">
                                            <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 mt-0.5">
                                                <Database className="w-3 h-3 text-emerald-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-bold text-slate-200">Prefix Cache Offloading</h4>
                                                <p className="text-[9.5px] text-slate-400 leading-tight">Tiered KV cache offloading to host CPU memory, expanding accelerator context capacity bounds.</p>
                                            </div>
                                        </div>

                                        {/* Roadmap Item 2 */}
                                        <div className="p-2 bg-slate-950/60 border border-slate-850 rounded-lg flex items-start gap-2.5">
                                            <div className="p-1 rounded bg-purple-500/10 border border-purple-500/20 mt-0.5">
                                                <Activity className="w-3 h-3 text-purple-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-bold text-slate-200">Prefill/Decode Disaggregation</h4>
                                                <p className="text-[9.5px] text-slate-400 leading-tight">Separating prefill and decode nodes to eliminate queue interference for multi-tenant pipelines.</p>
                                            </div>
                                        </div>

                                        {/* Roadmap Item 3 */}
                                        <div className="p-2 bg-slate-950/60 border border-slate-850 rounded-lg flex items-start gap-2.5">
                                            <div className="p-1 rounded bg-pink-500/10 border border-pink-500/20 mt-0.5">
                                                <Layers className="w-3 h-3 text-pink-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-bold text-slate-200">Wide Expert Parallelism</h4>
                                                <p className="text-[9.5px] text-slate-400 leading-tight">Scaling Mixture-of-Experts (MoE) workloads across large multi-node GPU clusters dynamically.</p>
                                            </div>
                                        </div>

                                        {/* Roadmap Item 4 */}
                                        <div className="p-2 bg-slate-950/60 border border-slate-850 rounded-lg flex items-start gap-2.5">
                                            <div className="p-1 rounded bg-cyan-500/10 border border-cyan-500/20 mt-0.5">
                                                <TrendingUp className="w-3 h-3 text-cyan-400" />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-bold text-slate-200">Value Analysis (Cost/TCO)</h4>
                                                <p className="text-[9.5px] text-slate-400 leading-tight">Dynamic cost vs. performance optimization reports, estimating dollar savings per Chip hour.</p>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 select-none mt-2 opacity-50">
                                        <div className="h-6.5 bg-slate-950 border border-slate-850 rounded-md" />
                                        <div className="h-6.5 bg-slate-950 border border-slate-850 rounded-md" />
                                    </div>
                                )}
                            </div>

                            <button className="w-full mt-3 py-1.5 bg-slate-850 hover:bg-slate-800 text-slate-300 rounded-lg font-medium text-[10px] flex items-center justify-center border border-slate-800 transition-colors">
                                {isComingSoonExpanded ? 'Collapse Deck' : 'Expand Roadmap Deck'}
                            </button>
                        </div>
                    </div>
                </section>
                

{/* Section: Utility Suite */}
                <section className="mb-20 w-full max-w-5xl">
                    <h2 className="text-2xl font-bold mb-2 text-center text-slate-100">
                          Utility suite
                    </h2>
                    <p className="text-xs text-slate-500 text-center mb-8 font-mono">Access specialized tools for deeper analysis and schema browsing.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* Card 1: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('benchmark-browser')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <BarChart2 className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-xs xl:text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors uppercase font-mono tracking-wide">Benchmark browser</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Browse and compare benchmark results across runs.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 2: Schema Explorer */}
                        <div 
                            onClick={() => onNavigate('schema-explorer')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <FileCode className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-xs xl:text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors uppercase font-mono tracking-wide">Schema explorer</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Explore data schemas and metric definitions.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 3: Workload Catalog */}
                        <div 
                            onClick={() => onNavigate('workload-catalog')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Zap className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-xs xl:text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors uppercase font-mono tracking-wide">Workload catalog</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Explore standardized workloads for evaluation.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 4: Regressions & Analysis */}
                        <div 
                            onClick={() => onNavigate('regressions-analysis')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Activity className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-xs xl:text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition-colors uppercase font-mono tracking-wide">Regressions & analysis</h3>
                                </div>
                                <p className="text-[10px] text-slate-400 mb-4">Track nightly benchmark runs and detect regressions across well-lit paths.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </section>
                



                {/* Section: How it works */}
                <section className="mb-20 w-full max-w-6xl mx-auto pl-20">
                     <h2 className="text-3xl font-bold mb-2 text-center text-slate-100">
                          How it works: the full benchmark lifecycle
                     </h2>
                     <p className="text-sm text-slate-400 text-center mb-12 max-w-2xl mx-auto">
                          Designed for human insight and agent automation. Standardizing the end-to-end lifecycle from routing optimization to high-fidelity reproduction.
                     </p>
                     
                     <div className="flex flex-col md:flex-row gap-4 justify-between items-center relative mb-6">
                         
                         {/* Ambient glowing background in center */}
                         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                         {/* Left Column: Roles & Actions */}
                         <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center md:items-end">
                             <div className="w-full max-w-[320px] text-center text-xs font-extrabold text-cyan-400/90 uppercase tracking-widest mb-2">User & agent roles</div>
                             
                             {/* Feature Developer */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Feature developer</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
                                     <div className="flex items-start gap-1">
                                         <span className="text-cyan-400">•</span>
                                         <span>Isolate component and system benchmarks.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-cyan-400">•</span>
                                         <span>Evaluate performance with established baselines.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-cyan-400">•</span>
                                         <span>Format results for publication and reproduction.</span>
                                     </div>
                                 </div>
                             </div>

                             {/* Benchmark Developer */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Benchmark developer</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
                                     <div className="flex items-start gap-1">
                                         <span className="text-cyan-400">•</span>
                                         <span>Publish reproducible workloads to the open catalog.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-cyan-400">•</span>
                                         <span>Configure cloud infrastructure for distributed testing.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-cyan-400">•</span>
                                         <span>Validate benchmark results for accuracy and correctness.</span>
                                     </div>
                                 </div>
                             </div>

                         </div>

                         {/* Center Column: Core Pipeline */}
                         <div className="w-full md:w-1/3 relative border-2 border-dashed border-slate-700 rounded-2xl p-4 bg-slate-900/50 backdrop-blur-xl flex flex-col items-center space-y-2 hover:border-blue-500/30 transition-all">
                             
                             {/* Prism */}
                             <div className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-purple-500/50 transition-all">
                                 <h4 className="text-sm font-bold text-purple-400 mb-0.5">Prism</h4>
                                 <p className="text-sm text-slate-400">Visualize and compare metrics across benchmarks.</p>
                             </div>

                             {/* Llm-d Results Store */}
                             <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-3 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-blue-500/50 transition-all">
                                 <h4 className="text-sm font-bold text-blue-400 mb-0.5">llm-d results store</h4>
                                 <p className="text-sm text-slate-400">Scalable OSS store for unified schema results.</p>
                             </div>

                             {/* Standard Benchmark Format / Report */}
                             <a 
                                 href="https://github.com/llm-d/llm-d-benchmark/blob/main/benchmark_report"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Standard benchmark report
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Unified JSON schema guarantees data interoperability.</p>
                             </a>

                             {/* Test Harness */}
                             <a 
                                 href="https://github.com/kubernetes-sigs/inference-perf/"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                             >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Test harness
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Stress distributed systems with agentic serving workloads.</p>
                             </a>

                             {/* Real World Workload Catalog */}
                             <a 
                                 href="https://github.com/kubernetes-sigs/inference-perf/tree/main/workload-catalog"
                                 target="_blank"
                                 rel="noopener noreferrer"
                                 className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                             >
                                 <h4 className="text-sm font-bold text-cyan-400 mb-0.5 flex items-center justify-center gap-1">
                                     Real world workload catalog
                                     <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                 </h4>
                                 <p className="text-sm text-slate-400">Access standardized workloads for evaluation.</p>
                             </a>

                         </div>

                         {/* Right Column: Roles & Actions */}
                         <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center lg:items-start">
                             <div className="w-full max-w-[320px] text-center text-xs font-extrabold text-purple-400/90 uppercase tracking-widest mb-2">User & agent roles</div>
                             
                             {/* Solutions Architect */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Solutions architect</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
                                     <div className="flex items-start gap-1">
                                         <span className="text-purple-400">•</span>
                                         <span>Analyze features for optimal architectural fit.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-purple-400">•</span>
                                         <span>Architect full stack distributed inference solutions.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-purple-400">•</span>
                                         <span>Fork and run new custom benchmarks dynamically.</span>
                                     </div>
                                 </div>
                             </div>

                             {/* Stack Operator */}
                             <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                 <div className="mb-2">
                                     <h4 className="text-sm font-bold text-white">Stack operator</h4>
                                 </div>
                                 <div className="space-y-1 text-sm text-slate-400">
                                     <div className="flex items-start gap-1">
                                         <span className="text-purple-400">•</span>
                                         <span>Compare price vs performance of serving stacks.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-purple-400">•</span>
                                         <span>Select optimal configurations for production use.</span>
                                     </div>
                                     <div className="flex items-start gap-1">
                                         <span className="text-purple-400">•</span>
                                         <span>Reproduce benchmarks to validate performance gain.</span>
                                     </div>
                                 </div>
                             </div>

                         </div>
                     </div>
                </section>

                {/* Secondary Actions / Footer */}
                <div className="flex space-x-4 mb-16">
                    <a 
                        href="https://llm-d.ai/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-6 py-2 bg-transparent hover:bg-slate-800 text-slate-400 rounded-lg transition-colors flex items-center text-sm font-medium"
                    >
                        llm-d.ai docs
                    </a>
                </div>
            </div>
        </div>
    );
};

export default PrismHome;
