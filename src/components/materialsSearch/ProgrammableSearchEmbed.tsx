"use client";

import { useEffect } from "react";

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";

function resolveCx(cxProp?: string): string | undefined {
  const fromProp = cxProp?.trim();
  if (fromProp) return fromProp;
  return process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim() || undefined;
}

type Props = {
  /**
   * Идентификатор поисковой системы Google (cx). Предпочтительно передаётся с сервера из
   * GOOGLE_CUSTOM_SEARCH_ENGINE_ID — тогда не нужен NEXT_PUBLIC_ и пересборка только ради него.
   */
  cx?: string;
};

/**
 * Встроенное окно поиска Google (Programmable Search Element): строка поиска + результаты на странице.
 * Не использует Custom Search JSON API — подходит, если нет биллинга в Google Cloud.
 * @see https://developers.google.com/custom-search/docs/element
 */
export function ProgrammableSearchEmbed({ cx: cxProp }: Props) {
  const cx = resolveCx(cxProp);

  useEffect(() => {
    if (!cx || typeof window === "undefined") return;

    const w = window as unknown as Record<string, boolean>;
    if (w[GCSE_SCRIPT_FLAG]) return;
    w[GCSE_SCRIPT_FLAG] = true;

    const script = document.createElement("script");
    script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;
    script.async = true;
    document.body.appendChild(script);
  }, [cx]);

  if (!cx) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        Не задан идентификатор поисковой системы Google (cx). В корне проекта в{" "}
        <code className="rounded bg-white px-1 text-xs">.env.local</code> и на хостинге укажите{" "}
        <code className="rounded bg-white px-1 text-xs">GOOGLE_CUSTOM_SEARCH_ENGINE_ID</code> — тот же Search engine ID,
        что в{" "}
        <a
          href="https://programmablesearchengine.google.com"
          className="font-medium text-teal-800 underline underline-offset-2"
          target="_blank"
          rel="noopener noreferrer"
        >
          Programmable Search Engine
        </a>
        . Либо <code className="rounded bg-white px-1 text-xs">NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID</code> с тем
        же значением (после изменения <code className="rounded bg-white px-1 text-xs">NEXT_PUBLIC_</code> нужна
        пересборка). Перезапустите dev-сервер или сделайте redeploy.
      </div>
    );
  }

  return (
    <div className="google-cse-panel min-h-[22rem] w-full overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="gcse-search" />
    </div>
  );
}
