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

import React from 'react';
import { cn } from '../../../utils/cn';

// Tooltip shell + row for recharts custom tooltips. The colored swatch carries
// series identity; text always wears text tokens, never the series color.
//
//   const MyTooltip = ({ active, payload }) => {
//       if (!active || !payload?.length) return null;
//       return (
//           <ChartTooltip title={payload[0].payload.name}>
//               {payload.map((p) => (
//                   <ChartTooltipRow key={p.dataKey} color={p.color} label={p.name} value={p.value} unit=" ms" />
//               ))}
//           </ChartTooltip>
//       );
//   };
export function ChartTooltip({ title, subtitle, className, children }) {
    return (
        <div
            className={cn(
                'surface-light bg-white/95 border border-zinc-200 text-zinc-900',
                'rounded-xl shadow-lg p-3 min-w-[200px] backdrop-blur-md z-[100]',
                className
            )}
        >
            {(title || subtitle) && (
                <div className="mb-1.5">
                    {title && <div className="text-micro font-bold text-zinc-900">{title}</div>}
                    {subtitle && <div className="text-tiny text-zinc-600 mt-0.5">{subtitle}</div>}
                </div>
            )}
            <div className="space-y-1">{children}</div>
        </div>
    );
}

// `opacity` lets stat rows (Mean/P50/P90/P99) keep the series color at the
// stat's bar opacity — see the stat-bars rule in skills/style.md.
export function ChartTooltipRow({ color, opacity = 1, label, value, unit = '' }) {
    return (
        <div className="flex items-center justify-between gap-4 text-micro">
            <div className="flex items-center gap-1.5 min-w-0">
                {color && (
                    <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: color, opacity }}
                        aria-hidden="true"
                    />
                )}
                <span className="text-zinc-700 font-medium truncate">{label}</span>
            </div>
            <span className="font-mono font-bold text-zinc-900 tabular-nums whitespace-nowrap">
                {typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value}
                {unit && <span className="text-zinc-600 font-normal ml-0.5">{unit}</span>}
            </span>
        </div>
    );
}
