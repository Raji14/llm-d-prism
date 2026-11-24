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
import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, Github, Inbox, Menu, X, ArrowUpRight } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from '../ui/Button';
import { BrandLockup } from '../ui/BrandMarks.jsx';
import { readSiteProfile } from '../../config/site.js';
import { useGitHubAuth } from '../../hooks/useGitHubAuth.js';
import { countWaitingResults } from '../../utils/resultsWorkspace.js';
import { NAV, SUBMIT, REPO_URL, isActive, submitFor } from './navigation';

const DEV = Boolean(import.meta.env?.DEV);

// Approvers see what's waiting for them from anywhere in Prism (v1 of
// "who's notified"): the results waiting in this browser, plus, on the
// public store, the community runs waiting in the server's review queue.
// On the dev server, the Results Store's ?role= preview applies here too.
function useWaitingForApprover(instance, currentView) {
    const { user } = useGitHubAuth();
    const previewRole = DEV ? new URLSearchParams(window.location.search).get('role') : null;
    const approver = previewRole === 'admin' || previewRole === 'contributor' ? previewRole === 'admin' : user?.permission === 'admin';
    const [serverWaiting, setServerWaiting] = useState(0);

    useEffect(() => {
        if (!approver || instance !== 'public') return undefined;
        let cancelled = false;
        const headers = {};
        const token = localStorage.getItem('prism_github_token');
        if (token) headers['X-Prism-Github-Token'] = token;
        fetch('/api/results?status=submitted_pending_review&limit=50', { headers })
            .then((res) => (res.ok ? res.json() : null))
            .then((json) => {
                if (!cancelled) setServerWaiting(Array.isArray(json?.items) ? json.items.length : 0);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [approver, instance, currentView]);

    if (!approver) return 0;
    return countWaitingResults(instance) + (instance === 'public' ? serverWaiting : 0);
}

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

// What a top-level item is for (navigation.js `desc`), on hover and keyboard
// focus, so the header alone says where each job lives without more labels.
function NavHint({ id, children }) {
    return (
        <span
            id={id}
            role="tooltip"
            className="pointer-events-none invisible absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-normal text-white shadow-lg group-hover:visible group-has-[:focus-visible]:visible"
        >
            {children}
        </span>
    );
}

// One row of a header dropdown: an in-app view, or a page outside Prism.
function DropdownItem({ it, here, onNavigate }) {
    const Icon = it.icon;
    const body = (
        <>
            <span
                className={cn(
                    'mt-0.5 w-8 h-8 shrink-0 rounded-lg border flex items-center justify-center',
                    here ? 'border-accent-200 text-accent-700 bg-white' : 'border-zinc-200 text-zinc-600 bg-white'
                )}
            >
                <Icon className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-medium text-zinc-900">
                    {it.label}
                    {it.href && <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />}
                    {it.badge && (
                        <span className="text-tiny font-medium rounded-full px-1.5 py-0.5 bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/20">
                            {it.badge}
                        </span>
                    )}
                </span>
                <span className="block text-xs text-zinc-600">{it.desc}</span>
            </span>
        </>
    );
    const className = cn(
        'flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
        here ? 'bg-accent-50' : 'hover:bg-zinc-50 focus-visible:bg-zinc-50'
    );
    if (it.href) {
        return (
            <a href={it.href} target="_blank" rel="noopener noreferrer" className={className}>
                {body}
                <span className="sr-only"> (opens in a new tab)</span>
            </a>
        );
    }
    return (
        <NavLink view={it.view} onNavigate={onNavigate} aria-current={here ? 'page' : undefined} className={className}>
            {body}
        </NavLink>
    );
}

// A disclosure (button + list of links), the pattern for site navigation:
// Tab walks the links, and ArrowUp/ArrowDown, Home and End move between
// them too. Escape closes it and puts focus back on the button.
function Dropdown({ entry, currentView, onNavigate, open, setOpen }) {
    const ref = useRef(null);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);
    const panelId = useId();
    // Which item gets focus once the panel renders (opened from the keyboard).
    const focusOnOpen = useRef(null);
    const active = isActive(entry, currentView);

    const items = () => [...(panelRef.current?.querySelectorAll('a') || [])];
    const close = (refocus) => {
        setOpen(null);
        if (refocus) buttonRef.current?.focus();
    };

    useEffect(() => {
        if (!open) return;
        if (focusOnOpen.current) {
            const list = items();
            (focusOnOpen.current === 'last' ? list[list.length - 1] : list[0])?.focus();
            focusOnOpen.current = null;
        }
        const onDoc = (e) => {
            if (!ref.current?.contains(e.target)) setOpen(null);
        };
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            // Back to the button only if focus was in this dropdown.
            close(ref.current?.contains(document.activeElement));
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, [open, setOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const onButtonKeyDown = (e) => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault();
        if (open) {
            const list = items();
            (e.key === 'ArrowUp' ? list[list.length - 1] : list[0])?.focus();
        } else {
            focusOnOpen.current = e.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(entry.id);
        }
    };

    const onPanelKeyDown = (e) => {
        const list = items();
        const at = list.indexOf(document.activeElement);
        let next = null;
        if (e.key === 'ArrowDown') next = list[(at + 1) % list.length];
        else if (e.key === 'ArrowUp') next = list[(at - 1 + list.length) % list.length];
        else if (e.key === 'Home') next = list[0];
        else if (e.key === 'End') next = list[list.length - 1];
        if (next) {
            e.preventDefault();
            next.focus();
        }
    };

    // Tabbing out of the dropdown closes it, like clicking elsewhere.
    const onBlur = (e) => {
        if (open && e.relatedTarget && !ref.current?.contains(e.relatedTarget)) setOpen(null);
    };

    return (
        <div ref={ref} className="relative" onBlur={onBlur}>
            <button
                ref={buttonRef}
                type="button"
                aria-expanded={open}
                aria-controls={open ? panelId : undefined}
                // The section you're in, even while the dropdown is closed.
                aria-current={active ? 'true' : undefined}
                onClick={() => setOpen(open ? null : entry.id)}
                onKeyDown={onButtonKeyDown}
                className={cn(
                    'relative px-3 py-2 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500',
                    active || open ? 'text-zinc-900 font-medium' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
                )}
            >
                {entry.label}
                <ChevronDown className={cn('w-3.5 h-3.5 text-zinc-400 transition-transform', open && 'rotate-180')} aria-hidden="true" />
                {active && <span className="absolute left-3 right-3 -bottom-[13px] h-0.5 rounded-full bg-accent-500" />}
            </button>
            {open && (
                <div
                    ref={panelRef}
                    id={panelId}
                    onKeyDown={onPanelKeyDown}
                    className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-zinc-200 bg-white p-2 shadow-xl shadow-zinc-900/10 z-50"
                >
                    <ul aria-label={entry.label}>
                        {entry.items.map((it) => (
                            <li key={it.view || it.href}>
                                <DropdownItem
                                    it={it}
                                    here={!!it.view && it.view === currentView}
                                    onNavigate={(v) => {
                                        setOpen(null);
                                        onNavigate?.(v);
                                    }}
                                />
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

export default function SiteHeader({ currentView, onNavigate, mobileOpen, onMobileOpenChange }) {
    const [openMenu, setOpenMenu] = useState(null);
    // A new view closes whatever dropdown led there.
    const [menuView, setMenuView] = useState(currentView);
    if (menuView !== currentView) {
        setMenuView(currentView);
        setOpenMenu(null);
    }
    useEffect(() => {
        onMobileOpenChange?.(false);
    }, [currentView]); // eslint-disable-line react-hooks/exhaustive-deps

    // Same contract as NavLink: modified clicks fall through to the href.
    const goTo = (e, view) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate?.(view);
    };

    const hideSubmit = currentView === 'results-store' || currentView === SUBMIT.view || currentView === 'submit';
    // Which Prism this is (one deployment each): its mark, name and submit words.
    const site = readSiteProfile();
    const submit = submitFor(site.instance);
    // What waits for an approver; on the Results Store its queue tab says so.
    const waiting = useWaitingForApprover(site.instance, currentView);
    const queueName = site.instance === 'internal' ? 'Approval queue' : 'Review queue';
    const showQueue = waiting > 0 && currentView !== 'results-store';
    const openQueue = (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        onNavigate?.('results-store', { tab: 'review' });
    };
    const queuePill = (className) => (
        <a
            href="?view=results-store&tab=review"
            onClick={openQueue}
            aria-label={`${queueName}: ${waiting} waiting for you`}
            className={cn(
                'items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-3 text-sm font-medium text-accent-800 transition-colors hover:bg-accent-100',
                className
            )}
        >
            <Inbox className="w-4 h-4" aria-hidden="true" />
            {queueName}
            <span className="rounded-full bg-accent-600 px-1.5 text-tiny font-semibold tabular-nums text-white">{waiting}</span>
        </a>
    );

    // Escape closes the mobile menu and returns focus to its button.
    const menuButtonRef = useRef(null);
    useEffect(() => {
        if (!mobileOpen) return undefined;
        const onKey = (e) => {
            if (e.key !== 'Escape') return;
            onMobileOpenChange?.(false);
            menuButtonRef.current?.focus();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [mobileOpen, onMobileOpenChange]);

    const mobileLink = (item, active) => {
        const Icon = item.icon;
        const content = (
            <>
                <Icon className="mt-0.5 w-4 h-4 shrink-0 text-zinc-500" strokeWidth={1.75} aria-hidden="true" />
                <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                        {item.label}
                        {item.href && <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />}
                    </span>
                    {item.desc && <span className="block text-xs font-normal text-zinc-500">{item.desc}</span>}
                </span>
            </>
        );
        const className = cn(
            'flex items-start gap-3 rounded-lg px-2 py-2.5 text-sm',
            active ? 'bg-accent-50 text-zinc-900 font-medium' : 'text-zinc-700 hover:bg-zinc-50'
        );
        if (item.href) {
            return (
                <a key={item.href} href={item.href} target="_blank" rel="noopener noreferrer" className={className}>
                    {content}
                    <span className="sr-only"> (opens in a new tab)</span>
                </a>
            );
        }
        return (
            <NavLink key={item.view} view={item.view} onNavigate={onNavigate} aria-current={active ? 'page' : undefined} className={className}>
                {content}
            </NavLink>
        );
    };

    return (
        <header className="surface-light relative z-50 shrink-0 border-b border-zinc-200/80 bg-white/90 backdrop-blur-xl text-zinc-900 font-sans">
            <nav aria-label="Primary" className="mx-auto max-w-6xl h-16 px-4 sm:px-6 flex items-center gap-4 md:gap-6">
                <NavLink view="home" onNavigate={onNavigate} className="flex items-center shrink-0" aria-label={`${site.displayName} home`}>
                    <BrandLockup brand={site.brand} siteName={site.siteName} />
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
                            <span key={entry.id} className="group relative inline-flex">
                                <NavLink
                                    view={entry.view}
                                    onNavigate={onNavigate}
                                    aria-current={isActive(entry, currentView) ? 'page' : undefined}
                                    aria-describedby={entry.desc ? `nav-hint-${entry.id}` : undefined}
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
                                {entry.desc && <NavHint id={`nav-hint-${entry.id}`}>{entry.desc}</NavHint>}
                            </span>
                        )
                    )}
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
                {showQueue && queuePill('hidden h-9 sm:inline-flex')}
                {!hideSubmit && (
                    <Button
                        href={`?view=${submit.view}`}
                        onClick={(e) => goTo(e, submit.view)}
                        variant="secondary"
                        size="md"
                        className="hidden h-9 px-4 py-0 sm:inline-flex"
                    >
                        {submit.label}
                    </Button>
                )}
                <button
                    ref={menuButtonRef}
                    type="button"
                    className="lg:hidden h-9 w-9 rounded-full flex items-center justify-center text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                    aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                    aria-expanded={!!mobileOpen}
                    aria-controls={mobileOpen ? 'mobile-nav' : undefined}
                    onClick={() => onMobileOpenChange?.(!mobileOpen)}
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </nav>

            {mobileOpen && (
                <div
                    id="mobile-nav"
                    className="lg:hidden absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-zinc-200 bg-white px-4 sm:px-6 pb-6 pt-2 shadow-xl"
                >
                    {NAV.map((entry) => (
                        <div key={entry.id} className="py-2">
                            {entry.items ? (
                                <>
                                    <p className="kicker px-2 pt-2 pb-1 text-zinc-500">{entry.label}</p>
                                    {entry.items.map((it) => mobileLink(it, !!it.view && it.view === currentView))}
                                </>
                            ) : (
                                mobileLink(entry, isActive(entry, currentView))
                            )}
                        </div>
                    ))}
                    <div className="mt-2 pt-4 border-t border-zinc-100 flex flex-wrap items-center gap-3">
                        {showQueue && queuePill('inline-flex h-10')}
                        {!hideSubmit && (
                            <Button href={`?view=${submit.view}`} onClick={(e) => goTo(e, submit.view)} size="md" className="h-10 py-0">
                                {submit.label}
                            </Button>
                        )}
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
