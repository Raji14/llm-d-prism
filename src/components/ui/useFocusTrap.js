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

// Keyboard focus for dialogs (WAI-ARIA dialog pattern): focus moves into the
// dialog when it opens, Tab and Shift+Tab wrap inside it, Escape closes it,
// and focus goes back to whatever opened it when it closes. Modal uses it;
// hand-rolled dialogs can too:
//
//     const ref = useRef(null);
//     useFocusTrap(ref, isOpen, { onEscape: onClose });
//     <div ref={ref} role="dialog" aria-modal="true" tabIndex={-1}>…</div>
import { useEffect, useRef } from 'react';

const FOCUSABLE = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    'iframe',
    'summary',
    '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elements inside `root` that Tab can reach, in document order. */
export function focusableWithin(root) {
    if (!root) return [];
    return [...root.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'
    );
}

// Open dialogs, innermost last: only the top one handles Tab and Escape, so a
// dialog opened from another dialog doesn't fight it for focus.
const stack = [];

/**
 * @param {{ current: HTMLElement | null }} ref  The dialog element (give it tabIndex={-1}).
 * @param {boolean} active  Whether the dialog is open.
 * @param {object} [options]
 * @param {() => void} [options.onEscape]  Called on Escape (omit to leave Escape alone).
 * @param {(root: HTMLElement) => HTMLElement | null} [options.initialFocus]  Where focus
 *   starts; defaults to the dialog itself, so screen readers announce its name first.
 */
export function useFocusTrap(ref, active, { onEscape, initialFocus } = {}) {
    // Latest callbacks without re-running the trap effect (that would refocus).
    const options = useRef({ onEscape, initialFocus });
    useEffect(() => {
        options.current = { onEscape, initialFocus };
    });

    useEffect(() => {
        const root = ref.current;
        if (!active || !root) return undefined;
        const opener = document.activeElement;
        const entry = { root };
        stack.push(entry);

        // Something inside (an autoFocus field) may already hold focus.
        if (!root.contains(document.activeElement)) {
            const start = options.current.initialFocus?.(root) || root;
            start.focus({ preventScroll: start === root });
        }

        const isTop = () => stack[stack.length - 1] === entry;
        const onTab = (e) => {
            if (e.key !== 'Tab' || !isTop()) return;
            const items = focusableWithin(root);
            if (items.length === 0) {
                e.preventDefault();
                root.focus();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const current = document.activeElement;
            const outside = !root.contains(current);
            if (e.shiftKey && (outside || current === first || current === root)) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && (outside || current === last)) {
                e.preventDefault();
                first.focus();
            }
        };
        // Bubble phase: a control inside the dialog (a select, a menu) that
        // handles Escape itself calls preventDefault, and the dialog stays open.
        const onEscapeKey = (e) => {
            if (e.key !== 'Escape' || e.defaultPrevented || !isTop() || !options.current.onEscape) return;
            e.preventDefault();
            options.current.onEscape();
        };
        // Tab in the capture phase, so focus stays inside even if the page
        // stops the event before it reaches the document.
        document.addEventListener('keydown', onTab, true);
        document.addEventListener('keydown', onEscapeKey);
        return () => {
            document.removeEventListener('keydown', onTab, true);
            document.removeEventListener('keydown', onEscapeKey);
            const at = stack.indexOf(entry);
            if (at >= 0) stack.splice(at, 1);
            // Back to the trigger, if it's still on the page.
            if (opener && opener !== document.body && typeof opener.focus === 'function' && opener.isConnected) {
                opener.focus({ preventScroll: true });
            }
        };
    }, [active, ref]);
}
