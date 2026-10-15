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
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

// Inline select that reads as a word in a sentence ("Show me the [fastest]
// way to serve [Llama 3.1 70B]…"). The visible text is a span so it sizes to
// its label in every browser; a transparent native <select> sits on top for
// a11y, keyboard and touch input.
//
// options: [{ value, label, display? }] — `display` is what the sentence
// shows; `label` is what the native menu lists (e.g. with a run count).
export function InlineSelect({ value, onChange, options, label, className }) {
    const current = options.find((o) => o.value === value) || options[0];
    return (
        <span
            className={cn(
                'relative inline-flex items-baseline gap-1 whitespace-nowrap rounded-sm px-1 -mx-0.5 bg-white/80 border-b-2 border-dashed border-accent-400 text-zinc-900 font-semibold',
                'hover:bg-accent-50/80 hover:text-accent-800 hover:border-accent-600 focus-within:border-solid focus-within:border-accent-600 focus-within:ring-2 focus-within:ring-accent-500/30 transition-colors',
                className
            )}
        >
            <span aria-hidden="true">{current?.display ?? current?.label}</span>
            <ChevronDown aria-hidden="true" className="w-[0.7em] h-[0.7em] self-center text-accent-600" strokeWidth={2.5} />
            <select
                aria-label={label}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none text-base"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
        </span>
    );
}

export default InlineSelect;
