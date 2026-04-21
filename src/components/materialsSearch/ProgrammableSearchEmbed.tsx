"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";
/** Должен совпадать с data-gname на контейнере результатов. */
const MATERIALS_CSE_GNAME = "materials1sept";

function resolveCx(cxProp?: string): string | undefined {
  const fromProp = cxProp?.trim();
  if (fromProp) return fromProp;
  return process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim() || undefined;
}

function getCseElement() {
  return window.google?.search?.cse?.element?.getElement(MATERIALS_CSE_GNAME);
}

export type ProgrammableSearchEmbedHandle = {
  /** Запускает поиск в блоке результатов (строка уже с site:1sept.ru). */
  executeSearch: (query: string) => void;
};

type Props = {
  /**
   * Идентификатор поисковой системы Google (cx). Предпочтительно передаётся с сервера из
   * GOOGLE_CUSTOM_SEARCH_ENGINE_ID — тогда не нужен NEXT_PUBLIC_ и пересборка только ради него.
   */
  cx?: string;
};

/**
 * Только блок выдачи Google (Programmable Search Element). Запрос задаётся через ref.executeSearch.
 * Не использует Custom Search JSON API — подходит, если нет биллинга в Google Cloud.
 * @see https://developers.google.com/custom-search/docs/element
 */
export const ProgrammableSearchEmbed = forwardRef<ProgrammableSearchEmbedHandle, Props>(
  function ProgrammableSearchEmbed({ cx: cxProp }, ref) {
    const cx = resolveCx(cxProp);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

    useImperativeHandle(
      ref,
      () => ({
        executeSearch: (query: string) => {
          const q = query.trim();
          if (!q || !cx) return;

          const run = () => {
            const el = getCseElement();
            if (el && typeof el.execute === "function") {
              el.execute(q);
              return true;
            }
            return false;
          };

          if (run()) return;

          if (pollRef.current) clearInterval(pollRef.current);
          let attempts = 0;
          const maxAttempts = 150;
          pollRef.current = setInterval(() => {
            attempts += 1;
            if (run() || attempts >= maxAttempts) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }, 100);
        },
      }),
      [cx],
    );

    useEffect(
      () => () => {
        if (pollRef.current) clearInterval(pollRef.current);
      },
      [],
    );

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
      <div className="google-cse-panel flex min-h-[min(18rem,38vh)] w-full flex-1 flex-col overflow-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div
          className="gcse-searchresults-only"
          data-gname={MATERIALS_CSE_GNAME}
          data-as_sitesearch="1sept.ru"
          data-linktarget="_parent"
          data-autosearchonload="false"
        />
      </div>
    );
  },
);
