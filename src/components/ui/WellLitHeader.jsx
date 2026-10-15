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
import { MessageCircle } from 'lucide-react';
import { PageHeader, ShareLinkButton } from './PageHeader';

// Canonical editorial hero header for well-lit path and leaderboard pages.
export function WellLitHeader({
    pageTitle,
    subtitle,
    kicker,
    badgeLabel = null,
    contactHref = 'https://llm-d.ai/community',
    getShareUrl,
    onNavigateBack,
    extraActions,
    isPrototype = false,
}) {
    const showBadge = Boolean(badgeLabel || isPrototype);
    return (
        <PageHeader
            onNavigateBack={onNavigateBack}
            kicker={kicker}
            title={pageTitle}
            subtitle={subtitle}
            badge={
                showBadge ? (
                    <div className="flex items-center gap-2">
                        {badgeLabel && (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-medium bg-emerald-500/10 text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                {badgeLabel}
                            </span>
                        )}
                        {isPrototype && (
                            <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-micro font-medium bg-amber-500/10 text-amber-700 ring-1 ring-inset ring-amber-500/25">
                                Preview
                            </span>
                        )}
                    </div>
                ) : null
            }
            actions={
                <>
                    <a
                        href={contactHref}
                        target="_blank"
                        rel="noreferrer"
                        title="Contact us"
                        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-zinc-300 bg-white hover:bg-zinc-50 hover:border-zinc-400 text-xs font-medium text-zinc-800 transition-colors"
                    >
                        <MessageCircle className="w-3.5 h-3.5 text-zinc-600" />
                        <span className="hidden sm:inline">Discuss</span>
                    </a>
                    <ShareLinkButton getUrl={getShareUrl} />
                    {extraActions}
                </>
            }
        />
    );
}
