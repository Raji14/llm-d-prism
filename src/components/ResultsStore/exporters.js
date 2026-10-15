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

// Exports for Compare and Reports: CSV for spreadsheets, Markdown for
// issues, docs and chat. Pure text builders plus one download helper.

import { LATENCY_METRICS, LATENCY_STATS, latencyKey } from './catalog';

// Spreadsheet apps run cells that start like a formula; names are typed by
// people, so those are prefixed with ' to stay text.
const csvCell = (v) => {
    if (v == null || (typeof v === 'number' && !Number.isFinite(v))) return '';
    let s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// columns: [{ label, get(row) }]
export const toCsv = (columns, rows) =>
    [columns.map((c) => csvCell(c.label)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.get(r))).join(','))].join('\n');

const mdCell = (v) => String(v == null || v === '' ? '—' : v).replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');

// A GitHub-flavored table. `align` marks right-aligned (numeric) columns 'r'.
export function mdTable(headers, rows, align = []) {
    const line = (cells) => `| ${cells.join(' | ')} |`;
    return [line(headers.map(mdCell)), line(headers.map((_, i) => (align[i] === 'r' ? '---:' : '---'))), ...rows.map((r) => line(r.map(mdCell)))].join('\n');
}

// "Llama 3.1 · H100 ×8" → "llama-3-1-h100-x8", for file names.
export const fileSlug = (s) =>
    String(s || '')
        .toLowerCase()
        .replace(/×/g, 'x')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'export';

// Every point of every series, one row each, with all recorded statistics.
// series: [{ name, role, points }]. A point saved before Prism kept each
// statistic has only its typical value, exported in its own column.
export function pointsCsv(series) {
    const rows = series.flatMap((s) => s.points.map((p) => ({ s, p })));
    const legacy = rows.some(({ p }) => !(latencyKey('ttft', 'p50') in p));
    const columns = [
        { label: 'Series', get: ({ s }) => s.name },
        { label: 'Role', get: ({ s }) => s.role },
        { label: 'Run', get: ({ p }) => p.runId || p.idLabel || p.runKey },
        { label: 'Concurrency', get: ({ p }) => p.conc },
        { label: 'Output (tok/s)', get: ({ p }) => p.output },
        { label: 'Total (tok/s)', get: ({ p }) => p.total },
        { label: 'Chips', get: ({ p }) => p.chips },
        { label: 'Output per chip (tok/s)', get: ({ p }) => p.outputPerChip },
        ...LATENCY_METRICS.flatMap((m) => [
            ...LATENCY_STATS.map((st) => ({ label: `${m.label} ${st.value} (ms)`, get: ({ p }) => p[latencyKey(m.value, st.value)] })),
            ...(legacy ? [{ label: `${m.label}, p50 or mean (ms)`, get: ({ p }) => (latencyKey(m.value, 'p50') in p ? null : p[m.value]) }] : []),
        ]),
        { label: 'Failed requests (%)', get: ({ p }) => p.errPct },
    ];
    return toCsv(columns, rows);
}

export function downloadText(filename, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
