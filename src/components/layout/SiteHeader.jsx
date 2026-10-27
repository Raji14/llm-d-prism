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

// Prism 2.0 top navigation bar — shared across Home and every inner view.
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Github, Menu, X, ArrowUpRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { NAV, SUBMIT, REPO_URL, DOCS_URL, isActive } from './navigation';

function NavLink({ view, onNavigate, className, children, ...rest }) {
    return (
        <a
            href={`?view=${view}`}
            onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                onNavigate?.(view);
            }}
            className={className}
            {...rest}
        >
            {children}
        </a>
    );
}

function Dropdown({ entry, currentView, onNavigate, open, setOpen }) {
    const ref = useRef(null);
    const active = isActive(entry, currentView);

    useEffect(() => {
        if (!open) return;
        const onDoc = (e) => {
            if (!ref.current?.contains(e.target)) setOpen(null);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') setOpen(null);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, setOpen]);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                onClick={() => setOpen(open ? null : entry.id)}
                className={cn(
                    'relative px-3 py-2 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                    active || open ? 'text-zinc-900 font-medium' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                )}
            >
                {entry.label}
                <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 transition-transform', open && 'rotate-180')} />
                {active && <span className="absolute left-3 right-3 -bottom-[13px] h-0.5 rounded-full bg-accent-500" />}
            </button>
            {open && (
                <div
                    role="menu"
                    className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 z-50"
                >
                    {entry.items.map((it) => {
                        const Icon = it.icon;
                        const here = it.view === currentView;
                        return (
                            <NavLink
                                key={it.view}
                                view={it.view}
                                role="menuitem"
                                onNavigate={(v) => {
                                    setOpen(null);
                                    onNavigate?.(v);
                                }}
                                aria-current={here ? 'page' : undefined}
                                className={cn(
                                    'flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
                                    here ? 'bg-accent-50' : 'hover:bg-zinc-50'
                                )}
                            >
                                <span
                                    className={cn(
                                        'mt-0.5 w-8 h-8 shrink-0 rounded-lg border flex items-center justify-center',
                                        here ? 'border-accent-200 text-accent-700 bg-white' : 'border-zinc-200 text-zinc-600 bg-white'
                                    )}
                                >
                                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                                        {it.label}
                                        {it.badge && (
                                            <span className="text-tiny font-medium rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20">
                                                {it.badge}
                                            </span>
                                        )}
                                    </span>
                                    <span className="block text-xs text-zinc-600">{it.desc}</span>
                                </span>
                            </NavLink>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function SiteHeader({ currentView, onNavigate, mobileOpen, onMobileOpenChange }) {
    const [openMenu, setOpenMenu] = useState(null);
    useEffect(() => {
        setOpenMenu(null);
        onMobileOpenChange?.(false);
    }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps

    // Same contract as NavLink: modified clicks fall through to the href.
    const goTo = (e, view) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate?.(view);
    };

    const hideSubmit = currentView === 'results-store' || currentView === SUBMIT.view || currentView === 'submit';

    return (
        <header className="surface-light relative z-50 shrink-0 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl text-zinc-900 font-sans">
            <nav aria-label="Primary" className="mx-auto max-w-6xl h-16 px-4 sm:px-6 flex items-center gap-4 md:gap-6">
                <NavLink view="home" onNavigate={onNavigate} className="flex items-center gap-3 shrink-0" aria-label="Prism home">
                    <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d" className="h-6 object-contain" />
                    <span className="h-5 w-px bg-zinc-200" />
                    <span className="text-lg font-semibold tracking-tight">Prism</span>
                </NavLink>

                <div className="hidden lg:flex items-center gap-1 text-sm">
                    {NAV.map((entry) =>
                        entry.items ? (
                            <Dropdown
                                key={entry.id}
                                entry={entry}
                                currentView={currentView}
                                onNavigate={onNavigate}
                                open={openMenu === entry.id}
                                setOpen={setOpenMenu}
                            />
                        ) : (
                            <NavLink
                                key={entry.id}
                                view={entry.view}
                                onNavigate={onNavigate}
                                aria-current={isActive(entry, currentView) ? 'page' : undefined}
                                className={cn(
                                    'relative px-3 py-2 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                                    isActive(entry, currentView) ? 'text-zinc-900 font-medium' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                                )}
                            >
                                {entry.label}
                                {isActive(entry, currentView) && (
                                    <span className="absolute left-3 right-3 -bottom-[13px] h-0.5 rounded-full bg-accent-500" />
                                )}
                            </NavLink>
                        )
                    )}
                    <a
                        href={DOCS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-2 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors flex items-center gap-1"
                    >
                        Docs <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                    </a>
                </div>

                <div className="flex-1" />
                <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden md:flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-900 transition-colors"
                >
                    <Github className="w-4 h-4" /> GitHub
                </a>
                {!hideSubmit && (
                    <Button
                        href={`?view=${SUBMIT.view}`}
                        onClick={(e) => goTo(e, SUBMIT.view)}
                        variant="secondary"
                        size="md"
                        className="hidden h-9 px-4 py-0 sm:inline-flex"
                    >
                        {SUBMIT.label}
                    </Button>
                )}
                <button
                    type="button"
                    className="lg:hidden h-9 w-9 rounded-full flex items-center justify-center text-zinc-700 hover:bg-zinc-100"
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={!!mobileOpen}
                    onClick={() => onMobileOpenChange?.(!mobileOpen)}
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </nav>

            {mobileOpen && (
                <div className="lg:hidden absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-zinc-200 bg-white px-4 sm:px-6 pb-6 pt-2 shadow-xl">
                    {NAV.map((entry) => (
                        <div key={entry.id} className="py-2">
                            {entry.items ? (
                                <>
                                    <p className="kicker px-2 pt-2 pb-1 text-zinc-500">
                                        {entry.label}
                                    </p>
                                    {entry.items.map((it) => (
                                        <NavLink
                                            key={it.view}
                                            view={it.view}
                                            onNavigate={onNavigate}
                                            className={cn(
                                                'flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm',
                                                it.view === currentView ? 'bg-accent-50 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                                            )}
                                        >
                                            <it.icon className="w-4 h-4 text-zinc-500" strokeWidth={1.75} /> {it.label}
                                        </NavLink>
                                    ))}
                                </>
                            ) : (
                                <NavLink
                                    view={entry.view}
                                    onNavigate={onNavigate}
                                    className={cn(
                                        'flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm',
                                        isActive(entry, currentView) ? 'bg-accent-50 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
                                    )}
                                >
                                    <entry.icon className="w-4 h-4 text-zinc-500" strokeWidth={1.75} /> {entry.label}
                                </NavLink>
                            )}
                        </div>
                    ))}
                    <div className="mt-2 pt-4 border-t border-zinc-100 flex flex-wrap items-center gap-3">
                        {!hideSubmit && (
                            <Button href={`?view=${SUBMIT.view}`} onClick={(e) => goTo(e, SUBMIT.view)} size="md" className="h-10 py-0">
                                {SUBMIT.label}
                            </Button>
                        )}
                        <Button href={DOCS_URL} target="_blank" rel="noopener noreferrer" variant="secondary" size="md" className="h-10 py-0">
                            Docs
                        </Button>
                        <a
                            href={REPO_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-10 px-4 rounded-full border border-zinc-200 text-sm text-zinc-700 flex items-center gap-2"
                        >
                            <Github className="w-4 h-4" /> GitHub
                        </a>
                    </div>
                </div>
            )}
        </header>
    );
}
