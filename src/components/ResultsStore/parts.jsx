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

// Small pieces shared by the Results store screens.

import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CircleAlert, CircleCheck, Copy, Download, Info, Plus, TriangleAlert, X } from 'lucide-react';
import { Button, StatusChip, VisibilityChip } from '../ui';
import { cn } from '../../utils/cn';
import { downloadText } from './exporters';
import { BROWSER_AUDIENCE, resultStatusLabel } from './instance';

export function BackButton({ onClick, children = 'Back' }) {
    return (
        <Button size="xs" variant="ghost" onClick={onClick} className="-ml-2">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            {children}
        </Button>
    );
}

const NOTICE_TONES = {
    info: 'border-zinc-200 bg-zinc-50 text-zinc-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
};

// A one-line, in-flow message (never sticky): the browser-storage preview
// note, or a warning that a comparison isn't like-for-like.
export function Notice({ tone = 'info', icon, onDismiss, dismissLabel = 'Dismiss notice', className, children }) {
    const Icon = icon || (tone === 'warning' ? TriangleAlert : Info);
    return (
        <div className={cn('flex items-start gap-2.5 rounded-2xl border px-4 py-2 text-xs leading-relaxed', NOTICE_TONES[tone] || NOTICE_TONES.info, className)}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">{children}</div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                    className="-mr-1 -mt-0.5 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700"
                >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}

// Results live in this browser until server storage ships, so the chip says
// that instead of promising a wider audience. Once BROWSER_AUDIENCE is
// cleared, it shows who can actually see the result.
export function ResultVisibilityChip({ curve, size = 'sm' }) {
    if (!BROWSER_AUDIENCE) return <VisibilityChip visibility={curve.visibility} size={size} />;
    return <VisibilityChip visibility="me" size={size} label={curve.visibility === 'me' ? 'Only me' : 'Only in this browser'} />;
}

// Status chip for a result. Statuses that imply other people can see it carry
// the audience ("Official · only in this browser"). Not for run submission
// states from the server: those really are shared, so they keep StatusChip.
export function ResultStatusChip({ status, copy, size = 'sm', className }) {
    return <StatusChip status={status} size={size} className={className} label={resultStatusLabel(status, copy)} />;
}

// Shown instead of a publish button once these runs are already a result.
export function PublishedState({ curve, copy, onOpen, size = 'xs' }) {
    return (
        <span className="inline-flex items-center gap-2">
            <ResultStatusChip status={curve.status} copy={copy} size="xs" />
            <Button size={size} variant="ghost" onClick={onOpen}>
                Open result
            </Button>
        </span>
    );
}

// Label/value pairs. `was` marks a label override ("edited · was tpu");
// measured values are never editable, so they never carry it.
export function MetaGrid({ items, columns = 3 }) {
    return (
        <dl className={cn('grid gap-x-6 gap-y-4', columns === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-3')}>
            {items
                .filter((it) => it && it.value != null && it.value !== '')
                .map((it) => (
                    <div key={it.label} className="min-w-0">
                        <dt className="label-caps text-zinc-500">{it.label}</dt>
                        <dd className={cn('mt-1 break-words text-sm text-zinc-900', it.mono && 'font-mono text-xs tabular-nums')}>
                            {it.value}
                            {it.was !== undefined && (
                                <span className="ml-2 text-micro text-accent-700">edited · was {it.was ? `“${it.was}”` : 'missing'}</span>
                            )}
                        </dd>
                    </div>
                ))}
        </dl>
    );
}

const CHECK_ICON = {
    ok: { Icon: CircleCheck, cls: 'text-emerald-600', label: 'Passed' },
    info: { Icon: Info, cls: 'text-sky-600', label: 'Note' },
    warn: { Icon: TriangleAlert, cls: 'text-amber-600', label: 'Needs attention' },
    error: { Icon: CircleAlert, cls: 'text-red-600', label: 'Blocks publishing' },
};

// Plain-language checks, each with its fix where one exists.
export function CheckList({ checks, onFix, readOnly = false }) {
    return (
        <ul className="space-y-2">
            {checks.map((c) => {
                const { Icon, cls, label } = CHECK_ICON[c.level] || CHECK_ICON.info;
                return (
                    <li key={c.id} className="flex items-start gap-2.5">
                        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', cls)} aria-label={label} />
                        <span className="flex-1 text-xs leading-relaxed text-zinc-700">{c.text}</span>
                        {c.fix && !readOnly && (
                            <Button size="xs" variant="secondary" onClick={() => onFix(c)}>
                                {c.fixLabel}
                            </Button>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

export function CopyButton({ text, label = 'Copy link', copiedLabel = 'Copied', variant = 'secondary', size = 'xs' }) {
    const [copied, setCopied] = useState(false);
    const timer = useRef(null);
    useEffect(() => () => clearTimeout(timer.current), []);
    const onCopy = () => {
        navigator.clipboard?.writeText(typeof text === 'function' ? text() : text);
        setCopied(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1800);
    };
    return (
        <Button size={size} variant={variant} onClick={onCopy}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? copiedLabel : label}
        </Button>
    );
}

// "Download CSV" and "Copy as Markdown" for a table (Compare, Reports).
// `csv` is a function, so the file is only built when someone asks for it.
export function ExportActions({ filename, csv, markdown }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <Button size="xs" variant="secondary" onClick={() => downloadText(filename, csv())}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download CSV
            </Button>
            <CopyButton text={markdown} label="Copy as Markdown" />
        </div>
    );
}

// "+ Add baseline" menu. options: [{ id, name, note, group }], in the order
// to show them. Past a handful, a filter box narrows them by name.
export function BaselinePicker({ options, onPick, label = 'Add baseline', emptyText }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const rootRef = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const onDown = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);
    const q = query.trim().toLowerCase();
    const shown = q ? options.filter((o) => `${o.name} ${o.note || ''}`.toLowerCase().includes(q)) : options;
    const groups = [...new Set(shown.map((o) => o.group))];
    return (
        <div ref={rootRef} className="relative">
            <Button size="xs" variant="secondary" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                {label}
            </Button>
            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-96 max-w-[90vw] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-lg">
                    {options.length > 8 && (
                        <input
                            type="search"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Filter by model, hardware or setup"
                            aria-label="Filter baselines"
                            className="mb-1 w-full rounded-xl border border-zinc-200 px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent-500"
                        />
                    )}
                    {options.length === 0 && <p className="px-3 py-3 text-xs text-zinc-600">{emptyText || 'Nothing to add yet.'}</p>}
                    {options.length > 0 && shown.length === 0 && <p className="px-3 py-3 text-xs text-zinc-600">Nothing matches “{query}”.</p>}
                    {groups.map((g) => (
                        <div key={g} className="py-1">
                            <div className="label-caps px-2.5 pb-1 pt-1.5 text-zinc-500">{g}</div>
                            {shown
                                .filter((o) => o.group === g)
                                .map((o) => (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => {
                                            onPick(o);
                                            setOpen(false);
                                            setQuery('');
                                        }}
                                        className="block w-full rounded-xl px-2.5 py-2 text-left hover:bg-zinc-50"
                                    >
                                        <span className="block text-xs font-medium text-zinc-900">{o.name}</span>
                                        {o.note && <span className="mt-0.5 block text-tiny text-zinc-500">{o.note}</span>}
                                    </button>
                                ))}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Who did what, newest first.
export function HistoryList({ history }) {
    if (!history?.length) return null;
    return (
        <ol className="space-y-1.5">
            {[...history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="flex gap-3 text-xs text-zinc-600">
                    <span className="w-36 shrink-0 font-mono text-tiny tabular-nums text-zinc-500">{new Date(h.at).toLocaleString()}</span>
                    <span>
                        <span className="font-medium text-zinc-800">{h.by}</span> · {h.what}
                    </span>
                </li>
            ))}
        </ol>
    );
}
