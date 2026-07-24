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
 * Calculates a nice, human-readable domain and list of tick marks for linear or log charts.
 * 
 * General principles:
 * - Preference toward including zero on linear scales for a proper baseline.
 * - Normalize axes ticks to show even, clean distributions.
 * - Extend the domain slightly beyond the max data point (padding) so marks don't clip at the outer edge.
 * 
 * @param {number} minVal Minimum value in the data.
 * @param {number} maxVal Maximum value in the data.
 * @param {boolean} isLog Whether to calculate log-scale ticks.
 * @param {object} options Configuration overrides.
 * @returns {{domain: [number, number], ticks: number[]}} The calculated domain and tick list.
 */
export function getAxisConfig(minVal, maxVal, isLog = false, options = {}) {
    const { includeZero = true, padding = 0.05, tickCount = 6 } = options;

    if (isLog) {
        const min = Math.max(0.1, minVal);
        const logMin = Math.floor(Math.log10(min));
        const paddedMaxVal = maxVal * (1 + padding);
        const logMax = Math.ceil(Math.log10(paddedMaxVal));

        const ticks = [];
        for (let i = logMin; i <= logMax; i++) {
            ticks.push(Math.pow(10, i));
        }
        return {
            domain: [Math.pow(10, logMin), Math.pow(10, logMax)],
            ticks
        };
    }

    // Linear scale nice ticks
    let startMin = minVal;
    if (includeZero) {
        if (startMin > 0) startMin = 0;
    }

    // Apply upper padding to maxVal
    const range = maxVal - startMin;
    const paddedMax = startMin + range * (1 + padding);

    const rawInterval = (paddedMax - startMin) / (tickCount - 1);
    if (rawInterval <= 0) {
        return {
            domain: [0, 1],
            ticks: [0, 0.2, 0.4, 0.6, 0.8, 1.0]
        };
    }

    const exponent = Math.floor(Math.log10(rawInterval));
    const fraction = rawInterval / Math.pow(10, exponent);

    let niceFraction;
    if (fraction < 1.5) {
        niceFraction = 1;
    } else if (fraction < 2.25) {
        niceFraction = 2;
    } else if (fraction < 3.5) {
        niceFraction = 2.5;
    } else if (fraction < 7.5) {
        niceFraction = 5;
    } else {
        niceFraction = 10;
    }

    const niceInterval = niceFraction * Math.pow(10, exponent);

    const niceMin = Math.floor(startMin / niceInterval) * niceInterval;
    const niceMax = Math.ceil(paddedMax / niceInterval) * niceInterval;

    const ticks = [];
    let current = niceMin;
    const eps = niceInterval / 1000;
    while (current <= niceMax + eps) {
        ticks.push(Number(current.toFixed(10)));
        current += niceInterval;
    }

    return {
        domain: [niceMin, niceMax],
        ticks
    };
}
