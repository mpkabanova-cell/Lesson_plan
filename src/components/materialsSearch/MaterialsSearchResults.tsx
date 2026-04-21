"use client";

import { SearchResultCard } from "./SearchResultCard";
import type { MaterialsSearchStatus, SearchResult } from "./types";

type Props = {
  status: MaterialsSearchStatus;
  results: SearchResult[];
  errorMessage: string | null;
  clientHint: string | null;
};

export function MaterialsSearchResults({ status, results, errorMessage, clientHint }: Props) {
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
      <p
        className="whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-900"
        role="alert"
      >
        {errorMessage ?? "Не удалось выполнить поиск. Попробуйте позже."}
      </p>
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
