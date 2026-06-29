import React, { useState, useEffect } from 'react';
import { Activity, Zap, BarChart2, ArrowRight, Server, Cpu, CheckCircle, Shield, TrendingUp, HelpCircle, FileCode, Link, Database, Upload, Sliders, Layers, ChevronDown, ChevronUp, Lightbulb, ChevronLeft, ChevronRight } from 'lucide-react';

const PrismHome = ({ onNavigate }) => {
    const [currentRoadmapIndex, setCurrentRoadmapIndex] = useState(0);
    const [isHoveringRoadmap, setIsHoveringRoadmap] = useState(false);

    const roadmapItems = [
        {
            title: "Prefix Cache Offloading",
            description: "Tiered KV cache offloading to host CPU memory, expanding accelerator context capacity bounds.",
            icon: Database,
            colorClass: "text-emerald-400",
            bgClass: "bg-emerald-500/10",
            borderClass: "border-emerald-500/20",
            badge: "KV-cache"
        },
        {
            title: "Prefill/Decode Disagg",
            description: "Separating prefill and decode nodes to eliminate queue interference for multi-tenant pipelines.",
            icon: Activity,
            colorClass: "text-purple-400",
            bgClass: "bg-purple-500/10",
            borderClass: "border-purple-500/20",
            badge: "Large models"
        },
        {
            title: "Wide Expert Parallelism",
            description: "Scaling Mixture-of-Experts (MoE) workloads across large multi-node GPU clusters dynamically.",
            icon: Layers,
            colorClass: "text-pink-400",
            bgClass: "bg-pink-500/10",
            borderClass: "border-pink-500/20",
            badge: "MoE scale"
        },
        {
            title: "Value Analysis (Cost/TCO)",
            description: "Dynamic cost vs. performance optimization reports, estimating dollar savings per Chip hour.",
            icon: TrendingUp,
            colorClass: "text-cyan-400",
            bgClass: "bg-cyan-500/10",
            borderClass: "border-cyan-500/20",
            badge: "Cost/TCO"
        }
    ];

    useEffect(() => {
        if (isHoveringRoadmap) return;
        const timer = setInterval(() => {
            setCurrentRoadmapIndex((prev) => (prev + 1) % 4);
        }, 3500);
        return () => clearInterval(timer);
    }, [isHoveringRoadmap]);

    return (
        <div className="min-h-screen bg-slate-950 font-sans text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden bg-[radial-gradient(#334155_1.2px,transparent_1.2px)] bg-[size:24px_24px] bg-repeat">
            {/* Pulsing Vibrant Neon Glow Background Shapes */}
            <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" />
            <div className="absolute top-1/3 -right-1/4 w-1/2 h-1/2 bg-purple-600/20 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '1s' }} />
            <div className="absolute bottom-0 -left-1/4 w-1/2 h-1/2 bg-emerald-600/25 rounded-full blur-3xl pointer-events-none animate-pulse" style={{ animationDelay: '2s' }} />

            <div className="max-w-6xl w-full z-10 flex flex-col items-center">
                {/* Hero Header */}
                <header className="mb-12 text-center relative pt-6 flex flex-col items-center">
                    <div className="flex items-center justify-center mb-3 space-x-3">
                        <a href="https://llm-d.ai" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-9 object-contain" />
                        </a>
                        <a href="https://github.com/llm-d/llm-d-prism" target="_blank" rel="noopener noreferrer" className="hover:opacity-80 transition-opacity">
                            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600">
                                Prism
                            </h1>
                        </a>
                    </div>
                    <p className="text-lg text-slate-400 max-w-3xl leading-relaxed font-normal tracking-wide">
                        Performance analysis for distributed inference systems and agentic workflows
                    </p>
                </header>

                {/* Results Store landing Front Door */}
                <section className="mb-16 w-full max-w-5xl bg-slate-900/15 border border-slate-900 rounded-2xl relative overflow-hidden backdrop-blur-xl shadow-2xl">
                    {/* Grid mesh backdrop decorative lines */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1.5px,transparent_1.5px),linear-gradient(to_bottom,#1e293b_1.5px,transparent_1.5px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25 pointer-events-none" />
                    <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
                    
                    <div className="relative p-6 md:p-8 z-10">
                        <div className="flex flex-col items-center text-center max-w-2xl mx-auto gap-3.5 mb-8">
                            <h2 className="text-2xl font-extrabold tracking-tight text-white mb-0.5">Results Store</h2>
                            <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
                                The open-source repository for system and workload telemetry. Compare, validate, and reproduce distributed inference performance benchmark reports.
                            </p>
                            <div className="flex items-center gap-2 font-mono text-[9px] text-slate-400 border border-slate-800/80 px-2.5 py-1 rounded bg-slate-950/40 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live Schema Sync (v0.2)
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                            {/* Action 1: Browse & Manage Benchmarks */}
                            <div 
                                onClick={() => onNavigate('manage-benchmarks')}
                                className="bg-gradient-to-b from-slate-950/40 to-slate-950/80 p-5 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-purple-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(168,85,247,0.05)] relative overflow-hidden h-full min-h-[300px]"
                            >
                                <div>
                                    {/* Tech Illustration */}
                                    <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900/80 overflow-hidden flex items-center justify-center group-hover:border-purple-500/10 transition-colors">
                                        <div className="absolute inset-0 bg-[radial-gradient(#0c1322_1px,transparent_1px)] bg-[size:8px_8px] opacity-40" />
                                        <svg className="w-full h-full p-4 relative z-10" viewBox="0 0 200 80" fill="none">
                                            {/* Grid backdrop */}
                                            <line x1="15" y1="10" x2="15" y2="70" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="2 2" />
                                            <line x1="15" y1="70" x2="185" y2="70" stroke="#1e293b" strokeWidth="0.8" strokeDasharray="2 2" />
                                            
                                            {/* Glowing Chart Curve */}
                                            <path 
                                                d="M15 62 Q 55 25, 95 48 T 155 18" 
                                                stroke="url(#combined-gradient)" 
                                                strokeWidth="2.0" 
                                                strokeLinecap="round" 
                                                fill="none"
                                            />
                                            <circle cx="95" cy="48" r="3.5" fill="#c084fc" className="animate-ping opacity-60" />
                                            <circle cx="95" cy="48" r="1.5" fill="#c084fc" />

                                            {/* Timeline stepper indicators at right */}
                                            <line x1="155" y1="18" x2="175" y2="35" stroke="#4f46e5" strokeWidth="1" strokeDasharray="3 3" />
                                            <circle cx="175" cy="35" r="7" fill="#1e152a" stroke="#a855f7" strokeWidth="1" />
                                            <circle cx="175" cy="35" r="2.5" fill="#c084fc" className="animate-pulse" />
                                            <text x="175" y="49" textAnchor="middle" fill="#7c3aed" className="font-mono text-[5.5px] uppercase tracking-wider font-extrabold">In Review</text>

                                            <defs>
                                                <linearGradient id="combined-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#06b6d4" />
                                                    <stop offset="50%" stopColor="#6366f1" />
                                                    <stop offset="100%" stopColor="#a855f7" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                    </div>
                                    <div className="flex items-center gap-2 mb-2 text-slate-200 group-hover:text-purple-400 transition-colors">
                                        <Sliders className="h-4.5 w-4.5" />
                                        <h3 className="text-sm font-bold text-slate-250 tracking-wide">Browse & Manage Benchmarks</h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                                        Explore live run telemetries and track compliance submissions through Staged, Processing, Review, and Public states.
                                    </p>
                                </div>
                                <button className="w-full py-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-purple-400 hover:to-indigo-500 shadow-[0_0_15px_rgba(168,85,247,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                    Explore & Track <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                            </div>

                            {/* Action 2: Upload Benchmark */}
                            <div 
                                onClick={() => onNavigate('upload-benchmarks')}
                                className="bg-gradient-to-b from-slate-950/40 to-slate-950/80 p-5 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-cyan-500/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(6,182,212,0.05)] relative overflow-hidden h-full min-h-[300px]"
                            >
                                <div>
                                    {/* Tech Illustration */}
                                    <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900/80 overflow-hidden flex items-center justify-center group-hover:border-cyan-500/10 transition-colors">
                                        <div className="absolute inset-0 bg-[radial-gradient(#0c1322_1px,transparent_1px)] bg-[size:8px_8px] opacity-40" />
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
                                        <h3 className="text-sm font-bold text-slate-250 tracking-wide">Upload Benchmark</h3>
                                    </div>
                                    <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                                        Onboard and submit run telemetries. Validates files against standard schemas before uploading to staging GCS bucket.
                                    </p>
                                </div>
                                <button className="w-full py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                    Upload Benchmark <ArrowRight className="ml-1 h-3 w-3" />
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Well-lit paths */}
                <section className="mb-20 w-full max-w-5xl">
                    <h2 className="text-2xl font-extrabold tracking-tight text-white mb-2 text-center">
                        Well-lit paths
                    </h2>
                    <p className="text-xs text-slate-450 leading-relaxed text-center mb-8">Live benchmarked serving configurations and architectural templates</p>
                    
                    <div className="flex flex-row overflow-x-auto gap-5 pb-5 w-full items-stretch scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-slate-950/20">
                        {/* Path 1: Intelligent routing */}
                        <div 
                            onClick={() => onNavigate('inference-scheduling')}
                            className="group relative bg-slate-900/95 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(34,211,238,0.25)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-cyan-500/50 w-[290px] shrink-0 min-h-[320px] overflow-hidden"
                        >
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-2 transition-colors group-hover:text-cyan-400">
                                    Intelligent routing
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full font-medium border border-cyan-500/30 whitespace-nowrap">Prefix-cache</span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-cyan-500/15 text-cyan-400 rounded-full font-medium border border-cyan-500/30 whitespace-nowrap">Load balance</span>
                                </div>
                                <p className="text-slate-400 text-[11px] leading-relaxed mb-3">
                                    Optimize request routing to maximize performance. Leverage GKE Inference Gateway and cache introspection to reduce tail latency.
                                </p>
                                
                                {/* Visual Preview / Metrics */}
                                <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-2.5 mb-3">
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
                                    <div className="h-6 flex items-end justify-between space-x-0.5 border-b border-slate-800/40 pb-px">
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-1.5 rounded-t-sm opacity-35"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-3 rounded-t-sm opacity-55"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-4.5 rounded-t-sm opacity-85"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-3.5 rounded-t-sm opacity-70"></div>
                                        <div className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 h-6 rounded-t-sm"></div>
                                    </div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-cyan-400 hover:to-blue-500 shadow-[0_0_15px_rgba(34,211,238,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Path 2: Agentic serving */}
                        <div 
                            onClick={() => onNavigate('agentic-serving')}
                            className="group relative bg-slate-900/95 backdrop-blur-xl shadow-lg hover:shadow-2xl rounded-xl p-4 hover:-translate-y-1 hover:shadow-[0_0_30px_rgba(16,185,129,0.25)] transition-all duration-300 cursor-pointer flex flex-col justify-between border border-slate-800/80 hover:border-emerald-500/50 w-[290px] shrink-0 min-h-[320px] overflow-hidden"
                        >
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-2 transition-colors group-hover:text-emerald-450">
                                    Agentic serving
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full font-medium border border-emerald-500/30 whitespace-nowrap">Multi-turn</span>
                                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded-full font-medium border border-emerald-500/30 whitespace-nowrap">Tool use</span>
                                </div>
                                <p className="text-slate-400 text-[11px] leading-relaxed mb-3">
                                    Optimize multi-turn conversations using prefix-aware routing, KV-offloading, and queue depth load balancing.
                                </p>
                                
                                {/* Visual Preview / Metrics */}
                                <div className="bg-slate-950/60 border border-slate-800/60 rounded-lg p-2.5 mb-3">
                                    <div className="space-y-0.5 mb-1.5">
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Workload</span>
                                            <span className="text-emerald-400 font-mono font-bold">Code Generation</span>
                                        </div>
                                        <div className="flex justify-between text-[10px]">
                                            <span className="text-slate-400">Num Turns</span>
                                            <span className="text-emerald-400 font-mono font-bold">230</span>
                                        </div>
                                    </div>
                                    <div className="h-6 flex items-end justify-between space-x-0.5 px-0.5 relative border-b border-slate-800/40 pb-px">
                                         <div className="w-1/6 bg-emerald-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-1/6 bg-emerald-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-2/6 bg-gradient-to-t from-cyan-600 to-cyan-400 h-4 rounded-t-sm relative opacity-90">
                                             <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-cyan-400 uppercase tracking-wide">Active</span>
                                         </div>
                                         <div className="w-1/6 bg-emerald-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-1/6 bg-emerald-500 h-1.5 rounded-t-sm opacity-20"></div>
                                         <div className="w-2/6 bg-gradient-to-t from-emerald-600 to-emerald-400 h-4 rounded-t-sm opacity-90 relative">
                                             <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[5px] font-mono font-bold text-emerald-400 uppercase tracking-wide">Offload</span>
                                         </div>
                                    </div>
                                </div>
                            </div>
 
                            <button className="w-full py-1.5 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center hover:from-emerald-400 hover:to-cyan-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] transform group-hover:scale-[1.02] transition-all cursor-pointer mt-auto">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 3: Consolidated Roadmap */}
                        <div 
                            onMouseEnter={() => setIsHoveringRoadmap(true)}
                            onMouseLeave={() => setIsHoveringRoadmap(false)}
                            className="group relative bg-slate-900/95 backdrop-blur-xl border border-slate-800/80 rounded-xl p-4 transition-all duration-300 flex flex-col justify-between opacity-95 w-[290px] shrink-0 min-h-[320px] overflow-hidden hover:border-purple-500/50 hover:shadow-[0_0_30px_rgba(168,85,247,0.25)]"
                        >
                            <div>
                                <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-2 transition-colors group-hover:text-purple-400">
                                    Roadmap
                                </h3>
                                <div className="flex flex-wrap gap-1 mb-2.5">
                                    <span className="text-[9px] px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded-full font-medium border border-purple-500/30 whitespace-nowrap">Coming soon</span>
                                </div>
                                <p className="text-slate-400 text-[10.5px] leading-relaxed mb-4">
                                    Upcoming performance optimizations and architectural templates on the Prism roadmap.
                                </p>

                                {/* Slideshow Item Container */}
                                <div className="relative p-2.5 bg-slate-950/70 rounded-xl flex items-start gap-2.5 mt-2 min-h-[110px] group/item transition-all duration-300">
                                    {/* Left/Right manual controls inside the carousel */}
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentRoadmapIndex((prev) => (prev - 1 + 4) % 4);
                                        }}
                                        className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900 border border-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800 opacity-0 group-hover/item:opacity-100 transition-opacity z-10 cursor-pointer"
                                    >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                    </button>

                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCurrentRoadmapIndex((prev) => (prev + 1) % 4);
                                        }}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-slate-900 border border-slate-800/60 text-slate-400 hover:text-white hover:bg-slate-800 opacity-0 group-hover/item:opacity-100 transition-opacity z-10 cursor-pointer"
                                    >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Slide Item Content */}
                                    {(() => {
                                        const item = roadmapItems[currentRoadmapIndex];
                                        const IconComponent = item.icon;
                                        return (
                                            <div className="flex items-start gap-2.5 px-1.5 w-full animate-fadeIn">
                                                <div className={`p-1.5 rounded ${item.bgClass} border ${item.borderClass} mt-0.5 shrink-0`}>
                                                    <IconComponent className={`w-3.5 h-3.5 ${item.colorClass}`} />
                                                </div>
                                                <div className="flex-1 min-w-0 pr-1.5">
                                                    <div className="flex items-center justify-between gap-1">
                                                        <h4 className="text-[10.5px] font-bold text-slate-200 truncate">{item.title}</h4>
                                                        <span className="text-[7px] font-mono text-slate-500 shrink-0">{currentRoadmapIndex + 1}/4</span>
                                                    </div>
                                                    <p className="text-[9px] text-slate-400 leading-normal mt-1 line-clamp-3">{item.description}</p>
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </div>

                                {/* Pagination indicator dots below the carousel */}
                                <div className="flex justify-center gap-1.5 mt-2.5">
                                    {roadmapItems.map((_, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setCurrentRoadmapIndex(idx);
                                            }}
                                            className="p-1 cursor-pointer flex items-center justify-center group"
                                        >
                                            <div 
                                                className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                                                    idx === currentRoadmapIndex ? 'bg-purple-400 w-3' : 'bg-slate-700 group-hover:bg-slate-550'
                                                }`}
                                            />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </section>
                
                {/* Section: Utility Suite */}
                <section className="mb-20 w-full max-w-5xl">
                    <h2 className="text-2xl font-extrabold tracking-tight text-white mb-2 text-center">
                        Utility suite
                    </h2>
                    <p className="text-xs text-slate-450 text-center mb-8">Access specialized tools for deeper analysis and schema browsing</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
                        {/* Card 1: Workload Catalog */}
                        <div 
                            onClick={() => onNavigate('workload-catalog')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Zap className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-1.5 transition-colors group-hover:text-emerald-400">Workload catalog</h3>
                                </div>
                                <p className="text-[11px] text-slate-400 mb-4">Explore standardized workloads for evaluation.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 2: Regressions & Analysis */}
                        <div 
                            onClick={() => onNavigate('regressions-analysis')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <Activity className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-1.5 transition-colors group-hover:text-emerald-400">Regressions & analysis</h3>
                                </div>
                                <p className="text-[11px] text-slate-400 mb-4">Track nightly benchmark runs and detect regressions across well-lit paths.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 3: Benchmark Browser */}
                        <div 
                            onClick={() => onNavigate('benchmark-browser')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <BarChart2 className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-1.5 transition-colors group-hover:text-emerald-450">Benchmark browser</h3>
                                </div>
                                <p className="text-[11px] text-slate-400 mb-4">Browse and compare benchmark results across runs.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>

                        {/* Card 4: Schema Explorer */}
                        <div 
                            onClick={() => onNavigate('schema-explorer')}
                            className="bg-slate-900 shadow-xl border border-slate-800 rounded-xl p-3.5 hover:shadow-2xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between h-full group"
                        >
                            <div>
                                <div className="flex items-center mb-2">
                                    <FileCode className="h-4 w-4 text-emerald-400 mr-2" />
                                    <h3 className="text-sm font-bold text-slate-200 tracking-wide mb-1.5 transition-colors group-hover:text-emerald-400">Schema explorer</h3>
                                </div>
                                <p className="text-[11px] text-slate-400 mb-4">Explore data schemas and metric definitions.</p>
                            </div>
                            <button className="w-full py-1.5 bg-slate-800 hover:bg-emerald-600 text-white rounded-lg font-medium text-[10px] flex items-center justify-center transition-colors">
                                Launch <ArrowRight className="ml-1 h-3 w-3" />
                            </button>
                        </div>
                    </div>
                </section>
                

                {/* Section: How it works */}
                <section className="mb-20 w-full max-w-6xl mx-auto pl-20">
                     <h2 className="text-2xl font-extrabold tracking-tight text-white mb-2 text-center">
                          How it works: the full benchmark lifecycle
                     </h2>
                     <p className="text-xs text-slate-450 text-center mb-12 max-w-2xl mx-auto">
                          Designed for human insight and agent automation. Standardizing the end-to-end lifecycle from routing optimization to high-fidelity reproduction.
                     </p>
                     
                     <div className="flex flex-col md:flex-row gap-4 justify-between items-center relative mb-6">
                          
                          {/* Ambient glowing background in center */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

                          {/* Left Column: Roles & Actions */}
                          <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center md:items-end">
                              <div className="w-full max-w-[320px] text-center text-[10px] font-bold text-cyan-400/90 uppercase tracking-widest mb-3 font-mono">User & agent roles</div>
                              
                              {/* Feature Developer */}
                              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-cyan-500/30 transition-all group">
                                  <div className="mb-2">
                                      <h3 className="text-sm font-bold text-slate-200 tracking-wide">Feature developer</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-[11px] leading-relaxed">
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
                                      <h3 className="text-sm font-bold text-slate-200 tracking-wide">Benchmark developer</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-[11px] leading-relaxed">
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
                              
                              {/* Column Label */}
                              <div className="w-full max-w-[320px] text-center text-[10px] font-bold text-purple-400/90 uppercase tracking-widest mb-1.5 font-mono">Central pipeline</div>

                              {/* Prism */}
                              <div className="bg-gradient-to-r from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-purple-500/50 transition-all">
                                  <h3 className="text-sm font-bold text-purple-400 mb-1">Prism</h3>
                                  <p className="text-[11px] text-slate-400 leading-normal">Visualize and compare metrics across benchmarks.</p>
                              </div>

                              {/* Llm-d Results Store */}
                              <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/30 rounded-xl p-3 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-blue-500/50 transition-all">
                                  <h3 className="text-sm font-bold text-blue-400 mb-1">llm-d results store</h3>
                                  <p className="text-[11px] text-slate-400 leading-normal">Scalable OSS store for unified schema results.</p>
                              </div>

                              {/* Standard Benchmark Format / Report */}
                              <a 
                                  href="https://github.com/llm-d/llm-d-benchmark/blob/main/benchmark_report"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                  <h3 className="text-sm font-bold text-cyan-400 mb-1 flex items-center justify-center gap-1">
                                      Standard benchmark report
                                      <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                  </h3>
                                  <p className="text-[11px] text-slate-400 leading-normal">Unified JSON schema guarantees data interoperability.</p>
                              </a>

                              {/* Test Harness */}
                              <a 
                                  href="https://github.com/kubernetes-sigs/inference-perf/"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                  <h3 className="text-sm font-bold text-cyan-400 mb-1 flex items-center justify-center gap-1">
                                      Test harness
                                      <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                  </h3>
                                  <p className="text-[11px] text-slate-400 leading-normal">Stress distributed systems with agentic serving workloads.</p>
                              </a>

                              {/* Real World Workload Catalog */}
                              <a 
                                  href="https://github.com/kubernetes-sigs/inference-perf/tree/main/workload-catalog"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-2 w-full max-w-[320px] h-[90px] flex flex-col items-center justify-center text-center group hover:border-cyan-500/50 transition-all cursor-pointer"
                              >
                                  <h3 className="text-sm font-bold text-cyan-400 mb-1 flex items-center justify-center gap-1">
                                      Real world workload catalog
                                      <Link className="h-3 w-3 text-cyan-400 group-hover:scale-110 transition-transform" />
                                  </h3>
                                  <p className="text-[11px] text-slate-400 leading-normal">Access standardized workloads for evaluation.</p>
                              </a>

                          </div>

                          {/* Right Column: Roles & Actions */}
                          <div className="w-full md:w-1/3 space-y-3 flex flex-col items-center lg:items-start">
                              <div className="w-full max-w-[320px] text-center text-[10px] font-bold text-purple-400/90 uppercase tracking-widest mb-3 font-mono">User & agent roles</div>
                              
                              {/* Solutions Architect */}
                              <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl p-3 w-full max-w-[320px] hover:border-purple-500/30 transition-all group">
                                  <div className="mb-2">
                                      <h3 className="text-sm font-bold text-slate-200 tracking-wide">Solutions architect</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-[11px] leading-relaxed">
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
                                      <h3 className="text-sm font-bold text-slate-200 tracking-wide">Stack operator</h3>
                                  </div>
                                  <div className="space-y-1 text-slate-400 text-[11px] leading-relaxed">
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
