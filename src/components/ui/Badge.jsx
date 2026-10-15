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
import { Eye, Globe, Link2, Lock, Users } from 'lucide-react';
import { cn } from '../../utils/cn';

const TONES = {
    neutral:
        'bg-zinc-500/10 text-zinc-700 ring-1 ring-inset ring-zinc-500/20',
    brand:
        'bg-accent-500/10 text-accent-700 ring-1 ring-inset ring-accent-500/20',
    success:
        'bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20',
    info:
        'bg-sky-500/10 text-sky-700 ring-1 ring-inset ring-sky-500/20',
    warning:
        'bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/25',
    danger:
        'bg-red-500/10 text-red-700 ring-1 ring-inset ring-red-500/20',
    violet:
        'bg-purple-500/10 text-purple-700 ring-1 ring-inset ring-purple-500/20',
};

const SIZES = {
    xs: 'px-2 py-0.5 text-tiny font-medium',
    sm: 'px-2.5 py-0.5 text-micro font-medium',
    md: 'px-3 py-1 text-xs font-medium',
};

export function Badge({ tone = 'neutral', size = 'sm', className, children, ...props }) {
    return (
        <span
            className={cn(
                'surface-light inline-flex items-center gap-1.5 rounded-full select-none whitespace-nowrap',
                TONES[tone] || TONES.neutral,
                SIZES[size] || SIZES.sm,
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
}

// Canonical submission/run lifecycle states.
const STATUS_MAP = {
    staged: { tone: 'neutral', label: 'Staged' },
    processing: { tone: 'info', label: 'Processing', pulse: true },
    in_review: { tone: 'warning', label: 'In review' },
    'in-review': { tone: 'warning', label: 'In review' },
    approved: { tone: 'success', label: 'Approved' },
    published: { tone: 'success', label: 'Published' },
    verified: { tone: 'success', label: 'Verified' },
    community_validated: { tone: 'info', label: 'Community' },
    community: { tone: 'info', label: 'Community' },
    well_lit_path: { tone: 'brand', label: 'Well-lit path' },
    misses_slo: { tone: 'warning', label: 'Misses SLO' },
    // Illustrative entries that ship with the UI; never counted as results.
    sample: { tone: 'neutral', label: 'Sample' },
    rejected: { tone: 'danger', label: 'Rejected' },
    failed: { tone: 'danger', label: 'Failed' },
    action: { tone: 'warning', label: 'Action required' },
    action_required: { tone: 'warning', label: 'Action required' },
    draft: { tone: 'neutral', label: 'Draft' },
    // Results store curve statuses (internal: Draft → Official; public:
    // Draft → In review → Published). Featured is a badge, not a status.
    official: { tone: 'success', label: 'Official' },
    needs_changes: { tone: 'warning', label: 'Needs changes' },
    declined: { tone: 'danger', label: 'Declined' },
    checks_running: { tone: 'info', label: 'Checks running', pulse: true },
    featured: { tone: 'brand', label: 'Featured' },
    superseded: { tone: 'neutral', label: 'Replaced by a newer version' },
};

const DOT_COLORS = {
    neutral: 'bg-zinc-400',
    brand: 'bg-accent-500',
    success: 'bg-emerald-500',
    info: 'bg-sky-500',
    warning: 'bg-amber-500',
    danger: 'bg-red-500',
    violet: 'bg-purple-500',
};

export function StatusChip({ status, label, size = 'sm', showDot = true, className }) {
    const key = String(status || 'draft').toLowerCase();
    const cfg = STATUS_MAP[key] || { tone: 'neutral', label: status || 'Unknown' };
    return (
        <Badge tone={cfg.tone} size={size} className={className}>
            {showDot && (
                <span
                    className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        DOT_COLORS[cfg.tone],
                        cfg.pulse && 'animate-pulse'
                    )}
                />
            )}
            <span>{label || cfg.label}</span>
        </Badge>
    );
}

// Who can see a curve or draft. Paired with StatusChip; always words + icon,
// never color alone. `public` is only valid on the public store.
const VISIBILITY_MAP = {
    me: { label: 'Only me', Icon: Lock },
    link: { label: 'Anyone with the link', Icon: Link2 },
    instance: { label: 'Everyone on this instance', Icon: Users },
    public: { label: 'Public', Icon: Globe },
    reviewers: { label: 'You and reviewers', Icon: Eye },
};

export function VisibilityChip({ visibility, label, size = 'sm', className }) {
    const cfg = VISIBILITY_MAP[visibility] || VISIBILITY_MAP.me;
    const { Icon } = cfg;
    return (
        <Badge tone="neutral" size={size} className={className}>
            <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
            <span>{label || cfg.label}</span>
        </Badge>
    );
}
