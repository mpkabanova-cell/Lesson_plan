"use client";

import { useEffect, useState } from "react";
import {
  computeGenerationProgress,
  detectGenerationMode,
  type GenerationProgressState,
} from "@/lib/generationProgress";

type Props = {
  active: boolean;
  step: string | null;
  startedAt: number | null;
  /** Оценка длительности v3 (мс), если известна. */
  estimateMs?: number;
};

export function GenerationProgressPanel({ active, step, startedAt, estimateMs }: Props) {
  const [state, setState] = useState<GenerationProgressState | null>(null);

  useEffect(() => {
    if (!active || startedAt === null) {
      setState(null);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const mode = detectGenerationMode(step);
      setState(computeGenerationProgress(elapsed, step, mode, estimateMs));
    };

    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [active, step, startedAt, estimateMs]);

  if (!active || !state) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white to-indigo-50/90 px-4 py-3.5 shadow-[0_8px_32px_rgba(99,102,241,0.12)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-violet-950">{state.label}</p>
          <p className="mt-0.5 text-xs text-violet-700/90">{state.etaLabel}</p>
        </div>
        <span className="shrink-0 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold tabular-nums text-violet-700 shadow-sm ring-1 ring-violet-100">
          {state.percent}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={state.percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={state.label}
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-violet-100/80"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-violet-500 via-indigo-500 to-violet-600 transition-[width] duration-500 ease-out"
          style={{ width: `${state.percent}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-full animate-[shimmer_2s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-white/35 to-transparent"
          style={{ width: `${Math.max(state.percent, 12)}%` }}
        />
      </div>

      <ol className="mt-3 flex flex-wrap gap-1.5" aria-label="Этапы генерации">
        {state.steps.map((s, i) => {
          const done = i < state.activeStepIndex;
          const current = i === state.activeStepIndex;
          return (
            <li
              key={s.id}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide transition ${
                current
                  ? "bg-violet-600 text-white shadow-sm shadow-violet-300"
                  : done
                    ? "bg-violet-100 text-violet-800"
                    : "bg-white/70 text-slate-400 ring-1 ring-slate-100"
              }`}
            >
              {s.shortLabel}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
