"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";

const GCSE_SCRIPT_FLAG = "__lessonPlanGcseScript";
const GCSE_INNER_ID = "lesson-plan-gcse-widget";

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
    for (const key of Object.keys(all)) {
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

/** Выдача уже отрисована (есть карточки или явное «пусто»). */
function cseResultsAppeared(host: HTMLElement | null): boolean {
  if (!host) return false;
  return Boolean(
    host.querySelector(
      ".gsc-webResult, .gs-webResult, .gs-no-results-result, .gsc-snippet-ellipsis, .gsc-result-info-container",
    ),
  );
}

function isCseResultLink(anchor: Element): boolean {
  return Boolean(
    anchor.closest(
      ".gsc-results, .gsc-control-cse, .lesson-plan-cse-root, [id^='___gcse_'], .gsc-results-wrapper-overlay",
    ),
  );
}

function is1septArticleUrl(href: string): boolean {
  try {
    const u = new URL(href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return u.hostname === "1sept.ru" || u.hostname.endsWith(".1sept.ru");
  } catch {
    return false;
  }
}

function unwrapGoogleRedirectUrl(href: string): string {
  try {
    const u = new URL(href);
    if (!/(^|\.)google\./i.test(u.hostname)) return href;
    const path = u.pathname.replace(/\/+$/, "");
    if (path !== "/url") return href;
    const sp = u.searchParams;
    for (const key of ["url", "q", "u"]) {
      const raw = sp.get(key);
      if (!raw) continue;
      let decoded = raw;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        decoded = raw;
      }
      if (/^https?:\/\//i.test(decoded)) {
        try {
          return new URL(decoded).href;
        } catch {
          continue;
        }
      }
    }
  } catch {
    /* ignore */
  }
  return href;
}

function getEffectiveMaterialHref(anchor: HTMLAnchorElement): string {
  const dataCt =
    anchor.getAttribute("data-cturl") ||
    anchor.getAttribute("data-ctbu") ||
    anchor.getAttribute("data-url");
  if (dataCt && /^https?:\/\//i.test(dataCt.trim())) {
    return unwrapGoogleRedirectUrl(dataCt.trim());
  }
  return unwrapGoogleRedirectUrl(anchor.href);
}

function open1septInNewTab(href: string): void {
  const w = window.open(href, "_blank");
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* ignore */
    }
  }
}

type GoGetter = () => HTMLElement | null;

function scheduleGo(getTarget: GoGetter, onGo?: () => void) {
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
      debugCse("element.go error", e);
    }
  };
  queueMicrotask(tick);
  [0, 30, 80, 150, 300, 500, 800, 1200, 2000, 3000].forEach((ms) => setTimeout(tick, ms));
}

function tryExplicitRender(divId: string): { ok: boolean } {
  const render = window.google?.search?.cse?.element?.render;
  if (typeof render !== "function") return { ok: false };
  try {
    render({ div: divId, tag: "search" });
    debugCse("element.render fallback", { divId });
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export type ProgrammableSearchEmbedHandle = {
  executeSearch: (query: string) => void;
};

type Props = {
  cx?: string;
  /** true — запрос отправлен, ждём ответ виджета; false — выдача обновилась или таймаут ожидания. */
  onSearchBusyChange?: (busy: boolean) => void;
};

export const ProgrammableSearchEmbed = forwardRef<ProgrammableSearchEmbedHandle, Props>(
  function ProgrammableSearchEmbed({ cx: cxProp, onSearchBusyChange }, ref) {
    const cx = resolveCx(cxProp);
    const hostRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const searchResultWaitRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const [showLoadIssue, setShowLoadIssue] = useState(false);
    const loadWatchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onSearchBusyChangeRef = useRef(onSearchBusyChange);

    useEffect(() => {
      onSearchBusyChangeRef.current = onSearchBusyChange;
    }, [onSearchBusyChange]);

    const innerGcseRef = useRef<HTMLDivElement | null>(null);

    const clearResultWait = () => {
      if (searchResultWaitRef.current) {
        clearInterval(searchResultWaitRef.current);
        searchResultWaitRef.current = null;
      }
    };

    const settleSearchBusy = () => {
      clearResultWait();
      onSearchBusyChangeRef.current?.(false);
    };

    const startWaitForResultsDom = () => {
      clearResultWait();
      let ticks = 0;
      const maxTicks = 55;
      searchResultWaitRef.current = setInterval(() => {
        ticks += 1;
        if (cseResultsAppeared(hostRef.current) || ticks >= maxTicks) {
          settleSearchBusy();
        }
      }, 200);
    };

    useEffect(() => {
      if (!cx) return;

      const onClickCapture = (e: MouseEvent) => {
        if (!(e.target instanceof Element)) return;
        const a = e.target.closest("a[href]");
        if (!(a instanceof HTMLAnchorElement) || !isCseResultLink(a)) return;
        if (e.defaultPrevented) return;
        if (e.button !== 0) return;

        const rawHref = a.getAttribute("href")?.trim() ?? "";
        if (!rawHref || rawHref.toLowerCase().startsWith("javascript:")) return;

        const materialHref = getEffectiveMaterialHref(a);
        if (!is1septArticleUrl(materialHref)) return;

        if (e.shiftKey || e.altKey) return;

        e.preventDefault();
        e.stopPropagation();
        open1septInNewTab(materialHref);
      };
      document.addEventListener("click", onClickCapture, true);

      return () => {
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
      /** Сначала новее; в консоли Programmable Search нужна включённая «Сортировка результатов». */
      gcse.setAttribute("data-sort_by", "date");
      gcse.setAttribute("data-enableOrderBy", "true");
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
      if (!host) return;

      setShowLoadIssue(false);
      if (loadWatchRef.current) clearTimeout(loadWatchRef.current);

      const w = window as unknown as Record<string, boolean>;
      const scriptAlreadyLoaded = w[GCSE_SCRIPT_FLAG];

      const getHost = () => hostRef.current;
      const getPreferInner = () => innerGcseRef.current ?? hostRef.current;

      const afterReady = () => {
        scheduleGo(getPreferInner);
        setTimeout(() => scheduleGo(getHost), 120);
      };

      const maybeRenderFallback = () => {
        try {
          const keys = Object.keys(window.google?.search?.cse?.element?.getAllElements?.() ?? {});
          if (keys.length > 0) return;
          const r = tryExplicitRender(GCSE_INNER_ID);
          if (r.ok) debugCse("render fallback ok");
        } catch (e) {
          debugCse("maybeRenderFallback", e);
        }
      };

      if (scriptAlreadyLoaded && typeof window.google?.search?.cse?.element?.go === "function") {
        afterReady();
        setTimeout(maybeRenderFallback, 1000);
      } else if (!scriptAlreadyLoaded) {
        w[GCSE_SCRIPT_FLAG] = true;
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://cse.google.com/cse.js?cx=${encodeURIComponent(cx)}`;
        script.onload = () => {
          debugCse("cse.js onload");
          afterReady();
          setTimeout(maybeRenderFallback, 900);
        };
        script.onerror = () => {
          setShowLoadIssue(true);
        };
        document.body.appendChild(script);
      } else {
        afterReady();
        setTimeout(maybeRenderFallback, 1000);
      }

      loadWatchRef.current = setTimeout(() => {
        if (!hasCseAnywhere(hostRef.current)) {
          setShowLoadIssue(true);
          debugCse("таймаут: нет разметки CSE после загрузки");
        }
      }, 15000);

      return () => {
        if (loadWatchRef.current) clearTimeout(loadWatchRef.current);
      };
    }, [cx]);

    useImperativeHandle(
      ref,
      () => ({
        executeSearch: (query: string) => {
          const q = query.trim();
          if (!q || !cx) return;

          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          clearResultWait();
          onSearchBusyChangeRef.current?.(true);
          setShowLoadIssue(false);

          const run = (): boolean => {
            const el = getCseElement();
            if (!el) return false;
            try {
              el.execute(q);
              debugCse("execute", { len: q.length });
              startWaitForResultsDom();
              return true;
            } catch (e) {
              debugCse("execute error", e);
              settleSearchBusy();
              return true;
            }
          };

          if (run()) {
            return;
          }

          if (pollRef.current) clearInterval(pollRef.current);
          let attempts = 0;
          const maxAttempts = 200;
          pollRef.current = setInterval(() => {
            attempts += 1;
            if (run()) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
            } else if (attempts >= maxAttempts) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setShowLoadIssue(true);
              settleSearchBusy();
              debugCse("execute: не найден элемент после опроса");
            }
          }, 100);
        },
      }),
      [cx],
    );

    useEffect(
      () => () => {
        if (pollRef.current) clearInterval(pollRef.current);
        clearResultWait();
        onSearchBusyChangeRef.current?.(false);
      },
      [],
    );

    if (!cx) {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
          Поиск материалов сейчас недоступен. Проверьте настройки приложения или обратитесь к администратору.
        </div>
      );
    }

    return (
      <div className="google-cse-panel flex min-h-[min(18rem,38vh)] w-full flex-1 flex-col overflow-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 shadow-sm">
        <div ref={hostRef} className="min-h-[12rem] w-full flex-1 bg-white" />
        {showLoadIssue ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
            Не удалось показать поиск. Проверьте подключение к интернету и обновите страницу.
          </p>
        ) : null}
      </div>
    );
  },
);
