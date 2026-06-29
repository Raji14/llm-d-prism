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

import React, { useState, useEffect } from 'react';
import { Filter, ChevronDown, ChevronUp, Check, ArrowDown01, ArrowDown10, Loader, FileText, FileClock, Sliders, Search, Activity, TrendingUp, ShieldCheck, Database, Layout, HelpCircle, Bookmark, Trash2, Settings, X, Pencil } from 'lucide-react';
import { MultiSelectDropdown } from '../common';
import { USE_CASE_META, formatOriginLabel } from '../../utils/dashboardHelpers';

const SPEC_LABELS = {
    hardware: 'Hardware Spec',
    timestamp: 'Timestamp',
    stage: 'Stage Count',
    nodes: 'Nodes & Parallelism',
    islOsl: 'ISL/OSL',
    maxTput: 'Max Throughput',
    minLat: 'Min Latency',
    qps: 'QPS',
    inputTput: 'Input Tok/s',
    outputTput: 'Output Tok/s',
    totalTput: 'Total Tok/s',
    ntpot: 'NTPOT (ms)',
    tpot: 'TPOT (ms)',
    itl: 'ITL (ms)',
    ttft: 'TTFT (ms)',
    e2e: 'E2E Latency',
    costIn: 'Cost/1M In ($)',
    costOut: 'Cost/1M Out ($)',
    inputLen: 'Input Length',
    outputLen: 'Output Length'
};

const FILTER_FIELD_LABELS = {
    servingStack: 'Serving Stack',
    modelServer: 'Model Server',
    optimizations: 'Optimizations',
    components: 'Components',
    pdRatio: 'P/D Node Ratio',
    isl: 'Input (ISL)',
    osl: 'Output (OSL)',
    ratio: 'Workload Type',
    useCase: 'Use Case',
    hardware: 'Accelerators',
    acc_count: 'Accelerator Count'
};

const getKpiFilterLabel = (filter) => {
    switch (filter) {
        case 'my-uploads': return 'My Submissions';
        case 'staged': return 'Staged';
        case 'processing': return 'Pending Processing';
        case 'in_review': return 'In Review';
        case 'approved': return 'Public';
        case 'action': return 'Rejected';
        default: return filter;
    }
};

export const FilterPanel = ({
    showFilterPanel,
    filterOptions,
    activeFilters,
    facetCounts,
    toggleFilter,
    selectedModels,
    modelStats,
    filteredBySource,
    showSelectedOnly,
    setShowSelectedOnly,
    selectedBenchmarks,
    setSelectedBenchmarks,
    setActiveFilters,
    expandedModels,
    toggleBenchmark,
    toggleModelExpansion,
    baselineBenchmarkKey,
    setBaselineBenchmarkKey,
    UnifiedDataTable,
    hideShowSelectedOnly,
    renameClearToUnselectAll,
    brv02Runs, brv02CustomLabels, setBrv02CustomLabels, removeBrv02Run,
    setShowDataPanel,
    submissionsMap = {},
    isLoadingSubmissions = false,
    loadSubmissions,
    searchTerm, setSearchTerm, kpiFilter, setKpiFilter,
    updateSubmissionStatus
}) => {
    const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
    const [draftFilters, setDraftFilters] = useState(null);
    const [openSections, setOpenSections] = useState({
        stack: true,
        infra: false,
        load: false,
        conn: false
    });

    const toggleSection = (section) => {
        setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    // Sync draft filters with activeFilters when the drawer opens
    useEffect(() => {
        if (isAdvancedExpanded) {
            const draft = {};
            Object.entries(activeFilters).forEach(([key, val]) => {
                draft[key] = new Set(val);
            });
            setDraftFilters(draft);
        } else {
            setDraftFilters(null);
        }
    }, [isAdvancedExpanded, activeFilters]);

    const toggleDraftFilter = (category, value) => {
        setDraftFilters(prev => {
            if (!prev) return prev;
            const newSet = new Set(prev[category] || []);
            if (value === '' || value === undefined) {
                newSet.clear();
            } else {
                if (newSet.has(value)) newSet.delete(value);
                else newSet.add(value);
            }
            return { ...prev, [category]: newSet };
        });
    };

    const [showSpecsDropdown, setShowSpecsDropdown] = useState(false);
    const [isTimelineExpanded, setIsTimelineExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_timeline_expanded');
            return saved !== null ? saved === 'true' : true;
        } catch { return true; }
    });

    const toggleTimelineExpanded = () => {
        setIsTimelineExpanded(prev => {
            const next = !prev;
            try {
                localStorage.setItem('prism_manage_timeline_expanded', String(next));
            } catch (e) {}
            return next;
        });
    };

    // Filter Presets State and Handlers
    const [presets, setPresets] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_presets');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    const [newPresetName, setNewPresetName] = useState('');
    const [editingPreset, setEditingPreset] = useState(null);
    const [editPresetName, setEditPresetName] = useState('');
    const [editPresetFilters, setEditPresetFilters] = useState({});
    const [editPresetKpi, setEditPresetKpi] = useState(null);
    const [editPresetSearch, setEditPresetSearch] = useState('');

    const isPresetActive = (preset) => {
        if ((preset.searchTerm || '') !== (searchTerm || '')) return false;
        if ((preset.kpiFilter || null) !== (kpiFilter || null)) return false;
        
        const allFields = new Set([
            ...Object.keys(activeFilters),
            ...Object.keys(preset.filters || {})
        ]);
        
        for (const field of allFields) {
            const currentSet = activeFilters[field];
            const presetArr = preset.filters?.[field] || [];
            
            const currentSize = currentSet instanceof Set ? currentSet.size : 0;
            const presetSize = presetArr.length;
            
            if (currentSize !== presetSize) return false;
            if (currentSize > 0) {
                for (const val of presetArr) {
                    if (!currentSet.has(val)) return false;
                }
            }
        }
        return true;
    };

    const applyPreset = (preset) => {
        setSearchTerm(preset.searchTerm || '');
        setKpiFilter(preset.kpiFilter || null);
        const newFilters = {};
        Object.keys(activeFilters).forEach(key => {
            newFilters[key] = new Set(preset.filters?.[key] || []);
        });
        setActiveFilters(newFilters);
    };

    const hasFiltersToSave = React.useMemo(() => {
        const filtersToUse = draftFilters || activeFilters;
        const hasActiveFilters = Object.values(filtersToUse).some(valSet => valSet instanceof Set && valSet.size > 0);
        return hasActiveFilters || !!searchTerm || !!kpiFilter;
    }, [draftFilters, activeFilters, searchTerm, kpiFilter]);

    const handleSavePreset = (e) => {
        e.preventDefault();
        if (!newPresetName.trim() || !hasFiltersToSave) return;
        
        const filtersToUse = draftFilters || activeFilters;
        const filtersToSave = {};
        Object.entries(filtersToUse).forEach(([key, set]) => {
            if (set instanceof Set && set.size > 0) {
                filtersToSave[key] = Array.from(set);
            }
        });
        
        const newPreset = {
            id: Date.now().toString(),
            name: newPresetName.trim(),
            filters: filtersToSave,
            kpiFilter: kpiFilter || null,
            searchTerm: searchTerm || ''
        };
        
        const updated = [...presets, newPreset];
        setPresets(updated);
        try {
            localStorage.setItem('prism_manage_presets', JSON.stringify(updated));
        } catch (e) { console.warn(e); }
        setNewPresetName('');
    };

    const handleDeletePreset = (presetId) => {
        const updated = presets.filter(p => p.id !== presetId);
        setPresets(updated);
        try {
            localStorage.setItem('prism_manage_presets', JSON.stringify(updated));
        } catch (e) { console.warn(e); }
        if (editingPreset?.id === presetId) {
            setEditingPreset(null);
        }
    };

    const handleUpdatePreset = () => {
        if (!editingPreset || !editPresetName.trim()) return;
        const updated = presets.map(p => {
            if (p.id === editingPreset.id) {
                return {
                    ...p,
                    name: editPresetName.trim(),
                    filters: editPresetFilters,
                    kpiFilter: editPresetKpi,
                    searchTerm: editPresetSearch
                };
            }
            return p;
        });
        setPresets(updated);
        try {
            localStorage.setItem('prism_manage_presets', JSON.stringify(updated));
        } catch (e) { console.warn(e); }
        setEditingPreset(null);
    };

    const openEditPreset = (preset) => {
        setEditingPreset(preset);
        setEditPresetName(preset.name);
        setEditPresetFilters({ ...preset.filters });
        setEditPresetKpi(preset.kpiFilter || null);
        setEditPresetSearch(preset.searchTerm || '');
        setIsAdvancedExpanded(true);
    };


    const [groupBy, setGroupBy] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_group_by');
            return saved || 'Model';
        } catch { return 'Model'; }
    });
    
    const [sortByField, setSortByField] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_sort_by');
            return saved || 'timestamp';
        } catch { return 'timestamp'; }
    });

    const [sortDirection, setSortDirection] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_sort_dir');
            return saved || 'desc';
        } catch { return 'desc'; }
    });

    const [isFiltersExpanded, setIsFiltersExpanded] = useState(() => {
        try {
            const saved = localStorage.getItem('prism_manage_filters_expanded');
            return saved !== null ? saved === 'true' : true;
        } catch { return true; }
    });

    const [visibleSpecs, setVisibleSpecs] = useState(() => {
        const defaults = {
            hardware: true,
            timestamp: true,
            stage: true,
            nodes: false,
            islOsl: false,
            maxTput: true,
            minLat: true,
            qps: false,
            inputTput: false,
            outputTput: false,
            totalTput: false,
            ntpot: false,
            tpot: false,
            itl: false,
            ttft: false,
            e2e: false,
            costIn: false,
            costOut: false,
            inputLen: false,
            outputLen: false
        };
        try {
            const saved = localStorage.getItem('prism_manage_visible_specs');
            if (saved) {
                return { ...defaults, ...JSON.parse(saved) };
            }
        } catch (e) {
            console.warn("Failed to load visible specs from local storage", e);
        }
        return defaults;
    });

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_group_by', groupBy);
        } catch (e) { console.warn(e); }
    }, [groupBy]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_sort_by', sortByField);
        } catch (e) { console.warn(e); }
    }, [sortByField]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_sort_dir', sortDirection);
        } catch (e) { console.warn(e); }
    }, [sortDirection]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_filters_expanded', isFiltersExpanded.toString());
        } catch (e) { console.warn(e); }
    }, [isFiltersExpanded]);

    useEffect(() => {
        try {
            localStorage.setItem('prism_manage_visible_specs', JSON.stringify(visibleSpecs));
        } catch (e) { console.warn(e); }
    }, [visibleSpecs]);

    // Calculate totals for KPI category cards
    const totalCount = modelStats.length;
    
    const verifiedCount = modelStats.filter(s => {
        const src = s.data?.[0]?.source || '';
        return src.startsWith('brv02:');
    }).length;

    const legacyCount = totalCount - verifiedCount;

    const statusCounts = React.useMemo(() => {
        let staged = 0;
        let processing = 0;
        let inReview = 0;
        let approved = 0;
        let rejected = 0;

        modelStats.forEach(s => {
            const src = s.data?.[0]?.source || '';
            if (src.startsWith('brv02:')) {
                const runId = src.replace('brv02:', '');
                const sub = submissionsMap ? submissionsMap[runId] : null;
                const status = sub?.status || 'staged';
                
                if (status === 'staged') staged++;
                else if (status === 'submitted_pending_processing') processing++;
                else if (status === 'submitted_pending_review' || status === 'in_review') inReview++;
                else if (status === 'public' || status === 'promoted' || status === 'approved') approved++;
                else if (status === 'rejected' || status === 'changes_requested') rejected++;
            }
        });

        return { staged, processing, inReview, approved, rejected };
    }, [modelStats, submissionsMap]);

    // Active regressions count
    const regressionCount = React.useMemo(() => {
        if (!baselineBenchmarkKey) return 0;
        let count = 0;
        modelStats.forEach(s => {
            if (s.benchmarkKey === baselineBenchmarkKey) return;
            const baseline = modelStats.find(b => b.benchmarkKey === baselineBenchmarkKey);
            if (!baseline) return;
            const currentTput = s.maxTput || 0;
            const baseTput = baseline.maxTput || 0;
            if (baseTput === 0) return;
            const tputDelta = ((currentTput - baseTput) / baseTput) * 100;
            if (tputDelta < -5) {
                count++;
            }
        });
        return count;
    }, [modelStats, baselineBenchmarkKey]);

    // Pareto frontier runs calculation
    const paretoKeys = React.useMemo(() => {
        const optimal = [];
        modelStats.forEach(stat => {
            if (!stat.maxTput || !stat.minLat) return;
            const isDomDominated = modelStats.some(other => {
                if (other === stat) return false;
                if (!other.maxTput || !other.minLat) return false;
                return other.maxTput >= stat.maxTput && other.minLat <= stat.minLat && (other.maxTput > stat.maxTput || other.minLat < stat.minLat);
            });
            if (!isDomDominated) optimal.push(stat.benchmarkKey);
        });
        return new Set(optimal);
    }, [modelStats]);

    const paretoCount = paretoKeys.size;

    if (!showFilterPanel) return null;

    return (
        <div className="flex flex-col mb-4">
                {/* Hero Category KPI Cards */}
                <div className="flex flex-col xl:flex-row gap-4 mb-6 relative z-[20]">
                    {/* Combined Group: Database & Ingestion Overview */}
                    {/* Group 1: Submissions Pipeline */}
                    <div className="flex-1 xl:flex-[4.5] flex flex-col justify-start p-3.5 rounded-2xl bg-[#09101d] border border-[#0d2a4a] w-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-cyan-500/40 hover:shadow-[0_10px_30px_rgba(6,182,212,0.06)] transition-all duration-300 min-h-[118px]">
                        {/* Header */}
                        <div className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider pb-1.5 border-b border-slate-900/60 flex items-center justify-between select-none mb-2.5">
                            <div className="flex flex-col">
                                <span className="flex items-center gap-1.5">
                                    Submissions Pipeline
                                </span>
                                <span className="text-[9px] text-slate-500 font-medium normal-case tracking-normal mt-0.5">Click metrics below to filter results</span>
                            </div>
                            <div className="relative group/tooltip inline-block cursor-help shrink-0">
                                <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-cyan-400 transition-colors" />
                                <div className="absolute right-0 top-5 mt-1.5 px-3.5 py-3 bg-slate-900/95 border border-slate-700/50 text-slate-200 text-[11px] font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-[300px] pointer-events-none leading-relaxed normal-case tracking-normal backdrop-blur-md space-y-2">
                                    <div className="font-bold text-xs text-white border-b border-slate-800 pb-1 mb-1 font-sans">Pipeline & Registry:</div>
                                    <p className="text-[10px] pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-cyan-400" /> <strong>Global Registry</strong>: Total verified runs loaded into global database.</p>
                                    <p className="text-[10px] pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-amber-500" /> <strong>Staged</strong>: Contributor telemetries staged locally in browser session.</p>
                                    <p className="text-[10px] pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-yellow-500" /> <strong>Processing</strong>: Automated format and validation sanity checks in bucket.</p>
                                    <p className="text-[10px] pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-purple-500" /> <strong>In Review</strong>: Telemetries in manual queue for admin verification.</p>
                                    <p className="text-[10px] pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-emerald-500" /> <strong>Public</strong>: Approved telemetries indexed and globally visible.</p>
                                    <p className="text-[10px] pl-3.5 relative select-none"><span className="absolute left-0 top-[5px] w-1.5 h-1.5 rounded-sm bg-red-500" /> <strong>Rejected</strong>: Declined runs or failed verification checks.</p>
                                </div>
                            </div>
                        </div>

                        <div id="manage-tour-summary" className="flex flex-col md:flex-row gap-5 items-start w-full mt-1">
                            {/* Left Side: DB Summary Stats */}
                            <div className="flex flex-row shrink-0 gap-6 md:border-r border-slate-900/60 md:pr-6 select-none pt-1">
                                {/* Card 1a: Global Registry */}
                                <div 
                                    onClick={() => setKpiFilter(null)}
                                    className="flex flex-col cursor-pointer select-none group/item relative min-w-[75px]"
                                >
                                    <span className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider mb-1 group-hover/item:text-white transition-colors">Global Registry</span>
                                    <span className={`text-xl font-black font-mono tracking-tight transition-all duration-300 border-b border-dashed ${
                                        kpiFilter === null 
                                        ? 'text-cyan-400 border-cyan-400/50 drop-shadow-[0_0_10px_rgba(6,182,212,0.35)] scale-105' 
                                        : 'text-white border-slate-700/60 group-hover/item:border-cyan-400/55 group-hover/item:text-cyan-400'
                                    } pb-0.5 self-start`}>
                                        {totalCount}
                                    </span>
                                </div>

                                {/* Card 1b: My Submissions */}
                                <div 
                                    onClick={() => setKpiFilter(kpiFilter === 'my-uploads' ? null : 'my-uploads')}
                                    className="flex flex-col cursor-pointer select-none group/item relative min-w-[70px]"
                                >
                                    <span className="text-[10.5px] font-black uppercase text-slate-400 tracking-wider mb-1 group-hover/item:text-white transition-colors">My Submissions</span>
                                    <span className={`text-xl font-black font-mono tracking-tight transition-all duration-300 border-b border-dashed ${
                                        kpiFilter === 'my-uploads' 
                                        ? 'text-cyan-400 border-cyan-400/50 drop-shadow-[0_0_10px_rgba(6,182,212,0.35)] scale-105' 
                                        : 'text-white border-slate-700/60 group-hover/item:border-cyan-400/55 group-hover/item:text-cyan-400'
                                    } pb-0.5 self-start`}>
                                        {verifiedCount}
                                    </span>
                                </div>
                            </div>

                            {/* Right Side: Segment Bar & Submission pipeline Dials */}
                            <div className="flex-1 w-full flex flex-col space-y-2">
                                {(() => {
                                    const { staged, processing, inReview, approved, rejected } = statusCounts;
                                    const totalSubmissions = staged + processing + inReview + approved + rejected;
                                    
                                    const pStaged = totalSubmissions > 0 ? (staged / totalSubmissions) * 100 : 0;
                                    const pProcessing = totalSubmissions > 0 ? (processing / totalSubmissions) * 100 : 0;
                                    const pInReview = totalSubmissions > 0 ? (inReview / totalSubmissions) * 100 : 0;
                                    const pApproved = totalSubmissions > 0 ? (approved / totalSubmissions) * 100 : 0;
                                    const pRejected = totalSubmissions > 0 ? (rejected / totalSubmissions) * 100 : 0;

                                    return (
                                        <div className="space-y-1.5 w-full bg-slate-900/10 dark:bg-slate-950/20 border border-slate-900/40 p-2 rounded-xl shadow-inner">
                                            {/* Segmented ratio bar */}
                                            <div className="w-full h-1.5 rounded-full overflow-hidden flex bg-slate-950 shadow-inner border border-slate-900/40">
                                                {totalSubmissions === 0 ? (
                                                    <div className="w-full h-full bg-slate-800" />
                                                ) : (
                                                    <>
                                                        {staged > 0 && (
                                                            <div 
                                                                style={{ width: `${pStaged}%` }} 
                                                                className="h-full bg-amber-500 hover:opacity-85 transition-opacity cursor-pointer"
                                                                onClick={() => setKpiFilter(kpiFilter === 'staged' ? null : 'staged')}
                                                                title={`Staged: ${staged} (${Math.round(pStaged)}%)`}
                                                            />
                                                        )}
                                                        {processing > 0 && (
                                                            <div 
                                                                style={{ width: `${pProcessing}%` }} 
                                                                className="h-full bg-yellow-500 hover:opacity-85 transition-opacity cursor-pointer"
                                                                onClick={() => setKpiFilter(kpiFilter === 'processing' ? null : 'processing')}
                                                                title={`Pending Processing: ${processing} (${Math.round(pProcessing)}%)`}
                                                            />
                                                        )}
                                                        {inReview > 0 && (
                                                            <div 
                                                                style={{ width: `${pInReview}%` }} 
                                                                className="h-full bg-purple-500 hover:opacity-85 transition-opacity cursor-pointer"
                                                                onClick={() => setKpiFilter(kpiFilter === 'in_review' ? null : 'in_review')}
                                                                title={`In Review: ${inReview} (${Math.round(pInReview)}%)`}
                                                            />
                                                        )}
                                                        {approved > 0 && (
                                                            <div 
                                                                style={{ width: `${pApproved}%` }} 
                                                                className="h-full bg-emerald-500 hover:opacity-85 transition-opacity cursor-pointer"
                                                                onClick={() => setKpiFilter(kpiFilter === 'approved' ? null : 'approved')}
                                                                title={`Public: ${approved} (${Math.round(pApproved)}%)`}
                                                            />
                                                        )}
                                                        {rejected > 0 && (
                                                            <div 
                                                                style={{ width: `${pRejected}%` }} 
                                                                className="h-full bg-red-500 hover:opacity-85 transition-opacity cursor-pointer"
                                                                onClick={() => setKpiFilter(kpiFilter === 'action' ? null : 'action')}
                                                                title={`Rejected: ${rejected} (${Math.round(pRejected)}%)`}
                                                            />
                                                        )}
                                                    </>
                                                )}
                                            </div>

                                            {/* Columns */}
                                            <div className="grid grid-cols-5 gap-1 text-[12px] font-bold text-slate-350 select-none mb-1">
                                                <div 
                                                    onClick={() => setKpiFilter(kpiFilter === 'staged' ? null : 'staged')}
                                                    className={`flex flex-col items-center p-1 rounded-lg border border-transparent transition-all hover:bg-white/5 cursor-pointer text-center ${
                                                        kpiFilter === 'staged' ? 'bg-amber-500/5 border-amber-500/10 shadow-sm' : ''
                                                    }`}
                                                >
                                                    <span className="text-[9px] font-black uppercase text-slate-400 select-none mb-0.5 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded bg-amber-500 shrink-0" /> Staged
                                                    </span>
                                                    <span className={`text-[13px] font-black font-mono transition-colors ${
                                                        kpiFilter === 'staged' ? 'text-amber-450 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-amber-500'
                                                    }`}>{staged}</span>
                                                </div>

                                                <div 
                                                    onClick={() => setKpiFilter(kpiFilter === 'processing' ? null : 'processing')}
                                                    className={`flex flex-col items-center p-1 rounded-lg border border-transparent transition-all hover:bg-white/5 cursor-pointer text-center ${
                                                        kpiFilter === 'processing' ? 'bg-yellow-500/5 border-yellow-500/10 shadow-sm' : ''
                                                    }`}
                                                >
                                                    <span className="text-[9px] font-black uppercase text-slate-400 select-none mb-0.5 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded bg-yellow-500 shrink-0" /> Process
                                                    </span>
                                                    <span className={`text-[13px] font-black font-mono transition-colors ${
                                                        kpiFilter === 'processing' ? 'text-yellow-400 drop-shadow-[0_0_8px_rgba(234,179,8,0.3)]' : 'text-yellow-500'
                                                    }`}>{processing}</span>
                                                </div>

                                                <div 
                                                    onClick={() => setKpiFilter(kpiFilter === 'in_review' ? null : 'in_review')}
                                                    className={`flex flex-col items-center p-1 rounded-lg border border-transparent transition-all hover:bg-white/5 cursor-pointer text-center ${
                                                        kpiFilter === 'in_review' ? 'bg-purple-500/5 border-purple-500/10 shadow-sm' : ''
                                                    }`}
                                                >
                                                    <span className="text-[9px] font-black uppercase text-slate-400 select-none mb-0.5 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded bg-purple-500 shrink-0" /> Review
                                                    </span>
                                                    <span className={`text-[13px] font-black font-mono transition-colors ${
                                                        kpiFilter === 'in_review' ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.3)]' : 'text-purple-500'
                                                    }`}>{inReview}</span>
                                                </div>

                                                <div 
                                                    onClick={() => setKpiFilter(kpiFilter === 'approved' ? null : 'approved')}
                                                    className={`flex flex-col items-center p-1 rounded-lg border border-transparent transition-all hover:bg-white/5 cursor-pointer text-center ${
                                                        kpiFilter === 'approved' ? 'bg-emerald-500/5 border-emerald-500/10 shadow-sm' : ''
                                                    }`}
                                                >
                                                    <span className="text-[9px] font-black uppercase text-slate-400 select-none mb-0.5 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded bg-emerald-500 shrink-0" /> Public
                                                    </span>
                                                    <span className={`text-[13px] font-black font-mono transition-colors ${
                                                        kpiFilter === 'approved' ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]' : 'text-emerald-500'
                                                    }`}>{approved}</span>
                                                </div>

                                                <div 
                                                    onClick={() => setKpiFilter(kpiFilter === 'action' ? null : 'action')}
                                                    className={`flex flex-col items-center p-1 rounded-lg border border-transparent transition-all hover:bg-white/5 cursor-pointer text-center ${
                                                        kpiFilter === 'action' ? 'bg-red-500/5 border-red-500/10 shadow-sm' : ''
                                                    }`}
                                                >
                                                    <span className="text-[9px] font-black uppercase text-slate-400 select-none mb-0.5 flex items-center gap-1">
                                                        <span className="w-1.5 h-1.5 rounded bg-red-500 shrink-0" /> Rejected
                                                    </span>
                                                    <span className={`text-[13px] font-black font-mono transition-colors ${
                                                        kpiFilter === 'action' ? 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.3)]' : 'text-red-550'
                                                    }`}>{rejected}</span>
                                                </div>
                                            </div>

                                            {/* Breakdown Label at bottom */}
                                            <div className="flex justify-center items-center text-[9.5px] uppercase tracking-wider text-slate-500 font-bold px-1 select-none pt-1 border-t border-slate-900/40">
                                                <span>My Uploads Status Breakdown</span>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Group 2: Format Compliance */}
                    <div className="flex-1 xl:flex-[2] flex flex-col justify-start p-3.5 rounded-2xl bg-[#09150e] border border-[#0d3420] w-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-emerald-500/40 hover:shadow-[0_10px_30px_rgba(16,185,129,0.06)] transition-all duration-300 min-h-[118px]">
                        {/* Group Header inside card */}
                        <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider pb-1.5 border-b border-slate-900/60 flex items-center justify-between select-none mb-2.5">
                            Format Compliance
                        </div>

                        <div className="flex items-center gap-2 w-full mt-2 pt-0.5">
                            {/* Card 2: Production Ready */}
                            <div 
                                onClick={() => setKpiFilter(kpiFilter === 'verified' ? null : 'verified')}
                                className="flex-1 flex flex-col justify-between cursor-pointer select-none group/item relative"
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-350 select-none group-hover/item:text-white transition-colors">v0.2 Compliant</span>
                                    <div className="relative group/tooltip inline-block cursor-help shrink-0">
                                        <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-emerald-400 transition-colors" />
                                        <div className="absolute left-1/2 -translate-x-1/2 top-5 mt-1.5 px-3 py-2 bg-slate-900/95 border border-slate-700/50 text-slate-200 text-[11px] font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-[200px] pointer-events-none leading-relaxed font-sans normal-case tracking-normal backdrop-blur-md">
                                            Filters runs validated under v0.2 production criteria, certified safe to run in production.
                                        </div>
                                    </div>
                                </div>
                                <div className={`text-2xl font-black font-mono tracking-tight transition-all duration-300 border-b border-dashed ${
                                    kpiFilter === 'verified' 
                                    ? 'text-emerald-400 border-emerald-400/50 drop-shadow-[0_0_10px_rgba(16,185,129,0.35)] scale-105' 
                                    : 'text-white border-slate-700/60 group-hover/item:border-emerald-400/55 group-hover/item:text-emerald-400'
                                } pb-0.5 mt-1 self-start`}>
                                    {verifiedCount}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-8 bg-slate-900/65 shrink-0" />

                            {/* Card 3: Legacy Formats */}
                            <div 
                                onClick={() => setKpiFilter(kpiFilter === 'legacy' ? null : 'legacy')}
                                className="flex-1 flex flex-col justify-between cursor-pointer select-none group/item relative"
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-350 select-none group-hover/item:text-white transition-colors">v0.1 Legacy</span>
                                    <div className="relative group/tooltip inline-block cursor-help shrink-0">
                                        <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-slate-400 transition-colors" />
                                        <div className="absolute left-1/2 -translate-x-1/2 top-5 mt-1.5 px-3 py-2 bg-slate-900/95 border border-slate-700/50 text-slate-200 text-[11px] font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-[200px] pointer-events-none leading-relaxed font-sans normal-case tracking-normal backdrop-blur-md">
                                            Filters runs loaded using historical v0.1 schema formats or legacy benchmark steady-state assumptions.
                                        </div>
                                    </div>
                                </div>
                                <div className={`text-2xl font-black font-mono tracking-tight transition-all duration-300 border-b border-dashed ${
                                    kpiFilter === 'legacy' 
                                    ? 'text-slate-400 border-slate-400/50 drop-shadow-[0_0_10px_rgba(148,163,184,0.35)] scale-105' 
                                    : 'text-white border-slate-700/60 group-hover/item:border-slate-400/55 group-hover/item:text-slate-400'
                                } pb-0.5 mt-1 self-start`}>
                                    {legacyCount}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Group 3: Performance & Drift */}
                    <div className="flex-1 xl:flex-[2] flex flex-col justify-start p-3.5 rounded-2xl bg-[#10091b] border border-[#240d3c] w-full shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] hover:border-purple-500/40 hover:shadow-[0_10px_30px_rgba(168,85,247,0.06)] transition-all duration-300 min-h-[118px]">
                        {/* Group Header inside card */}
                        <div className="text-[11px] font-bold text-purple-400 uppercase tracking-wider pb-1.5 border-b border-slate-900/60 flex items-center justify-between select-none mb-2.5">
                            Performance & Drift
                        </div>

                        <div className="flex items-center gap-2 w-full mt-2 pt-0.5">
                            {/* Card 4: Pareto Frontier */}
                            <div 
                                onClick={() => setKpiFilter(kpiFilter === 'pareto' ? null : 'pareto')}
                                className="flex-1 flex flex-col justify-between cursor-pointer select-none group/item relative"
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-350 select-none group-hover/item:text-white transition-colors">Pareto Frontier</span>
                                    <div className="relative group/tooltip inline-block cursor-help shrink-0">
                                        <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-purple-400 transition-colors" />
                                        <div className="absolute left-1/2 -translate-x-1/2 top-5 mt-1.5 px-3 py-2 bg-slate-900/95 border border-slate-700/50 text-slate-200 text-[11px] font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-[200px] pointer-events-none leading-relaxed font-sans normal-case tracking-normal backdrop-blur-md">
                                            Filters runs to show only cost/performance optimal configurations on the Pareto front.
                                        </div>
                                    </div>
                                </div>
                                <div className={`text-2xl font-black font-mono tracking-tight transition-all duration-300 border-b border-dashed ${
                                    kpiFilter === 'pareto' 
                                    ? 'text-purple-400 border-purple-400/50 drop-shadow-[0_0_10px_rgba(168,85,247,0.35)] scale-105' 
                                    : 'text-white border-slate-700/60 group-hover/item:border-purple-400/55 group-hover/item:text-purple-400'
                                } pb-0.5 mt-1 self-start`}>
                                    {paretoCount}
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-8 bg-slate-900/65 shrink-0" />

                            {/* Card 5: Performance Regressions */}
                            <div 
                                onClick={() => {
                                    if (baselineBenchmarkKey) {
                                        setKpiFilter(kpiFilter === 'regressions' ? null : 'regressions');
                                    }
                                }}
                                className={`flex-1 flex flex-col justify-between select-none group/item relative ${
                                    baselineBenchmarkKey ? 'cursor-pointer' : 'opacity-70 cursor-not-allowed'
                                }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <span className="text-[10.5px] font-bold uppercase tracking-widest text-slate-350 select-none group-hover/item:text-white transition-colors">Active Regressions</span>
                                    <div className="relative group/tooltip inline-block cursor-help shrink-0">
                                        <HelpCircle className="w-3.5 h-3.5 text-slate-500 hover:text-red-400 transition-colors" />
                                        <div className="absolute left-1/2 -translate-x-1/2 top-5 mt-1.5 px-3 py-2 bg-slate-900/95 border border-slate-700/50 text-slate-200 text-[11px] font-medium rounded-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-200 shadow-2xl z-[9999] w-[200px] pointer-events-none leading-relaxed font-sans normal-case tracking-normal backdrop-blur-md">
                                            Filters to show runs suffering performance regression (more than 5% throughput drop) compared to the active baseline.
                                        </div>
                                    </div>
                                </div>
                                <div className={`text-2xl font-black font-mono tracking-tight transition-all duration-300 ${
                                    baselineBenchmarkKey ? 'border-b border-dashed' : ''
                                } ${
                                    !baselineBenchmarkKey 
                                    ? 'text-slate-500 text-xs font-semibold' 
                                    : kpiFilter === 'regressions'
                                    ? 'text-red-400 border-red-400/50 drop-shadow-[0_0_10px_rgba(239,68,68,0.35)] scale-105' 
                                    : 'text-white border-slate-700/60 group-hover/item:border-red-400/55 group-hover/item:text-red-400'
                                } pb-0.5 mt-1 self-start`}>
                                    {baselineBenchmarkKey ? (
                                        regressionCount
                                    ) : (
                                        <span className="text-[9px] font-medium text-slate-500 select-none">Pin baseline first</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Primary Row Controls (Always Visible) */}
                <div className="flex flex-wrap items-center gap-3 bg-[#0d1527] backdrop-blur-xl p-4 border border-slate-800/80 rounded-2xl mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)] relative z-30">
                    {/* Search Bar */}
                    <div id="manage-tour-search" className="relative flex-1 min-w-[240px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Search by model name or hardware..."
                            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-800/40 bg-slate-950 text-slate-100 placeholder-slate-500 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all font-medium"
                        />
                    </div>

                    {/* Primary Dropdowns */}
                    <div className="w-44 flex-shrink-0">
                        <MultiSelectDropdown 
                            label="Models"
                            options={filterOptions.models}
                            selected={activeFilters.models}
                            onChange={(val) => toggleFilter('models', val)}
                            counts={facetCounts.models}
                        />
                    </div>

                    <div className="w-44 flex-shrink-0 border-r border-slate-800/40 pr-3 mr-1">
                        <MultiSelectDropdown 
                            label="Accelerators"
                            options={filterOptions.hardware}
                            selected={activeFilters.hardware}
                            onChange={(val) => toggleFilter('hardware', val)}
                            counts={facetCounts.hardware}
                        />
                    </div>

                    {/* Grouping Selector */}
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-500 font-medium whitespace-nowrap select-none">Group:</span>
                        <select 
                            className="text-xs bg-slate-950/60 border border-slate-900/60 rounded-xl px-2.5 py-2 outline-none focus:border-cyan-500/50 text-slate-200 hover:border-slate-800/80 hover:bg-slate-900/40 transition-all duration-200 font-semibold cursor-pointer"
                            value={groupBy}
                            onChange={(e) => setGroupBy(e.target.value)}
                        >
                            <option value="None">None</option>
                            <option value="Model">Model</option>
                            <option value="Hardware">Hardware</option>
                            <option value="Origin">Source Connections</option>
                            <option value="OriginFolder">Origin/Folder</option>
                        </select>
                    </div>

                    {/* Sorting Selector */}
                    <div className="flex items-center gap-1 border-r border-slate-900/60 pr-3 mr-1">
                        <span className="text-xs text-slate-500 font-medium whitespace-nowrap select-none">Sort:</span>
                        <select 
                            className="text-xs bg-slate-950/60 border border-slate-900/60 rounded-xl px-2.5 py-2 outline-none focus:border-cyan-500/50 text-slate-200 hover:border-slate-800/80 hover:bg-slate-900/40 transition-all duration-200 font-semibold cursor-pointer"
                            value={sortByField}
                            onChange={(e) => setSortByField(e.target.value)}
                        >
                            <option value="timestamp">Timestamp</option>
                            <option value="maxTput">Max Throughput</option>
                            <option value="minLat">Min Latency</option>
                            <option value="model">Model Name</option>
                            <option value="qps">QPS</option>
                            <option value="inputTput">Input Tok/s</option>
                            <option value="outputTput">Output Tok/s</option>
                            <option value="totalTput">Total Tok/s</option>
                            <option value="ntpot">NTPOT</option>
                            <option value="tpot">TPOT</option>
                            <option value="itl">ITL</option>
                            <option value="ttft">TTFT</option>
                            <option value="e2e">E2E Latency</option>
                            <option value="costIn">Cost/1M In</option>
                            <option value="costOut">Cost/1M Out</option>
                        </select>
                        <button
                            onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')}
                            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-950/60 rounded-xl border border-slate-900/60 hover:border-slate-850 hover:bg-slate-900/40 transition-colors cursor-pointer flex items-center justify-center"
                        >
                            {sortDirection === 'asc' ? <ArrowDown01 size={13} /> : <ArrowDown10 size={13} />}
                        </button>
                    </div>

                    {/* Columns Dropdown (Metrics Selector) */}
                    <div className="relative">
                        <button 
                            onClick={() => setShowSpecsDropdown(!showSpecsDropdown)}
                            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-900/60 bg-slate-950/60 hover:border-slate-850 hover:bg-slate-900/40 text-slate-200 cursor-pointer flex items-center gap-1.5 transition-colors"
                        >
                            <Sliders className="w-3.5 h-3.5" /> Metrics ({Object.values(visibleSpecs).filter(Boolean).length})
                        </button>
                        {showSpecsDropdown && (
                            <>
                                <div className="fixed inset-0 z-20" onClick={() => setShowSpecsDropdown(false)} />
                                <div className="absolute right-0 mt-2 w-72 bg-slate-950/95 border border-slate-900 rounded-xl shadow-2xl p-4 z-[100] grid grid-cols-1 gap-2 max-h-96 overflow-y-auto backdrop-blur-md">
                                    <div className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 mb-1">Toggle visible columns</div>
                                    {Object.entries(SPEC_LABELS).map(([key, label]) => {
                                        const isSelected = visibleSpecs[key];
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setVisibleSpecs(prev => ({ ...prev, [key]: !prev[key] }))}
                                                className={`w-full text-left px-2 py-1.5 text-xs rounded-lg transition-all flex items-center gap-2 cursor-pointer ${isSelected ? 'bg-cyan-500/10 text-cyan-400 font-semibold' : 'text-slate-400 hover:text-slate-200'}`}
                                            >
                                                <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${isSelected ? 'bg-cyan-500 border-cyan-500 text-white' : 'border-slate-800 bg-slate-950'}`}>
                                                    {isSelected && <Check size={10} strokeWidth={3} />}
                                                </div>
                                                {label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Advanced Toggle */}
                    <button 
                        id="manage-tour-filter-toggle"
                        onClick={() => setIsAdvancedExpanded(!isAdvancedExpanded)}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-950/60 text-slate-200 border border-slate-900/60 hover:border-slate-850 hover:bg-slate-900/40 cursor-pointer flex items-center gap-1 transition-colors"
                    >
                        {isAdvancedExpanded ? <><ChevronUp size={14} /> Basic Filters</> : <><ChevronDown size={14} /> Advanced Filters</>}
                    </button>
                </div>

                {/* Saved Preset Chips Row (Always Visible on Main Page) */}
                {presets.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-4 px-1 select-none animate-in fade-in duration-200">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                            <Bookmark className="w-3 h-3 text-cyan-500" /> Presets:
                        </span>
                        {presets.map((preset) => {
                            const isActive = isPresetActive(preset);
                            return (
                                <button
                                    key={preset.id}
                                    onClick={() => applyPreset(preset)}
                                    className={`px-3 py-1 text-xs rounded-xl font-medium transition-all cursor-pointer border flex items-center gap-1.5 ${
                                        isActive 
                                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40 font-semibold shadow-sm shadow-cyan-500/10' 
                                        : 'bg-slate-950/40 text-slate-400 border-slate-850 hover:text-slate-200 hover:border-slate-800'
                                    }`}
                                >
                                    {isActive && <Check className="w-3 h-3 text-cyan-400 stroke-[2.5] animate-in zoom-in-50 duration-200" />}
                                    <span>{preset.name}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Advanced Filters Backdrop */}
                {isAdvancedExpanded && (
                    <div 
                        className="fixed inset-0 bg-black/40 z-[55] backdrop-blur-[1.5px] transition-opacity duration-200"
                        onClick={() => setIsAdvancedExpanded(false)}
                    />
                )}

                {/* Advanced Filters Drawer */}
                <div className={`fixed inset-y-0 right-0 w-[420px] bg-slate-950/95 border-l border-slate-900 shadow-2xl z-[60] flex flex-col transform transition-transform duration-300 backdrop-blur-xl ${isAdvancedExpanded ? 'translate-x-0' : 'translate-x-full'}`}>
                    {/* Header */}
                    <div className="bg-slate-950/40 p-4 border-b border-slate-900/60 flex items-center justify-between select-none">
                        <div className="flex items-center gap-2">
                            <Sliders className="w-4 h-4 text-cyan-400" />
                            <span className="text-sm font-bold text-white tracking-wide">Advanced Filters</span>
                        </div>
                        <button 
                            onClick={() => setIsAdvancedExpanded(false)}
                            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-all cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Scrollable Content */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                        {/* Saved Presets Section */}
                        <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-900/60 shadow-md shadow-slate-950/20 space-y-3.5 mb-2">
                            <h4 className="text-[10px] font-black uppercase tracking-wider text-cyan-400 border-b border-slate-800/60 pb-1.5 flex items-center gap-1.5 select-none">
                                <Bookmark className="w-3.5 h-3.5" /> Saved Filter Presets
                            </h4>
                            
                            {editingPreset ? (
                                /* Edit Preset Inline Mode */
                                <div className="space-y-4 pt-1 animate-in fade-in duration-200">
                                    <div className="flex items-center justify-between border-b border-slate-800/40 pb-1.5 select-none">
                                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">
                                            Editing Preset
                                        </span>
                                        <button 
                                            onClick={() => setEditingPreset(null)}
                                            className="text-slate-500 hover:text-white transition-colors cursor-pointer"
                                            title="Cancel editing"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>

                                    {/* Inline Name Input */}
                                    <div className="space-y-1.5">
                                        <label className="text-[8px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Preset Name</label>
                                        <input 
                                            type="text"
                                            value={editPresetName}
                                            onChange={(e) => setEditPresetName(e.target.value)}
                                            className="w-full px-3 py-1.5 text-xs text-white bg-[#0b0f17] border border-slate-800 rounded-xl focus:outline-none focus:border-cyan-500/40 flex-1 font-medium"
                                        />
                                    </div>

                                    {/* Inline Preset Filters List */}
                                    <div className="space-y-1.5">
                                        <label className="text-[8px] font-extrabold uppercase tracking-widest text-slate-400 select-none">Saved Filter Parameters</label>
                                        <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                                            {editPresetSearch && (
                                                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/40 rounded-xl px-2.5 py-1 text-[10px]">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="text-[8px] text-slate-500 font-bold uppercase select-none">Search:</span>
                                                        <span className="font-medium text-cyan-400 font-mono truncate">"{editPresetSearch}"</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setEditPresetSearch('')}
                                                        className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            )}

                                            {editPresetKpi && (
                                                <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800/40 rounded-xl px-2.5 py-1 text-[10px]">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <span className="text-[8px] text-slate-500 font-bold uppercase select-none">KPI Filter:</span>
                                                        <span className="font-medium text-cyan-400 truncate">{getKpiFilterLabel(editPresetKpi)}</span>
                                                    </div>
                                                    <button 
                                                        onClick={() => setEditPresetKpi(null)}
                                                        className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            )}

                                            {Object.entries(editPresetFilters).map(([field, values]) => {
                                                if (!Array.isArray(values) || values.length === 0) return null;
                                                const fieldLabel = FILTER_FIELD_LABELS[field] || field;

                                                return values.map(val => (
                                                    <div key={`${field}-${val}`} className="flex items-center justify-between bg-slate-900/60 border border-slate-800/40 rounded-xl px-2.5 py-1 text-[10px]">
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            <span className="text-[8px] text-slate-500 font-bold uppercase select-none">{fieldLabel}:</span>
                                                            <span className="font-medium text-cyan-400 truncate">{field === 'origins' ? val : val}</span>
                                                        </div>
                                                        <button 
                                                            onClick={() => {
                                                                setEditPresetFilters(prev => {
                                                                    const updated = { ...prev };
                                                                    updated[field] = updated[field].filter(x => x !== val);
                                                                    if (updated[field].length === 0) delete updated[field];
                                                                    return updated;
                                                                });
                                                            }}
                                                            className="text-slate-500 hover:text-red-400 transition-colors cursor-pointer"
                                                        >
                                                            <X size={10} />
                                                        </button>
                                                    </div>
                                                ));
                                            })}

                                            {(!editPresetSearch && !editPresetKpi && Object.keys(editPresetFilters).length === 0) && (
                                                <div className="text-center py-4 text-slate-500 text-[10px] select-none italic">
                                                    No filters configured in this preset.
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Inline Actions Row */}
                                    <div className="flex items-center justify-between border-t border-slate-800/40 pt-3 mt-1.5">
                                        <button 
                                            type="button"
                                            onClick={() => handleDeletePreset(editingPreset.id)}
                                            className="px-2.5 py-1.5 text-[9px] font-bold uppercase text-red-400 hover:text-white border border-red-500/20 hover:border-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-xl transition-all cursor-pointer flex items-center gap-1"
                                        >
                                            <Trash2 size={10} /> Delete
                                        </button>

                                        <div className="flex gap-1.5">
                                            <button 
                                                type="button"
                                                onClick={() => setEditingPreset(null)}
                                                className="px-2.5 py-1.5 text-[9px] font-bold uppercase text-slate-400 hover:text-white border border-slate-800 rounded-xl transition-all cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                type="button"
                                                onClick={handleUpdatePreset}
                                                disabled={!editPresetName.trim() || (!editPresetSearch && !editPresetKpi && Object.keys(editPresetFilters).length === 0)}
                                                className={`px-3 py-1.5 text-[9px] font-bold uppercase text-white rounded-xl transition-all cursor-pointer ${
                                                    (editPresetName.trim() && (editPresetSearch || editPresetKpi || Object.keys(editPresetFilters).length > 0))
                                                    ? 'bg-cyan-600 hover:bg-cyan-500 shadow-md'
                                                    : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                                                }`}
                                            >
                                                Update
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                /* Normal List & Save Form Mode */
                                <>
                                    <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto custom-scrollbar">
                                        {presets.length === 0 ? (
                                            <span className="text-xs text-slate-650 italic px-1 select-none">No saved presets</span>
                                        ) : (
                                            presets.map((preset) => {
                                                const isActive = isPresetActive(preset);
                                                return (
                                                    <div 
                                                        key={preset.id}
                                                        className={`flex items-center gap-1.5 bg-[#0b0f17] border rounded-xl pl-2.5 pr-1.5 py-1 transition-all ${
                                                            isActive 
                                                            ? 'border-cyan-500/30 bg-cyan-500/5 shadow-sm shadow-cyan-500/5' 
                                                            : 'border-slate-800/40'
                                                        }`}
                                                    >
                                                        <button 
                                                            onClick={() => applyPreset(preset)}
                                                            className={`text-[10px] font-semibold cursor-pointer select-none truncate max-w-[110px] transition-colors flex items-center gap-1 ${
                                                                isActive ? 'text-cyan-400 font-bold' : 'text-slate-350 hover:text-cyan-400'
                                                            }`}
                                                            title={`Apply "${preset.name}"`}
                                                        >
                                                            {isActive && <Check className="w-2.5 h-2.5 text-cyan-400 stroke-[2.5] animate-in zoom-in-50 duration-200" />}
                                                            <span>{preset.name}</span>
                                                        </button>
                                                        <button 
                                                            onClick={() => openEditPreset(preset)}
                                                            className="p-1 text-slate-400 hover:text-cyan-400 rounded transition-all cursor-pointer flex items-center justify-center hover:bg-slate-800/40"
                                                            title="Edit Preset"
                                                        >
                                                            <Pencil size={12} className="stroke-[2.5]" />
                                                        </button>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                    <form onSubmit={handleSavePreset} className="flex items-center gap-2 pt-2 border-t border-slate-800/40 mt-1">
                                        <input 
                                            type="text"
                                            placeholder="Preset name..."
                                            value={newPresetName}
                                            onChange={(e) => setNewPresetName(e.target.value)}
                                            className="bg-[#0b0f17] border border-slate-800/40 text-slate-200 text-xs rounded-xl px-3 py-1.5 outline-none focus:border-cyan-500/40 flex-1 font-medium placeholder-slate-600"
                                        />
                                        <button 
                                            type="submit"
                                            disabled={!newPresetName.trim() || !hasFiltersToSave}
                                            className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-lg ${
                                                (newPresetName.trim() && hasFiltersToSave)
                                                ? 'bg-cyan-600/90 hover:bg-cyan-500 text-white'
                                                : 'bg-slate-800/60 text-slate-500 cursor-not-allowed shadow-none border border-slate-800/20'
                                            }`}
                                        >
                                            Save
                                        </button>
                                    </form>
                                </>
                            )}
                        </div>

                        {/* Filter dropdowns stacked vertically inside drawer */}
                        <div className="space-y-5">
                            {/* Section 1: Serving Stack & Framework */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('stack')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><Activity className="w-3 h-3 text-cyan-500" /> Serving Stack & Framework</span>
                                    {openSections.stack ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.stack && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Serving Stack"
                                            options={filterOptions.servingStack || []}
                                            selected={draftFilters ? draftFilters.servingStack : (activeFilters.servingStack || new Set())}
                                            onChange={(val) => toggleDraftFilter('servingStack', val)}
                                            counts={facetCounts.servingStack || {}}
                                        />
                                        <MultiSelectDropdown 
                                            label="Model Server"
                                            options={filterOptions.modelServer}
                                            selected={draftFilters ? draftFilters.modelServer : (activeFilters.modelServer || new Set())}
                                            onChange={(val) => toggleDraftFilter('modelServer', val)}
                                            counts={facetCounts.modelServer}
                                        />
                                        <MultiSelectDropdown 
                                            label="Optimizations"
                                            options={[
                                                "Atomic / Gang Scheduling",
                                                "Topology Aware Scheduling",
                                                "P/D Disaggregation",
                                                "Horizontal Pod Autoscaling",
                                                "Body based routing",
                                                "Approximate prefix aware routing",
                                                "Precise prefix aware routing"
                                            ]}
                                            selected={draftFilters ? draftFilters.optimizations : (activeFilters.optimizations || new Set())}
                                            onChange={(val) => toggleDraftFilter('optimizations', val)}
                                            counts={facetCounts.optimizations}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Infrastructure Spec */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('infra')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><Database className="w-3 h-3 text-cyan-500" /> Infrastructure Specs</span>
                                    {openSections.infra ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.infra && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Machine Type"
                                            options={filterOptions.machines}
                                            selected={draftFilters ? draftFilters.machines : (activeFilters.machines || new Set())}
                                            onChange={(val) => toggleDraftFilter('machines', val)}
                                            counts={facetCounts.machines}
                                        />
                                        <MultiSelectDropdown 
                                            label="Accelerator Count"
                                            options={filterOptions.acc_count}
                                            selected={draftFilters ? draftFilters.acc_count : (activeFilters.acc_count || new Set())}
                                            onChange={(val) => toggleDraftFilter('acc_count', val)}
                                            counts={facetCounts.acc_count}
                                        />
                                        <MultiSelectDropdown 
                                            label="Tensor Parallelism (TP)"
                                            options={filterOptions.tp || []}
                                            selected={draftFilters ? draftFilters.tp : (activeFilters.tp || new Set())}
                                            onChange={(val) => toggleDraftFilter('tp', val)}
                                            counts={facetCounts.tp}
                                        />
                                        <MultiSelectDropdown 
                                            label="P/D Node Ratio"
                                            options={filterOptions.pdRatio}
                                            selected={draftFilters ? draftFilters.pdRatio : (activeFilters.pdRatio || new Set())}
                                            onChange={(val) => toggleDraftFilter('pdRatio', val)}
                                            counts={facetCounts.pdRatio}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Section 3: Benchmark Load */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('load')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-cyan-500" /> Benchmark Load</span>
                                    {openSections.load ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.load && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Input (ISL)"
                                            options={filterOptions.isl}
                                            selected={draftFilters ? draftFilters.isl : (activeFilters.isl || new Set())}
                                            onChange={(val) => toggleDraftFilter('isl', val)}
                                            counts={facetCounts.isl}
                                        />
                                        <MultiSelectDropdown 
                                            label="Output (OSL)"
                                            options={filterOptions.osl}
                                            selected={draftFilters ? draftFilters.osl : (activeFilters.osl || new Set())}
                                            onChange={(val) => toggleDraftFilter('osl', val)}
                                            counts={facetCounts.osl}
                                        />
                                        <MultiSelectDropdown 
                                            label="Workload Type"
                                            options={filterOptions.ratio}
                                            selected={draftFilters ? draftFilters.ratio : (activeFilters.ratio || new Set())}
                                            onChange={(val) => toggleDraftFilter('ratio', val)}
                                            counts={facetCounts.ratio}
                                        />
                                        <MultiSelectDropdown 
                                            label="Use Case"
                                            options={filterOptions.useCase}
                                            selected={draftFilters ? draftFilters.useCase : (activeFilters.useCase || new Set())}
                                            onChange={(val) => toggleDraftFilter('useCase', val)}
                                            counts={facetCounts.useCase}
                                            formatLabel={(opt) => {
                                                const meta = USE_CASE_META[opt];
                                                return meta ? `${opt} ${meta}` : opt;
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Section 4: Connections & Precision */}
                            <div className="bg-slate-950/20 p-4 rounded-xl border border-slate-800/40 space-y-3">
                                <button 
                                    onClick={() => toggleSection('conn')}
                                    className="w-full flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800/30 pb-1.5 cursor-pointer select-none"
                                >
                                    <span className="flex items-center gap-1.5"><Sliders className="w-3 h-3 text-cyan-500" /> Connections & Precision</span>
                                    {openSections.conn ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                </button>
                                {openSections.conn && (
                                    <div className="flex flex-col gap-2 pt-1 animate-in fade-in duration-150">
                                        <MultiSelectDropdown 
                                            label="Connection / Source"
                                            options={filterOptions.connectionNames || []}
                                            selected={draftFilters ? draftFilters.connectionNames : (activeFilters.connectionNames || new Set())}
                                            onChange={(val) => toggleDraftFilter('connectionNames', val)}
                                            counts={facetCounts.connectionNames || {}}
                                        />
                                        <MultiSelectDropdown 
                                            label="Origin / Folder"
                                            options={filterOptions.origins || []}
                                            selected={draftFilters ? draftFilters.origins : (activeFilters.origins || new Set())}
                                            onChange={(val) => toggleDraftFilter('origins', val)}
                                            counts={facetCounts.origins || {}}
                                            formatLabel={formatOriginLabel}
                                        />
                                        <MultiSelectDropdown 
                                            label="Precisions"
                                            options={filterOptions.precisions}
                                            selected={draftFilters ? draftFilters.precisions : (activeFilters.precisions || new Set())}
                                            onChange={(val) => toggleDraftFilter('precisions', val)}
                                            counts={facetCounts.precisions}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Drawer Footer Actions */}
                    <div className="p-4 bg-slate-950/80 border-t border-slate-800/80 flex items-center justify-between gap-3 select-none">
                        <button
                            type="button"
                            onClick={() => setIsAdvancedExpanded(false)}
                            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800 rounded-xl transition-all cursor-pointer flex-1 text-center"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (draftFilters) {
                                    setActiveFilters(draftFilters);
                                }
                                setIsAdvancedExpanded(false);
                            }}
                            className="px-4 py-2 text-xs font-bold uppercase text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-all shadow-md cursor-pointer flex-1 text-center"
                        >
                            Apply Filters
                        </button>
                    </div>
                </div>
            
            {/* Spacer */}
            <div className="h-4" />

              <div id="manage-tour-table">
              <UnifiedDataTable
                groupBy={groupBy}
                sortByField={sortByField}
                sortDirection={sortDirection}
                visibleSpecs={visibleSpecs}
                modelStats={modelStats} selectedModels={selectedModels} filteredBySource={filteredBySource}
                showSelectedOnly={showSelectedOnly} setShowSelectedOnly={setShowSelectedOnly}
                selectedBenchmarks={selectedBenchmarks} setSelectedBenchmarks={setSelectedBenchmarks}
                setActiveFilters={setActiveFilters} expandedModels={expandedModels}
                toggleBenchmark={toggleBenchmark} toggleModelExpansion={toggleModelExpansion}
                baselineBenchmarkKey={baselineBenchmarkKey}
                setBaselineBenchmarkKey={setBaselineBenchmarkKey}
                hideShowSelectedOnly={hideShowSelectedOnly}
                renameClearToUnselectAll={renameClearToUnselectAll}
                brv02Runs={brv02Runs}
                brv02CustomLabels={brv02CustomLabels}
                setBrv02CustomLabels={setBrv02CustomLabels}
                removeBrv02Run={removeBrv02Run}
                setShowDataPanel={setShowDataPanel}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                kpiFilter={kpiFilter}
                setKpiFilter={setKpiFilter}
                paretoKeys={paretoKeys}
                submissionsMap={submissionsMap}
                updateSubmissionStatus={updateSubmissionStatus}
            />
              </div>
        </div>
    );
};
