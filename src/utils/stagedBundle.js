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

import { v4 as uuidv4 } from 'uuid';
import { validateBenchmark } from './benchmarkValidator';

// Rebuilds the submit wizard's bundle for a locally staged benchmark_report_v0.2
// run (an entry of useDashboardData().brv02Runs) so it can be re-opened in the
// wizard for editing or submission.
export function buildStagedBundle(run) {
    const stageFiles = run.stages.map((stage) => {
        const content = typeof stage.rawReport === 'object' ? JSON.stringify(stage.rawReport) : stage.rawReport || '';
        const validation = validateBenchmark(content, stage.filename);
        return {
            file: {
                name: stage.filename,
                webkitRelativePath: `${run.runId}/${stage.filename}`,
            },
            content,
            validation,
        };
    });

    const metadataFiles = {
        run_metadata: run.run_metadata
            ? {
                  file: { name: 'run_metadata.json' },
                  content: JSON.stringify(run.run_metadata),
                  parsed: run.run_metadata,
              }
            : null,
        config: run.config
            ? {
                  file: { name: 'config.json' },
                  content: JSON.stringify(run.config),
                  parsed: run.config,
              }
            : null,
    };

    return {
        id: Math.random().toString(36).substring(7),
        dirKey: run.runId,
        name: run.runLabel,
        stageFiles,
        metadataFiles,
        payload: {
            runId: run.runId,
            format: 'brv02',
            model_name: run.model_name || run.stages[0]?.scenario?.model || 'Unknown Model',
            hardware: {
                hardware_name: run.hardware?.hardware_name || run.stages[0]?.scenario?.hardware || 'Unknown Hardware',
                accelerator_count: run.hardware?.accelerator_count ?? null,
            },
            run_metadata: run.run_metadata || null,
            entries: run.stages.map((stage) => ({
                run_id: stage.run_id || uuidv4(),
                filename: stage.filename,
                raw_report: stage.rawReport,
                stage: stage.stageIndex,
                runUid: stage.runUid,
            })),
            well_lit_path: run.wellLitPath,
        },
        validation: {
            format: 'brv02',
            errors: [],
            warnings: [],
            dcoChecked: true,
        },
        isExpanded: true,
        isSkipped: false,
        targetDashboards: run.targetDashboards || ['performance-browser'],
    };
}

// Hands bundles to the submit wizard (SubmitValidationPage), which resumes at
// its review step with the given intent ('submit-review' | 'stage-locally').
export function queueBundlesForWizard(bundles, intent) {
    try {
        localStorage.setItem('prism_active_staged_bundles', JSON.stringify(bundles));
        localStorage.setItem('prism_upload_wizard_step', '2');
        localStorage.setItem('prism_submit_intent', intent);
        return true;
    } catch (e) {
        console.error('Failed to set wizard state in localStorage:', e);
        return false;
    }
}
