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
  const embedRef = useRef<ProgrammableSearchEmbedHandle>(null);

  useEffect(() => {
    if (!active) return;
    setSubject(lessonSubject);
    setGrade(lessonGrade);
  }, [active, lessonSubject, lessonGrade]);

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
        Поиск по материалам <span className="font-medium text-slate-800">1sept.ru</span>: запрос собирается с
        ограничением <span className="font-mono text-xs">site:1sept.ru</span>, выдача — как в Google, на этой странице
        (без Custom Search JSON API).
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

      <div className="flex min-h-0 flex-1 flex-col">
        <ProgrammableSearchEmbed ref={embedRef} cx={programmableSearchCx} />
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
