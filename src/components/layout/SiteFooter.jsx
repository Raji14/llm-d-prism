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

// Prism 2.0 site footer, rendered at the end of every view.
import React from 'react';
import { NAV, SUBMIT, METHODOLOGY, REPO_URL, DOCS_URL } from './navigation';

export default function SiteFooter({ onNavigate }) {
    const link = (view, label) => (
        <li key={view}>
            <a
                href={`?view=${view}`}
                onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                    e.preventDefault();
                    onNavigate?.(view);
                }}
                className="hover:text-zinc-900 transition-colors"
            >
                {label}
            </a>
        </li>
    );
    const ext = (href, label) => (
        <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-zinc-900 transition-colors">{label}</a>
        </li>
    );
    const paths = NAV.find((n) => n.id === 'paths').items;
    const tools = NAV.find((n) => n.id === 'tools').items;
    const heading = 'text-xs font-semibold uppercase tracking-kicker text-zinc-600';

    return (
        <footer className="surface-light relative overflow-hidden border-t border-zinc-200/90 bg-white text-zinc-900 font-sans">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 pt-12 pb-6 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] text-sm">
                <div className="col-span-2 md:col-span-1">
                    <span className="text-base font-semibold">Prism</span>
                    <p className="mt-2 text-zinc-600 max-w-xs">Reproducible inference benchmarks for the llm-d community. Apache-2.0.</p>
                </div>
                <div>
                    <p className={heading}>Explore</p>
                    <ul className="mt-3 space-y-2 text-zinc-600">
                        {link('home', 'Home')}
                        {link('model-leaderboard', 'Leaderboard')}
                        {link(METHODOLOGY.view, METHODOLOGY.label)}
                        {link(SUBMIT.view, SUBMIT.label)}
                    </ul>
                </div>
                <div>
                    <p className={heading}>Well-lit paths</p>
                    <ul className="mt-3 space-y-2 text-zinc-600">{paths.map((p) => link(p.view, p.label))}</ul>
                </div>
                <div>
                    <p className={heading}>Tools</p>
                    <ul className="mt-3 space-y-2 text-zinc-600">{tools.map((t) => link(t.view, t.label))}</ul>
                </div>
                <div>
                    <p className={heading}>Project</p>
                    <ul className="mt-3 space-y-2 text-zinc-600">
                        {ext(REPO_URL, 'GitHub')}
                        {ext(DOCS_URL, 'llm-d.ai')}
                        {ext('https://github.com/llm-d/llm-d-benchmark', 'llm-d-benchmark')}
                        {ext(`${REPO_URL}/tree/main/users`, 'Agent skills')}
                        {ext(`${REPO_URL}/issues`, 'Report an issue')}
                    </ul>
                </div>
            </div>
            <div aria-hidden="true" className="mx-auto max-w-6xl px-4 sm:px-6 h-[0.6em] overflow-hidden select-none text-[clamp(72px,11vw,160px)] font-semibold leading-[0.8] tracking-display text-zinc-900/[0.05]">
                Prism
            </div>
        </footer>
    );
}
