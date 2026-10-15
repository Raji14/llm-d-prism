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

import React, { useRef } from 'react';
import { cn } from '../../utils/cn';

// Ids that tie a tab to its panel. Tabs and TabPanel build them from the same idBase.
const tabId = (idBase, value) => `${idBase}-tab-${value}`;
const panelId = (idBase, value) => `${idBase}-panel-${value}`;

// Page-level tabs (e.g. Results store: Browse · My work · Watches & reports).
// The active tab reads at a glance: accent label, semibold weight and a 3px
// accent-600 bar (the active-nav colour in skills/style.md). For in-panel
// mode/metric switches use ToggleGroup instead.
//
// The baseline is an inset shadow, not a border: the row scrolls sideways on
// narrow screens, and a scroll container clips anything drawn over its own
// border, which is where the active bar used to sit (so it never showed).
//
// Pass idBase (one useId() per tab row) and show the content in a TabPanel
// with the same idBase, so each tab and its panel point at each other.
//
//   const tabsId = useId();
//   <Tabs tabs={[{ value: 'browse', label: 'Browse' }, { value: 'mine', label: 'My work', count: 3 }]}
//         value={tab} onChange={setTab} ariaLabel="Results store" idBase={tabsId} />
//   <TabPanel idBase={tabsId} value={tab}>{content}</TabPanel>
export function Tabs({ tabs, value, onChange, ariaLabel, idBase, className }) {
    const refs = useRef([]);

    const onKeyDown = (event, index) => {
        if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
        event.preventDefault();
        const step = event.key === 'ArrowRight' ? 1 : -1;
        const next = (index + step + tabs.length) % tabs.length;
        onChange(tabs[next].value);
        refs.current[next]?.focus();
    };

    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            className={cn('surface-light flex items-end gap-6 overflow-x-auto shadow-[inset_0_-1px_0_0_var(--color-zinc-200)]', className)}
        >
            {tabs.map((tab, index) => {
                const active = tab.value === value;
                return (
                    <button
                        key={tab.value}
                        ref={(el) => {
                            refs.current[index] = el;
                        }}
                        type="button"
                        role="tab"
                        id={idBase ? tabId(idBase, tab.value) : undefined}
                        aria-selected={active}
                        // Only the active tab's panel is in the page, so only it points at one.
                        aria-controls={idBase && active ? panelId(idBase, tab.value) : undefined}
                        tabIndex={active ? 0 : -1}
                        onClick={() => onChange(tab.value)}
                        onKeyDown={(event) => onKeyDown(event, index)}
                        className={cn(
                            'group relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-sm pb-3 pt-1 text-sm transition-colors',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40',
                            active ? 'font-semibold text-accent-700' : 'font-medium text-zinc-500 hover:text-zinc-900'
                        )}
                    >
                        {tab.icon}
                        {/* The invisible semibold copy (::after) reserves the active
                            width, so the row doesn't shift when you switch tabs. */}
                        <span
                            data-label={typeof tab.label === 'string' ? tab.label : undefined}
                            className="inline-flex flex-col after:invisible after:h-0 after:overflow-hidden after:font-semibold after:content-[attr(data-label)]"
                        >
                            {tab.label}
                        </span>
                        {tab.count != null && (
                            <span
                                className={cn(
                                    'rounded-full px-1.5 py-px text-tiny font-semibold tabular-nums',
                                    active ? 'bg-accent-600 text-white' : 'bg-zinc-100 text-zinc-600'
                                )}
                            >
                                {tab.count}
                            </span>
                        )}
                        <span
                            aria-hidden="true"
                            className={cn(
                                'absolute inset-x-0 bottom-0 h-[3px] rounded-t-full transition-colors',
                                active ? 'bg-accent-600' : 'bg-transparent group-hover:bg-zinc-300'
                            )}
                        />
                    </button>
                );
            })}
        </div>
    );
}

// The selected tab's content; render one, for the current value. Its tab
// names it. It takes focus (tabIndex 0) so Tab moves from the tab row into
// the content even when the content starts with text rather than a control.
export function TabPanel({ idBase, value, className, children }) {
    return (
        <div
            role="tabpanel"
            id={panelId(idBase, value)}
            aria-labelledby={tabId(idBase, value)}
            tabIndex={0}
            className={cn('focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500/40', className)}
        >
            {children}
        </div>
    );
}
