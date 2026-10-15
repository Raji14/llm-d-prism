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
import { cn } from '../../utils/cn';

// Segmented pill control for metric/mode selectors (e.g. TTFT | TPOT | E2E).
// Name the group with aria-label, or aria-labelledby when a visible label sits
// next to it: two unnamed groups side by side sound the same to a screen reader.
export function ToggleGroup({ options, value, onChange, size = 'sm', fullWidth = false, className, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy }) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            className={cn(
                'surface-light inline-flex items-center rounded-full border border-zinc-200 bg-white p-0.5 gap-0.5',
                fullWidth && 'flex w-full',
                className
            )}
        >
            {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        type="button"
                        disabled={opt.disabled}
                        aria-pressed={isActive}
                        onClick={() => onChange(opt.value)}
                        className={cn(
                            'rounded-full font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                            size === 'xs' ? 'px-2.5 py-0.5 text-micro' : 'px-3 py-1 text-xs',
                            fullWidth && 'flex-1',
                            isActive
                                ? 'bg-accent-600 text-white shadow-xs'
                                : 'text-zinc-700 hover:text-zinc-900',
                            opt.disabled && 'opacity-40 pointer-events-none'
                        )}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
