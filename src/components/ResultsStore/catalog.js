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

// The Results store's data model, as pure functions over the loaded entries.
//
//   Run    — measured data exactly as it arrived (one benchmark execution).
//            Read-only. A sweep (several stages) is one run with many points.
//   Curve  — what people curate, publish and share: a named view over one or
//            more runs (see workspace). Never copies or edits the runs.
//   Row    — what Browse lists: a run, a suggested curve (standalone runs that
//            differ only in concurrency) and its repeats, collapsed (×N).
//   Setup  — one configuration measured again and again (model, hardware,
//            workload, harness, deployment). Watches follow exactly one.
//
// UI names: a curve is shown as a Result, a suggested curve as a Sweep, a
// baseline a Baseline and a showcase a Report.

import { getBenchmarkKey } from '../../utils/dashboardHelpers';
import { DEFAULT_PRICING_CATALOG, normalizeAcceleratorId } from '../../utils/pricingEngine';

// Captured once per page load; relative dates ("Today") use it as "now".
export const LOADED_AT = Date.now();

const DAY_MS = 24 * 60 * 60 * 1000;
// Standalone runs further apart than this never join the same suggested curve.
const BATCH_WINDOW_MS = 36 * 60 * 60 * 1000;
export const ERROR_LIMIT_PCT = 5;

// ---------------------------------------------------------------- formatting

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export const fmtInt = (n) => (isNum(n) ? Math.round(n).toLocaleString('en-US') : '—');
export const fmtTput = (n) => {
    if (!isNum(n)) return '—';
    return n >= 10000 ? `${(n / 1000).toFixed(1)}k` : Math.round(n).toLocaleString('en-US');
};
// Counts that run into millions, e.g. tokens per $: 905.4k, 2.22M, 1.50B.
// Each unit starts where the one below would round up to "1000".
export const fmtCount = (n) => {
    if (!isNum(n)) return '—';
    if (n >= 999995000) return `${(n / 1e9).toFixed(2)}B`;
    if (n >= 999950) return `${(n / 1e6).toFixed(2)}M`;
    return fmtTput(n);
};
export const fmtMs = (n) => {
    if (!isNum(n)) return '—';
    return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
};
export const fmtPct = (n, digits = 1) => (isNum(n) ? `${n > 0 ? '+' : ''}${n.toFixed(digits)}%` : '—');
export const fmtMoney = (n) => (isNum(n) ? `$${n < 1 ? n.toFixed(3) : n.toFixed(2)}` : '—');

export function fmtDay(ts) {
    if (!ts) return 'Date unknown';
    const d = new Date(ts);
    const now = new Date(LOADED_AT);
    const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOf(now) - startOf(d)) / DAY_MS);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    const label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
    return d.getFullYear() === now.getFullYear() ? label : `${label}, ${d.getFullYear()}`;
}

export function fmtShortDay(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function fmtDateTime(ts) {
    if (!ts) return 'Date unknown';
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}, ${hh}:${mm}`;
}

// "c=1–256", or for a sweep of request rates "1–9 req/s". Null when neither
// was recorded.
export function concRange(points) {
    const cs = points.map((p) => p.conc).filter(isNum);
    if (cs.length) {
        const lo = Math.min(...cs);
        const hi = Math.max(...cs);
        return lo === hi ? `c=${lo}` : `c=${lo}–${hi}`;
    }
    const rs = points.map((p) => p.rate).filter(isNum);
    if (!rs.length) return null;
    const lo = Math.min(...rs);
    const hi = Math.max(...rs);
    return lo === hi ? `${lo} req/s` : `${lo}–${hi} req/s`;
}

// Points in the order load was applied: by concurrency, else by offered
// request rate (rate sweeps), else by throughput. A stage that recorded no
// rate among ones that did sits by the rated stage closest in throughput.
// Drawn in this order, an overloaded tail bends back instead of zig-zagging.
export function loadOrder(points) {
    if (points.length && points.every((p) => isNum(p.conc))) return { by: 'conc', points: [...points].sort((a, b) => a.conc - b.conc) };
    const rated = points.filter((p) => isNum(p.rate));
    if (rated.length >= 2 && rated.length >= points.length * 0.6) {
        const keyOf = (p) => (isNum(p.rate) ? p.rate : rated.reduce((best, q) => (Math.abs(q.output - p.output) < Math.abs(best.output - p.output) ? q : best)).rate);
        return { by: 'rate', points: [...points].sort((a, b) => keyOf(a) - keyOf(b) || a.output - b.output) };
    }
    return { by: 'output', points: [...points].sort((a, b) => a.output - b.output) };
}

// Stable key for a Compare / Share item: a Browse row, a run or a curve.
export const itemKey = (item) => (item.type === 'curve' ? `curve|${item.id}` : `${item.type}|${item.key}`);

export const peakOutput = (points) => points.reduce((m, p) => (isNum(p.output) && p.output > m ? p.output : m), 0) || null;

// ------------------------------------------------------------------- metrics
//
// A point keeps each latency at every statistic its harness reported:
// `ttftMean`, `ttftP50`, `ttftP99` (null when not reported), and `ttft`, the
// typical value (p50 where reported, else the mean) for thumbnails, pricing
// and checks. Charts plot one metric at one statistic and say which.

export const LATENCY_METRICS = [
    { value: 'ttft', label: 'TTFT' },
    { value: 'tpot', label: 'TPOT' },
    { value: 'itl', label: 'ITL' },
    { value: 'e2e', label: 'E2E' },
];

// In the order of the shared Mean | P50 | P90 | P99 selector (no P90 here:
// the store doesn't read it).
export const LATENCY_STATS = [
    { value: 'mean', label: 'Mean' },
    { value: 'p50', label: 'P50' },
    { value: 'p99', label: 'P99' },
];
const STAT_SUFFIX = { mean: 'Mean', p50: 'P50', p99: 'P99' };

// Per-chip values divide by the accelerator count in the hardware label.
export const THROUGHPUT_METRICS = [
    { value: 'output', label: 'Output', axis: 'Output throughput (tok/s)', base: 'output' },
    { value: 'total', label: 'Total', axis: 'Total throughput (tok/s)', base: 'total' },
    { value: 'outputPerChip', label: 'Output per chip', axis: 'Output throughput per chip (tok/s)', base: 'output', perChip: true },
    { value: 'totalPerChip', label: 'Total per chip', axis: 'Total throughput per chip (tok/s)', base: 'total', perChip: true },
];
export const throughputMetric = (value) => THROUGHPUT_METRICS.find((m) => m.value === value) || THROUGHPUT_METRICS[0];

// "TTFT p50", "E2E mean"; just "TTFT" without a statistic.
export const latencyLabel = (metric, stat) => [LATENCY_METRICS.find((m) => m.value === metric)?.label || metric, stat].filter(Boolean).join(' ');
export const latencyAxis = (metric, stat) => `${latencyLabel(metric, stat)} (ms)`;

// The point field for a metric at a statistic: latencyKey('ttft', 'p50') → 'ttftP50'.
export const latencyKey = (metric, stat) => `${metric}${STAT_SUFFIX[stat]}`;

// The latency a chart plots: one metric (ttft…) at one statistic (p50…), or
// the typical value when no statistic is given. Points saved before Prism
// kept each statistic hold only the typical value: it stands in for p50 and
// mean (seriesPoints marks it so the chart can say so), and has no p99.
export function latencyValue(p, metric, stat) {
    if (!stat) return isNum(p[metric]) ? p[metric] : null;
    const key = latencyKey(metric, stat);
    if (key in p) return isNum(p[key]) ? p[key] : null;
    return stat !== 'p99' && isNum(p[metric]) ? p[metric] : null;
}
const statUnknown = (p, metric, stat) => Boolean(stat) && !(latencyKey(metric, stat) in p) && isNum(p[metric]);

// Which statistic a point's typical value is: 'p50', 'mean', or null when
// it was saved before Prism recorded that.
export function typicalStat(p, metric) {
    if (isNum(p[`${metric}P50`])) return 'p50';
    if (isNum(p[`${metric}Mean`])) return 'mean';
    return null;
}

// Which metrics any of these points recorded. `stats` maps each latency
// metric to the statistics recorded for it.
export function availableMetrics(points) {
    const has = (get) => points.some((p) => isNum(get(p)));
    const stats = Object.fromEntries(
        LATENCY_METRICS.map((m) => [m.value, new Set(LATENCY_STATS.map((s) => s.value).filter((s) => has((p) => latencyValue(p, m.value, s))))])
    );
    return {
        latency: new Set(LATENCY_METRICS.map((m) => m.value).filter((k) => stats[k].size > 0)),
        stats,
        throughput: new Set(THROUGHPUT_METRICS.map((m) => m.value).filter((k) => has((p) => p[k]))),
    };
}

// The statistic a chart opens on: P50 where every series recorded it, else
// the mean, so one chart doesn't put one run's median next to another's mean.
// `pointLists` holds one list of points per series the chart is about;
// `otherLists` (baselines) count only toward a statistic everyone shares,
// never toward one the main series lack.
const STAT_ORDER = ['p50', 'mean', 'p99'];
export function defaultStat(pointLists, metric, otherLists = []) {
    const lists = pointLists.filter((pts) => pts.length);
    const others = otherLists.filter((pts) => pts.length);
    const has = (pts, s) => pts.some((p) => isNum(latencyValue(p, metric, s)));
    const every = (group, s) => group.length > 0 && group.every((pts) => has(pts, s));
    return (
        STAT_ORDER.find((s) => every(lists, s) && others.every((pts) => has(pts, s))) ||
        STAT_ORDER.find((s) => every(lists, s)) ||
        STAT_ORDER.find((s) => lists.some((pts) => has(pts, s))) ||
        'p50'
    );
}

const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
};
const firstNum = (...values) => {
    for (const v of values) {
        const n = num(v);
        if (n != null) return n;
    }
    return null;
};

const readOutput = (d) => firstNum(d.metrics?.output_tput, d.metrics?.throughput, d.throughput);
// A stage that reported exactly 0 tok/s, as opposed to no throughput at all.
const reportsZeroOutput = (d) =>
    [d.metrics?.output_tput, d.metrics?.throughput, d.throughput].some((v) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number(v) === 0);

// Parsers nest a metric's statistics ({ mean, p50, p99 }) or flatten them
// (metrics.tpot_p50); plain numbers (metrics.tpot_ms, itl, e2e_latency) are
// means in every parser. Candidates per statistic, most specific first.
const statsOf = (v) => (v && typeof v === 'object' ? v : {});
const LATENCY_FIELDS = {
    ttft: (d) => {
        const nested = [statsOf(d.ttft), statsOf(d.metrics?.ttft), statsOf(d.metrics?.ttft_ms)];
        return {
            p50: [...nested.map((s) => s.p50), d.metrics?.ttft_p50],
            mean: [...nested.map((s) => s.mean), d.metrics?.ttft_ms],
            p99: [...nested.map((s) => s.p99), d.metrics?.ttft_p99, d.ttft_p99],
        };
    },
    tpot: (d) => {
        const nested = [statsOf(d.tpot), statsOf(d.metrics?.tpot)];
        return {
            p50: [d.metrics?.tpot_p50, ...nested.map((s) => s.p50)],
            mean: [d.metrics?.tpot_ms, d.metrics?.tpot, d.tpot, d.time_per_output_token, ...nested.map((s) => s.mean)],
            p99: [d.metrics?.tpot_p99, ...nested.map((s) => s.p99), d.tpot_p99],
        };
    },
    itl: (d) => {
        const nested = [statsOf(d.itl), statsOf(d.metrics?.itl)];
        return {
            p50: [d.metrics?.itl_p50, ...nested.map((s) => s.p50)],
            mean: [d.metrics?.itl_ms, d.metrics?.itl, d.itl, ...nested.map((s) => s.mean)],
            p99: [d.metrics?.itl_p99, ...nested.map((s) => s.p99), d.itl_p99],
        };
    },
    e2e: (d) => {
        const nested = [statsOf(d.latency), statsOf(d.metrics?.latency)];
        return {
            p50: nested.map((s) => s.p50),
            mean: [d.metrics?.e2e_latency, ...nested.map((s) => s.mean)],
            p99: [...nested.map((s) => s.p99), d.metrics?.e2e_p99],
        };
    },
};

// One latency at each statistic. Parsers write p50: 0 for "not reported",
// and some copy the mean into p50, so a p50 equal to the mean isn't a
// median. A p99 below the median can't be right, and one far below the mean
// is a unit mix-up (seconds next to milliseconds): both are left out.
function readLatency(d, metric) {
    const f = LATENCY_FIELDS[metric](d);
    const mean = firstNum(...f.mean);
    const rawP50 = firstNum(...f.p50);
    const p50 = rawP50 != null && rawP50 !== mean ? rawP50 : null;
    let p99 = firstNum(...f.p99);
    if (p99 != null && (p50 != null ? p99 < p50 : mean != null && p99 * 100 < mean)) p99 = null;
    return { mean, p50, p99 };
}

export function parseTimestamp(ts) {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
    const s = String(ts);
    const compact = s.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/);
    if (compact) {
        const [, y, mo, d, h, mi, se] = compact.map(Number);
        return new Date(y, mo - 1, d, h, mi, se).getTime();
    }
    const parsed = Date.parse(s);
    return Number.isFinite(parsed) ? parsed : 0;
}

// --------------------------------------------------------- entry → run fields

// When a report carries no timestamp the parser stamps it with "now"; fall back
// to when the run was submitted instead of calling it "Today".
function entryTs(d) {
    const measured = parseTimestamp(d.timestamp || d.metadata?.timestamp);
    const submitted = parseTimestamp(d.source_info?.submitted_at);
    if (submitted && (!measured || LOADED_AT - measured < 10 * 60 * 1000)) return Math.min(submitted, measured || submitted);
    return measured;
}

const GENERIC_HW = new Set(['', 'unknown', 'unknown hardware', 'detected hardware', 'tpu', 'gpu', 'n/a', 'none']);
export const isGenericHardware = (hw) => GENERIC_HW.has(String(hw || '').trim().toLowerCase());

const cleanModel = (name) => String(name || '').replace(/\s*\[.*?\]/g, '').replace(/\s*\(.*?\)/g, '').trim();
const shortModel = (name) => {
    const s = cleanModel(name);
    const i = s.lastIndexOf('/');
    return i >= 0 ? s.slice(i + 1) : s;
};

const accelCountOf = (d) => {
    const fromMeta = Number(d.metadata?.accelerator_count || d.accelerator_count);
    if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
    const m = String(d.hardware || '').match(/\(x(\d+)\)/);
    return m ? parseInt(m[1], 10) : 1;
};

const hardwareOf = (d) =>
    String(d.hardware || d.metadata?.hardware || d.accelerator_type || d.metadata?.accelerator_type || '')
        .replace(/\s*\(x\d+\)/, '')
        .trim();

export const hardwareLabel = (hw, count) => (isGenericHardware(hw) ? '' : `${hw} ×${count || 1}`);

// Benchmark report v0.2 lists each serving component's accelerators per
// replica (count = TP × PP × DP-local) next to its replica count. The shared
// parser reads only the count, so two TP4 replicas show as 4 chips, not 8.
// TPU slices may give a topology instead ("tpu7x-2x2x1" is 4 chips).
// Returns { chips, topology } or null when the report doesn't say.
function reportChips(report) {
    const engines = (report?.scenario?.stack || []).filter((c) => c?.standardized?.kind === 'inference_engine');
    let chips = 0;
    let topology = false;
    for (const c of engines) {
        const s = c.standardized;
        const acc = s.accelerator || {};
        const par = acc.parallelism || s.parallelism || {};
        const topo = String(acc.model || '').match(/(\d+)x(\d+)(?:x(\d+))?\s*$/i);
        const counted = num(acc.count);
        const per = counted || (topo ? topo.slice(1).filter(Boolean).reduce((n, v) => n * Number(v), 1) : null);
        if (!per) return null;
        topology = topology || (!counted && Boolean(topo));
        const replicas = num(s.replicas) || 1;
        const perReplica = (num(par.tp) || 1) * (num(par.pp) || 1) * (num(par.dp_local) || 1);
        // A count bigger than one replica needs already covers every replica.
        chips += per <= perReplica || !counted ? per * replicas : per;
    }
    return chips ? { chips, topology } : null;
}

// Benchmark report v0.2 names its stack ("standard-k8s (plain Service, no
// llm-d gateway/EPP)"): the text before the first comma or bracket is the
// setup, the full label its detail. An unlabelled stack is named by its
// shape, as the archives do: "2 TP4" (replicas, TP) or "1P-TP4 3D-TP4".
function reportSetupOf(report) {
    const stack = report?.scenario?.stack || [];
    const label = stack.map((c) => String(c?.metadata?.label || '').trim()).find(Boolean);
    if (label) return { setup: label.split(/\s*[,(]/)[0].trim() || label, detail: label };
    const tpOf = (s) => num(s.accelerator?.parallelism?.tp ?? s.parallelism?.tp);
    const engines = stack.filter((c) => c?.standardized?.kind === 'inference_engine' && tpOf(c.standardized));
    if (!engines.length) return null;
    const pd = engines.some((c) => c.standardized.role === 'prefill');
    const shape = (s) => {
        const n = num(s.replicas) || 1;
        if (!pd) return `${n} TP${tpOf(s)}`;
        return `${n}${s.role === 'prefill' ? 'P' : 'D'}-TP${tpOf(s)}`;
    };
    return { setup: engines.map((c) => shape(c.standardized)).join(pd ? ' ' : ' + '), detail: null };
}

// A run's workload: as configured where the source says, else as measured.
// Measured averages drift from run to run (models stop before the output
// cap; shared prefixes add input tokens), so going by them alone splits one
// workload into many. In order:
//   variant "1000/300"         configured
//   run id "…-run_1000_300_…"  configured (the archives' treatment name)
//   report load cfg_id         measured, but one key for every run of that load
//   otherwise                  measured; unifyWorkloads groups near-equal ones
function workloadOf(d, runId) {
    const isl = num(d.workload?.input_tokens ?? d.isl);
    const osl = num(d.workload?.output_tokens ?? d.osl);
    const measured = { isl: isl ? Math.round(isl) : null, osl: osl ? Math.round(osl) : null };
    const variant = d._raw?.metadata?.variant ?? d.metadata?.variant;
    if (typeof variant === 'string' && /^\s*\d+\s*\/\s*\d+\s*$/.test(variant)) {
        const [a, b] = variant.split('/').map((x) => parseInt(x, 10));
        return { isl: a, osl: b, configured: true, measured };
    }
    // Only when the measured lengths fit it: input at least the configured
    // length, output a little under its cap.
    const t = String(runId || '').match(/[-_]run_(\d{1,6})_(\d{1,6})(?=_|$)/);
    if (t && measured.isl >= Number(t[1]) * 0.9 && measured.osl >= Number(t[2]) * 0.5 && measured.osl <= Number(t[2]) * 1.1) {
        return { isl: Number(t[1]), osl: Number(t[2]), configured: true, measured };
    }
    const cfg = d.rawReport?.scenario?.load?.metadata?.cfg_id;
    return { isl: isl || null, osl: osl || null, cfg: cfg ? String(cfg) : null, measured };
}

// Measured workloads this close are one workload. Input length is set by the
// prompts, so it barely moves; output length is a cap the model stops short
// of, so it drifts more.
const ISL_TOLERANCE = 0.04;
const OSL_TOLERANCE = 0.12;
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(a, b);
const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
// Two significant figures: 994.76 → 990, 31961 → 32000.
const sig2 = (n) => {
    const step = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 1);
    return Math.round(n / step) * step;
};
// One label for a group's measured lengths: exact when every run reports the
// same whole number (a configured length, e.g. 7200), else the median to two
// significant figures, so the label doesn't move with every new run.
const groupLength = (values) => (values.every((v) => Number.isInteger(v) && v === values[0]) ? values[0] : sig2(median(values)));

// Gives runs that measured the same workload one label: by report load
// config where recorded, else by closeness, per model (tokenizers differ).
function unifyWorkloads(runs) {
    const groups = new Map();
    const clusters = new Map();
    runs.forEach((r) => {
        const w = r.wl;
        if (w.configured || !w.isl || !w.osl) return;
        const model = r.model.toLowerCase();
        if (w.cfg) {
            const k = `${w.cfg}|${model}`;
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(r);
            return;
        }
        const list = clusters.get(model) || [];
        const hit = list.find((c) => near(c[0].wl.isl, w.isl, ISL_TOLERANCE) && near(c[0].wl.osl, w.osl, OSL_TOLERANCE));
        if (hit) hit.push(r);
        else list.push([r]);
        clusters.set(model, list);
    });
    const label = (group) => {
        const isl = groupLength(group.map((r) => r.wl.isl));
        const osl = groupLength(group.map((r) => r.wl.osl));
        group.forEach((r) => {
            r.isl = isl;
            r.osl = osl;
            r.workload = `${isl}/${osl}`;
        });
    };
    groups.forEach(label);
    clusters.forEach((list) => list.forEach(label));
}

function harnessOf(d) {
    if (d.harness || d.metadata?.harness) return d.harness || d.metadata.harness;
    const src = String(d.source || '');
    if (d.source_info?.type === 'benchmark_report_v02' || src.startsWith('brv02:')) {
        return d.backend && d.backend !== 'Unknown' ? d.backend : 'Benchmark report';
    }
    const hay = `${d.run_id || ''} ${d.id || ''} ${d._raw?.source_info?.file_identifier || ''} ${src}`.toLowerCase();
    if (hay.includes('inference-perf') || src.startsWith('lpg') || src === 'infperf') return 'inference-perf';
    if (d._source_file === 'llm-d-benchmarks.json' || src === 'llm-d-benchmark' || hay.includes('llmd-')) return 'llm-d-benchmark';
    if (src.startsWith('giq:')) return 'GKE Inference Quickstart';
    return 'Not recorded';
}

function engineOf(d) {
    const isReport = d.source_info?.type === 'benchmark_report_v02' || String(d.source || '').startsWith('brv02:');
    const v = d.model_server || d.metadata?.model_server || (isReport ? null : d.metadata?.backend || d.backend);
    return v && v !== 'Unknown' ? v : null;
}

// GitHub handles arrive as strings or as { username, … } objects (report
// files store github_author that way). Always hand back the handle.
export function handleOf(value) {
    if (!value) return null;
    if (typeof value === 'string') return value;
    return value.username || value.login || null;
}

export function sourceOf(d, aliases = {}) {
    const s = String(d.source || 'local');
    if (s.startsWith('brv02:')) return { id: 'uploads', label: 'Uploads (this browser)' };
    if (d.source_info?.type === 'benchmark_report_v02') return { id: 'submissions', label: 'Community submissions' };
    if (s === 'llm-d-results:google_drive' || s === 'llmd_drive') {
        return d._source_file === 'llm-d-benchmarks.json'
            ? { id: 'llm-d-benchmarks', label: 'llm-d benchmarks archive' }
            : { id: 'llm-d-results', label: 'llm-d results archive' };
    }
    if (s.startsWith('gcs:') || s.startsWith('aws:')) {
        const alias = Object.keys(aliases).find((k) => s === k || s.startsWith(`${k}/`));
        return { id: s, label: (alias && aliases[alias]) || s.replace(/^gcs:/, 'gs://').replace(/^aws:/, 's3://') };
    }
    if (s.startsWith('giq:')) return { id: 'giq', label: 'GKE Inference Quickstart' };
    if (s === 'local') return { id: 'local', label: 'Sample data' };
    return { id: s, label: s };
}

export const CATEGORY_OPTIONS = [
    'Well-lit path',
    'Intelligent routing',
    'P/D disaggregation',
    'Prefix cache offloading',
    'Agentic serving',
    'Wide EP',
    'Uncategorized',
];

const CATEGORY_HINTS = [
    ['inference-scheduling', 'Intelligent routing'],
    ['intelligent-routing', 'Intelligent routing'],
    ['pd-disagg', 'P/D disaggregation'],
    ['disaggregat', 'P/D disaggregation'],
    ['prefix-cache', 'Prefix cache offloading'],
    ['offload', 'Prefix cache offloading'],
    ['agentic', 'Agentic serving'],
    ['wide-ep', 'Wide EP'],
    ['well-lit', 'Well-lit path'],
];

function categoryOf(d) {
    if (d.architecture === 'disaggregated') return 'P/D disaggregation';
    const hay = [d.well_lit_path, d.wellLitPath, d.use_case, d._raw?.source_info?.origin, d._raw?.source_info?.file_identifier, d.source_info?.origin, d.id, d.run_id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .replace(/[_\s]+/g, '-');
    const hit = CATEGORY_HINTS.find(([k]) => hay.includes(k));
    return hit ? hit[1] : 'Uncategorized';
}

// The deployment a run measured (e.g. "4: 1P-TP4 3D-TP4"), when recorded.
function setupOf(d) {
    const known = (v) => (v && v !== 'Unknown' ? String(v) : null);
    const raw = known(d._raw?.configuration) || known(d._raw?.metadata?.configuration);
    if (raw) return raw;
    const path = String(d._raw?.source_info?.file_identifier || '');
    if (path.includes('/')) {
        const segs = path.split('/');
        const stop = segs.indexOf('results');
        const keep = stop > 0 ? segs.slice(0, stop) : segs.slice(0, -1);
        if (keep.length) return keep[keep.length - 1];
    }
    return known(d.configuration) || known(d.metadata?.configuration);
}

// The experiment / batch folder a run came from, when the source records one.
const batchOf = (d) => String(d._raw?.source_info?.origin || d.source_info?.origin || '');

function runIdOf(d) {
    if (String(d.source || '').startsWith('brv02:')) return d.run_id || String(d.source).slice(6);
    // Loaders re-number `id` by array position, so the original record's id comes first.
    return (
        [d.run_id, d.source_info?.run_id, d._raw?.run_id, d._raw?.id, d._raw?.source_info?.file_identifier, d.filename, d.id].find(
            (v) => v != null && v !== '' && v !== 'unknown'
        ) ?? null
    );
}

export function runKeyOf(d) {
    const s = String(d.source || 'local');
    if (s.startsWith('brv02:')) return s;
    if (d.source_info?.type === 'benchmark_report_v02' && d.run_id) return `results-store:${d.run_id}`;
    const id = runIdOf(d);
    return id ? `${s}|${id}` : `${s}|${getBenchmarkKey(d)}`;
}

export function shortRunId(id) {
    if (!id) return '—';
    const s = String(id);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)) return s.slice(0, 8);
    if (s.length <= 16) return s;
    const stamp = s.match(/(\d{8}-\d{6})$/);
    if (stamp) return stamp[1];
    const epoch = s.match(/_(\d{10})(?:-|$)/);
    if (epoch) return epoch[1];
    return `…${s.slice(-12)}`;
}

function toPoint(d, runKey, chips = accelCountOf(d)) {
    const errCount = Number(d.metrics?.error_count ?? d.error_count ?? 0) || 0;
    // Uploads (benchmark report v0.2) keep the request total only in the raw report.
    const requests = num(
        d.workload?.request_count ?? d.metrics?.request_count ?? d.request_count ?? d.rawReport?.results?.request_performance?.aggregate?.requests?.total
    );
    const output = readOutput(d);
    const input = firstNum(d.metrics?.input_tput, d.input_tput);
    const total = output == null ? null : output + (input || 0);
    const point = {
        key: runKey,
        runKey,
        conc: num(d.workload?.concurrency ?? d.concurrency ?? d.metadata?.concurrency),
        // Offered load in requests per second, for sweeps that step through rates.
        rate: num(d.workload?.target_qps),
        output,
        total,
        chips,
        outputPerChip: output == null ? null : output / chips,
        totalPerChip: total == null ? null : total / chips,
        errCount,
        errPct: requests ? (errCount / requests) * 100 : errCount > 0 ? null : 0,
        ts: entryTs(d),
    };
    // Every statistic is stored, null included: a missing key marks a point
    // saved before Prism kept them (see latencyValue).
    LATENCY_METRICS.forEach(({ value: m }) => {
        const { mean, p50, p99 } = readLatency(d, m);
        point[m] = p50 ?? mean;
        point[`${m}Mean`] = mean;
        point[`${m}P50`] = p50;
        point[`${m}P99`] = p99;
    });
    return point;
}

const mostCommon = (values) => {
    const counts = new Map();
    values.filter(Boolean).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    let best = null;
    let bestN = 0;
    counts.forEach((n, v) => {
        if (n > bestN) {
            best = v;
            bestN = n;
        }
    });
    return best;
};

// ------------------------------------------------------------------- catalog

// Builds runs from the flat entry list. `submissionsMap` (runId → {status,
// feedback}) is the server's view of uploaded runs; `aliases` names buckets.
export function buildRuns(entries, { aliases = {}, submissionsMap = {} } = {}) {
    const canonical = new Map();
    entries.forEach((d) => {
        const m = shortModel(d.model_name || d.model || d.metadata?.model_name);
        if (!m) return;
        const key = m.toLowerCase();
        const prev = canonical.get(key);
        if (!prev || (prev === prev.toLowerCase() && m !== m.toLowerCase())) canonical.set(key, m);
    });

    const groups = new Map();
    entries.forEach((d) => {
        const k = runKeyOf(d);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(d);
    });

    const runs = [];
    groups.forEach((arrived, key) => {
        // The same report can arrive through two loaders at once, doubling
        // every stage. Keep one copy of each stage (entries without a stage
        // number are separate measurements and all stay).
        const seenStages = new Set();
        const list = arrived.filter((d) => {
            if (!Number.isInteger(d.workload?.stage)) return true;
            const k = `${d.workload.stage}|${readOutput(d)}|${d.workload.concurrency ?? ''}`;
            if (seenStages.has(k)) return false;
            seenStages.add(k);
            return true;
        });
        const d0 = list[0];
        const reported = reportChips(d0.rawReport);
        let hwRaw = mostCommon(list.map(hardwareOf).filter((h) => !isGenericHardware(h))) || hardwareOf(d0);
        // "TPU7X-2X2X1" names a slice; with its chips counted it's a TPU7X ×4.
        if (reported?.topology) hwRaw = hwRaw.replace(/[-_\s]?\d+x\d+(?:x\d+)?$/i, '') || hwRaw;
        const accelCount = reported?.chips || mostCommon(list.map(accelCountOf).filter((n) => n > 1)) || accelCountOf(d0);
        const all = list.map((d) => toPoint(d, key, accelCount));
        const points = loadOrder(all.filter((p) => p.output != null)).points;
        if (!points.length) return;
        // Stages with no output throughput can't be plotted. Note them so the
        // checks can name them, rather than let a 0 tok/s stage vanish.
        const dropped = all
            .map((p, i) =>
                p.output == null ? { conc: p.conc, stage: Number.isInteger(list[i].workload?.stage) ? list[i].workload.stage : null, zero: reportsZeroOutput(list[i]) } : null
            )
            .filter(Boolean);
        points.forEach((p, i) => {
            p.key = `${key}#${i}`;
        });

        const rawModel = shortModel(d0.model_name || d0.model || d0.metadata?.model_name) || 'Model not recorded';
        const model = canonical.get(rawModel.toLowerCase()) || rawModel;
        const hwLabel = hardwareLabel(hwRaw, accelCount);
        const runId = runIdOf(d0);
        const wl = workloadOf(d0, runId);
        const src = sourceOf(d0, aliases);
        const sub = (d0.run_id && submissionsMap[d0.run_id]) || null;
        const submissionState = sub?.status || d0.source_info?.submission_state || (String(d0.source).startsWith('brv02:') ? 'staged' : null);
        const harness = harnessOf(d0);
        const category = categoryOf(d0);
        const stack = reportSetupOf(d0.rawReport);
        const setup = setupOf(d0) || stack?.setup || null;
        const engine = engineOf(d0);
        const ts = Math.max(0, ...list.map(entryTs));
        const measuredWorkload = wl.measured.isl && wl.measured.osl ? `${wl.measured.isl}/${wl.measured.osl}` : '';

        runs.push({
            key,
            runId,
            idLabel: shortRunId(runId),
            entries: list,
            points,
            dropped,
            model,
            modelFull: cleanModel(d0.model_name || d0.model || d0.metadata?.model_name) || model,
            hardware: isGenericHardware(hwRaw) ? '' : hwRaw,
            hardwareRaw: hwRaw,
            accelCount,
            hwLabel,
            wl,
            isl: wl.configured ? wl.isl : wl.measured.isl,
            osl: wl.configured ? wl.osl : wl.measured.osl,
            workload: wl.configured ? `${wl.isl}/${wl.osl}` : measuredWorkload,
            // What the run measured on average, when the label above is the
            // configured or shared one.
            measuredWorkload,
            workloadConfigured: Boolean(wl.configured),
            harness,
            engine,
            source: src.label,
            sourceId: src.id,
            sourceRaw: String(d0.source || 'local'),
            category,
            setup,
            setupDetail: setup === stack?.setup ? stack?.detail || null : null,
            batch: batchOf(d0),
            ts,
            author: handleOf(d0.github_author),
            submissionState,
            feedback: sub?.feedback || '',
            isUpload: String(d0.source || '').startsWith('brv02:') || d0.source_info?.type === 'benchmark_report_v02',
            isLocalOnly: String(d0.source || '').startsWith('brv02:'),
            conc: points.length === 1 ? points[0].conc : null,
            title: '',
            benchmarkKey: getBenchmarkKey(d0),
            rawReport: d0.rawReport || null,
            fileId: d0._raw?.source_info?.file_identifier || d0.source_info?.file_identifier || d0.filename || null,
            rawUrl: d0._raw?.source_info?.raw_url || d0.source_info?.raw_url || null,
            searchText: [d0.model_name, harness, src.label, category, setup, stack?.detail, engine, runId, measuredWorkload, handleOf(d0.github_author)]
                .filter(Boolean)
                .join(' ')
                .toLowerCase(),
        });
    });
    unifyWorkloads(runs);
    // Titles name the setup too: two setups of one model, hardware and
    // workload (a baseline and the optimization under test) never share one.
    runs.forEach((r) => {
        r.title = runTitle(r);
        r.searchText = `${r.title.toLowerCase()} ${r.searchText}`;
    });
    return dedupeRuns(runs);
}

export const runTitle = (r) => [r.model, r.hwLabel || 'Hardware not recorded', r.workload || 'Workload not recorded', r.setup].filter(Boolean).join(' · ');

// The same run can arrive through two loaders (e.g. an archive file and its
// live-sync copy). Show it once, keeping the copy with the most metadata.
function dedupeRuns(runs) {
    const score = (r) => (r.setup ? 2 : 0) + (r.category !== 'Uncategorized' ? 1 : 0) + (r.hwLabel ? 1 : 0) + (r.entries[0]?._raw ? 1 : 0);
    const kept = new Map();
    const out = [];
    runs.forEach((r) => {
        if (!r.runId || r.isUpload || String(r.runId).length < 12) {
            out.push(r);
            return;
        }
        const k = `${r.runId}|${r.points.length}|${Math.round(r.points[0].output)}`;
        const prev = kept.get(k);
        if (!prev) {
            kept.set(k, r);
            out.push(r);
        } else if (score(r) > score(prev)) {
            out[out.indexOf(prev)] = r;
            kept.set(k, r);
        }
    });
    return out;
}

// ---------------------------------------------------------------------- rows

const curveKeyOf = (r) => [r.sourceRaw, r.batch, r.harness, r.model.toLowerCase(), r.hardware.toLowerCase(), r.accelCount, r.workload, r.setup || ''].join('|');
const commonValue = (values) => (values.length && values.every((v) => v === values[0]) ? values[0] : null);
const maxTs = (runs) => Math.max(0, ...runs.map((r) => r.ts || 0));

// Standalone runs of one configuration become batches: a new batch starts
// when a concurrency level repeats (the next nightly sweep) or the window ends.
function splitBatches(runs) {
    const batches = [];
    let current = null;
    [...runs]
        .sort((a, b) => a.ts - b.ts)
        .forEach((r) => {
            const tooFar = current && r.ts && current.start && r.ts - current.start > BATCH_WINDOW_MS;
            if (!current || current.concs.has(r.conc) || tooFar) {
                current = { start: r.ts, concs: new Set(), runs: [] };
                batches.push(current);
            }
            current.concs.add(r.conc);
            current.runs.push(r);
        });
    return batches.map((b) => b.runs);
}

function rowBase(runs, points) {
    const r0 = runs[0];
    return {
        title: r0.title,
        model: r0.model,
        hwLabel: r0.hwLabel,
        workload: r0.workload,
        harness: r0.harness,
        source: r0.source,
        category: r0.category,
        engine: r0.engine,
        setup: commonValue(runs.map((r) => r.setup)),
        points,
        peak: peakOutput(points),
    };
}

function suggestedRow(groupKey, batches) {
    const repeats = batches
        .map((b) => ({ ts: maxTs(b), runs: [...b].sort((x, y) => x.conc - y.conc) }))
        .sort((a, b) => b.ts - a.ts);
    const runs = repeats[0].runs;
    const points = runs.map((r) => r.points[0]);
    return {
        key: `suggested|${groupKey}`,
        kind: 'suggested',
        runs,
        repeats,
        count: repeats.length,
        ts: repeats[0].ts,
        searchText: batches.flat().map((r) => r.searchText).join(' '),
        ...rowBase(runs, points),
    };
}

function runRow(group) {
    const sorted = [...group].sort((a, b) => b.ts - a.ts);
    const run = sorted[0];
    return {
        key: `run|${run.key}`,
        kind: 'run',
        run,
        runs: [run],
        repeats: sorted.map((r) => ({ ts: r.ts, runs: [r] })),
        count: sorted.length,
        ts: run.ts,
        searchText: sorted.map((r) => r.searchText).join(' '),
        ...rowBase([run], run.points),
    };
}

// Turns runs into Browse rows, newest first.
export function buildRows(runs) {
    const candidates = new Map();
    const rest = [];
    runs.forEach((r) => {
        if (r.points.length === 1 && r.conc != null) {
            const k = curveKeyOf(r);
            if (!candidates.has(k)) candidates.set(k, []);
            candidates.get(k).push(r);
        } else {
            rest.push(r);
        }
    });

    const rows = [];
    candidates.forEach((group, k) => {
        const batches = splitBatches(group);
        const curves = batches.filter((b) => new Set(b.map((r) => r.conc)).size >= 2);
        batches.filter((b) => !curves.includes(b)).forEach((b) => rest.push(...b));
        if (curves.length) rows.push(suggestedRow(k, curves));
    });

    const repeats = new Map();
    rest.forEach((r) => {
        const signature = r.points.map((p) => p.conc ?? '').join(',');
        const k = `${curveKeyOf(r)}|${signature}|${r.points.length}`;
        if (!repeats.has(k)) repeats.set(k, []);
        repeats.get(k).push(r);
    });
    repeats.forEach((group) => rows.push(runRow(group)));

    return rows.sort((a, b) => b.ts - a.ts);
}

// -------------------------------------------------------------------- setups

const setupKey = (values) => values.map((v) => String(v || '').trim().toLowerCase()).join('|');

// Runs with the same key are repeats of one configuration, so comparing them
// over time is meaningful. A different deployment is a different setup. The
// source folder and batch are left out on purpose: nightly repeats often land
// in a new folder each night.
export const configKeyOf = (r) => setupKey([r.model, r.hwLabel || r.hardwareRaw, r.workload, r.harness, r.setup]);

// Titles already name the setup (see runTitle).
export const configLabelOf = (r) => r.title;

// Whether two setup keys name one setup. Measured workloads match within the
// drift tolerance, so a label that moved (a new run shifted the median) still
// finds its watch.
export function sameSetup(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const pa = a.split('|');
    const pb = b.split('|');
    if (pa.length !== pb.length) return false;
    return pa.every((v, i) => {
        if (v === pb[i]) return true;
        const wa = i === 2 && v.match(/^(\d+)\/(\d+)$/);
        const wb = i === 2 && pb[i].match(/^(\d+)\/(\d+)$/);
        return Boolean(wa && wb && near(+wa[1], +wb[1], ISL_TOLERANCE) && near(+wa[2], +wb[2], OSL_TOLERANCE));
    });
}

// Every setup in these runs, newest first.
export function setupsOf(runs) {
    const groups = new Map();
    runs.forEach((r) => {
        const key = configKeyOf(r);
        if (!groups.has(key)) groups.set(key, { key, model: r.model, harness: r.harness, label: configLabelOf(r), runs: [], ts: 0 });
        const g = groups.get(key);
        g.runs.push(r);
        g.ts = Math.max(g.ts, r.ts || 0);
    });
    return [...groups.values()].sort((a, b) => b.ts - a.ts);
}

// The setup a curve measured: from its source runs when they're loaded (its
// labels may have been edited since), otherwise from its labels.
export function curveConfigKey(curve, runsByKey) {
    const fromRuns = mostCommon((curve.builtFrom?.runKeys || []).map((k) => runsByKey.get(k)).filter(Boolean).map(configKeyOf));
    if (fromRuns) return fromRuns;
    const m = curve.meta || {};
    return setupKey([m.model, m.accelerator, m.workload, m.harness, m.setup]);
}

// -------------------------------------------------------------------- facets

export const FACETS = [
    { id: 'source', label: 'Source', get: (r) => r.source },
    { id: 'harness', label: 'Harness', get: (r) => r.harness },
    { id: 'category', label: 'Category', get: (r) => r.category },
    { id: 'model', label: 'Model', get: (r) => r.model },
    { id: 'hardware', label: 'Hardware', get: (r) => r.hwLabel || 'Hardware not recorded' },
    { id: 'workload', label: 'Workload', get: (r) => r.workload || 'Workload not recorded' },
];

export const DATE_OPTIONS = [
    { value: '1d', label: 'Last 24 hours', ms: DAY_MS },
    { value: '7d', label: 'Last 7 days', ms: 7 * DAY_MS },
    { value: '30d', label: 'Last 30 days', ms: 30 * DAY_MS },
    { value: '365d', label: 'Last 12 months', ms: 365 * DAY_MS },
];

// filters: { source, harness, category, model, hardware, workload, date, mine }
export function runMatches(run, filters, { query = '', skip = null, mineOf = null } = {}) {
    for (const f of FACETS) {
        if (f.id === skip) continue;
        const v = filters[f.id];
        if (v != null && f.get(run) !== v) return false;
    }
    if (skip !== 'date' && filters.date) {
        const opt = DATE_OPTIONS.find((o) => o.value === filters.date);
        if (opt && !(run.ts && LOADED_AT - run.ts <= opt.ms)) return false;
    }
    if (skip !== 'mine' && filters.mine && mineOf && !mineOf(run)) return false;
    if (query && !run.searchText.includes(query)) return false;
    return true;
}

export function facetOptions(runs, filters, facet, opts = {}) {
    const counts = new Map();
    runs.forEach((r) => {
        if (!runMatches(r, filters, { ...opts, skip: facet.id })) return;
        const v = facet.get(r);
        counts.set(v, (counts.get(v) || 0) + 1);
    });
    const current = filters[facet.id];
    if (current != null && !counts.has(current)) counts.set(current, 0);
    return [...counts.entries()]
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]), undefined, { numeric: true }))
        .map(([value, count]) => ({ value, label: value, count }));
}

// ------------------------------------------------------------ status mapping

// Storage states stay as they are on the server; the UI only ever shows three
// statuses plus a visibility chip. Runs from pipelines have no status at all.
export function mapSubmissionState(state, { feedback = '', instance = 'public' } = {}) {
    const published = instance === 'internal' ? { status: 'official', visibility: 'instance' } : { status: 'published', visibility: 'public' };
    switch (state) {
        case 'staged':
            return { status: 'draft', visibility: 'me' };
        case 'unlisted':
            return { status: 'draft', visibility: 'link' };
        case 'submitted_pending_processing':
            return { status: 'in_review', visibility: 'reviewers', detail: 'Automatic checks running' };
        case 'submitted_pending_review':
            return { status: 'in_review', visibility: 'reviewers', detail: 'Waiting for a reviewer' };
        case 'approved_pending_publish':
            return { status: 'in_review', visibility: 'reviewers', detail: 'Publishing' };
        case 'public':
            return published;
        case 'promoted':
            return { ...published, featured: true };
        case 'rejected':
            return /^declined/i.test(feedback) ? { status: 'declined', visibility: 'me' } : { status: 'needs_changes', visibility: 'me' };
        default:
            return null;
    }
}

export const isPublishedState = (s) => s === 'public' || s === 'promoted';

// -------------------------------------------------------------------- curves

export const autoCurveName = (meta) =>
    [meta.model, meta.accelerator || 'Hardware not recorded', meta.workload || 'Workload not recorded', meta.setup, meta.engine || meta.harness]
        .filter(Boolean)
        .join(' · ');

// Measured values are copied as a read-only snapshot so a curve still renders
// while its source is offline. The run keys keep the link back to the data.
export function snapshotPoints(runs) {
    const points = runs.flatMap((r) =>
        r.points.map((p) => ({
            ...p,
            runId: r.runId,
            idLabel: r.idLabel,
            model: r.model,
            hwLabel: r.hwLabel,
            workload: r.workload,
            included: true,
            reason: '',
        }))
    );
    return loadOrder(points).points;
}

// Stages these runs reported with no output throughput, so they never became
// points. A result keeps them so its checks can name them.
export const droppedStages = (runs) => runs.flatMap((r) => (r.dropped || []).map((s) => ({ ...s, runKey: r.key, idLabel: r.idLabel })));

export function curveDraftFromRuns(runs) {
    const points = snapshotPoints(runs);
    const accel = mostCommon(runs.map((r) => r.hwLabel)) || '';
    const meta = {
        model: mostCommon(runs.map((r) => r.model)) || 'Model not recorded',
        modelFull: mostCommon(runs.map((r) => r.modelFull)) || '',
        accelerator: accel,
        accelCount: runs[0]?.accelCount || 1,
        workload: mostCommon(runs.map((r) => r.workload)) || '',
        harness: mostCommon(runs.map((r) => r.harness)) || 'Not recorded',
        source: mostCommon(runs.map((r) => r.source)) || '',
        category: mostCommon(runs.map((r) => r.category)) || 'Uncategorized',
        engine: mostCommon(runs.map((r) => r.engine)) || '',
        setup: commonValue(runs.map((r) => r.setup)) || '',
        notes: '',
    };
    return {
        points,
        dropped: droppedStages(runs),
        meta,
        original: { model: meta.model, modelFull: meta.modelFull, accelerator: meta.accelerator, category: meta.category },
        builtFrom: {
            runs: runs.length,
            runKeys: runs.map((r) => r.key),
            label: `${meta.source}${runs.length ? ` · ${fmtDay(maxTs(runs))}` : ''}`,
        },
        submissionRunIds: runs.filter((r) => r.isUpload && !r.isLocalOnly && r.runId).map((r) => r.runId),
        localRunIds: runs.filter((r) => r.isLocalOnly).map((r) => r.runId),
    };
}

export function seriesPoints(points, { latency = 'ttft', stat = null, throughput = 'output' } = {}) {
    return points.flatMap((p) => {
        const y = latencyValue(p, latency, stat);
        if (!isNum(p[throughput]) || !isNum(y)) return [];
        return [{ x: p[throughput], y, conc: p.conc, key: p.key, idLabel: p.idLabel, ...(statUnknown(p, latency, stat) ? { statUnknown: true } : {}) }];
    });
}

// The point with the highest value of `key` (output, totalPerChip, …).
export function peakPoint(points, key = 'output') {
    return points.reduce((best, p) => (isNum(p[key]) && (!best || p[key] > best[key]) ? p : best), null);
}

// Percent change from `base` to `value`; null when either is missing.
export const pctDelta = (value, base) => (isNum(value) && isNum(base) && base !== 0 ? ((value - base) / base) * 100 : null);

// "H100 ×16" → 16. A result's label is what people see, and may have been
// corrected, so its chip count wins over the one the runs recorded.
export function chipsOf(meta) {
    const m = String(meta?.accelerator || '').match(/[×x]\s*(\d+)\s*$/);
    const n = m ? parseInt(m[1], 10) : Number(meta?.accelCount);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

// Points with per-chip throughput worked out for this chip count.
export const withChips = (points, chips) =>
    points.map((p) => ({ ...p, chips, outputPerChip: isNum(p.output) ? p.output / chips : null, totalPerChip: isNum(p.total) ? p.total / chips : null }));

// How checks name a point: by concurrency, by request rate (rate sweeps), or
// for a stage with neither by its throughput, which the Points list shows
// too. Never by run: every stage of a multi-stage run shares one run ID.
function stageLabel(p) {
    if (p.conc != null) return `c=${p.conc}`;
    if (isNum(p.rate)) return `the ${p.rate} req/s stage`;
    if (isNum(p.output)) return `the ${fmtTput(p.output)} tok/s stage`;
    return p.stage != null ? `stage ${p.stage} of run ${p.idLabel}` : `a stage of run ${p.idLabel}`;
}
// Sentence case for check text that starts with a label; "c=8" stays as it is.
const startCase = (s) => (s.startsWith('c=') ? s : s.charAt(0).toUpperCase() + s.slice(1));
const countOf = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;
// "a", "a and b", "a, b and c", "a, b, c, d and 2 more".
function listOf(items, { joiner = 'and', max = 4 } = {}) {
    if (items.length > max) return `${items.slice(0, max).join(', ')} and ${items.length - max} more`;
    return items.length > 1 ? `${items.slice(0, -1).join(', ')} ${joiner} ${items[items.length - 1]}` : items[0] || '';
}
// "H100 x16", "h100 ×16" and "H100 ×16" name the same accelerator.
const normAccel = (s) =>
    String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s*[×x]\s*(\d+)$/, ' ×$1')
        .replace(/\s+/g, ' ');

// Latency a load check reads: TTFT where two or more points recorded it,
// else end-to-end latency (some archives record no TTFT).
function loadLatency(points) {
    const useTtft = points.filter((p) => isNum(p.ttft)).length >= 2;
    return { of: (p) => (useTtft ? p.ttft : p.e2e), name: useTtft ? 'TTFT' : 'E2E latency' };
}

// Points that would skew a curve, each with a one-click exclude:
//   overloaded   latency ≥5× the last healthy point for ≤1.25× its
//                throughput: the server is queueing, not serving more. Every
//                point past saturation is flagged, not just the first.
//   out of line  slower than the next, heavier point (>1.5× and >250 ms):
//                noise such as a cold cache. Sweeps with a load order only.
// Points go in load order (concurrency, else request rate), else in latency
// order, which load follows.
export function loadChecks(included) {
    const lat = loadLatency(included);
    const timed = included.filter((p) => isNum(lat.of(p)) && isNum(p.output));
    const order = loadOrder(timed);
    const ordered = order.by !== 'output';
    const seq = ordered ? order.points : [...timed].sort((a, b) => lat.of(a) - lat.of(b));
    const out = [];
    let healthy = seq[0];
    for (let i = 1; i < seq.length; i++) {
        const p = seq[i];
        if (lat.of(p) < 5 * lat.of(healthy) || p.output > 1.25 * healthy.output) {
            healthy = p;
            continue;
        }
        const gain = p.output > healthy.output ? `only ${Math.max(1, Math.round(pctDelta(p.output, healthy.output)))}% more throughput` : 'no more throughput';
        const note = `${startCase(stageLabel(p))} looks overloaded: ${lat.name} is ${fmtMs(lat.of(p))}, ${Math.round(lat.of(p) / lat.of(healthy))}× ${stageLabel(healthy)}, for ${gain}.`;
        out.push({
            id: `sat-${p.key}`,
            level: 'warn',
            note,
            text: `${note} Exclude it so it doesn’t set the peak?`,
            fix: { type: 'exclude', pointKey: p.key, reason: `Overloaded: ${lat.name} ${fmtMs(lat.of(p))} for ${gain}` },
            fixLabel: 'Exclude point',
        });
    }
    if (ordered) {
        // Overloaded points are already flagged; only healthy ones can be out of line.
        const overloaded = new Set(out.map((c) => c.fix.pointKey));
        for (let i = 0; i < seq.length - 1; i++) {
            const p = seq[i];
            const next = seq[i + 1];
            if (overloaded.has(p.key) || overloaded.has(next.key)) continue;
            if (lat.of(p) <= 1.5 * lat.of(next) || lat.of(p) - lat.of(next) <= 250) continue;
            const note = `${startCase(stageLabel(p))} is slower than ${stageLabel(next)} (${lat.name} ${fmtMs(lat.of(p))} vs ${fmtMs(lat.of(next))}) with less load.`;
            out.push({
                id: `odd-${p.key}`,
                level: 'warn',
                note,
                text: `${note} Likely noise; rerun it or exclude it.`,
                fix: { type: 'exclude', pointKey: p.key, reason: `Out of line: ${lat.name} ${fmtMs(lat.of(p))}, slower than ${stageLabel(next)}` },
                fixLabel: 'Exclude point',
            });
        }
    }
    return out;
}

export function curveChecks(curve) {
    const out = [];
    const included = curve.points.filter((p) => p.included);
    const concs = included.map((p) => p.conc).filter(isNum);
    const by = loadOrder(included).by;

    out.push(
        by === 'conc'
            ? { id: 'order', level: 'ok', text: `Points ordered by concurrency (${concRange(included)}).` }
            : by === 'rate'
              ? { id: 'order', level: 'ok', text: `Points ordered by request rate (${concRange(included)}).` }
              : { id: 'order', level: 'ok', text: 'Points ordered by throughput (concurrency wasn’t recorded).' }
    );

    const seen = new Map();
    concs.forEach((c) => seen.set(c, (seen.get(c) || 0) + 1));
    seen.forEach((n, c) => {
        if (n > 1) out.push({ id: `dup-${c}`, level: 'warn', text: `c=${c} appears ${n} times. Keep one so the curve reads left to right.` });
    });

    // Zero or missing metrics. A stage with no output throughput never became
    // a point (see buildRuns), so name it rather than let it vanish.
    const dropped = curve.dropped || [];
    const why = (s) => (s.zero ? '0 tok/s' : 'no output throughput');
    if (dropped.length === 1) {
        out.push({ id: 'dropped', level: 'warn', text: `${startCase(stageLabel(dropped[0]))} reported ${why(dropped[0])}, so it isn’t in this result. Check that run before publishing.` });
    } else if (dropped.length > 1) {
        out.push({
            id: 'dropped',
            level: 'warn',
            text: `${dropped.length} stages reported no output throughput, so they aren’t in this result: ${listOf(dropped.map((s) => `${stageLabel(s)} (${why(s)})`))}. Check those runs before publishing.`,
        });
    }
    // A point without a latency the other points recorded drops off that chart.
    included.forEach((p) => {
        const missing = LATENCY_METRICS.filter((m) => !isNum(p[m.value]) && included.some((q) => isNum(q[m.value]))).map((m) => m.label);
        if (!missing.length) return;
        out.push({
            id: `gap-${p.key}`,
            level: 'warn',
            text: `${startCase(stageLabel(p))} has no ${listOf(missing, { joiner: 'or' })} (missing or 0), so it’s left off the ${listOf(missing)} chart${missing.length === 1 ? '' : 's'}.`,
        });
    });
    out.push(...loadChecks(included));
    const setAside = curve.points.filter((p) => !p.included && p.reason && /^(Overloaded|Out of line)/.test(p.reason));
    if (setAside.length) {
        out.push({ id: 'set-aside', level: 'ok', text: `Excluded: ${listOf(setAside.map((p) => `${stageLabel(p)} (${p.reason.split(':')[0].toLowerCase()})`))}.` });
    }

    // A failure rate needs the total request count. Without it, list the counts
    // in one note instead of flagging every failed request.
    const uncounted = [];
    curve.points.forEach((p) => {
        if (p.errPct == null) {
            if (p.included && p.errCount > 0) uncounted.push(p);
            return;
        }
        if (p.errPct < ERROR_LIMIT_PCT) return;
        const label = startCase(stageLabel(p));
        const total = Math.round((p.errCount * 100) / p.errPct);
        const what = `${p.errCount} of ${total} requests failed (${p.errPct.toFixed(1)}%)`;
        out.push(
            p.included
                ? {
                      id: `err-${p.key}`,
                      level: 'warn',
                      text: `${label} had ${countOf(p.errCount, 'failed request')} out of ${total} (${p.errPct.toFixed(1)}%), over the ${ERROR_LIMIT_PCT}% limit. Exclude it?`,
                      fix: { type: 'exclude', pointKey: p.key, reason: what },
                      fixLabel: 'Exclude point',
                  }
                : { id: `err-${p.key}`, level: 'ok', text: `${label} excluded: ${p.reason || what}.` }
        );
    });
    if (uncounted.length) {
        out.push({
            id: 'err-uncounted',
            level: 'info',
            text: `${startCase(listOf(uncounted.map((p) => `${stageLabel(p)} had ${countOf(p.errCount, 'failed request')}`)))}. The total request count wasn’t recorded, so there’s no failure rate to check against the ${ERROR_LIMIT_PCT}% limit.`,
        });
    }

    const accel = String(curve.meta.accelerator || '').trim();
    const accelName = accel.replace(/\s*×\s*\d+$/, '');
    const recordedAccel = String(curve.original?.accelerator || '').trim();
    // Blank or generic ("TPU") means the runs never said; anything else was measured.
    const accelRecorded = recordedAccel !== '' && !isGenericHardware(recordedAccel.replace(/\s*×\s*\d+$/, ''));
    if (!accel) {
        out.push({
            id: 'hw',
            level: 'error',
            text: accelRecorded ? `Accelerator is empty, but the runs recorded ${recordedAccel}. Set it before publishing.` : 'Hardware is missing from the report files. Set the accelerator before publishing.',
            fix: { type: 'focus', field: 'accelerator' },
            fixLabel: 'Set accelerator',
        });
    } else if (isGenericHardware(accelName)) {
        out.push({ id: 'hw', level: 'error', text: `Accelerator is “${accel}”. Pick the exact type before publishing.`, fix: { type: 'focus', field: 'accelerator' }, fixLabel: 'Set accelerator' });
    } else if (accelRecorded && normAccel(accel) !== normAccel(recordedAccel)) {
        // Relabelling moves numbers measured on one accelerator onto another.
        out.push({
            id: 'hw',
            level: 'warn',
            text: `Accelerator changed to ${accel}, but the runs were measured on ${recordedAccel}. Change it only if the recorded label is wrong.`,
            fix: { type: 'focus', field: 'accelerator' },
            fixLabel: 'Check accelerator',
        });
    } else if (accel !== recordedAccel) {
        out.push({ id: 'hw', level: 'ok', text: `Accelerator set to ${accel} (was ${recordedAccel ? `“${recordedAccel}”` : 'missing'}).` });
    }

    // The same goes for the model the runs recorded.
    const model = String(curve.meta.model || '').trim();
    const recordedModel = String(curve.original?.model || '').trim();
    if (model && recordedModel && recordedModel !== 'Model not recorded' && shortModel(model).toLowerCase() !== shortModel(recordedModel).toLowerCase()) {
        out.push({ id: 'model', level: 'warn', text: `Model changed to ${model}, but the runs recorded ${recordedModel}. Change it only if the recorded label is wrong.` });
    }

    const differs = ['model', 'hwLabel', 'workload'].filter((k) => new Set(included.map((p) => p[k])).size > 1);
    out.push(
        differs.length
            ? { id: 'mixed', level: 'warn', text: `Points mix ${differs.map((k) => ({ model: 'models', hwLabel: 'hardware', workload: 'workloads' })[k]).join(', ')}. A result should hold one configuration.` }
            : { id: 'mixed', level: 'ok', text: 'Same model, hardware and workload across all points.' }
    );

    if (included.length < 3) {
        out.push({ id: 'few', level: 'warn', text: `Only ${included.length} point${included.length === 1 ? '' : 's'} included. Three or more show the trend.` });
    }

    out.push({ id: 'prov', level: 'ok', text: `Harness and source recorded: ${curve.meta.harness} · ${curve.meta.source || 'source not recorded'}.` });

    out.push(
        curve.baselines.length
            ? { id: 'base', level: 'ok', text: `Compared against ${curve.baselines.length} baseline${curve.baselines.length > 1 ? 's' : ''}.` }
            : { id: 'base', level: 'info', text: 'No baseline yet. Add one to check this result against it.' }
    );
    return out;
}

// --------------------------------------------------------- dashboards / cost

export function nearestPoint(points, conc) {
    const usable = points.filter((p) => isNum(p.output));
    if (!usable.length) return null;
    if (conc == null) return usable.reduce((a, b) => (b.output > a.output ? b : a));
    const withConc = usable.filter((p) => p.conc != null);
    if (!withConc.length) return null;
    return withConc.reduce((a, b) => (Math.abs(b.conc - conc) < Math.abs(a.conc - conc) ? b : a));
}

// The value a watch tracks in a set of points: with `limit` (a TTFT in ms)
// the highest output with TTFT at or under it, else the point nearest
// `atConc` (the peak when null). { point, value } or null when these points
// can't say (no TTFT recorded, or no point at that concurrency). Over the
// limit everywhere, value is 0: nothing usable.
export function watchValue(points, watch) {
    if (isNum(watch.limit)) {
        const { point, reason } = pricingPoint(points, watch.limit);
        if (reason === 'no-points' || reason === 'no-ttft') return null;
        return { point, value: point ? point.output : 0 };
    }
    const point = nearestPoint(points, watch.atConc);
    if (!point || (watch.atConc != null && point.conc !== watch.atConc)) return null;
    return { point, value: point.output };
}

export const WATCH_TTFT_SPIKE_PCT = 20;

// One value per batch (newest sweep, nightly repeat, …) against the pinned
// baseline. A drop past the threshold (e.g. -5%) is flagged; when `watch.guard`
// is enabled, a TTFT spike (+20% at the watched point) or request failure rate
// ≥ 5% is also flagged.
//
// Batches are measured over the concurrency levels the baseline includes.
// Otherwise excluding an overloaded c=256 from the baseline would make every
// batch's peak look higher than the baseline's, and hide a real drop.
export function watchSeries(rows, refPoints, watch) {
    const refHit = watchValue(refPoints, watch);
    const ref = refHit?.point;
    if (!ref || !refHit.value) return [];
    const refConcs = new Set(refPoints.map((p) => p.conc).filter(isNum));
    const refRuns = new Set(refPoints.map((p) => p.runKey).filter(Boolean));
    const guard = Boolean(watch.guard);
    const ttftLimitPct = isNum(watch.ttftThreshold) ? Math.abs(watch.ttftThreshold) : WATCH_TTFT_SPIKE_PCT;
    const out = [];
    rows.forEach((row) =>
        row.repeats.forEach((rep, i) => {
            const all = rep.runs.flatMap((r) => r.points);
            const comparable = refConcs.size ? all.filter((q) => refConcs.has(q.conc)) : all;
            const hit = watchValue(comparable, watch);
            if (!hit) return;
            const delta = ((hit.value - refHit.value) / refHit.value) * 100;
            const ttft = hit.point?.ttft ?? null;
            const refTtft = ref?.ttft ?? null;
            const ttftDelta = isNum(ttft) && isNum(refTtft) && refTtft > 0 ? ((ttft - refTtft) / refTtft) * 100 : null;
            const maxErrPct = comparable.reduce((m, p) => (isNum(p.errPct) && p.errPct > m ? p.errPct : m), 0);
            // The batch the baseline was made from: comparing it with itself proves nothing.
            const isRef = rep.runs.some((r) => refRuns.has(r.key));
            const tputFlagged = !isRef && delta <= watch.threshold;
            const ttftFlagged = !isRef && guard && isNum(ttftDelta) && ttftDelta >= ttftLimitPct;
            const errFlagged = !isRef && guard && maxErrPct >= ERROR_LIMIT_PCT;
            const flagReasons = [
                tputFlagged ? `output ${fmtPct(delta)}` : null,
                ttftFlagged ? `TTFT +${ttftDelta.toFixed(1)}%` : null,
                errFlagged ? `${maxErrPct.toFixed(1)}% failed` : null,
            ].filter(Boolean);
            out.push({
                key: `${row.key}#${i}`,
                ts: rep.ts,
                value: hit.value,
                conc: hit.point?.conc ?? null,
                // No point met the TTFT limit: nothing usable at all.
                overLimit: !hit.point,
                ref: refHit.value,
                refConc: ref.conc,
                delta,
                ttft,
                refTtft,
                ttftDelta,
                maxErrPct,
                tputFlagged,
                ttftFlagged,
                errFlagged,
                flagReasons,
                flagged: tputFlagged || ttftFlagged || errFlagged,
                isRef,
                // Baseline levels this batch didn't measure (e.g. a sweep that stopped early).
                missing: watch.atConc == null ? [...refConcs].filter((c) => !all.some((q) => q.conc === c)).sort((a, b) => a - b) : [],
                title: row.title,
                setup: row.setup,
                runs: rep.runs,
            });
        })
    );
    return out.sort((a, b) => a.ts - b.ts);
}

// A watch's baseline: a live curve (follows its edits) or a pinned snapshot.
export const watchRefPoints = (watch, getCurve) => {
    if (watch.ref?.kind === 'curve') {
        const c = getCurve(watch.ref.id);
        if (c) return c.points.filter((p) => p.included);
    }
    return watch.ref?.points || [];
};

// The setup a watch's baseline runs belong to, under today's labels.
function refConfigKey(watch, { getCurve, runsByKey }) {
    if (watch.ref?.kind === 'curve') {
        const c = getCurve(watch.ref.id);
        if (c) return curveConfigKey(c, runsByKey);
    }
    const refRuns = (watch.ref?.points || []).map((p) => runsByKey.get(p.runKey)).filter(Boolean);
    return mostCommon(refRuns.map(configKeyOf)) || null;
}

// The one setup a watch follows. Watches made before setups existed only had
// filters; they follow their baseline's setup instead.
export function watchConfigKey(watch, ctx) {
    return watch.configKey || refConfigKey(watch, ctx);
}

// The runs a watch follows: its setup (workload within drift tolerance). If
// nothing matches any more because the setup's labels changed (a workload
// now read from its configuration, a chip count corrected), it follows the
// setup its baseline runs have today.
export function watchRuns(watch, runs, ctx) {
    const saved = watchConfigKey(watch, ctx);
    const hit = saved ? runs.filter((r) => sameSetup(configKeyOf(r), saved)) : [];
    if (hit.length) return hit;
    const now = refConfigKey(watch, ctx);
    return now && now !== saved ? runs.filter((r) => configKeyOf(r) === now) : [];
}

// "H100 ×16" → "H100". Reports price each accelerator type separately.
export const accelTypeOf = (label) => String(label || '').replace(/\s*×\s*\d+\s*$/, '').trim() || 'Accelerator not recorded';

export const costPerMillion = (pricePerChipHour, chips, tokPerSec) =>
    isNum(pricePerChipHour) && pricePerChipHour > 0 && isNum(tokPerSec) && tokPerSec > 0
        ? ((pricePerChipHour * (chips || 1)) / (tokPerSec * 3600)) * 1e6
        : null;

// A starting price per chip-hour for an accelerator type: the rate saved on
// the Leaderboard (`customRates`, by catalog id), else the GCP list price.
// Null for types the catalog doesn't price (B200, H200, MI300X, TPU7x…): it
// files those under 'other' at a placeholder $1, which isn't a price.
// Returns { price, source: 'custom' | 'list', name }.
export function listPrice(type, customRates = {}) {
    const id = normalizeAcceleratorId(String(type || ''));
    const item = id === 'other' ? null : DEFAULT_PRICING_CATALOG[id];
    if (!item) return null;
    const custom = Number(customRates?.[item.id]);
    return Number.isFinite(custom) && custom > 0 ? { price: custom, source: 'custom', name: item.name } : { price: item.unitRateUsd, source: 'list', name: item.name };
}

// ----------------------------------------------------------------- parity

// Labels the catalog uses when a run didn't say: not a real value to compare.
const PLACEHOLDERS = new Set(['model not recorded', 'not recorded', 'benchmark report']);
const recorded = (v) => (v == null || PLACEHOLDERS.has(String(v).trim().toLowerCase()) ? '' : v);

// What a series measured, for checking a comparison is like-for-like. ''
// where it wasn't recorded.
export function runsConfig(runs) {
    const pick = (get) => mostCommon(runs.map((r) => recorded(get(r)))) ?? '';
    return {
        model: pick((r) => r.model),
        accelerator: pick((r) => r.hardware),
        chips: pick((r) => (r.hardware ? r.accelCount : null)),
        setup: pick((r) => r.setup),
        workload: pick((r) => r.workload),
        harness: pick((r) => r.harness),
        engine: pick((r) => r.engine),
    };
}

export function curveConfig(curve) {
    const m = curve.meta || {};
    const accel = accelTypeOf(m.accelerator);
    const known = accel !== 'Accelerator not recorded' && !isGenericHardware(accel);
    return {
        model: recorded(m.model) || '',
        accelerator: known ? accel : '',
        chips: known ? chipsOf(m) : '',
        setup: recorded(m.setup) || '',
        workload: m.workload || '',
        harness: recorded(m.harness) || '',
        engine: recorded(m.engine) || '',
    };
}

// Each field belongs to one axis of a comparison. Serving fields (hardware,
// deployment, engine) usually change together when one stack is tried
// against another, so they count as one thing under test.
const PARITY_FIELDS = [
    ['model', 'model', 'model'],
    ['accelerator', 'accelerator', 'serving'],
    ['chips', 'chip count', 'serving'],
    ['setup', 'deployment', 'serving'],
    ['engine', 'serving engine', 'serving'],
    ['workload', 'workload (ISL/OSL)', 'workload'],
    ['harness', 'harness', 'harness'],
];

// Whether series compare like-for-like, from their configs (runsConfig /
// curveConfig): what differs ({ key, label, axis, values, byIndex }), what
// all share, and what some didn't record. Same shape as
// runParity.computeParity, which expects Leaderboard recipes and counts
// concurrency, which a curve spans.
export function seriesParity(configs) {
    const mismatches = [];
    const matched = [];
    const unrecorded = [];
    PARITY_FIELDS.forEach(([key, label, axis]) => {
        const values = configs.map((c) => (c[key] == null ? '' : String(c[key]).trim()));
        const known = values.filter(Boolean);
        const distinct = [...new Map(known.map((v) => [v.toLowerCase(), v])).values()];
        if (distinct.length > 1) mismatches.push({ key, label, axis, values: distinct, byIndex: values });
        else if (known.length && known.length === values.length) matched.push({ key, label, axis });
        else unrecorded.push({ key, label, axis });
    });
    return { likeForLike: mismatches.length === 0, mismatches, matched, unrecorded };
}

// How a comparison reads (from seriesParity):
//   repeat  nothing differs: the same setup measured again
//   test    one axis differs: that's what's being tested, e.g. the deployment
//   mixed   several axes differ, so no gap can be pinned on one of them
// `perChip` when chip counts differ: totals then favour the bigger setup.
export function parityFraming(parity) {
    if (!parity) return null;
    const axes = [...new Set(parity.mismatches.map((m) => m.axis))];
    return {
        kind: axes.length === 0 ? 'repeat' : axes.length === 1 ? 'test' : 'mixed',
        axes,
        perChip: parity.mismatches.some((m) => m.key === 'chips'),
    };
}

// How close a candidate baseline's config is to `target` (both runsConfig /
// curveConfig): same model counts most, then hardware, chips, workload and
// harness.
const CLOSENESS = [
    ['model', 3],
    ['accelerator', 2],
    ['chips', 2],
    ['workload', 1],
    ['harness', 1],
];
export function closeness(config, target) {
    if (!config || !target) return 0;
    const same = (a, b) => a !== '' && a != null && String(a).toLowerCase() === String(b).toLowerCase();
    return CLOSENESS.reduce((n, [k, w]) => n + (same(config[k], target[k]) ? w : 0), 0);
}

// Baseline options in the order to offer them: up to 8 that share at least
// the model and hardware with `target` under "Closest matches", then the rest
// by closeness, keeping their own groups.
export function rankBaselines(options, target, { limit = 60 } = {}) {
    const ranked = options.map((o, i) => ({ o, i, score: closeness(o.config, target) })).sort((a, b) => b.score - a.score || a.i - b.i);
    const close = ranked.filter((r) => r.score >= 5).slice(0, 8);
    return [
        ...close.map((r) => ({ ...r.o, group: 'Closest matches' })),
        ...ranked
            .filter((r) => !close.includes(r))
            .slice(0, limit)
            .map((r) => r.o),
    ];
}

// Reports price a result where it's usable, not at an overloaded peak: by
// default at the highest-throughput point whose TTFT is at most this.
export const OPERATING_TTFT_MS = 2000;

// A limit as people say it: 2000 → "2 s", 1500 → "1.5 s". "TTFT ≤ 2 s" reads
// the same in Browse, Compare, Watches and a report's Price at.
export const secondsLabel = (ms) => `${Number((ms / 1000).toFixed(2))} s`;
export const limitLabel = (ms = OPERATING_TTFT_MS) => `TTFT ≤ ${secondsLabel(ms)}`;

// The point a report prices. `limit` is a TTFT limit in ms, or 'peak' for the
// highest throughput however slow. Returns { point, reason, fastest }: with no
// point, reason is 'no-points', 'no-ttft' (nothing recorded TTFT) or
// 'over-limit' (every point is slower, and `fastest` is the quickest one).
export function pricingPoint(points, limit = OPERATING_TTFT_MS) {
    const usable = points.filter((p) => isNum(p.output));
    if (!usable.length) return { point: null, reason: 'no-points', fastest: null };
    if (limit === 'peak') return { point: nearestPoint(usable, null), reason: null, fastest: null };
    const timed = usable.filter((p) => isNum(p.ttft));
    if (!timed.length) return { point: null, reason: 'no-ttft', fastest: null };
    const within = timed.filter((p) => p.ttft <= limit);
    if (!within.length) return { point: null, reason: 'over-limit', fastest: timed.reduce((a, b) => (b.ttft < a.ttft ? b : a)) };
    return { point: nearestPoint(within, null), reason: null, fastest: null };
}

export const ACCELERATOR_SUGGESTIONS = ['H100', 'H200', 'B200', 'A100', 'L4', 'MI300X', 'TPU v5e', 'TPU v6e', 'TPU v7'].flatMap((hw) =>
    [1, 2, 4, 8, 16].map((n) => `${hw} ×${n}`)
);

// Synthesizes a copy-pasteable CLI command to reproduce a run's workload and
// concurrency/request-rate stages with its recorded harness and stack.
export function reproduceCommand(run) {
    if (!run) return '';
    const model = run.modelFull && run.modelFull !== 'Model not recorded' ? run.modelFull : '<model>';
    const isl = run.isl || run.wl?.measured?.isl || 1000;
    const osl = run.osl || run.wl?.measured?.osl || 1000;
    const concs = [...new Set((run.points || []).map((p) => p.conc).filter(isNum))].sort((a, b) => a - b);
    const rates = [...new Set((run.points || []).map((p) => p.rate).filter(isNum))].sort((a, b) => a - b);
    const harness = String(run.harness || '').toLowerCase();
    const header = [
        `# ${run.title || 'Benchmark run'}`,
        `# Engine: ${run.engine || 'not recorded'} · Hardware: ${run.hwLabel || 'not recorded'}${run.setupDetail || run.setup ? ` · Deployment: ${run.setupDetail || run.setup}` : ''}`,
    ];
    if (harness.includes('guidellm')) {
        const rateType = concs.length ? 'concurrent' : 'constant';
        const rateArg = concs.length ? concs.join(',') : rates.length ? rates.join(',') : '1,8,32';
        return [
            ...header,
            `guidellm benchmark \\`,
            `  --target "\${OPENAI_BASE_URL:-http://localhost:8000/v1}" \\`,
            `  --model "${model}" \\`,
            `  --data "prompt_tokens=${isl},output_tokens=${osl}" \\`,
            `  --rate-type ${rateType} \\`,
            `  --rate "${rateArg}"`,
        ].join('\n');
    }
    if (harness.includes('vllm')) {
        const loadArg = concs.length ? `--max-concurrency ${concs.join(',')}` : rates.length ? `--request-rate ${rates.join(',')}` : '--max-concurrency 1,8,32';
        return [
            ...header,
            `vllm bench serve \\`,
            `  --base-url "\${OPENAI_BASE_URL:-http://localhost:8000}" \\`,
            `  --model "${model}" \\`,
            `  --dataset-name random \\`,
            `  --random-input-len ${isl} \\`,
            `  --random-output-len ${osl} \\`,
            `  ${loadArg}`,
        ].join('\n');
    }
    const stageArg = concs.length
        ? `--concurrency "${concs.join(',')}"`
        : rates.length
          ? `--request_rate "${rates.join(',')}"`
          : '--concurrency "1,8,32"';
    return [
        ...header,
        `inference-perf \\`,
        `  --server_type ${String(run.engine || 'vllm').toLowerCase().includes('sglang') ? 'sglang' : 'vllm'} \\`,
        `  --base_url "\${OPENAI_BASE_URL:-http://localhost:8000/v1}" \\`,
        `  --model_name "${model}" \\`,
        `  --input_tokens ${isl} \\`,
        `  --output_tokens ${osl} \\`,
        `  ${stageArg}`,
    ].join('\n');
}
