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
 * Generate multi-dimensional performance distribution points for a given dataset of recipes.
 * Each base recipe generates a family of benchmark runs across concurrency load levels (N=1, 8, 32, 64, 128).
 */
export function buildDistributionPoints(recipes = []) {
    if (!Array.isArray(recipes) || recipes.length === 0) return [];
    const points = [];
    const concurrencyLevels = [1, 8, 32, 64, 128];

    recipes.forEach(recipe => {
        if (!recipe) return;
        const baseTtft = recipe.ttft_p50 || (recipe.metrics?.ttft_ms?.p50) || 20;
        const baseItl = recipe.itl_p50 || (recipe.metrics?.itl_ms?.p50) || 8;
        const baseTps = recipe.tokens_per_sec || (recipe.metrics?.total_tokens_per_sec?.mean) || 3000;
        const baseCost1m = recipe.cost_analysis?.cost_per_1m_output_tokens_usd || 1.0;
        const baseTpd = recipe.cost_analysis?.tokens_per_dollar || 500000;

        concurrencyLevels.forEach((concurrency, idx) => {
            const ttftScale = 0.7 + (idx * 0.22);
            const tpotScale = 0.85 + (Math.max(0, idx - 2) * 0.28);
            const throughputScale = Math.min(1.4, 0.2 + (Math.log2(concurrency + 1) * 0.22));
            const kvCacheUsage = Math.min(98, Math.round(15 + (concurrency * 0.62)));

            const ttft_p50 = Number((baseTtft * ttftScale).toFixed(1));
            const ttft_p90 = Number((ttft_p50 * 1.35).toFixed(1));
            const ttft_p99 = Number((ttft_p50 * 1.75).toFixed(1));

            const tpot_p50 = Number((baseItl * tpotScale).toFixed(1));
            const tpot_p90 = Number((tpot_p50 * 1.3).toFixed(1));
            const tpot_p99 = Number((tpot_p50 * 1.6).toFixed(1));

            const tokens_per_sec = Math.round(baseTps * throughputScale);
            const single_stream_tps = Number((1000 / tpot_p50).toFixed(1));
            const tokens_per_dollar = Math.round(baseTpd * (throughputScale / ttftScale));
            const cost_per_1m = Number((baseCost1m * (ttftScale / throughputScale)).toFixed(3));

            points.push({
                id: `${recipe.id}-c${concurrency}`,
                recipeId: recipe.id,
                recipe_name: recipe.recipe_name,
                model_name: recipe.model_name,
                model_family: recipe.model_family,
                hardware_summary: recipe.hardware_summary,
                hardware: recipe.hardware,
                stack: recipe.stack,
                author: recipe.author,
                tier: recipe.tier || 'Explorer',
                concurrency,
                concurrencyLabel: `N=${concurrency}`,
                ttft_p50,
                ttft_p90,
                ttft_p99,
                tpot_p50,
                tpot_p90,
                tpot_p99,
                tokens_per_sec,
                single_stream_tps,
                cost_per_1m,
                tokens_per_dollar,
                kv_cache_usage_pct: kvCacheUsage,
                peak_vram_pct: Math.min(95, Math.round(45 + (kvCacheUsage * 0.48))),
                isBaseRun: concurrency === 32,
                color: recipe.stack?.engine === 'llm-d' ? '#06b6d4' :
                       recipe.stack?.engine === 'vllm' ? '#10b981' : '#a855f7'
            });
        });
    });

    return points;
}
