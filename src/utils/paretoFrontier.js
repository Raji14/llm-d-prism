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
 * Extracts a numeric value from nested object or accessor string.
 */
export function getMetricValue(item, key) {
    if (!item) return 0;
    if (typeof key === 'function') return key(item);

    if (key.includes('.')) {
        const parts = key.split('.');
        let curr = item;
        for (const p of parts) {
            if (curr === null || curr === undefined) return 0;
            curr = curr[p];
        }
        return typeof curr === 'number' ? curr : parseFloat(curr) || 0;
    }

    const val = item[key];
    return typeof val === 'number' ? val : parseFloat(val) || 0;
}

/**
 * 2D Non-Dominated Sorting for Pareto Optimal Frontier.
 *
 * Defaults:
 *   - X Axis: Latency / TTFT (Lower is better -> 'min')
 *   - Y Axis: Throughput / Tokens per Sec / Tokens per $ (Higher is better -> 'max')
 *
 * @param {Array} data - Array of benchmark recipe entries
 * @param {string|function} xKey - Key or accessor for X value (e.g. 'ttft_p50')
 * @param {string|function} yKey - Key or accessor for Y value (e.g. 'tokens_per_sec')
 * @param {'min'|'max'} xDirection - Direction of optimality for X ('min' for latency, 'max' for throughput)
 * @param {'min'|'max'} yDirection - Direction of optimality for Y ('max' for throughput/efficiency)
 * @returns {Array} Array of items with .isParetoOptimal and .paretoRank added
 */
export function computeParetoFrontier(
    data,
    xKey = 'ttft_p50',
    yKey = 'tokens_per_sec',
    xDirection = 'min',
    yDirection = 'max'
) {
    if (!Array.isArray(data) || data.length === 0) {
        return [];
    }

    // Filter out invalid items where metrics are missing or zero
    const validItems = data.filter(item => {
        const x = getMetricValue(item, xKey);
        const y = getMetricValue(item, yKey);
        return typeof x === 'number' && !isNaN(x) && x > 0 && typeof y === 'number' && !isNaN(y) && y > 0;
    });

    if (validItems.length === 0) {
        return data.map(d => ({ ...d, isParetoOptimal: false, paretoRank: null }));
    }

    const paretoStatus = new Map();

    // Check pairwise dominance
    for (let i = 0; i < validItems.length; i++) {
        const itemA = validItems[i];
        const xA = getMetricValue(itemA, xKey);
        const yA = getMetricValue(itemA, yKey);
        let isDominated = false;

        for (let j = 0; j < validItems.length; j++) {
            if (i === j) continue;
            const itemB = validItems[j];
            const xB = getMetricValue(itemB, xKey);
            const yB = getMetricValue(itemB, yKey);

            // Dominance condition:
            // B dominates A if B is as good or better in both dimensions, and strictly better in at least one
            const bBetterOrEqualX = xDirection === 'min' ? (xB <= xA) : (xB >= xA);
            const bBetterOrEqualY = yDirection === 'max' ? (yB >= yA) : (yB <= yA);

            const bStrictlyBetterX = xDirection === 'min' ? (xB < xA) : (xB > xA);
            const bStrictlyBetterY = yDirection === 'max' ? (yB > yA) : (yB < yA);

            if (bBetterOrEqualX && bBetterOrEqualY && (bStrictlyBetterX || bStrictlyBetterY)) {
                isDominated = true;
                break;
            }
        }

        paretoStatus.set(itemA.id || i, !isDominated);
    }

    return data.map((item, idx) => {
        const isOptimal = Boolean(paretoStatus.get(item.id || idx));
        return {
            ...item,
            isParetoOptimal: isOptimal,
            paretoRank: isOptimal ? 1 : 2
        };
    });
}

/**
 * Generates sorted stepped coordinates representing the Pareto boundary for Recharts LineChart overlay.
 */
export function generateParetoCurvePoints(
    items,
    xKey = 'ttft_p50',
    yKey = 'tokens_per_sec',
    xDirection = 'min',
    yDirection = 'max'
) {
    const optimalPoints = (items || [])
        .filter(item => item.isParetoOptimal)
        .map(item => ({
            x: getMetricValue(item, xKey),
            y: getMetricValue(item, yKey),
            item
        }));

    if (optimalPoints.length === 0) return [];

    // Sort optimal points by X ascending
    optimalPoints.sort((a, b) => a.x - b.x);

    // Create a stepped monotonic path for clear visual boundary
    const curvePoints = [];
    for (let i = 0; i < optimalPoints.length; i++) {
        const curr = optimalPoints[i];
        if (i > 0 && xDirection === 'min' && yDirection === 'max') {
            const prev = optimalPoints[i - 1];
            // Step corner point for visual threshold
            curvePoints.push({
                x: curr.x,
                y: prev.y,
                isStepNode: true
            });
        }
        curvePoints.push({
            x: curr.x,
            y: curr.y,
            isStepNode: false,
            recipeName: curr.item.recipe_name || curr.item.name,
            hardware: curr.item.hardware?.accelerator_type || curr.item.hardware,
            item: curr.item
        });
    }

    return curvePoints;
}

/**
 * Calculates a 0-100 Pareto efficiency index for any given point relative to the frontier.
 */
export function calculateParetoEfficiencyIndex(item, paretoPoints, xKey = 'ttft_p50', yKey = 'tokens_per_sec') {
    if (!item || !Array.isArray(paretoPoints) || paretoPoints.length === 0) return 50;
    if (item.isParetoOptimal) return 100;

    const itemX = getMetricValue(item, xKey);
    const itemY = getMetricValue(item, yKey);
    if (itemX <= 0 || itemY <= 0) return 0;

    // Find the closest pareto frontier point with equal or better latency
    let maxThroughputAtLatency = 0;
    for (const p of paretoPoints) {
        const px = getMetricValue(p, xKey);
        const py = getMetricValue(p, yKey);
        if (px <= itemX && py > maxThroughputAtLatency) {
            maxThroughputAtLatency = py;
        }
    }

    if (maxThroughputAtLatency <= 0) return 60;
    const ratio = Math.min(1, itemY / maxThroughputAtLatency);
    return Math.round(ratio * 95);
}
