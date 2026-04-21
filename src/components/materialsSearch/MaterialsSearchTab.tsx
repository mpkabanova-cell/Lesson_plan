"use client";

import { useEffect, useState } from "react";
import { MaterialsSearchForm } from "./MaterialsSearchForm";
import { MaterialsSearchResults } from "./MaterialsSearchResults";
import { useMaterialsSearch } from "./useMaterialsSearch";

type Props = {
  /** Когда true — вкладка видима (для синхронизации фильтров с формой урока). */
  active: boolean;
  lessonSubject: string;
  lessonGrade: string;
};

export function MaterialsSearchTab({ active, lessonSubject, lessonGrade }: Props) {
  const [subject, setSubject] = useState(lessonSubject);
  const [grade, setGrade] = useState(lessonGrade);
  const { query, setQuery, results, status, errorMessage, clientHint, search } = useMaterialsSearch();

  useEffect(() => {
    if (!active) return;
    setSubject(lessonSubject);
    setGrade(lessonGrade);
  }, [active, lessonSubject, lessonGrade]);

  const loading = status === "loading";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden px-1 py-1">
      <MaterialsSearchForm
        query={query}
        onQueryChange={setQuery}
        subject={subject}
        onSubjectChange={setSubject}
        grade={grade}
        onGradeChange={setGrade}
        onSubmit={() => search({ subject, grade })}
        disabled={loading}
      />
      <MaterialsSearchResults
        status={status}
        results={results}
        errorMessage={errorMessage}
        clientHint={clientHint}
      />
    </div>
  );
}
