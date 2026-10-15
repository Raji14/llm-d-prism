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
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

const VARIANTS = {
    primary:
        'bg-zinc-900 hover:bg-zinc-700 text-white border border-transparent shadow-xs',
    secondary:
        'bg-white hover:bg-zinc-50 text-zinc-700 hover:text-zinc-900 border border-zinc-200/90 hover:border-zinc-300 shadow-xs',
    ghost:
        'bg-transparent hover:bg-zinc-100 text-zinc-700 hover:text-zinc-900 border border-transparent',
    danger:
        'bg-red-600 hover:bg-red-500 text-white border border-transparent shadow-xs',
    outline:
        'bg-transparent hover:bg-zinc-50 text-zinc-700 border border-zinc-200 hover:border-zinc-300',
    dangerOutline:
        'bg-transparent text-red-600 border border-red-200 hover:bg-red-50',
    link:
        'bg-transparent text-zinc-700 hover:text-zinc-900 underline underline-offset-4 border border-transparent px-0 py-0',
    // For dark `.surface-keep` bands: the primary and secondary actions.
    inverse:
        'bg-white hover:bg-zinc-200 text-zinc-900 border border-transparent',
    inverseOutline:
        'bg-transparent hover:bg-white/10 text-white border border-white/15 hover:border-white/30',
};

const SIZES = {
    xs: 'px-3 py-1 text-xs rounded-full gap-1.5',
    sm: 'px-4 py-1.5 text-xs rounded-full gap-1.5',
    md: 'px-5 py-2.5 text-sm rounded-full gap-2',
    // Page-level calls to action (Home hero, dark bands).
    lg: 'h-12 px-6 text-base rounded-full gap-2',
    icon: 'p-2 rounded-full',
};

// Pass `href` for navigation: the button renders as an <a>, so it can be
// opened in a new tab and read as a link by assistive tech. In-app routes
// still pass `onClick` to navigate without a reload.
export const Button = React.forwardRef(function Button(
    { variant = 'primary', size = 'sm', isLoading = false, disabled, href, className, children, ...props },
    ref
) {
    const inactive = disabled || isLoading;
    const classes = cn(
        'surface-light inline-flex items-center justify-center font-medium transition-colors whitespace-nowrap',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/50',
        'disabled:opacity-50 disabled:pointer-events-none',
        href && inactive && 'opacity-50 pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className
    );
    const content = (
        <>
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            {children}
        </>
    );

    if (href) {
        return (
            <a ref={ref} href={href} aria-disabled={inactive || undefined} className={classes} {...props}>
                {content}
            </a>
        );
    }
    return (
        <button ref={ref} disabled={inactive} className={classes} {...props}>
            {content}
        </button>
    );
});
