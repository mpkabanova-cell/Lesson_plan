"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";
/** Стабильный id для div.gcse-search и для element.render({ div }) */
const GCSE_INNER_ID = "lesson-plan-gcse-widget";

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

/** Селекторы ссылок внутри виджета CSE (в т.ч. overlay), чтобы открывать в той же вкладке. */
const CSE_RESULT_LINK_SELECTOR = [
  ".lesson-plan-cse-root a[href]",
  ".gsc-results a[href]",
  ".gsc-control-cse a[href]",
  "[id^='___gcse_'] a[href]",
  ".gsc-results-wrapper-overlay a[href]",
].join(", ");

function normalizeCseLinksSameTab() {
  if (typeof document === "undefined") return;
  try {
    document.querySelectorAll(CSE_RESULT_LINK_SELECTOR).forEach((node) => {
      if (node instanceof HTMLAnchorElement && node.href && !node.href.toLowerCase().startsWith("javascript:")) {
        node.target = "_self";
      }
    });
  } catch {
    /* ignore */
  }
}

function isCseResultLink(anchor: Element): boolean {
  return Boolean(
    anchor.closest(
      ".gsc-results, .gsc-control-cse, .lesson-plan-cse-root, [id^='___gcse_'], .gsc-results-wrapper-overlay",
    ),
  );
}

type GoGetter = () => HTMLElement | null;

/**
 * Вызывает element.go(контейнер). Раньше передавали hostRef.current в onload — ref часто ещё null, go не вызывался.
 * Здесь getter вызывается на каждом тике + повторы по времени.
 */
function scheduleGo(getTarget: GoGetter, onGo?: () => void, onGoError?: (msg: string) => void) {
  let attempts = 0;
  const max = 150;
  const tick = () => {
    const container = getTarget();
    const go = window.google?.search?.cse?.element?.go;
    if (typeof go !== "function") {
      attempts += 1;
      if (attempts < max) setTimeout(tick, 40);
      return;
    }
    if (!container) {
      attempts += 1;
      if (attempts < max) setTimeout(tick, 40);
      return;
    }
    try {
      go(container);
      onGo?.();
      debugCse("element.go", { id: container.id, className: container.className });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onGoError?.(msg);
      debugCse("element.go error", e);
    }
  };
  queueMicrotask(tick);
  [0, 30, 80, 150, 300, 500, 800, 1200, 2000, 3000].forEach((ms) => setTimeout(tick, ms));
}

function tryExplicitRender(divId: string): { ok: boolean; error?: string } {
  const render = window.google?.search?.cse?.element?.render;
  if (typeof render !== "function") return { ok: false, error: "нет element.render" };
  try {
    render({ div: divId, tag: "search" });
    debugCse("element.render fallback", { divId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
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
  /** Запасной element.render, если go не заполнил getAllElements */
  renderFallback: string;
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
      renderFallback: "—",
    }));

    /** Узел div.gcse-search (тот же, что с id) — для go() надёжнее, чем только внешний host */
    const innerGcseRef = useRef<HTMLDivElement | null>(null);

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

    /** Google часто ставит ссылкам target=_blank, даже при data-linktarget=_self — правим DOM и перехватываем клик. */
    useEffect(() => {
      if (!cx) return;
      let raf = 0;
      const scheduleNormalize = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => normalizeCseLinksSameTab());
      };
      const mo = new MutationObserver(scheduleNormalize);
      mo.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["href", "target"],
      });
      scheduleNormalize();

      const onClickCapture = (e: MouseEvent) => {
        if (!(e.target instanceof Element)) return;
        const a = e.target.closest("a[href]");
        if (!(a instanceof HTMLAnchorElement) || !isCseResultLink(a)) return;
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        if (e.button !== 0) return;
        const linkTarget = (a.getAttribute("target") || "").toLowerCase();
        if (linkTarget === "_blank" || linkTarget === "blank") {
          e.preventDefault();
          window.location.assign(a.href);
        }
      };
      document.addEventListener("click", onClickCapture, true);

      return () => {
        cancelAnimationFrame(raf);
        mo.disconnect();
        document.removeEventListener("click", onClickCapture, true);
      };
    }, [cx]);

    useLayoutEffect(() => {
      if (!cx || typeof window === "undefined") return;
      const host = hostRef.current;
      if (!host) return;

      host.replaceChildren();
      const gcse = document.createElement("div");
      gcse.id = GCSE_INNER_ID;
      gcse.className = "lesson-plan-cse-root gcse-search";
      gcse.setAttribute("data-as_sitesearch", "1sept.ru");
      gcse.setAttribute("data-linktarget", "_self");
      gcse.setAttribute("data-autosearchonload", "false");
      host.appendChild(gcse);
      innerGcseRef.current = gcse;

      return () => {
        innerGcseRef.current = null;
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

      const getHost = () => hostRef.current;
      const getPreferInner = () => innerGcseRef.current ?? hostRef.current;

      const afterReady = () => {
        scheduleGo(getPreferInner, bumpGo, (msg) =>
          setDiag((d) => ({ ...d, executeLast: `go (inner): ${msg}` })),
        );
        setTimeout(
          () =>
            scheduleGo(getHost, bumpGo, (msg) =>
              setDiag((d) => ({ ...d, executeLast: `go (host): ${msg}` })),
            ),
          120,
        );
      };

      const maybeRenderFallback = () => {
        try {
          const keys = Object.keys(window.google?.search?.cse?.element?.getAllElements?.() ?? {});
          if (keys.length > 0) {
            setDiag((d) => ({ ...d, renderFallback: "не нужен — есть ключи" }));
            return;
          }
          const r = tryExplicitRender(GCSE_INNER_ID);
          if (r.ok) {
            bumpGo();
            setDiag((d) => ({
              ...d,
              renderFallback: "выполнен element.render({ tag: search })",
            }));
          } else {
            setDiag((d) => ({
              ...d,
              renderFallback: r.error ?? "render не вызван",
            }));
          }
        } catch (e) {
          setDiag((d) => ({
            ...d,
            renderFallback: e instanceof Error ? e.message : String(e),
          }));
        }
        refreshSnapshot();
      };

      if (scriptAlreadyLoaded && typeof window.google?.search?.cse?.element?.go === "function") {
        setDiag((d) => ({
          ...d,
          script: "уже_был",
          scriptDetail: "скрипт был загружен ранее (флаг в окне)",
        }));
        afterReady();
        setTimeout(maybeRenderFallback, 1000);
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
          afterReady();
          setTimeout(maybeRenderFallback, 900);
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
        setTimeout(maybeRenderFallback, 1000);
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
        `render fallback: ${diag.renderFallback}`,
        `последний execute/init: ${diag.executeLast}`,
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
            <li>Запасной render(): {diag.renderFallback}</li>
            <li>Последний execute / init: {diag.executeLast}</li>
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
