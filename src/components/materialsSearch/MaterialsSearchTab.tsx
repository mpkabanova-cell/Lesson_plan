"use client";

import { useEffect, useMemo, useState } from "react";
import { buildGoogleFallbackSearchUrl } from "@/lib/buildGoogleFallbackSearchUrl";
import { MaterialsSearchForm } from "./MaterialsSearchForm";

type Props = {
  /** Когда true — вкладка видима (для синхронизации фильтров с формой урока). */
  active: boolean;
  lessonSubject: string;
  lessonGrade: string;
  programmableSearchCx?: string;
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

async function searchMaterials(body: {
  query: string;
  subject: string;
  grade: string;
}): Promise<{ results: SearchResult[] }> {
  const res = await fetch("/api/search-1sept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data: { results?: SearchResult[]; error?: string; detail?: string; hint?: string };
  try {
    data = text.trim() ? (JSON.parse(text) as typeof data) : {};
  } catch {
    throw new Error(`Сервер вернул некорректный ответ: ${text.slice(0, 300)}`);
  }

  if (!res.ok) {
    const parts = [data.error, data.detail, data.hint].filter(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    throw new Error(parts.join("\n\n") || `Ошибка поиска: HTTP ${res.status}`);
  }

  return { results: Array.isArray(data.results) ? data.results : [] };
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function MaterialsSearchTab({ active, lessonSubject, lessonGrade }: Props) {
  const [subject, setSubject] = useState(lessonSubject);
  const [grade, setGrade] = useState(lessonGrade);
  const [query, setQuery] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!active) return;
    setSubject(lessonSubject);
    setGrade(lessonGrade);
  }, [active, lessonSubject, lessonGrade]);

  const fallbackUrl = useMemo(
    () => buildGoogleFallbackSearchUrl(query, { subject, grade }),
    [query, subject, grade],
  );

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setError("Введите тему или ключевые слова для поиска материалов.");
      setSearched(false);
      setResults([]);
      return;
    }

    setSearchPending(true);
    setError(null);
    setSearched(true);
    try {
      const data = await searchMaterials({ query: q, subject, grade });
      setResults(data.results);
    } catch (e) {
      setResults([]);
      setError(e instanceof Error ? e.message : `Неизвестная ошибка: ${String(e)}`);
    } finally {
      setSearchPending(false);
    }
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
          onQueryChange={setQuery}
          subject={subject}
          onSubjectChange={setSubject}
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

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950"
        >
          <p className="font-semibold">Не удалось получить список материалов</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">{error}</p>
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-xs font-medium text-teal-800 underline decoration-teal-300 underline-offset-2 hover:text-teal-950"
          >
            Открыть этот поиск в Google
          </a>
        </div>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50/60 p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Подобранные материалы</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Аккуратный список ссылок на публикации, без встроенного интерфейса Google.
            </p>
          </div>
          {searched && !searchPending ? (
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              Найдено: {results.length}
            </span>
          ) : null}
        </div>

        {!searched && !searchPending ? (
          <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-lg bg-white px-4 py-8 text-center">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-slate-800">Введите тему урока или ключевые слова</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                После поиска здесь появятся карточки материалов: заголовок, краткое описание и ссылка.
              </p>
            </div>
          </div>
        ) : null}

        {searched && !searchPending && results.length === 0 && !error ? (
          <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-lg bg-white px-4 py-8 text-center">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-slate-800">Материалы не найдены</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Попробуйте сократить запрос или открыть тот же поиск в Google.
              </p>
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-xs font-medium text-teal-800 underline decoration-teal-300 underline-offset-2 hover:text-teal-950"
              >
                Открыть поиск в Google
              </a>
            </div>
          </div>
        ) : null}

        {results.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {results.map((item, index) => {
              const host = hostnameFromUrl(item.url);
              return (
                <li key={`${item.url}-${index}`}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800 ring-1 ring-teal-100">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-slate-900 group-hover:text-teal-900">
                          {item.title}
                        </p>
                        {item.snippet ? (
                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                            {item.snippet}
                          </p>
                        ) : null}
                        <p className="mt-2 truncate text-[11px] text-slate-400">
                          {host || item.url}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-800">
                        открыть
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
