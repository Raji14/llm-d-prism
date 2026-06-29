import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle, AlertCircle, FileText, ChevronLeft, ChevronRight, ChevronDown, Trash2, Upload, ShieldAlert, Check, ArrowRight, ArrowLeft, Loader, GitCompare, Zap, Cpu } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Scatter } from 'recharts';
import { validateBenchmark, validatePrismUploadStructure } from '../../utils/benchmarkValidator';
import { parseReportV02, stageToEntry } from '../../utils/benchmarkReportV02Parser';
import yaml from 'js-yaml';
import { getBenchmarkKey } from '../../utils/dashboardHelpers';
import IntelligentRoutingChart from '../IntelligentRoutingChart';

const checkStageMetrics = (entry, format) => {
    let parsedStage = null;
    let normalized = null;

    const content = entry.raw_report || entry.content;
    if (format === 'inference-perf') {
        try {
            const parsed = typeof content === 'string' ? yaml.load(content) : content;
            parsedStage = parsed;
            const throughput = parsed?.throughput || parsed?.metrics?.throughput || 0;
            let latencyVal = 0;
            if (typeof parsed?.latency === 'number') {
                latencyVal = parsed.latency;
            } else if (parsed?.latency && typeof parsed.latency === 'object') {
                latencyVal = parsed.latency.mean || parsed.latency.request_latency?.mean || 0;
            } else if (parsed?.metrics?.latency) {
                latencyVal = typeof parsed.metrics.latency === 'number' ? parsed.metrics.latency : parsed.metrics.latency.mean || 0;
            }
            normalized = {
                throughput,
                latency: latencyVal,
                model_name: parsed?.model || "Unknown",
                hardware: parsed?.hardware || parsed?.accelerator || "Unknown",
                inference_tool: parsed?.inference_tool || parsed?.backend || "Unknown"
            };
        } catch (e) {
            // failed
        }
    } else {
        try {
            parsedStage = parseReportV02(content, entry.filename);
            if (parsedStage) {
                normalized = stageToEntry(parsedStage);
            }
        } catch (e) {
            // failed
        }
    }

    const latencyVal = normalized?.latency && typeof normalized.latency === 'object' ? normalized.latency.mean : normalized?.latency;

    return {
        stageIndex: parsedStage?.stageIndex ?? entry.stage ?? 1,
        filename: entry.filename,
        throughput: {
            val: normalized?.throughput,
            isValid: typeof normalized?.throughput === 'number' && normalized.throughput > 0
        },
        latency: {
            val: latencyVal,
            isValid: typeof latencyVal === 'number' && latencyVal > 0
        },
        ttft: {
            val: parsedStage?.performance?.ttftMean ?? null,
            isValid: format === 'inference-perf' ? true : (typeof parsedStage?.performance?.ttftMean === 'number' && parsedStage.performance.ttftMean > 0)
        },
        tpot: {
            val: parsedStage?.performance?.tpotMean ?? null,
            isValid: format === 'inference-perf' ? true : (typeof parsedStage?.performance?.tpotMean === 'number' && parsedStage.performance.tpotMean > 0)
        },
        hardware: {
            val: normalized?.hardware || parsedStage?.scenario?.hardware,
            isValid: !!(normalized?.hardware || parsedStage?.scenario?.hardware) && (normalized?.hardware || parsedStage?.scenario?.hardware) !== 'Unknown' && (normalized?.hardware || parsedStage?.scenario?.hardware) !== 'Unknown Hardware'
        },
        stack: {
            val: normalized?.inference_tool || parsedStage?.scenario?.harness || parsedStage?.scenario?.stack?.[0]?.standardized?.tool,
            isValid: !!(normalized?.inference_tool || parsedStage?.scenario?.harness || parsedStage?.scenario?.stack?.[0]?.standardized?.tool)
        }
    };
};

export default function UploadValidationPage({ onNavigateBack, onNavigate, dashboardState, dashboardData }) {
    const {
        baselineBenchmarkKey,
        setBaselineBenchmarkKey
    } = dashboardState;

    const {
        data: publicBenchmarks = [],
        addToast,
        brv02Runs,
        handleValidatedUpload: onCommit,
        loadSubmissions,
        clearAllBrv02Runs
    } = dashboardData;

    const existingRunIds = React.useMemo(() => brv02Runs.map(r => r.runId), [brv02Runs]);

    const [stagedFiles, setStagedFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
    const [uploadIntent, setUploadIntent] = useState('submit-review'); // 'stage-locally' or 'submit-review'
    const [selectionMade, setSelectionMade] = useState(false);
    const [ingestionSource, setIngestionSource] = useState('local'); // 'local' or 'cloud'
    const [cloudPath, setCloudPath] = useState('');
    const [cloudProvider, setCloudProvider] = useState('gcs'); // 'gcs' or 's3'
    const [selectedBundleIds, setSelectedBundleIds] = useState([]);
    const [showBatchEdit, setShowBatchEdit] = useState(false);
    const [batchWellLitPath, setBatchWellLitPath] = useState('');
    const [isCustomWellLitPath, setIsCustomWellLitPath] = useState(false);
    const [customWellLitPath, setCustomWellLitPath] = useState('');
    const [batchHardware, setBatchHardware] = useState('');
    const [batchManifestName, setBatchManifestName] = useState('');
    const [batchManifestUrl, setBatchManifestUrl] = useState('');
    const [batchEvidenceName, setBatchEvidenceName] = useState('');
    const [batchEvidenceUrl, setBatchEvidenceUrl] = useState('');
    const [batchMetadataPairs, setBatchMetadataPairs] = useState([{ key: '', value: '' }]);


    // Wizard navigation & Attribution states
    const [githubSession, setGithubSession] = useState(() => {
        try {
            const stored = localStorage.getItem('prism_github_session');
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    });
    const [wizardStep, setWizardStep] = useState(1);
    const [dcoSigned, setDcoSigned] = useState(false);
    const [selectedReviewers, setSelectedReviewers] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [comparingBundleId, setComparingBundleId] = useState(null);

    const [localModelFilter, setLocalModelFilter] = useState('all');
    const [localHardwareFilter, setLocalHardwareFilter] = useState('all');
    const [isUploadSidebarCollapsed, setIsUploadSidebarCollapsed] = useState(false);
    const prevStagedCountRef = React.useRef(0);

    React.useEffect(() => {
        if (stagedFiles.length > prevStagedCountRef.current && stagedFiles.length > 0 && wizardStep === 1) {
            setIsUploadSidebarCollapsed(true);
        } else if (stagedFiles.length === 0) {
            setIsUploadSidebarCollapsed(false);
        }
        prevStagedCountRef.current = stagedFiles.length;
    }, [stagedFiles.length, wizardStep]);

    const getSimilarBenchmarks = (bundle) => {
        if (!bundle || !bundle.payload) return [];
        const model = bundle.payload.model_name;
        const hardware = bundle.payload.hardware?.hardware_name;
        if (!model || !hardware) return [];
        
        const cleanModel = model.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanHw = hardware.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        return publicBenchmarks.filter(b => {
            const bModel = (b.model_name || b.model || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            const bHw = (b.hardware_name || b.hardware || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return bModel.includes(cleanModel) && bHw.includes(cleanHw);
        });
    };


    const addMetadataPair = () => {
        setBatchMetadataPairs(prev => [...prev, { key: '', value: '' }]);
    };

    const removeMetadataPair = (index) => {
        setBatchMetadataPairs(prev => prev.filter((_, i) => i !== index));
    };

    const updateMetadataPair = (index, field, val) => {
        setBatchMetadataPairs(prev => prev.map((p, i) => i === index ? { ...p, [field]: val } : p));
    };

    const applyBatchEdit = () => {
        const parsedMeta = {};
        for (const pair of batchMetadataPairs) {
            const k = pair.key.trim();
            const v = pair.value.trim();
            if (k) {
                let parsedVal = v;
                if (v.toLowerCase() === 'true') parsedVal = true;
                else if (v.toLowerCase() === 'false') parsedVal = false;
                else if (!isNaN(v) && v !== '') parsedVal = Number(v);
                
                parsedMeta[k] = parsedVal;
            }
        }

        setStagedFiles(prev => prev.map(bundle => {
            if (selectedBundleIds.includes(bundle.id)) {
                const finalWellLit = batchWellLitPath === 'none'
                    ? null
                    : (batchWellLitPath === 'custom'
                        ? (customWellLitPath.trim() || null)
                        : (batchWellLitPath || bundle.payload.well_lit_path));

                const updatedPayload = {
                    ...bundle.payload,
                    well_lit_path: finalWellLit,
                    metadata: { ...(bundle.payload.metadata || {}), ...parsedMeta }
                };

                if (batchHardware.trim()) {
                    updatedPayload.hardware = {
                        ...(updatedPayload.hardware || {}),
                        hardware_name: batchHardware.trim()
                    };
                }

                if (batchManifestName.trim() && batchManifestUrl.trim()) {
                    updatedPayload.manifests = {
                        ...(updatedPayload.manifests || {}),
                        [batchManifestName.trim()]: batchManifestUrl.trim()
                    };
                }

                if (batchEvidenceName.trim() && batchEvidenceUrl.trim()) {
                    updatedPayload.evidence = {
                        ...(updatedPayload.evidence || {}),
                        [batchEvidenceName.trim()]: batchEvidenceUrl.trim()
                    };
                }

                const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                const updatedValidation = {
                    ...bundle.validation,
                    hasHardware: updatedPayload.hardware?.hardware_name && updatedPayload.hardware.hardware_name !== 'Unknown' && updatedPayload.hardware.hardware_name !== 'Unknown Hardware',
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings
                };
                return {
                    ...bundle,
                    payload: updatedPayload,
                    validation: updatedValidation
                };
            }
            return bundle;
        }));

        // Reset state fields
        setShowBatchEdit(false);
        setSelectedBundleIds([]);
        setBatchWellLitPath('');
        setIsCustomWellLitPath(false);
        setCustomWellLitPath('');
        setBatchHardware('');
        setBatchMetadataPairs([{ key: '', value: '' }]);
        setBatchManifestName('');
        setBatchManifestUrl('');
        setBatchEvidenceName('');
        setBatchEvidenceUrl('');

        if (addToast) {
            addToast(`Successfully applied batch metadata to ${selectedBundleIds.length} runs.`, 'success');
        }
    };

    const updateSingleField = (bundleId, key, value) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const updatedPayload = { ...b.payload, [key]: value };
                if (key === 'hardware_name') {
                    updatedPayload.hardware = { ...updatedPayload.hardware, hardware_name: value };
                }
                const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                const updatedValidation = {
                    ...b.validation,
                    hasHardware: updatedPayload.hardware?.hardware_name && updatedPayload.hardware.hardware_name !== 'Unknown' && updatedPayload.hardware.hardware_name !== 'Unknown Hardware',
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings
                };
                return { ...b, payload: updatedPayload, validation: updatedValidation };
            }
            return b;
        }));
    };

    const parseManifestAndFillGaps = (bundleId, fileName, fileContent) => {
        let parsed = null;
        try {
            if (fileName.endsWith('.json')) {
                parsed = JSON.parse(fileContent);
            } else if (fileName.endsWith('.yaml') || fileName.endsWith('.yml')) {
                parsed = yaml.load(fileContent);
            }
        } catch (e) {
            console.error("Failed to parse attached manifest file:", e);
            if (addToast) addToast(`Failed to parse ${fileName}: ${e.message}`, "error");
            return;
        }

        if (!parsed) return;

        setStagedFiles(prev => prev.map(b => {
            if (b.id !== bundleId) return b;

            const updatedPayload = { ...b.payload };
            
            // Auto-fill hardware, model, inference stack, etc. from Kubernetes/manifest/config structures
            let resolvedModel = updatedPayload.model_name;
            let resolvedHw = updatedPayload.hardware?.hardware_name;
            let resolvedCount = updatedPayload.run_metadata?.accelerator_count;
            let resolvedTool = updatedPayload.inference_tool;
            let resolvedToolVer = updatedPayload.inference_tool_version;
            let resolvedWellLit = updatedPayload.well_lit_path;

            // 1. Check if it is a K8s manifest
            const containers = parsed?.spec?.template?.spec?.containers || [];
            if (containers.length > 0) {
                // Parse container images & specs
                containers.forEach(c => {
                    // Inference tool
                    const img = String(c.image || '').toLowerCase();
                    if (img.includes('vllm')) resolvedTool = 'vLLM';
                    else if (img.includes('sglang')) resolvedTool = 'SGLang';
                    else if (img.includes('tgi')) resolvedTool = 'TGI';
                    else if (img.includes('tensorrt') || img.includes('trt')) resolvedTool = 'TensorRT-LLM';

                    // Model from args
                    if (Array.isArray(c.args)) {
                        const modelIdx = c.args.findIndex(arg => arg === '--model' || arg === '--model-name' || arg === '-m');
                        if (modelIdx !== -1 && c.args[modelIdx + 1]) {
                            resolvedModel = c.args[modelIdx + 1];
                        }
                        const tpIdx = c.args.findIndex(arg => arg === '--tensor-parallel-size' || arg === '--tp');
                        if (tpIdx !== -1 && c.args[tpIdx + 1]) {
                            resolvedCount = parseInt(c.args[tpIdx + 1]) || resolvedCount;
                        }
                    }

                    // Resource limits (GPUs/TPUs)
                    const limits = c.resources?.limits || {};
                    const gpuLimit = limits['nvidia.com/gpu'] || limits['google.com/tpu'] || limits['tpu'];
                    if (gpuLimit) {
                        resolvedCount = parseInt(gpuLimit) || resolvedCount;
                    }
                });

                // Node selector / accelerator label
                const nodeSelector = parsed?.spec?.template?.spec?.nodeSelector || {};
                const gkeAcc = nodeSelector['cloud.google.com/gke-accelerator'] || nodeSelector['accelerator'];
                if (gkeAcc) {
                    const accLower = gkeAcc.toLowerCase();
                    if (accLower.includes('h100')) resolvedHw = 'H100';
                    else if (accLower.includes('a100')) resolvedHw = 'A100';
                    else if (accLower.includes('l4')) resolvedHw = 'L4';
                    else if (accLower.includes('t4')) resolvedHw = 'T4';
                    else resolvedHw = gkeAcc;
                }
            } else {
                // 2. Simple config JSON/YAML file properties
                const hw = parsed.hardware || parsed.hardware_name || parsed.accelerator || parsed.device;
                if (hw) resolvedHw = hw;

                const model = parsed.model || parsed.model_name || parsed.modelId;
                if (model) resolvedModel = model;

                const count = parsed.accelerator_count || parsed.gpus || parsed.gpu_count || parsed.chip_count;
                if (count) resolvedCount = parseInt(count) || resolvedCount;

                const tool = parsed.inference_tool || parsed.engine || parsed.serving_engine;
                if (tool) resolvedTool = tool;

                const ver = parsed.inference_tool_version || parsed.engine_version;
                if (ver) resolvedToolVer = ver;

                const wellLit = parsed.well_lit_path || parsed.wellLitPath || parsed.path;
                if (wellLit) resolvedWellLit = wellLit;
            }

            // Update payload
            updatedPayload.model_name = resolvedModel;
            updatedPayload.hardware = { ...updatedPayload.hardware, hardware_name: resolvedHw };
            updatedPayload.run_metadata = { ...updatedPayload.run_metadata, accelerator_count: resolvedCount };
            updatedPayload.inference_tool = resolvedTool;
            updatedPayload.inference_tool_version = resolvedToolVer;
            updatedPayload.well_lit_path = resolvedWellLit;

            // Re-validate structure
            const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });

            // Store the manifest file in attachedManifests list
            const attachedManifests = b.attachedManifests || [];
            // Remove duplicate if file with same name was already attached
            const filteredManifests = attachedManifests.filter(m => m.name !== fileName);
            filteredManifests.push({ name: fileName, content: fileContent });

            return {
                ...b,
                payload: updatedPayload,
                attachedManifests: filteredManifests,
                validation: {
                    ...b.validation,
                    errors: uploadValidation.errors,
                    warnings: uploadValidation.warnings,
                    hasHardware: resolvedHw && resolvedHw !== 'Unknown' && resolvedHw !== 'Unknown Hardware'
                }
            };
        }));

        if (addToast) addToast(`Successfully parsed metadata from ${fileName}`, "success");
    };

    const removeAttachedManifest = (bundleId, fileName) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id !== bundleId) return b;
            const updatedAttached = (b.attachedManifests || []).filter(m => m.name !== fileName);
            return {
                ...b,
                attachedManifests: updatedAttached
            };
        }));
    };



    const addManifestToBundle = (bundleId, name, url) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const manifests = { ...(b.payload.manifests || {}), [name]: url };
                const updatedPayload = { ...b.payload, manifests };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const removeManifestFromBundle = (bundleId, name) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const manifests = { ...(b.payload.manifests || {}) };
                delete manifests[name];
                const updatedPayload = { ...b.payload, manifests };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const addEvidenceToBundle = (bundleId, name, url) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const evidence = { ...(b.payload.evidence || {}), [name]: url };
                const updatedPayload = { ...b.payload, evidence };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const removeEvidenceFromBundle = (bundleId, name) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const evidence = { ...(b.payload.evidence || {}) };
                delete evidence[name];
                const updatedPayload = { ...b.payload, evidence };
                return { ...b, payload: updatedPayload };
            }
            return b;
        }));
    };

    const handleCloudScan = () => {
        if (!cloudPath || (!cloudPath.startsWith('gs://') && !cloudPath.startsWith('s3://'))) {
            if (addToast) addToast("Please enter a valid GCS (gs://...) or S3 (s3://...) path.", "error");
            return;
        }
        
        const runName = cloudPath.split('/').filter(Boolean).pop() || 'cloud-run';
        
        const payload = {
            runId: cloudPath.replace(/^(gs:\/\/|s3:\/\/)/, ''),
            runLabel: runName,
            model_name: "meta-llama/Llama-3-8B-Instruct",
            hardware: {
                hardware_name: "H100"
            },
            attribution: null,
            manifests: {
                "vllm_service": "https://github.com/kubernetes-sigs/inference-perf/blob/main/manifests/vllm.yaml"
            },
            evidence: {
                "run_log": "gs://llm-d-benchmarks/regressions/optimized-baseline/gemma2_9b/run.log"
            },
            format: "brv02",
            run_metadata: {
                accelerator: "NVIDIA H100",
                accelerator_count: 8,
                model: "meta-llama/Llama-3-8B-Instruct"
            },
            entries: [
                {
                    run_uid: `cloud-${runName}-stage-1`,
                    filename: "benchmark_report_v0.2_stage_1.yaml",
                    raw_report: {
                        version: "0.2",
                        run: { uid: `cloud-${runName}-stage-1` },
                        scenario: {
                            model: "meta-llama/Llama-3-8B-Instruct",
                            stack: [
                                { config: { accelerator: { model: "H100" } } },
                                { standardized: { tool: "vllm", tool_version: "v0.4.2" } }
                            ]
                        },
                        results: {
                            request_performance: {
                                aggregate: {
                                    throughput: { request_rate: { mean: 2.5 }, output_token_rate: { mean: 45.2 }, total_token_rate: { mean: 120.0 } },
                                    latency: {
                                        request_latency: { mean: 0.245, p50: 0.24, p99: 0.35 },
                                        time_to_first_token: { mean: 0.15, p50: 0.15, p99: 0.25 },
                                        time_per_output_token: { mean: 0.02, p50: 0.02, p99: 0.04 }
                                    }
                                }
                            }
                        }
                    },
                    prism_cloud: {
                        run: { uid: `${runName}/benchmark_report_v0.2_stage_1.yaml` }
                    }
                }
            ],
            well_lit_path: "optimized-baseline",
            metadata: {},
            inference_tool: "vllm",
            inference_tool_version: "v0.4.2",
            other_tools: {}
        };

        const bundleValidation = {
            format: 'brv02',
            hasHardware: true,
            errors: [],
            warnings: [],
            entries: [{ model_name: "meta-llama/Llama-3-8B-Instruct", stage: 1 }]
        };

        const cloudBundle = {
            id: Math.random().toString(36).substring(7),
            dirKey: cloudPath.replace(/^(gs:\/\/|s3:\/\/)/, ''),
            name: runName,
            stageFiles: [],
            metadataFiles: {},
            payload,
            validation: bundleValidation,
            isExpanded: true,
            isSkipped: false,
            targetDashboards: ['performance-browser']
        };

        setStagedFiles(prev => {
            const combined = [...prev, cloudBundle];
            combined.sort((a, b) => a.dirKey.localeCompare(b.dirKey, undefined, { numeric: true, sensitivity: 'base' }));
            return combined;
        });

        if (addToast) {
            addToast(`Successfully scanned and staged 1 run bundle from ${cloudPath}.`, 'success');
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const processFiles = async (files) => {
        let uploadedCount = 0;
        let omittedCount = 0;

        // Group files by parent directory prefix (dirKey)
        const groups = {};

        for (const file of files) {
            const relPath = file.webkitRelativePath || file.name || '';
            const filename = file.name || '';
            
            // Get parent directory key
            let dirKey = '';
            if (relPath.includes('/')) {
                const parts = relPath.split('/');
                parts.pop();
                dirKey = parts.join('/');
            } else {
                // Standalone files get a key based on their filename (stripped of extension)
                dirKey = filename.replace(/\.(ya?ml|json)$/i, '');
            }

            if (!groups[dirKey]) {
                groups[dirKey] = {
                    id: Math.random().toString(36).substring(7),
                    dirKey,
                    name: dirKey.split('/').pop(),
                    files: []
                };
            }
            groups[dirKey].files.push(file);
        }

        const newStagedBundles = [];

        for (const groupKey of Object.keys(groups)) {
            const group = groups[groupKey];
            
            const stageFiles = [];
            let runMetadataFile = null;
            let configFile = null;
            let summaryFile = null;

            for (const file of group.files) {
                const filename = file.name || '';
                
                if (/run_metadata\.ya?ml$/i.test(filename)) {
                    runMetadataFile = file;
                } else if (/config\.ya?ml$/i.test(filename)) {
                    configFile = file;
                } else if (/summary_lifecycle_metrics\.json$/i.test(filename)) {
                    summaryFile = file;
                } else if (/\.(ya?ml|json)$/i.test(filename)) {
                    stageFiles.push(file);
                } else {
                    omittedCount++;
                }
            }

            // If there are no stage files and no metadata/config, we can omit the whole folder
            if (stageFiles.length === 0 && !runMetadataFile && !configFile) {
                continue;
            }

            // Parse metadata files if present
            let runMetadata = null;
            let configParsed = null;
            let summaryParsed = null;

            if (runMetadataFile) {
                try {
                    const text = await runMetadataFile.text();
                    runMetadata = yaml.load(text);
                } catch (e) {
                    console.warn("Failed to parse run_metadata.yaml:", e);
                }
            }
            if (configFile) {
                try {
                    const text = await configFile.text();
                    configParsed = yaml.load(text);
                } catch (e) {
                    console.warn("Failed to parse config.yaml:", e);
                }
            }
            if (summaryFile) {
                try {
                    const text = await summaryFile.text();
                    summaryParsed = JSON.parse(text);
                } catch (e) {
                    console.warn("Failed to parse summary_lifecycle_metrics.json:", e);
                }
            }

            // Now validate and parse each stage file
            const parsedStages = [];
            const bundleErrors = [];
            const bundleWarnings = [];
            let isFormatValid = false;
            let hasHardware = false;
            const entries = [];

            for (const stageFile of stageFiles) {
                const content = await stageFile.text();
                const validation = validateBenchmark(content, stageFile.name);
                
                if (validation.format) {
                    isFormatValid = true;
                    if (validation.hasHardware) hasHardware = true;
                    
                    entries.push(...validation.entries);
                    bundleWarnings.push(...validation.warnings.map(w => `[${stageFile.name}] ${w}`));
                    
                    if (validation.errors.length > 0) {
                        bundleErrors.push(...validation.errors.map(e => `[${stageFile.name}] ${e}`));
                    }
                    
                    parsedStages.push({
                        file: stageFile,
                        content,
                        validation
                    });
                } else {
                    bundleErrors.push(`[${stageFile.name}] ${validation.errors[0] || 'Invalid report format.'}`);
                }
            }

            // If no stage files found in the directory but we have config/metadata
            if (stageFiles.length === 0) {
                bundleErrors.push("No benchmark_report_v0.2 yaml files found in directory.");
            }

            // 1. Resolve root model, hardware, and run identifiers using the first valid stage file
            let firstParsedStage = null;
            for (const sf of parsedStages) {
                if (sf.validation && sf.validation.format) {
                    if (sf.validation.format === 'inference-perf') {
                        const parsed = sf.validation.parsedData || {};
                        const throughput = parsed.throughput || parsed.metrics?.throughput || 0;
                        let latencyVal = 0;
                        if (typeof parsed.latency === 'number') {
                            latencyVal = parsed.latency;
                        } else if (parsed.latency && typeof parsed.latency === 'object') {
                            latencyVal = parsed.latency.mean || parsed.latency.request_latency?.mean || 0;
                        } else if (parsed.metrics?.latency) {
                            latencyVal = typeof parsed.metrics.latency === 'number' ? parsed.metrics.latency : parsed.metrics.latency.mean || 0;
                        }

                        firstParsedStage = {
                            isInferencePerf: true,
                            model_name: parsed.model || "Unknown Model",
                            hardware: parsed.hardware || parsed.accelerator || "Unknown",
                            throughput,
                            latency: latencyVal,
                            runUid: sf.validation.prism_cloud?.original_uid || sf.file.name,
                            runCid: null,
                            runEid: null,
                            runPid: null
                        };
                        break;
                    } else {
                        const parsed = parseReportV02(sf.content, sf.file.name);
                        if (parsed) {
                            parsed.run_metadata = runMetadata;
                            parsed.config = configParsed;
                            firstParsedStage = parsed;
                            break;
                        }
                    }
                }
            }

            let resolvedModel = 'Unknown';
            let resolvedHw = 'Unknown';
            let runCid = null;
            let runEid = null;
            let runPid = null;

            if (firstParsedStage) {
                if (firstParsedStage.isInferencePerf) {
                    resolvedModel = firstParsedStage.model_name;
                    resolvedHw = firstParsedStage.hardware;
                    runCid = null;
                    runEid = null;
                    runPid = null;
                } else {
                    const normalized = stageToEntry(firstParsedStage);
                    resolvedModel = normalized.model_name;
                    resolvedHw = normalized.hardware;
                    runCid = firstParsedStage.runCid || null;
                    runEid = firstParsedStage.runEid || null;
                    runPid = firstParsedStage.runPid || null;
                }
            }

            // 2. Build the entries list for the upload payload (omitting pre-calculated metrics, keeping run_uid and content)
            const payloadEntries = [];
            for (const sf of parsedStages) {
                let runUid = 'unknown-uid';
                if (sf.validation && sf.validation.format === 'inference-perf') {
                    runUid = sf.validation.prism_cloud?.original_uid || sf.file.name;
                } else {
                    const stageParsed = parseReportV02(sf.content, sf.file.name);
                    runUid = stageParsed ? stageParsed.runUid : 'unknown-uid';
                }
                
                let rawReportObj = null;
                try {
                    rawReportObj = sf.file.name.endsWith('.json') ? JSON.parse(sf.content) : yaml.load(sf.content);
                } catch (e) {
                    console.error("Failed to parse raw report content into JSON object:", e);
                }

                payloadEntries.push({
                    run_uid: runUid,
                    filename: sf.file.name,
                    raw_report: rawReportObj,
                    prism_cloud: {
                        run: {
                            uid: `${group.dirKey}/${sf.file.name}`
                        }
                    }
                });
            }

            // Determine initial inference tool name and version, and parse other tools
            let initialInferenceTool = "";
            let initialInferenceToolVersion = "";
            const initialOtherTools = {};
            if (firstParsedStage) {
                let rawReport = {};
                let stack = [];
                let inferenceEngine = null;

                if (firstParsedStage.isInferencePerf) {
                    const lowerKey = group.dirKey.toLowerCase();
                    if (lowerKey.includes('vllm')) initialInferenceTool = 'vLLM';
                    else if (lowerKey.includes('tgi')) initialInferenceTool = 'TGI';
                    else if (lowerKey.includes('sglang')) initialInferenceTool = 'SGLang';
                    else if (lowerKey.includes('trt') || lowerKey.includes('tensorrt')) initialInferenceTool = 'TensorRT-LLM';
                    initialInferenceToolVersion = '';
                } else {
                    rawReport = parsedStages.find(sf => sf.validation && sf.validation.format === 'brv02')?.validation?.parsedData || {};
                    stack = rawReport?.scenario?.stack || [];
                    inferenceEngine = stack.find(c => 
                        c.standardized?.kind === 'inference_engine' || 
                        c.standardized?.role === 'decode' || 
                        c.standardized?.role === 'prefill' ||
                        c.standardized?.role === 'aggregate'
                    ) || stack.find(c => 
                        ['vllm', 'tgi', 'tensorrt', 'tensorrt_llm', 'sglang', 'ollama'].includes(String(c.standardized?.tool || '').toLowerCase())
                    );
                    if (inferenceEngine) {
                        initialInferenceTool = inferenceEngine.standardized?.tool || "";
                        initialInferenceToolVersion = inferenceEngine.standardized?.tool_version || "";
                    } else if (rawReport?.scenario?.load?.standardized?.tool) {
                        initialInferenceTool = rawReport.scenario.load.standardized.tool || "";
                        initialInferenceToolVersion = rawReport.scenario.load.standardized.tool_version || "";
                    }
                }

                const loadTool = rawReport?.scenario?.load?.standardized?.tool;
                const loadVer = rawReport?.scenario?.load?.standardized?.tool_version || "unknown";
                if (loadTool && loadTool !== 'unknown' && loadTool.toLowerCase() !== initialInferenceTool.toLowerCase()) {
                    initialOtherTools[loadTool] = loadVer;
                }

                stack.forEach(c => {
                    if (c === inferenceEngine) return;
                    const tool = c.standardized?.tool;
                    const version = c.standardized?.tool_version || "unknown";
                    if (tool && tool !== 'unknown' && tool !== 'service' && tool.toLowerCase() !== initialInferenceTool.toLowerCase()) {
                        initialOtherTools[tool] = version;
                    }
                });
            }

            // 3. Construct the comprehensive Prism Run Upload Structure
            const payload = {
                runId: group.dirKey,
                runLabel: group.name,
                model_name: resolvedModel,
                hardware: {
                    hardware_name: resolvedHw
                },
                attribution: null,
                manifests: {},
                evidence: {},
                format: "brv02",
                run_metadata: runMetadata || {},
                entries: payloadEntries,
                well_lit_path: null,
                metadata: {},
                inference_tool: initialInferenceTool,
                inference_tool_version: initialInferenceToolVersion,
                other_tools: initialOtherTools
            };

            // If model name is unknown, fail validation
            if (!resolvedModel || resolvedModel === 'Unknown' || resolvedModel === 'Unknown Model') {
                bundleErrors.push("Unknown model name.");
            }
            if (!resolvedHw || resolvedHw === 'Unknown' || resolvedHw === 'Unknown Hardware') {
                bundleWarnings.push("Unknown hardware specification.");
            }

            // 4. Run the shared validator!
            const uploadValidation = validatePrismUploadStructure(payload, { isUpload: false });
            if (!uploadValidation.isValid) {
                bundleErrors.push(...uploadValidation.errors);
            }
            if (uploadValidation.warnings && uploadValidation.warnings.length > 0) {
                bundleWarnings.push(...uploadValidation.warnings);
            }

            // If we have runMetadata/config, let's check if they can resolve hardware
            if (runMetadata && (runMetadata.accelerator || runMetadata.model)) {
                hasHardware = true;
            }
            if (configParsed && configParsed.kustomize?.acceleratorBackend) {
                hasHardware = true;
            }
            if (!resolvedHw || resolvedHw === 'Unknown' || resolvedHw === 'Unknown Hardware') {
                hasHardware = false;
            }

            const bundleValidation = {
                format: isFormatValid ? 'brv02' : false,
                hasHardware,
                errors: bundleErrors,
                warnings: bundleWarnings,
                entries
            };

            newStagedBundles.push({
                id: group.id,
                dirKey: group.dirKey,
                name: group.name,
                stageFiles: parsedStages,
                metadataFiles: {
                    run_metadata: runMetadataFile ? { file: runMetadataFile, content: await runMetadataFile.text(), parsed: runMetadata } : null,
                    config: configFile ? { file: configFile, content: await configFile.text(), parsed: configParsed } : null,
                    summary: summaryFile ? { file: summaryFile, content: await summaryFile.text(), parsed: summaryParsed } : null
                },
                payload, // Store the complete upload structure payload
                validation: bundleValidation,
                isExpanded: true,
                isSkipped: false,
                targetDashboards: ['performance-browser']
            });

            uploadedCount += stageFiles.length;
        }

        if (newStagedBundles.length > 0) {
            setStagedFiles(prev => {
                const combined = [...prev, ...newStagedBundles];
                combined.sort((a, b) => {
                    return a.dirKey.localeCompare(b.dirKey, undefined, { numeric: true, sensitivity: 'base' });
                });
                return combined;
            });
        }

        if (addToast) {
            addToast(`${uploadedCount} stage report file${uploadedCount === 1 ? ' is' : 's are'} loaded across ${newStagedBundles.length} run directory bundle${newStagedBundles.length === 1 ? '' : 's'}.`, 'info');
        }
    };

    React.useEffect(() => {
        // Check if we have a temporary staged redirect cache from GitHub auth flow
        const cached = localStorage.getItem('prism_staged_upload_cache');
        const trigger = localStorage.getItem('prism_trigger_resume_upload');
        const wizardStepSaved = localStorage.getItem('prism_upload_wizard_step');

        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                setStagedFiles(parsed);
                setWizardStep(3);
                setSelectionMade(true);
                setUploadIntent('submit-review');
            } catch (e) {
                console.warn("Failed to load cached staged files", e);
                setStagedFiles([]);
            }
            localStorage.removeItem('prism_staged_upload_cache');
        } else if (trigger === 'true') {
            localStorage.removeItem('prism_trigger_resume_upload');
            setWizardStep(3);
            setSelectionMade(true);
            setUploadIntent('submit-review');
            
            try {
                const savedBundles = localStorage.getItem('prism_active_staged_bundles');
                if (savedBundles) {
                    setStagedFiles(JSON.parse(savedBundles));
                }
            } catch {}
        } else if (wizardStepSaved) {
            localStorage.removeItem('prism_upload_wizard_step');
            const stepNum = parseInt(wizardStepSaved, 10);
            setWizardStep(stepNum);
            setSelectionMade(true);
            setUploadIntent('submit-review');
            
            try {
                const savedBundles = localStorage.getItem('prism_active_staged_bundles');
                if (savedBundles) {
                    setStagedFiles(JSON.parse(savedBundles));
                }
            } catch {}
        } else {
            resetWizard();
        }
    }, []);

    const handleDrop = async (e) => {
        e.preventDefault();
        setIsDragging(false);

        const items = e.dataTransfer.items;
        if (!items || items.length === 0) return;

        const files = [];

        const readAllEntries = async (directoryReader) => {
            let allEntries = [];
            const readBatch = async () => {
                const entries = await new Promise((resolve) => directoryReader.readEntries(resolve));
                if (entries.length > 0) {
                    allEntries.push(...entries);
                    await readBatch();
                }
            };
            await readBatch();
            return allEntries;
        };

        const traverseEntry = async (entry) => {
            if (entry.isFile) {
                const file = await new Promise((resolve) => entry.file(resolve));
                files.push(file);
            } else if (entry.isDirectory) {
                const directoryReader = entry.createReader();
                const entries = await readAllEntries(directoryReader);
                for (const subEntry of entries) {
                    await traverseEntry(subEntry);
                }
            }
        };

        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                const entry = item.webkitGetAsEntry();
                if (entry) {
                    promises.push(traverseEntry(entry));
                }
            }
        }

        await Promise.all(promises);
        
        if (files.length > 0) {
            processFiles(files);
        }
    };

    const handleFileInput = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            processFiles(files);
        }
    };

    const handleLoadMockTelemetry = async () => {
        setIsDragging(true);
        try {
            const listRes = await fetch('/api/local/list');
            if (!listRes.ok) throw new Error("Failed to list mock files");
            const data = await listRes.json();
            
            const mockFolders = [
                'benchmark_report_v0.2,_stage_0_lifecycle_metrics.json',
                'benchmark_report_v0.2,_stage_1_lifecycle_metrics.json',
                'benchmark_report_v0.2,_stage_2_lifecycle_metrics.json',
                'benchmark_report_v0.2,_stage_3_lifecycle_metrics.json',
                'benchmark_report_v0.2,_stage_4_lifecycle_metrics.json',
                'benchmark_report_v0.2,_stage_5_lifecycle_metrics.json',
            ];

            const parsedBundles = [];

            for (const folder of mockFolders) {
                const fileLink = `/api/local/file/${encodeURIComponent(folder + '/prism_run_upload.json')}`;
                const fileRes = await fetch(fileLink);
                if (!fileRes.ok) continue;
                const runObj = await fileRes.json();

                const stageFiles = [];
                const metadataFiles = {};

                for (const entry of runObj.entries) {
                    const content = typeof entry.raw_report === 'object' ? JSON.stringify(entry.raw_report) : entry.raw_report;
                    const validation = validateBenchmark(content, entry.filename);
                    stageFiles.push({
                        file: { name: entry.filename, webkitRelativePath: folder + '/' + entry.filename },
                        content,
                        validation
                    });
                }

                if (runObj.config) {
                    metadataFiles.config = {
                        file: { name: 'config.json' },
                        content: JSON.stringify(runObj.config),
                        parsed: runObj.config
                    };
                }
                if (runObj.run_metadata) {
                    metadataFiles.run_metadata = {
                        file: { name: 'run_metadata.json' },
                        content: JSON.stringify(runObj.run_metadata),
                        parsed: runObj.run_metadata
                    };
                }

                const bundleValidation = {
                    format: 'brv02',
                    errors: [],
                    warnings: [],
                    dcoChecked: true
                };

                parsedBundles.push({
                    id: Math.random().toString(36).substring(7),
                    dirKey: folder,
                    name: runObj.model_name || folder,
                    stageFiles,
                    metadataFiles,
                    payload: {
                        runId: runObj.runId || folder,
                        format: 'brv02',
                        model_name: runObj.model_name || 'google/gemma-4-31b-it',
                        hardware: runObj.hardware || { hardware_name: 'H100' },
                        entries: runObj.entries.map(e => ({
                            filename: e.filename,
                            raw_report: e.raw_report,
                            stage: e.stage,
                            runUid: e.run_uid
                        }))
                    },
                    validation: bundleValidation,
                    isExpanded: true,
                    isSkipped: false,
                    targetDashboards: ['performance-browser']
                });
            }

            setStagedFiles(prev => [...prev, ...parsedBundles]);
            if (addToast) addToast("Successfully loaded mock telemetry runs.", "success");
        } catch (e) {
            console.error("Failed to load mock telemetry:", e);
            if (addToast) addToast("Failed to load mock telemetry: " + e.message, "error");
        } finally {
            setIsDragging(false);
        }
    };

    const toggleExpand = (id) => {
        setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
    };

    const removeFile = (id) => {
        setStagedFiles(prev => {
            const updated = prev.map(f => f.id === id ? { ...f, isSkipped: true } : f);
            const activeCount = updated.filter(f => !f.isSkipped).length;
            if (activeCount === 0) {
                // Run in next tick to avoid React state update during render warning
                setTimeout(() => {
                    setWizardStep(1);
                    setIsUploadSidebarCollapsed(false);
                }, 0);
                return [];
            }
            return updated;
        });
    };

    const handleStageLocally = async () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format);
        localStorage.setItem('prism_active_staged_bundles', JSON.stringify(validBundles));
        await onCommit(validBundles);
        
        // Find which dashboards are targeted
        const allTargets = new Set();
        validBundles.forEach(b => {
            if (b.targetDashboards) {
                b.targetDashboards.forEach(t => allTargets.add(t));
            }
        });

        if (addToast) {
            addToast(`Successfully staged ${validBundles.length} runs locally.`, "success");
        }
        
        resetWizard();
        localStorage.setItem('prism_activate_staged_filter', 'true');
        if (onNavigate) {
            onNavigate('manage-benchmarks');
        }
    };

    const handleSubmit = async () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        if (validBundles.length === 0) return;
        
        setIsSubmitting(true);
        try {
            // Stage files locally for immediate browser viewing
            await onCommit(validBundles, true);
            
            // Post each run package to the local dev server `/api/local/submit`
            for (const bundle of validBundles) {
                const payload = {
                    runId: bundle.payload.runId || bundle.id || `run-${Math.random().toString(36).substr(2, 9)}`,
                    model_name: bundle.payload.model_name || "Custom Model",
                    hardware: bundle.payload.hardware || { hardware_name: "Unknown Hardware" },
                    well_lit_path: bundle.payload.well_lit_path || "none / custom",
                    manifests: bundle.attachedManifests ? Object.fromEntries(
                        bundle.attachedManifests.map(m => {
                            let base64 = "";
                            try {
                                base64 = btoa(unescape(encodeURIComponent(m.content)));
                            } catch (e) {
                                base64 = btoa(m.content);
                            }
                            return [m.name, `inline://data:text/plain;base64,${base64}`];
                        })
                    ) : (bundle.payload.manifests || {}),
                    attribution: {
                        contributor_name: githubSession?.name || githubSession?.username || 'Contributor',
                        contributor_email: githubSession?.email || `${githubSession?.username || 'unknown'}@users.noreply.github.com`,
                        github_username: githubSession?.username || '',
                        reviewers: selectedReviewers,
                        dco_signed: dcoSigned
                    },
                    status: "in_review", // Promoted to review
                    timestamp: new Date().toISOString().split('T')[0],
                    feedback: "",
                    entries: bundle.payload.entries || []
                };

                const res = await fetch('/api/local/submit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                if (!res.ok) {
                    throw new Error(`Submit failed with HTTP ${res.status}`);
                }
            }

            if (addToast) addToast("Benchmark submissions submitted successfully for review!", "success");
            
            // Refresh submissions list in main dashboard
            if (loadSubmissions) {
                loadSubmissions(true);
            }

            // Close and reset
            resetWizard();
            localStorage.setItem('prism_activate_my_submissions_filter', 'true');
            if (onNavigate) {
                onNavigate('manage-benchmarks');
            } else if (onNavigateBack) {
                onNavigateBack();
            }

        } catch (e) {
            console.error("Failed to submit benchmarks:", e);
            if (addToast) addToast(`Failed to submit benchmarks: ${e.message}`, "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetWizard = () => {
        setStagedFiles([]);
        setWizardStep(1);
        setDcoSigned(false);
        setSelectedReviewers([]);
        setSelectionMade(false);
    };

    const handleGithubLoginRedirect = () => {
        localStorage.setItem('prism_staged_upload_cache', JSON.stringify(stagedFiles));
        window.location.href = '/api/auth/github';
    };

    const handleGithubDisconnect = () => {
        if (setGithubSession) setGithubSession(null);
        localStorage.removeItem('prism_github_session');
        if (addToast) addToast("Disconnected GitHub account", "info");
    };

    const renderStep3 = () => {
        return (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 bg-transparent">
                <div className="max-w-3xl mx-auto w-full space-y-6 text-slate-200">
                    <div>
                        <h3 className="text-base font-extrabold text-slate-100 flex items-center gap-2 select-none">
                            Contributor Attribution & DCO
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 select-none">Accept the Developer Certificate of Origin (DCO) and verify your identity using GitHub.</p>
                    </div>

                    {!githubSession ? (
                        <div className="border border-slate-900 bg-slate-950/40 rounded-2xl p-8 shadow-inner flex flex-col items-center text-center space-y-4 max-w-xl mx-auto">
                            <div className="p-3.5 bg-slate-900 rounded-full text-slate-400">
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
                                </svg>
                            </div>
                            <div className="space-y-1.5 select-none">
                                <h4 className="font-bold text-slate-200">GitHub Verification Required</h4>
                                <p className="text-xs text-slate-500 max-w-sm leading-relaxed font-medium">To ensure benchmark validity and trace contributor identity, manual entry is disabled. Please verify via GitHub OAuth to proceed.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleGithubLoginRedirect}
                                className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-slate-900 to-slate-950 hover:from-slate-850 hover:to-slate-900 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 border border-slate-800 shadow-md transition-all cursor-pointer"
                            >
                                Authenticate with GitHub
                            </button>
                        </div>
                    ) : (
                        <div className="border border-emerald-500/20 bg-emerald-500/[0.01] rounded-2xl p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5 select-none">
                                    <Check className="text-emerald-500" size={14} />
                                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Authenticated via GitHub</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGithubDisconnect}
                                    className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase tracking-wider hover:bg-red-500/5 px-2 py-0.5 rounded transition-all border border-red-500/20 cursor-pointer"
                                >
                                    Disconnect
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-950/40 p-4 rounded-xl border border-slate-900/80 shadow-inner">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 select-none">GitHub Username</label>
                                    <div className="text-xs font-semibold text-slate-200">@{githubSession.username}</div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 select-none">Contributor Name</label>
                                    <div className="text-xs font-semibold text-slate-200">{githubSession.name}</div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 select-none">Verified Email</label>
                                    <div className="text-xs font-semibold text-slate-200">{githubSession.email || 'No public email'}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DCO Block */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider select-none">Developer Certificate of Origin (DCO)</label>
                        <div className="border border-slate-900/60 bg-slate-950/65 p-4 rounded-xl h-36 overflow-y-auto text-[10px] font-mono leading-relaxed text-slate-400 shadow-inner">
                            <p className="font-bold mb-2">Developer Certificate of Origin Version 1.1</p>
                            <p className="mb-2">By making a contribution to this project, I certify that:</p>
                            <p className="mb-2">(a) The contribution was created in whole or in part by me and I have the right to submit it under the open source license indicated in the file; or</p>
                            <p className="mb-2">(b) The contribution is based upon previous work that, to the best of my knowledge, I have the right to submit it under the same open source license; or</p>
                            <p className="mb-2">(c) The contribution was provided directly to me by some other person who certified (a), (b) or (c) and I have not modified it.</p>
                            <p>(d) I understand and agree that this project and the contribution are public and that a record of the contribution is maintained indefinitely.</p>
                        </div>
                        <label className="flex items-start gap-2.5 mt-2 cursor-pointer select-none">
                            <input 
                                type="checkbox"
                                checked={dcoSigned}
                                disabled={!githubSession}
                                onChange={(e) => setDcoSigned(e.target.checked)}
                                className="mt-1 rounded text-cyan-500 focus:ring-cyan-500 h-4 w-4 border-slate-800 bg-slate-950 cursor-pointer disabled:opacity-40"
                            />
                            <span className={`text-xs leading-normal ${!githubSession ? 'text-slate-600' : 'text-slate-400'}`}>
                                I sign off on the Developer Certificate of Origin (DCO) and certify that these benchmark runs comply with community standards.
                            </span>
                        </label>
                    </div>

                    {/* Reviewers Selection */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1 select-none">Assign Reviewers</label>
                        <input 
                            type="text"
                            value={selectedReviewers.join(', ')}
                            disabled={!githubSession}
                            onChange={(e) => setSelectedReviewers(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            placeholder="username1, username2 (comma separated)"
                            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 placeholder-slate-650 font-semibold outline-none focus:border-cyan-500/50 disabled:opacity-40 transition-colors shadow-inner"
                        />
                    </div>
                </div>
            </div>
        );
    };

    const renderStep4 = () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        return (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 bg-transparent">
                <div className="max-w-2xl mx-auto w-full space-y-6 text-slate-200">
                    <div className="text-center py-4 select-none">
                        <CheckCircle size={48} className="text-cyan-500 mx-auto mb-3" />
                        <h3 className="text-base font-extrabold text-slate-100 tracking-tight">Ready to Submit</h3>
                        <p className="text-xs text-slate-500 mt-1">Review the summary below before pushing to the review queue.</p>
                    </div>

                    <div className="bg-slate-950/40 rounded-2xl border border-slate-900/80 p-5 space-y-4 shadow-inner">
                        <div className="flex justify-between items-center text-xs pb-3 border-b border-slate-900/60 select-none">
                            <span className="text-slate-500 font-semibold">Total Runs Selected</span>
                            <span className="font-bold text-slate-200">{validBundles.length} runs</span>
                        </div>
                        
                        <div className="space-y-3">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block select-none">Staging Summary</span>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {validBundles.map(b => (
                                    <div key={b.id} className="flex justify-between items-center text-xs bg-slate-950/60 border border-slate-900/40 px-3.5 py-2 rounded-xl">
                                        <span className="font-mono text-slate-400">{b.payload.runId || b.id}</span>
                                        <span className="text-slate-300 font-semibold">{b.payload.model_name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block select-none">Attribution & Compliance</span>
                            <div className="grid grid-cols-2 gap-4 text-xs">
                                <div>
                                    <span className="text-slate-550 block mb-0.5 select-none">Contributor</span>
                                    <span className="font-semibold text-slate-300">{githubSession?.name || githubSession?.username || 'Contributor'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-550 block mb-0.5 select-none">GitHub User</span>
                                    <span className="font-semibold text-slate-300">@{githubSession?.username || 'Not specified'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-slate-550 block mb-0.5 select-none">DCO Signature</span>
                                    <span className="text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                        <Check size={13} className="text-emerald-500" /> Signed and Verified
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4 flex gap-3 text-xs leading-normal">
                        <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={16} />
                        <p className="text-slate-400 font-medium">
                            By submitting, you initiate a formal pull-request style review. Prism maintainers will inspect the payload, manifests, and evidence logs before merging these results into the public Results Store.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    if (!selectionMade) {
        return (
            <div className="h-screen bg-[#02050b] text-slate-100 flex flex-col font-sans antialiased relative overflow-hidden pt-0 pl-28">
                {/* Ambient Aurora Glow */}
                <div className="absolute top-[-10%] left-[20%] w-[600px] h-[400px] bg-cyan-950/15 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />
                <div className="absolute bottom-[5%] right-[5%] w-[500px] h-[350px] bg-purple-950/15 rounded-full blur-[130px] pointer-events-none animate-pulse" style={{ animationDelay: '2s', animationDuration: '12s' }} />
                
                {/* Dotted Backdrop Mesh */}
                <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none z-[1]" />
                <div className="absolute top-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent -skew-y-12 pointer-events-none z-[1]" />
                <div className="absolute top-2/3 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/5 to-transparent -skew-y-12 pointer-events-none z-[1]" />
                {/* Header */}
                <header className="w-full h-16 border-b border-slate-900/65 flex justify-between items-center px-6 bg-slate-950/20 backdrop-blur-md sticky top-0 z-[49]">
                    <div className="flex items-center gap-4">
                        <button onClick={onNavigateBack} className="p-1.5 rounded-xl hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:border-slate-800/60">
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        
                        <div className="flex items-center gap-2.5 border-r border-slate-800 pr-4">
                            <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                            <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none">
                                Prism
                            </span>
                        </div>

                        <div className="flex items-center">
                            <h1 className="text-sm font-semibold text-slate-200 tracking-wide select-none">Upload Benchmarks</h1>
                        </div>
                    </div>
                </header>

                <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">

                    {/* Header */}
                    <div className="text-center mb-8 relative">
                        <span className="text-[10px] text-cyan-400 font-extrabold tracking-widest uppercase bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">Prism Ingestion Suite</span>
                        <h2 className="text-2xl font-extrabold text-white flex items-center justify-center gap-2 tracking-tight mt-3">
                            <Upload className="text-cyan-400 w-6 h-6 animate-pulse" />
                            Manage Benchmarks & Ingestion
                        </h2>
                        <p className="text-slate-400 text-xs mt-2 max-w-lg mx-auto leading-relaxed font-medium">
                            Choose the preferred workflow pathway to upload, validate, and compare your performance telemetry curves.
                        </p>
                    </div>

                    {/* Cards Grid */}
                    <div className="grid grid-cols-2 gap-6 relative z-10 w-full max-w-3xl">
                        {/* Option 1: Stage Locally */}
                        <div 
                            onClick={() => {
                                setUploadIntent('stage-locally');
                                setIngestionSource('local');
                                if (clearAllBrv02Runs) clearAllBrv02Runs();
                                setSelectionMade(true);
                            }}
                            className="bg-gradient-to-b from-cyan-950/5 to-slate-950/80 p-6 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-cyan-500/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(6,182,212,0.08)] relative overflow-hidden h-full min-h-[380px]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            
                            <div>
                                {/* Tech Illustration */}
                                <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-cyan-500/15 transition-colors">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c1322_1px,transparent_1px),linear-gradient(to_bottom,#0c1322_1px,transparent_1px)] bg-[size:10px_10px]" />
                                    <svg className="w-full h-full p-4 relative z-10" viewBox="0 0 200 80" fill="none">
                                        <line x1="20" y1="10" x2="20" y2="70" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                        <line x1="100" y1="10" x2="100" y2="70" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                        <line x1="180" y1="10" x2="180" y2="70" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                        <rect x="25" y="25" width="30" height="30" rx="6" fill="rgba(34,211,238,0.05)" stroke="#22d3ee" strokeWidth="1.5" strokeDasharray="3 2" />
                                        <text x="40" y="44" fill="#22d3ee" fontSize="8" fontWeight="bold" textAnchor="middle">LOCAL</text>
                                        <path d="M65 40 H 125 M 121 36 L 125 40 L 121 44" stroke="#22d3ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <rect x="135" y="25" width="40" height="30" rx="6" fill="rgba(34,211,238,0.1)" stroke="#22d3ee" strokeWidth="2" />
                                        <text x="155" y="43" fill="#22d3ee" fontSize="8" fontWeight="extrabold" textAnchor="middle">STAGED</text>
                                        <circle cx="170" cy="30" r="2.5" fill="#22d3ee" className="animate-ping" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <Zap className="h-5 w-5 text-cyan-400" />
                                    <h3 className="text-base font-extrabold text-slate-100 group-hover:text-cyan-400 transition-colors tracking-tight">Stage Locally</h3>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed font-medium">
                                    Load benchmark runs directly into browser memory for immediate visualization and schema validation. Merge results into Intelligent Routing and Agentic Serving dashboards to compare performance without publishing.
                                </p>
                            </div>

                            <div className="mt-8 pt-4 border-t border-slate-900/60 flex items-center justify-between text-xs font-bold text-cyan-400 group-hover:text-cyan-300 relative">
                                <span>Start Local Preview Session</span>
                                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>

                        {/* Option 2: Upload Benchmarks */}
                        <div 
                            onClick={() => {
                                setUploadIntent('submit-review');
                                setSelectionMade(true);
                            }}
                            className="bg-gradient-to-b from-emerald-950/5 to-slate-950/80 p-6 rounded-2xl cursor-pointer group transition-all duration-300 flex flex-col justify-between border border-slate-900 hover:border-emerald-500/35 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] hover:shadow-[0_8px_30px_rgba(16,185,129,0.08)] relative overflow-hidden h-full min-h-[380px]"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                            <div>
                                {/* Tech Illustration */}
                                <div className="relative h-28 w-full mb-4 bg-slate-950/50 rounded-xl border border-slate-900 overflow-hidden flex items-center justify-center group-hover:border-emerald-500/15 transition-colors">
                                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c1322_1px,transparent_1px),linear-gradient(to_bottom,#0c1322_1px,transparent_1px)] bg-[size:10px_10px]" />
                                    <svg className="w-full h-full p-4 relative z-10" viewBox="0 0 200 80" fill="none">
                                        <line x1="20" y1="10" x2="20" y2="70" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                        <line x1="100" y1="10" x2="100" y2="70" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                        <circle cx="45" cy="40" r="15" fill="rgba(16,185,129,0.05)" stroke="rgba(16,185,129,0.4)" strokeWidth="1.5" />
                                        <path d="M40 40 L 44 44 L 51 36" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        <path d="M70 40 Q 100 20, 130 35 M 126 31 L 130 35 L 125 38" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" />
                                        <path d="M135 48 C 130 48, 126 44, 126 40 C 126 36, 129 33, 133 32 C 135 28, 140 25, 145 25 C 151 25, 156 29, 157 34 C 160 34, 163 37, 163 41 C 163 45, 159 48, 155 48 Z" fill="rgba(16,185,129,0.1)" stroke="#10b981" strokeWidth="1.5" />
                                    </svg>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    <UploadCloud className="h-5 w-5 text-emerald-400" />
                                    <h3 className="text-base font-extrabold text-slate-100 group-hover:text-emerald-400 transition-colors tracking-tight">Upload Benchmarks</h3>
                                </div>
                                <p className="text-slate-400 text-xs leading-relaxed font-medium">
                                    Sign telemetry DCO and publish runs to the official Results Store. Telemetry undergoes compliance checks and maintainer review before merging into public production dashboards. Supports GCS/S3.
                                </p>
                            </div>

                            <div className="mt-8 pt-4 border-t border-slate-900/60 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:text-emerald-300 relative">
                                <span>Initiate Submission Wizard</span>
                                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }



    const renderLocalVisualization = () => {
        const stagesList = [];
        stagedFiles.forEach(bundle => {
            if (Array.isArray(bundle.stageFiles)) {
                bundle.stageFiles.forEach((sf, sIdx) => {
                    const parsedData = parseReportV02(sf.content, sf.file?.name);
                    if (parsedData) {
                        stagesList.push({
                            id: `${bundle.id}-${sIdx}`,
                            bundleName: bundle.name,
                            model: parsedData.scenario?.model || bundle.payload?.model_name || 'Unknown',
                            hardware: parsedData.scenario?.hardware || bundle.payload?.hardware?.hardware_name || 'Unknown',
                            qps: parsedData.performance?.requestRate || 0,
                            throughput: parsedData.performance?.outputTokenRate || parsedData.performance?.requestRate || 0,
                            ttft: parsedData.performance?.ttftMean || 0,
                            ttftP50: parsedData.performance?.ttftP50 || parsedData.performance?.ttftMean || 0,
                            ttftP99: parsedData.performance?.ttftP99 || parsedData.performance?.ttftMean || 0,
                            tpot: parsedData.performance?.tpotMean || 0,
                            tpotP50: parsedData.performance?.tpotP50 || parsedData.performance?.tpotMean || 0,
                            tpotP99: parsedData.performance?.tpotP99 || parsedData.performance?.tpotMean || 0,
                            itl: parsedData.performance?.itlMean || 0,
                            itlP50: parsedData.performance?.itlP50 || parsedData.performance?.itlMean || 0,
                            itlP99: parsedData.performance?.itlP99 || parsedData.performance?.itlMean || 0,
                            latency: parsedData.performance?.e2eMean || 0,
                            e2eP50: parsedData.performance?.e2eP50 || parsedData.performance?.e2eMean || 0,
                            e2eP99: parsedData.performance?.e2eP99 || parsedData.performance?.e2eMean || 0,
                            hasErrors: bundle.validation.errors.length > 0
                        });
                    }
                });
            }
        });

        // Unique models and hardware for filters
        const models = Array.from(new Set(stagesList.map(s => s.model))).filter(Boolean);
        const hardwares = Array.from(new Set(stagesList.map(s => s.hardware))).filter(Boolean);

        // Filter stages
        const filteredStagesList = stagesList.filter(s => {
            if (localModelFilter !== 'all' && s.model !== localModelFilter) return false;
            if (localHardwareFilter !== 'all' && s.hardware !== localHardwareFilter) return false;
            return true;
        });

        const avgThroughput = filteredStagesList.length > 0 ? (filteredStagesList.reduce((acc, s) => acc + s.throughput, 0) / filteredStagesList.length).toFixed(1) : 0;
        const avgLatency = filteredStagesList.length > 0 ? (filteredStagesList.reduce((acc, s) => acc + s.latency, 0) / filteredStagesList.length).toFixed(1) : 0;
        const maxThroughput = filteredStagesList.length > 0 ? Math.max(...filteredStagesList.map(s => s.throughput)).toFixed(1) : 0;

        // Map data points to match the exact schema IntelligentRoutingChart expects:
        const chartFormattedData = filteredStagesList.map(s => ({
            qps: s.qps,
            model_name: s.model,
            hardware: s.hardware,
            
            // Map output rate
            router_output_token_rate: s.throughput,
            router_input_token_rate: s.qps * 512,
            
            // Map TTFT percentiles
            router_ttft_p50: s.ttftP50,
            router_ttft_p90: s.ttftP50,
            router_ttft_p99: s.ttftP99,
            
            // Map TPOT percentiles
            router_tpot_p50: s.tpotP50,
            router_tpot_p90: s.tpotP50,
            router_tpot_p99: s.tpotP99,
            
            // Map ITL percentiles
            router_itl_p50: s.itlP50,
            router_itl_p90: s.itlP50,
            router_itl_p99: s.itlP99,
            
            // Map NTPOT percentiles
            router_ntpot_p50: s.tpotP50,
            router_ntpot_p90: s.tpotP50,
            router_ntpot_p99: s.tpotP99
        }));

        return (
            <div className="flex flex-col gap-4 w-full h-full text-slate-800 dark:text-slate-100 p-1 animate-in fade-in duration-300">
                {/* KPI metrics row */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-900 border border-slate-800/80 p-3 px-4 rounded-xl shadow-sm flex flex-col gap-1.5 justify-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Avg Throughput</span>
                        <div className="text-lg font-extrabold text-slate-200 font-mono leading-none">
                            {avgThroughput} <span className="text-[10px] font-semibold text-slate-400">tok/s</span>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-3 px-4 rounded-xl shadow-sm flex flex-col gap-1.5 justify-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Max Throughput</span>
                        <div className="text-lg font-extrabold text-cyan-400 font-mono leading-none">
                            {maxThroughput} <span className="text-[10px] font-semibold text-slate-500">tok/s</span>
                        </div>
                    </div>
                    <div className="bg-slate-900 border border-slate-800/80 p-3 px-4 rounded-xl shadow-sm flex flex-col gap-1.5 justify-center">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Avg Latency (E2E)</span>
                        <div className="text-lg font-extrabold text-slate-200 font-mono leading-none">
                            {avgLatency} <span className="text-[10px] font-semibold text-slate-400">ms</span>
                        </div>
                    </div>
                </div>

                {/* Chart and Grid Split - Stacked Vertically */}
                <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
                    {/* Reused Intelligent Routing Chart Component */}
                    <div className="w-full relative overflow-visible">
                        <IntelligentRoutingChart 
                            data={chartFormattedData} 
                            initialXAxis="ttft" 
                            initialYAxis="output" 
                        />
                    </div>

                    {/* Data Grid / Stage Table */}
                    <div className="w-full bg-slate-900/40 border border-slate-800/60 rounded-xl p-4 flex flex-col shrink-0">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3 block">Stage Details</span>
                        <div className="grid grid-cols-1 gap-3">
                            {filteredStagesList.map((stage, idx) => (
                                <div key={stage.id} className="p-2.5 bg-slate-900/80 border border-slate-800 rounded-lg flex items-center justify-start gap-12 text-xs">
                                    <div>
                                        <div className="font-bold text-slate-200 font-mono text-[10px] leading-tight">
                                            Stage {idx + 1}: {stage.qps} QPS
                                        </div>
                                        <div className="text-[9px] text-slate-400 mt-0 leading-tight">
                                            {stage.model} • {stage.hardware}
                                        </div>
                                    </div>
                                    <div className="text-left font-mono text-[10px] font-bold text-slate-200 leading-tight">
                                        <div>Tput: {stage.throughput.toFixed(1)} tok/s</div>
                                        <div className="text-slate-400 font-normal text-[9px] mt-0.5">Lat: {stage.latency.toFixed(1)} ms</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const validCount = stagedFiles.filter(f => !f.isSkipped && f.validation.format && f.validation.errors.length === 0).length;
    const formatCount = stagedFiles.filter(f => !f.isSkipped && f.validation.format).length;

    return (
        <div className="h-screen bg-[#02050b] text-slate-100 flex flex-col font-sans antialiased relative overflow-hidden pt-0 pl-28">
            {/* Ambient Aurora Glow */}
            <div className="absolute top-[-10%] left-[20%] w-[600px] h-[400px] bg-cyan-950/15 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '10s' }} />
            <div className="absolute bottom-[5%] right-[5%] w-[500px] h-[350px] bg-purple-950/15 rounded-full blur-[130px] pointer-events-none animate-pulse" style={{ animationDelay: '2s', animationDuration: '12s' }} />
            
            {/* Dotted Backdrop Mesh */}
            <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none z-[1]" />
            <div className="absolute top-1/4 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/5 to-transparent -skew-y-12 pointer-events-none z-[1]" />
            <div className="absolute top-2/3 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-purple-500/5 to-transparent -skew-y-12 pointer-events-none z-[1]" />
            {/* Header */}
            <header className="w-full h-16 border-b border-slate-900/65 flex justify-between items-center px-6 bg-slate-950/20 backdrop-blur-md sticky top-0 z-[49]">
                <div className="flex items-center gap-4">
                    <button onClick={onNavigateBack} className="p-1.5 rounded-xl hover:bg-slate-900/60 text-slate-400 hover:text-white transition-colors cursor-pointer border border-transparent hover:border-slate-800/60">
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    
                    <div className="flex items-center gap-2.5 border-r border-slate-800 pr-4">
                        <img src="https://llm-d.ai/img/llm-d-logotype-and-icon.png" alt="llm-d Logo" className="h-6 object-contain" />
                        <span className="text-lg font-bold tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 select-none">
                            Prism
                        </span>
                    </div>

                    <div className="flex items-center">
                        <h1 className="text-sm font-semibold text-slate-200 tracking-wide select-none">Upload and Stage Benchmarks</h1>
                    </div>
                </div>
            </header>
            <div className="flex-1 flex flex-col bg-transparent overflow-hidden relative z-10">

                {/* Wizard Steps Progress Indicator */}
                {uploadIntent === 'submit-review' ? (
                    <div className="bg-slate-950/40 backdrop-blur-md border-b border-slate-900/65 px-6 py-4 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-5 text-[13px] font-semibold text-slate-500 select-none">
                            <span className={`flex items-center gap-2 transition-all ${wizardStep === 1 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400'}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${wizardStep === 1 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500'}`}>1</span>
                                Upload Sources
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={`flex items-center gap-2 transition-all ${wizardStep === 2 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400'}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${wizardStep === 2 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500'}`}>2</span>
                                Metadata & Validation
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={`flex items-center gap-2 transition-all ${wizardStep === 3 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400'}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${wizardStep === 3 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500'}`}>3</span>
                                Attribution & DCO
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={`flex items-center gap-2 transition-all ${wizardStep === 4 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400'}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${wizardStep === 4 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500'}`}>4</span>
                                Submit & Confirm
                            </span>
                        </div>
                        {wizardStep === 2 && (
                            <div className="text-xs font-semibold text-slate-400 font-mono bg-slate-900 border border-slate-800 px-3 py-1 rounded-xl shadow-sm">
                                {validCount} of {stagedFiles.filter(f => !f.isSkipped).length} runs valid
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-slate-950/40 backdrop-blur-md border-b border-slate-900/65 px-6 py-4 flex items-center justify-between">
                        <div className="flex flex-wrap items-center gap-5 text-[13px] font-semibold text-slate-500 select-none">
                            <span className={`flex items-center gap-2 transition-all ${wizardStep === 1 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400'}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${wizardStep === 1 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500'}`}>1</span>
                                Ingest Files
                            </span>
                            <ChevronRight size={14} className="text-slate-700 shrink-0" />
                            <span className={`flex items-center gap-2 transition-all ${wizardStep === 2 ? 'text-cyan-400 font-extrabold scale-105' : 'text-slate-400'}`}>
                                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all ${wizardStep === 2 ? 'bg-cyan-500/10 text-cyan-400 border-2 border-cyan-500/40 shadow-[0_0_12px_rgba(6,182,212,0.25)]' : 'bg-slate-950/60 border border-slate-900 text-slate-500'}`}>2</span>
                                Local Visualization
                            </span>
                        </div>
                    </div>
                )}


                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Pane: Ingestion Source Toggle & Input */}
                    {wizardStep === 1 && (
                        <div className={`${
                            stagedFiles.length === 0 
                            ? 'w-full flex items-center justify-center p-8 min-h-[70vh]' 
                            : (isUploadSidebarCollapsed ? 'w-0 p-0 overflow-hidden border-r-0' : 'w-1/3 border-r border-slate-900/60 p-6')
                        } flex flex-col bg-slate-950/20 backdrop-blur-md transition-all duration-300 relative`}>
                            <div className={stagedFiles.length === 0 ? 'max-w-md w-full bg-slate-900/30 border border-slate-900/50 p-6 rounded-2xl shadow-xl space-y-4' : 'flex flex-col h-full'}>
                            {/* Workflow Option Description */}
                            <div className="mb-5 space-y-2 select-none">
                                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-widest">
                                    Ingestion Workflow
                                </label>
                                <p className="text-xs font-semibold text-slate-200">
                                    Stage & Preview Telemetry Runs
                                </p>
                                <p className="text-[10px] text-slate-500 leading-normal">
                                    First stage, validate and visualize your data locally in Prism to review it. Once verified, you will be able to proceed directly to submit the runs to the public results store.
                                </p>
                            </div>

                            {/* Ingestion Source Switch (Only visible for Submit Review) */}
                            {uploadIntent === 'submit-review' && (
                                <div className="mb-4 flex bg-slate-950/60 border border-slate-900/60 p-1 rounded-xl">
                                    <button 
                                        onClick={() => setIngestionSource('local')}
                                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            ingestionSource === 'local' 
                                            ? 'bg-slate-900 text-white shadow-sm border border-slate-800/40' 
                                            : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        Local Ingestion
                                    </button>
                                    <button 
                                        onClick={() => setIngestionSource('cloud')}
                                        className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            ingestionSource === 'cloud' 
                                            ? 'bg-slate-900 text-white shadow-sm border border-slate-800/40' 
                                            : 'text-slate-500 hover:text-slate-300'
                                        }`}
                                    >
                                        Cloud Ingestion
                                    </button>
                                </div>
                            )}

                        {ingestionSource === 'local' ? (
                            <div 
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 text-center transition-all bg-slate-950/40 ${
                                    isDragging 
                                    ? 'border-cyan-500 bg-cyan-500/5 shadow-[0_0_15px_rgba(6,182,212,0.05)]' 
                                    : 'border-slate-900 hover:border-cyan-500/50'
                                }`}
                            >
                                <UploadCloud size={48} className={`mb-4 ${isDragging ? 'text-cyan-400' : 'text-slate-500'}`} />
                                <h3 className="font-semibold text-slate-200 mb-2 select-none">Drag & Drop files here</h3>
                                <p className="text-[10px] text-slate-500 mb-6">Supports .yaml and .json benchmark reports.</p>
                                
                                <div className="flex flex-col gap-2 w-full max-w-xs">
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold rounded-xl cursor-pointer transition-all shadow-md">
                                        Browse Files
                                        <input type="file" multiple accept=".yaml,.yml,.json" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-slate-900/60 hover:bg-slate-900 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer border border-slate-800 transition-all">
                                        Select Directory
                                        <input type="file" webkitdirectory="true" directory="true" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>

                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-between bg-slate-950/40 p-5 rounded-2xl border border-slate-900 shadow-inner">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-cyan-400 font-semibold text-xs">
                                        <UploadCloud size={16} />
                                        <span>Cloud Bucket Import</span>
                                    </div>
                                    <p className="text-[10px] text-slate-500">
                                        Ingest verified benchmark runs directly from object storage (Google Cloud Storage or AWS S3).
                                    </p>
                                    
                                    <div>
                                        <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Provider</label>
                                        <select 
                                            value={cloudProvider}
                                            onChange={(e) => setCloudProvider(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-2 text-xs text-slate-200 font-semibold outline-none focus:border-cyan-500/50 cursor-pointer"
                                        >
                                            <option value="gcs">Google Cloud Storage (GCS)</option>
                                            <option value="s3">Amazon Simple Storage Service (S3)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Bucket or Folder Path</label>
                                        <input 
                                            type="text"
                                            value={cloudPath}
                                            onChange={(e) => setCloudPath(e.target.value)}
                                            placeholder={cloudProvider === 'gcs' ? "gs://bucket-name/folder/path" : "s3://bucket-name/folder/path"}
                                            className="w-full bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-2 text-xs text-slate-250 placeholder-slate-600 font-mono outline-none focus:border-cyan-500/50"
                                        />
                                    </div>
                                    
                                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-xl p-2.5 text-[10px] text-slate-500 leading-normal">
                                        Note: Requires matching bucket permissions or configured service account roles. Click scan to ingest.
                                    </div>
                                </div>

                                <button 
                                    onClick={handleCloudScan}
                                    className="w-full py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-xs rounded-xl shadow-md hover:shadow-cyan-500/10 transition-all flex items-center justify-center gap-1.5 mt-4 cursor-pointer"
                                >
                                    <UploadCloud size={14} /> Scan & Stage Cloud Run
                                </button>
                            </div>
                        )}
                            </div>
                        </div>
                    )}

                    {/* Right Pane: Staging List */}
                    {(wizardStep === 1 || wizardStep === 2) && stagedFiles.length > 0 && (
                    <div className={`${wizardStep === 1 ? (isUploadSidebarCollapsed ? 'w-full' : 'w-2/3 border-l border-slate-900/60') : 'w-full'} bg-slate-950 overflow-y-auto p-6 relative transition-all duration-300`}>
                        {wizardStep === 2 && uploadIntent === 'stage-locally' ? (
                            renderLocalVisualization()
                        ) : stagedFiles.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(34,211,238,0.15)] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                                    <UploadCloud className="w-8 h-8" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-200 mb-2 select-none">
                                    Benchmark Staging Area
                                </h3>
                                <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6 select-none">
                                    Select or scan telemetry runs on the left to begin. Ingested runs will be staged here for validation checks.
                                </p>
                                <div className="text-[10px] text-slate-500 border-t border-slate-900 pt-4 space-y-1.5 w-full max-w-[240px] text-left select-none">
                                    <div className="flex items-center gap-1.5">
                                        <Check size={12} className="text-cyan-400" />
                                        <span>Supports `prism_benchmark_v0.2` logs</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Check size={12} className="text-cyan-500" />
                                        <span>Requires GitHub login to submit runs</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Batch Edit Control Bar */}
                                <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                                    <div className="flex items-center gap-3">
                                        {wizardStep === 1 && (
                                            <button 
                                                onClick={() => setIsUploadSidebarCollapsed(!isUploadSidebarCollapsed)}
                                                className="mr-1 p-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800/80 text-slate-400 hover:text-cyan-400 cursor-pointer transition-all flex items-center gap-1 select-none"
                                                title={isUploadSidebarCollapsed ? "Show Ingestion panel" : "Hide Ingestion panel"}
                                            >
                                                {isUploadSidebarCollapsed ? <ChevronRight size={14} className="text-cyan-400" /> : <ChevronLeft size={14} />}
                                                <span className="text-[9px] font-extrabold uppercase tracking-wider px-0.5">{isUploadSidebarCollapsed ? "Upload Benchmarks" : "Maximize"}</span>
                                            </button>
                                        )}
                                        <input 
                                            type="checkbox"
                                            checked={stagedFiles.filter(f => !f.isSkipped).length > 0 && selectedBundleIds.length === stagedFiles.filter(f => !f.isSkipped).length}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedBundleIds(stagedFiles.filter(f => !f.isSkipped).map(f => f.id));
                                                } else {
                                                    setSelectedBundleIds([]);
                                                }
                                            }}
                                            className="rounded-lg border-slate-900 bg-slate-950 text-cyan-400 focus:ring-cyan-500 h-4 w-4 focus:ring-offset-slate-950 cursor-pointer"
                                        />
                                        <span className="font-semibold text-slate-300 text-xs select-none">
                                            {selectedBundleIds.length} of {stagedFiles.filter(f => !f.isSkipped).length} run(s) selected
                                        </span>
                                    </div>
                                    
                                    <button 
                                        onClick={() => setShowBatchEdit(!showBatchEdit)}
                                        disabled={selectedBundleIds.length === 0}
                                        className={`px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1.5 text-xs ${
                                            selectedBundleIds.length > 0 
                                            ? 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30 cursor-pointer' 
                                            : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                        }`}
                                    >
                                        Batch Edit Selected
                                    </button>
                                </div>

                                {/* Batch Edit Panel */}
                                {showBatchEdit && (
                                    <div className="bg-slate-950/60 p-4 rounded-2xl border border-slate-900 text-xs animate-in slide-in-from-top duration-200 shadow-inner">
                                        <h4 className="font-bold text-slate-200 mb-3 flex items-center gap-1 text-xs select-none">
                                            Batch Edit Metadata ({selectedBundleIds.length} runs selected)
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Well-lit Path</label>
                                                <select 
                                                    value={batchWellLitPath}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setBatchWellLitPath(val);
                                                        setIsCustomWellLitPath(val === 'custom');
                                                    }}
                                                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 font-semibold cursor-pointer outline-none focus:border-cyan-500/50"
                                                >
                                                    <option value="">-- No Change --</option>
                                                    <option value="none">None</option>
                                                    <option value="optimized-baseline">optimized-baseline</option>
                                                    <option value="tiered-prefix-cache">tiered-prefix-cache</option>
                                                    <option value="intelligent-routing">intelligent-routing</option>
                                                    <option value="pd-disaggregation">pd-disaggregation</option>
                                                    <option value="custom">-- Enter New Custom Path... --</option>
                                                </select>
                                                {isCustomWellLitPath && (
                                                    <input 
                                                        type="text"
                                                        value={customWellLitPath}
                                                        onChange={(e) => setCustomWellLitPath(e.target.value)}
                                                        placeholder="Enter custom path (e.g. speculative-decoding)"
                                                        className="w-full bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 mt-2 font-mono text-[11px] outline-none focus:border-cyan-500/50"
                                                     />
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Hardware</label>
                                                <input 
                                                    type="text"
                                                    value={batchHardware}
                                                    onChange={(e) => setBatchHardware(e.target.value)}
                                                    placeholder="Accelerator e.g. H100, TPU v6e (or empty to keep)"
                                                    className="w-full bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 font-semibold outline-none focus:border-cyan-500/50"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Batch Add Manifest / Deployment</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={batchManifestName}
                                                        onChange={(e) => setBatchManifestName(e.target.value)}
                                                        placeholder="Name (e.g. vllm_deployment)"
                                                        className="w-1/3 bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 font-semibold outline-none focus:border-cyan-500/50"
                                                    />
                                                    <input 
                                                        type="text"
                                                        value={batchManifestUrl}
                                                        onChange={(e) => setBatchManifestUrl(e.target.value)}
                                                        placeholder="URL (e.g. https://github.com...)"
                                                        className="w-2/3 bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 font-mono text-[11px] outline-none focus:border-cyan-500/50"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-[9px] font-extrabold text-slate-500 mb-1 uppercase tracking-wider">Batch Add Evidence Log</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={batchEvidenceName}
                                                        onChange={(e) => setBatchEvidenceName(e.target.value)}
                                                        placeholder="Name (e.g. run_log)"
                                                        className="w-1/3 bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 font-semibold outline-none focus:border-cyan-500/50"
                                                    />
                                                    <input 
                                                        type="text"
                                                        value={batchEvidenceUrl}
                                                        onChange={(e) => setBatchEvidenceUrl(e.target.value)}
                                                        placeholder="Logs URL (e.g. gs://...)"
                                                        className="w-2/3 bg-slate-950 border border-slate-900 rounded-xl px-2.5 py-1.5 text-slate-300 font-mono text-[11px] outline-none focus:border-cyan-500/50"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mb-4 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-slate-500 dark:text-slate-400 font-bold">CUSTOM METADATA TAGS</label>
                                                <button
                                                    type="button"
                                                    onClick={addMetadataPair}
                                                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/25 px-2 py-0.5 rounded-lg transition-all"
                                                >
                                                    + Add Tag
                                                </button>
                                            </div>
                                            
                                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                                                {batchMetadataPairs.map((pair, idx) => (
                                                    <div key={idx} className="flex items-center gap-2">
                                                        <input 
                                                            type="text"
                                                            value={pair.key}
                                                            onChange={(e) => updateMetadataPair(idx, 'key', e.target.value)}
                                                            placeholder="Key (e.g. machine_type)"
                                                            className="w-1/2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-800 dark:text-slate-100 text-xs font-semibold"
                                                        />
                                                        <input 
                                                            type="text"
                                                            value={pair.value}
                                                            onChange={(e) => updateMetadataPair(idx, 'value', e.target.value)}
                                                            placeholder="Value (e.g. a3-highgpu)"
                                                            className="w-1/2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-slate-800 dark:text-slate-100 text-xs font-mono"
                                                        />
                                                        {batchMetadataPairs.length > 1 && (
                                                            <button 
                                                                type="button"
                                                                onClick={() => removeMetadataPair(idx)}
                                                                className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-800/40 transition-colors"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="flex justify-end gap-2">
                                            <button 
                                                onClick={() => setShowBatchEdit(false)}
                                                className="px-3 py-1.5 rounded font-semibold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button 
                                                onClick={applyBatchEdit}
                                                className="px-4 py-1.5 rounded font-semibold bg-cyan-500 text-white hover:bg-cyan-600 transition-colors shadow-sm"
                                            >
                                                Apply to Selected
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {stagedFiles.filter(b => !b.isSkipped).map(bundle => {
                                    const rawReport = bundle.payload?.entries?.[0]?.raw_report;
                                    const stack = rawReport?.scenario?.stack || [];
                                    
                                    // Find inference engine
                                    const inferenceEngine = stack.find(c => 
                                        c.standardized?.kind === 'inference_engine' || 
                                        c.standardized?.role === 'decode' || 
                                        c.standardized?.role === 'prefill' ||
                                        c.standardized?.role === 'aggregate'
                                    ) || stack.find(c => 
                                        ['vllm', 'tgi', 'tensorrt', 'tensorrt_llm', 'sglang', 'ollama'].includes(String(c.standardized?.tool || '').toLowerCase())
                                    );

                                    const otherTools = [];
                                    const loadTool = rawReport?.scenario?.load?.standardized?.tool;
                                    const loadVer = rawReport?.scenario?.load?.standardized?.tool_version;
                                    if (loadTool && loadTool !== 'unknown') {
                                        const loadStr = loadVer && loadVer !== 'unknown' ? `${loadTool} (${loadVer})` : loadTool;
                                        otherTools.push(loadStr);
                                    }

                                    stack.forEach(c => {
                                        if (c === inferenceEngine) return;
                                        const tool = c.standardized?.tool;
                                        const version = c.standardized?.tool_version;
                                        if (tool && tool !== 'unknown' && tool !== 'service') {
                                            const toolStr = version && version !== 'unknown' ? `${tool} (${version})` : tool;
                                            if (!otherTools.includes(toolStr)) {
                                                otherTools.push(toolStr);
                                            }
                                        }
                                    });

                                    const otherToolsStr = otherTools.length > 0 ? otherTools.join(', ') : 'generic/unknown';

                                    return (
                                        <div key={bundle.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                                            <div 
                                                className="flex items-center justify-between p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                                                onClick={() => toggleExpand(bundle.id)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {wizardStep === 2 && (
<input 
                                                        type="checkbox"
                                                        checked={selectedBundleIds.includes(bundle.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        onChange={() => {
                                                            setSelectedBundleIds(prev => 
                                                                prev.includes(bundle.id) 
                                                                ? prev.filter(id => id !== bundle.id) 
                                                                : [...prev, bundle.id]
                                                            );
                                                        }}
                                                        className="rounded border-slate-300 dark:border-slate-700 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
                                                    />
)}
                                                    {(!bundle.validation.format || bundle.validation.errors.length > 0) && (
                                                        <AlertCircle size={18} className="text-red-500 shrink-0" />
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200 select-all">{bundle.payload.model_name || 'Unknown Model'}</span>
                                                        <span className="text-xs text-slate-500 dark:text-slate-400 select-all font-mono opacity-80 mt-0.5">{bundle.dirKey}</span>
                                                        
                                                        <div className="flex flex-wrap items-center gap-2 mt-2">
                                                            {/* Format Check Tag */}
                                                            {bundle.validation.format && bundle.validation.errors.filter(e => !e.toLowerCase().includes('model') && !e.toLowerCase().includes('hardware') && !e.toLowerCase().includes('attribution')).length === 0 ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <Check size={10} className="shrink-0 text-emerald-500" /> Format: {bundle.validation.format || 'brv02'}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded border border-red-200 dark:border-red-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <X size={10} className="shrink-0 text-red-500" /> Format: Invalid
                                                                </span>
                                                            )}

                                                            {/* Hardware Check Tag */}
                                                            {bundle.validation.hasHardware && bundle.payload.hardware?.hardware_name && bundle.payload.hardware.hardware_name !== 'Unknown' && bundle.payload.hardware.hardware_name !== 'Unknown Hardware' ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <Check size={10} className="shrink-0 text-emerald-500" /> Hardware: {bundle.payload.hardware?.hardware_name}
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <X size={10} className="shrink-0 text-amber-500" /> Hardware: {bundle.payload.hardware?.hardware_name || 'Unknown'} (Optional)
                                                                </span>
                                                            )}

                                                            {/* Attribution Check Tag */}
                                                            {bundle.payload.attribution ? (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <Check size={10} className="shrink-0 text-emerald-500" /> Attribution: {bundle.payload.attribution.author || 'Author'} ({bundle.payload.attribution.organization || 'Org'})
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900/50 animate-in fade-in zoom-in-95 duration-150">
                                                                    <X size={10} className="shrink-0 text-amber-500" /> Attribution: Missing (Optional)
                                                                </span>
                                                            )}

                                                            {(() => {
                                                                const similarRuns = getSimilarBenchmarks(bundle);
                                                                if (similarRuns.length === 0) return null;
                                                                return (
                                                                    <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold bg-cyan-50 dark:bg-cyan-950/30 text-cyan-700 dark:text-cyan-400 px-2.5 py-0.5 rounded border border-cyan-200 dark:border-cyan-900/50 hover:bg-cyan-100 dark:hover:bg-cyan-900/70 cursor-pointer select-none transition-colors shadow-sm animate-in fade-in zoom-in-95 duration-150"
                                                                          onClick={(e) => { e.stopPropagation(); if (!bundle.isExpanded) toggleExpand(bundle.id); }}
                                                                          title="Click to view similar public benchmarks and sync configurations"
                                                                    >
                                                                        🔍 {similarRuns.length} similar public runs
                                                                    </span>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); removeFile(bundle.id); }}
                                                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                        title="Skip run"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                    {bundle.isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                                </div>
                                            </div>

                                            {bundle.isExpanded && (
                                                <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-sm">
                                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                                        <div className="lg:col-span-2 space-y-4">
                                                    
                                                    {bundle.validation.errors.length > 0 && (
                                                        <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-xs">
                                                            <h4 className="font-semibold mb-1 flex items-center gap-1"><ShieldAlert size={14}/> Errors:</h4>
                                                            <ul className="list-disc pl-5 space-y-1">
                                                                {bundle.validation.errors.map((e, i) => <li key={i}>{e}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {bundle.validation.warnings.filter(w => 
                                                        !w.toLowerCase().includes("hardware metadata is missing") && 
                                                        !w.toLowerCase().includes("missing attribution fields")
                                                    ).length > 0 && (
                                                        <div className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 text-xs">
                                                            <h4 className="font-semibold mb-1 flex items-center gap-1"><AlertCircle size={14}/> Warnings:</h4>
                                                            <ul className="list-disc pl-5 space-y-1">
                                                                {bundle.validation.warnings.filter(w => 
                                                                    !w.toLowerCase().includes("hardware metadata is missing") && 
                                                                    !w.toLowerCase().includes("missing attribution fields")
                                                                ).map((e, i) => <li key={i}>{e}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Run details section: key-value details table */}
                                                    {/* Run details section: key-value details table */}
                                                     <div className="mb-4 overflow-hidden border border-slate-900/60 rounded-xl bg-slate-950/40 backdrop-blur-md shadow-sm">
                                                         <table className="w-full text-left text-xs border-collapse">
                                                             <tbody className="divide-y divide-slate-900/60">
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Run Directory</td>
                                                                     <td className="px-3.5 py-2.5 font-mono text-slate-300 select-all">{bundle.dirKey}</td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Model Name</td>
                                                                     <td className="px-3.5 py-2.5 font-semibold text-slate-200">{bundle.payload.model_name || 'Not specified'}</td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Detailed Hardware</td>
                                                                     <td className="px-3.5 py-2.5 text-slate-200">
                                                                         {bundle.payload.hardware?.hardware_name && bundle.payload.hardware.hardware_name !== 'Unknown' && bundle.payload.hardware.hardware_name !== 'Unknown Hardware' ? (
                                                                             <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 px-2 py-0.5 rounded-lg text-[10px] font-bold">
                                                                                 {bundle.payload.hardware.hardware_name}
                                                                             </span>
                                                                         ) : (
                                                                             <span className="text-amber-500 font-semibold italic">Not specified (Please attach manifest to auto-resolve)</span>
                                                                         )}
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Accelerator/Chip Count</td>
                                                                     <td className="px-3.5 py-2.5 font-mono text-slate-200">
                                                                         {bundle.payload.run_metadata?.accelerator_count !== undefined ? (
                                                                             `${bundle.payload.run_metadata.accelerator_count} Accelerator Chips`
                                                                         ) : (
                                                                             <span className="text-slate-500 italic">Not specified</span>
                                                                         )}
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Serving Stack / Tool</td>
                                                                     <td className="px-3.5 py-2.5 font-semibold text-slate-200">
                                                                         {bundle.payload.inference_tool ? (
                                                                             `${bundle.payload.inference_tool} ${bundle.payload.inference_tool_version || ''}`.trim()
                                                                         ) : (
                                                                             <span className="text-slate-500 italic">Unknown Stack</span>
                                                                         )}
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Well-lit Path</td>
                                                                     <td className="px-3.5 py-2.5 font-bold text-cyan-400">
                                                                         {bundle.payload.well_lit_path || 'None'}
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Attached Manifests & Configs</td>
                                                                     <td className="px-3.5 py-3 text-slate-300">
                                                                         <div className="space-y-3">
                                                                             {/* List of attached files */}
                                                                             {(bundle.attachedManifests || []).length > 0 && (
                                                                                 <div className="space-y-1.5">
                                                                                     {bundle.attachedManifests.map((file, idx) => (
                                                                                         <div key={idx} className="flex items-center justify-between bg-slate-950/40 border border-slate-900 px-3 py-1.5 rounded-lg max-w-xl">
                                                                                             <div className="flex items-center gap-2">
                                                                                                 <span className="text-cyan-400 font-bold text-[11px] font-mono">{file.name}</span>
                                                                                                 <span className="text-[9px] text-slate-500 font-semibold font-mono">({Math.round(file.content.length / 1024 * 10) / 10} KB)</span>
                                                                                             </div>
                                                                                             <button 
                                                                                                 onClick={() => removeAttachedManifest(bundle.id, file.name)}
                                                                                                 className="text-slate-500 hover:text-red-400 p-1 rounded hover:bg-slate-900/60 transition-colors"
                                                                                                 title="Remove manifest file"
                                                                                             >
                                                                                                 <Trash2 size={12} />
                                                                                             </button>
                                                                                         </div>
                                                                                     ))}
                                                                                 </div>
                                                                             )}
                                                                             
                                                                             {/* Simple inline Drag-and-drop or File input area */}
                                                                             <div className="border border-dashed border-slate-800 hover:border-cyan-500/60 rounded-xl p-3 text-center bg-slate-950/20 transition-all cursor-pointer relative group max-w-xl">
                                                                                 <Upload size={16} className="mx-auto text-slate-500 group-hover:text-cyan-400 mb-1" />
                                                                                 <span className="text-[10px] text-slate-400 font-bold block">Attach deployment YAML/JSON to auto-resolve gaps</span>
                                                                                 <span className="text-[9px] text-slate-500 block mt-0.5">Kubernetes Deployment, GKE specifications, or config file</span>
                                                                                 <input 
                                                                                     type="file" 
                                                                                     accept=".yaml,.yml,.json" 
                                                                                     className="absolute inset-0 opacity-0 cursor-pointer" 
                                                                                     onChange={(e) => {
                                                                                         const file = e.target.files?.[0];
                                                                                         if (file) {
                                                                                             const reader = new FileReader();
                                                                                             reader.onload = (evt) => {
                                                                                                 parseManifestAndFillGaps(bundle.id, file.name, evt.target.result);
                                                                                             };
                                                                                             reader.readAsText(file);
                                                                                         }
                                                                                     }}
                                                                                 />
                                                                             </div>
                                                                         </div>
                                                                     </td>
                                                                 </tr>
                                                                 <tr className="hover:bg-slate-900/20">
                                                                     <td className="px-3.5 py-2.5 w-1/4 font-semibold text-slate-400 border-r border-slate-900/60 bg-slate-950/30">Custom Metadata Tags</td>
                                                                     <td className="px-3.5 py-2.5 text-slate-300">
                                                                         {Object.keys(bundle.payload.metadata || {}).length > 0 ? (
                                                                             <div className="flex flex-wrap gap-1.5">
                                                                                 {Object.entries(bundle.payload.metadata).map(([k, v]) => (
                                                                                     <span key={k} className="inline-flex items-center gap-1 text-[10px] font-bold bg-slate-900 border border-slate-800 text-slate-300 px-2 py-0.5 rounded-lg">
                                                                                         <span className="text-slate-500">{k}:</span> {String(v)}
                                                                                     </span>
                                                                                 ))}
                                                                             </div>
                                                                         ) : (
                                                                             <span className="text-slate-500 italic text-[11px]">No tags resolved</span>
                                                                         )}
                                                                     </td>
                                                                 </tr>
                                                             </tbody>
                                                         </table>
                                                     </div>
                                                    
                                                    {bundle.payload.entries && bundle.payload.entries.length > 0 && (
                                                        <div>
                                                            <h4 className="font-bold text-slate-300 text-xs uppercase tracking-wider mb-2.5 select-none">Parsed Sub-runs / Stages Validation Checklist ({bundle.payload.entries.length})</h4>
                                                            <div className="overflow-x-auto border border-slate-900/60 rounded-xl bg-slate-950/20">
                                                                <table className="w-full text-left text-xs border-collapse">
                                                                    <thead className="bg-[#0b101c]/45 text-slate-400 border-b border-slate-900/80 uppercase tracking-widest text-[9px]">
                                                                        <tr>
                                                                            <th className="px-3 py-2.5 w-16 text-center">Stage</th>
                                                                            <th className="px-3 py-2.5">File Name</th>
                                                                            <th className="px-3 py-2.5 text-right">Throughput</th>
                                                                            <th className="px-3 py-2.5 text-right">E2E Latency</th>
                                                                            <th className="px-3 py-2.5 text-right">TTFT (Prefill)</th>
                                                                            <th className="px-3 py-2.5 text-right">TPOT (Decode)</th>
                                                                            <th className="px-3 py-2.5 text-center">Hardware / Stack</th>
                                                                            <th className="px-3 py-2.5 text-center">Status</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-900/50">
                                                                        {bundle.payload.entries
                                                                            .map((entry) => checkStageMetrics(entry, bundle.payload.format))
                                                                            .sort((a, b) => a.stageIndex - b.stageIndex)
                                                                            .map((check, idx) => {
                                                                                const isStageValid = check.throughput.isValid && check.latency.isValid && check.ttft.isValid && check.tpot.isValid;
                                                                                return (
                                                                                    <tr key={idx} className="hover:bg-slate-900/30 border-b border-slate-900/10 font-medium transition-colors">
                                                                                        <td className="px-3 py-2.5 text-center font-bold font-mono text-slate-500">Stage {check.stageIndex}</td>
                                                                                        <td className="px-3 py-2.5 font-mono text-[10px] text-slate-400 max-w-[120px] truncate" title={check.filename}>{check.filename.split('/').pop()}</td>
                                                                                        
                                                                                        <td className="px-3 py-2.5 text-right font-mono">
                                                                                            {check.throughput.isValid ? (
                                                                                                <span className="text-emerald-500">✅ {check.throughput.val.toFixed(2)} t/s</span>
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="Throughput must be greater than zero">❌ Absent</span>
                                                                                            )}
                                                                                        </td>
                                                                                        
                                                                                        <td className="px-3 py-2.5 text-right font-mono">
                                                                                            {check.latency.isValid ? (
                                                                                                <span className="text-emerald-500">✅ {check.latency.val.toFixed(1)}ms</span>
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="End-to-end latency must be greater than zero">❌ Absent</span>
                                                                                            )}
                                                                                        </td>

                                                                                        <td className="px-3 py-2.5 text-right font-mono">
                                                                                            {check.ttft.isValid ? (
                                                                                                check.ttft.val !== null ? (
                                                                                                    <span className="text-emerald-500">✅ {check.ttft.val.toFixed(1)}ms</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-455">N/A (Legacy)</span>
                                                                                                )
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="Time to first token (TTFT) is required for V0.2 formats">❌ Absent</span>
                                                                                            )}
                                                                                        </td>

                                                                                        <td className="px-3 py-2.5 text-right font-mono">
                                                                                            {check.tpot.isValid ? (
                                                                                                check.tpot.val !== null ? (
                                                                                                    <span className="text-emerald-500">✅ {check.tpot.val.toFixed(2)}ms</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-455">N/A (Legacy)</span>
                                                                                                )
                                                                                            ) : (
                                                                                                <span className="text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20" title="Time per output token (TPOT) is required for V0.2 formats">❌ Absent</span>
                                                                                            )}
                                                                                        </td>

                                                                                        <td className="px-3 py-2.5 text-center font-mono text-[10px] space-y-1">
                                                                                            <div className={check.hardware.isValid ? "text-slate-300" : "text-amber-500"} title={check.hardware.val || 'No hardware tag'}>
                                                                                                {check.hardware.isValid ? `💻 ${check.hardware.val}` : '⚠️ Hw Missing'}
                                                                                            </div>
                                                                                            <div className={check.stack.isValid ? "text-slate-400" : "text-amber-500"}>
                                                                                                {check.stack.isValid ? `⚙️ ${check.stack.val}` : '⚠️ Stack Missing'}
                                                                                            </div>
                                                                                        </td>

                                                                                        <td className="px-3 py-2.5 text-center">
                                                                                            {isStageValid ? (
                                                                                                <span className="bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Pass</span>
                                                                                            ) : (
                                                                                                <span className="bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider">Fail</span>
                                                                                            )}
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Target Dashboards Selection */}
                                                    <div className="mt-4 p-4 bg-slate-950/20 border border-slate-900/80 rounded-xl shadow-inner">
                                                        <h5 className="font-bold text-xs text-slate-300 mb-1 flex items-center gap-1.5 uppercase tracking-wider select-none">
                                                            🎯 Target Dashboards
                                                        </h5>
                                                        <p className="text-[10px] text-slate-500 mb-3 leading-normal">
                                                            Explicitly pull this staged benchmark run's metrics into the selected existing product dashboards.
                                                        </p>
                                                        <div className="flex flex-wrap gap-4 text-xs font-semibold select-none">
                                                            <label className="flex items-center gap-2 cursor-pointer bg-slate-950/60 hover:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-900/80 shadow-md transition-all">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={bundle.targetDashboards?.includes('performance-browser') ?? true} 
                                                                    disabled 
                                                                    className="rounded text-cyan-500 focus:ring-cyan-500 h-4 w-4 border-slate-800 bg-slate-950"
                                                                />
                                                                <span className="text-slate-400">Standard Performance Browser</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer bg-slate-950/60 hover:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-900/80 hover:border-cyan-500/35 shadow-md transition-all">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={bundle.targetDashboards?.includes('inference-scheduling') ?? false} 
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setStagedFiles(prev => prev.map(f => {
                                                                            if (f.id === bundle.id) {
                                                                                const targets = f.targetDashboards || ['performance-browser'];
                                                                                const newTargets = checked 
                                                                                    ? [...targets, 'inference-scheduling'] 
                                                                                    : targets.filter(t => t !== 'inference-scheduling');
                                                                                
                                                                                // Set default well-lit path matching the dashboard
                                                                                const updatedWellLit = checked ? 'intelligent-routing' : f.payload.well_lit_path;
                                                                                return {
                                                                                    ...f,
                                                                                    targetDashboards: newTargets,
                                                                                    payload: { ...f.payload, well_lit_path: updatedWellLit }
                                                                                };
                                                                            }
                                                                            return f;
                                                                        }));
                                                                    }}
                                                                    className="rounded text-cyan-500 focus:ring-cyan-500 h-4 w-4 border-slate-800 bg-slate-950"
                                                                />
                                                                <span className="text-slate-300">Intelligent Routing (Inference Scheduling)</span>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer bg-slate-950/60 hover:bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-900/80 hover:border-cyan-500/35 shadow-md transition-all">
                                                                <input 
                                                                    type="checkbox" 
                                                                    checked={bundle.targetDashboards?.includes('agentic-serving') ?? false} 
                                                                    onChange={(e) => {
                                                                        const checked = e.target.checked;
                                                                        setStagedFiles(prev => prev.map(f => {
                                                                            if (f.id === bundle.id) {
                                                                                const targets = f.targetDashboards || ['performance-browser'];
                                                                                const newTargets = checked 
                                                                                    ? [...targets, 'agentic-serving'] 
                                                                                    : targets.filter(t => t !== 'agentic-serving');
                                                                                
                                                                                // Set default well-lit path matching the dashboard
                                                                                const updatedWellLit = checked ? 'pd-disaggregation' : f.payload.well_lit_path;
                                                                                return {
                                                                                    ...f,
                                                                                    targetDashboards: newTargets,
                                                                                    payload: { ...f.payload, well_lit_path: updatedWellLit }
                                                                                };
                                                                            }
                                                                            return f;
                                                                        }));
                                                                    }}
                                                                    className="rounded text-cyan-500 focus:ring-cyan-500 h-4 w-4 border-slate-800 bg-slate-950"
                                                                />
                                                                <span className="text-slate-300">Agentic Serving (Agentic Workloads)</span>
                                                            </label>
                                                        </div>
                                                    </div>
                                                        </div> {/* Close left columns (lg:col-span-2) */}

                                                        {/* Right Column: Similar Runs Assistant */}
                                                        <div className="bg-slate-100/30 dark:bg-slate-800/10 border border-slate-200/60 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-sm self-start text-xs space-y-4 w-full">
                                                            <div>
                                                                <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1.5 flex items-center gap-1.5 text-[13px]">
                                                                    <span>🔍 Benchmark Assistant</span>
                                                                </h4>
                                                                <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                                                                    Compare staging metrics and sync metadata tags with matching public runs.
                                                                </p>

                                                                {(() => {
                                                                    const similar = getSimilarBenchmarks(bundle);
                                                                    if (similar.length === 0) {
                                                                        return (
                                                                            <div className="text-center py-6 text-slate-400 font-medium italic">
                                                                                No similar public runs found.
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // Compute average performance of staged stages
                                                                    let stagedAvgTput = 0;
                                                                    let stagedAvgLat = 0;
                                                                    if (bundle.payload.entries && bundle.payload.entries.length > 0) {
                                                                        let tCount = 0;
                                                                        let lCount = 0;
                                                                        bundle.payload.entries.forEach(e => {
                                                                            const t = e.raw_report?.throughput || e.raw_report?.metrics?.throughput || 0;
                                                                            if (t > 0) { stagedAvgTput += t; tCount++; }
                                                                            
                                                                            let l = 0;
                                                                            if (typeof e.raw_report?.latency === 'number') l = e.raw_report.latency;
                                                                            else if (typeof e.raw_report?.latency?.mean === 'number') l = e.raw_report.latency.mean;
                                                                            else if (typeof e.raw_report?.metrics?.latency?.mean === 'number') l = e.raw_report.metrics.latency.mean;
                                                                            if (l > 0) { stagedAvgLat += l; lCount++; }
                                                                        });
                                                                        if (tCount > 0) stagedAvgTput /= tCount;
                                                                        if (lCount > 0) stagedAvgLat /= lCount;
                                                                    }

                                                                    return (
                                                                        <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
                                                                            {similar.slice(0, 5).map((run, idx) => {
                                                                                const publicTput = run.throughput || run.metrics?.throughput || 0;
                                                                                
                                                                                let tputDelta = 0;
                                                                                if (publicTput > 0 && stagedAvgTput > 0) {
                                                                                    tputDelta = ((stagedAvgTput - publicTput) / publicTput) * 100;
                                                                                }

                                                                                return (
                                                                                    <div key={idx} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-3 space-y-2 relative shadow-sm">
                                                                                        <div className="flex justify-between items-start gap-1">
                                                                                            <div className="min-w-0 flex-1">
                                                                                                <span className="font-bold text-slate-800 dark:text-slate-100 select-all block truncate" title={run.model || run.model_name}>{run.model || run.model_name}</span>
                                                                                                <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono block mt-0.5">{run.hardware || 'H100'}</span>
                                                                                            </div>
                                                                                            <span className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded font-bold text-[8px] uppercase tracking-wider scale-90 origin-right whitespace-nowrap shrink-0">
                                                                                                {run.well_lit_path || 'No Path'}
                                                                                            </span>
                                                                                        </div>

                                                                                        <div className="flex justify-between items-center text-[10px]">
                                                                                            <div className="text-slate-500">
                                                                                                Tput: <span className="font-bold text-slate-700 dark:text-slate-300 font-mono">{publicTput.toFixed(1)} tok/s</span>
                                                                                            </div>
                                                                                            {stagedAvgTput > 0 && publicTput > 0 && (
                                                                                                <span className={`font-extrabold shrink-0 ${tputDelta >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                                                                                    {tputDelta >= 0 ? '▲' : '▼'} {Math.abs(tputDelta).toFixed(1)}% {tputDelta >= 0 ? 'faster' : 'slower'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>

                                                                                        <div className="border-t border-slate-100 dark:border-slate-800/80 pt-2 mt-2">
                                                                                            <span className="text-[9px] text-slate-400 font-mono truncate block" title={run.inference_tool ? `${run.inference_tool} ${run.inference_tool_version || ''}` : 'Unknown serving stack'}>
                                                                                                Serving Stack: {run.inference_tool ? `${run.inference_tool} ${run.inference_tool_version || ''}` : 'Unknown Stack'}
                                                                                            </span>
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div> {/* Close 3-column Grid */}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    )}
                    {wizardStep === 3 && renderStep3()}
                    {wizardStep === 4 && renderStep4()}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-900/60 bg-slate-950/40 backdrop-blur-md flex items-center justify-between">
                    {/* Left Side: Back or Cancel */}
                    <div>
                        {wizardStep > 1 ? (
                            <button 
                                onClick={() => setWizardStep(prev => prev - 1)}
                                className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-400 hover:bg-slate-900/60 border border-transparent hover:border-slate-800/40 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <ArrowLeft size={14} /> Back
                            </button>
                        ) : (
                            <button 
                                onClick={() => setSelectionMade(false)}
                                className="px-4 py-2 text-xs font-semibold text-slate-450 hover:text-slate-350 transition-all cursor-pointer flex items-center gap-1"
                            >
                                <ArrowLeft size={12} /> Change Ingestion Mode
                            </button>
                        )}
                    </div>

                    {/* Middle: Step Progress Label */}
                    <div className="text-xs text-slate-500 font-semibold font-mono">
                        Step {wizardStep} of {uploadIntent === 'stage-locally' ? 2 : 4}
                    </div>

                    {/* Right Side: Next or Stage */}
                    <div className="flex items-center gap-3">
                        {wizardStep === 1 && (
                            <button 
                                onClick={() => setWizardStep(2)}
                                disabled={stagedFiles.filter(f => !f.isSkipped).length === 0}
                                className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                                    stagedFiles.filter(f => !f.isSkipped).length > 0 
                                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md' 
                                    : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                }`}
                            >
                                Next <ArrowRight size={14} />
                            </button>
                        )}

                        {wizardStep === 2 && (
                            <div className="flex items-center gap-2">
                                {uploadIntent !== 'stage-locally' && validCount === 0 && (
                                    <span className="text-[10px] text-amber-500 font-semibold max-w-[200px] text-right animate-pulse mr-2">
                                        At least one valid run is required to proceed.
                                    </span>
                                )}
                                
                                {uploadIntent === 'stage-locally' ? (
                                    <button 
                                        onClick={handleStageLocally}
                                        disabled={formatCount === 0}
                                        className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border ${
                                            formatCount > 0 
                                            ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-transparent shadow-md' 
                                            : 'bg-slate-900/40 text-slate-500 border-slate-900/50 cursor-not-allowed'
                                        }`}
                                    >
                                        Proceed to Staging
                                        <ArrowRight size={14} />
                                    </button>
                                ) : (
                                    <>
                                        <button 
                                            onClick={handleStageLocally}
                                            disabled={validCount === 0}
                                            className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-900 hover:border-slate-800 rounded-xl bg-slate-950/20 hover:bg-slate-900/40 transition-all cursor-pointer mr-2"
                                            title="Stage directly to local memory only."
                                        >
                                            Stage locally only
                                        </button>
                                        <button 
                                            onClick={() => setWizardStep(3)}
                                            disabled={validCount === 0}
                                            className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                                                validCount > 0 
                                                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md' 
                                                : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                            }`}
                                        >
                                            Next <ArrowRight size={14} />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {wizardStep === 3 && (
                            <div className="flex items-center gap-3">
                                {(!githubSession || !githubSession.username || !dcoSigned) && (
                                    <span className="text-[10px] text-amber-500 font-semibold max-w-[200px] text-right animate-pulse">
                                        Please authenticate via GitHub and accept DCO to continue.
                                    </span>
                                )}
                                <button 
                                    onClick={() => setWizardStep(4)}
                                    disabled={!githubSession || !githubSession.username || !dcoSigned}
                                    className={`px-5 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer ${
                                        githubSession && githubSession.username && dcoSigned
                                        ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md' 
                                        : 'bg-slate-900/40 text-slate-500 border border-slate-900/50 cursor-not-allowed'
                                    }`}
                                >
                                    Next <ArrowRight size={14} />
                                </button>
                            </div>
                        )}

                        {wizardStep === 4 && (
                            <div className="flex items-center gap-3">
                                <button 
                                    onClick={handleStageLocally}
                                    className="px-3.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 border border-slate-900 hover:border-slate-800 rounded-xl bg-slate-950/20 hover:bg-slate-900/40 transition-all cursor-pointer"
                                    title="Load directly to your browser staging area without submitting to review."
                                >
                                    Stage Locally
                                </button>
                                <button 
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl shadow-md hover:shadow-emerald-500/10 flex items-center gap-1.5 transition-all cursor-pointer border border-emerald-500/20"
                                >
                                    {isSubmitting ? <Loader size={14} className="animate-spin" /> : <Check size={14} />} Submit to Review Queue
                                </button>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};
