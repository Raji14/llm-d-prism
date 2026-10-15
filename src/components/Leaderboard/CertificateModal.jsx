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

import React, { useRef, useState, useEffect } from 'react';
import { X, Award, Download, Copy, Check, Share2, Sparkles, Trophy, ShieldCheck } from 'lucide-react';
import { generateCertificateData } from '../../utils/gamificationEngine.js';
import { CHART_STATUS, resolveSeriesColor } from '../ui';

// The certificate is a downloadable SVG export artifact (serialized via
// XMLSerializer), not themed UI: the CSS palette redirect does not travel with
// the file, so its dark-card chrome is pinned to literal values here.
const CERT_THEME = {
    bg: '#0f172a',
    bgAlt: '#1e1b4b',
    bgDeep: '#020617',
    bgInset: '#030712',
    ink: '#f8fafc',
    inkMuted: '#94a3b8',
    inkFaint: '#64748b',
    border: '#334155',
    borderSubtle: '#1e293b',
    goldHighlight: '#fef08a',
    goldDeep: '#d97706',
};
// Series hues resolved for the dark card so the export matches in-app colors.
const CERT_SKY = resolveSeriesColor(1, 'dark');
const CERT_PURPLE = resolveSeriesColor(3, 'dark');
const CERT_GREEN = resolveSeriesColor(0, 'dark');

export default function CertificateModal({ isOpen, onClose, recipe }) {
    const [copied, setCopied] = useState(false);
    const svgRef = useRef(null);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    if (!isOpen || !recipe) return null;

    const cert = generateCertificateData(recipe);
    if (!cert) return null;

    const markdownSnippet = `[![Prism ${cert.tier} Certificate](https://img.shields.io/badge/Prism_Leaderboard-${cert.tier}_${encodeURIComponent(cert.metrics?.throughput || '')}-${cert.tierConfig?.colorHex?.replace('#', '') || 'amber'}?logo=trophy&style=for-the-badge)](${window.location.origin}/?view=model-leaderboard&recipe=${cert.certificateId})`;

    const handleCopyMarkdown = () => {
        navigator.clipboard.writeText(markdownSnippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadSvg = () => {
        if (!svgRef.current) return;
        const svgData = new XMLSerializer().serializeToString(svgRef.current);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const downloadLink = document.createElement('a');
        downloadLink.href = svgUrl;
        downloadLink.download = `prism-certificate-${cert.certificateId}.svg`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
    };

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-slate-900/95 border border-slate-700/80 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative text-slate-200 backdrop-blur-xl animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        <Trophy className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-white">Verifiable achievement certificate</h2>
                        <p className="text-xs text-slate-400">
                            Cryptographically certified benchmark record for verified reproducibility.
                        </p>
                    </div>
                </div>

                {/* Certificate Card Preview (Rendered as SVG) */}
                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 mb-5 shadow-inner overflow-hidden flex justify-center">
                    <svg
                        ref={svgRef}
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 540 320"
                        className="w-full h-auto max-w-[500px] rounded-xl"
                    >
                        <defs>
                            <linearGradient id="certBg" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor={CERT_THEME.bg} />
                                <stop offset="50%" stopColor={CERT_THEME.bgAlt} />
                                <stop offset="100%" stopColor={CERT_THEME.bgDeep} />
                            </linearGradient>
                            <linearGradient id="goldText" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor={CHART_STATUS.warning} />
                                <stop offset="50%" stopColor={CERT_THEME.goldHighlight} />
                                <stop offset="100%" stopColor={CERT_THEME.goldDeep} />
                            </linearGradient>
                        </defs>

                        {/* Card Border & Background */}
                        <rect x="2" y="2" width="536" height="316" rx="16" fill="url(#certBg)" stroke={CERT_THEME.border} strokeWidth="2" />
                        <rect x="10" y="10" width="520" height="300" rx="12" fill="none" stroke={cert.tierConfig.colorHex} strokeWidth="1.5" strokeDasharray="6 3" opacity="0.6" />

                        {/* Top Banner */}
                        <text x="270" y="38" textAnchor="middle" fill={CERT_THEME.inkMuted} fontSize="9" letterSpacing="3" fontWeight="bold">
                            PRISM INFERENCE BENCHMARKING LEADERBOARD
                        </text>
                        <text x="270" y="65" textAnchor="middle" fill="url(#goldText)" fontSize="18" fontWeight="bold" letterSpacing="1">
                            {cert.tier.toUpperCase()} ACHIEVEMENT AWARD
                        </text>

                        {/* Author Info */}
                        <text x="270" y="98" textAnchor="middle" fill={CERT_THEME.ink} fontSize="15" fontWeight="bold">
                            Awarded to: {cert.authorName} (@{cert.authorHandle})
                        </text>
                        <text x="270" y="118" textAnchor="middle" fill={CERT_THEME.inkMuted} fontSize="11">
                            for optimizing <tspan fill={CERT_SKY} fontWeight="bold">{cert.modelName}</tspan> on <tspan fill={CERT_PURPLE} fontWeight="bold">{cert.hardware}</tspan>
                        </text>

                        {/* Metrics Badges Box */}
                        <rect x="30" y="140" width="480" height="90" rx="8" fill={CERT_THEME.bgInset} fillOpacity="0.8" stroke={CERT_THEME.borderSubtle} />

                        {/* Metric 1: Throughput */}
                        <text x="90" y="165" textAnchor="middle" fill={CERT_THEME.inkMuted} fontSize="10">THROUGHPUT</text>
                        <text x="90" y="195" textAnchor="middle" fill={CHART_STATUS.warning} fontSize="16" fontWeight="bold" fontFamily="monospace">
                            {cert.metrics.throughput}
                        </text>

                        {/* Metric 2: TTFT */}
                        <text x="210" y="165" textAnchor="middle" fill={CERT_THEME.inkMuted} fontSize="10">TTFT (P50)</text>
                        <text x="210" y="195" textAnchor="middle" fill={CERT_SKY} fontSize="16" fontWeight="bold" fontFamily="monospace">
                            {cert.metrics.ttft}
                        </text>

                        {/* Metric 3: Cost / 1M */}
                        <text x="330" y="165" textAnchor="middle" fill={CERT_THEME.inkMuted} fontSize="10">COST / 1M TOKENS</text>
                        <text x="330" y="195" textAnchor="middle" fill={CHART_STATUS.good} fontSize="16" fontWeight="bold" fontFamily="monospace">
                            {cert.metrics.costPer1M}
                        </text>

                        {/* Metric 4: Tokens / $ */}
                        <text x="450" y="165" textAnchor="middle" fill={CERT_THEME.inkMuted} fontSize="10">TOKENS / $</text>
                        <text x="450" y="195" textAnchor="middle" fill={CERT_GREEN} fontSize="16" fontWeight="bold" fontFamily="monospace">
                            {cert.metrics.tokensPerDollar}
                        </text>

                        {/* Footer & Verification Hash */}
                        <text x="35" y="265" fill={CERT_THEME.inkFaint} fontSize="9" fontFamily="monospace">
                            VERIFICATION HASH: {cert.verificationHash}
                        </text>
                        <text x="35" y="280" fill={CERT_THEME.inkFaint} fontSize="9">
                            ISSUED: {cert.issuedAt} • SERVING STACK: {cert.servingEngine}
                        </text>
                        <text x="505" y="275" textAnchor="end" fill={CERT_SKY} fontSize="10" fontWeight="bold">
                            ✓ VERIFIED SOTA
                        </text>
                    </svg>
                </div>

                {/* Markdown snippet */}
                <div className="mb-5">
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 block">
                        GitHub profile README badge snippet
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            type="text"
                            readOnly
                            value={markdownSnippet}
                            className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 focus:outline-none"
                        />
                        <button
                            onClick={handleCopyMarkdown}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors cursor-pointer shrink-0"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copied ? 'Copied!' : 'Copy'}</span>
                        </button>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                    <span className="text-xs text-slate-500 font-mono">
                        ID: {cert.certificateId}
                    </span>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                        >
                            Close
                        </button>
                        <button
                            onClick={handleDownloadSvg}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-bold shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download SVG certificate</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
