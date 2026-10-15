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

import React, { useState } from 'react';
import { ArrowLeft, Share2, Check } from 'lucide-react';
import { cn } from '../../utils/cn';

// Subtle architectural perspective-fan background shared with PrismHome.
// Colors come from the accent ramp (src/index.css). SVG presentation
// attributes can't resolve var(), so stop colors are set through `style`.
const ARC_STOPS = [
    { offset: '0%', color: 'var(--color-accent-600)', opacity: 0.22 },
    { offset: '65%', color: 'var(--color-accent-500)', opacity: 0.06 },
    { offset: '100%', color: 'var(--color-accent-500)', opacity: 0 },
];

export function HeroCurvesBg() {
    const fan = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    const stops = ARC_STOPS.map((s) => (
        <stop key={s.offset} offset={s.offset} stopOpacity={s.opacity} style={{ stopColor: s.color }} />
    ));
    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 select-none overflow-hidden">
            <div
                className="absolute inset-x-0 -top-24 h-[260px]"
                style={{
                    background:
                        'radial-gradient(50% 60% at 50% 0%, color-mix(in oklab, var(--color-accent-400) 13%, transparent) 0%, color-mix(in oklab, var(--color-accent-500) 5%, transparent) 45%, transparent 75%)',
                }}
            />
            <svg className="w-full h-full" viewBox="0 0 1440 240" preserveAspectRatio="none" fill="none">
                <defs>
                    <linearGradient id="prism-page-arc-l" x1="0" y1="0" x2="640" y2="200" gradientUnits="userSpaceOnUse">
                        {stops}
                    </linearGradient>
                    <linearGradient id="prism-page-arc-r" x1="1440" y1="0" x2="800" y2="200" gradientUnits="userSpaceOnUse">
                        {stops}
                    </linearGradient>
                </defs>
                {fan.map((i) => (
                    <React.Fragment key={i}>
                        <path
                            d={`M ${-60 + i * 16} ${20 + i * 24} C 240 ${60 + i * 14}, 460 ${120 + i * 10}, 720 ${160 + i * 6}`}
                            stroke="url(#prism-page-arc-l)"
                            strokeWidth={i === 0 ? 1.35 : 0.9}
                        />
                        <path
                            d={`M ${1500 - i * 16} ${20 + i * 24} C 1200 ${60 + i * 14}, 980 ${120 + i * 10}, 720 ${160 + i * 6}`}
                            stroke="url(#prism-page-arc-r)"
                            strokeWidth={i === 0 ? 1.35 : 0.9}
                        />
                    </React.Fragment>
                ))}
            </svg>
        </div>
    );
}

// Prism 2.0 editorial page header — replaces the legacy secondary sticky navbar
// with a clean hero band matching PrismHome.
export function PageHeader({
    title,
    subtitle,
    kicker,
    badge,
    onNavigateBack,
    actions,
    className,
}) {
    return (
        <header
            className={cn(
                'surface-light relative shrink-0 overflow-hidden w-full border-b border-zinc-200/80 bg-white text-zinc-900',
                className
            )}
        >
            <HeroCurvesBg />
            <div className="relative mx-auto max-w-6xl px-4 sm:px-6 pt-7 pb-6">
                <div className="flex flex-wrap items-center gap-2.5 mb-3">
                    {onNavigateBack && (
                        <button
                            type="button"
                            onClick={onNavigateBack}
                            aria-label="Back to Home"
                            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white/95 px-3 py-1 text-xs font-medium text-zinc-700 hover:text-zinc-900 hover:border-zinc-400 transition-colors shadow-xs"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" />
                            <span>Home</span>
                        </button>
                    )}
                    {kicker && (
                        <span className="text-xs font-semibold uppercase tracking-kicker text-accent-600">
                            {kicker}
                        </span>
                    )}
                    {badge}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="display-title text-2xl sm:text-3xl md:text-[36px] text-zinc-900 leading-[1.08]">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="mt-2 text-sm sm:text-[15px] text-zinc-700 max-w-2xl leading-relaxed">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
                </div>
            </div>
        </header>
    );
}

// "Share link" pill button with built-in "Copied" state.
export function ShareLinkButton({ label = 'Share link', getUrl, className }) {
    const [copied, setCopied] = useState(false);

    const handleShare = () => {
        navigator.clipboard.writeText(getUrl ? getUrl() : window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={handleShare}
            className={cn(
                'surface-light inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400 text-xs font-medium text-zinc-800 transition-colors whitespace-nowrap',
                className
            )}
        >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-zinc-600" />}
            <span>{copied ? 'Link copied' : label}</span>
        </button>
    );
}
