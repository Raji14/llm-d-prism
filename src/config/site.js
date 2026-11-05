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

// Which Prism this is. One codebase runs as separate, independent instances:
// llm-d Prism in public, an internal Prism at Google, IBM's own, anyone's.
// Each is its own Cloud Run service with its own URL. Nothing switches between
// them at runtime (decided 2026-11-03). The deploy sets:
//   PRISM_INSTANCE        internal | public. Who can get in, and how a result
//                         becomes rankable (Official vs Published).
//   PRISM_BRAND           llm-d | prism. The logo: only llm-d Prism wears
//                         llm-d's; every other Prism shows Prism's own mark.
//   SITE_NAME             Optional name shown next to the mark, e.g. "Google Cloud".
//   PRISM_PINNED_REPORTS  Optional report ids for Home, in order (up to four).
// server/server.js injects them as window.env before the app loads, so the
// right brand shows on first paint. With nothing set, a Prism is public, wears
// its own mark and pins every built-in report.
//
// On the dev server only, ?instance=, ?brand=, ?site= and ?pinned= preview any
// combination from one server. Production builds ignore them, so a URL can't
// relabel a deployed Prism.

export const INSTANCE_MODES = ['internal', 'public'];
export const BRANDS = ['llm-d', 'prism'];
export const MAX_PINNED_REPORTS = 4;

// import.meta.env is Vite's; under plain Node (unit tests) it's undefined.
const VITE_ENV = (() => {
    try {
        return import.meta.env || {};
    } catch {
        return {};
    }
})();
const IS_DEV = Boolean(VITE_ENV.DEV);

const runtimeValue = (key) => {
    if (typeof window === 'undefined') return undefined;
    const value = window.env?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
};

const devPreview = (param) => {
    if (!IS_DEV || typeof window === 'undefined') return undefined;
    try {
        return new URLSearchParams(window.location.search).get(param) ?? undefined;
    } catch {
        return undefined;
    }
};

const firstAllowed = (allowed, ...candidates) => candidates.find((c) => allowed.includes(c));

/** internal | public. Dev preview, then the deployment, then the build, then public. */
export function readInstanceMode() {
    return firstAllowed(INSTANCE_MODES, devPreview('instance'), runtimeValue('PRISM_INSTANCE'), VITE_ENV.VITE_PRISM_INSTANCE) || 'public';
}

/** llm-d | prism. Only a deployment that asks for llm-d's logo gets it. */
export function readBrand() {
    return firstAllowed(BRANDS, devPreview('brand'), runtimeValue('PRISM_BRAND'), VITE_ENV.VITE_PRISM_BRAND) || 'prism';
}

/** The instance's name, e.g. "Google Cloud", or null. */
export function readSiteName() {
    const preview = devPreview('site');
    if (preview !== undefined) return preview.trim() || null;
    return runtimeValue('SITE_NAME') || null;
}

/** "a b,c|d" → ['a', 'b', 'c', 'd']. Spaces are what deploy.sh passes. */
export const parseReportIds = (value) =>
    String(value ?? '')
        .split(/[\s,|]+/)
        .map((id) => id.trim())
        .filter(Boolean);

/**
 * The report ids this Prism pins to Home, in order, at most four. null means
 * nothing was configured: Home shows every built-in report.
 */
export function readPinnedReports() {
    const preview = devPreview('pinned');
    const raw = preview !== undefined ? preview : runtimeValue('PRISM_PINNED_REPORTS');
    if (raw === undefined) return null;
    return [...new Set(parseReportIds(raw))].slice(0, MAX_PINNED_REPORTS);
}

/** What people call this Prism: "llm-d Prism", "Google Cloud Prism", "Prism". */
export function displayNameFor({ brand, siteName } = {}) {
    if (brand === 'llm-d') return 'llm-d Prism';
    return siteName ? `${siteName} Prism` : 'Prism';
}

/** The browser tab title. llm-d Prism keeps the title it has always had. */
export function documentTitleFor({ brand, siteName } = {}) {
    if (brand === 'llm-d') return 'Prism · llm-d inference benchmarks';
    return siteName ? `Prism · ${siteName}` : 'Prism · inference benchmarks';
}

/** Everything a page needs to know about which Prism it's on. */
export function readSiteProfile() {
    const instance = readInstanceMode();
    const brand = readBrand();
    const siteName = readSiteName();
    return {
        instance,
        brand,
        siteName,
        pinnedReports: readPinnedReports(),
        displayName: displayNameFor({ brand, siteName }),
        documentTitle: documentTitleFor({ brand, siteName }),
    };
}

/**
 * Sets the tab title and <html data-prism-instance / data-prism-brand> before
 * the first render, so the wrong brand never flashes. The favicons are Prism's
 * mark on every instance, so they don't change.
 */
export function applySiteToDocument(profile = readSiteProfile()) {
    if (typeof document === 'undefined') return profile;
    document.title = profile.documentTitle;
    document.documentElement.dataset.prismInstance = profile.instance;
    document.documentElement.dataset.prismBrand = profile.brand;
    return profile;
}
