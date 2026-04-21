"use client";

import type { SearchResult } from "./types";

function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

type Props = {
  item: SearchResult;
};

export function SearchResultCard({ item }: Props) {
  const host = hostFromUrl(item.url);
  const snippet =
    item.snippet.length > 320 ? `${item.snippet.slice(0, 320).trim()}…` : item.snippet;

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="text-sm font-semibold leading-snug text-slate-900">{item.title}</h3>
      <p className="mt-1 text-[11px] text-teal-800">{host}</p>
      {snippet ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-600 line-clamp-4">{snippet}</p>
      ) : null}
      {item.url ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex text-xs font-medium text-teal-700 underline hover:text-teal-900"
        >
          Открыть материал
        </a>
      ) : null}
    </article>
  );
}
