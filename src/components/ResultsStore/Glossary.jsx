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

// Plain-language glossary for the simplified Result Store.

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button, Modal } from '../ui';
import { METHODOLOGY } from '../layout/navigation';

const PRIMITIVES = [
    ['Store', 'A permission-governed logical collection of results (not a storage bucket). You only see stores you have access to.'],
    ['Result', 'An immutable-evidence benchmark record across any stack layer (serving, routing, KV-cache/storage, protocol, or end-to-end) and fleet scale.'],
    ['Baseline', 'The reference result every delta is measured against. Today’s published result becomes tomorrow’s baseline.'],
    ['Variables', 'The experimental knobs recorded with a result (e.g. protocol, kv_tier, pd_ratio). Compare diffs them automatically to isolate what changed.'],
    ['Artifact', 'A shareable dashboard built directly from published Result IDs — either declarative Prism building blocks (the well-lit path) or sandboxed HTML.'],
    ['Well-lit path', 'A curated, store-pinned Artifact showcasing a validated, fleet-scale optimization without cluttering the store with competing options.'],
];

const METRICS = [
    ['Fleet scale', 'Cluster size measured in nodes, total accelerators, and topology (e.g. 128 nodes · 1,024× H100 · 32P:96D).'],
    ['At TTFT p50 ≤ 2 s', 'Highest sustained output throughput while median time to first token stays within 2 seconds.'],
    ['TTFT / TPOT / E2E', 'Time to first token; pause between streamed tokens; total end-to-end request latency.'],
    ['Domain metrics', 'Storage (GB/s, cache hit latency), protocol (overhead ms, fleet goodput), or custom numeric metrics with explicit higher/lower-is-better direction.'],
];

function Terms({ title, items }) {
    return (
        <section>
            <h3 className="label-caps mb-2 text-zinc-500">{title}</h3>
            <dl className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200">
                {items.map(([term, meaning]) => (
                    <div key={term} className="grid gap-1 px-4 py-2.5 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                        <dt className="text-xs font-semibold text-zinc-900">{term}</dt>
                        <dd className="text-xs leading-relaxed text-zinc-700">{meaning}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

export function GlossaryDialog({ isOpen, onClose }) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title="Words we use"
            subtitle="Three core primitives across every store — human UI and agent API alike."
            footer={
                <>
                    <Button
                        size="sm"
                        variant="ghost"
                        href={`?view=${METHODOLOGY.view}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-auto"
                    >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        {METHODOLOGY.label}
                        <span className="sr-only"> (opens in a new tab)</span>
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onClose}>
                        Close
                    </Button>
                </>
            }
        >
            <div className="surface-light space-y-5">
                <Terms title="Core concepts" items={PRIMITIVES} />
                <Terms title="Measurements" items={METRICS} />
            </div>
        </Modal>
    );
}
