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

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

// A single-select filter written as a pill: "Hardware  H100 ×8 ▾". Options carry
// counts so empty combinations are visible (and disabled) before you pick them.
//
//   <FilterPill label="Hardware" value={hw} onChange={setHw}
//               options={[{ value: 'H100 ×8', label: 'H100 ×8', count: 12 }]} />
export function FilterPill({ label, value, options, onChange, allLabel = 'Any', align = 'left', className }) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (event) => {
            if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    const active = value != null && value !== '';
    const current = options.find((o) => o.value === value);
    const pick = (next) => {
        onChange(next);
        setOpen(false);
    };

    return (
        <div ref={rootRef} className={cn('surface-light relative', className)}>
            <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={cn(
                    'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                    active
                        ? 'border-accent-200 bg-accent-50 text-accent-700'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:text-zinc-900'
                )}
            >
                <span className={active ? 'text-accent-600' : 'text-zinc-500'}>{label}</span>
                {active && <span className="max-w-[12rem] truncate font-semibold">{current?.label ?? value}</span>}
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" />
            </button>
            {open && (
                <div
                    role="listbox"
                    aria-label={label}
                    className={cn(
                        'absolute top-full z-50 mt-2 max-h-72 w-64 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-lg',
                        align === 'right' ? 'right-0' : 'left-0'
                    )}
                >
                    {[{ value: null, label: allLabel }, ...options].map((option) => {
                        const selected = (option.value ?? null) === (value ?? null);
                        return (
                            <button
                                key={String(option.value)}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                disabled={option.count === 0 && !selected}
                                onClick={() => pick(option.value)}
                                className={cn(
                                    'flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-xs transition-colors',
                                    'disabled:pointer-events-none disabled:opacity-40',
                                    selected ? 'bg-accent-50 font-semibold text-accent-700' : 'text-zinc-700 hover:bg-zinc-50'
                                )}
                            >
                                <Check className={cn('h-3.5 w-3.5 shrink-0', selected ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                                <span className="flex-1 truncate">{option.label}</span>
                                {option.count != null && (
                                    <span className="font-mono text-tiny tabular-nums text-zinc-500">{option.count}</span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
