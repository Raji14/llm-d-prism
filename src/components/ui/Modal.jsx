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

import React, { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { focusableWithin, useFocusTrap } from './useFocusTrap';

const SIZES = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
};

// Focus starts on the first control in the body (a form's first field). With
// none, on the dialog itself, never on a footer action someone could confirm
// by accident; screen readers then read the title.
const firstBodyControl = (root) => focusableWithin(root.querySelector('[data-modal-body]'))[0] || null;

export function Modal({
    isOpen,
    onClose,
    title,
    subtitle,
    size = 'md',
    footer,
    closeOnBackdrop = true,
    closeOnEscape = true,
    className,
    children,
}) {
    const dialogRef = useRef(null);
    const titleId = useId();
    const subtitleId = useId();
    useFocusTrap(dialogRef, isOpen, {
        onEscape: closeOnEscape ? onClose : undefined,
        initialFocus: firstBodyControl,
    });

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
                onClick={closeOnBackdrop ? onClose : undefined}
                aria-hidden="true"
            />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? titleId : undefined}
                aria-describedby={subtitle ? subtitleId : undefined}
                tabIndex={-1}
                className={cn(
                    'relative w-full bg-theme-card border border-theme-border rounded-2xl shadow-2xl focus:outline-none',
                    'max-h-[85vh] flex flex-col',
                    SIZES[size],
                    className
                )}
            >
                {(title || onClose) && (
                    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-theme-border shrink-0">
                        <div className="min-w-0">
                            {typeof title === 'string' ? (
                                <h3 id={titleId} className="text-base font-bold text-theme-text">{title}</h3>
                            ) : (
                                title && <div id={titleId}>{title}</div>
                            )}
                            {subtitle && <p id={subtitleId} className="text-xs text-theme-muted mt-1">{subtitle}</p>}
                        </div>
                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Close"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                )}
                <div data-modal-body className="px-6 py-4 overflow-y-auto">{children}</div>
                {footer && (
                    <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-theme-border shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}
