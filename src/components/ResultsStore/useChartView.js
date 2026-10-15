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

import { useState } from 'react';
import { defaultLatency } from './CurveChart';
import { availableMetrics, defaultStat } from './catalog';

// What a throughput-vs-latency chart shows (latency metric, statistic,
// throughput) and what its MetricToggles offer.
//
// `pointLists` holds one list of points per series the chart is about. The
// defaults follow those: open on a metric they recorded, at P50 only when
// every one of them has it (else the mean), so one chart never puts a median
// next to a mean. `extraLists` (references, one list each) widen what the
// toggles offer and steer the statistic toward one everyone shares, but never
// flip the chart to something the main series lack. `initial` ({ latency,
// stat, throughput }) comes from a shared link; null fields follow the data.
export function useChartView(pointLists, { extraLists = [], initial = null } = {}) {
    const [picked, setPicked] = useState(() => ({
        latency: initial?.latency || null,
        stat: initial?.stat || null,
        throughput: initial?.throughput || null,
    }));
    const own = pointLists.flat();
    const available = availableMetrics(extraLists.length ? [...own, ...extraLists.flat()] : own);
    const latency = picked.latency ?? defaultLatency(availableMetrics(own));
    // A statistic picked for another metric falls back when this one lacks it.
    const stat = picked.stat && available.stats[latency]?.has(picked.stat) ? picked.stat : defaultStat(pointLists, latency, extraLists);
    return {
        latency,
        stat,
        throughput: picked.throughput ?? 'output',
        available,
        setLatency: (latency) => setPicked((p) => ({ ...p, latency })),
        setStat: (stat) => setPicked((p) => ({ ...p, stat })),
        setThroughput: (throughput) => setPicked((p) => ({ ...p, throughput })),
    };
}
