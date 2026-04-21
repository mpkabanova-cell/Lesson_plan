"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { build1septSearchQuery } from "@/lib/build1septSearchQuery";
import { buildGoogleFallbackSearchUrl } from "@/lib/buildGoogleFallbackSearchUrl";
import { MaterialsSearchForm } from "./MaterialsSearchForm";
import {
  ProgrammableSearchEmbed,
  type ProgrammableSearchEmbedHandle,
} from "./ProgrammableSearchEmbed";

type Props = {
  /** Когда true — вкладка видима (для синхронизации фильтров с формой урока). */
  active: boolean;
  lessonSubject: string;
  lessonGrade: string;
  /** Идентификатор CSE (cx), с сервера — достаточно GOOGLE_CUSTOM_SEARCH_ENGINE_ID в .env */
  programmableSearchCx?: string;
};

export function MaterialsSearchTab({ active, lessonSubject, lessonGrade, programmableSearchCx }: Props) {
  const [subject, setSubject] = useState(lessonSubject);
  const [grade, setGrade] = useState(lessonGrade);
  const [query, setQuery] = useState("");
  const [articlePreviewUrl, setArticlePreviewUrl] = useState<string | null>(null);
  const embedRef = useRef<ProgrammableSearchEmbedHandle>(null);

  useEffect(() => {
    if (!active) return;
    setSubject(lessonSubject);
    setGrade(lessonGrade);
  }, [active, lessonSubject, lessonGrade]);

  useEffect(() => {
    if (!active) setArticlePreviewUrl(null);
  }, [active]);

  /** Стили в globals.css переводят CSE из overlay в поток страницы, пока активна эта вкладка. */
  useEffect(() => {
    const cls = "lesson-plan-cse-inline";
    if (active) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => document.body.classList.remove(cls);
  }, [active]);

  const fallbackGoogleUrl = useMemo(
    () => buildGoogleFallbackSearchUrl(query, { subject, grade }),
    [query, subject, grade],
  );

  const runSearch = () => {
    const q = build1septSearchQuery(query, { subject, grade });
    embedRef.current?.executeSearch(q);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 py-1">
      <p className="text-sm text-slate-600">
        Поиск по материалам <span className="font-medium text-slate-800">1sept.ru</span>: запрос с ограничением{" "}
        <span className="font-mono text-xs">site:1sept.ru</span>. По ссылке из выдачи материал открывается{" "}
        <span className="font-medium text-slate-800">ниже на этой вкладке</span> (встроенный просмотр), без ухода с
        конструктора. <span className="whitespace-nowrap">⌘/Ctrl+клик</span> — в новой вкладке.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <MaterialsSearchForm
          query={query}
          onQueryChange={setQuery}
          subject={subject}
          onSubjectChange={setSubject}
          grade={grade}
          onGradeChange={setGrade}
          onSubmit={runSearch}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ProgrammableSearchEmbed
          ref={embedRef}
          cx={programmableSearchCx}
          onOpen1septArticle={setArticlePreviewUrl}
        />
        {articlePreviewUrl ? (
          <div className="flex min-h-[min(50vh,28rem)] shrink-0 flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2">
              <button
                type="button"
                onClick={() => setArticlePreviewUrl(null)}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100"
              >
                Закрыть предпросмотр
              </button>
              <a
                href={articlePreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium text-teal-800 underline underline-offset-2"
              >
                Открыть в новой вкладке
              </a>
            </div>
            <iframe
              key={articlePreviewUrl}
              src={articlePreviewUrl}
              title="Материал 1sept.ru"
              className="min-h-[min(45vh,24rem)] w-full flex-1 rounded border border-slate-200 bg-white"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            />
            <p className="text-[11px] text-slate-500">
              Если окно пустое, сайт мог запретить встраивание — откройте материал по ссылке «в новой вкладке».
            </p>
          </div>
        ) : null}
      </div>

      <p className="text-center text-[11px] text-slate-500">
        Не загружается виджет? Откройте{" "}
        <a
          className="text-teal-800 underline underline-offset-2"
          href={fallbackGoogleUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          тот же поиск в Google
        </a>
        .
      </p>
    </div>
  );
}
