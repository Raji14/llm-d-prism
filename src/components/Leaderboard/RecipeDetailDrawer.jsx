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
    GitBranch,
    GitPullRequest,
    GitCommit,
    ExternalLink,
    Flag,
    Gauge,
    AlertTriangle,
    Calendar,
    Route,
    Activity,
    Compass,
    Database,
    Info
} from 'lucide-react';
import { formatRunDate, isStaleRun } from '../../utils/runParity.js';
import {
    DEFAULT_SLO,
    describeSlo,
    engineLabel,
    formatHardwareShort,
    formatQps,
    provenanceStatus,
} from '../../utils/leaderboardFacets.js';
import { Button } from '../ui/Button.jsx';
import { Badge, StatusChip } from '../ui/Badge.jsx';
import { cn } from '../../utils/cn';

const WELL_LIT_PATH_LABELS = {
    'inference-scheduling': 'Intelligent routing',
    'prefix-cache-offloading': 'Prefix cache offloading',
    'agentic-serving': 'Agentic serving',
    'pd-disaggregation': 'Prefill/decode disaggregation'
};

const NOT_REPORTED = 'Not reported';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const fmtMs = (v) => (isNum(v) ? `${v.toFixed(1)} ms` : '—');
const fmtInt = (v) => (isNum(v) ? Math.round(v).toLocaleString() : '—');
const fmtCost = (v) => (isNum(v) ? `$${v.toFixed(3)}` : '—');
// What a template shows for a value the run didn't record.
const orPlaceholder = (v, name) => (v == null || v === '' ? `<${name}>` : v);

export default function RecipeDetailDrawer({
    isOpen,
    onClose,
    recipe,
    latencyPercentile = DEFAULT_SLO.percentile,
    slo = DEFAULT_SLO,
    onOpenFeedback,
    onNavigate
}) {
    const [activeTab, setActiveTab] = useState('agent');
    const [copied, setCopied] = useState(false);
    const [copiedImage, setCopiedImage] = useState(false);
    const [copiedRecipeLink, setCopiedRecipeLink] = useState(false);
    // The load point being previewed, tied to the recipe it was picked on so a
    // different recipe always opens on its own operating point.
    const [preview, setPreview] = useState({ recipeId: null, index: null });

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

    const pct = latencyPercentile;
    const pctLabel = String(pct).toUpperCase();
    const status = provenanceStatus(recipe);
    const isSample = Boolean(recipe.is_sample);
    const resultsStore = recipe.results_store || null;

    const githubUrl = recipe.pull_request_url || null;
    const containerImage = recipe.container_image || recipe.stack?.container_image || null;
    const gitCommitSha = recipe.git_commit_sha || NOT_REPORTED;
    const runDateLabel = formatRunDate(recipe.created_at) || 'Date not reported';
    const stale = isStaleRun(recipe);
    const stackBrand = engineLabel(recipe.stack?.engine);
    const stackVersion = recipe.stack?.engine_version && recipe.stack.engine_version !== 'latest'
        ? recipe.stack.engine_version
        : null;

    const sweepPoints = Array.isArray(recipe.sweep_points) ? recipe.sweep_points : [];
    const operatingIndex = recipe.operatingPoint ? sweepPoints.indexOf(recipe.operatingPoint) : -1;
    const previewIndex = preview.recipeId === recipe.id && preview.index != null && sweepPoints[preview.index] ? preview.index : null;
    const isPreviewing = previewIndex != null && previewIndex !== operatingIndex;
    const shownPoint = (isPreviewing ? sweepPoints[previewIndex] : recipe.operatingPoint) || {};
    const shownConcurrency = shownPoint.concurrency ?? recipe.operatingConcurrency ?? null;
    const shownQps = shownPoint.qps ?? null;
    const estimated = Boolean(shownPoint.total_estimated);
    const hasP90 = sweepPoints.some((pt) => isNum(pt.ttft_p90) || isNum(pt.itl_p90));
    const tailPct = pct === 'p99' ? (hasP90 ? 'p90' : 'p50') : 'p99';

    const selectPoint = (index) => setPreview({ recipeId: recipe.id, index: index === operatingIndex ? null : index });

    const tp = recipe.stack?.tensor_parallel_size || null;
    const pp = recipe.stack?.pipeline_parallel_size || null;
    const quant = recipe.stack?.quantization || null;
    const kvDtype = recipe.stack?.kv_cache_dtype || null;
    const prefixCaching = recipe.stack?.prefix_caching;
    const chips = Math.max(1, recipe.hardware?.accelerator_count || 1);
    const accType = recipe.hardware?.accelerator_type && recipe.hardware.accelerator_type !== 'other'
        ? recipe.hardware.accelerator_type
        : null;
    const isTpu = Boolean(accType?.includes('tpu'));
    const isl = recipe.workload?.input_tokens ?? null;
    const osl = recipe.workload?.output_tokens ?? null;

    const templateNote = '# Template from what this run recorded. <placeholders> mark values it didn\'t record.';

    const dockerCommand = recipe.reproduction_command || [
        templateNote,
        `docker run --gpus all -p 8000:8000 ${orPlaceholder(containerImage, 'container-image')} \\`,
        `  --model ${recipe.model_name} \\`,
        `  --tensor-parallel-size ${orPlaceholder(tp, 'tensor-parallel-size')}${quant ? ` \\\n  --quantization ${quant}` : ''}`,
    ].join('\n');

    const helmValues = `# Helm values for deploying ${recipe.recipe_name}
${templateNote}
replicaCount: 1
image:
  repository: ${containerImage ? containerImage.split(':')[0] : '<container-repository>'}
  tag: ${containerImage && containerImage.includes(':') ? containerImage.split(':')[1] : orPlaceholder(stackVersion, 'tag')}
model:
  name: "${recipe.model_name}"
  tensorParallelSize: ${orPlaceholder(tp, 'tensor-parallel-size')}
  pipelineParallelSize: ${orPlaceholder(pp, 'pipeline-parallel-size')}
  quantization: "${orPlaceholder(quant, 'quantization')}"
  kvCacheDtype: "${orPlaceholder(kvDtype, 'kv-cache-dtype')}"
  prefixCaching: ${prefixCaching == null ? '<prefix-caching>' : prefixCaching ? 'true' : 'false'}
resources:
  limits:
    ${isTpu ? 'google.com/tpu' : 'nvidia.com/gpu'}: ${chips}
`;

    const k8sManifest = `# KubeRay / GKE reference manifest
${templateNote}
apiVersion: ray.io/v1
kind: RayCluster
metadata:
  name: llmd-${String(recipe.model_family || 'serving').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-cluster
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
          image: ${orPlaceholder(containerImage, 'container-image')}
          resources:
            limits:
              cpu: "8"
              memory: "32Gi"
  workerGroupSpecs:
  - groupName: accelerator-worker
    replicas: ${chips > 8 ? Math.ceil(chips / 8) : 1}
    template:
      spec:
        nodeSelector:
          cloud.google.com/gke-accelerator: ${orPlaceholder(accType, 'accelerator')}
        containers:
        - name: ray-worker
          image: ${orPlaceholder(containerImage, 'container-image')}
          env:
          - name: MODEL_NAME
            value: "${recipe.model_name}"
          - name: TENSOR_PARALLEL_SIZE
            value: "${orPlaceholder(tp, 'tensor-parallel-size')}"
          - name: QUANTIZATION
            value: "${orPlaceholder(quant, 'quantization')}"
          resources:
            limits:
              ${isTpu ? 'google.com/tpu' : 'nvidia.com/gpu'}: ${Math.min(8, chips)}
              memory: "128Gi"
`;

    const agentBenchmarkScript = `# config.yml — kubernetes-sigs/inference-perf
${templateNote}
server:
  type: vllm
  model_name: ${recipe.model_name}
  base_url: http://localhost:8000
tokenizer:
  pretrained_model_name_or_path: ${recipe.model_name}
data:
  type: ${orPlaceholder(recipe.workload?.dataset_name ? 'shareGPT' : null, 'dataset')}
  input_distribution:
    mean: ${orPlaceholder(isl, 'prompt-length')}
  output_distribution:
    mean: ${orPlaceholder(osl, 'output-length')}
load:
  type: constant
  stages:
    - rate: ${orPlaceholder(shownQps, 'requests-per-second')}${shownConcurrency != null ? `  # measured at ${shownConcurrency} concurrent requests` : ''}
      duration: 120
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
    max_tokens=${osl || 512},
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
            source: isSample ? 'illustrative-sample' : recipe.source,
            recipe_name: recipe.recipe_name,
            model_name: recipe.model_name,
            model_family: recipe.model_family,
            workload_class: recipe.workload_class,
            hardware: recipe.hardware,
            stack: recipe.stack,
            workload: recipe.workload,
            operating_point: { slo: describeSlo(slo), ...recipe.operatingPoint },
            sweep_points: recipe.sweep_points,
            cost_analysis: recipe.cost_analysis,
            provenance: {
                author: recipe.author,
                git_commit_sha: recipe.git_commit_sha,
                git_branch: recipe.git_branch,
                pull_request_url: recipe.pull_request_url,
                container_image: containerImage,
                created_at: recipe.created_at,
                status,
                results_store: resultsStore,
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

    // The page URL already carries this recipe and the active SLO.
    const handleShareRecipeLink = () => {
        if (typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
            navigator.clipboard.writeText(window.location.href);
            setCopiedRecipeLink(true);
            setTimeout(() => setCopiedRecipeLink(false), 2000);
        }
    };

    const navigateTo = (view) => (e) => {
        if (onNavigate && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onClose();
            onNavigate(view);
        }
    };

    const wellLitPathLabel = recipe.well_lit_path
        ? (WELL_LIT_PATH_LABELS[recipe.well_lit_path] || recipe.well_lit_path)
        : null;

    const stackField = (value) => (
        <span className={cn('font-semibold', value === NOT_REPORTED ? 'text-zinc-500' : 'text-zinc-900')}>{value}</span>
    );

    return (
        <div
            className="fixed inset-0 z-[110] flex justify-end bg-zinc-950/45 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="surface-light bg-white border-l border-zinc-200 w-full max-w-2xl h-full flex flex-col p-6 shadow-2xl relative text-zinc-900 overflow-y-auto animate-in slide-in-from-right duration-300"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={`${recipe.recipe_name} details`}
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
                            <StatusChip status={status} size="xs" />
                            {recipe.missesSlo && <StatusChip status="misses_slo" size="xs" />}
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

                {/* Where these numbers come from */}
                {isSample && (
                    <div className="mb-4 p-3 rounded-2xl bg-zinc-50 border border-zinc-300 flex items-start gap-2.5 text-xs text-zinc-800" role="note">
                        <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
                        <span>
                            <strong className="font-semibold text-zinc-900">Illustrative sample, not a measured run.</strong>{' '}
                            It ships with Prism to show how ranking, SLOs and comparisons work. Its numbers, curve, author and
                            provenance are illustrative, so don&apos;t quote them.
                        </span>
                    </div>
                )}
                {resultsStore && (
                    <div className="mb-4 p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs text-emerald-950" role="note">
                        <span className="flex items-start gap-2 min-w-0">
                            <Database className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>
                                <strong className="font-semibold">{status === 'official' ? 'Official' : 'Published'} result from the Results Store</strong>
                                {` · ${resultsStore.pointCount} measured ${resultsStore.pointCount === 1 ? 'point' : 'points'}`}
                                {resultsStore.overloadedCount > 0 ? `, ${resultsStore.overloadedCount} overloaded (kept out of ranking)` : ''}
                                {' · saved in this browser only'}
                                {resultsStore.lineage?.approvedBy && (
                                    <span className="block mt-0.5 text-emerald-900">
                                        {status === 'official' ? 'Marked official by ' : 'Approved by '}
                                        <span className="font-semibold">{resultsStore.lineage.approvedBy}</span>
                                        {formatRunDate(resultsStore.lineage.approvedAt) ? ` on ${formatRunDate(resultsStore.lineage.approvedAt)}` : ''}
                                        {resultsStore.lineage.askedBy ? `${status === 'official' ? ' · requested by ' : ' · submitted by '}${resultsStore.lineage.askedBy}` : ''}
                                    </span>
                                )}
                            </span>
                        </span>
                        <a
                            href={`?view=results-store&curve=${encodeURIComponent(resultsStore.curveId)}`}
                            onClick={(e) => {
                                if (!onNavigate || e.metaKey || e.ctrlKey) return;
                                e.preventDefault();
                                onClose();
                                onNavigate('results-store', { curve: resultsStore.curveId });
                            }}
                            className="shrink-0 font-semibold text-emerald-800 hover:text-emerald-950 underline decoration-emerald-300 underline-offset-4"
                        >
                            Open in Results Store →
                        </a>
                    </div>
                )}

                {/* Author & Source Action Bar */}
                <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200 flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5 min-w-0">
                        {recipe.author?.avatar_url ? (
                            <img src={recipe.author.avatar_url} alt="Author" className="w-8 h-8 rounded-full border border-zinc-200 object-cover shrink-0" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-white text-accent-700 border border-zinc-200 flex items-center justify-center font-semibold text-xs shrink-0">
                                {(recipe.author?.display_name || recipe.author?.username || '?')[0].toUpperCase()}
                            </div>
                        )}
                        <div className="min-w-0">
                            {recipe.author ? (
                                <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold text-zinc-900 truncate">{recipe.author.display_name || recipe.author.username}</span>
                                    {(recipe.author.github_id || recipe.author.username) && (
                                        <span className="text-micro text-zinc-600 font-mono">@{recipe.author.github_id || recipe.author.username}</span>
                                    )}
                                </div>
                            ) : (
                                <span className="text-xs font-medium text-zinc-500">Contributor not recorded</span>
                            )}
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
                            title="Copy a link to this recipe at the current SLO"
                        >
                            {copiedRecipeLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-zinc-500" />}
                            <span>{copiedRecipeLink ? 'Copied' : 'Share'}</span>
                        </button>

                        {githubUrl && (
                            <a
                                href={githubUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900 hover:bg-zinc-700 text-white text-xs font-medium transition-colors"
                                title="Open the pull request behind this recipe"
                            >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>GitHub</span>
                            </a>
                        )}
                    </div>
                </div>

                {/* Well-lit Path Callout when present */}
                {recipe.well_lit_path && (
                    <div className="mb-4 p-3 rounded-2xl bg-accent-50/70 border border-accent-200 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                            <Route className="w-4 h-4 text-accent-600 shrink-0" />
                            <span className="text-zinc-800 truncate">
                                {isSample ? 'Illustrates' : 'Reference architecture from'} the <strong className="font-semibold text-zinc-900">{wellLitPathLabel}</strong> well-lit path
                            </span>
                        </div>
                        <a
                            href={`?view=${recipe.well_lit_path}`}
                            onClick={navigateTo(recipe.well_lit_path)}
                            className="shrink-0 font-semibold text-accent-700 hover:text-accent-900 underline decoration-accent-300 underline-offset-4"
                        >
                            Deploy with llm-d well-lit path →
                        </a>
                    </div>
                )}

                {/* Previewing a different load point */}
                {isPreviewing && (
                    <div className="mb-2.5 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-xs text-amber-950">
                        <span>
                            Previewing <strong className="font-semibold">{shownConcurrency != null ? `${shownConcurrency} concurrent` : 'another load point'}</strong>.
                            The table ranks this run at {recipe.operatingConcurrency != null ? `${recipe.operatingConcurrency} concurrent` : 'its operating point'}.
                        </span>
                        <button
                            type="button"
                            onClick={() => setPreview({ recipeId: recipe.id, index: null })}
                            className="shrink-0 font-semibold underline underline-offset-2 cursor-pointer"
                        >
                            Back to operating point
                        </button>
                    </div>
                )}

                {/* Key metrics at the operating point (or the previewed point) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200" title={estimated ? 'Estimated from the output rate and the prompt and output lengths' : undefined}>
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">Tok/s per chip</span>
                        <span className="text-sm font-semibold font-mono text-zinc-900">
                            {estimated && <span className="text-zinc-500 font-normal">≈</span>}
                            {fmtInt(shownPoint.tokens_per_sec_per_chip)} <span className="text-tiny font-normal text-zinc-600">tok/s</span>
                        </span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            {fmtInt(shownPoint.tokens_per_sec)} total{shownConcurrency != null ? ` @ ${shownConcurrency}c` : ''}
                        </span>
                    </div>
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">TTFT {pctLabel}</span>
                        <span className="text-sm font-semibold font-mono text-zinc-900">{fmtMs(shownPoint[`ttft_${pct}`])}</span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            {tailPct.toUpperCase()}: {fmtMs(shownPoint[`ttft_${tailPct}`])}
                        </span>
                    </div>
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200">
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">TPOT {pctLabel}</span>
                        <span className="text-sm font-semibold font-mono text-zinc-900">{fmtMs(shownPoint[`itl_${pct}`])}</span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            {tailPct.toUpperCase()}: {fmtMs(shownPoint[`itl_${tailPct}`])}
                        </span>
                    </div>
                    <div className="bg-zinc-50 p-3 rounded-2xl border border-zinc-200" title={isNum(shownPoint.cost_per_1m) ? undefined : 'No list price for this accelerator. Set your own rate under Pricing.'}>
                        <span className="text-tiny text-zinc-600 font-semibold uppercase tracking-wider block">Cost / 1M tokens</span>
                        <span className={cn('text-sm font-semibold font-mono', isNum(shownPoint.cost_per_1m) ? 'text-emerald-700' : 'text-zinc-500')}>
                            {fmtCost(shownPoint.cost_per_1m)}
                        </span>
                        <span className="text-tiny font-mono text-zinc-600 block mt-0.5">
                            {isNum(shownPoint.tokens_per_dollar) ? `${fmtInt(shownPoint.tokens_per_dollar)} tok/$` : 'No list price'}
                        </span>
                    </div>
                </div>

                {/* Load sweep: every point the run was measured (or, for samples, illustrated) at */}
                {sweepPoints.length > 0 && (
                    <div className="bg-zinc-50/80 p-3.5 rounded-2xl border border-zinc-200 text-xs mb-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                            <h4 className="font-semibold text-zinc-900 flex items-center gap-1.5">
                                <Activity className="w-4 h-4 text-accent-600" /> Load sweep &amp; operating point
                            </h4>
                            <span className="text-micro font-mono text-zinc-600">
                                Ranked within {describeSlo(slo)} · click a row to preview
                            </span>
                        </div>
                        {isSample && (
                            <p className="text-micro text-zinc-600 mb-2">
                                Illustrative curve: drawn below the sample&apos;s stated point, never above it.
                            </p>
                        )}
                        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
                            <table className="w-full text-left font-mono text-micro border-collapse">
                                <thead className="bg-zinc-100/80 text-zinc-700 font-semibold border-b border-zinc-200">
                                    <tr>
                                        <th className="py-1.5 px-2.5 font-semibold">Load</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">QPS</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">Tok/s/chip</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">TTFT {pctLabel}</th>
                                        <th className="py-1.5 px-2 text-right font-semibold">TPOT {pctLabel}</th>
                                        <th className="py-1.5 px-2.5 text-right font-semibold">$/1M</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100">
                                    {sweepPoints.map((pt, index) => {
                                        const isOperating = index === operatingIndex;
                                        const isShown = isPreviewing ? index === previewIndex : isOperating;
                                        return (
                                            <tr
                                                key={`${pt.concurrency ?? 'pt'}-${index}`}
                                                onClick={() => selectPoint(index)}
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        selectPoint(index);
                                                    }
                                                }}
                                                aria-selected={isShown}
                                                className={cn(
                                                    'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-500',
                                                    isShown ? 'bg-accent-50/75 text-zinc-900 font-semibold' : 'text-zinc-700 hover:bg-zinc-50',
                                                    pt.overloaded && 'text-zinc-500'
                                                )}
                                                title={[
                                                    `P99 TTFT ${fmtMs(pt.ttft_p99)} · P99 TPOT ${fmtMs(pt.itl_p99)}`,
                                                    pt.overloaded ? 'Overloaded: latency jumped for little extra throughput, so it never ranks' : null,
                                                ].filter(Boolean).join('\n')}
                                            >
                                                <td className="py-1.5 px-2.5 whitespace-nowrap">
                                                    <div className="inline-flex items-center gap-1.5">
                                                        <span>{pt.concurrency != null ? `${pt.concurrency}c` : '—'}</span>
                                                        {isOperating && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-accent-600 text-white text-tiny font-sans font-semibold">
                                                                Ranked here
                                                            </span>
                                                        )}
                                                        {pt.overloaded && (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-tiny font-sans font-semibold">
                                                                Overloaded
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{formatQps(pt.qps) ?? '—'}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">
                                                    {pt.total_estimated && <span className="text-zinc-400">≈</span>}
                                                    {fmtInt(pt.tokens_per_sec_per_chip)}
                                                </td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{fmtMs(pt[`ttft_${pct}`])}</td>
                                                <td className="py-1.5 px-2 text-right tabular-nums">{fmtMs(pt[`itl_${pct}`])}</td>
                                                <td className="py-1.5 px-2.5 text-right tabular-nums text-emerald-700">{fmtCost(pt.cost_per_1m)}</td>
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
                            <Layers className="w-4 h-4 text-accent-600" /> Serving stack &amp; LLM flags
                        </h4>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs font-mono text-zinc-600">
                            <div>Engine: {stackField(recipe.stack?.engine ? `${stackBrand}${stackVersion ? ` (${stackVersion})` : ''}` : NOT_REPORTED)}</div>
                            <div>Parallelism: {stackField(tp ? `TP=${tp}${pp ? `, PP=${pp}` : ''}` : NOT_REPORTED)}</div>
                            <div>Weight quant: {stackField(quant ? String(quant).toUpperCase() : NOT_REPORTED)}</div>
                            <div>KV cache dtype: {stackField(kvDtype || NOT_REPORTED)}</div>
                            <div>Prefix caching: {stackField(prefixCaching == null ? NOT_REPORTED : prefixCaching ? (recipe.stack?.routing ? `Enabled (${recipe.stack.routing})` : 'Enabled') : 'Disabled')}</div>
                            <div>Speculative: {stackField(!recipe.stack?.speculative_decoding ? NOT_REPORTED : recipe.stack.speculative_decoding.enabled ? `Enabled${recipe.stack.speculative_decoding.num_speculative_tokens ? ` (${recipe.stack.speculative_decoding.num_speculative_tokens} tok)` : ''}` : 'Disabled')}</div>
                            <div className="col-span-2 pt-1.5 border-t border-zinc-200/80 flex items-center justify-between gap-2">
                                <div className="truncate">
                                    Container:{' '}
                                    <span className={cn('font-semibold', containerImage ? 'text-zinc-900' : 'text-zinc-500')}>
                                        {containerImage || NOT_REPORTED}
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
                            <Gauge className="w-4 h-4 text-accent-600" /> Workload &amp; traffic profile
                        </h4>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs font-mono text-zinc-600">
                            <div>Dataset: {stackField(recipe.workload?.dataset_name || NOT_REPORTED)}</div>
                            <div>Workload class: <span className="text-zinc-900 font-semibold uppercase">{recipe.workload_class || 'chat'}</span></div>
                            <div>Input / Output: {stackField(isl != null || osl != null ? `${isl ?? '—'} ISL / ${osl ?? '—'} OSL` : NOT_REPORTED)}</div>
                            <div>Operating point: {stackField(recipe.operatingConcurrency != null ? `${recipe.operatingConcurrency} concurrent${isNum(recipe.operatingPoint?.qps) ? ` (${formatQps(recipe.operatingPoint.qps)} QPS)` : ''}` : NOT_REPORTED)}</div>
                            {recipe.fairness_audit?.harness && (
                                <div className="col-span-2">Harness: {stackField(recipe.fairness_audit.harness)}</div>
                            )}
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
                                    title="Download this entry, its load sweep and its operating point as JSON"
                                >
                                    <Download className="w-3 h-3 text-zinc-500" />
                                    <span>Report v0.2 JSON</span>
                                </button>
                                <a
                                    href="?view=benchmark-browser"
                                    onClick={navigateTo('benchmark-browser')}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-accent-200 bg-accent-50 text-tiny font-sans font-semibold text-accent-700 hover:bg-accent-100 cursor-pointer"
                                    title="Inspect raw benchmark telemetry in Explorer"
                                >
                                    <Compass className="w-3 h-3 text-accent-600" />
                                    <span>View in Explorer →</span>
                                </a>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs font-mono text-zinc-600">
                            <div>Hardware: <span className="text-zinc-900 font-semibold">{formatHardwareShort(recipe)}</span></div>
                            <div>
                                Cluster hourly:{' '}
                                <span className={cn('font-semibold', isNum(recipe.cost_analysis?.hourly_rate_usd) ? 'text-emerald-700' : 'text-zinc-500')}>
                                    {isNum(recipe.cost_analysis?.hourly_rate_usd) ? `$${recipe.cost_analysis.hourly_rate_usd.toFixed(2)}/hr` : 'No list price'}
                                </span>
                            </div>
                            <div>Run date: <span className="text-zinc-900 font-semibold">{runDateLabel}</span></div>
                            <div className="flex items-center gap-1">
                                <GitCommit className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Commit: <strong className={gitCommitSha === NOT_REPORTED ? 'text-zinc-500' : 'text-zinc-900'}>{gitCommitSha}</strong></span>
                            </div>
                            <div className="flex items-center gap-1">
                                <GitBranch className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Branch: <strong className={recipe.git_branch ? 'text-zinc-900' : 'text-zinc-500'}>{recipe.git_branch || NOT_REPORTED}</strong></span>
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

                {/* Reproduction & Deploy Code Tabs. The drawer scrolls as a flex
                    column: a floor keeps this from shrinking under the footer on
                    short screens, and flex-1 still fills tall ones. */}
                <div className="flex-1 flex flex-col min-h-[20rem] mb-4">
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
                        {isPreviewing && activeTab === 'agent' && (
                            <span className="text-micro font-mono text-amber-800">Load set to the previewed point</span>
                        )}
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
                    {onOpenFeedback && !isSample ? (
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
