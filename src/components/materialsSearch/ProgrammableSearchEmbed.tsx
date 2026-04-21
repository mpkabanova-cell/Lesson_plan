"use client";

import { useEffect } from "react";

function getCx(): string | undefined {
  return process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim() || undefined;
}

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";

/**
 * Встроенное окно поиска Google (Programmable Search Element): строка поиска + результаты на странице.
 * Не использует Custom Search JSON API — подходит, если нет биллинга в Google Cloud.
 * @see https://developers.google.com/custom-search/docs/element
 */
export function ProgrammableSearchEmbed() {
  const cx = getCx();

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
        Задайте в <code className="rounded bg-white px-1 text-xs">.env.local</code> и на хостинге переменную{" "}
        <code className="rounded bg-white px-1 text-xs">NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID</code> — тот же
        идентификатор поисковой системы (cx), что в Google Programmable Search Engine. Пересоберите приложение после
        изменения.
      </div>
    );
  }

  return (
    <div className="google-cse-panel min-h-[22rem] w-full overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="gcse-search" />
    </div>
  );
}
