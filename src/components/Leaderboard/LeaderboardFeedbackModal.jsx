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

import React, { useState, useRef } from 'react';
import {
    X,
    MessageSquarePlus,
    Flag,
    Layers,
    ExternalLink,
    Copy,
    Check,
    Info
} from 'lucide-react';
import { Button } from '../ui/Button.jsx';
import { useFocusTrap } from '../ui';
import { cn } from '../../utils/cn';
import { feedbackDestinationsFor } from '../../config/site.js';
import { engineLabel, workloadFor, HARDWARE_OPTIONS, DEFAULT_SLO } from '../../utils/leaderboardFacets.js';
import { challengeIssueFields, challengeMarkdown, runDetailLines } from './feedbackDetails.js';

const FEEDBACK_TYPES = [
    {
        id: 'missing_workload',
        label: 'Request',
        icon: Layers,
        desc: 'Request a production model, workload profile, accelerator, or serving stack to be benchmarked on the leaderboard.',
        placeholder: 'Describe your target TTFT / TPOT SLOs, concurrency, or why this configuration matters...'
    },
    {
        id: 'challenge_result',
        label: 'Flag a run',
        icon: Flag,
        desc: 'Flag a suspicious metric, parity mismatch, or reproduction discrepancy on a leaderboard entry.',
        placeholder: 'Describe the roofline violation, harness mismatch, or reproduction delta you observed...'
    },
    {
        id: 'general_feedback',
        label: 'Other',
        icon: MessageSquarePlus,
        desc: 'Share feedback on leaderboard filters, chart axes, or methodology.',
        placeholder: 'Describe the improvement or question...'
    }
];

function normalizeTabType(rawType, hasRecipe) {
    if (hasRecipe) return 'challenge_result';
    if (rawType === 'flag_recipe' || rawType === 'challenge_result') return 'challenge_result';
    if (rawType === 'general' || rawType === 'general_feedback') return 'general_feedback';
    return 'missing_workload';
}

function formatFilterHardware(hwValue) {
    if (!hwValue || hwValue === 'all') return '';
    const match = HARDWARE_OPTIONS.find((h) => h.value === hwValue);
    return match ? match.label : hwValue;
}

function formatFilterWorkload(wlValue) {
    if (!wlValue || wlValue === 'all') return '';
    const match = workloadFor(wlValue);
    return match ? match.label : wlValue;
}

function formatFilterEngine(engValue) {
    if (!engValue || engValue === 'all') return '';
    return engineLabel(engValue);
}

export default function LeaderboardFeedbackModal({
    isOpen,
    onClose,
    initialType = 'missing_workload',
    targetRecipe = null,
    contextRecipe = null,
    activeFilters = {},
    // Where feedback may go on this instance (src/config/site.js). Without an
    // issues URL (Internal Prism) nothing is sent anywhere: people copy the
    // details and share them with their Prism admins.
    destinations = feedbackDestinationsFor(),
    slo = DEFAULT_SLO,
    pricingLabel = null,
    // The link back to this view (the Leaderboard's names its prices).
    getShareUrl = null,
}) {
    const resolvedRecipe = targetRecipe || contextRecipe;
    // Focus starts in the notes field; Tab stays inside; Escape closes this
    // dialog only (it can sit over a result's details).
    const dialogRef = useRef(null);
    useFocusTrap(dialogRef, isOpen, { onEscape: onClose, initialFocus: (root) => root.querySelector('[data-autofocus]') });

    const [feedbackType, setFeedbackType] = useState(() =>
        normalizeTabType(initialType, Boolean(resolvedRecipe))
    );
    const [requestedModel, setRequestedModel] = useState('');
    const [requestedWorkload, setRequestedWorkload] = useState('');
    const [requestedHardware, setRequestedHardware] = useState('');
    const [requestedEngine, setRequestedEngine] = useState('');
    const [notes, setNotes] = useState('');
    const [copiedMarkdown, setCopiedMarkdown] = useState(false);

    const sessionKey = isOpen
        ? `${initialType}:${resolvedRecipe?.id || ''}:${activeFilters.workload || ''}:${activeFilters.hardware || ''}:${activeFilters.model || ''}:${activeFilters.engine || ''}`
        : '';
    const [prevSessionKey, setPrevSessionKey] = useState('');
    if (sessionKey !== prevSessionKey) {
        setPrevSessionKey(sessionKey);
        if (isOpen) {
            setFeedbackType(normalizeTabType(initialType, Boolean(resolvedRecipe)));
            setRequestedModel(activeFilters.model && activeFilters.model !== 'all' ? activeFilters.model : '');
            setRequestedWorkload(formatFilterWorkload(activeFilters.workload));
            setRequestedHardware(formatFilterHardware(activeFilters.hardware));
            setRequestedEngine(formatFilterEngine(activeFilters.engine));
            setNotes('');
            setCopiedMarkdown(false);
        }
    }

    if (!isOpen) return null;

    const issuesUrl = destinations?.issuesUrl || null;
    const shareHint = destinations?.shareHint || null;
    const activeTypeMeta = FEEDBACK_TYPES.find((t) => t.id === feedbackType) || FEEDBACK_TYPES[0];
    // A link back to exactly what the reporter saw (the URL carries the
    // recipe, the latency limit and the prices).
    const pageUrl = getShareUrl ? getShareUrl() : typeof window !== 'undefined' ? window.location.href : null;
    const detailOptions = { slo, pricingLabel, url: pageUrl, notes };
    const detailLines = resolvedRecipe ? runDetailLines(resolvedRecipe, detailOptions) : [];

    const buildGithubIssueUrl = () => {
        if (!issuesUrl) return null;
        if (feedbackType === 'missing_workload') {
            const params = new URLSearchParams({
                template: 'leaderboard_request.yml',
                title: `[Leaderboard Request]: ${requestedModel || 'Model'} · ${requestedWorkload || 'Workload'}`,
                model: requestedModel,
                workload: requestedWorkload,
                hardware: requestedHardware,
                stack: requestedEngine,
                context: notes
            });
            return `${issuesUrl}?${params.toString()}`;
        }

        if (feedbackType === 'challenge_result') {
            const params = new URLSearchParams(challengeIssueFields(resolvedRecipe, detailOptions));
            return `${issuesUrl}?${params.toString()}`;
        }

        const params = new URLSearchParams({
            template: 'feature_request.yml',
            title: `[Leaderboard]: ${notes.slice(0, 60) || 'Feedback'}`,
            problem: notes
        });
        return `${issuesUrl}?${params.toString()}`;
    };

    const buildMarkdownSummary = () => {
        if (feedbackType === 'missing_workload') {
            return [
                `## [Leaderboard Request]: ${requestedModel || 'Model'} · ${requestedWorkload || 'Workload'}`,
                `- **Model**: ${requestedModel || 'Not specified'}`,
                `- **Workload shape & dataset**: ${requestedWorkload || 'Not specified'}`,
                `- **Accelerator & machine type**: ${requestedHardware || 'Any'}`,
                `- **Serving stack**: ${requestedEngine || 'Any'}`,
                '',
                `### Context & SLO constraints`,
                notes || '_No additional notes provided._'
            ].join('\n');
        }

        if (feedbackType === 'challenge_result') {
            return challengeMarkdown(resolvedRecipe, detailOptions);
        }

        return [
            `## [Leaderboard]: ${notes.slice(0, 60) || 'Feedback'}`,
            '',
            notes || '_No additional notes provided._'
        ].join('\n');
    };

    const handleCopyMarkdown = () => {
        const md = buildMarkdownSummary();
        navigator.clipboard?.writeText(md);
        setCopiedMarkdown(true);
        setTimeout(() => setCopiedMarkdown(false), 2000);
    };

    const githubIssueUrl = buildGithubIssueUrl();
    const copyLabel = issuesUrl ? 'Copy markdown' : 'Copy details';

    return (
        <div
            className="surface-light fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs animate-in fade-in duration-150"
            onClick={onClose}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="feedback-modal-title"
                tabIndex={-1}
                className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl text-zinc-900 focus:outline-none"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-start justify-between gap-4 border-b border-zinc-200 pb-4">
                    <div>
                        <h2 id="feedback-modal-title" className="text-lg font-semibold tracking-tight text-zinc-900">
                            {feedbackType === 'challenge_result'
                                ? 'Challenge or flag a benchmark run'
                                : feedbackType === 'missing_workload'
                                ? 'Request a leaderboard configuration'
                                : 'Share leaderboard feedback'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors cursor-pointer"
                        aria-label="Close feedback modal"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <div className="mt-4 space-y-4">
                    {/* Mode selector pills — concise labels that never truncate */}
                    <div className="grid grid-cols-3 gap-2" role="group" aria-label="Kind of feedback">
                        {FEEDBACK_TYPES.map((type) => {
                            const Icon = type.icon;
                            const active = feedbackType === type.id;
                            return (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setFeedbackType(type.id)}
                                    aria-pressed={active}
                                    className={cn(
                                        'flex items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition-colors cursor-pointer',
                                        active
                                            ? 'border-zinc-900 bg-zinc-900 text-white'
                                            : 'border-zinc-200 bg-zinc-50/70 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100/70'
                                    )}
                                >
                                    <Icon className={cn('w-3.5 h-3.5 shrink-0', active ? 'text-accent-400' : 'text-zinc-500')} />
                                    <span>{type.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    <p className="text-xs text-zinc-500 leading-relaxed">
                        {activeTypeMeta.desc}
                    </p>

                    {feedbackType === 'missing_workload' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="fb-model" className="block text-xs font-medium text-zinc-700 mb-1">
                                    Model
                                </label>
                                <input
                                    id="fb-model"
                                    type="text"
                                    value={requestedModel}
                                    onChange={(e) => setRequestedModel(e.target.value)}
                                    placeholder="e.g., Llama 3.1 70B or DeepSeek R1"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label htmlFor="fb-workload" className="block text-xs font-medium text-zinc-700 mb-1">
                                    Workload shape & dataset
                                </label>
                                <input
                                    id="fb-workload"
                                    type="text"
                                    value={requestedWorkload}
                                    onChange={(e) => setRequestedWorkload(e.target.value)}
                                    placeholder="e.g., RAG (4096 in / 512 out)"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label htmlFor="fb-hardware" className="block text-xs font-medium text-zinc-700 mb-1">
                                    Accelerator / machine type
                                </label>
                                <input
                                    id="fb-hardware"
                                    type="text"
                                    value={requestedHardware}
                                    onChange={(e) => setRequestedHardware(e.target.value)}
                                    placeholder="e.g., 8x NVIDIA H100 or 8x TPU v6e"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
                                />
                            </div>
                            <div>
                                <label htmlFor="fb-stack" className="block text-xs font-medium text-zinc-700 mb-1">
                                    Serving stack & optimizations
                                </label>
                                <input
                                    id="fb-stack"
                                    type="text"
                                    value={requestedEngine}
                                    onChange={(e) => setRequestedEngine(e.target.value)}
                                    placeholder="e.g., llm-d, vLLM, SGLang"
                                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none"
                                />
                            </div>
                        </div>
                    )}

                    {feedbackType === 'challenge_result' && resolvedRecipe && (
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
                            <div className="font-semibold text-zinc-900 mb-1">Included with your report</div>
                            <ul className="space-y-0.5 font-mono text-micro text-zinc-700 max-h-40 overflow-y-auto">
                                {detailLines.map((line) => (
                                    <li key={line} className="break-words">{line}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div>
                        <label htmlFor="fb-notes" className="block text-xs font-medium text-zinc-700 mb-1">
                            {feedbackType === 'challenge_result'
                                ? 'What looks wrong or failed to reproduce?'
                                : feedbackType === 'missing_workload'
                                ? 'Use case & SLO constraints'
                                : 'Details'}
                        </label>
                        <textarea
                            id="fb-notes"
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder={activeTypeMeta.placeholder}
                            data-autofocus
                            className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none leading-relaxed"
                        />
                    </div>

                    {issuesUrl ? (
                        <p className="flex items-start gap-1.5 text-micro text-zinc-500">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                            <span>The GitHub issue is public: anyone can read what you send.</span>
                        </p>
                    ) : (
                        <p className="flex items-start gap-1.5 rounded-xl border border-accent-200 bg-accent-50/60 px-3 py-2 text-xs text-zinc-800" role="note">
                            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-accent-600" />
                            <span>
                                Copy the details as Markdown. {shareHint || 'Share them with the people who run this Prism.'} Nothing is sent from this page.
                            </span>
                        </p>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 pt-4">
                        <Button
                            type="button"
                            variant={issuesUrl ? 'secondary' : 'primary'}
                            size="sm"
                            onClick={handleCopyMarkdown}
                        >
                            {copiedMarkdown ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Copied</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="w-3.5 h-3.5" />
                                    <span>{copyLabel}</span>
                                </>
                            )}
                        </Button>

                        <div className="flex items-center gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
                                Cancel
                            </Button>
                            {githubIssueUrl && (
                                <a
                                    href={githubIssueUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
                                >
                                    <span>Open pre-filled GitHub issue</span>
                                    <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
