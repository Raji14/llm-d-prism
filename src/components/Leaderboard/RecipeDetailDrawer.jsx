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

import React, { useState, useEffect } from 'react';
import {
    X,
    Copy,
    Check,
    Download,
    Share2,
    Terminal,
    Cpu,
    Layers,
    ShieldCheck,
    GitBranch,
    GitPullRequest,
    GitCommit,
    ExternalLink,
    Flag,
    Gauge,
    CheckCircle2,
    AlertTriangle,
    Calendar,
    Route,
    Activity,
    Compass
} from 'lucide-react';
import {
    getRecipeReproductionCount,
    getRecipeReproductions
} from '../../utils/communityRewards.js';
import { formatRunDate, isStaleRun } from '../../utils/runParity.js';
import { engineLabel } from '../../utils/leaderboardFacets.js';
import { Button } from '../ui/Button.jsx';
import { Badge, StatusChip } from '../ui/Badge.jsx';
import { cn } from '../../utils/cn';

const WELL_LIT_PATH_LABELS = {
    'inference-scheduling': 'Intelligent routing',
    'prefix-cache-offloading': 'Prefix cache offloading',
    'agentic-serving': 'Agentic serving',
    'pd-disaggregation': 'Prefill/decode disaggregation'
};

export default function RecipeDetailDrawer({ isOpen, onClose, recipe, onOpenFeedback, onNavigate }) {
    const [activeTab, setActiveTab] = useState('agent');
    const [copied, setCopied] = useState(false);
    const [copiedImage, setCopiedImage] = useState(false);
    const [copiedRecipeLink, setCopiedRecipeLink] = useState(false);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Prevent background scrolling while drawer is open
    useEffect(() => {
        if (!isOpen) return;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, [isOpen]);

    if (!isOpen || !recipe) return null;

    const githubUrl = recipe.pull_request_url || `https://github.com/llm-d/llm-d/tree/main/recipes/${(recipe.model_family || 'llama').toLowerCase().replace(/\s+/g, '-')}`;
    const containerImage = recipe.container_image || recipe.stack?.container_image || null;
    const containerImageInSnippet = containerImage || '<container-image-not-reported>';
    const gitCommitSha = recipe.git_commit_sha || 'Not reported';
    const runDateLabel = formatRunDate(recipe.created_at) || 'Date not reported';
    const stale = isStaleRun(recipe);
    const stackBrand = engineLabel(recipe.stack?.engine);
    const stackVersion = recipe.stack?.engine_version && recipe.stack.engine_version !== 'latest'
        ? recipe.stack.engine_version
        : null;

    const chips = Math.max(1, recipe.hardware?.accelerator_count || 1);
    const tpsPerChip = recipe.tokens_per_sec_per_chip ?? (recipe.tokens_per_sec || 0) / chips;
    const activeConcurrency = recipe.operatingConcurrency ?? recipe.workload?.concurrency ?? 32;
    const sweepPoints = Array.isArray(recipe.sweep_points) ? recipe.sweep_points : [];
    const statusKey = recipe.missesSlo
        ? 'misses_slo'
        : recipe.well_lit_path
            ? 'well_lit_path'
            : recipe.verification_status || 'verified';

    // Independent reproductions
    const reproCount = getRecipeReproductionCount(recipe);
    const reproductions = getRecipeReproductions(recipe);

    const dockerCommand = recipe.reproduction_command || `docker run --gpus all -p 8000:8000 ${containerImageInSnippet} --model ${recipe.model_name} --tp ${recipe.stack?.tensor_parallel_size || 8} --quantization ${recipe.stack?.quantization || 'fp8'}`;

    const helmValues = `# Helm values for deploying ${recipe.recipe_name}
replicaCount: 1
image:
  repository: ${containerImage ? containerImage.split(':')[0] : '<container-repository-not-reported>'}
  tag: ${containerImage && containerImage.includes(':') ? containerImage.split(':')[1] : (stackVersion || 'latest')}
model:
  name: "${recipe.model_name}"
  tensorParallelSize: ${recipe.stack?.tensor_parallel_size || 8}
  pipelineParallelSize: ${recipe.stack?.pipeline_parallel_size || 1}
  quantization: "${recipe.stack?.quantization || 'fp8'}"
  kvCacheDtype: "${recipe.stack?.kv_cache_dtype || 'fp8_e4m3'}"
  prefixCaching: ${recipe.stack?.prefix_caching ? 'true' : 'false'}
resources:
  limits:
    ${recipe.hardware?.accelerator_type?.includes('tpu') ? 'google.com/tpu' : 'nvidia.com/gpu'}: ${recipe.hardware?.accelerator_count || 8}
`;

    const k8sManifest = `# Production KubeRay / GKE Reference Architecture Manifest
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: llmd-${(recipe.model_family || 'serving').toLowerCase().replace(/\s+/g, '-')}-cluster
  namespace: llm-inference
spec:
  rayVersion: '2.35.0'
  headGroupSpec:
    rayStartParams:
      dashboard-host: '0.0.0.0'
    template:
      spec:
        containers:
        - name: ray-head
          image: ${containerImageInSnippet}
          resources:
            limits:
              cpu: "8"
              memory: "32Gi"
  workerGroupSpecs:
  - groupName: gpu-worker
    replicas: ${recipe.hardware?.accelerator_count && recipe.hardware.accelerator_count > 8 ? Math.ceil(recipe.hardware.accelerator_count / 8) : 1}
    template:
      spec:
        nodeSelector:
          cloud.google.com/gke-accelerator: ${recipe.hardware?.accelerator_type || 'nvidia-h100-80gb'}
        containers:
        - name: ray-worker
          image: ${containerImageInSnippet}
          env:
          - name: MODEL_NAME
            value: "${recipe.model_name}"
          - name: TENSOR_PARALLEL_SIZE
            value: "${recipe.stack?.tensor_parallel_size || 8}"
          - name: QUANTIZATION
            value: "${recipe.stack?.quantization || 'fp8'}"
          resources:
            limits:
              ${recipe.hardware?.accelerator_type?.includes('tpu') ? 'google.com/tpu' : 'nvidia.com/gpu'}: ${Math.min(8, recipe.hardware?.accelerator_count || 8)}
              memory: "128Gi"
`;

    const agentBenchmarkScript = `# config.yml — kubernetes-sigs/inference-perf
server:
  type: vllm
  model_name: ${recipe.model_name}
  base_url: http://localhost:8000
tokenizer:
  pretrained_model_name_or_path: ${recipe.model_name}
data:
  type: shareGPT
  input_distribution:
    mean: ${recipe.workload?.input_tokens || 1024}
  output_distribution:
    mean: ${recipe.workload?.output_tokens || 512}
load:
  type: constant
  stages:
    - rate: ${recipe.operatingPoint?.qps || recipe.workload?.target_qps || 10}
      duration: 120
  num_workers: ${activeConcurrency}
report:
  request_lifecycle:
    summary: true
    per_stage: true

# Run command:
# inference-perf --config_file config.yml
`;

    const pythonClient = `import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="none"
)

response = client.chat.completions.create(
    model="${recipe.model_name}",
    messages=[{"role": "user", "content": "Explain Pareto frontier optimization in distributed LLM serving."}],
    max_tokens=${recipe.workload?.output_tokens || 512},
    temperature=0.7
)

print(response.choices[0].message.content)
`;

    const codeByTab = {
        agent: agentBenchmarkScript,
        docker: dockerCommand,
        helm: helmValues,
        k8s: k8sManifest,
        python: pythonClient
    };
    const activeCode = codeByTab[activeTab] || agentBenchmarkScript;

    const filenameByTab = {
        agent: 'config.yml',
        docker: 'run-docker.sh',
        helm: 'helm-values.yaml',
        k8s: 'kuberay-cluster.yaml',
        python: 'client.py'
    };

    const langByTab = {
        agent: 'INFERENCE-PERF YAML',
        docker: 'BASH',
        helm: 'YAML',
        k8s: 'YAML',
        python: 'PYTHON'
    };

    const handleCopy = () => {
        navigator.clipboard?.writeText(activeCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleCopyImage = () => {
        if (!containerImage) return;
        navigator.clipboard?.writeText(containerImage);
        setCopiedImage(true);
        setTimeout(() => setCopiedImage(false), 2000);
    };

    const handleDownloadManifest = () => {
        const extMap = { agent: 'yml', docker: 'sh', helm: 'yaml', k8s: 'yaml', python: 'py' };
        const ext = extMap[activeTab] || 'txt';
        const filename = `${recipe.id}-${activeTab}.${ext}`;
        const blob = new Blob([activeCode], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadReportJson = () => {
        const reportPayload = {
            version: '0.2',
            id: recipe.id,
            recipe_name: recipe.recipe_name,
            model_name: recipe.model_name,
            model_family: recipe.model_family,
            workload_class: recipe.workload_class,
            hardware: recipe.hardware,
            stack: recipe.stack,
            workload: recipe.workload,
            metrics: recipe.metrics,
            sweep_points: recipe.sweep_points,
            cost_analysis: recipe.cost_analysis,
            provenance: {
                author: recipe.author,
                git_commit_sha: recipe.git_commit_sha,
                git_branch: recipe.git_branch,
                pull_request_url: recipe.pull_request_url,
                container_image: containerImage,
                created_at: recipe.created_at,
                verification_status: recipe.verification_status
            }
        };
        const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${recipe.id}-benchmark-report-v0.2.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleShareRecipeLink = () => {
        if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
            const shareUrl = `${window.location.origin}${window.location.pathname}?view=model-leaderboard&recipe=${recipe.id}`;
            navigator.clipboard.writeText(shareUrl);
            setCopiedRecipeLink(true);
            setTimeout(() => setCopiedRecipeLink(false), 2000);
        }
    };

    const wellLitPathLabel = recipe.well_lit_path
        ? (WELL_LIT_PATH_LABELS[recipe.well_lit_path] || recipe.well_lit_path)
        : null;

    return (
        <div
            className="fixed inset-0 z-[110] flex justify-end bg-zinc-950/45 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="surface-light bg-white border-l border-zinc-200 w-full max-w-2xl h-full flex flex-col p-6 shadow-2xl relative text-zinc-900 overflow-y-auto animate-in slide-in-from-right duration-300"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Close Button */}
                <button
                    onClick={onClose}
                    aria-label="Close recipe drawer"
                    className="absolute top-5 right-5 p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-start gap-3 mb-4 pr-10">
                    <div className="p-2.5 rounded-2xl bg-accent-50 text-accent-600 border border-accent-200 shrink-0">
                        <Terminal className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="neutral" size="xs">
                                {stackBrand}{stackVersion ? ` ${stackVersion}` : ''}
                            </Badge>
                            <StatusChip status={statusKey} size="xs" />
                            {stale && (
                                <Badge tone="warning" size="xs">
                                    <AlertTriangle className="w-3 h-3 mr-1 inline" />
                                    Stale run
                                </Badge>
                            )}
                        </div>
                        <h2 className="text-lg font-semibold text-zinc-900 tracking-tight truncate mt-0.5">{recipe.recipe_name}</h2>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 font-mono mt-0.5">
                            <span className="truncate">{recipe.model_name}</span>
                            <span className="text-zinc-300">·</span>
                            <span className="inline-flex items-center gap-1 text-zinc-700">
                                <Calendar className="w-3 h-3 text-zinc-500" />
                                {runDateLabel}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Author & Source Action Bar */}
                <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {recipe.author?.avatar_url ? (
                            <img src={recipe.author.avatar_url} alt="Author" className="w-8 h-8 rounded-full border border-zinc-200 object-cover shrink-0" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-white text-accent-700 border border-zinc-200 flex items-center justify-center font-semibold text-xs shrink-0">
                                {(recipe.author?.display_name || recipe.author?.username || 'E')[0].toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-xs font-semibold text-zinc-900 truncate">{recipe.author?.display_name || recipe.author?.username}</span>
                                <span className="text-micro text-zinc-600 font-mono">@{recipe.author?.github_id || recipe.author?.username}</span>
                            </div>
                            {recipe.author?.team && (
                                <div className="text-micro text-zinc-600">
                                    {recipe.author.team}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Share & GitHub CTA */}
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={handleShareRecipeLink}
                            className={cn(
                                'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer',
                                copiedRecipeLink
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-white hover:bg-zinc-100 text-zinc-700 border-zinc-200'
                            )}
                            title="Copy direct recipe deep-link to clipboard"
                        >
                            {copiedRecipeLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-zinc-500" />}
                            <span>{copiedRecipeLink ? 'Copied' : 'Share'}</span>
                        </button>

                        <a
                            href={githubUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-medium transition-colors"
                            title="Open recipe source code and PR on GitHub"
                        >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>GitHub</span>
                        </a>
                    </div>
                </div>

                {/* Well-lit Path Callout when present */}
                {recipe.well_lit_path && (
                    <div className="mb-4 p-3 rounded-2xl bg-accent-50/70 border border-accent-200 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                            <Route className="w-4 h-4 text-accent-600 shrink-0" />
                            <span className="text-zinc-800 truncate">
                                Reference architecture from the <strong className="font-semibold text-zinc-900">{wellLitPathLabel}</strong> well-lit path
                            </span>
                        </div>
                        <a
                            href={`?view=${recipe.well_lit_path}`}
                            onClick={(e) => {
                                if (onNavigate && !e.metaKey && !e.ctrlKey) {
                                    e.preventDefault();
                                    onClose();
                                    onNavigate(recipe.well_lit_path);
                                }
                            }}
                            className="shrink-0 font-semibold text-accent-700 hover:text-accent-900 underline decoration-accent-300 underline-offset-4"
                        >
                            Deploy with llm-d well-lit path →
                        </a>
                    </div>
                )}

                {/* Key Metrics Grid at Active Operating Point */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">Tok/s per chip</span>
                        <span className="text-sm font-semibold font-mono text-zinc-900">
                            {Math.round(tpsPerChip).toLocaleString()} <span className="text-tiny font-normal text-zinc-600">tok/s</span>
                        </span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            {Math.round(recipe.tokens_per_sec || 0).toLocaleString()} total @ {activeConcurrency}c
                        </span>
                    </div>
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">TTFT P50</span>
                        <span className="text-sm font-semibold font-mono text-zinc-900">
                            {recipe.ttft_p50 ? `${recipe.ttft_p50.toFixed(1)} ms` : 'Not reported'}
                        </span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            P99: {recipe.metrics?.ttft_ms?.p99 ? `${recipe.metrics.ttft_ms.p99.toFixed(1)} ms` : '—'}
                        </span>
                    </div>
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">TPOT P50</span>
                        <span className="text-sm font-semibold font-mono text-zinc-900">
                            {recipe.itl_p50 ? `${recipe.itl_p50.toFixed(1)} ms` : 'Not reported'}
                        </span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            P99: {recipe.metrics?.itl_ms?.p99 ? `${recipe.metrics.itl_ms.p99.toFixed(1)} ms` : '—'}
                        </span>
                    </div>
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">Cost / 1M tokens</span>
                        <span className="text-sm font-semibold font-mono text-emerald-700">
                            ${recipe.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3) || '0.000'}
                        </span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            {Math.round(recipe.cost_analysis?.tokens_per_dollar || 0).toLocaleString()} tok/$
                        </span>
                    </div>
                </div>

                {/* Operating Point & Concurrency Sweep Table */}
                {sweepPoints.length > 0 && (
                    <div className="bg-zinc-50/80 p-3.5 rounded-2xl border border-zinc-200 text-xs mb-3">
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                                <Activity className="w-4 h-4 text-accent-600" /> Concurrency sweep &amp; operating points
                            </h4>
                            <span className="text-micro font-mono text-zinc-600">
                                Active point: <strong className="text-accent-700">{activeConcurrency} concurrency</strong>
                            </span>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                            <table className="w-full text-left font-mono text-micro border-collapse">
                                <thead className="bg-zinc-100/80 text-zinc-700 font-semibold border-b border-zinc-200">
                                    <tr>
                                        <th className="py-1.5 px-2.5 font-semibold">Concurrency</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">QPS</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">Tok/s/chip</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">TTFT P50/P99</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">TPOT P50/P99</th>
                                        <th className="py-1.5 px-2.5 text-right font-semibold">$/1M</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {sweepPoints.map((pt) => {
                                        const isOperating = pt.concurrency === activeConcurrency;
                                        return (
                                            <tr
                                                key={pt.concurrency}
                                                className={cn(
                                                    isOperating
                                                        ? 'bg-accent-50/75 text-zinc-900 font-semibold'
                                                        : 'text-zinc-700 hover:bg-zinc-50'
                                                )}
                                            >
                                                <td className="py-1.5 px-2.5 whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <span>{pt.concurrency}c</span>
                                                        {isOperating && (
                                                            <span className="px-1.5 py-0.2 rounded-full bg-accent-600 text-white text-tiny font-sans font-semibold">
                                                                Active
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{pt.qps}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">
                                                    {Math.round(pt.tokens_per_sec_per_chip).toLocaleString()}
                                                </td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">
                                                    {pt.ttft_p50} / {pt.ttft_p99} ms
                                                </td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">
                                                    {pt.itl_p50} / {pt.itl_p99} ms
                                                </td>
                                                <td className="py-1.5 px-2.5 text-right tabular-nums text-emerald-700">
                                                    ${Number(pt.cost_per_1m).toFixed(3)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Serving Stack, Workload & Hardware Configuration */}
                <div className="space-y-3 mb-4">
                    <div className="bg-zinc-50/80 p-3.5 rounded-2xl border border-zinc-200 text-xs">
                        <h4 className="font-semibold text-zinc-900 mb-2 flex items-center gap-1.5">
                            <Layers className="w-4 h-4 text-accent-600" /> Serving stack & LLM flags
                        </h4>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs font-mono text-zinc-600">
                            <div>
                                Engine:{' '}
                                <span className="text-zinc-900 font-semibold">
                                    {stackBrand}{stackVersion ? ` (${stackVersion})` : ''}
                                </span>
                            </div>
                            <div>Parallelism: <span className="text-zinc-900 font-semibold">TP={recipe.stack?.tensor_parallel_size || 1}, PP={recipe.stack?.pipeline_parallel_size || 1}</span></div>
                            <div>Weight quant: <span className="text-accent-700 font-semibold">{recipe.stack?.quantization?.toUpperCase() || 'FP8'}</span></div>
                            <div>KV cache dtype: <span className="text-accent-700 font-semibold">{recipe.stack?.kv_cache_dtype || 'auto'}</span></div>
                            <div>Prefix caching: <span className="text-emerald-700 font-semibold">{recipe.stack?.prefix_caching ? (recipe.stack?.routing ? `Enabled (${recipe.stack.routing})` : 'Enabled') : 'Disabled'}</span></div>
                            <div>Speculative: <span className="text-zinc-900 font-semibold">{recipe.stack?.speculative_decoding?.enabled ? `Enabled (${recipe.stack?.speculative_decoding?.num_speculative_tokens || 4} tok)` : 'Disabled'}</span></div>
                            <div className="col-span-2 pt-1.5 border-t border-zinc-200/80 flex items-center justify-between gap-2">
                                <div className="truncate">
                                    Container:{' '}
                                    <span className={cn('font-semibold', containerImage ? 'text-zinc-900' : 'text-zinc-500')}>
                                        {containerImage || 'Not reported'}
                                    </span>
                                </div>
                                {containerImage && (
                                    <button
                                        type="button"
                                        onClick={handleCopyImage}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 bg-white text-tiny font-sans font-medium text-zinc-600 hover:text-zinc-900 cursor-pointer shrink-0"
                                        title="Copy container image URI"
                                    >
                                        {copiedImage ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                        <span>{copiedImage ? 'Copied' : 'Copy image'}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="bg-zinc-50/80 p-3.5 rounded-2xl border border-zinc-200 text-xs">
                        <h4 className="font-semibold text-zinc-900 mb-2 flex items-center gap-1.5">
                            <Gauge className="w-4 h-4 text-accent-600" /> Workload & traffic profile
                        </h4>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs font-mono text-zinc-600">
                            <div>Dataset: <span className="text-zinc-900 font-semibold">{recipe.workload?.dataset_name || 'Not reported'}</span></div>
                            <div>Workload class: <span className="text-zinc-900 font-semibold uppercase">{recipe.workload_class || 'chat'}</span></div>
                            <div>Input / Output: <span className="text-zinc-900 font-semibold">{recipe.workload?.input_tokens ?? '—'} ISL / {recipe.workload?.output_tokens ?? '—'} OSL</span></div>
                            <div>Active point: <span className="text-zinc-900 font-semibold">{activeConcurrency} streams ({recipe.operatingPoint?.qps ?? recipe.workload?.target_qps ?? '—'} QPS)</span></div>
                        </div>
                    </div>

                    <div className="bg-zinc-50/80 p-3.5 rounded-2xl border border-zinc-200 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                                <Cpu className="w-4 h-4 text-accent-600" /> Environment, provenance &amp; Git traceability
                            </h4>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDownloadReportJson}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-zinc-200 bg-white text-tiny font-sans font-medium text-zinc-700 hover:text-zinc-900 cursor-pointer"
                                    title="Download Benchmark Report v0.2 JSON artifact"
                                >
                                    <Download className="w-3 h-3 text-zinc-500" />
                                    <span>Report v0.2 JSON</span>
                                </button>
                                <a
                                    href="?view=benchmark-browser"
                                    onClick={(e) => {
                                        if (onNavigate && !e.metaKey && !e.ctrlKey) {
                                            e.preventDefault();
                                            onClose();
                                            onNavigate('benchmark-browser');
                                        }
                                    }}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-accent-200 bg-accent-50 text-tiny font-sans font-semibold text-accent-700 hover:bg-accent-100 cursor-pointer"
                                    title="Inspect raw benchmark telemetry in Explorer"
                                >
                                    <Compass className="w-3 h-3 text-accent-600" />
                                    <span>View in Explorer →</span>
                                </a>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs font-mono text-zinc-600">
                            <div>Hardware: <span className="text-zinc-900 font-semibold">{recipe.hardware?.accelerator_count || 1}× {({
                                'nvidia-h100-80gb': 'H100',
                                'nvidia-a100-80gb': 'A100',
                                'nvidia-a100-40gb': 'A100 40GB',
                                'nvidia-l4': 'L4',
                                'tpu-v6e-trillium': 'TPU v6e',
                                'tpu-v5e': 'TPU v5e',
                            })[recipe.hardware?.accelerator_type] || recipe.hardware_summary}</span></div>
                            <div>Cluster hourly: <span className="text-emerald-700 font-semibold">${recipe.cost_analysis?.hourly_rate_usd?.toFixed(2) || '0.00'}/hr</span></div>
                            <div>Run date: <span className="text-zinc-900 font-semibold">{runDateLabel}</span></div>
                            <div className="flex items-center gap-1">
                                <GitCommit className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Commit: <strong className="text-zinc-900">{gitCommitSha}</strong></span>
                            </div>
                            <div className="flex items-center gap-1">
                                <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Branch: <strong className="text-zinc-900">{recipe.git_branch || 'Not reported'}</strong></span>
                            </div>
                            {recipe.pull_request_url && (
                                <div className="col-span-2 flex items-center gap-1.5 text-accent-700 pt-0.5">
                                    <GitPullRequest className="w-3.5 h-3.5" />
                                    <a href={recipe.pull_request_url} target="_blank" rel="noreferrer" className="hover:underline truncate flex items-center gap-1">
                                        <span>PR: {recipe.pull_request_url.replace('https://github.com/', '')}</span>
                                        <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Reproduction & Deploy Code Tabs */}
                <div className="flex-1 flex flex-col min-h-0 mb-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5">
                        <div className="flex flex-wrap items-center gap-1 p-1 bg-zinc-100 rounded-xl border border-zinc-200">
                            {[
                                { key: 'agent', label: 'inference-perf YAML' },
                                { key: 'docker', label: 'Docker' },
                                { key: 'helm', label: 'Helm' },
                                { key: 'k8s', label: 'Kubernetes' },
                                { key: 'python', label: 'Python' }
                            ].map(tab => (
                                <button
                                    key={tab.key}
                                    onClick={() => setActiveTab(tab.key)}
                                    className={cn(
                                        'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer',
                                        activeTab === tab.key
                                            ? 'bg-white text-zinc-900 shadow-xs font-semibold'
                                            : 'text-zinc-600 hover:text-zinc-900'
                                    )}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {activeTab === 'agent' && (
                        <div className="mb-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between gap-2 font-mono text-xs text-zinc-700">
                            <span className="truncate">
                                Run command: <strong className="text-zinc-900">inference-perf --config_file config.yml</strong>
                            </span>
                        </div>
                    )}

                    {/* Code Window Container */}
                    <div className="flex-1 flex flex-col rounded-2xl border border-zinc-200 bg-zinc-950 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900 border-b border-zinc-800 text-xs">
                            <div className="flex items-center gap-2 font-mono text-xs text-zinc-300">
                                <span>{filenameByTab[activeTab]}</span>
                                <span className="text-tiny font-semibold px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                                    {langByTab[activeTab]}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownloadManifest}
                                    className="flex items-center gap-1 text-xs text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded-lg border border-zinc-700 transition-colors cursor-pointer"
                                    title={`Download ${filenameByTab[activeTab]} to disk`}
                                >
                                    <Download className="w-3 h-3" />
                                    <span>Download</span>
                                </button>
                                <button
                                    onClick={handleCopy}
                                    className={cn(
                                        'flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-all cursor-pointer font-medium',
                                        copied
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                            : 'bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700'
                                    )}
                                    title="Copy code to clipboard"
                                >
                                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 p-4 font-mono text-xs text-zinc-200 overflow-y-auto select-all whitespace-pre leading-relaxed">
                            {activeCode}
                        </div>
                    </div>
                </div>

                {/* Footer with Challenge / Flag CTA */}
                <div className="pt-3 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-3">
                    {onOpenFeedback ? (
                        <button
                            type="button"
                            onClick={() => onOpenFeedback('flag_recipe', recipe)}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-amber-700 transition-colors cursor-pointer"
                        >
                            <Flag className="w-3.5 h-3.5 text-amber-600" />
                            <span>Numbers or workload look off? Challenge or flag this run</span>
                        </button>
                    ) : <span />}
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}
