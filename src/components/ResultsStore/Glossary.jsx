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

// The words the Results store uses, in plain language (UX brief §3). Opened
// from the page header, so nobody has to know the jargon to start.

import React from 'react';
import { ExternalLink } from 'lucide-react';
import { Button, Modal } from '../ui';
import { METHODOLOGY } from '../layout/navigation';
import { OPERATING_TTFT_MS, limitLabel, secondsLabel } from './catalog';

const things = (copy) => [
    ['Run', 'One benchmark that was measured. Its numbers are read-only.'],
    ['Sweep', 'Runs of one setup at different load levels. Prism groups them for you.'],
    ['Result', 'A curve someone curated from a sweep or a multi-point run: named, checked and versioned.'],
    ['Setup', 'What was measured: model, hardware and chip count, workload, harness and deployment. Runs of one setup are repeats of each other.'],
    ['Baseline', 'The series everything else is measured against. In Compare, every Δ is against it.'],
    ['Watch', 'Follows one setup and flags new batches that drop below a baseline. It checks again each time you open it.'],
    ['Report', 'A cost and throughput table for a few results, priced at a latency limit.'],
    [
        copy.publishedLabel,
        copy.publishedStatus === 'official'
            ? `Marked by an approver: other people can rely on it. Anything else in a report is marked ${copy.unofficialLabel}.`
            : `Approved by a reviewer and live for everyone. Anything else in a report is marked ${copy.unofficialLabel}.`,
    ],
];

const NUMBERS = [
    ['Workload (ISL/OSL)', 'Input and output tokens per request. As configured where the source says; otherwise the measured average, rounded so repeats share one label.'],
    ['Concurrency (c=8)', 'Eight requests in flight at once. Sweeps step through levels of it.'],
    ['Throughput (tok/s)', 'Tokens produced per second. Per chip divides by the number of accelerators, so setups of different sizes compare fairly.'],
    [
        `At ${limitLabel()}`,
        `The most throughput while the first token still arrives within ${secondsLabel(OPERATING_TTFT_MS)}: what users actually get. Peak throughput is often an overloaded point.`,
    ],
    ['TTFT', 'Time to first token: how long until the answer starts.'],
    ['TPOT / ITL', 'The pause between tokens once the answer is streaming.'],
    ['E2E', 'The time for the whole answer.'],
    ['Mean, p50, p99', 'The average; the middle request; the slowest 1 in 100 (the “bad day” number).'],
    ['Harness', 'The load generator that measured the run, such as inference-perf or llm-d-benchmark.'],
    ['Deployment', 'How the model was served: replicas and tensor parallelism (“2 TP4”), a prefill/decode split (“1P-TP4 3D-TP4”), or the stack’s own name (“standard-k8s”).'],
    ['Overloaded', 'A point where latency jumps but throughput doesn’t: the server is queueing requests, not serving more.'],
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

export function GlossaryDialog({ isOpen, onClose, copy }) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="lg"
            title="Words we use"
            subtitle="The same short word means the same thing on every screen."
            footer={
                <>
                    {/* A new tab, so the screen you were on is still there. */}
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
                <Terms title="Things" items={things(copy)} />
                <Terms title="Numbers" items={NUMBERS} />
            </div>
        </Modal>
    );
}
