"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";

/** Имена для getElement после инициализации (без фиксированного data-gname — автоимена Google). */
const FALLBACK_GNAMES = ["standard", "search", "two-column", "searchresults-only0", "searchresults-only1"];

function resolveCx(cxProp?: string): string | undefined {
  const fromProp = cxProp?.trim();
  if (fromProp) return fromProp;
  return process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim() || undefined;
}

const isDev = process.env.NODE_ENV === "development";

function debugCse(label: string, payload?: unknown) {
  if (!isDev) return;
  console.debug(`[CSE] ${label}`, payload ?? "");
}

function getCseElement() {
  const api = window.google?.search?.cse?.element;
  if (!api?.getElement) return null;
  for (const name of FALLBACK_GNAMES) {
    const el = api.getElement(name);
    if (el && typeof el.execute === "function") return el;
  }
  const all = api.getAllElements?.();
  if (all && typeof all === "object") {
    const keys = Object.keys(all);
    debugCse("getAllElements keys", keys);
    for (const key of keys) {
      const el = all[key] as { execute?: (q: string) => void };
      if (el && typeof el.execute === "function") return el as { execute: (q: string) => void };
    }
  }
  return null;
}

function hasCseMarkup(root: HTMLElement | null): boolean {
  if (!root) return false;
  return Boolean(
    root.querySelector(
      ".gsc-control-cse, .gsc-results, .gsc-resultsbox-visible, .gsc-tabData, [id^='___gcse_']",
    ),
  );
}

/** Выдача иногда монтируется вне host (overlay); проверяем и контейнер, и страницу. */
function hasCseAnywhere(root: HTMLElement | null): boolean {
  if (hasCseMarkup(root)) return true;
  return Boolean(
    document.querySelector(
      "[id^='___gcse_'], .gsc-control-cse, .gsc-results, .gsc-resultsbox-visible",
    ),
  );
}

/** cse.js иногда подгружается с задержкой — повторяем go(), пока API не готов. */
function scheduleGo(container: HTMLElement | null) {
  if (!container) return;
  let attempts = 0;
  const max = 80;
  const tick = () => {
    const go = window.google?.search?.cse?.element?.go;
    if (typeof go === "function") {
      try {
        go(container);
        debugCse("element.go(container)", { childCount: container.children.length });
      } catch (e) {
        debugCse("element.go error", e);
      }
      return;
    }
    attempts += 1;
    if (attempts < max) setTimeout(tick, 100);
  };
  queueMicrotask(tick);
  setTimeout(tick, 0);
  setTimeout(tick, 150);
  setTimeout(tick, 400);
}

export type ProgrammableSearchEmbedHandle = {
  executeSearch: (query: string) => void;
};

type Props = {
  cx?: string;
};

/**
 * Виджет Google CSE (`gcse-search`). Узел вставляется в useLayoutEffect; скрипт и go() — в useEffect.
 * Без data-gname — используются автоимена и getAllElements для execute.
 */
export const ProgrammableSearchEmbed = forwardRef<ProgrammableSearchEmbedHandle, Props>(
  function ProgrammableSearchEmbed({ cx: cxProp }, ref) {
    const cx = resolveCx(cxProp);
    const hostRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showLoadIssue, setShowLoadIssue] = useState(false);
    const loadWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useLayoutEffect(() => {
      if (!cx || typeof window === "undefined") return;
      const host = hostRef.current;
      if (!host) return;

      host.replaceChildren();
      const gcse = document.createElement("div");
      gcse.className = "lesson-plan-cse-root gcse-search";
      gcse.setAttribute("data-as_sitesearch", "1sept.ru");
      gcse.setAttribute("data-linktarget", "_self");
      gcse.setAttribute("data-autosearchonload", "false");
      host.appendChild(gcse);

      return () => {
        host.replaceChildren();
      };
    }, [cx]);

    useEffect(() => {
      if (!cx || typeof window === "undefined") return;
      const host = hostRef.current;
      if (!host) return;

      setShowLoadIssue(false);
      if (loadWatchRef.current) clearTimeout(loadWatchRef.current);
      if (searchWatchRef.current) clearTimeout(searchWatchRef.current);

      const w = window as unknown as Record<string, boolean>;
      const scriptAlreadyLoaded = w[GCSE_SCRIPT_FLAG];

      const afterReady = () => scheduleGo(hostRef.current);

      if (scriptAlreadyLoaded && typeof window.google?.search?.cse?.element?.go === "function") {
        afterReady();
      } else if (!scriptAlreadyLoaded) {
        w[GCSE_SCRIPT_FLAG] = true;
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;
        script.onload = () => {
          debugCse("cse.js onload");
          scheduleGo(hostRef.current);
          setTimeout(() => scheduleGo(hostRef.current), 400);
          setTimeout(() => scheduleGo(hostRef.current), 1200);
        };
        document.body.appendChild(script);
      } else {
        afterReady();
      }

      loadWatchRef.current = setTimeout(() => {
        if (!hasCseAnywhere(hostRef.current)) {
          setShowLoadIssue(true);
          debugCse("таймаут: нет разметки CSE после загрузки");
        }
      }, 15000);

      return () => {
        if (loadWatchRef.current) clearTimeout(loadWatchRef.current);
        if (searchWatchRef.current) clearTimeout(searchWatchRef.current);
      };
    }, [cx]);

    useImperativeHandle(
      ref,
      () => ({
        executeSearch: (query: string) => {
          const q = query.trim();
          if (!q || !cx) return;

          setShowLoadIssue(false);
          if (searchWatchRef.current) clearTimeout(searchWatchRef.current);

          const run = () => {
            const el = getCseElement();
            if (el) {
              el.execute(q);
              debugCse("execute", { len: q.length });
              searchWatchRef.current = setTimeout(() => {
                if (!hasCseAnywhere(hostRef.current)) {
                  setShowLoadIssue(true);
                  debugCse("после поиска нет выдачи в DOM");
                }
              }, 10000);
              return true;
            }
            return false;
          };

          if (run()) return;

          if (pollRef.current) clearInterval(pollRef.current);
          let attempts = 0;
          const maxAttempts = 200;
          pollRef.current = setInterval(() => {
            attempts += 1;
            if (run() || attempts >= maxAttempts) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              if (attempts >= maxAttempts) {
                setShowLoadIssue(true);
                debugCse("execute: не найден элемент после опроса");
              }
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
          .
        </div>
      );
    }

    return (
      <div className="google-cse-panel flex min-h-[min(18rem,38vh)] w-full flex-1 flex-col overflow-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-sm">
        <p className="mb-2 text-xs text-slate-500">
          Нажмите «Найти» выше — выдача появится здесь (ограничение <span className="font-mono">site:1sept.ru</span>).
        </p>
        <div ref={hostRef} className="min-h-[12rem] w-full flex-1 bg-white" />
        {showLoadIssue ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
            Виджет Google не отобразился в блоке (блокировщик рекламы, сеть или настройки CSE). Попробуйте отключить
            блокировщик для этого сайта или откройте поиск по ссылке внизу вкладки.
          </p>
        ) : null}
      </div>
    );
  },
);
