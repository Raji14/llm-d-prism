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

const PADDING = {
    none: 'p-0',
    sm: 'p-4',
    md: 'p-6',
};

// The standard card surface. Replaces hand-rolled
// "bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" shells.
// variant="editorial" is the light-first Prism 2.0 card (rounded-3xl hairline,
// no shadow) with an optional kicker and subtitle above the title row.
// titleAs / kickerAs set the title (h3) and kicker (div) elements: use
// titleAs="h2" when the panel heads a top-level section of the page, and
// kickerAs="h2" when the kicker is the panel's only label.
export function Panel({ title, kicker, subtitle, actions, padding = 'md', variant = 'default', titleAs = 'h3', kickerAs = 'div', className, children, ...props }) {
    const editorial = variant === 'editorial';
    const TitleTag = titleAs;
    const KickerTag = kickerAs;
    return (
        <div
            className={cn(
                editorial
                    ? 'surface-light bg-white border border-zinc-200 rounded-3xl'
                    : 'bg-theme-card border border-theme-border rounded-xl shadow-lg transition-colors',
                PADDING[padding],
                className
            )}
            {...props}
        >
            {(title || actions || kicker) && (
                <div
                    className={cn(
                        'flex justify-between gap-4 mb-4',
                        editorial ? 'items-start' : 'items-center',
                        padding === 'none' && cn('p-4 mb-0 border-b', editorial ? 'border-zinc-200 px-5' : 'border-theme-border')
                    )}
                >
                    <div className="min-w-0">
                        {kicker && <KickerTag className="kicker text-zinc-500 mb-1">{kicker}</KickerTag>}
                        {title && (
                            <TitleTag className={editorial ? 'text-sm font-semibold text-zinc-900' : 'text-sm font-bold text-theme-text'}>{title}</TitleTag>
                        )}
                        {subtitle && <p className={cn('text-xs mt-0.5', editorial ? 'text-zinc-600' : 'text-theme-muted')}>{subtitle}</p>}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
                </div>
            )}
            {children}
        </div>
    );
}
