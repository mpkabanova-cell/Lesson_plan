"use client";

import { SearchResultCard } from "./SearchResultCard";
import type { MaterialsSearchStatus, SearchResult } from "./types";

type Props = {
  status: MaterialsSearchStatus;
  results: SearchResult[];
  errorMessage: string | null;
  clientHint: string | null;
  /** Обход без Custom Search API: открыть google.com с site:1sept.ru (например если нельзя привязать биллинг). */
  fallbackGoogleUrl?: string;
};

export function MaterialsSearchResults({
  status,
  results,
  errorMessage,
  clientHint,
  fallbackGoogleUrl,
}: Props) {
  if (clientHint) {
    return (
      <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950" role="status">
        {clientHint}
      </p>
    );
  }

  if (status === "idle") {
    return (
      <p className="text-sm leading-relaxed text-slate-500">
        Введите запрос, чтобы найти материалы с портала 1 сентября
      </p>
    );
  }

  if (status === "loading") {
    return <p className="text-sm text-slate-600">Ищем материалы...</p>;
  }

  if (status === "error") {
    return (
      <div className="space-y-3">
        <p
          className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-900"
          role="alert"
        >
          {errorMessage ?? "Не удалось выполнить поиск. Попробуйте позже."}
        </p>
        {fallbackGoogleUrl ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-800">
            <p className="leading-relaxed">
              Если нельзя включить платёж в Google Cloud (например, для аккаунта в РФ), поиск по материалам всё равно можно открыть в браузере — запрос ограничен сайтом{" "}
              <span className="font-mono text-xs">1sept.ru</span>, без нашего сервера:
            </p>
            <a
              href={fallbackGoogleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex font-medium text-teal-800 underline hover:text-teal-950"
            >
              Открыть поиск в Google (site:1sept.ru)
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  if (status === "empty") {
    return <p className="text-sm text-slate-600">Ничего не найдено. Попробуйте уточнить запрос.</p>;
  }

  return (
    <ul className="space-y-3">
      {results.map((item, i) => (
        <li key={`${item.url}-${i}`}>
          <SearchResultCard item={item} />
        </li>
      ))}
    </ul>
  );
}
