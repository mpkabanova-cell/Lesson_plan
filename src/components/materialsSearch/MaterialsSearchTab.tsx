"use client";

import { useEffect, useRef, useState } from "react";
import { firstAvailableGrade, formatGradeRange, isSubjectGradeCompatible } from "@/config/subjectClassMap";
import { build1septSearchQuery } from "@/lib/build1septSearchQuery";
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
  lessonTopic?: string;
  programmableSearchCx?: string;
  onToast?: (message: string) => void;
};

export function MaterialsSearchTab({
  active,
  lessonSubject,
  lessonGrade,
  lessonTopic = "",
  programmableSearchCx,
  onToast,
}: Props) {
  const [subject, setSubject] = useState(lessonSubject);
  const [grade, setGrade] = useState(lessonGrade);
  const [query, setQuery] = useState(lessonTopic);
  const [queryEdited, setQueryEdited] = useState(false);
  const [searchPending, setSearchPending] = useState(false);
  const embedRef = useRef<ProgrammableSearchEmbedHandle>(null);

  useEffect(() => {
    if (!active) return;
    setSubject(lessonSubject);
    setGrade(lessonGrade);
    if (!queryEdited) setQuery(lessonTopic);
  }, [active, lessonSubject, lessonGrade, lessonTopic, queryEdited]);

  useEffect(() => {
    if (isSubjectGradeCompatible(subject, grade)) return;
    const nextGrade = firstAvailableGrade(subject);
    if (!nextGrade) return;

    setGrade(nextGrade);
    const range = formatGradeRange(subject);
    onToast?.(
      range
        ? `Для предмета “${subject}” доступны только ${range}`
        : `Для предмета “${subject}” выбран доступный класс`,
    );
  }, [subject, grade, onToast]);

  useEffect(() => {
    const cls = "lesson-plan-cse-inline";
    if (active) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => document.body.classList.remove(cls);
  }, [active]);

  const runSearch = () => {
    const q = build1septSearchQuery(query, { subject, grade });
    embedRef.current?.executeSearch(q);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 py-1">
      <p className="text-sm text-slate-600">
        Поиск только в разделе <span className="font-medium text-slate-800">«Публикации»</span> (проект «Открытый урок»,{" "}
        <span className="font-medium text-slate-800">urok.1sept.ru</span>). Выдача по умолчанию — по релевантности.
        Ссылки на материалы открываются в <span className="font-medium text-slate-800">новой вкладке</span>.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <MaterialsSearchForm
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setQueryEdited(true);
          }}
          subject={subject}
          onSubjectChange={(value) => {
            setSubject(value);
            setQuery("");
            setQueryEdited(true);
          }}
          grade={grade}
          onGradeChange={setGrade}
          onSubmit={runSearch}
          disabled={searchPending}
          busy={searchPending}
          submitLabel={searchPending ? "Ищем…" : "Найти"}
        />
      </div>

      {searchPending ? (
        <div
          className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/90 px-3 py-2.5 text-sm text-teal-950"
          role="status"
          aria-live="polite"
        >
          <span
            className="inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-teal-700 border-t-transparent"
            aria-hidden
          />
          <span>Идёт поиск по материалам…</span>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col">
        <ProgrammableSearchEmbed ref={embedRef} cx={programmableSearchCx} onSearchBusyChange={setSearchPending} />
      </div>
    </div>
  );
}
