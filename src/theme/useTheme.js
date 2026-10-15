// Copyright 2026 Google LLC
// SPDX-License-Identifier: Apache-2.0

// Prism 2.0 uses a unified light theme across the entire application.
export const THEME_STORAGE_KEY = 'prism-theme';

export function readTheme() {
    return 'light';
}

export function applyTheme() {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = 'light';
    root.style.colorScheme = 'light';
    root.classList.add('dark');
}

export function useTheme() {
    return { theme: 'light', setTheme: applyTheme, toggleTheme: applyTheme };
}
