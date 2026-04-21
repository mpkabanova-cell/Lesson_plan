"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";

const FALLBACK_GNAMES = ["standard", "search", "two-column", "searchresults-only0", "searchresults-only1"];

function resolveCx(cxProp?: string): string | undefined {
  const fromProp = cxProp?.trim();
  if (fromProp) return fromProp;
  return process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim() || undefined;
}

function maskCx(cx: string): string {
  if (cx.length <= 8) return "••••";
  return `${cx.slice(0, 4)}…${cx.slice(-4)}`;
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

function hasCseAnywhere(root: HTMLElement | null): boolean {
  if (hasCseMarkup(root)) return true;
  return Boolean(
    document.querySelector(
      "[id^='___gcse_'], .gsc-control-cse, .gsc-results, .gsc-resultsbox-visible",
    ),
  );
}

function scheduleGo(
  container: HTMLElement | null,
  onGo?: () => void,
) {
  if (!container) return;
  let attempts = 0;
  const max = 80;
  const tick = () => {
    const go = window.google?.search?.cse?.element?.go;
    if (typeof go === "function") {
      try {
        go(container);
        onGo?.();
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

type DiagState = {
  cxMasked: string;
  script: "ожидание" | "загружен" | "ошибка" | "уже_был";
  scriptDetail: string;
  googleObject: "нет" | "да";
  goFn: "нет" | "да";
  goCount: number;
  domWidget: "нет" | "да";
  elementKeys: string;
  executeLast: string;
};

function collectSnapshot(host: HTMLElement | null): Pick<DiagState, "googleObject" | "goFn" | "domWidget" | "elementKeys"> {
  try {
    const g = typeof window !== "undefined" ? window.google : undefined;
    let keyStr = "—";
    try {
      const keys = g?.search?.cse?.element?.getAllElements?.();
      keyStr =
        keys && typeof keys === "object"
          ? Object.keys(keys as Record<string, unknown>).join(", ") || "(пусто)"
          : "—";
    } catch {
      keyStr = "ошибка getAllElements";
    }
    return {
      googleObject: g ? "да" : "нет",
      goFn: typeof g?.search?.cse?.element?.go === "function" ? "да" : "нет",
      domWidget: hasCseAnywhere(host) ? "да" : "нет",
      elementKeys: keyStr,
    };
  } catch {
    return {
      googleObject: "нет",
      goFn: "нет",
      domWidget: "нет",
      elementKeys: "ошибка снимка",
    };
  }
}

export const ProgrammableSearchEmbed = forwardRef<ProgrammableSearchEmbedHandle, Props>(
  function ProgrammableSearchEmbed({ cx: cxProp }, ref) {
    const cx = resolveCx(cxProp);
    const hostRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showLoadIssue, setShowLoadIssue] = useState(false);
    const loadWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const searchWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const goCountRef = useRef(0);

    const [diag, setDiag] = useState<DiagState>(() => ({
      cxMasked: "—",
      script: "ожидание",
      scriptDetail: "",
      googleObject: "нет",
      goFn: "нет",
      goCount: 0,
      domWidget: "нет",
      elementKeys: "—",
      executeLast: "ещё не вызывали",
    }));

    const bumpGo = useCallback(() => {
      goCountRef.current += 1;
      setDiag((d) => ({ ...d, goCount: goCountRef.current }));
    }, []);

    const refreshSnapshot = useCallback(() => {
      setDiag((d) => ({
        ...d,
        ...collectSnapshot(hostRef.current),
        goCount: goCountRef.current,
      }));
    }, []);

    useEffect(() => {
      if (!cx) return;
      setDiag((d) => ({
        ...d,
        cxMasked: maskCx(cx),
      }));
    }, [cx]);

    useEffect(() => {
      if (!cx) return;
      const t = setInterval(refreshSnapshot, 1200);
      return () => clearInterval(t);
    }, [cx, refreshSnapshot]);

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
      if (!host) {
        setDiag((d) => ({
          ...d,
          scriptDetail: "ref host пуст — перезагрузите страницу",
        }));
        return;
      }

      setShowLoadIssue(false);
      if (loadWatchRef.current) clearTimeout(loadWatchRef.current);
      if (searchWatchRef.current) clearTimeout(searchWatchRef.current);

      const w = window as unknown as Record<string, boolean>;
      const scriptAlreadyLoaded = w[GCSE_SCRIPT_FLAG];

      const afterReady = () => scheduleGo(hostRef.current, bumpGo);

      if (scriptAlreadyLoaded && typeof window.google?.search?.cse?.element?.go === "function") {
        setDiag((d) => ({
          ...d,
          script: "уже_был",
          scriptDetail: "скрипт был загружен ранее (флаг в окне)",
        }));
        afterReady();
        queueMicrotask(refreshSnapshot);
      } else if (!scriptAlreadyLoaded) {
        w[GCSE_SCRIPT_FLAG] = true;
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;
        script.onload = () => {
          setDiag((d) => ({
            ...d,
            script: "загружен",
            scriptDetail: `cx=${maskCx(cx)}`,
          }));
          debugCse("cse.js onload");
          scheduleGo(hostRef.current, bumpGo);
          setTimeout(() => scheduleGo(hostRef.current, bumpGo), 400);
          setTimeout(() => scheduleGo(hostRef.current, bumpGo), 1200);
          queueMicrotask(refreshSnapshot);
          setTimeout(refreshSnapshot, 500);
        };
        script.onerror = () => {
          setDiag((d) => ({
            ...d,
            script: "ошибка",
            scriptDetail: "Не удалось загрузить cse.google.com (сеть, блокировщик, CSP).",
          }));
          setShowLoadIssue(true);
        };
        document.body.appendChild(script);
      } else {
        setDiag((d) => ({
          ...d,
          script: "уже_был",
          scriptDetail: "флаг скрипта true, но go ещё не доступен — ждём",
        }));
        afterReady();
        queueMicrotask(refreshSnapshot);
      }

      loadWatchRef.current = setTimeout(() => {
        if (!hasCseAnywhere(hostRef.current)) {
          setShowLoadIssue(true);
          debugCse("таймаут: нет разметки CSE после загрузки");
        }
        refreshSnapshot();
      }, 15000);

      return () => {
        if (loadWatchRef.current) clearTimeout(loadWatchRef.current);
        if (searchWatchRef.current) clearTimeout(searchWatchRef.current);
      };
    }, [cx, bumpGo, refreshSnapshot]);

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
              try {
                el.execute(q);
                setDiag((d) => ({
                  ...d,
                  executeLast: `ok, ${q.length} симв.`,
                }));
                debugCse("execute", { len: q.length });
              } catch (e) {
                setDiag((d) => ({
                  ...d,
                  executeLast: `ошибка execute: ${e instanceof Error ? e.message : String(e)}`,
                }));
              }
              searchWatchRef.current = setTimeout(() => {
                if (!hasCseAnywhere(hostRef.current)) {
                  setShowLoadIssue(true);
                  setDiag((d) => ({
                    ...d,
                    executeLast: `${d.executeLast} → нет DOM выдачи за 10 с`,
                  }));
                  debugCse("после поиска нет выдачи в DOM");
                }
                refreshSnapshot();
              }, 10000);
              return true;
            }
            return false;
          };

          setDiag((d) => ({
            ...d,
            executeLast: "ищем элемент для execute…",
          }));

          if (run()) {
            refreshSnapshot();
            return;
          }

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
                setDiag((d) => ({
                  ...d,
                  executeLast: "не найден getElement/getAllElements с execute (20 с)",
                }));
                debugCse("execute: не найден элемент после опроса");
              }
              refreshSnapshot();
            }
          }, 100);
        },
      }),
      [cx, refreshSnapshot],
    );

    useEffect(
      () => () => {
        if (pollRef.current) clearInterval(pollRef.current);
      },
      [],
    );

    const copyDiag = useCallback(() => {
      const text = [
        `cx (маска): ${diag.cxMasked}`,
        `cse.js: ${diag.script} ${diag.scriptDetail}`,
        `window.google: ${diag.googleObject}`,
        `element.go: ${diag.goFn}, вызовов go: ${diag.goCount}`,
        `виджет в DOM: ${diag.domWidget}`,
        `getAllElements keys: ${diag.elementKeys}`,
        `последний поиск: ${diag.executeLast}`,
        `userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "—"}`,
      ].join("\n");
      if (navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(text).catch(() => {
          /* fallback ниже */
        });
      } else {
        window.prompt("Скопируйте текст:", text);
      }
    }, [diag]);

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

        <details className="mb-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700">
          <summary className="cursor-pointer select-none font-medium text-slate-800">
            Диагностика поиска (развернуть)
          </summary>
          <ul className="mt-2 list-inside list-disc space-y-1 font-mono text-[11px] leading-relaxed text-slate-600">
            <li>Идентификатор CSE (cx), маска: {diag.cxMasked}</li>
            <li>Скрипт cse.js: {diag.script} {diag.scriptDetail ? `— ${diag.scriptDetail}` : ""}</li>
            <li>window.google: {diag.googleObject}</li>
            <li>Функция element.go: {diag.goFn} (вызовов: {diag.goCount})</li>
            <li>Виджет в DOM (маркеры CSE): {diag.domWidget}</li>
            <li>Ключи getAllElements: {diag.elementKeys || "—"}</li>
            <li>Последний execute: {diag.executeLast}</li>
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={refreshSnapshot}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
            >
              Обновить снимок
            </button>
            <button
              type="button"
              onClick={copyDiag}
              className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-100"
            >
              Копировать в буфер
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-500">
            Если «Скрипт: ошибка» — проверьте вкладку Network (cse.js) и отключите блокировщик. Если go=нет после
            загрузки — обновите страницу. Если ключи пусты — не вызвался element.go(контейнер).
          </p>
        </details>

        <div ref={hostRef} className="min-h-[12rem] w-full flex-1 bg-white" />
        {showLoadIssue ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
            Виджет Google не отобразился в блоке (блокировщик рекламы, сеть или настройки CSE). Попробуйте отключить
            блокировщик для этого сайта или откройте поиск по ссылке внизу вкладки. Смотрите блок «Диагностика» выше.
          </p>
        ) : null}
      </div>
    );
  },
);
