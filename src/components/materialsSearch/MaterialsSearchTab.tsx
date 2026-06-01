"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { firstAvailableGrade, formatGradeRange, isSubjectGradeCompatible } from "@/config/subjectClassMap";
import { buildGoogleFallbackSearchUrl } from "@/lib/buildGoogleFallbackSearchUrl";
import { build1septSearchQuery } from "@/lib/build1septSearchQuery";
import { rankAndLimitMaterials, type MaterialSearchResult } from "@/lib/materialsSearchRanking";
import { SUBJECT_OPTIONS } from "@/lib/options";
import { MaterialsSearchForm } from "./MaterialsSearchForm";
import {
  ProgrammableSearchEmbed,
  type ProgrammableSearchEmbedHandle,
  type ProgrammableSearchResult,
} from "./ProgrammableSearchEmbed";

type Props = {
  active: boolean;
  programmableSearchCx?: string;
  onToast?: (message: string) => void;
};

type SearchResult = MaterialSearchResult;

const MAX_VISIBLE_RESULTS = 10;
const PUBLICATIONS_PORTAL_URL = "https://urok.1sept.ru/";

function limitResults(
  results: SearchResult[],
  context: { query: string; subject: string; grade: string },
): SearchResult[] {
  return rankAndLimitMaterials(results, MAX_VISIBLE_RESULTS, context);
}

function friendlySearchError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("custom search json api") ||
    lower.includes("google custom search") ||
    lower.includes("billing") ||
    lower.includes("google cloud")
  ) {
    return "Серверный поиск сейчас недоступен. Можно открыть этот же запрос вручную в Google или перейти на портал «Открытый урок».";
  }
  return message;
}

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
    throw new Error(friendlySearchError(parts.join("\n\n") || `Ошибка поиска: HTTP ${res.status}`));
  }

  return {
    results: limitResults(Array.isArray(data.results) ? data.results : [], body),
  };
}

function hostnameFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function MaterialsSearchTab({
  active,
  programmableSearchCx,
  onToast,
}: Props) {
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0] ?? "");
  const [grade, setGrade] = useState("5");
  const [query, setQuery] = useState("");
  const [searchPending, setSearchPending] = useState(false);
  const [searched, setSearched] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const embedRef = useRef<ProgrammableSearchEmbedHandle>(null);

  useEffect(() => {
    if (!active) return;
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
  }, [active, subject, grade, onToast]);

  const fallbackUrl = useMemo(
    () => buildGoogleFallbackSearchUrl(query, { subject, grade }),
    [query, subject, grade],
  );
  const canUseProgrammableSearch = Boolean(
    programmableSearchCx?.trim() || process.env.NEXT_PUBLIC_GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim(),
  );

  const handleCseResults = (next: ProgrammableSearchResult[]) => {
    const limited = limitResults(next, { query, subject, grade });
    setResults(limited);
    setError(null);
  };

  const runSearch = async () => {
    const q = query.trim();
    if (!q) {
      setError(null);
      setSearched(false);
      setResults([]);
      return;
    }

    setSearchPending(true);
    setError(null);
    setSearched(true);
    setResults([]);

    if (canUseProgrammableSearch) {
      const embed = embedRef.current;
      if (!embed) {
        setSearchPending(false);
        setError("Поиск ещё загружается. Попробуйте нажать «Найти» ещё раз через несколько секунд.");
        return;
      }
      embed.executeSearch(build1septSearchQuery(q, { subject, grade }));
      return;
    }

    try {
      const data = await searchMaterials({ query: q, subject, grade });
      setResults(data.results);
    } catch (e) {
      setResults([]);
      const msg = e instanceof Error ? e.message : `Неизвестная ошибка: ${String(e)}`;
      setError(friendlySearchError(msg));
    } finally {
      setSearchPending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 py-1">
      <p className="text-sm text-slate-600">
        Поиск материалов на портале <span className="font-medium text-slate-800">«Первое сентября»</span>{" "}
        (<span className="font-medium text-slate-800">urok.1sept.ru</span>). Ссылки на материалы открываются в{" "}
        <span className="font-medium text-slate-800">новой вкладке</span>.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <MaterialsSearchForm
          query={query}
          onQueryChange={(value) => {
            setQuery(value);
            setError(null);
          }}
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
        {canUseProgrammableSearch ? (
          <div className="pointer-events-none absolute -left-[10000px] top-0 h-[480px] w-[720px] overflow-hidden opacity-0">
            <ProgrammableSearchEmbed
              ref={embedRef}
              cx={programmableSearchCx}
              onSearchBusyChange={setSearchPending}
              onResultsChange={handleCseResults}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {searched && results.length > 0 ? "Подобранные материалы" : "Поиск материалов"}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {searched && results.length > 0
                ? `Показаны первые ${MAX_VISIBLE_RESULTS} наиболее релевантных ссылок, если они доступны.`
                : `Показаны до ${MAX_VISIBLE_RESULTS} наиболее релевантных ссылок, если они доступны.`}
            </p>
          </div>
          {searched && !searchPending && !error ? (
            <span className="rounded-full bg-white px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
              Показано: {results.length}
            </span>
          ) : null}
        </div>

        {!searched && !searchPending ? (
          <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-lg bg-white px-4 py-8 text-center">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-slate-800">
                {query.trim() ? "Нажмите «Найти», чтобы подобрать материалы" : "Введите тему урока или ключевые слова"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                После поиска здесь появятся карточки материалов: заголовок, краткое описание и ссылка.
              </p>
            </div>
          </div>
        ) : null}

        {searched && !searchPending && results.length === 0 && !error ? (
          <div className="flex min-h-[12rem] flex-1 items-center justify-center rounded-lg bg-white px-4 py-8 text-center">
            <div className="max-w-sm">
              <p className="text-sm font-medium text-slate-800">Автоматически не удалось собрать ссылки</p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Можно открыть этот же поиск вручную или перейти на портал и продолжить подбор самостоятельно.
              </p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                <a
                  href={fallbackUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-800 ring-1 ring-teal-100 hover:bg-teal-100"
                >
                  Открыть поиск в Google
                </a>
                <a
                  href={PUBLICATIONS_PORTAL_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                >
                  Перейти на портал
                </a>
              </div>
            </div>
          </div>
        ) : null}

        {results.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {results.map((item, index) => {
              const host = hostnameFromUrl(item.url);
              return (
                <li key={`${item.url}-${index}`}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group block rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800 ring-1 ring-teal-100">
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
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 group-hover:bg-teal-50 group-hover:text-teal-800">
                        открыть
                      </span>
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        ) : null}

        {searched && !searchPending && !error && results.length > 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs leading-relaxed text-slate-600">
            <p>
              Если нужно больше материалов, откройте этот же запрос в Google или перейдите на портал «Открытый урок» и
              продолжите подбор вручную.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <a
                href={fallbackUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full bg-teal-50 px-3 py-1.5 font-medium text-teal-800 ring-1 ring-teal-100 hover:bg-teal-100"
              >
                Открыть этот поиск в Google
              </a>
              <a
                href={PUBLICATIONS_PORTAL_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-full bg-slate-50 px-3 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
              >
                Перейти на портал
              </a>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
