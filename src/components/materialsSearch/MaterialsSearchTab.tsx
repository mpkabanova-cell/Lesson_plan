"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGoogleFallbackSearchUrl } from "@/lib/buildGoogleFallbackSearchUrl";
import { MaterialsSearchForm } from "./MaterialsSearchForm";
import { ProgrammableSearchEmbed } from "./ProgrammableSearchEmbed";

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

  useEffect(() => {
    if (!active) return;
    setSubject(lessonSubject);
    setGrade(lessonGrade);
  }, [active, lessonSubject, lessonGrade]);

  const fallbackGoogleUrl = useMemo(
    () => buildGoogleFallbackSearchUrl(query, { subject, grade }),
    [query, subject, grade],
  );

  const openExternal = () => {
    window.open(fallbackGoogleUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-1 py-1">
      <div className="space-y-2">
        <p className="text-sm text-slate-600">
          Поиск по материалам <span className="font-medium text-slate-800">1sept.ru</span>: встроенная строка и выдача
          Google (Programmable Search). Работает без Custom Search JSON API на сервере — удобно, если в Google Cloud нельзя
          привязать биллинг.
        </p>
        <ProgrammableSearchEmbed cx={programmableSearchCx} />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <p className="mb-3 text-xs font-medium text-slate-600">
          Дополнительно: тот же запрос с предметом и классом — в новой вкладке браузера
        </p>
        <MaterialsSearchForm
          query={query}
          onQueryChange={setQuery}
          subject={subject}
          onSubjectChange={setSubject}
          grade={grade}
          onGradeChange={setGrade}
          onSubmit={openExternal}
        />
      </div>
    </div>
  );
}
