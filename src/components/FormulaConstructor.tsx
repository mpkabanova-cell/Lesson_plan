"use client";

import type { Editor } from "@tiptap/core";
import katex from "katex";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FORMULA_TEMPLATES } from "@/lib/formulaTemplates";

type Props = {
  editor: Editor;
};

export function FormulaConstructor({ editor }: Props) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [latex, setLatex] = useState("");
  const [previewHtml, setPreviewHtml] = useState("");
  const titleId = useId();
  const panelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanelOpen(false);
        setDialogOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /** Тулбар с overflow-x-auto обрезает выпадающий блок; панель рендерим в body с position: fixed. */
  useLayoutEffect(() => {
    if (!panelOpen) {
      setPanelPos(null);
      return;
    }
    const el = panelButtonRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const maxW = Math.min(window.innerWidth - 16, 352);
      let left = r.left;
      if (left + maxW > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - maxW - 8);
      }
      if (left < 8) left = 8;
      setPanelPos({ top: r.bottom + 6, left, width: maxW });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [panelOpen]);

  useEffect(() => {
    if (!latex.trim()) {
      setPreviewHtml("");
      return;
    }
    try {
      setPreviewHtml(katex.renderToString(latex, { throwOnError: false, displayMode: false }));
    } catch {
      setPreviewHtml("");
    }
  }, [latex]);

  const openDialog = (initial: string) => {
    setLatex(initial);
    setDialogOpen(true);
    setPanelOpen(false);
  };

  const insert = () => {
    const t = latex.trim();
    if (!t) return;
    editor
      .chain()
      .focus()
      .insertContent({ type: "inlineMath", attrs: { latex: t } })
      .run();
    setDialogOpen(false);
    setLatex("");
  };

  return (
    <>
      <div className="relative">
        <button
          ref={panelButtonRef}
          type="button"
          title="Конструктор формул"
          onClick={() => setPanelOpen((o) => !o)}
          className={`flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-md text-sm transition ${
            panelOpen
              ? "bg-slate-200 text-slate-900 shadow-inner"
              : "text-slate-800 hover:bg-slate-100"
          }`}
        >
          <span className="font-serif text-[15px] font-bold leading-none" aria-hidden>
            ∑
          </span>
        </button>
      </div>

      {panelOpen && panelPos && typeof document !== "undefined"
        ? createPortal(
            <>
              <button
                type="button"
                className="fixed inset-0 z-[200] cursor-default bg-black/20"
                aria-label="Закрыть панель"
                onClick={() => setPanelOpen(false)}
              />
              <div
                className="fixed z-[210] max-h-[min(50vh,360px)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
                style={{
                  top: panelPos.top,
                  left: panelPos.left,
                  width: panelPos.width,
                }}
                onMouseDown={(e) => e.preventDefault()}
              >
                <div className="flex items-start gap-2 border-b border-slate-100 pb-2">
                  <span className="font-serif text-xl leading-none text-slate-700">∑</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Формулы</p>
                    <p className="text-[11px] text-slate-500">Вставить LaTeX шаблон</p>
                  </div>
                </div>

                <div className="mt-3 grid max-h-[min(40vh,280px)] grid-cols-4 gap-1.5 overflow-y-auto pr-0.5">
                  {FORMULA_TEMPLATES.map((t) => (
                    <button
                      key={`${t.label}-${t.latex}`}
                      type="button"
                      title={t.latex}
                      onClick={() => openDialog(t.latex)}
                      className="flex min-h-[3.25rem] flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50/90 px-0.5 py-1.5 text-center transition hover:border-teal-500 hover:bg-teal-50/80"
                    >
                      <span className="font-serif text-[15px] font-semibold leading-tight text-slate-900">
                        {t.symbol}
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-slate-600">
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => openDialog("x^2+1")}
                  className="mt-2 w-full rounded-md border border-dashed border-slate-300 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  Свой шаблон (поле LaTeX)…
                </button>

                <p className="mt-2 flex flex-wrap items-center gap-1 text-[10px] leading-snug text-slate-500">
                  В тексте можно оформлять как
                  <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-800">
                    $формула$
                  </code>
                  — в редакторе удобнее пользоваться шаблонами выше; при экспорте в Word формулы остаются читабельными.
                </p>
              </div>
            </>,
            document.body,
          )
        : null}

      {dialogOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[120] bg-black/30"
            aria-label="Закрыть"
            onClick={() => setDialogOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="fixed left-1/2 top-1/2 z-[130] w-[min(calc(100vw-2rem),26rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-4 shadow-2xl"
          >
            <h2 id={titleId} className="text-sm font-semibold text-slate-900">
              Проверьте и вставьте формулу
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
              Замените в шаблоне буквы-заглушки (
              <code className="rounded bg-slate-100 px-0.5">a</code>,{" "}
              <code className="rounded bg-slate-100 px-0.5">n</code>,{" "}
              <code className="rounded bg-slate-100 px-0.5">x</code>…) на свои числа или выражения. Код LaTeX
              можно править целиком, если нужно.
            </p>
            <label className="mt-3 block text-[11px] font-medium text-slate-700">
              LaTeX (KaTeX)
              <textarea
                value={latex}
                onChange={(e) => setLatex(e.target.value)}
                rows={5}
                className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-slate-50/50 px-2 py-1.5 font-mono text-[13px] leading-snug text-slate-900"
                spellCheck={false}
              />
            </label>
            <p className="mt-1 text-[10px] text-slate-500">Предпросмотр:</p>
            <div
              className="mt-1 flex min-h-[2.75rem] items-center justify-center overflow-x-auto rounded-lg border border-slate-100 bg-white px-2 py-2 text-[16px]"
              dangerouslySetInnerHTML={{
                __html:
                  previewHtml ||
                  '<span class="text-slate-400 text-xs">Введите выражение выше</span>',
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
                onClick={() => setDialogOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={!latex.trim()}
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={insert}
              >
                Вставить в текст
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
