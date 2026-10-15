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

// On/off switch for a setting that applies the moment it's flipped (e.g. show
// a source's runs in Browse). For choices in a form that's saved later, use
// Checkbox. It's a native <button role="switch">, so Space/Enter toggle it and
// screen readers announce on/off. `label` is the visible state text next to
// the track ("Shown" / "Hidden"); pass `aria-label` to say what it controls.
//
//   <Switch checked={shown} onChange={setShown} label={shown ? 'Shown' : 'Hidden'}
//           aria-label="Show Nightly pipeline in Browse" />
export const Switch = React.forwardRef(function Switch({ checked, onChange, label, disabled, className, ...props }, ref) {
    return (
        <button
            ref={ref}
            type="button"
            role="switch"
            aria-checked={!!checked}
            disabled={disabled}
            onClick={() => onChange?.(!checked)}
            className={cn(
                'surface-light group inline-flex items-center gap-2 rounded-full text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50 focus-visible:ring-offset-2',
                'disabled:pointer-events-none disabled:opacity-50',
                className
            )}
            {...props}
        >
            <span
                aria-hidden="true"
                className={cn(
                    'inline-flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors',
                    checked ? 'bg-accent-600 group-hover:bg-accent-700' : 'bg-zinc-300 group-hover:bg-zinc-400'
                )}
            >
                <span className={cn('h-4 w-4 rounded-full bg-white shadow-sm transition-transform', checked ? 'translate-x-4' : 'translate-x-0')} />
            </span>
            {label != null && <span className={checked ? 'text-zinc-900' : 'text-zinc-500'}>{label}</span>}
        </button>
    );
});
