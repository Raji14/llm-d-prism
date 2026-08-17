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
import { X, Award, Copy, Check, Terminal, Cpu, Layers, DollarSign, Zap, ShieldCheck, FileCode, GitBranch, GitPullRequest, GitCommit, ExternalLink } from 'lucide-react';
import { TIER_CONFIG } from '../../utils/gamificationEngine.js';

export default function RecipeDetailDrawer({ isOpen, onClose, recipe, onOpenCertificate }) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen || !recipe) return null;

    const [activeTab, setActiveTab] = useState('docker');
    const [copied, setCopied] = useState(false);

    const tier = recipe.tier || 'Explorer';
    const tierConfig = TIER_CONFIG[tier] || TIER_CONFIG.Explorer;

    const dockerCommand = recipe.reproduction_command || `docker run --gpus all -p 8000:8000 ghcr.io/llm-d/serving:latest --model ${recipe.model_name} --tp ${recipe.stack?.tensor_parallel_size || 8} --quantization ${recipe.stack?.quantization || 'fp8'}`;

    const helmValues = `# Helm values for deploying ${recipe.recipe_name}
replicaCount: 1
image:
  repository: ghcr.io/llm-d/serving
  tag: ${recipe.stack?.engine_version || 'latest'}
model:
  name: "${recipe.model_name}"
  tensorParallelSize: ${recipe.stack?.tensor_parallel_size || 8}
  pipelineParallelSize: ${recipe.stack?.pipeline_parallel_size || 1}
  quantization: "${recipe.stack?.quantization || 'fp8'}"
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
          image: ghcr.io/llm-d/serving:${recipe.stack?.engine_version || 'latest'}
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
          image: ghcr.io/llm-d/serving:${recipe.stack?.engine_version || 'latest'}
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

    const pythonClient = `import openai

client = openai.OpenAI(
    base_url="http://localhost:8000/v1",
    api_key="none"
)

response = client.chat.completions.create(
    model="${recipe.model_name}",
    messages=[{"role": "user", "content": "Explain Pareto frontier optimization in distributed LLM serving."}],
    max_tokens=512,
    temperature=0.7
)

print(response.choices[0].message.content)
`;

    const activeCode = activeTab === 'docker' ? dockerCommand : (activeTab === 'helm' ? helmValues : (activeTab === 'k8s' ? k8sManifest : pythonClient));

    const handleCopy = () => {
        navigator.clipboard.writeText(activeCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-slate-900 border-l border-slate-700/80 w-full max-w-xl h-full flex flex-col p-6 shadow-2xl relative text-slate-200 overflow-y-auto">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                    <X className="w-5 h-5" />
                </button>

                {/* Header */}
                <div className="flex items-start gap-3 mb-5 pr-8">
                    <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shrink-0">
                        <Terminal className="w-6 h-6" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${tierConfig.badgeBg} ${tierConfig.badgeBorder} ${tierConfig.badgeText}`}>
                                {tier}
                            </span>
                            {recipe.isParetoOptimal && (
                                <span className="text-amber-300 text-[10px] font-bold">
                                    ★ Pareto SOTA
                                </span>
                            )}
                            <span className="text-slate-400 text-[10px] font-mono">
                                • {recipe.benchmark_scope === 'unit' ? 'Microbenchmark' : 'System E2E'}
                            </span>
                        </div>
                        <h2 className="text-base font-bold text-white mt-1 truncate">{recipe.recipe_name}</h2>
                        <p className="text-xs text-slate-400 font-mono truncate">{recipe.model_name}</p>
                    </div>
                </div>

                {/* Author Card */}
                <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                        {recipe.author?.avatar_url ? (
                            <img src={recipe.author.avatar_url} alt="Author" className="w-8 h-8 rounded-full border border-slate-700 object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center font-bold text-xs text-slate-300">
                                {(recipe.author?.username || 'E')[0].toUpperCase()}
                            </div>
                        )}
                        <div>
                            <div className="text-xs font-semibold text-white">{recipe.author?.display_name || recipe.author?.username}</div>
                            <div className="text-[10px] text-slate-500">{recipe.author?.team || 'Field Engineer'} • @{recipe.author?.github_id || recipe.author?.username}</div>
                        </div>
                    </div>
                    <button
                        onClick={() => onOpenCertificate && onOpenCertificate(recipe)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-semibold border border-amber-500/40 transition-colors cursor-pointer"
                    >
                        <Award className="w-3.5 h-3.5" />
                        <span>Certificate</span>
                    </button>
                </div>

                {/* Git Commit & Traceability Card */}
                <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs mb-4">
                    <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                        <GitBranch className="w-3.5 h-3.5 text-purple-400" /> Git Source & PR Traceability
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                        <div className="flex items-center gap-1.5">
                            <GitCommit className="w-3 h-3 text-slate-500" />
                            <span>Commit: <strong className="text-cyan-300">{recipe.git_commit_sha || 'main-HEAD'}</strong></span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3 text-slate-500" />
                            <span>Branch: <strong className="text-slate-200">{recipe.git_branch || 'main'}</strong></span>
                        </div>
                        {recipe.pull_request_url ? (
                            <div className="col-span-2 flex items-center gap-1.5 text-purple-400">
                                <GitPullRequest className="w-3 h-3" />
                                <a href={recipe.pull_request_url} target="_blank" rel="noreferrer" className="hover:underline truncate flex items-center gap-1">
                                    <span>Pull Request: {recipe.pull_request_url.replace('https://github.com/', '')}</span>
                                    <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">TTFT P50</span>
                        <span className="text-sm font-bold font-mono text-cyan-300">{recipe.ttft_p50 ? `${recipe.ttft_p50.toFixed(1)} ms` : 'N/A'}</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Throughput</span>
                        <span className="text-sm font-bold font-mono text-amber-300">{Math.round(recipe.tokens_per_sec || 0).toLocaleString()} <span className="text-[10px] font-normal text-slate-400">tok/s</span></span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">$/1M Output</span>
                        <span className="text-sm font-bold font-mono text-emerald-300">${recipe.cost_analysis?.cost_per_1m_output_tokens_usd?.toFixed(3) || '0.00'}</span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-850">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Tokens / $</span>
                        <span className="text-sm font-bold font-mono text-emerald-400">{Math.round(recipe.cost_analysis?.tokens_per_dollar || 0).toLocaleString()}</span>
                    </div>
                </div>

                {/* Serving Stack & Hardware Configuration */}
                <div className="space-y-3 mb-4">
                    <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs">
                        <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                            <Layers className="w-3.5 h-3.5 text-purple-400" /> Serving Stack Architecture
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div>Engine: <span className="text-slate-200 font-bold">{recipe.stack?.engine?.toUpperCase()} ({recipe.stack?.engine_version || 'latest'})</span></div>
                            <div>TP / PP Size: <span className="text-slate-200 font-bold">TP={recipe.stack?.tensor_parallel_size || 1}, PP={recipe.stack?.pipeline_parallel_size || 1}</span></div>
                            <div>Quantization: <span className="text-cyan-300 font-bold">{recipe.stack?.quantization?.toUpperCase()}</span></div>
                            <div>KV Cache: <span className="text-cyan-300 font-bold">{recipe.stack?.kv_cache_dtype}</span></div>
                            <div>Prefix Caching: <span className="text-emerald-400 font-bold">{recipe.stack?.prefix_caching ? 'Enabled' : 'Disabled'}</span></div>
                            <div>Speculative: <span className="text-slate-200 font-bold">{recipe.stack?.speculative_decoding?.enabled ? 'Enabled' : 'None'}</span></div>
                        </div>
                    </div>

                    <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs">
                        <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                            <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Hardware & GCP Topology
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div>Hardware: <span className="text-slate-200 font-bold">{recipe.hardware_summary}</span></div>
                            <div>VM Type: <span className="text-slate-200 font-bold">{recipe.hardware?.machine_type || 'GCP Standard'}</span></div>
                            <div>Cluster Hourly: <span className="text-emerald-300 font-bold">${recipe.cost_analysis?.hourly_rate_usd?.toFixed(2)}/hr</span></div>
                            <div>Region: <span className="text-slate-200 font-bold">{recipe.hardware?.region || 'us-central1'}</span></div>
                        </div>
                    </div>

                    <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 text-xs">
                        <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-1.5">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Stability & Production Headroom
                        </h4>
                        <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                            <div>Peak VRAM: <span className="text-emerald-300 font-bold">{recipe.stability_telemetry?.peak_vram_pct || 78}%</span></div>
                            <div>OOM Concurrency Headroom: <span className="text-emerald-300 font-bold">{recipe.stability_telemetry?.oom_headroom_concurrency || 64} reqs</span></div>
                            <div>P99 Queue Dwell: <span className="text-cyan-300 font-bold">{recipe.stability_telemetry?.queue_dwell_p99_ms || 4.2} ms</span></div>
                            <div>KV Cache Usage: <span className="text-slate-200 font-bold">{recipe.metrics?.kv_cache_usage_pct || 75}%</span></div>
                        </div>
                    </div>
                </div>

                {/* Reproduction Code Tabs */}
                <div className="flex-1 flex flex-col min-h-0 mb-4">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            {['docker', 'helm', 'k8s', 'python'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`px-3 py-1 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                                        activeTab === tab
                                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    {tab === 'k8s' ? 'KubeRay K8s' : tab}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer"
                        >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                        </button>
                    </div>

                    <div className="flex-1 bg-slate-950 p-3 rounded-xl border border-slate-800 mt-2 font-mono text-[11px] text-slate-300 overflow-y-auto select-all no-scrollbar whitespace-pre">
                        {activeCode}
                    </div>
                </div>

                {/* Footer */}
                <div className="pt-3 border-t border-slate-800 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
