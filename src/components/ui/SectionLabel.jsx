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

// Editorial section kicker used across Prism 2.0 dashboards. Typography comes
// from the `kicker` utility (src/index.css); color from the accent token.
// Tones are semantic: `accent` (default) or `muted`. Legacy hue names map to
// `accent` so older call sites keep working.
const TONES = {
    accent: 'text-accent-600',
    muted: 'text-zinc-600',
    // legacy aliases
    cyan: 'text-accent-600',
    sky: 'text-accent-600',
    emerald: 'text-accent-600',
    violet: 'text-accent-600',
    orange: 'text-accent-600',
    slate: 'text-zinc-600',
};

export function SectionLabel({ tone = 'accent', className, children }) {
    return (
        <div
            className={cn(
                'kicker surface-light mb-2',
                TONES[tone] || TONES.accent,
                className
            )}
        >
            {children}
        </div>
    );
}
