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

/**
 * Standard GCP Accelerator & VM List Pricing Catalog (Hourly Rates in USD).
 * Sourced from Google Cloud list pricing in us-central1 / us-east4.
 */
export const DEFAULT_PRICING_CATALOG = {
    'nvidia-h100-80gb': {
        id: 'nvidia-h100-80gb',
        name: 'NVIDIA H100 (80GB SXM5)',
        category: 'gpu',
        vendor: 'NVIDIA',
        unitRateUsd: 3.67,
        standardVmType: 'a3-highgpu-8g',
        standardCount: 8,
        description: 'Google Cloud A3 High-GPU 8-way SXM5 VM with 200Gbps networking',
        baseNodeRateUsd: 29.36,
    },
    'nvidia-a100-80gb': {
        id: 'nvidia-a100-80gb',
        name: 'NVIDIA A100 (80GB SXM4)',
        category: 'gpu',
        vendor: 'NVIDIA',
        unitRateUsd: 2.93,
        standardVmType: 'a2-ultragpu-8g',
        standardCount: 8,
        description: 'Google Cloud A2 Ultra-GPU 8-way SXM4 VM',
        baseNodeRateUsd: 23.44,
    },
    'nvidia-a100-40gb': {
        id: 'nvidia-a100-40gb',
        name: 'NVIDIA A100 (40GB PCIe/SXM)',
        category: 'gpu',
        vendor: 'NVIDIA',
        unitRateUsd: 2.00,
        standardVmType: 'a2-highgpu-8g',
        standardCount: 8,
        description: 'Google Cloud A2 High-GPU 8-way VM',
        baseNodeRateUsd: 16.00,
    },
    'nvidia-l4': {
        id: 'nvidia-l4',
        name: 'NVIDIA L4 (24GB)',
        category: 'gpu',
        vendor: 'NVIDIA',
        unitRateUsd: 0.56,
        standardVmType: 'g2-standard-96',
        standardCount: 8,
        description: 'Google Cloud G2 Standard 96 (8x L4) or G2 Standard 12 (1x L4)',
        baseNodeRateUsd: 4.48,
    },
    'nvidia-v100': {
        id: 'nvidia-v100',
        name: 'NVIDIA V100 (16GB)',
        category: 'gpu',
        vendor: 'NVIDIA',
        unitRateUsd: 1.46,
        standardVmType: 'n1-standard-32',
        standardCount: 8,
        description: 'Google Cloud N1 Custom V100 VM',
        baseNodeRateUsd: 11.68,
    },
    'tpu-v5e': {
        id: 'tpu-v5e',
        name: 'Google TPU v5e (Lite Pod)',
        category: 'tpu',
        vendor: 'Google Cloud',
        unitRateUsd: 1.20,
        standardVmType: 'ct5lp-hightpu-4t',
        standardCount: 4,
        description: 'Google Cloud TPU v5e pod slice (1x4 or 2x4 topology)',
        baseNodeRateUsd: 4.80,
    },
    'tpu-v5p': {
        id: 'tpu-v5p',
        name: 'Google TPU v5p',
        category: 'tpu',
        vendor: 'Google Cloud',
        unitRateUsd: 4.20,
        standardVmType: 'ct5p-hightpu-4t',
        standardCount: 4,
        description: 'Google Cloud TPU v5p flagship pod slice',
        baseNodeRateUsd: 16.80,
    },
    'tpu-v6e-trillium': {
        id: 'tpu-v6e-trillium',
        name: 'Google TPU v6e (Trillium)',
        category: 'tpu',
        vendor: 'Google Cloud',
        unitRateUsd: 1.90,
        standardVmType: 'ct6e-standard-4t',
        standardCount: 4,
        description: 'Google Cloud 6th Gen Trillium TPU pod slice',
        baseNodeRateUsd: 7.60,
    },
    'other': {
        id: 'other',
        name: 'Custom / Other Accelerator',
        category: 'custom',
        vendor: 'Custom',
        unitRateUsd: 1.00,
        standardVmType: 'custom-vm',
        standardCount: 1,
        description: 'Generic accelerator baseline pricing',
        baseNodeRateUsd: 1.00,
    }
};

export const DISCOUNT_PRESETS = {
    on_demand: {
        id: 'on_demand',
        label: 'On-Demand (List Price)',
        discountPct: 0,
        description: 'Standard GCP hourly list price'
    },
    cud_1yr: {
        id: 'cud_1yr',
        label: '1-Year CUD (37% Off)',
        discountPct: 37,
        description: '1-Year Committed Use Discount for sustained cluster workloads'
    },
    cud_3yr: {
        id: 'cud_3yr',
        label: '3-Year CUD (55% Off)',
        discountPct: 55,
        description: '3-Year Committed Use Discount for production foundation clusters'
    },
    spot: {
        id: 'spot',
        label: 'Spot / Preemptible (65% Off)',
        discountPct: 65,
        description: 'Interruptible capacity for batch evaluation sweeps'
    }
};

const STORAGE_KEY = 'prism_custom_pricing_rates';
const STORAGE_PRESET_KEY = 'prism_pricing_discount_preset';

/**
 * Applies a discount preset to default pricing rates.
 */
export function calculateDiscountedRates(discountPct = 0) {
    const factor = Math.max(0, (100 - discountPct) / 100);
    const rates = {};
    Object.values(DEFAULT_PRICING_CATALOG).forEach(item => {
        rates[item.id] = Number((item.unitRateUsd * factor).toFixed(3));
    });
    return rates;
}

/**
 * Normalizes an arbitrary hardware string (e.g. '8x H100', 'L4', 'a2-ultragpu')
 * to standard accelerator catalog ID. Accelerators the catalog doesn't price
 * yet, such as TPU7x (Ironwood), L40S, H200 or B200, return 'other'.
 */
export function normalizeAcceleratorId(hardwareStr) {
    if (!hardwareStr || typeof hardwareStr !== 'string') return 'other';
    const s = hardwareStr.toLowerCase();

    if (s.includes('h100') || s.includes('a3-high') || s.includes('a3-mega')) {
        return 'nvidia-h100-80gb';
    }
    if (s.includes('a100-80') || s.includes('a100 80') || s.includes('a2-ultra') || s.includes('a2-80') || (s.includes('a100') && /80\s*gb/.test(s))) {
        return 'nvidia-a100-80gb';
    }
    if (s.includes('a100') || s.includes('a2-high')) {
        return 'nvidia-a100-40gb';
    }
    // L4 as its own token ('L4', 'nvidia-l4', '8xL4', 'L4x8'): an L40 or L40S
    // is a different GPU.
    if (/(^|[^a-z0-9]|\dx)l4(?!\d)/.test(s) || s.includes('g2-')) {
        return 'nvidia-l4';
    }
    if (s.includes('v100')) {
        return 'nvidia-v100';
    }
    // Trillium only. TPU7x (Ironwood) is a newer generation, not priced here yet.
    if (s.includes('v6e') || s.includes('trillium') || s.includes('tpu6')) {
        return 'tpu-v6e-trillium';
    }
    if (s.includes('v5p')) {
        return 'tpu-v5p';
    }
    if (s.includes('v5e') || s.includes('tpu5') || s.includes('v5-lite')) {
        return 'tpu-v5e';
    }

    return 'other';
}

/**
 * Extracts accelerator count from hardware description or explicit field.
 */
export function extractAcceleratorCount(hardwareStr, fallbackCount = 1) {
    if (typeof fallbackCount === 'number' && fallbackCount > 0) {
        return fallbackCount;
    }
    if (!hardwareStr || typeof hardwareStr !== 'string') return 1;

    const match = hardwareStr.match(/(\d+)\s*[xX]/) || hardwareStr.match(/(\d+)\s*(?:gpu|tpu|chip)/i);
    if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return 1;
}

/**
 * Loads custom hourly rate overrides from localStorage.
 */
export function loadCustomPricingRates() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch {
        // ignore parse error
    }
    return {};
}

/**
 * Saves custom hourly rate overrides to localStorage.
 */
export function saveCustomPricingRates(rates) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(rates || {}));
    } catch {
        // ignore storage error
    }
}

/**
 * Calculates total cluster hourly rate in USD given accelerator type, count, and active custom rates.
 */
export function calculateHourlyCost(acceleratorType, count = 1, customRates = {}) {
    const accId = normalizeAcceleratorId(acceleratorType);
    const catalogItem = DEFAULT_PRICING_CATALOG[accId] || DEFAULT_PRICING_CATALOG['other'];
    const safeCount = Math.max(1, typeof count === 'number' && !isNaN(count) ? count : 1);

    const unitRate = (customRates && typeof customRates[accId] === 'number')
        ? customRates[accId]
        : catalogItem.unitRateUsd;

    return Number((unitRate * safeCount).toFixed(4));
}

/**
 * Calculates Cost per 1 Million Output Tokens ($/1M tokens).
 * Formula: (Hourly Cost / (Tokens per sec * 3600)) * 1,000,000
 */
export function calculateCostPer1MTokens(hourlyCostUsd, tokensPerSec) {
    const safeRate = Number(hourlyCostUsd);
    const safeTps = Number(tokensPerSec);

    if (!safeRate || safeRate <= 0 || !safeTps || safeTps <= 0) {
        return 0;
    }

    const tokensPerHour = safeTps * 3600;
    const costPerToken = safeRate / tokensPerHour;
    const costPer1M = costPerToken * 1000000;

    return Number(costPer1M.toFixed(4));
}

/**
 * Calculates Tokens Generated per Dollar.
 * Formula: (Tokens per sec * 3600) / Hourly Cost
 */
export function calculateTokensPerDollar(hourlyCostUsd, tokensPerSec) {
    const safeRate = Number(hourlyCostUsd);
    const safeTps = Number(tokensPerSec);

    if (!safeRate || safeRate <= 0 || !safeTps || safeTps <= 0) {
        return 0;
    }

    const tokensPerHour = safeTps * 3600;
    return Math.round(tokensPerHour / safeRate);
}

function resolveStandardVmType(accId, count, defaultVmType) {
    if (accId === 'nvidia-l4') {
        if (count === 1) return 'g2-standard-12';
        if (count === 2) return 'g2-standard-24';
        if (count === 4) return 'g2-standard-48';
        return 'g2-standard-96';
    }
    if (accId === 'tpu-v6e-trillium') {
        if (count === 1) return 'ct6e-standard-1t';
        if (count === 4) return 'ct6e-standard-4t';
        if (count === 8) return 'ct6e-standard-8t';
        return `${count}x tpu-v6e`;
    }
    if (accId === 'tpu-v5e') {
        if (count === 4) return 'ct5lp-hightpu-4t';
        if (count === 8) return 'ct5lp-hightpu-8t';
        return defaultVmType;
    }
    if (accId === 'nvidia-h100-80gb' && count > 8 && count % 8 === 0) {
        return `${count / 8}x a3-highgpu-8g`;
    }
    return defaultVmType;
}

/**
 * Full Cost Breakdown object for a benchmark recipe.
 */
export function evaluateRecipeCost(hardwareStr, acceleratorCount, tokensPerSec, customRates = {}) {
    const accId = normalizeAcceleratorId(hardwareStr);
    const count = extractAcceleratorCount(hardwareStr, acceleratorCount);
    const hourlyCost = calculateHourlyCost(accId, count, customRates);
    const costPer1M = calculateCostPer1MTokens(hourlyCost, tokensPerSec);
    const tokensPerDollar = calculateTokensPerDollar(hourlyCost, tokensPerSec);
    const catalogItem = DEFAULT_PRICING_CATALOG[accId] || DEFAULT_PRICING_CATALOG['other'];
    const isCustom = Boolean(customRates && typeof customRates[accId] === 'number');

    return {
        acceleratorId: accId,
        acceleratorName: catalogItem.name,
        acceleratorCount: count,
        unitHourlyRate: isCustom ? customRates[accId] : catalogItem.unitRateUsd,
        totalHourlyCost: hourlyCost,
        costPer1MTokens: costPer1M,
        tokensPerDollar,
        isCustomPricing: isCustom,
        vendor: catalogItem.vendor,
        standardVmType: resolveStandardVmType(accId, count, catalogItem.standardVmType)
    };
}

/**
 * Returns a human-friendly label for currently active custom rates or discount preset.
 */
export function getActivePricingLabel(customRates = {}) {
    if (!customRates || Object.keys(customRates).length === 0) {
        return null;
    }

    for (const preset of Object.values(DISCOUNT_PRESETS)) {
        if (preset.discountPct > 0) {
            const presetRates = calculateDiscountedRates(preset.discountPct);
            const matches = Object.keys(DEFAULT_PRICING_CATALOG).every(id => {
                if (id === 'other') return true;
                return customRates[id] !== undefined && Math.abs(customRates[id] - presetRates[id]) < 0.02;
            });
            if (matches) return preset.label;
        }
    }
    return 'Custom Pricing Active';
}

