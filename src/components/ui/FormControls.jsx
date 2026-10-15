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

// Default fields are authored dark-first and rely on the light-theme remap.
// Pass `surface="light"` inside `.surface-light` subtrees (where `dark:`
// utilities would otherwise render natural dark colors): the field then wears
// light-first zinc classes and the brand accent focus ring.
const fieldBase =
    'w-full rounded-lg border bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 ' +
    'px-3 py-2 text-sm text-theme-text placeholder:text-theme-muted transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

const fieldLight =
    'surface-light w-full rounded-xl border border-zinc-200 bg-white ' +
    'px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors ' +
    'focus:outline-none focus:ring-2 focus:ring-accent-500/25 focus:border-accent-400 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed';

const fieldClasses = (surface) => (surface === 'light' ? fieldLight : fieldBase);

export function Label({ className, surface, children, ...props }) {
    return (
        <label
            className={cn(
                surface === 'light'
                    ? 'surface-light block text-xs font-semibold text-zinc-700 mb-1.5'
                    : 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5',
                className
            )}
            {...props}
        >
            {children}
        </label>
    );
}

export const Input = React.forwardRef(function Input({ className, error, surface, ...props }, ref) {
    return (
        <input
            ref={ref}
            className={cn(fieldClasses(surface), error && 'border-red-500 focus:border-red-500 focus:ring-red-500/40', className)}
            {...props}
        />
    );
});

export const Select = React.forwardRef(function Select({ className, error, surface, children, ...props }, ref) {
    return (
        <select
            ref={ref}
            className={cn(fieldClasses(surface), 'pr-8', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/40', className)}
            {...props}
        >
            {children}
        </select>
    );
});

export const Textarea = React.forwardRef(function Textarea({ className, error, surface, rows = 4, ...props }, ref) {
    return (
        <textarea
            ref={ref}
            rows={rows}
            className={cn(fieldClasses(surface), 'font-mono text-xs leading-relaxed', error && 'border-red-500 focus:border-red-500 focus:ring-red-500/40', className)}
            {...props}
        />
    );
});

export const Checkbox = React.forwardRef(function Checkbox({ className, label, surface, ...props }, ref) {
    const box = (
        <input
            ref={ref}
            type="checkbox"
            className={cn(
                surface === 'light'
                    ? 'surface-light h-4 w-4 shrink-0 rounded border-zinc-300 accent-accent-600'
                    : 'h-4 w-4 shrink-0 rounded border-slate-300 dark:border-slate-600 accent-emerald-600',
                'focus:outline-none focus-visible:ring-2',
                surface === 'light' ? 'focus-visible:ring-accent-500/40' : 'focus-visible:ring-emerald-500/40',
                className
            )}
            {...props}
        />
    );
    if (!label) return box;
    return (
        <label
            className={cn(
                'inline-flex items-center gap-2 text-sm cursor-pointer select-none',
                surface === 'light' ? 'surface-light text-zinc-800' : 'text-theme-text'
            )}
        >
            {box}
            <span>{label}</span>
        </label>
    );
});
