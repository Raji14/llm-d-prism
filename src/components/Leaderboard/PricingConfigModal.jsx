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
import { X, RotateCcw, Check, Info, Tag } from 'lucide-react';
import { Badge } from '../ui/Badge.jsx';
import { Button } from '../ui/Button.jsx';
import { DEFAULT_PRICING_CATALOG, DISCOUNT_PRESETS, calculateDiscountedRates } from '../../utils/pricingEngine.js';
import { GoogleMark } from '../ui';
import { cn } from '../../utils/cn';

const CATALOG = Object.values(DEFAULT_PRICING_CATALOG).filter((item) => item.id !== 'other');
const CATEGORY_COUNTS = {
    all: CATALOG.length,
    gpu: CATALOG.filter((item) => item.category === 'gpu').length,
    tpu: CATALOG.filter((item) => item.category === 'tpu').length,
};

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
        if (selectedCategory === 'all') return CATALOG;
        return CATALOG.filter(item => item.category === selectedCategory);
    }, [selectedCategory]);

    const customCount = useMemo(() => {
        let count = 0;
        CATALOG.forEach(item => {
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

    const categoryTabs = [
        { id: 'all', label: `All accelerators (${CATEGORY_COUNTS.all})` },
        { id: 'gpu', label: `NVIDIA GPUs (${CATEGORY_COUNTS.gpu})` },
        { id: 'tpu', label: `TPUs (${CATEGORY_COUNTS.tpu})`, google: true },
    ];

    return (
        <div
            className="surface-light fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="pricing-modal-title"
                className="bg-white border border-zinc-200 rounded-3xl max-w-4xl w-full h-[85vh] max-h-[800px] min-h-[580px] flex flex-col p-6 shadow-2xl relative text-zinc-900 animate-in zoom-in-95 duration-200 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    aria-label="Close pricing"
                    className="absolute top-4 right-4 p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4 shrink-0 pr-10">
                    <div className="p-2.5 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center">
                        <GoogleMark className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 id="pricing-modal-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                            Pricing: GCP list prices and discounts
                        </h2>
                        <p className="text-xs text-zinc-600">
                            Set what you pay per chip-hour. Saved rates update every $/1M tokens and tokens-per-dollar number on the Leaderboard.
                        </p>
                    </div>
                </div>

                {/* Discount Preset Controls */}
                <div className="mb-4 bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 shrink-0 space-y-3">
                    <div className="flex items-center justify-between">
                        <span className="text-micro font-semibold uppercase tracking-wider text-zinc-600 flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-emerald-600" /> Discount presets
                        </span>
                        {customCount > 0 && (
                            <Badge tone="success" size="xs">
                                {customCount} custom rate{customCount > 1 ? 's' : ''} set
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
                                    aria-pressed={isSelected}
                                    className={cn(
                                        'px-3 py-2 rounded-xl text-xs text-left transition-colors border cursor-pointer',
                                        isSelected
                                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300 ring-1 ring-inset ring-emerald-600/20'
                                            : 'bg-white text-zinc-700 border-zinc-200 hover:border-zinc-300 hover:text-zinc-900'
                                    )}
                                >
                                    <div className="truncate font-semibold">{preset.label}</div>
                                    <div className={cn('text-tiny font-normal mt-0.5', isSelected ? 'text-emerald-800' : 'text-zinc-500')}>
                                        {preset.discountPct > 0 ? `Save ${preset.discountPct}% on every chip` : 'Standard GCP list price'}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Filter Tabs & Info Note */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3 shrink-0">
                    <div className="flex items-center gap-1 bg-zinc-100 p-1 rounded-xl border border-zinc-200" role="group" aria-label="Accelerator type">
                        {categoryTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setSelectedCategory(tab.id)}
                                aria-pressed={selectedCategory === tab.id}
                                className={cn(
                                    'px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5',
                                    selectedCategory === tab.id
                                        ? 'bg-white text-zinc-900 font-semibold shadow-xs'
                                        : 'text-zinc-600 hover:text-zinc-900'
                                )}
                            >
                                {tab.google && <GoogleMark className="w-3.5 h-3.5" />}
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>

                    <div className="text-micro text-zinc-600 flex items-center gap-1.5 max-w-sm">
                        <Info className="w-3.5 h-3.5 text-accent-600 shrink-0" />
                        <span>Accelerators not listed here (H200, B200, MI300X…) have no list price, so their cost shows as —.</span>
                    </div>
                </div>

                {/* Rates Table - Flex 1 Scrollable Container */}
                <div className="flex-1 overflow-y-auto rounded-2xl border border-zinc-200 bg-white min-h-0">
                    <table className="w-full text-left border-collapse text-xs">
                        <thead className="label-caps text-zinc-700 bg-zinc-100 border-b border-zinc-200 select-none sticky top-0 z-10">
                            <tr>
                                <th className="py-3 px-3.5">Accelerator &amp; VM</th>
                                <th className="py-3 px-3 text-center">Standard node</th>
                                <th className="py-3 px-3 text-right">GCP list rate</th>
                                <th className="py-3 px-3 text-right w-44">Your rate ($/chip/hr)</th>
                                <th className="py-3 px-3.5 text-right">Node hourly / monthly</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 font-mono text-xs text-zinc-700">
                            {catalogItems.map((item) => {
                                const currentUnitRate = (rates[item.id] !== undefined) ? rates[item.id] : item.unitRateUsd;
                                const isCustom = rates[item.id] !== undefined && rates[item.id] !== item.unitRateUsd;
                                const savingsPct = item.unitRateUsd > 0
                                    ? Math.round(((item.unitRateUsd - currentUnitRate) / item.unitRateUsd) * 100)
                                    : 0;
                                const nodeHourly = (currentUnitRate * item.standardCount);
                                const nodeMonthly = Math.round(nodeHourly * 730);

                                return (
                                    <tr key={item.id} className="hover:bg-zinc-50 transition-colors">
                                        {/* Accelerator Info */}
                                        <td className="py-3 px-3.5 font-sans">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-zinc-900 text-xs">{item.name}</span>
                                                <Badge tone={item.category === 'tpu' ? 'cyan' : 'neutral'} size="xs" className="inline-flex items-center gap-1">
                                                    {item.vendor === 'Google Cloud' ? (
                                                        <span className="inline-flex items-center gap-1">
                                                            <GoogleMark className="w-3 h-3" />
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
                                                        className="text-tiny text-zinc-500 hover:text-zinc-900 underline ml-1 cursor-pointer"
                                                        title="Back to the GCP list price"
                                                    >
                                                        Reset
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-micro text-zinc-500 truncate mt-0.5 max-w-[300px]">
                                                {item.description}
                                            </p>
                                        </td>

                                        {/* Standard Node */}
                                        <td className="py-3 px-3 text-center text-zinc-700">
                                            <div className="font-medium">{item.standardCount}× chips</div>
                                            <div className="text-tiny text-zinc-500">{item.standardVmType}</div>
                                        </td>

                                        {/* GCP List Rate */}
                                        <td className="py-3 px-3 text-right text-zinc-600">
                                            <div>${item.unitRateUsd.toFixed(2)}/chip</div>
                                            <div className="text-tiny text-zinc-500">${item.baseNodeRateUsd.toFixed(2)}/node</div>
                                        </td>

                                        {/* Effective Rate Input */}
                                        <td className="py-3 px-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {savingsPct !== 0 && (
                                                    <span className={cn(
                                                        'text-tiny px-1.5 py-0.5 rounded-md ring-1 ring-inset',
                                                        savingsPct > 0 ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : 'bg-amber-50 text-amber-800 ring-amber-600/20'
                                                    )}>
                                                        {savingsPct > 0 ? `−${savingsPct}%` : `+${Math.abs(savingsPct)}%`}
                                                    </span>
                                                )}
                                                <div className="relative w-24">
                                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-500 text-xs">$</span>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={currentUnitRate}
                                                        onChange={(e) => handleRateChange(item.id, e.target.value)}
                                                        aria-label={`Your rate for ${item.name} in dollars per chip-hour`}
                                                        className={cn(
                                                            'w-full pl-5 pr-2 py-1 bg-white border rounded-lg text-xs text-right focus:outline-none focus:ring-2',
                                                            isCustom
                                                                ? 'border-emerald-400 text-emerald-800 font-semibold focus:ring-emerald-500/20'
                                                                : 'border-zinc-200 text-zinc-900 focus:border-accent-400 focus:ring-accent-500/15'
                                                        )}
                                                    />
                                                </div>
                                            </div>
                                        </td>

                                        {/* Cluster Node Cost & Monthly Burn */}
                                        <td className="py-3 px-3.5 text-right">
                                            <div className="text-emerald-700 font-semibold text-xs">
                                                ${nodeHourly.toFixed(2)}/hr
                                            </div>
                                            <div className="text-tiny text-zinc-500">
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
                <div className="flex items-center justify-between pt-4 mt-3 border-t border-zinc-200 shrink-0">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset to GCP list prices</span>
                    </button>

                    <div className="flex items-center gap-2">
                        <Button variant="secondary" size="sm" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button variant="primary" size="sm" onClick={handleSave}>
                            <Check className="w-3.5 h-3.5" />
                            Save pricing
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
