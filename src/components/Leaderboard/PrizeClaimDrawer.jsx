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

import React, { useState, useEffect } from 'react';
import { X, Flame, Sparkles, CheckCircle2, Send, Trophy, Award, ShieldCheck } from 'lucide-react';
import { SOTA_MILESTONE_TRACKS } from '../../utils/gamificationEngine.js';

export default function PrizeClaimDrawer({ isOpen, onClose, dataset = [] }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const [auditedMilestones, setAuditedMilestones] = useState({});
    const [activeFormTrackId, setActiveFormTrackId] = useState(null);
    const [authorHandle, setAuthorHandle] = useState('');
    const [notes, setNotes] = useState('');
    const [successMessage, setSuccessMessage] = useState(null);

    const handleSubmitAudit = (trackId) => {
        setAuditedMilestones(prev => ({
            ...prev,
            [trackId]: {
                status: 'Audit Submitted',
                authorHandle: authorHandle || '@author',
                submittedAt: new Date().toLocaleTimeString()
            }
        }));
        setActiveFormTrackId(null);
        setAuthorHandle('');
        setNotes('');
        const trackTitle = SOTA_MILESTONE_TRACKS.find(b => b.id === trackId)?.title || 'Milestone Track';
        setSuccessMessage(`Audit submitted successfully for ${trackTitle}! Log verification bot and peer engineers have been notified.`);
        setTimeout(() => setSuccessMessage(null), 5000);
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border-l border-slate-700/80 w-full max-w-lg h-full flex flex-col p-6 shadow-2xl relative text-slate-200 overflow-y-auto">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
                        <Flame className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            SOTA Milestone & Recognition Tracks
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                4 Active Tracks
                            </span>
                        </h2>
                        <p className="text-xs text-slate-400">
                            Earn verified community badges, Pareto SOTA recognition, and Hall of Fame standing.
                        </p>
                    </div>
                </div>

                {/* Success Banner */}
                {successMessage && (
                    <div className="mb-4 p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/50 flex items-start gap-2.5 text-xs text-emerald-300 animate-in slide-in-from-top">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                        <span>{successMessage}</span>
                    </div>
                )}

                {/* Tracks List */}
                <div className="flex-1 space-y-4 mb-6">
                    {SOTA_MILESTONE_TRACKS.map(track => {
                        const qualifyingEntries = dataset.filter(entry =>
                            typeof track.criteria === 'function' ? track.criteria(entry) : false
                        );
                        const isEligible = qualifyingEntries.length > 0;
                        const auditState = auditedMilestones[track.id];

                        return (
                            <div
                                key={track.id}
                                className={`p-4 rounded-2xl border transition-all ${
                                    isEligible
                                        ? 'bg-gradient-to-br from-purple-950/30 to-slate-900 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]'
                                        : 'bg-slate-950/60 border-slate-800 opacity-90'
                                }`}
                            >
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-purple-400">
                                        {track.category}
                                    </span>
                                    <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300">
                                        <span>{track.badge}</span>
                                    </div>
                                </div>

                                <h4 className="text-sm font-bold text-white mb-1">{track.title}</h4>
                                <p className="text-xs text-slate-400 mb-3">{track.description}</p>

                                <div className="flex items-center justify-between pt-3 border-t border-slate-800/80 text-xs">
                                    <div className="text-[11px] text-slate-500">
                                        Reward: <strong className="text-purple-300">{track.recognition}</strong>
                                    </div>

                                    {auditState ? (
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40">
                                            <Sparkles className="w-3 h-3 text-amber-400" />
                                            {auditState.status}
                                        </span>
                                    ) : isEligible ? (
                                        <button
                                            onClick={() => setActiveFormTrackId(activeFormTrackId === track.id ? null : track.id)}
                                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs shadow-[0_0_12px_rgba(168,85,247,0.3)] transition-all cursor-pointer"
                                        >
                                            <ShieldCheck className="w-3 h-3 text-amber-300" />
                                            <span>Request Verification &rarr;</span>
                                        </button>
                                    ) : (
                                        <span className="text-[11px] text-slate-500 italic">
                                            No qualifying recipe in current filter
                                        </span>
                                    )}
                                </div>

                                {/* In-line Audit Submission Form */}
                                {activeFormTrackId === track.id && (
                                    <div className="mt-3 pt-3 border-t border-purple-500/30 space-y-2 bg-slate-950/70 p-3 rounded-xl">
                                        <label className="text-[11px] font-semibold text-slate-300 block">
                                            Contributor GitHub Handle:
                                        </label>
                                        <input
                                            type="text"
                                            value={authorHandle}
                                            onChange={(e) => setAuthorHandle(e.target.value)}
                                            placeholder="@your-github-handle"
                                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-purple-500"
                                        />

                                        <label className="text-[11px] font-semibold text-slate-300 block pt-1">
                                            Qualifying Recipe:
                                        </label>
                                        <div className="text-xs font-mono text-cyan-300 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                                            {qualifyingEntries[0]?.recipe_name} ({qualifyingEntries[0]?.hardware_summary})
                                        </div>

                                        <div className="flex justify-end gap-2 pt-2">
                                            <button
                                                onClick={() => setActiveFormTrackId(null)}
                                                className="px-3 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={() => handleSubmitAudit(track.id)}
                                                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs"
                                            >
                                                <Send className="w-3 h-3" />
                                                <span>Submit for Verification</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer note */}
                <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
                    Milestones are audited via automated log verification and peer reproduction before Hall of Fame induction.
                </div>
            </div>
        </div>
    );
}
