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
import { X, DollarSign, RotateCcw, Check, Info, Cpu, Tag, Layers } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { DEFAULT_PRICING_CATALOG, DISCOUNT_PRESETS, calculateDiscountedRates } from '../../utils/pricingEngine.js';
import { GoogleMark } from '../ui';
import { cn } from '../../utils/cn';

const GoogleLogo = ({ className }) => <GoogleMark className={className} />;

export default function PricingConfigModal({ isOpen, onClose, customRates, onSaveRates, onResetDefaults }) {
    const [rates, setRates] = useState(() => ({ ...customRates }));
    const [activePreset, setActivePreset] = useState('custom');
    const [selectedCategory, setSelectedCategory] = useState('all'); // 'all' | 'gpu' | 'tpu'

    useEffect(() => {
        if (isOpen) {
            setRates({ ...customRates });
            const isCustomEmpty = Object.keys(customRates || {}).length === 0;
            if (isCustomEmpty) {
                setActivePreset('on_demand');
            }
        }
    }, [isOpen, customRates]);

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

    const catalogItems = useMemo(() => {
        const items = Object.values(DEFAULT_PRICING_CATALOG).filter(item => item.id !== 'other');
        if (selectedCategory === 'all') return items;
        return items.filter(item => item.category === selectedCategory);
    }, [selectedCategory]);

    const customCount = useMemo(() => {
        let count = 0;
        Object.values(DEFAULT_PRICING_CATALOG).forEach(item => {
            if (rates[item.id] !== undefined && rates[item.id] !== item.unitRateUsd) {
                count++;
            }
        });
        return count;
    }, [rates]);

    if (!isOpen) return null;

    const handleApplyPreset = (presetId) => {
        const preset = DISCOUNT_PRESETS[presetId];
        if (!preset) return;
        setActivePreset(presetId);
        if (preset.discountPct === 0) {
            setRates({});
        } else {
            const discounted = calculateDiscountedRates(preset.discountPct);
            setRates(discounted);
        }
    };

    const handleRateChange = (id, val) => {
        const parsed = parseFloat(val);
        setActivePreset('custom');
        setRates(prev => ({
            ...prev,
            [id]: isNaN(parsed) ? 0 : parsed
        }));
    };

    const handleResetSingleRate = (id) => {
        setRates(prev => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
    };

    const handleSave = () => {
        onSaveRates(rates);
        onClose();
    };

    const handleReset = () => {
        setRates({});
        setActivePreset('on_demand');
        onResetDefaults();
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/35 backdrop-blur-[1.5px] transition-opacity animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-slate-900/95 border border-slate-700/80 rounded-2xl max-w-4xl w-full h-[85vh] max-h-[800px] min-h-[580px] flex flex-col p-6 shadow-2xl relative text-slate-200 backdrop-blur-xl animate-in zoom-in-95 duration-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4 shrink-0">
                    <div className="p-2.5 rounded-xl bg-slate-850 border border-slate-750 flex items-center justify-center shadow-inner">
                        <GoogleLogo className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            <span>GCP accelerator cost engine & discount presets</span>
                        </h2>
                        <p className="text-xs text-slate-400">
                            Configure standard list pricing, Committed Use Discounts (CUD), and spot rates for GPU/TPU clusters.
                        </p>
                    </div>
                </div>

                {/* Discount Preset & Global Slider Controls */}
                <div className="mb-4 bg-slate-950/80 p-3.5 rounded-xl border border-slate-800 shrink-0 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-micro font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-emerald-400" /> Enterprise discount presets:
                        </span>
                        {customCount > 0 && (
                            <Badge tone="success" size="xs">
                                {customCount} custom rate{customCount > 1 ? 's' : ''} active
                            </Badge>
                        )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.values(DISCOUNT_PRESETS).map(preset => {
                            const isSelected = activePreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => handleApplyPreset(preset.id)}
                                    className={cn('px-3 py-2 rounded-lg text-xs font-semibold text-left transition-all border cursor-pointer', isSelected
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850')}
                                >
                                    <div className="truncate font-bold">{preset.label}</div>
                                    <div className="text-tiny text-slate-500 font-normal mt-0.5">
                                        {preset.discountPct > 0 ? `Save ${preset.discountPct}% across all chips` : 'Standard GCP list price'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Filter Tabs & Info Note */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                        <button
                            type="button"
                            onClick={() => setSelectedCategory('all')}
                            className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer', selectedCategory === 'all'
                                    ? 'bg-slate-800 text-white font-semibold shadow-xs'
                                    : 'text-slate-400 hover:text-slate-200')}
                        >
                            All accelerators (8)
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedCategory('gpu')}
                            className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer', selectedCategory === 'gpu'
                                    ? 'bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/40 shadow-xs'
                                    : 'text-slate-400 hover:text-slate-200')}
                        >
                            NVIDIA GPUs (5)
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedCategory('tpu')}
                            className={cn('px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5', selectedCategory === 'tpu'
                                    ? 'bg-accent-600/20 text-accent-800 font-semibold border border-accent-600/40 shadow-xs'
                                    : 'text-slate-400 hover:text-slate-200')}
                        >
                            <GoogleLogo className="w-3.5 h-3.5" />
                            <span>TPUs (3)</span>
                        </button>
                    </div>

                    <div className="text-micro text-slate-400 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-accent-700 shrink-0" />
                        <span>Updates <strong>$/1M tokens</strong> and <strong>Tokens/$</strong> live.</span>
                    </div>
                </div>

                {/* Rates Table - Flex 1 Scrollable Container */}
                <div className="flex-1 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950/60 min-h-0">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="label-caps text-white bg-slate-950 border-b border-slate-800 select-none sticky top-0 z-10">
                            <tr>
                                <th className="py-3 px-3.5">Accelerator & VM specification</th>
                                <th className="py-3 px-3 text-center">Standard node</th>
                                <th className="py-3 px-3 text-right">GCP list rate</th>
                                <th className="py-3 px-3 text-right w-44">Effective rate ($/chip/hr)</th>
                                <th className="py-3 px-3.5 text-right">Cluster hourly / monthly</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono text-xs text-slate-300">
                            {catalogItems.map((item) => {
                                const currentUnitRate = (rates[item.id] !== undefined) ? rates[item.id] : item.unitRateUsd;
                                const isCustom = rates[item.id] !== undefined && rates[item.id] !== item.unitRateUsd;
                                const savingsPct = item.unitRateUsd > 0
                                    ? Math.round(((item.unitRateUsd - currentUnitRate) / item.unitRateUsd) * 100)
                                    : 0;
                                const nodeHourly = (currentUnitRate * item.standardCount);
                                const nodeMonthly = Math.round(nodeHourly * 730);

                                return (
                                    <tr key={item.id} className="hover:bg-slate-900/60 transition-colors">
                                        {/* Accelerator Info */}
                                        <td className="py-3 px-3.5 font-sans">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-white text-xs">{item.name}</span>
                                                <Badge tone={item.category === 'tpu' ? 'cyan' : 'neutral'} size="xs" className="inline-flex items-center gap-1">
                                                    {item.vendor === 'Google Cloud' ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <GoogleLogo className="w-3 h-3" />
                                                            <span>TPU</span>
                                                        </span>
                                                    ) : (
                                                        item.vendor
                                                    )}
                                                </Badge>
                                                {isCustom && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleResetSingleRate(item.id)}
                                                        className="text-tiny text-slate-500 hover:text-amber-400 underline ml-1 cursor-pointer"
                                                        title="Reset to standard GCP list price"
                                                    >
                                                        Reset
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-micro text-slate-400 truncate mt-0.5 max-w-[300px]">
                                                {item.description}
                                            </p>
                                        </td>

                                        {/* Standard Node */}
                                        <td className="py-3 px-3 text-center font-mono text-slate-300">
                                            <div className="font-medium">{item.standardCount}x chips</div>
                                            <div className="text-tiny text-slate-500">{item.standardVmType}</div>
                                        </td>

                                        {/* GCP List Rate */}
                                        <td className="py-3 px-3 text-right font-mono text-slate-400">
                                            <div>${item.unitRateUsd.toFixed(2)}/chip</div>
                                            <div className="text-tiny text-slate-500">${item.baseNodeRateUsd.toFixed(2)}/node</div>
                                        </td>

                                        {/* Effective Rate Input */}
                                        <td className="py-3 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {savingsPct !== 0 && (
                                                    <span className={cn('text-tiny font-mono px-1.5 py-0.5 rounded', savingsPct > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400')}>
                                                        {savingsPct > 0 ? `-${savingsPct}%` : `+${Math.abs(savingsPct)}%`}
                                                    </span>
                                                )}
                                                <div className="relative w-24">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-mono">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={currentUnitRate}
                                                        onChange={(e) => handleRateChange(item.id, e.target.value)}
                                                        className={cn('w-full pl-5 pr-2 py-1 bg-slate-900 border rounded-lg text-xs font-mono text-right focus:outline-none focus:ring-1', isCustom
                                                                ? 'border-emerald-500/60 text-emerald-300 focus:border-emerald-400 focus:ring-emerald-400/30 font-bold'
                                                                : 'border-slate-700 text-white focus:border-accent-600 focus:ring-accent-600/30')}
                                                    />
                                                </div>
                                            </div>
                                        </td>

                                        {/* Cluster Node Cost & Monthly Burn */}
                                        <td className="py-3 px-3.5 text-right font-mono">
                                            <div className="text-emerald-400 font-bold text-xs">
                                                ${nodeHourly.toFixed(2)}/hr
                                            </div>
                                            <div className="text-tiny text-slate-500">
                                                ~${nodeMonthly.toLocaleString()}/mo
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer Controls */}
                <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-800 shrink-0">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset to GCP list defaults</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all cursor-pointer"
                        >
                            <Check className="w-3.5 h-3.5" />
                            <span>Save & apply pricing</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
