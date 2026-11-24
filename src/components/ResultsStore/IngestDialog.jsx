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

import React, { useMemo, useState } from 'react';
import { Code2, Plus, Trash2, UploadCloud } from 'lucide-react';
import yaml from 'js-yaml';
import { Badge, Button, Checkbox, Input, Label, Modal, Select, ToggleGroup } from '../ui';
import { parseReportV02, stageToEntry } from '../../utils/benchmarkReportV02Parser';
import { CopyButton } from './parts';
import { RESULT_DOMAINS, storeApi } from './storeClient';

const TEMPLATES = [
    {
        id: 'kv-storage',
        label: 'KV-cache storage (128 nodes)',
        data: {
            title: 'LMCache NVMe KV tiering — 128-node fleet',
            domain: 'kv-cache-storage',
            summary: 'Fleet-scale KV cache offload benchmark comparing NVMe tiering against HBM-only prefix eviction.',
            nodes: '128',
            totalAccelerators: '1024',
            accelerator: 'H100',
            topology: '128-node NVMe tier',
            model: 'Qwen3-32B',
            workload: '32k/1k multi-turn',
            harness: 'lmcache-bench',
            experimentGroup: 'kv-tiering-fleet',
            variables: [
                { key: 'kv_tier', value: 'nvme-raid0' },
                { key: 'chunk_size_kb', value: '256' },
                { key: 'eviction', value: 'lru-prefix' },
            ],
            metrics: [
                { name: 'kv_read_gb_s', label: 'KV read bandwidth', value: '412.5', unit: 'GB/s', direction: 'higher_is_better', primary: true, at: '128 nodes' },
                { name: 'cache_hit_ttft_ms', label: 'Cache hit TTFT p50', value: '48.2', unit: 'ms', direction: 'lower_is_better', primary: false, at: 'p50' },
            ],
            evidenceLabel: 'Reproduce command',
            evidenceContent: 'lmcache-bench --nodes 128 --tier nvme-raid0 --chunk-kb 256 --workload 32k-1k',
        },
    },
    {
        id: 'a2i-protocol',
        label: 'Agent-to-inference protocol (64 nodes)',
        data: {
            title: 'A2I gRPC streaming protocol v2 — 64-node fleet',
            domain: 'protocol',
            summary: 'Measures control-plane & gateway overhead for multi-turn agent-to-inference sessions across 64 serving nodes.',
            nodes: '64',
            totalAccelerators: '512',
            accelerator: 'H100',
            topology: '64-node gateway pool',
            model: 'Llama-3.3-70B',
            workload: 'agentic-8-turn',
            harness: 'a2i-proto-bench',
            experimentGroup: 'a2i-protocol',
            variables: [
                { key: 'protocol', value: 'grpc-stream-v2' },
                { key: 'session_affinity', value: 'prefix-sticky' },
                { key: 'compression', value: 'zstd' },
            ],
            metrics: [
                { name: 'protocol_overhead_ms', label: 'Protocol overhead p99', value: '6.2', unit: 'ms', direction: 'lower_is_better', primary: true, at: 'p99' },
                { name: 'fleet_goodput_rps', label: 'Fleet goodput', value: '3120', unit: 'req/s', direction: 'higher_is_better', primary: false, at: '64 nodes' },
            ],
            evidenceLabel: 'Protocol experiment command',
            evidenceContent: 'a2i-proto-bench --nodes 64 --protocol grpc-stream-v2 --affinity prefix-sticky',
        },
    },
    {
        id: 'fleet-serving',
        label: 'Fleet P/D serving sweep (128 nodes)',
        data: {
            title: 'Qwen3-235B 32P:96D disaggregation — 128-node fleet',
            domain: 'serving',
            summary: 'Large-scale prefill/decode disaggregation sweep across 128 nodes (1,024 H100s).',
            nodes: '128',
            totalAccelerators: '1024',
            accelerator: 'H100',
            topology: '32P:96D TP8',
            model: 'Qwen3-235B-A22B',
            workload: '8000/1000',
            harness: 'inference-perf',
            experimentGroup: 'fleet-pd-disagg',
            variables: [
                { key: 'pd_ratio', value: '32:96' },
                { key: 'kv_transfer', value: 'nixl-rdma' },
                { key: 'routing', value: 'precise-prefix-cache' },
            ],
            metrics: [
                { name: 'output_tok_s_at_ttft_2s', label: 'Output at TTFT p50 ≤ 2 s', value: '284500', unit: 'tok/s', direction: 'higher_is_better', primary: true, at: 'TTFT p50 ≤ 2 s' },
                { name: 'tpot_p50_ms', label: 'TPOT p50', value: '24.8', unit: 'ms', direction: 'lower_is_better', primary: false, at: 'c=512' },
            ],
            evidenceLabel: 'Helm / harness config',
            evidenceContent: 'inference-perf --fleet-nodes 128 --pd-ratio 32:96 --model Qwen3-235B-A22B',
        },
    },
];

const EMPTY_FORM = {
    title: '',
    domain: 'serving',
    summary: '',
    nodes: '1',
    totalAccelerators: '',
    accelerator: '',
    topology: '',
    model: '',
    workload: '',
    harness: '',
    experimentGroup: '',
    baselineId: '',
    variables: [{ key: '', value: '' }],
    metrics: [{ name: 'output_tok_s', label: 'Output throughput', value: '', unit: 'tok/s', direction: 'higher_is_better', primary: true, at: '' }],
    evidenceLabel: 'Reproduce command',
    evidenceContent: '',
};

function parseUploadedPayload(text, filename) {
    const raw = filename.endsWith('.yaml') || filename.endsWith('.yml') ? yaml.load(text) : JSON.parse(text);
    if (!raw || typeof raw !== 'object') throw new Error('File must contain a JSON or YAML object.');

    // Native Result Store payload?
    if (raw.title && (Array.isArray(raw.metrics) || Array.isArray(raw.sweep))) {
        return raw;
    }

    // Benchmark Report v0.2 single or multi-stage report?
    const parsed = parseReportV02(raw, filename);
    if (parsed) {
        const entry = stageToEntry(parsed);
        const output = Number(entry?.throughput || parsed.performance?.outputTokS || 0);
        const ttft = parsed.performance?.ttftP50 ?? parsed.performance?.ttftMean ?? null;
        const tpot = parsed.performance?.tpotP50 ?? parsed.performance?.tpotMean ?? null;
        const chips = Number(parsed.scenario?.acceleratorCount || 1);
        const model = parsed.scenario?.model || 'Unknown model';
        const hardware = parsed.scenario?.hardware || 'Unknown hardware';
        const metrics = [];
        if (output > 0) {
            metrics.push({
                name: 'output_tok_s',
                label: 'Output throughput',
                value: Math.round(output * 100) / 100,
                unit: 'tok/s',
                direction: 'higher_is_better',
                primary: true,
            });
        }
        if (ttft != null && ttft > 0) {
            metrics.push({
                name: 'ttft_ms',
                label: 'TTFT',
                value: Math.round(ttft * 10) / 10,
                unit: 'ms',
                direction: 'lower_is_better',
                primary: metrics.length === 0,
                stat: parsed.performance?.ttftP50 != null ? 'p50' : 'mean',
            });
        }
        if (tpot != null && tpot > 0) {
            metrics.push({
                name: 'tpot_ms',
                label: 'TPOT',
                value: Math.round(tpot * 10) / 10,
                unit: 'ms',
                direction: 'lower_is_better',
                primary: false,
                stat: parsed.performance?.tpotP50 != null ? 'p50' : 'mean',
            });
        }
        return {
            title: `${model} · ${hardware} ×${chips}`,
            domain: 'serving',
            model,
            hardware: `${hardware} ×${chips}`,
            harness: parsed.scenario?.harness || 'brv02',
            fleet: { nodes: Math.max(1, Math.ceil(chips / 8)), totalAccelerators: chips, accelerator: hardware },
            metrics,
            sweep: output > 0 ? [{ key: filename, conc: parsed.scenario?.concurrency ?? null, output, chips, lat: { ttft: { mean: parsed.performance?.ttftMean, p50: parsed.performance?.ttftP50 }, tpot: { mean: parsed.performance?.tpotMean, p50: parsed.performance?.tpotP50 } }, included: true }] : undefined,
            evidence: [{ label: filename, kind: 'report', content: text.slice(0, 8000) }],
        };
    }

    throw new Error('Could not recognize this file as a Result JSON payload or Benchmark Report v0.2 YAML.');
}

export function IngestDialog({ isOpen, initialMode = 'form', onClose, stores = [], defaultStoreId, existingResults = [], actor, apiCtx, onCreated }) {
    const writableStores = useMemo(() => stores.filter((s) => s.capabilities?.canWrite), [stores]);
    const initialStore = writableStores.find((s) => s.id === defaultStoreId)?.id || writableStores.find((s) => s.defaultTarget)?.id || writableStores[0]?.id || stores[0]?.id || 'llm-d';

    const [mode, setMode] = useState(initialMode);
    const [lastOpen, setLastOpen] = useState(isOpen);
    if (isOpen && !lastOpen) {
        setLastOpen(true);
        if (mode !== initialMode) setMode(initialMode);
    } else if (!isOpen && lastOpen) {
        setLastOpen(false);
    }
    const [targetStoreId, setTargetStoreId] = useState(initialStore);
    const [form, setForm] = useState(EMPTY_FORM);
    const [publishNow, setPublishNow] = useState(true);
    const [dcoSigned, setDcoSigned] = useState(false);
    const [dcoName, setDcoName] = useState(actor && actor !== 'you' ? actor.replace(/^@/, '') : '');
    const [rawJson, setRawJson] = useState('');
    const [uploadNote, setUploadNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const targetStore = stores.find((s) => s.id === targetStoreId) || writableStores[0] || stores[0];
    const needsDco = Boolean(publishNow && targetStore?.capabilities?.dcoRequired);

    const applyTemplate = (tpl) => {
        setForm({ ...EMPTY_FORM, ...tpl.data, baselineId: '' });
        setError(null);
    };

    const buildPayloadFromForm = () => {
        const variables = {};
        for (const row of form.variables) {
            const k = row.key.trim();
            if (!k) continue;
            const v = row.value.trim();
            if (v === 'true') variables[k] = true;
            else if (v === 'false') variables[k] = false;
            else if (v !== '' && !Number.isNaN(Number(v))) variables[k] = Number(v);
            else variables[k] = v;
        }
        const metrics = form.metrics
            .filter((m) => m.name.trim() && m.value !== '' && !Number.isNaN(Number(m.value)))
            .map((m, idx) => ({
                name: m.name.trim(),
                label: m.label.trim() || m.name.trim(),
                value: Number(m.value),
                unit: m.unit.trim() || 'unit',
                direction: m.direction,
                primary: Boolean(m.primary || idx === 0),
                ...(m.at.trim() ? { at: m.at.trim() } : {}),
            }));

        const nodes = Math.max(1, parseInt(form.nodes, 10) || 1);
        const totalAccelerators = form.totalAccelerators ? parseInt(form.totalAccelerators, 10) : undefined;
        const fleet = {
            nodes,
            ...(totalAccelerators ? { totalAccelerators } : {}),
            ...(form.accelerator.trim() ? { accelerator: form.accelerator.trim() } : {}),
            ...(form.topology.trim() ? { topology: form.topology.trim() } : {}),
        };

        const evidence = form.evidenceContent.trim()
            ? [{ label: form.evidenceLabel.trim() || 'Evidence', kind: 'command', content: form.evidenceContent.trim() }]
            : [];

        const baseline = existingResults.find((r) => r.id === form.baselineId);
        return {
            title: form.title.trim(),
            domain: form.domain,
            summary: form.summary.trim(),
            metrics,
            variables,
            evidence,
            fleet,
            lineage: {
                baselineId: baseline ? baseline.id : null,
                baselineStoreId: baseline ? baseline.storeId : null,
                experimentGroup: form.experimentGroup.trim() || null,
                changedVariables: [],
            },
            ...(form.model.trim() ? { model: form.model.trim() } : {}),
            ...(form.accelerator.trim() ? { hardware: form.accelerator.trim() } : {}),
            ...(form.workload.trim() ? { workload: form.workload.trim() } : {}),
            ...(form.harness.trim() ? { harness: form.harness.trim() } : {}),
            publish: publishNow,
            ...(needsDco && dcoSigned && dcoName.trim() ? { dco: { version: '1.1', signedBy: dcoName.trim() } } : {}),
        };
    };

    const handleFile = async (e) => {
        const files = [...(e.target.files || [])];
        if (!files.length) return;
        setError(null);
        try {
            if (files.length === 1) {
                const text = await files[0].text();
                const parsed = parseUploadedPayload(text, files[0].name);
                setRawJson(JSON.stringify(parsed, null, 2));
                setUploadNote(`Loaded ${files[0].name} (${parsed.metrics?.length || 0} metrics)`);
                return;
            }
            // Merge multiple stage files (e.g. benchmark_report_v0.2_stage_*.yaml) into one sweep result.
            const parsedList = await Promise.all(files.map(async (f) => parseUploadedPayload(await f.text(), f.name)));
            const first = parsedList[0];
            const sweep = parsedList.flatMap((p) => p.sweep || []);
            const merged = {
                ...first,
                title: `${first.title} (${files.length}-stage sweep)`,
                sweep: sweep.length ? sweep : undefined,
                metrics: sweep.length ? [] : first.metrics,
                evidence: parsedList.flatMap((p) => p.evidence || []).slice(0, 8),
            };
            setRawJson(JSON.stringify(merged, null, 2));
            setUploadNote(`Merged ${files.length} files into 1 sweep (${sweep.length} points)`);
        } catch (err) {
            setError(err.message || 'Could not parse file(s).');
        }
    };

    const submit = async () => {
        setError(null);
        setSubmitting(true);
        try {
            let payload;
            if (mode === 'upload') {
                payload = JSON.parse(rawJson);
                payload.publish = publishNow;
                if (needsDco && dcoSigned && dcoName.trim()) {
                    payload.dco = { version: '1.1', signedBy: dcoName.trim() };
                }
            } else {
                payload = buildPayloadFromForm();
            }
            const res = await storeApi.createResult(targetStore.id, payload, apiCtx);
            onCreated?.(res.result, targetStore);
            setForm(EMPTY_FORM);
            setRawJson('');
            setUploadNote('');
            onClose();
        } catch (err) {
            const issues = err?.body?.issues;
            if (Array.isArray(issues) && issues.length) {
                setError(issues.map((i) => `${i.path?.join('.') || 'payload'}: ${i.message}`).join(' · '));
            } else {
                setError(err.message || 'Failed to save result.');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://prism.llm-d.ai';
    const samplePayload = useMemo(() => {
        const p = form.title ? buildPayloadFromForm() : {
            title: 'LMCache NVMe KV tiering — 128-node fleet',
            domain: 'kv-cache-storage',
            fleet: { nodes: 128, totalAccelerators: 1024, accelerator: 'H100', topology: '128-node NVMe tier' },
            variables: { kv_tier: 'nvme-raid0', chunk_size_kb: 256 },
            metrics: [
                { name: 'kv_read_gb_s', label: 'KV read bandwidth', value: 412.5, unit: 'GB/s', direction: 'higher_is_better', primary: true },
                { name: 'cache_hit_ttft_ms', label: 'Cache hit TTFT p50', value: 48.2, unit: 'ms', direction: 'lower_is_better', stat: 'p50' },
            ],
            evidence: [{ label: 'Reproduce command', kind: 'command', content: 'lmcache-bench --nodes 128 --tier nvme-raid0' }],
            publish: true,
        };
        return JSON.stringify(p, null, 2);
    }, [form, publishNow, needsDco, dcoSigned, dcoName]); // eslint-disable-line react-hooks/exhaustive-deps

    const curlCommand = `curl -X POST "${origin}/api/stores/${targetStore?.id || 'llm-d'}/results" \\\n  -H "Content-Type: application/json" \\\n  -H "X-Prism-Github-Token: $PRISM_GITHUB_TOKEN" \\\n  -d '${samplePayload}'`;

    const submitLabel = !publishNow
        ? 'Save draft'
        : targetStore?.capabilities?.approvalRequired && !targetStore?.capabilities?.canApprove
          ? `Submit to ${targetStore.name}`
          : `Publish to ${targetStore?.name || 'store'}`;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title="Add result"
            subtitle="Drop in serving sweeps, storage benchmarks, or protocol experiments. Every stored result can be compared against baselines and turned into an artifact."
            footer={
                <>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    {mode !== 'agent' && (
                        <Button
                            size="sm"
                            onClick={submit}
                            isLoading={submitting}
                            disabled={submitting || !writableStores.length || (mode === 'form' && !form.title.trim()) || (mode === 'upload' && !rawJson.trim()) || (needsDco && (!dcoSigned || !dcoName.trim()))}
                        >
                            {submitLabel}
                        </Button>
                    )}
                </>
            }
        >
            <div className="surface-light space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <ToggleGroup
                        size="xs"
                        aria-label="Ingestion method"
                        value={mode}
                        onChange={(v) => {
                            setMode(v);
                            setError(null);
                        }}
                        options={[
                            { value: 'form', label: 'Structured entry' },
                            { value: 'upload', label: 'Upload JSON / YAML' },
                            { value: 'agent', label: 'Agent / CLI API' },
                        ]}
                    />

                    {writableStores.length > 1 && (
                        <div className="flex items-center gap-2">
                            <Label surface="light" htmlFor="ingest-target-store" className="mb-0">
                                Target store
                            </Label>
                            <Select
                                surface="light"
                                id="ingest-target-store"
                                value={targetStoreId}
                                onChange={(e) => setTargetStoreId(e.target.value)}
                                className="w-48"
                            >
                                {writableStores.map((s) => (
                                    <option key={s.id} value={s.id}>
                                        {s.name}
                                    </option>
                                ))}
                            </Select>
                        </div>
                    )}
                </div>

                {!writableStores.length && (
                    <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                        Sign in with an account that has write access to a store to ingest results.
                    </p>
                )}

                {mode === 'form' && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="label-caps text-zinc-500">Starter templates:</span>
                            {TEMPLATES.map((tpl) => (
                                <Button key={tpl.id} size="xs" variant="secondary" onClick={() => applyTemplate(tpl)}>
                                    {tpl.label}
                                </Button>
                            ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="sm:col-span-2">
                                <Label surface="light" htmlFor="ingest-title">
                                    Title
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-title"
                                    value={form.title}
                                    placeholder="e.g. LMCache NVMe KV tiering — 128-node fleet"
                                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="ingest-domain">
                                    Stack layer / domain
                                </Label>
                                <Select
                                    surface="light"
                                    id="ingest-domain"
                                    value={form.domain}
                                    onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))}
                                >
                                    {RESULT_DOMAINS.map((d) => (
                                        <option key={d.value} value={d.value}>
                                            {d.label}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-4">
                            <div>
                                <Label surface="light" htmlFor="ingest-nodes">
                                    Fleet nodes
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-nodes"
                                    type="number"
                                    min="1"
                                    value={form.nodes}
                                    onChange={(e) => setForm((f) => ({ ...f, nodes: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="ingest-chips">
                                    Total chips
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-chips"
                                    type="number"
                                    min="0"
                                    placeholder="e.g. 1024"
                                    value={form.totalAccelerators}
                                    onChange={(e) => setForm((f) => ({ ...f, totalAccelerators: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="ingest-accel">
                                    Accelerator
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-accel"
                                    placeholder="e.g. H100, TPU v6e"
                                    value={form.accelerator}
                                    onChange={(e) => setForm((f) => ({ ...f, accelerator: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="ingest-topology">
                                    Topology
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-topology"
                                    placeholder="e.g. 32P:96D TP8"
                                    value={form.topology}
                                    onChange={(e) => setForm((f) => ({ ...f, topology: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                                <Label surface="light" htmlFor="ingest-model">
                                    Model (optional)
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-model"
                                    placeholder="e.g. Qwen3-32B"
                                    value={form.model}
                                    onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="ingest-workload">
                                    Workload (optional)
                                </Label>
                                <Input
                                    surface="light"
                                    id="ingest-workload"
                                    placeholder="e.g. 32k/1k multi-turn"
                                    value={form.workload}
                                    onChange={(e) => setForm((f) => ({ ...f, workload: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label surface="light" htmlFor="ingest-baseline">
                                    Baseline (optional)
                                </Label>
                                <Select
                                    surface="light"
                                    id="ingest-baseline"
                                    value={form.baselineId}
                                    onChange={(e) => setForm((f) => ({ ...f, baselineId: e.target.value }))}
                                >
                                    <option value="">Auto-discover later</option>
                                    {existingResults.slice(0, 40).map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.title}
                                        </option>
                                    ))}
                                </Select>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 p-3.5">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="label-caps text-zinc-500">Outcomes / metrics (for before/after deltas)</span>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() =>
                                        setForm((f) => ({
                                            ...f,
                                            metrics: [...f.metrics, { name: '', label: '', value: '', unit: '', direction: 'higher_is_better', primary: false, at: '' }],
                                        }))
                                    }
                                >
                                    <Plus className="h-3 w-3" aria-hidden="true" />
                                    Add metric
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {form.metrics.map((m, idx) => (
                                    <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_90px_80px_130px_auto]">
                                        <Input
                                            surface="light"
                                            placeholder="metric_key"
                                            value={m.name}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    metrics: f.metrics.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)),
                                                }))
                                            }
                                        />
                                        <Input
                                            surface="light"
                                            placeholder="Display label"
                                            value={m.label}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    metrics: f.metrics.map((x, i) => (i === idx ? { ...x, label: e.target.value } : x)),
                                                }))
                                            }
                                        />
                                        <Input
                                            surface="light"
                                            type="number"
                                            step="any"
                                            placeholder="Value"
                                            value={m.value}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    metrics: f.metrics.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)),
                                                }))
                                            }
                                        />
                                        <Input
                                            surface="light"
                                            placeholder="Unit"
                                            value={m.unit}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    metrics: f.metrics.map((x, i) => (i === idx ? { ...x, unit: e.target.value } : x)),
                                                }))
                                            }
                                        />
                                        <Select
                                            surface="light"
                                            value={m.direction}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    metrics: f.metrics.map((x, i) => (i === idx ? { ...x, direction: e.target.value } : x)),
                                                }))
                                            }
                                        >
                                            <option value="higher_is_better">Higher is better</option>
                                            <option value="lower_is_better">Lower is better</option>
                                        </Select>
                                        {form.metrics.length > 1 && (
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                aria-label="Remove metric"
                                                onClick={() => setForm((f) => ({ ...f, metrics: f.metrics.filter((_, i) => i !== idx) }))}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="rounded-2xl border border-zinc-200 p-3.5">
                            <div className="mb-2 flex items-center justify-between">
                                <span className="label-caps text-zinc-500">Experimental variables (diffed automatically in Compare)</span>
                                <Button
                                    size="xs"
                                    variant="ghost"
                                    onClick={() => setForm((f) => ({ ...f, variables: [...f.variables, { key: '', value: '' }] }))}
                                >
                                    <Plus className="h-3 w-3" aria-hidden="true" />
                                    Add variable
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {form.variables.map((v, idx) => (
                                    <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                        <Input
                                            surface="light"
                                            placeholder="Variable name (e.g. protocol, kv_tier)"
                                            value={v.key}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    variables: f.variables.map((x, i) => (i === idx ? { ...x, key: e.target.value } : x)),
                                                }))
                                            }
                                        />
                                        <Input
                                            surface="light"
                                            placeholder="Value (e.g. grpc-stream-v2)"
                                            value={v.value}
                                            onChange={(e) =>
                                                setForm((f) => ({
                                                    ...f,
                                                    variables: f.variables.map((x, i) => (i === idx ? { ...x, value: e.target.value } : x)),
                                                }))
                                            }
                                        />
                                        {form.variables.length > 1 && (
                                            <Button
                                                size="xs"
                                                variant="ghost"
                                                aria-label="Remove variable"
                                                onClick={() => setForm((f) => ({ ...f, variables: f.variables.filter((_, i) => i !== idx) }))}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <Label surface="light" htmlFor="ingest-evidence">
                                Reproducibility command / config snippet (optional)
                            </Label>
                            <Input
                                surface="light"
                                id="ingest-evidence"
                                className="font-mono text-xs"
                                placeholder="e.g. inference-perf --fleet-nodes 128 ..."
                                value={form.evidenceContent}
                                onChange={(e) => setForm((f) => ({ ...f, evidenceContent: e.target.value }))}
                            />
                        </div>
                    </div>
                )}

                {mode === 'upload' && (
                    <div className="space-y-3">
                        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-6 py-6 text-center transition-colors hover:border-accent-300 hover:bg-accent-50/30">
                            <UploadCloud className="h-5 w-5 text-accent-600" aria-hidden="true" />
                            <span className="text-xs font-semibold text-zinc-900">Drop or choose Benchmark Report v0.2 YAML (single or multi-stage sweep) or Result JSON</span>
                            <span className="text-micro text-zinc-500">Select multiple stage files at once to merge them into a single sweep result.</span>
                            <input type="file" multiple accept=".json,.yaml,.yml" className="sr-only" onChange={handleFile} />
                        </label>
                        {uploadNote && <p className="text-xs font-medium text-emerald-700">{uploadNote}</p>}
                        <div>
                            <Label surface="light" htmlFor="ingest-raw-json">
                                Payload JSON (editable before ingest)
                            </Label>
                            <textarea
                                id="ingest-raw-json"
                                rows={10}
                                value={rawJson}
                                onChange={(e) => setRawJson(e.target.value)}
                                placeholder='{ "title": "...", "domain": "kv-cache-storage", "metrics": [...] }'
                                className="w-full rounded-2xl border border-zinc-200 bg-white p-3 font-mono text-xs text-zinc-900 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
                            />
                        </div>
                    </div>
                )}

                {mode === 'agent' && (
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4 text-xs text-zinc-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="flex items-center gap-1.5 font-semibold text-zinc-900">
                                    <Code2 className="h-4 w-4 text-accent-600" aria-hidden="true" />
                                    Agent-native ingestion contract
                                </span>
                                <Badge size="xs" tone="brand">
                                    Schema: GET /api/schemas/result.json
                                </Badge>
                            </div>
                            <p className="mt-1.5 leading-relaxed">
                                Agents can discover schemas at <code className="font-mono text-zinc-900">/api/schemas/result.json</code>, ingest results directly into{' '}
                                <code className="font-mono text-zinc-900">{targetStore?.name}</code>, discover baselines via{' '}
                                <code className="font-mono text-zinc-900">GET /api/stores/{targetStore?.id}/results/:id/baselines</code>, compute deltas via{' '}
                                <code className="font-mono text-zinc-900">GET /api/stores/compare?ids=a,b</code>, and publish artifacts via{' '}
                                <code className="font-mono text-zinc-900">POST /api/stores/{targetStore?.id}/artifacts</code>.
                            </p>
                        </div>

                        <div>
                            <div className="mb-1.5 flex items-center justify-between">
                                <span className="label-caps text-zinc-500">cURL example</span>
                                <CopyButton text={curlCommand} label="Copy cURL" size="xs" />
                            </div>
                            <pre className="max-h-72 overflow-auto rounded-2xl border border-zinc-200 bg-zinc-950 p-4 font-mono text-xs text-zinc-100">
                                {curlCommand}
                            </pre>
                        </div>
                    </div>
                )}

                {mode !== 'agent' && (
                    <div className="space-y-3 border-t border-zinc-200 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <Checkbox
                                surface="light"
                                checked={publishNow}
                                onChange={setPublishNow}
                                label={
                                    targetStore?.capabilities?.approvalRequired && !targetStore?.capabilities?.canApprove
                                        ? `Submit for review in ${targetStore.name} immediately`
                                        : `Publish immediately to ${targetStore?.name || 'store'}`
                                }
                            />
                            <span className="text-micro text-zinc-500">
                                {targetStore?.capabilities?.approvalRequired ? 'Approval gated' : 'Direct publish'}
                            </span>
                        </div>
                        {needsDco && (
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
                                <Checkbox
                                    surface="light"
                                    checked={dcoSigned}
                                    onChange={setDcoSigned}
                                    label="I certify the Developer Certificate of Origin (DCO 1.1) for this benchmark."
                                />
                                <Input
                                    surface="light"
                                    placeholder="Signed-off-by name or @github-handle"
                                    value={dcoName}
                                    onChange={(e) => setDcoName(e.target.value)}
                                />
                            </div>
                        )}
                    </div>
                )}

                {error && (
                    <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800">
                        {error}
                    </p>
                )}
            </div>
        </Modal>
    );
}
