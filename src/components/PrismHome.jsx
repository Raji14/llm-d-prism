import React, { useState } from 'react';
import { Activity, Zap, BarChart2, ArrowRight, Server, Cpu, CheckCircle, Shield, TrendingUp, HelpCircle, FileCode, Link, Database, Upload, Sliders, Layers, Terminal, Compass, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

const PrismHome = ({ onNavigate }) => {
    const [isComingSoonExpanded, setIsComingSoonExpanded] = useState(false);
    const [hoveredRole, setHoveredRole] = useState(null);

    // Map roles to active pipeline stages
    const getActiveStages = (role) => {
        if (!role) return [];
        switch (role) {
            case 'feature_dev':
                return ['report', 'prism'];
            case 'benchmark_dev':
                return ['catalog', 'harness', 'report'];
            case 'solutions_arch':
                return ['catalog', 'prism'];
            case 'stack_operator':
                return ['store', 'prism'];
            default:
                return [];
        }
    };

    const activeStages = getActiveStages(hoveredRole);

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col items-center justify-center p-8 relative overflow-hidden">
            {/* Background Dot Grid */}
            <div className="absolute inset-0 pointer-events-none z-0 opacity-[0.08]">
                <svg width="100%" height="100%">
                    <defs>
                        <pattern id="bg-grid-dots" width="20" height="20" patternUnits="userSpaceOnUse">
                            <circle cx="2" cy="2" r="1" fill="#cbd5e1" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#bg-grid-dots)" />
                </svg>
            </div>

            {/* Pulsing Ambient Glow Background Shapes */}
            <div className="absolute top-1/4 left-10 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-10 w-96 h-96 bg-emerald-600/5 rounded-full blur-3xl pointer-events-none" />

            {/* Technical Blueprint Layout Borders */}
            <div className="absolute left-6 top-0 bottom-0 border-l border-slate-900 border-dashed pointer-events-none z-0" />
            <div className="absolute right-6 top-0 bottom-0 border-r border-slate-900 border-dashed pointer-events-none z-0" />
            <div className="absolute left-0 right-0 top-6 border-t border-slate-900 border-dashed pointer-events-none z-0" />
            <div className="absolute left-0 right-0 bottom-6 border-b border-slate-900 border-dashed pointer-events-none z-0" />

            {/* Blueprint Junction Crosshairs */}
            <span className="absolute left-5 top-5 font-mono text-slate-700 text-xs select-none pointer-events-none">+</span>
            <span className="absolute right-5 top-5 font-mono text-slate-700 text-xs select-none pointer-events-none">+</span>
            <span className="absolute left-5 bottom-5 font-mono text-slate-700 text-xs select-none pointer-events-none">+</span>
            <span className="absolute right-5 bottom-5 font-mono text-slate-700 text-xs select-none pointer-events-none">+</span>

            <div className="max-w-6xl w-full z-10 flex flex-col items-center">
                {/* Hero Header */}
                <header className="mb-14 text-center relative pt-8 flex flex-col items-center">
                    <div className="flex items-center justify-center mb-3 space-x-3">
                        <a href="https://llm-d.ai" target="_blank" rel="noopener noreferrer" className="hover:opacity-85 transition-opacity">
                            <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-8 object-contain" />
                        </a>
                        <div className="h-6 w-px bg-slate-800" />
                        <a href="https://github.com/llm-d/llm-d-prism" target="_blank" rel="noopener noreferrer" className="hover:opacity-85 transition-opacity">
                            <h1 className="text-3xl font-black tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 font-mono">
                                PRISM
                            </h1>
                        </a>
                    </div>
                    <p className="text-sm text-slate-400 max-w-2xl leading-relaxed font-mono uppercase tracking-wider">
                        Distributed Inference Systems & Agentic Serving Benchmarks Portal
                    </p>
                </header>

                {/* Section 01: Results Store landing Front Door */}
                <section className="mb-16 w-full max-w-5xl bg-slate-900/20 border border-slate-800/80 rounded-xl relative overflow-hidden backdrop-blur-xl shadow-xl">
                    {/* Corner Tag */}
                    <div className="absolute top-0 left-0 bg-slate-800/80 px-3 py-1 font-mono text-[9px] text-slate-400 uppercase tracking-widest border-r border-b border-slate-700/50 rounded-br">
                        [01 // RESULTS STORE GATEWAY]
                    </div>
                    
                    <div className="p-8 pt-10">
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8">
                            <div>
                                <div className="flex items-center gap-2.5 mb-2">
                                    <Database className="h-5 w-5 text-cyan-400" />
                                    <h2 className="text-lg font-black tracking-wider text-white uppercase font-mono">Results Store</h2>
                                </div>
                                <p className="text-xs text-slate-400 max-w-xl leading-relaxed">
                                    The open-source repository for system and workload telemetry. Compare, validate, and reproduce distributed inference performance benchmark reports.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 font-mono text-[9px] text-slate-400 border border-slate-800 px-3 py-1.5 rounded bg-slate-950/40 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Schema Sync (v0.2)
                            </div>
                        </div>

                        {/* 3-Column Split Layout with border dividers */}
                        <div className="grid grid-cols-1 md:grid-cols-3 border border-slate-800 rounded-lg overflow-hidden bg-slate-950/20">
                            {/* Action 1: Browse Results */}
                            <div 
                                onClick={() => onNavigate('benchmark-browser')}
                                className="hover:bg-slate-950/80 p-5 cursor-pointer group transition-all duration-300 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-3 text-slate-300 group-hover:text-cyan-400 transition-colors">
                                        <BarChart2 className="h-4 w-4" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Browse Results</h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
                                        Analyze live benchmark runs. Filter by hardware (H100, L4), TPU topology, model servers, and workload context.
                                    </p>
                                </div>
                                <div className="text-[10px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 uppercase tracking-wider font-mono">
                                    Open Browser <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>

                            {/* Action 2: Add/Submit */}
                            <div 
                                onClick={() => onNavigate('manage-benchmarks')}
                                className="border-t md:border-t-0 md:border-l md:border-r border-slate-800 hover:bg-slate-950/80 p-5 cursor-pointer group transition-all duration-305 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-3 text-slate-300 group-hover:text-cyan-400 transition-colors">
                                        <Upload className="h-4 w-4" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Add Benchmark</h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
                                        Onboard and submit run telemetries. Validates files against standard schemas before uploading to staging GCS bucket.
                                    </p>
                                </div>
                                <div className="text-[10px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 uppercase tracking-wider font-mono">
                                    Submit Run <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>

                            {/* Action 3: Manage Submissions */}
                            <div 
                                onClick={() => onNavigate('manage-benchmarks')}
                                className="hover:bg-slate-950/80 p-5 cursor-pointer group transition-all duration-300 flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex items-center gap-2 mb-3 text-slate-300 group-hover:text-cyan-400 transition-colors">
                                        <Sliders className="h-4 w-4" />
                                        <h3 className="text-xs font-bold uppercase tracking-wider font-mono">Manage Submissions</h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-6">
                                        Track compliance transitions. Monitor run submissions through Staged, Processing, Review, and Public states.
                                    </p>
                                </div>
                                <div className="text-[10px] font-bold text-cyan-400 group-hover:translate-x-1 transition-transform flex items-center gap-1 uppercase tracking-wider font-mono">
                                    Track Progress <ArrowRight className="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 02: Well-lit paths */}
                <section className="mb-20 w-full max-w-5xl bg-slate-900/20 border border-slate-800/80 rounded-xl relative overflow-hidden backdrop-blur-xl shadow-xl">
                    {/* Corner Tag */}
                    <div className="absolute top-0 left-0 bg-slate-800/80 px-3 py-1 font-mono text-[9px] text-slate-400 uppercase tracking-widest border-r border-b border-slate-700/50 rounded-br">
                        [02 // ACTIVE SERVING ARCHITECTURES]
                    </div>

                    <div className="p-8 pt-10">
                        <div className="text-center mb-8">
                            <h2 className="text-lg font-black tracking-wider text-white uppercase font-mono mb-1">
                                Well-lit paths
                            </h2>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-mono uppercase tracking-wide">Live benchmarked serving configurations and architectural templates</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full items-stretch">
                            {/* Path 1: Inference scheduling */}
                            <div 
                                onClick={() => onNavigate('inference-scheduling')}
                                className="group relative bg-slate-950/40 hover:bg-slate-950/80 shadow-lg hover:shadow-2xl rounded-xl p-5 transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-cyan-500/35 h-full overflow-hidden"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors uppercase font-mono tracking-wider">
                                            Intelligent routing
                                        </h3>
                                        <span className="font-mono text-[8px] text-slate-500">[PATH-A]</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        <span className="text-[9px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded font-mono border border-cyan-500/20">Prefix-cache</span>
                                        <span className="text-[9px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded font-mono border border-cyan-500/20">Load balance</span>
                                    </div>
                                    <p className="text-slate-450 text-[11px] leading-relaxed mb-4">
                                        Optimize request routing to maximize performance. Leverage GKE Inference Gateway and cache introspection to reduce tail latency.
                                    </p>
                                    
                                    {/* Visual Preview / Metrics */}
                                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 mb-4 font-mono">
                                        <div className="space-y-1 mb-2">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-500">SLA COMPLIANCE:</span>
                                                <span className="text-cyan-400 font-bold">98.5%</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                 <span className="text-slate-500">CONTEXT SCALE:</span>
                                                 <span className="text-cyan-400 font-bold">163k TOK</span>
                                            </div>
                                        </div>
                                        {/* Monochromatic Preview Chart */}
                                        <div className="h-7 flex items-end justify-between space-x-0.5 border-b border-slate-800 pb-px">
                                            <div className="w-full bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                            <div className="w-full bg-cyan-500 h-3 rounded-t-sm opacity-40"></div>
                                            <div className="w-full bg-cyan-500 h-4.5 rounded-t-sm opacity-70"></div>
                                            <div className="w-full bg-cyan-500 h-3.5 rounded-t-sm opacity-55"></div>
                                            <div className="w-full bg-cyan-500 h-6 rounded-t-sm opacity-95"></div>
                                        </div>
                                    </div>
                                </div>
     
                                <div className="flex gap-2 mt-auto pt-2">
                                    <button className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded font-mono font-bold text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 transition-all uppercase tracking-wider">
                                        Launch <ArrowRight className="ml-1 h-3 w-3" />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onNavigate('workload-catalog'); }}
                                        className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800 hover:text-white rounded font-mono text-[10px] flex items-center justify-center transition-colors uppercase tracking-wider"
                                        title="View GKE config template to reproduce this optimized routing schema in your cluster"
                                    >
                                        Reproduce
                                    </button>
                                </div>
                            </div>

                            {/* Path 2: Agentic Serving */}
                            <div 
                                onClick={() => onNavigate('agentic-serving')}
                                className="group relative bg-slate-950/40 hover:bg-slate-950/80 shadow-lg hover:shadow-2xl rounded-xl p-5 transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-cyan-500/35 h-full overflow-hidden"
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-xs font-bold text-white group-hover:text-cyan-400 transition-colors uppercase font-mono tracking-wider">
                                            Agentic serving
                                        </h3>
                                        <span className="font-mono text-[8px] text-slate-500">[PATH-B]</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mb-3">
                                        <span className="text-[9px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded font-mono border border-cyan-500/20">Multi-turn</span>
                                        <span className="text-[9px] px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded font-mono border border-cyan-500/20">Tool use</span>
                                    </div>
                                    <p className="text-slate-450 text-[11px] leading-relaxed mb-4">
                                        Optimize multi-turn conversations using prefix-aware routing, KV-offloading, and queue depth load balancing.
                                    </p>
                                    
                                    {/* Visual Preview / Metrics */}
                                    <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 mb-4 font-mono">
                                        <div className="space-y-1 mb-2">
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-500">WORKLOAD:</span>
                                                <span className="text-cyan-400 font-bold">CODE GEN</span>
                                            </div>
                                            <div className="flex justify-between text-[10px]">
                                                <span className="text-slate-500">NUM TURNS:</span>
                                                <span className="text-cyan-400 font-bold">230</span>
                                            </div>
                                        </div>
                                        <div className="h-7 flex items-end justify-between space-x-0.5 px-0.5 relative border-b border-slate-800 pb-px">
                                             <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                             <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                             <div className="w-2/6 bg-cyan-500 h-4.5 rounded-t-sm relative opacity-90">
                                                 <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-cyan-400 uppercase tracking-wider">Active</span>
                                             </div>
                                             <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                             <div className="w-1/6 bg-cyan-500 h-1.5 rounded-t-sm opacity-20"></div>
                                             <div className="w-2/6 bg-cyan-500 h-4.5 rounded-t-sm opacity-90 relative">
                                                 <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-cyan-400 uppercase tracking-wider">Offload</span>
                                             </div>
                                        </div>
                                    </div>
                                </div>
     
                                <div className="flex gap-2 mt-auto pt-2">
                                    <button className="flex-1 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded font-mono font-bold text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 transition-all uppercase tracking-wider">
                                        Launch <ArrowRight className="ml-1 h-3 w-3" />
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onNavigate('workload-catalog'); }}
                                        className="px-3 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 border border-slate-800/85 hover:text-white rounded font-mono text-[10px] flex items-center justify-center transition-colors uppercase tracking-wider"
                                        title="View GKE config template to reproduce this optimized routing schema in your cluster"
                                    >
                                        Reproduce
                                    </button>
                                </div>
                            </div>

                            {/* Card 3: Consolidated Roadmap (Coming Soon Stack) */}
                            <div 
                                onClick={() => setIsComingSoonExpanded(!isComingSoonExpanded)}
                                className={`group relative bg-slate-950/40 border border-slate-800 rounded-xl p-5 transition-all duration-300 cursor-pointer flex flex-col justify-between overflow-hidden ${
                                    isComingSoonExpanded 
                                    ? 'shadow-[0_0_30px_rgba(168,85,247,0.12)] border-purple-500/35 h-auto' 
                                    : 'hover:border-purple-500/30 hover:shadow-[0_4px_25px_rgba(168,85,247,0.06)] h-full min-h-[280px]'
                                }`}
                            >
                                {/* Layered Cards background visual effect when collapsed */}
                                {!isComingSoonExpanded && (
                                    <>
                                        <div className="absolute bottom-2 left-6 right-6 h-10 bg-slate-950 border border-slate-905 rounded-lg -z-10 translate-y-3 opacity-60 scale-95 transition-all duration-300 group-hover:translate-y-4" />
                                        <div className="absolute bottom-2 left-4 right-4 h-10 bg-slate-900 border border-slate-800 rounded-lg -z-10 translate-y-1.5 opacity-80 scale-98 transition-all duration-300 group-hover:translate-y-2" />
                                    </>
                                )}

                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-purple-400" />
                                            <h3 className="text-xs font-bold text-white group-hover:text-purple-400 transition-colors uppercase font-mono tracking-wider">Roadmap</h3>
                                        </div>
                                        <span className="text-[8.5px] font-mono px-2 py-0.5 rounded bg-purple-500/10 border border-purple-500/20 text-purple-400 uppercase font-black tracking-wider">
                                            {isComingSoonExpanded ? 'Active' : 'Roadmap'}
                                        </span>
                                    </div>
                                    <p className="text-slate-400 text-[11px] leading-relaxed mb-4">
                                        Upcoming performance optimizations and architectural templates on the Prism roadmap.
                                    </p>

                                    {isComingSoonExpanded ? (
                                        <div className="space-y-2.5 my-2 animate-fadeIn font-mono">
                                            {/* Roadmap Item 1 */}
                                            <div className="p-2.5 bg-slate-950/60 border border-slate-850 rounded flex items-start gap-2.5">
                                                <div className="p-1 rounded bg-emerald-500/10 border border-emerald-500/20 mt-0.5">
                                                    <Database className="w-3 h-3 text-emerald-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-slate-200 uppercase tracking-tight">Prefix Cache Offloading</h4>
                                                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">Tiered KV cache offloading to host CPU memory, expanding accelerator capacity bounds.</p>
                                                </div>
                                            </div>

                                            {/* Roadmap Item 2 */}
                                            <div className="p-2.5 bg-slate-950/60 border border-slate-850 rounded flex items-start gap-2.5">
                                                <div className="p-1 rounded bg-purple-500/10 border border-purple-500/20 mt-0.5">
                                                    <Activity className="w-3 h-3 text-purple-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-slate-200 uppercase tracking-tight">Prefill/Decode Disagg</h4>
                                                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">Separating prefill and decode nodes to eliminate queue interference for multi-tenant pipelines.</p>
                                                </div>
                                            </div>

                                            {/* Roadmap Item 3 */}
                                            <div className="p-2.5 bg-slate-950/60 border border-slate-850 rounded flex items-start gap-2.5">
                                                <div className="p-1 rounded bg-pink-500/10 border border-pink-500/20 mt-0.5">
                                                    <Layers className="w-3 h-3 text-pink-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-slate-200 uppercase tracking-tight">Wide Expert Parallelism</h4>
                                                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">Scaling Mixture-of-Experts (MoE) workloads across large multi-node GPU clusters dynamically.</p>
                                                </div>
                                            </div>

                                            {/* Roadmap Item 4 */}
                                            <div className="p-2.5 bg-slate-950/60 border border-slate-850 rounded flex items-start gap-2.5">
                                                <div className="p-1 rounded bg-cyan-500/10 border border-cyan-500/20 mt-0.5">
                                                    <TrendingUp className="w-3 h-3 text-cyan-400" />
                                                </div>
                                                <div>
                                                    <h4 className="text-[10px] font-bold text-slate-200 uppercase tracking-tight">Value Analysis (TCO)</h4>
                                                    <p className="text-[9px] text-slate-400 leading-tight mt-0.5">Dynamic cost vs. performance optimization reports, estimating dollar savings per Chip hour.</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-1.5 select-none mt-3 opacity-40">
                                            <div className="h-6.5 bg-slate-950 border border-slate-900 rounded" />
                                            <div className="h-6.5 bg-slate-950 border border-slate-800 rounded" />
                                        </div>
                                    )}
                                </div>

                                <button className="w-full mt-4 py-2 bg-slate-900 hover:bg-slate-850 text-slate-300 rounded font-mono text-[9px] flex items-center justify-center border border-slate-800 transition-colors uppercase tracking-wider">
                                    {isComingSoonExpanded ? 'Collapse Deck' : 'Expand Roadmap'}
                                </button>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Section 03: Utility Suite */}
                <section className="mb-20 w-full max-w-5xl bg-slate-900/20 border border-slate-800/80 rounded-xl relative overflow-hidden backdrop-blur-xl shadow-xl">
                    {/* Corner Tag */}
                    <div className="absolute top-0 left-0 bg-slate-800/80 px-3 py-1 font-mono text-[9px] text-slate-400 uppercase tracking-widest border-r border-b border-slate-700/50 rounded-br">
                        [03 // ANALYTICS & UTILITY SUITE]
                    </div>

                    <div className="p-8 pt-10">
                        <div className="text-center mb-8">
                            <h2 className="text-lg font-black tracking-wider text-white uppercase font-mono mb-1">
                                Utility suite
                            </h2>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-mono uppercase tracking-wide">Access specialized tools for deeper analysis and schema browsing</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                            {/* Card 1: Benchmark Browser */}
                            <div 
                                onClick={() => onNavigate('benchmark-browser')}
                                className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4.5 hover:bg-slate-950/80 transition-all cursor-pointer flex flex-col justify-between h-full group"
                            >
                                <div>
                                    <div className="flex items-center mb-2.5">
                                        <BarChart2 className="h-4 w-4 text-cyan-400 mr-2" />
                                        <h3 className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors uppercase font-mono tracking-wider">Benchmark Browser</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-normal mb-5">Browse and compare benchmark results across runs and configurations.</p>
                                </div>
                                <button className="w-full py-1.5 bg-slate-900 hover:bg-cyan-600 text-white rounded font-mono text-[9px] flex items-center justify-center transition-colors uppercase tracking-wider">
                                    Launch <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                            </div>

                            {/* Card 2: Schema Explorer */}
                            <div 
                                onClick={() => onNavigate('schema-explorer')}
                                className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4.5 hover:bg-slate-950/80 transition-all cursor-pointer flex flex-col justify-between h-full group"
                            >
                                <div>
                                    <div className="flex items-center mb-2.5">
                                        <FileCode className="h-4 w-4 text-cyan-400 mr-2" />
                                        <h3 className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors uppercase font-mono tracking-wider">Schema Explorer</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-normal mb-5">Explore unified schema standards and metrics definitions.</p>
                                </div>
                                <button className="w-full py-1.5 bg-slate-900 hover:bg-cyan-600 text-white rounded font-mono text-[9px] flex items-center justify-center transition-colors uppercase tracking-wider">
                                    Launch <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                            </div>

                            {/* Card 3: Workload Catalog */}
                            <div 
                                onClick={() => onNavigate('workload-catalog')}
                                className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4.5 hover:bg-slate-950/80 transition-all cursor-pointer flex flex-col justify-between h-full group"
                            >
                                <div>
                                    <div className="flex items-center mb-2.5">
                                        <Zap className="h-4 w-4 text-cyan-400 mr-2" />
                                        <h3 className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors uppercase font-mono tracking-wider">Workload Catalog</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-normal mb-5">Explore standardized workload shapes and resource requests.</p>
                                </div>
                                <button className="w-full py-1.5 bg-slate-900 hover:bg-cyan-600 text-white rounded font-mono text-[9px] flex items-center justify-center transition-colors uppercase tracking-wider">
                                    Launch <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                            </div>

                            {/* Card 4: Regressions & Analysis */}
                            <div 
                                onClick={() => onNavigate('regressions-analysis')}
                                className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-4.5 hover:bg-slate-950/80 transition-all cursor-pointer flex flex-col justify-between h-full group"
                            >
                                <div>
                                    <div className="flex items-center mb-2.5">
                                        <Activity className="h-4 w-4 text-cyan-400 mr-2" />
                                        <h3 className="text-xs font-bold text-slate-200 group-hover:text-cyan-400 transition-colors uppercase font-mono tracking-wider">Regressions</h3>
                                    </div>
                                    <p className="text-[10.5px] text-slate-400 leading-normal mb-5">Track nightly benchmark runs and detect regressions across models.</p>
                                </div>
                                <button className="w-full py-1.5 bg-slate-900 hover:bg-cyan-600 text-white rounded font-mono text-[9px] flex items-center justify-center transition-colors uppercase tracking-wider">
                                    Launch <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section 04: How it works - Interactive Blueprint Schematic */}
                <section className="mb-20 w-full max-w-5xl bg-slate-900/20 border border-slate-800/80 rounded-xl relative overflow-hidden backdrop-blur-xl shadow-xl">
                    {/* Corner Tag */}
                    <div className="absolute top-0 left-0 bg-slate-800/80 px-3 py-1 font-mono text-[9px] text-slate-400 uppercase tracking-widest border-r border-b border-slate-700/50 rounded-br">
                        [04 // LIFECYCLE SCHEMATIC & PIPELINE]
                    </div>

                    <div className="p-8 pt-10">
                        <div className="text-center mb-10">
                            <h2 className="text-lg font-black tracking-wider text-white uppercase font-mono mb-1">
                                Benchmark Lifecycle
                            </h2>
                            <p className="text-[11px] text-slate-400 leading-relaxed font-mono uppercase tracking-wide">
                                Automated ingestion, compliance validation, and visualization flow
                            </p>
                        </div>
                        
                        {/* Interactive Blueprint Flow Structure */}
                        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1fr] gap-6 items-stretch relative">
                            {/* Left Column: Roles (Developer side) */}
                            <div className="flex flex-col gap-6 justify-center">
                                <div className="text-center lg:text-right font-mono text-[9px] uppercase tracking-widest text-cyan-400 mb-1 font-bold">Input Operators</div>
                                
                                {/* Feature Developer Card */}
                                <div 
                                    onMouseEnter={() => setHoveredRole('feature_dev')}
                                    onMouseLeave={() => setHoveredRole(null)}
                                    className={`bg-slate-950/60 p-4 border rounded-lg transition-all duration-300 relative ${
                                        hoveredRole === 'feature_dev' ? 'border-cyan-500 bg-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'border-slate-800'
                                    }`}
                                >
                                    {/* Responsive CSS Bridge Line */}
                                    <div className={`hidden lg:block absolute left-full top-1/2 w-6 h-px transition-all duration-300 ${
                                        hoveredRole === 'feature_dev' ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4]' : 'bg-slate-800'
                                    }`} />

                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-1.5">Feature Developer</h4>
                                    <ul className="text-[10px] text-slate-400 space-y-1 font-mono">
                                        <li>• Run benchmarks against baseline specs</li>
                                        <li>• Analyze isolated system bottlenecks</li>
                                        <li>• Generate v0.2 structured reports</li>
                                    </ul>
                                </div>

                                {/* Benchmark Developer Card */}
                                <div 
                                    onMouseEnter={() => setHoveredRole('benchmark_dev')}
                                    onMouseLeave={() => setHoveredRole(null)}
                                    className={`bg-slate-950/60 p-4 border rounded-lg transition-all duration-300 relative ${
                                        hoveredRole === 'benchmark_dev' ? 'border-cyan-500 bg-slate-950 shadow-[0_0_20px_rgba(6,182,212,0.1)]' : 'border-slate-800'
                                    }`}
                                >
                                    {/* Responsive CSS Bridge Line */}
                                    <div className={`hidden lg:block absolute left-full top-1/2 w-6 h-px transition-all duration-300 ${
                                        hoveredRole === 'benchmark_dev' ? 'bg-cyan-500 shadow-[0_0_8px_#06b6d4]' : 'bg-slate-800'
                                    }`} />

                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-1.5">Benchmark Developer</h4>
                                    <ul className="text-[10px] text-slate-400 space-y-1 font-mono">
                                        <li>• Author standardized workload models</li>
                                        <li>• Publish configurations to GCS Staging</li>
                                        <li>• Audit data compliance logs</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Center Column: Pipeline Path Box */}
                            <div className="flex flex-col gap-4 items-center justify-center bg-slate-950/30 border border-slate-800 rounded-lg p-5">
                                <div className="font-mono text-[9px] uppercase tracking-widest text-slate-500 mb-1">Central Pipeline</div>

                                {/* Step 1: Workload Catalog */}
                                <div className={`w-full p-3 bg-slate-900/60 border rounded-lg text-center transition-all duration-300 ${
                                    activeStages.includes('catalog') ? 'border-cyan-500 bg-slate-900 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.08)]' : 'border-slate-800 text-slate-400'
                                }`}>
                                    <div className="text-[9px] font-mono text-slate-500 mb-0.5">[STEP 01 // WORKLOAD CATALOG]</div>
                                    <h5 className="text-xs font-bold font-mono uppercase">Workload Specification</h5>
                                </div>

                                {/* Connecting Down Arrow */}
                                <div className="h-4 w-px border-l border-dashed border-slate-700" />

                                {/* Step 2: Ingestion & Validation */}
                                <div className={`w-full p-3 bg-slate-900/60 border rounded-lg text-center transition-all duration-300 ${
                                    activeStages.includes('report') ? 'border-cyan-500 bg-slate-900 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.08)]' : 'border-slate-800 text-slate-400'
                                }`}>
                                    <div className="text-[9px] font-mono text-slate-500 mb-0.5">[STEP 02 // VALIDATION HOOKS]</div>
                                    <h5 className="text-xs font-bold font-mono uppercase">Compliance Reporting</h5>
                                </div>

                                {/* Connecting Down Arrow */}
                                <div className="h-4 w-px border-l border-dashed border-slate-700" />

                                {/* Step 3: Central OSS Store */}
                                <div className={`w-full p-3 bg-slate-900/60 border rounded-lg text-center transition-all duration-300 ${
                                    activeStages.includes('store') ? 'border-purple-500 bg-slate-900 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.08)]' : 'border-slate-800 text-slate-400'
                                }`}>
                                    <div className="text-[9px] font-mono text-slate-500 mb-0.5">[STEP 03 // DATA REPOSITORY]</div>
                                    <h5 className="text-xs font-bold font-mono uppercase">llm-d Results Store</h5>
                                </div>

                                {/* Connecting Down Arrow */}
                                <div className="h-4 w-px border-l border-dashed border-slate-700" />

                                {/* Step 4: Prism Portal */}
                                <div className={`w-full p-3 bg-slate-900/60 border rounded-lg text-center transition-all duration-300 ${
                                    activeStages.includes('prism') ? 'border-purple-500 bg-slate-900 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.08)]' : 'border-slate-800 text-slate-400'
                                }`}>
                                    <div className="text-[9px] font-mono text-slate-500 mb-0.5">[STEP 04 // VISUALIZATION PORTAL]</div>
                                    <h5 className="text-xs font-bold font-mono uppercase">Prism Analytics</h5>
                                </div>
                            </div>

                            {/* Right Column: Roles (Consumer / Architect side) */}
                            <div className="flex flex-col gap-6 justify-center">
                                <div className="text-center lg:text-left font-mono text-[9px] uppercase tracking-widest text-purple-450 mb-1 font-bold">Consumers</div>

                                {/* Solutions Architect Card */}
                                <div 
                                    onMouseEnter={() => setHoveredRole('solutions_arch')}
                                    onMouseLeave={() => setHoveredRole(null)}
                                    className={`bg-slate-950/60 p-4 border rounded-lg transition-all duration-300 relative ${
                                        hoveredRole === 'solutions_arch' ? 'border-purple-500 bg-slate-950 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-slate-800'
                                    }`}
                                >
                                    {/* Responsive CSS Bridge Line */}
                                    <div className={`hidden lg:block absolute right-full top-1/2 w-6 h-px transition-all duration-300 ${
                                        hoveredRole === 'solutions_arch' ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : 'bg-slate-800'
                                    }`} />

                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-1.5">Solutions Architect</h4>
                                    <ul className="text-[10px] text-slate-400 space-y-1 font-mono">
                                        <li>• Analyze performance metrics profiles</li>
                                        <li>• Reference optimized deployment shapes</li>
                                        <li>• Select ideal hardware architectures</li>
                                    </ul>
                                </div>

                                {/* Stack Operator Card */}
                                <div 
                                    onMouseEnter={() => setHoveredRole('stack_operator')}
                                    onMouseLeave={() => setHoveredRole(null)}
                                    className={`bg-slate-950/60 p-4 border rounded-lg transition-all duration-300 relative ${
                                        hoveredRole === 'stack_operator' ? 'border-purple-500 bg-slate-950 shadow-[0_0_20px_rgba(168,85,247,0.1)]' : 'border-slate-800'
                                    }`}
                                >
                                    {/* Responsive CSS Bridge Line */}
                                    <div className={`hidden lg:block absolute right-full top-1/2 w-6 h-px transition-all duration-300 ${
                                        hoveredRole === 'stack_operator' ? 'border-purple-500 shadow-[0_0_8px_#a855f7] bg-purple-500' : 'bg-slate-800'
                                    }`} />

                                    <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono mb-1.5">Stack Operator</h4>
                                    <ul className="text-[10px] text-slate-400 space-y-1 font-mono">
                                        <li>• Inspect price vs performance curves</li>
                                        <li>• Reproduce benchmarks in test environments</li>
                                        <li>• Validate cluster node serving counts</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Secondary Actions / Footer */}
                <div className="flex space-x-4 mb-16 relative z-10">
                    <a 
                        href="https://llm-d.ai/" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="px-5 py-2.5 bg-slate-900/50 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded font-mono text-[10px] uppercase tracking-widest transition-all"
                    >
                        llm-d.ai documentation
                    </a>
                </div>
            </div>
        </div>
    );
};

export default PrismHome;
