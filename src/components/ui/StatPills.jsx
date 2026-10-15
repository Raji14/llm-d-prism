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

// Multi-select pill group for chart stat/percentile visibility.
export function StatPills({ options, selected, active, onToggle, size = 'xs', className }) {
    const activeList = selected ?? active ?? [];
    return (
        <div
            role="group"
            className={cn(
                'surface-light inline-flex items-center gap-0.5 bg-white border border-zinc-200 rounded-full p-0.5 shrink-0',
                className
            )}
        >
            {options.map((opt) => {
                const value = typeof opt === 'object' ? opt.value : opt;
                const label = typeof opt === 'object' ? opt.label : opt;
                const isActive = activeList.includes(value);
                return (
                    <button
                        key={value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => onToggle(value)}
                        className={cn(
                            'font-medium rounded-full transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
                            size === 'xs' ? 'px-2.5 py-0.5 text-micro' : 'px-3 py-1 text-xs',
                            isActive
                                ? 'bg-accent-600 text-white shadow-xs'
                                : 'text-zinc-700 hover:text-zinc-900'
                        )}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}
