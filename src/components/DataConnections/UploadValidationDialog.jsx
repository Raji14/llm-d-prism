import React, { useState } from 'react';
import { X, UploadCloud, CheckCircle, AlertCircle, FileText, ChevronRight, ChevronDown, Trash2, Upload, ShieldAlert, Check, ArrowRight, ArrowLeft, Loader } from 'lucide-react';
import { validateBenchmark, validatePrismUploadStructure } from '../../utils/benchmarkValidator';
import { parseReportV02, stageToEntry } from '../../utils/benchmarkReportV02Parser';
import yaml from 'js-yaml';
import { getBenchmarkKey } from '../../utils/dashboardHelpers';

export const UploadValidationDialog = ({ isOpen, onClose, onCommit, existingRunIds = [], initialFiles = [], addToast, loadSubmissions, publicBenchmarks = [], baselineBenchmarkKey, setBaselineBenchmarkKey, githubSession, setGithubSession }) => {
    const [stagedFiles, setStagedFiles] = useState([]);
    const [isDragging, setIsDragging] = useState(false);
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
    const [wizardStep, setWizardStep] = useState(1);
    const [dcoSigned, setDcoSigned] = useState(false);
    const [selectedReviewers, setSelectedReviewers] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [comparingBundleId, setComparingBundleId] = useState(null);

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

    const syncConfigWithPublic = (bundleId, publicRun) => {
        setStagedFiles(prev => prev.map(b => {
            if (b.id === bundleId) {
                const updatedPayload = {
                    ...b.payload,
                    well_lit_path: publicRun.well_lit_path || null,
                    inference_tool: publicRun.inference_tool || b.payload.inference_tool,
                    inference_tool_version: publicRun.inference_tool_version || b.payload.inference_tool_version
                };
                const validation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                return {
                    ...b,
                    payload: updatedPayload,
                    validation: {
                        ...b.validation,
                        errors: validation.errors,
                        warnings: validation.warnings
                    }
                };
            }
            return b;
        }));
        if (addToast) {
            addToast("Synchronized configuration tags from public run successfully.", "success");
        }
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
            isSkipped: false
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
                isSkipped: false
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
        if (isOpen) {
            const cached = localStorage.getItem('prism_staged_upload_cache');
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    setStagedFiles(parsed);
                    setWizardStep(3);
                } catch (e) {
                    console.warn("Failed to load cached staged files", e);
                    setStagedFiles([]);
                }
                localStorage.removeItem('prism_staged_upload_cache');
            } else {
                resetWizard();
                if (initialFiles && initialFiles.length > 0) {
                    processFiles(initialFiles);
                }
            }
        }
    }, [isOpen, initialFiles]);

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

    const toggleExpand = (id) => {
        setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, isExpanded: !f.isExpanded } : f));
    };

    const removeFile = (id) => {
        setStagedFiles(prev => prev.map(f => f.id === id ? { ...f, isSkipped: true } : f));
    };

    const handleStageLocally = async () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        onCommit(validBundles);
        if (addToast) addToast(`Successfully staged ${validBundles.length} runs locally.`, "success");
        onClose();
        resetWizard();
    };

    const handleSubmit = async () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        if (validBundles.length === 0) return;
        
        setIsSubmitting(true);
        try {
            // Stage files locally for immediate browser viewing
            onCommit(validBundles);
            
            // Post each run package to the local dev server `/api/local/submit`
            for (const bundle of validBundles) {
                const payload = {
                    runId: bundle.payload.runId || bundle.id || `run-${Math.random().toString(36).substr(2, 9)}`,
                    model_name: bundle.payload.model_name || "Custom Model",
                    hardware: bundle.payload.hardware || { hardware_name: "Unknown Hardware" },
                    well_lit_path: bundle.payload.well_lit_path || "none / custom",
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
            onClose();
            resetWizard();

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
            <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 bg-slate-50/30 dark:bg-slate-900/10">
                <div className="max-w-3xl mx-auto w-full space-y-6 text-slate-800 dark:text-slate-200">
                    <div>
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            Contributor Attribution & DCO
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">Accept the Developer Certificate of Origin (DCO) and verify your identity using GitHub.</p>
                    </div>

                    {!githubSession ? (
                        <div className="border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 rounded-xl p-8 shadow-sm flex flex-col items-center text-center space-y-4 max-w-xl mx-auto">
                            <div className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-600 dark:text-slate-300">
                                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0012 2z" />
                                </svg>
                            </div>
                            <div className="space-y-1.5">
                                <h4 className="font-bold text-slate-800 dark:text-slate-100">GitHub Verification Required</h4>
                                <p className="text-xs text-slate-500 max-w-sm">To ensure benchmark validity and trace contributor identity, manual entry is disabled. Please verify via GitHub OAuth to proceed.</p>
                            </div>
                            <button
                                type="button"
                                onClick={handleGithubLoginRedirect}
                                className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-sm flex items-center justify-center gap-2 shadow transition-all cursor-pointer"
                            >
                                Authenticate with GitHub
                            </button>
                        </div>
                    ) : (
                        <div className="border border-emerald-500/20 dark:border-emerald-500/30 bg-emerald-500/[0.02] rounded-xl p-5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Check className="text-emerald-500" size={14} />
                                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Authenticated via GitHub</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGithubDisconnect}
                                    className="text-[10px] text-red-500 hover:text-red-400 font-bold uppercase tracking-wider hover:bg-red-500/5 px-2 py-0.5 rounded transition-all border border-red-500/20"
                                >
                                    Disconnect
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white dark:bg-slate-900 p-4 rounded-lg border border-slate-200/60 dark:border-slate-800">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">GitHub Username</label>
                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">@{githubSession.username}</div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Contributor Name</label>
                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{githubSession.name}</div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-0.5">Verified Email</label>
                                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">{githubSession.email || 'No public email'}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* DCO Block */}
                    <div className="space-y-2">
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Developer Certificate of Origin (DCO)</label>
                        <div className="border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3 rounded-lg h-36 overflow-y-auto text-[10px] font-mono leading-relaxed text-slate-500 dark:text-slate-400">
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
                                className="mt-1"
                            />
                            <span className={`text-xs leading-normal ${!githubSession ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
                                I sign off on the Developer Certificate of Origin (DCO) and certify that these benchmark runs comply with community standards.
                            </span>
                        </label>
                    </div>

                    {/* Reviewers Selection */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Assign Reviewers</label>
                        <input 
                            type="text"
                            value={selectedReviewers.join(', ')}
                            disabled={!githubSession}
                            onChange={(e) => setSelectedReviewers(e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                            placeholder="username1, username2 (comma separated)"
                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-100 disabled:opacity-50"
                        />
                    </div>
                </div>
            </div>
        );
    };

    const renderStep4 = () => {
        const validBundles = stagedFiles.filter(b => !b.isSkipped && b.validation.format && b.validation.errors.length === 0);
        return (
            <div className="flex-1 flex flex-col p-6 overflow-y-auto space-y-6 bg-slate-50/30 dark:bg-slate-900/10">
                <div className="max-w-2xl mx-auto w-full space-y-6 text-slate-800 dark:text-slate-200">
                    <div className="text-center py-4">
                        <CheckCircle size={48} className="text-cyan-500 mx-auto mb-3" />
                        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100">Ready to Submit</h3>
                        <p className="text-xs text-slate-500 mt-1">Review the summary below before pushing to the review queue.</p>
                    </div>

                    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-4 shadow-sm">
                        <div className="flex justify-between items-center text-xs pb-3 border-b border-slate-200 dark:border-slate-700/60">
                            <span className="text-slate-400 font-medium">Total Runs Selected</span>
                            <span className="font-bold text-slate-800 dark:text-white">{validBundles.length} runs</span>
                        </div>
                        
                        <div className="space-y-3">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Staging Summary</span>
                            <div className="space-y-2 max-h-40 overflow-y-auto">
                                {validBundles.map(b => (
                                    <div key={b.id} className="flex justify-between items-center text-xs bg-slate-100 dark:bg-slate-900 px-3 py-2 rounded-lg">
                                        <span className="font-mono text-slate-600 dark:text-slate-400">{b.payload.runId || b.id}</span>
                                        <span className="text-slate-500">{b.payload.model_name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-2 pt-2">
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Attribution & Compliance</span>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <span className="text-slate-400 block mb-0.5">Contributor</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{githubSession?.name || githubSession?.username || 'Contributor'}</span>
                                </div>
                                <div>
                                    <span className="text-slate-400 block mb-0.5">GitHub User</span>
                                    <span className="font-medium text-slate-700 dark:text-slate-200">{githubSession?.username || 'Not specified'}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-slate-400 block mb-0.5">DCO Signature</span>
                                    <span className="text-emerald-650 dark:text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                                        <Check size={13} className="text-emerald-500" /> Signed and Verified
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3 text-xs leading-normal">
                        <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" size={16} />
                        <p className="text-slate-600 dark:text-slate-300">
                            By submitting, you initiate a formal pull-request style review. Prism maintainers will inspect the payload, manifests, and evidence logs before merging these results into the public Results Store.
                        </p>
                    </div>
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    const validCount = stagedFiles.filter(f => !f.isSkipped && f.validation.format && f.validation.errors.length === 0).length;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col border border-slate-200 dark:border-slate-700 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Upload size={20} className="text-cyan-500" />
                            Upload and Stage Benchmarks
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Validate and stage benchmarks before pushing to local storage or cloud.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Wizard Steps Progress Indicator */}
                <div className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-3 flex items-center justify-between">
                    <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        <span className={`flex items-center gap-1.5 ${wizardStep === 1 ? 'text-cyan-500 font-bold' : 'text-slate-400'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 1 ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>1</span>
                            Upload Sources
                        </span>
                        <ChevronRight size={12} className="text-slate-400 shrink-0" />
                        <span className={`flex items-center gap-1.5 ${wizardStep === 2 ? 'text-cyan-500 font-bold' : 'text-slate-400'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 2 ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>2</span>
                            Metadata & Validation
                        </span>
                        <ChevronRight size={12} className="text-slate-400 shrink-0" />
                        <span className={`flex items-center gap-1.5 ${wizardStep === 3 ? 'text-cyan-500 font-bold' : 'text-slate-400'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 3 ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>3</span>
                            Attribution & DCO
                        </span>
                        <ChevronRight size={12} className="text-slate-400 shrink-0" />
                        <span className={`flex items-center gap-1.5 ${wizardStep === 4 ? 'text-cyan-500 font-bold' : 'text-slate-400'}`}>
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${wizardStep === 4 ? 'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>4</span>
                            Submit & Confirm
                        </span>
                    </div>
                    {wizardStep === 2 && (
                        <div className="text-xs font-medium text-slate-500">
                            {validCount} of {stagedFiles.filter(f => !f.isSkipped).length} runs valid
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    
                    {/* Left Pane: Ingestion Source Toggle & Input */}
                    {wizardStep === 1 && (
                        <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 p-6 flex flex-col bg-slate-50/50 dark:bg-slate-900/50">
                            {/* Segmented Source Switch */}
                        <div className="mb-4 flex bg-slate-200 dark:bg-slate-800/80 p-1 rounded-lg">
                            <button 
                                onClick={() => setIngestionSource('local')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    ingestionSource === 'local' 
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                Local Ingestion
                            </button>
                            <button 
                                onClick={() => setIngestionSource('cloud')}
                                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${
                                    ingestionSource === 'cloud' 
                                    ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' 
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                            >
                                Cloud Ingestion
                            </button>
                        </div>

                        {ingestionSource === 'local' ? (
                            <div 
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onDrop={handleDrop}
                                className={`flex-1 border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-6 text-center transition-all ${
                                    isDragging 
                                    ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/10' 
                                    : 'border-slate-300 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-600'
                                }`}
                            >
                                <UploadCloud size={48} className={`mb-4 ${isDragging ? 'text-cyan-500' : 'text-slate-400'}`} />
                                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2">Drag & Drop files here</h3>
                                <p className="text-xs text-slate-500 mb-6">Supports .yaml and .json benchmark reports.</p>
                                
                                <div className="flex flex-col gap-2 w-full max-w-xs">
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors">
                                        Browse Files
                                        <input type="file" multiple accept=".yaml,.yml,.json" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>
                                    <label className="relative flex items-center justify-center px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-lg cursor-pointer transition-colors">
                                        Select Directory
                                        <input type="file" webkitdirectory="true" directory="true" multiple className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileInput} />
                                    </label>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col justify-between bg-white dark:bg-slate-800/30 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-cyan-500 font-semibold text-sm">
                                        <UploadCloud size={18} />
                                        <span>Cloud Bucket Import</span>
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400">
                                        Ingest verified benchmark runs directly from object storage (Google Cloud Storage or AWS S3).
                                    </p>
                                    
                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">PROVIDER</label>
                                        <select 
                                            value={cloudProvider}
                                            onChange={(e) => setCloudProvider(e.target.value)}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 font-medium"
                                        >
                                            <option value="gcs">Google Cloud Storage (GCS)</option>
                                            <option value="s3">Amazon Simple Storage Service (S3)</option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">BUCKET OR FOLDER PATH</label>
                                        <input 
                                            type="text"
                                            value={cloudPath}
                                            onChange={(e) => setCloudPath(e.target.value)}
                                            placeholder={cloudProvider === 'gcs' ? "gs://bucket-name/folder/path" : "s3://bucket-name/folder/path"}
                                            className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 font-mono"
                                        />
                                    </div>
                                    
                                    <div className="bg-cyan-500/5 border border-cyan-500/10 rounded p-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                                        Note: Requires matching bucket permissions or configured service account roles. Click scan to ingest.
                                    </div>
                                </div>

                                <button 
                                    onClick={handleCloudScan}
                                    className="w-full py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold text-xs rounded-lg shadow-sm transition-all flex items-center justify-center gap-1.5 mt-4"
                                >
                                    <UploadCloud size={14} /> Scan & Stage Cloud Run
                                </button>
                            </div>
                        )}
                    </div>
                    )}

                    {/* Right Pane: Staging List */}
                    {(wizardStep === 1 || wizardStep === 2) && (
                    <div className={`${wizardStep === 1 ? 'w-2/3 border-l border-slate-200 dark:border-slate-800' : 'w-full'} bg-white dark:bg-slate-900 overflow-y-auto p-6 relative`}>
                        {stagedFiles.length === 0 ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(34,211,238,0.2)] bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                                    <UploadCloud className="w-8 h-8" />
                                </div>
                                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-2">
                                    Benchmark Staging Area
                                </h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed mb-6">
                                    Select or scan telemetry runs on the left to begin. Ingested runs will be staged here for validation checks.
                                </p>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/80 pt-4 space-y-1.5 w-full max-w-[240px] text-left">
                                    <div className="flex items-center gap-1.5">
                                        <Check size={12} className="text-cyan-500" />
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
                                            className="rounded border-slate-300 dark:border-slate-700 text-cyan-500 focus:ring-cyan-500 h-4 w-4"
                                        />
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                                            {selectedBundleIds.length} of {stagedFiles.filter(f => !f.isSkipped).length} run(s) selected
                                        </span>
                                    </div>
                                    
                                    <button 
                                        onClick={() => setShowBatchEdit(!showBatchEdit)}
                                        disabled={selectedBundleIds.length === 0}
                                        className={`px-3 py-1.5 rounded font-semibold transition-all flex items-center gap-1.5 ${
                                            selectedBundleIds.length > 0 
                                            ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm border border-cyan-500/20' 
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border border-transparent cursor-not-allowed'
                                        }`}
                                    >
                                        Batch Edit Selected
                                    </button>
                                </div>

                                {/* Batch Edit Panel */}
                                {showBatchEdit && (
                                    <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-lg border border-slate-200 dark:border-slate-700 text-xs animate-in slide-in-from-top duration-200 shadow-inner">
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-3 flex items-center gap-1 text-sm">
                                            Batch Edit Metadata ({selectedBundleIds.length} runs selected)
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">WELL-LIT PATH</label>
                                                <select 
                                                    value={batchWellLitPath}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setBatchWellLitPath(val);
                                                        setIsCustomWellLitPath(val === 'custom');
                                                    }}
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium font-semibold"
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
                                                        className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 mt-2 font-mono text-xs"
                                                    />
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">HARDWARE</label>
                                                <input 
                                                    type="text"
                                                    value={batchHardware}
                                                    onChange={(e) => setBatchHardware(e.target.value)}
                                                    placeholder="Accelerator e.g. H100, TPU v6e (or empty to keep)"
                                                    className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">BATCH ADD MANIFEST / DEPLOYMENT</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={batchManifestName}
                                                        onChange={(e) => setBatchManifestName(e.target.value)}
                                                        placeholder="Name (e.g. vllm_deployment)"
                                                        className="w-1/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium"
                                                    />
                                                    <input 
                                                        type="text"
                                                        value={batchManifestUrl}
                                                        onChange={(e) => setBatchManifestUrl(e.target.value)}
                                                        placeholder="URL (e.g. https://github.com...)"
                                                        className="w-2/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono"
                                                    />
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-slate-500 dark:text-slate-400 mb-1 font-bold">BATCH ADD EVIDENCE LOG</label>
                                                <div className="flex gap-2">
                                                    <input 
                                                        type="text"
                                                        value={batchEvidenceName}
                                                        onChange={(e) => setBatchEvidenceName(e.target.value)}
                                                        placeholder="Name (e.g. run_log)"
                                                        className="w-1/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-medium"
                                                    />
                                                    <input 
                                                        type="text"
                                                        value={batchEvidenceUrl}
                                                        onChange={(e) => setBatchEvidenceUrl(e.target.value)}
                                                        placeholder="Logs URL (e.g. gs://...)"
                                                        className="w-2/3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1.5 text-slate-800 dark:text-slate-100 font-mono"
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
                                                className={`flex items-center justify-between p-3 ${wizardStep === 2 ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50' : ''}`}
                                                onClick={() => wizardStep === 2 ? toggleExpand(bundle.id) : null}
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
                                                    {wizardStep === 2 && (bundle.isExpanded ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />)}
                                                </div>
                                            </div>

                                            {wizardStep === 2 && bundle.isExpanded && (
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
                                                    <div className="mb-4 overflow-hidden border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                                                        <table className="w-full text-left text-xs border-collapse">
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Run Directory</td>
                                                                    <td className="px-3 py-2 font-mono text-slate-700 dark:text-slate-300 select-all">{bundle.dirKey}</td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Detailed Hardware</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="flex items-center gap-2">
                                                                            <input 
                                                                                type="text"
                                                                                value={bundle.payload.hardware?.hardware_name || ''}
                                                                                onChange={(e) => updateSingleField(bundle.id, 'hardware_name', e.target.value)}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-48 text-slate-800 dark:text-slate-100 font-medium"
                                                                                placeholder="Accelerator Model"
                                                                            />
                                                                            <span className="text-slate-400 dark:text-slate-500 font-medium">Chip Count:</span>
                                                                            <input 
                                                                                type="number"
                                                                                value={bundle.payload.run_metadata?.accelerator_count || ''}
                                                                                onChange={(e) => {
                                                                                    const count = parseInt(e.target.value) || 0;
                                                                                    setStagedFiles(prev => prev.map(b => {
                                                                                        if (b.id === bundle.id) {
                                                                                            const run_metadata = { ...(b.payload.run_metadata || {}), accelerator_count: count };
                                                                                            return { ...b, payload: { ...b.payload, run_metadata } };
                                                                                        }
                                                                                        return b;
                                                                                    }));
                                                                                }}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-16 text-slate-800 dark:text-slate-100 font-mono"
                                                                                placeholder="Count"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Inference Tool</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="flex items-center gap-2">
                                                                            <input 
                                                                                type="text"
                                                                                value={bundle.payload.inference_tool || ''}
                                                                                onChange={(e) => updateSingleField(bundle.id, 'inference_tool', e.target.value)}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-40 text-slate-800 dark:text-slate-100 font-medium"
                                                                                placeholder="Tool e.g. vllm"
                                                                            />
                                                                            <span className="text-slate-400 dark:text-slate-500 font-medium">Version:</span>
                                                                            <input 
                                                                                type="text"
                                                                                value={bundle.payload.inference_tool_version || ''}
                                                                                onChange={(e) => updateSingleField(bundle.id, 'inference_tool_version', e.target.value)}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-32 text-slate-800 dark:text-slate-100 font-mono"
                                                                                placeholder="Version e.g. v0.4.2"
                                                                            />
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Other Tools</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-1.5">
                                                                            {Object.entries(bundle.payload.other_tools || {}).map(([name, version]) => (
                                                                                <div key={name} className="flex items-center gap-2">
                                                                                    <input 
                                                                                        type="text" 
                                                                                        defaultValue={name}
                                                                                        onBlur={(e) => {
                                                                                            const newName = e.target.value;
                                                                                            if (!newName || newName === name) return;
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...b.payload.other_tools };
                                                                                                    const val = other_tools[name];
                                                                                                    delete other_tools[name];
                                                                                                    other_tools[newName] = val;
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                        }}
                                                                                        placeholder="Name" 
                                                                                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                    />
                                                                                    <input 
                                                                                        type="text" 
                                                                                        defaultValue={version}
                                                                                        onBlur={(e) => {
                                                                                            const newVersion = e.target.value;
                                                                                            if (newVersion === version) return;
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...b.payload.other_tools, [name]: newVersion };
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                        }}
                                                                                        placeholder="Version" 
                                                                                        className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                    />
                                                                                    <button 
                                                                                        onClick={() => {
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...(b.payload.other_tools || {}) };
                                                                                                    delete other_tools[name];
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                        }}
                                                                                        className="p-1 hover:text-red-500 rounded transition-colors text-slate-400"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-tool-name-${bundle.id}`} 
                                                                                    placeholder="Tool Name (e.g. load_tool)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                />
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-tool-version-${bundle.id}`} 
                                                                                    placeholder="Version (e.g. v0.1)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        const nameEl = document.getElementById(`new-tool-name-${bundle.id}`);
                                                                                        const versionEl = document.getElementById(`new-tool-version-${bundle.id}`);
                                                                                        if (nameEl && versionEl && nameEl.value && versionEl.value) {
                                                                                            const nameVal = nameEl.value;
                                                                                            const versionVal = versionEl.value;
                                                                                            setStagedFiles(prev => prev.map(b => {
                                                                                                if (b.id === bundle.id) {
                                                                                                    const other_tools = { ...(b.payload.other_tools || {}), [nameVal]: versionVal };
                                                                                                    return { ...b, payload: { ...b.payload, other_tools } };
                                                                                                }
                                                                                                return b;
                                                                                            }));
                                                                                            nameEl.value = '';
                                                                                            versionEl.value = '';
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-cyan-500 text-white rounded text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm"
                                                                                >
                                                                                    Add Tool
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Well-lit Path</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="flex items-center gap-2">
                                                                            <select 
                                                                                value={bundle.payload.well_lit_path && ['optimized-baseline', 'tiered-prefix-cache', 'intelligent-routing', 'pd-disaggregation'].includes(bundle.payload.well_lit_path) ? bundle.payload.well_lit_path : (bundle.payload.well_lit_path === null ? 'none' : 'custom')}
                                                                                onChange={(e) => {
                                                                                    const val = e.target.value;
                                                                                    setStagedFiles(prev => prev.map(b => {
                                                                                        if (b.id === bundle.id) {
                                                                                            const updatedPayload = {
                                                                                                ...b.payload,
                                                                                                well_lit_path: val === 'none' ? null : (val === 'custom' ? '' : val)
                                                                                            };
                                                                                            const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                                                                                            return {
                                                                                                ...b,
                                                                                                payload: updatedPayload,
                                                                                                validation: {
                                                                                                    ...b.validation,
                                                                                                    errors: uploadValidation.errors,
                                                                                                    warnings: uploadValidation.warnings
                                                                                                }
                                                                                            };
                                                                                        }
                                                                                        return b;
                                                                                    }));
                                                                                }}
                                                                                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-48 text-slate-800 dark:text-slate-100 font-semibold cursor-pointer"
                                                                            >
                                                                                <option value="none">None</option>
                                                                                <option value="optimized-baseline">optimized-baseline</option>
                                                                                <option value="tiered-prefix-cache">tiered-prefix-cache</option>
                                                                                <option value="intelligent-routing">intelligent-routing</option>
                                                                                <option value="pd-disaggregation">pd-disaggregation</option>
                                                                                <option value="custom">-- Custom Path... --</option>
                                                                            </select>
                                                                            {(bundle.payload.well_lit_path === '' || (bundle.payload.well_lit_path && !['optimized-baseline', 'tiered-prefix-cache', 'intelligent-routing', 'pd-disaggregation'].includes(bundle.payload.well_lit_path))) && (
                                                                                <input 
                                                                                    type="text"
                                                                                    value={bundle.payload.well_lit_path || ''}
                                                                                    onChange={(e) => {
                                                                                        const val = e.target.value;
                                                                                        setStagedFiles(prev => prev.map(b => {
                                                                                            if (b.id === bundle.id) {
                                                                                                const updatedPayload = {
                                                                                                    ...b.payload,
                                                                                                    well_lit_path: val
                                                                                                };
                                                                                                const uploadValidation = validatePrismUploadStructure(updatedPayload, { isUpload: false });
                                                                                                return {
                                                                                                    ...b,
                                                                                                    payload: updatedPayload,
                                                                                                    validation: {
                                                                                                        ...b.validation,
                                                                                                        errors: uploadValidation.errors,
                                                                                                        warnings: uploadValidation.warnings
                                                                                                    }
                                                                                                };
                                                                                            }
                                                                                            return b;
                                                                                        }));
                                                                                    }}
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-48 text-slate-800 dark:text-slate-100 font-mono"
                                                                                    placeholder="Enter Custom Well-lit Path"
                                                                                />
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Attribution</td>
                                                                    <td className="px-3 py-2 text-slate-500 dark:text-slate-400 italic">
                                                                        N/A (Work-in-progress)
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Manifests / Deployment</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-1.5">
                                                                            {Object.entries(bundle.payload.manifests || {}).map(([name, url]) => (
                                                                                <div key={name} className="flex items-center gap-2">
                                                                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{name}</span>
                                                                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] truncate max-w-xs">{url}</span>
                                                                                    <button 
                                                                                        onClick={() => removeManifestFromBundle(bundle.id, name)}
                                                                                        className="p-1 hover:text-red-500 rounded transition-colors text-slate-400"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-manifest-name-${bundle.id}`} 
                                                                                    placeholder="Name (e.g. vllm_deployment)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                />
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-manifest-url-${bundle.id}`} 
                                                                                    placeholder="URL e.g. https://github.com..." 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        const nameEl = document.getElementById(`new-manifest-name-${bundle.id}`);
                                                                                        const urlEl = document.getElementById(`new-manifest-url-${bundle.id}`);
                                                                                        if (nameEl && urlEl && nameEl.value && urlEl.value) {
                                                                                            addManifestToBundle(bundle.id, nameEl.value, urlEl.value);
                                                                                            nameEl.value = '';
                                                                                            urlEl.value = '';
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-cyan-500 text-white rounded text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm"
                                                                                >
                                                                                    Add Link
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Evidence Logs</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-1.5">
                                                                            {Object.entries(bundle.payload.evidence || {}).map(([name, url]) => (
                                                                                <div key={name} className="flex items-center gap-2">
                                                                                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-mono text-[10px] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">{name}</span>
                                                                                    <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px] truncate max-w-xs">{url}</span>
                                                                                    <button 
                                                                                        onClick={() => removeEvidenceFromBundle(bundle.id, name)}
                                                                                        className="p-1 hover:text-red-500 rounded transition-colors text-slate-400"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            ))}
                                                                            <div className="flex items-center gap-2 mt-1">
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-evidence-name-${bundle.id}`} 
                                                                                    placeholder="Name (e.g. run_log)" 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-40 text-slate-800 dark:text-slate-100"
                                                                                />
                                                                                <input 
                                                                                    type="text" 
                                                                                    id={`new-evidence-url-${bundle.id}`} 
                                                                                    placeholder="Logs URL e.g. gs://..." 
                                                                                    className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-[10px] w-60 text-slate-800 dark:text-slate-100 font-mono"
                                                                                />
                                                                                <button 
                                                                                    onClick={() => {
                                                                                        const nameEl = document.getElementById(`new-evidence-name-${bundle.id}`);
                                                                                        const urlEl = document.getElementById(`new-evidence-url-${bundle.id}`);
                                                                                        if (nameEl && urlEl && nameEl.value && urlEl.value) {
                                                                                            addEvidenceToBundle(bundle.id, nameEl.value, urlEl.value);
                                                                                            nameEl.value = '';
                                                                                            urlEl.value = '';
                                                                                        }
                                                                                    }}
                                                                                    className="px-2 py-1 bg-cyan-500 text-white rounded text-[10px] font-bold hover:bg-cyan-600 transition-colors shadow-sm"
                                                                                >
                                                                                    Add Link
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Well-Lit Path</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <select 
                                                                            value={bundle.payload.well_lit_path || ''}
                                                                            onChange={(e) => updateSingleField(bundle.id, 'well_lit_path', e.target.value || null)}
                                                                            className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-1 text-xs w-60 text-slate-800 dark:text-slate-100 font-semibold"
                                                                        >
                                                                            <option value="">None</option>
                                                                            <option value="optimized-baseline">optimized-baseline</option>
                                                                            <option value="tiered-prefix-cache">tiered-prefix-cache</option>
                                                                            <option value="intelligent-routing">intelligent-routing</option>
                                                                            <option value="pd-disaggregation">pd-disaggregation</option>
                                                                        </select>
                                                                    </td>
                                                                </tr>
                                                                <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-700/20 border-t border-slate-200 dark:border-slate-800">
                                                                    <td className="px-3 py-2 w-1/4 font-semibold text-slate-500 dark:text-slate-400 border-r border-slate-200 dark:border-slate-700 bg-slate-50/30 dark:bg-slate-800/20">Custom Metadata Tags</td>
                                                                    <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                                                                        <div className="space-y-2 max-w-xl">
                                                                            <div className="space-y-1.5 max-h-40 overflow-y-auto">
                                                                                {Object.entries(bundle.payload.metadata || {}).map(([k, v], idx) => (
                                                                                    <div key={idx} className="flex items-center gap-2">
                                                                                        <input 
                                                                                            type="text"
                                                                                            value={k}
                                                                                            onChange={(e) => {
                                                                                                const newKey = e.target.value.trim();
                                                                                                if (newKey === k) return;
                                                                                                const updatedMeta = { ...bundle.payload.metadata };
                                                                                                delete updatedMeta[k];
                                                                                                if (newKey) updatedMeta[newKey] = v;
                                                                                                updateSingleField(bundle.id, 'metadata', updatedMeta);
                                                                                            }}
                                                                                            placeholder="Key"
                                                                                            className="w-1/2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-100"
                                                                                        />
                                                                                        <input 
                                                                                            type="text"
                                                                                            value={String(v)}
                                                                                            onChange={(e) => {
                                                                                                const val = e.target.value.trim();
                                                                                                let parsedVal = val;
                                                                                                if (val.toLowerCase() === 'true') parsedVal = true;
                                                                                                else if (val.toLowerCase() === 'false') parsedVal = false;
                                                                                                else if (!isNaN(val) && val !== '') parsedVal = Number(val);
                                                                                                
                                                                                                const updatedMeta = { ...bundle.payload.metadata, [k]: parsedVal };
                                                                                                updateSingleField(bundle.id, 'metadata', updatedMeta);
                                                                                            }}
                                                                                            placeholder="Value"
                                                                                            className="w-1/2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2.5 py-0.5 text-xs font-mono text-slate-800 dark:text-slate-100"
                                                                                        />
                                                                                        <button 
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                const updatedMeta = { ...bundle.payload.metadata };
                                                                                                delete updatedMeta[k];
                                                                                                updateSingleField(bundle.id, 'metadata', updatedMeta);
                                                                                            }}
                                                                                            className="text-slate-400 hover:text-red-400 p-0.5 rounded hover:bg-slate-800/20 transition-colors"
                                                                                            title="Delete tag"
                                                                                        >
                                                                                            <Trash2 size={12} />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    let keyNum = 1;
                                                                                    while ((bundle.payload.metadata || {})[`new_tag_${keyNum}`] !== undefined) {
                                                                                        keyNum++;
                                                                                    }
                                                                                    const updatedMeta = { ...(bundle.payload.metadata || {}), [`new_tag_${keyNum}`]: '' };
                                                                                    updateSingleField(bundle.id, 'metadata', updatedMeta);
                                                                                }}
                                                                                className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-wider flex items-center gap-1 bg-cyan-500/5 hover:bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded transition-all mt-1"
                                                                            >
                                                                                + Add Tag
                                                                            </button>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    
                                                    {bundle.payload.entries && bundle.payload.entries.length > 0 && (
                                                        <div>
                                                            <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">Parsed Sub-runs / Stages ({bundle.payload.entries.length})</h4>
                                                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                                                                <table className="w-full text-left text-xs border-collapse">
                                                                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                                                                        <tr>
                                                                            <th className="px-3 py-2 w-16 text-center">Stage</th>
                                                                            <th className="px-3 py-2">Model</th>
                                                                            <th className="px-3 py-2 text-right">Throughput</th>
                                                                            <th className="px-3 py-2 text-right">Latency</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                                                                        {bundle.payload.entries
                                                                            .map((entry) => {
                                                                                const parsedStage = parseReportV02(entry.raw_report, entry.filename);
                                                                                const normalized = parsedStage ? stageToEntry(parsedStage) : null;
                                                                                const latencyVal = normalized?.latency && typeof normalized.latency === 'object' ? normalized.latency.mean : normalized?.latency;
                                                                                return {
                                                                                    stage: parsedStage?.stageIndex,
                                                                                    model_name: normalized?.model_name || 'Unknown',
                                                                                    throughput: normalized?.throughput,
                                                                                    latency: latencyVal,
                                                                                    uid: entry.prism_cloud?.run?.uid || ''
                                                                                };
                                                                            })
                                                                            .sort((a, b) => (a.stage ?? 0) - (b.stage ?? 0))
                                                                            .map((entry, idx) => {
                                                                                return (
                                                                                    <tr key={idx} className="hover:bg-slate-100 dark:hover:bg-slate-800/50">
                                                                                        <td className="px-3 py-2 text-center font-bold font-mono w-16 text-slate-500">Stage {entry.stage ?? '-'}</td>
                                                                                        <td className="px-3 py-2 font-medium">{entry.model_name}</td>
                                                                                        <td className="px-3 py-2 text-right font-mono">
                                                                                            {typeof entry.throughput === 'number' ? `${entry.throughput.toFixed(2)} tok/s` : '-'}
                                                                                        </td>
                                                                                        <td className="px-3 py-2 text-right font-mono">
                                                                                            {typeof entry.latency === 'number' ? `${entry.latency.toFixed(2)}ms` : '-'}
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    )}
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

                                                                                        <div className="flex justify-between items-center border-t border-slate-100 dark:border-slate-800/80 pt-2 mt-2 gap-2">
                                                                                            <span className="text-[9px] text-slate-400 font-mono truncate max-w-[100px]" title={run.inference_tool ? `${run.inference_tool} ${run.inference_tool_version || ''}` : 'Unknown serving stack'}>
                                                                                                {run.inference_tool ? `${run.inference_tool} ${run.inference_tool_version || ''}` : 'Unknown Stack'}
                                                                                            </span>
                                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                                {setBaselineBenchmarkKey && (() => {
                                                                                                    const key = getBenchmarkKey(run);
                                                                                                    const isBaseline = key === baselineBenchmarkKey;
                                                                                                    return isBaseline ? (
                                                                                                        <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[9px] font-extrabold flex items-center gap-0.5 whitespace-nowrap">
                                                                                                            ✔ Baseline
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <button
                                                                                                            onClick={() => {
                                                                                                                setBaselineBenchmarkKey(key);
                                                                                                                if (addToast) addToast("Selected public run as comparison baseline.", "success");
                                                                                                            }}
                                                                                                            className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded text-[9px] font-bold transition-all shadow-sm cursor-pointer"
                                                                                                            title="Set as baseline for comparison charts"
                                                                                                        >
                                                                                                            Set Baseline
                                                                                                        </button>
                                                                                                    );
                                                                                                })()}
                                                                                                <button
                                                                                                    onClick={() => syncConfigWithPublic(bundle.id, run)}
                                                                                                    className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-500 border border-cyan-500/20 hover:bg-cyan-500 hover:text-white rounded text-[9px] font-extrabold transition-all shadow-sm cursor-pointer shrink-0"
                                                                                                >
                                                                                                    Sync Config
                                                                                                </button>
                                                                                            </div>
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
                <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between">
                    {/* Left Side: Back or Cancel */}
                    <div>
                        {wizardStep > 1 ? (
                            <button 
                                onClick={() => setWizardStep(prev => prev - 1)}
                                className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                <ArrowLeft size={14} /> Back
                            </button>
                        ) : (
                            <button 
                                onClick={onClose}
                                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                        )}
                    </div>

                    {/* Middle: Step Progress Label */}
                    <div className="text-xs text-slate-400 font-medium">
                        Step {wizardStep} of 4
                    </div>

                    {/* Right Side: Next or Submit */}
                    <div className="flex items-center gap-3">
                        {/* Option to Stage Locally (A/B Test) directly in step 2 */}
                        {wizardStep === 2 && (
                            <button 
                                onClick={handleStageLocally}
                                disabled={validCount === 0}
                                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg transition-all cursor-pointer mr-2"
                                title="Load directly to the charts for A/B testing, bypassing the review queue."
                            >
                                Stage locally only (A/B test)
                            </button>
                        )}

                        {wizardStep === 1 && (
                            <button 
                                onClick={() => setWizardStep(2)}
                                disabled={stagedFiles.filter(f => !f.isSkipped).length === 0}
                                className={`px-5 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                    stagedFiles.filter(f => !f.isSkipped).length > 0 
                                    ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm' 
                                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                }`}
                            >
                                Next <ArrowRight size={14} />
                            </button>
                        )}

                        {wizardStep === 2 && (
                            <div className="flex items-center gap-3">
                                {validCount === 0 && (
                                    <span className="text-[10px] text-amber-500 font-semibold max-w-[200px] text-right animate-pulse">
                                        At least one valid run is required to proceed.
                                    </span>
                                )}
                                <button 
                                    onClick={() => setWizardStep(3)}
                                    disabled={validCount === 0}
                                    className={`px-5 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                        validCount > 0 
                                        ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm' 
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                                    }`}
                                >
                                    Next <ArrowRight size={14} />
                                </button>
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
                                    className={`px-5 py-2 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                                        githubSession && githubSession.username && dcoSigned
                                        ? 'bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm' 
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
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
                                    className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 rounded-lg transition-all cursor-pointer"
                                    title="Load directly to your browser staging area without submitting to review."
                                >
                                    Stage Locally
                                </button>
                                <button 
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                    className="px-5 py-2 text-xs font-bold bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
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
