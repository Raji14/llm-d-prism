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

// Shared UI primitives for the simplified Result Store.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, Info, RotateCcw, Server, TriangleAlert, X } from 'lucide-react';
import { Badge, Button, Input } from '../ui';
import { cn } from '../../utils/cn';
import { accelTypeOf, costPerMillion, fmtMoney, listPrice } from './catalog';
import { computeResultDeltas, domainLabelOf, fleetLabelOf, formatMetricValue, signedPct } from './storeClient';

export function BackButton({ onClick, children = 'Back' }) {
    return (
        <Button size="xs" variant="ghost" onClick={onClick} className="-ml-2">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {children}
        </Button>
    );
}

const NOTICE_TONES = {
    info: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

export function Notice({ tone = 'info', icon, onDismiss, dismissLabel = 'Dismiss notice', className, children }) {
    const Icon = icon || (tone === 'warning' ? TriangleAlert : Info);
    return (
        <div className={cn('flex items-start gap-2.5 rounded-2xl border px-4 py-2 text-xs leading-relaxed', NOTICE_TONES[tone] || NOTICE_TONES.info, className)}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">{children}</div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                    className="-mr-1 -mt-0.5 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

export function CopyButton({ text, label = 'Copy link', copiedLabel = 'Copied', variant = 'secondary', size = 'xs' }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    const onCopy = () => {
        navigator.clipboard?.writeText(typeof text === 'function' ? text() : text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
    };
    return (
        <>
            <Button size={size} variant={variant} onClick={onCopy}>
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? copiedLabel : label}
            </Button>
            <span className="sr-only" role="status" aria-live="polite">
                {copied ? copiedLabel : ''}
            </span>
        </>
    );
}

function accelKeyOf(result) {
    const raw = result?.fleet?.accelerator || result?.hardware;
    if (!raw) return null;
    const key = accelTypeOf(raw);
    return key && key !== 'Unknown' ? key : String(raw).replace(/\s*×\s*\d+$/i, '').trim();
}

// eslint-disable-next-line react-refresh/only-export-components -- shared cost estimator used by UnifiedCompareView and MetricsComparisonTable
export function estimateCostPerMillion(result, rateOverrides = {}) {
    const chips = result?.fleet?.totalAccelerators;
    const accelKey = accelKeyOf(result);
    if (!chips || !accelKey) return null;
    const override = rateOverrides[accelKey];
    const rate = override != null && Number.isFinite(Number(override)) && Number(override) > 0 ? Number(override) : listPrice(accelKey);
    if (!rate) return null;
    const tokMetric = (result.metrics || []).find((m) => /tok\/s/i.test(m.unit) && m.value > 0);
    if (!tokMetric) return null;
    return costPerMillion(tokMetric.value, chips, rate);
}

/**
 * Shared before/after metrics comparison table used by both Compare and Artifacts.
 * Automatically surfaces inline $/1M tok cost with editable $/chip-hr overrides
 * whenever serving throughput + accelerator chip counts apply.
 */
export function MetricsComparisonTable({
    results = [],
    baselineId = null,
    storesById = new Map(),
    onOpenResult,
    onRemoveResult,
    showCost = true,
    allowRateOverride = false,
    rateOverrides: controlledRates,
    onRateOverridesChange,
}) {
    const [localRates, setLocalRates] = useState({});
    const rates = controlledRates || localRates;
    const setRates = onRateOverridesChange || setLocalRates;

    const baseline = results.find((r) => r.id === baselineId) || results[0] || null;

    const metricColumns = useMemo(() => {
        const seen = new Map();
        for (const r of results) {
            for (const m of r.metrics || []) {
                if (!seen.has(m.name)) {
                    seen.set(m.name, { name: m.name, label: m.label || m.name, unit: m.unit, direction: m.direction, primary: Boolean(m.primary) });
                }
            }
        }
        return [...seen.values()].sort((a, b) => Number(b.primary) - Number(a.primary));
    }, [results]);

    const priceableAccels = useMemo(() => {
        if (!showCost) return [];
        const keys = new Set();
        for (const r of results) {
            const hasTok = (r.metrics || []).some((m) => /tok\/s/i.test(m.unit) && m.value > 0);
            const key = accelKeyOf(r);
            if (hasTok && r?.fleet?.totalAccelerators && key) keys.add(key);
        }
        return [...keys];
    }, [results, showCost]);

    const costs = useMemo(() => {
        if (!showCost) return new Map();
        return new Map(results.map((r) => [r.id, estimateCostPerMillion(r, rates)]));
    }, [results, showCost, rates]);

    const hasAnyCost = useMemo(() => [...costs.values()].some((v) => v != null), [costs]);
    const cheapestCost = useMemo(() => {
        const vals = [...costs.values()].filter((v) => v != null && v > 0);
        return vals.length >= 2 ? Math.min(...vals) : null;
    }, [costs]);

    if (!results.length) return null;

    const hasOverrides = Object.values(rates).some((v) => v != null && v !== '');

    return (
        <div className="space-y-3">
            {allowRateOverride && priceableAccels.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-2.5 text-xs">
                    <span className="label-caps text-zinc-500">Accelerator rates ($/chip-hr)</span>
                    {priceableAccels.map((accel) => {
                        const def = listPrice(accel);
                        const val = rates[accel] ?? '';
                        return (
                            <label key={accel} className="inline-flex items-center gap-1.5 text-zinc-700">
                                <span className="font-medium">{accel}</span>
                                <Input
                                    surface="light"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={val}
                                    placeholder={def ? def.toFixed(2) : 'rate'}
                                    onChange={(e) => setRates({ ...rates, [accel]: e.target.value })}
                                    className="h-7 w-24 font-mono text-xs"
                                    aria-label={`${accel} dollars per chip-hour`}
                                />
                            </label>
                        );
                    })}
                    {hasOverrides && (
                        <Button size="xs" variant="ghost" onClick={() => setRates({})}>
                            <RotateCcw className="h-3 w-3" aria-hidden="true" />
                            Reset to list
                        </Button>
                    )}
                </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-zinc-200">
                <table className="w-full text-left text-xs">
                    <thead className="border-b border-zinc-200 bg-zinc-50/70">
                        <tr className="label-caps text-zinc-500">
                            <th className="px-4 py-3 font-semibold">Result</th>
                            <th className="px-4 py-3 font-semibold">Fleet / setup</th>
                            {metricColumns.map((col) => (
                                <th key={col.name} className="px-4 py-3 text-right font-semibold">
                                    {col.label}
                                    <span className="ml-1 font-normal normal-case text-zinc-400">({col.unit})</span>
                                </th>
                            ))}
                            {hasAnyCost && <th className="px-4 py-3 text-right font-semibold">Est. $/1M tok</th>}
                            {onRemoveResult && <th className="px-3 py-3 text-right font-semibold" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                        {results.map((r) => {
                            const isBase = baseline && r.id === baseline.id;
                            const deltas = !isBase && baseline ? computeResultDeltas(baseline, r) : [];
                            const deltaByName = new Map(deltas.map((d) => [d.name, d]));
                            const store = storesById.get(r.storeId);
                            const cost = costs.get(r.id);
                            const isCheapest = cheapestCost != null && cost != null && Math.abs(cost - cheapestCost) < 1e-6;
                            return (
                                <tr key={r.id} className={cn(isBase && 'bg-zinc-50/50')}>
                                    <td className="px-4 py-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {onOpenResult ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenResult(r)}
                                                    className="text-left font-semibold text-zinc-900 hover:text-accent-700 hover:underline"
                                                >
                                                    {r.title}
                                                </button>
                                            ) : (
                                                <span className="font-semibold text-zinc-900">{r.title}</span>
                                            )}
                                            {isBase && (
                                                <Badge size="xs" tone="brand">
                                                    Baseline
                                                </Badge>
                                            )}
                                            {storesById.size > 1 && (
                                                <Badge size="xs" tone={store?.brand === 'llm-d' ? 'brand' : 'neutral'}>
                                                    {store?.name || r.storeId}
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="mt-0.5 text-tiny text-zinc-500">{domainLabelOf(r.domain)}</div>
                                    </td>
                                    <td className="px-4 py-3 text-zinc-700">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Server className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                                            {fleetLabelOf(r) || 'Single node'}
                                        </span>
                                    </td>
                                    {metricColumns.map((col) => {
                                        const m = (r.metrics || []).find((x) => x.name === col.name);
                                        const d = deltaByName.get(col.name);
                                        return (
                                            <td key={col.name} className="px-4 py-3 text-right font-mono tabular-nums">
                                                <div className="font-semibold text-zinc-900">{m ? formatMetricValue(m.value, '') : '—'}</div>
                                                {d && (
                                                    <div
                                                        className={cn(
                                                            'text-tiny font-medium',
                                                            d.verdict === 'better'
                                                                ? 'text-emerald-700'
                                                                : d.verdict === 'worse'
                                                                  ? 'text-red-700'
                                                                  : 'text-zinc-500'
                                                        )}
                                                    >
                                                        {signedPct(d.deltaPct)} {d.verdict !== 'neutral' ? `(${d.verdict})` : ''}
                                                    </div>
                                                )}
                                            </td>
                                        );
                                    })}
                                    {hasAnyCost && (
                                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                                            <div className="font-semibold text-zinc-900">{cost != null ? fmtMoney(cost) : '—'}</div>
                                            {isCheapest && <div className="text-tiny font-medium text-emerald-700">Lowest cost</div>}
                                        </td>
                                    )}
                                    {onRemoveResult && (
                                        <td className="px-3 py-3 text-right">
                                            {results.length > 1 && (
                                                <Button size="xs" variant="ghost" aria-label={`Remove ${r.title}`} onClick={() => onRemoveResult(r.id)}>
                                                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                                                </Button>
                                            )}
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
