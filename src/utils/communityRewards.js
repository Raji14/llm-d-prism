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

import { SEED_LEADERBOARD_RECIPES } from './leaderboardData.js';

/**
 * Registry of Community Badges for Authors & Recipes.
 * Styled for high-contrast legibility on `.surface-light` cards and drawers.
 */
export const COMMUNITY_BADGES = {
    frontier_leader: {
        id: 'frontier_leader',
        name: 'Frontier Leader',
        icon: 'Crown',
        emoji: '👑',
        badgeBg: 'bg-amber-50',
        badgeBorder: 'border-amber-200',
        badgeText: 'text-amber-900',
        description: 'Published a #1 ranked or Pareto-optimal frontier recipe',
    },
    speed_demon: {
        id: 'speed_demon',
        name: 'High Throughput',
        icon: 'Zap',
        emoji: '⚡',
        badgeBg: 'bg-amber-50',
        badgeBorder: 'border-amber-200',
        badgeText: 'text-amber-800',
        description: 'Achieved >= 600 tok/s per chip inference throughput',
    },
    latency_ace: {
        id: 'latency_ace',
        name: 'Low-Latency Ace',
        icon: 'Timer',
        emoji: '⏱️',
        badgeBg: 'bg-accent-50',
        badgeBorder: 'border-accent-200',
        badgeText: 'text-accent-800',
        description: 'Achieved sub-35ms P50 TTFT prefill latency',
    },
    reproduced_run: {
        id: 'reproduced_run',
        name: 'Independently Reproduced',
        icon: 'CheckCircle2',
        emoji: '✓',
        badgeBg: 'bg-emerald-50',
        badgeBorder: 'border-emerald-200',
        badgeText: 'text-emerald-800',
        description: 'Reproduced across 2+ independent runs within +/-3% throughput',
    },
    verified_contributor: {
        id: 'verified_contributor',
        name: 'Verified Harness',
        icon: 'ShieldCheck',
        emoji: '🛡️',
        badgeBg: 'bg-zinc-100',
        badgeBorder: 'border-zinc-200',
        badgeText: 'text-zinc-800',
        description: 'Submitted with a Benchmark Report v0.2 harness manifest',
    },
    radix_pioneer: {
        id: 'radix_pioneer',
        name: 'Prefix Cache Leader',
        icon: 'Layers',
        emoji: '🧩',
        badgeBg: 'bg-sky-50',
        badgeBorder: 'border-sky-200',
        badgeText: 'text-sky-800',
        description: 'Demonstrated >80% prefix caching hit rate',
    },
};

const STORAGE_KEY_VIEWS = 'prism_user_recipe_views';

/**
 * Returns the list of independent reproduction records for a recipe or recipe ID.
 */
export function getRecipeReproductions(recipeOrId) {
    if (!recipeOrId) return [];
    if (typeof recipeOrId === 'object') {
        if (Array.isArray(recipeOrId.reproductions)) return recipeOrId.reproductions;
        const match = SEED_LEADERBOARD_RECIPES.find((r) => r.id === recipeOrId.id);
        return Array.isArray(match?.reproductions) ? match.reproductions : [];
    }
    const match = SEED_LEADERBOARD_RECIPES.find((r) => r.id === recipeOrId);
    return Array.isArray(match?.reproductions) ? match.reproductions : [];
}

/**
 * Returns the number of independent reproductions recorded for a recipe or recipe ID.
 */
export function getRecipeReproductionCount(recipeOrId) {
    if (!recipeOrId) return 0;
    if (typeof recipeOrId === 'object') {
        if (typeof recipeOrId.reproduced_count === 'number') return recipeOrId.reproduced_count;
        if (Array.isArray(recipeOrId.reproductions)) return recipeOrId.reproductions.length;
    }
    return getRecipeReproductions(recipeOrId).length;
}

// Legacy compatibility shims (mapped to reproduction counts)
export function loadUserUpvotes() {
    return [];
}

export function toggleRecipeUpvote() {
    return false;
}

export function getRecipeUpvoteCount(recipeOrId) {
    return getRecipeReproductionCount(recipeOrId);
}

/**
 * Record a view for a recipe
 */
export function recordRecipeView(recipeId) {
    if (!recipeId) return;
    try {
        const raw = localStorage.getItem(STORAGE_KEY_VIEWS);
        const viewsMap = raw ? JSON.parse(raw) : {};
        viewsMap[recipeId] = (viewsMap[recipeId] || 0) + 1;
        localStorage.setItem(STORAGE_KEY_VIEWS, JSON.stringify(viewsMap));
    } catch {
        // ignore
    }
}

/**
 * Get session view count for a recipe
 */
export function getRecipeViewCount(recipeId) {
    if (!recipeId) return 0;
    try {
        const raw = localStorage.getItem(STORAGE_KEY_VIEWS);
        const viewsMap = raw ? JSON.parse(raw) : {};
        return viewsMap[recipeId] || 0;
    } catch {
        return 0;
    }
}

/**
 * Computes badges earned by a recipe or author
 */
export function evaluateRecipeBadges(recipe) {
    if (!recipe) return [];
    const badges = [];

    if (recipe.isParetoOptimal || recipe.rank === 1) {
        badges.push(COMMUNITY_BADGES.frontier_leader);
    }

    if ((recipe.tokens_per_sec_per_chip || 0) >= 600) {
        badges.push(COMMUNITY_BADGES.speed_demon);
    }

    const ttft = recipe.ttft_p50 ?? recipe.metrics?.ttft_ms?.p50;
    if (typeof ttft === 'number' && ttft <= 35) {
        badges.push(COMMUNITY_BADGES.latency_ace);
    }

    const cacheHit = recipe.metrics?.prefix_cache_hit_rate_pct || 0;
    if (cacheHit >= 80) {
        badges.push(COMMUNITY_BADGES.radix_pioneer);
    }

    if (recipe.verification_status === 'verified') {
        badges.push(COMMUNITY_BADGES.verified_contributor);
    }

    if (getRecipeReproductionCount(recipe) >= 2) {
        badges.push(COMMUNITY_BADGES.reproduced_run);
    }

    return badges;
}

/**
 * Computes author summary stats across the dataset without fabricating fallback numbers.
 */
export function calculateAuthorKarma(author, recipes = []) {
    if (!author) {
        return {
            points: 0,
            badges: [],
            totalReproductions: 0,
            totalUpvotes: 0,
            totalViews: 0,
            recipeCount: 0,
        };
    }

    const username = author.username || author.github_id;
    const authorRecipes = (recipes || []).filter(
        (r) => r?.author?.username === username || r?.author?.github_id === username
    );

    let totalReproductions = 0;
    let totalViews = 0;
    let frontierCount = 0;
    let verifiedCount = 0;

    const badgesMap = new Map();

    authorRecipes.forEach((r) => {
        const repros = getRecipeReproductionCount(r);
        const views = getRecipeViewCount(r.id);
        totalReproductions += repros;
        totalViews += views;
        if (r.isParetoOptimal || r.rank === 1) frontierCount++;
        if (r.verification_status === 'verified') verifiedCount++;

        evaluateRecipeBadges(r).forEach((b) => badgesMap.set(b.id, b));
    });

    const points = totalReproductions * 50 + frontierCount * 100 + verifiedCount * 40;

    return {
        points,
        totalReproductions,
        totalUpvotes: totalReproductions,
        totalViews,
        badges: Array.from(badgesMap.values()),
        recipeCount: authorRecipes.length,
    };
}
