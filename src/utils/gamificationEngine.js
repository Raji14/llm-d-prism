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

/**
 * Standard Gamification Tiers Configuration
 */
export const TIER_CONFIG = {
    Grandmaster: {
        id: 'Grandmaster',
        name: 'Grandmaster',
        shortName: 'GM',
        icon: 'Crown',
        badgeBg: 'bg-gradient-to-r from-amber-500/20 via-yellow-500/20 to-amber-600/30',
        badgeBorder: 'border-amber-400/50',
        badgeText: 'text-amber-300',
        badgeGlow: 'shadow-[0_0_15px_rgba(245,158,11,0.4)]',
        colorHex: '#f59e0b',
        description: 'Rank #1 in model track or verified Pareto frontier record',
    },
    Master: {
        id: 'Master',
        name: 'Master',
        shortName: 'M',
        icon: 'Award',
        badgeBg: 'bg-gradient-to-r from-purple-500/20 via-violet-500/20 to-fuchsia-600/30',
        badgeBorder: 'border-purple-400/50',
        badgeText: 'text-purple-300',
        badgeGlow: 'shadow-[0_0_15px_rgba(168,85,247,0.35)]',
        colorHex: '#a855f7',
        description: 'Top 3 performance in track or 90%+ Pareto efficiency',
    },
    Contender: {
        id: 'Contender',
        name: 'Contender',
        shortName: 'C',
        icon: 'Zap',
        badgeBg: 'bg-gradient-to-r from-accent-600/20 via-blue-500/20 to-sky-600/30',
        badgeBorder: 'border-accent-700/50',
        badgeText: 'text-accent-800',
        badgeGlow: 'shadow-[0_0_12px_rgba(6,182,212,0.3)]',
        colorHex: '#06b6d4',
        description: 'Top 10 verified benchmark recipe submission',
    },
    Explorer: {
        id: 'Explorer',
        name: 'Explorer',
        shortName: 'E',
        icon: 'Sparkles',
        badgeBg: 'bg-gradient-to-r from-slate-700/30 via-slate-800/30 to-slate-900/40',
        badgeBorder: 'border-slate-600/40',
        badgeText: 'text-slate-300',
        badgeGlow: 'none',
        colorHex: '#94a3b8',
        description: 'Community uploaded & staged benchmark recipe',
    }
};

/**
 * Pre-defined SOTA Milestone & Recognition Tracks
 */
export const SOTA_MILESTONE_TRACKS = [
    {
        id: 'milestone-sota-breaker',
        title: 'SOTA Breaker: Llama-3.1-70B on 8x L4 / H100',
        badge: '⚡ Throughput SOTA',
        recognition: 'Hall of Fame & Gold Certificate',
        category: 'Throughput & Latency',
        description: 'Deliver the highest verified throughput on Llama-3.1-70B while keeping TTFT P50 under 35ms.',
        criteria: (entry) => {
            if (!entry) return false;
            const isLlama70B = String(entry.model_name || '').toLowerCase().includes('70b') || String(entry.model_family || '').toLowerCase().includes('llama');
            const isTargetHw = String(entry.hardware_summary || '').toLowerCase().includes('h100') || String(entry.hardware_summary || '').toLowerCase().includes('l4');
            const hasHighThroughput = (entry.tokens_per_sec || 0) >= 3500;
            const hasLowTtft = (entry.ttft_p50 || 999) <= 35;
            return isLlama70B && isTargetHw && hasHighThroughput && hasLowTtft;
        }
    },
    {
        id: 'milestone-cost-crusher',
        title: 'Cost Crusher: > 100k Tokens / Dollar',
        badge: '💰 Best Value SOTA',
        recognition: 'Efficiency Leader Spotlight',
        category: 'Cost Efficiency',
        description: 'Achieve > 100,000 output tokens per dollar using GCP L4 or TPU v5e/v6e with quantization.',
        criteria: (entry) => {
            if (!entry) return false;
            const tokensPerDollar = entry.cost_analysis?.tokens_per_dollar || entry.tokens_per_dollar || 0;
            return tokensPerDollar >= 100000;
        }
    },
    {
        id: 'milestone-prefix-cache',
        title: 'Prefix Cache Optimizer: > 85% Cache Speedup',
        badge: '🧩 Cache Champion',
        recognition: 'Agentic Serving Spotlight',
        category: 'Optimization Recipe',
        description: 'Demonstrate prefix caching hit rate > 80% resulting in > 2x aggregate throughput speedup.',
        criteria: (entry) => {
            if (!entry) return false;
            const hitRate = entry.prefix_cache_hit_rate || entry.metrics?.prefix_cache_hit_rate_pct || 0;
            const tps = entry.tokens_per_sec || 0;
            return hitRate >= 80 && tps >= 2500;
        }
    },
    {
        id: 'milestone-fast-decode',
        title: 'Sub-20ms ITL Flagship Decoding',
        badge: '🏎️ Flagship Latency',
        recognition: 'Interactive SLA Badge',
        category: 'Latency',
        description: 'Achieve sub-20ms Inter-Token Latency (ITL P50) on 70B+ class model at concurrency >= 16.',
        criteria: (entry) => {
            if (!entry) return false;
            const itl = entry.itl_p50 || entry.metrics?.itl_ms?.p50 || 999;
            const conc = entry.workload?.concurrency || entry.concurrency || 1;
            return itl <= 20 && conc >= 16;
        }
    }
];

// Alias for backwards compatibility
export const BOUNTY_TRACKS = SOTA_MILESTONE_TRACKS;

/**
 * Calculates the tier level for a leaderboard entry based on rank, Pareto status, and verification.
 */
export function evaluateEntryTier(entry, rank = null, totalEntries = 10) {
    if (!entry) return TIER_CONFIG.Explorer;

    const isPareto = Boolean(entry.isParetoOptimal);
    const isVerified = entry.verification_status === 'verified' || entry.is_verified;

    if ((rank === 1) || (isPareto && isVerified)) {
        return TIER_CONFIG.Grandmaster;
    }
    if ((rank !== null && rank <= 3) || isPareto) {
        return TIER_CONFIG.Master;
    }
    if ((rank !== null && rank <= 10) || isVerified) {
        return TIER_CONFIG.Contender;
    }

    return TIER_CONFIG.Explorer;
}

/**
 * Checks which milestone tracks an entry qualifies for.
 */
export function evaluateBountyEligibility(entry) {
    if (!entry) return [];
    return SOTA_MILESTONE_TRACKS.map(track => {
        const isEligible = typeof track.criteria === 'function' ? track.criteria(entry) : false;
        return {
            ...track,
            isEligible,
            payoutStatus: isEligible ? (entry.payout_status || 'verified_sota') : 'none'
        };
    });
}

/**
 * Generates cryptographic-looking verification token and badge payload.
 */
export function generateCertificateData(entry) {
    if (!entry) return null;

    const id = entry.id || `rec-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = entry.created_at || new Date().toISOString();
    const hash = `PRISM-VERIFIED-${id.substring(0, 8).toUpperCase()}-${Math.floor(Date.now() / 1000).toString(16).toUpperCase()}`;

    const author = entry.author?.display_name || entry.author?.username || entry.author || 'Anonymous Engineer';
    const authorHandle = entry.author?.github_id || entry.author?.username || 'llm-d-engineer';
    const tier = entry.tier || evaluateEntryTier(entry).name;

    return {
        certificateId: id,
        verificationHash: hash,
        issuedAt: new Date(timestamp).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }),
        authorName: author,
        authorHandle,
        modelName: entry.model_name || entry.name || 'Unknown Model',
        hardware: entry.hardware_summary || entry.hardware?.accelerator_type || 'GCP Accelerator',
        servingEngine: entry.engine || entry.stack?.engine || 'llm-d / vLLM',
        metrics: {
            throughput: entry.tokens_per_sec ? `${Math.round(entry.tokens_per_sec).toLocaleString()} tok/s` : 'N/A',
            ttft: entry.ttft_p50 ? `${entry.ttft_p50.toFixed(1)} ms` : 'N/A',
            itl: entry.itl_p50 ? `${entry.itl_p50.toFixed(1)} ms` : 'N/A',
            costPer1M: entry.cost_analysis?.cost_per_1m_output_tokens_usd ? `$${entry.cost_analysis.cost_per_1m_output_tokens_usd.toFixed(3)}` : 'N/A',
            tokensPerDollar: entry.cost_analysis?.tokens_per_dollar ? `${entry.cost_analysis.tokens_per_dollar.toLocaleString()} tok/$` : 'N/A',
        },
        tier,
        tierConfig: TIER_CONFIG[tier] || TIER_CONFIG.Explorer,
        isParetoOptimal: Boolean(entry.isParetoOptimal)
    };
}
