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
import { X, DollarSign, RotateCcw, Check, Info, Cpu, Tag, Percent } from 'lucide-react';
import { DEFAULT_PRICING_CATALOG, DISCOUNT_PRESETS, calculateDiscountedRates } from '../../utils/pricingEngine.js';

export default function PricingConfigModal({ isOpen, onClose, customRates, onSaveRates, onResetDefaults }) {
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

    const [rates, setRates] = useState(() => ({ ...customRates }));
    const [activePreset, setActivePreset] = useState('custom');

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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-200">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        <DollarSign className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">GCP Accelerator Cost Engine & Discount Presets</h2>
                        <p className="text-xs text-slate-400">
                            Configure standard list pricing, Committed Use Discounts (CUD), and spot rates for GPU/TPU clusters.
                        </p>
                    </div>
                </div>

                {/* Discount Preset Buttons */}
                <div className="mb-4 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-emerald-400" /> Enterprise Discount Presets:
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {Object.values(DISCOUNT_PRESETS).map(preset => {
                            const isSelected = activePreset === preset.id;
                            return (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => handleApplyPreset(preset.id)}
                                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold text-left transition-all border cursor-pointer ${
                                        isSelected
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                                            : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-850'
                                    }`}
                                >
                                    <div className="truncate">{preset.label}</div>
                                    <div className="text-[10px] text-slate-500 font-normal">{preset.discountPct > 0 ? `Save ${preset.discountPct}%` : 'List price'}</div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Info Note */}
                <div className="bg-slate-950/70 border border-slate-800 p-2.5 rounded-xl mb-4 flex items-start gap-2 text-xs text-slate-400">
                    <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                    <span>
                        Prices are used to compute <strong>Cost per 1M Output Tokens ($)</strong> and <strong>Tokens Generated per Dollar</strong> across the Pareto Frontier and Leaderboard rankings.
                    </span>
                </div>

                {/* Rates Table */}
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-3 mb-6 no-scrollbar">
                    {Object.values(DEFAULT_PRICING_CATALOG).filter(item => item.id !== 'other').map((item) => {
                        const currentUnitRate = (rates[item.id] !== undefined) ? rates[item.id] : item.unitRateUsd;
                        const isCustom = rates[item.id] !== undefined && rates[item.id] !== item.unitRateUsd;
                        const nodeTotal = (currentUnitRate * item.standardCount).toFixed(2);

                        return (
                            <div
                                key={item.id}
                                className={`p-3 rounded-xl border flex items-center justify-between gap-4 transition-colors ${
                                    isCustom
                                        ? 'bg-emerald-950/20 border-emerald-500/40'
                                        : 'bg-slate-950/50 border-slate-800'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold text-sm text-white">{item.name}</span>
                                        {isCustom && (
                                            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                                Custom
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-400 truncate mt-0.5">{item.description}</p>
                                    <div className="text-[11px] text-slate-500 font-mono mt-1">
                                        Standard Node: {item.standardCount}x chips ({item.standardVmType}) &rarr; ${nodeTotal}/hr
                                    </div>
                                </div>

                                {/* Price Input */}
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-xs text-slate-400 font-mono">$/chip/hr:</span>
                                    <div className="relative w-24">
                                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 text-xs">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            value={currentUnitRate}
                                            onChange={(e) => handleRateChange(item.id, e.target.value)}
                                            className="w-full pl-6 pr-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white text-right focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset to GCP List Defaults</span>
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
                            <span>Save & Apply Pricing</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
