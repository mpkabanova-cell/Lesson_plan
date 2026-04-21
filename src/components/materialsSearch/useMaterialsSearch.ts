"use client";

import { useCallback, useState } from "react";
import type { MaterialsSearchStatus, SearchResult } from "./types";

const MAX_QUERY = 500;

export function useMaterialsSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<MaterialsSearchStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [clientHint, setClientHint] = useState<string | null>(null);

  const search = useCallback(
    async (opts: { subject: string; grade: string }) => {
      const q = query.trim();
      setClientHint(null);
      if (!q) {
        setClientHint("Введите запрос, чтобы найти материалы.");
        return;
      }
      if (q.length > MAX_QUERY) {
        setClientHint("Запрос слишком длинный. Сократите текст.");
        return;
      }

      setStatus("loading");
      setErrorMessage(null);
      setResults([]);

      try {
        const res = await fetch("/api/search-1sept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            subject: opts.subject.trim() || undefined,
            grade: opts.grade.trim() || undefined,
          }),
        });
        const text = await res.text();
        let data: {
          results?: SearchResult[];
          error?: string;
          hint?: string;
          detail?: string;
        } = {};
        try {
          data = JSON.parse(text) as typeof data;
        } catch {
          setStatus("error");
          const preview = text.trim().slice(0, 200);
          setErrorMessage(
            preview
              ? `Ответ сервера не JSON (возможна страница ошибки хостинга). Начало ответа:\n${preview}`
              : "Не удалось выполнить поиск. Попробуйте позже.",
          );
          setResults([]);
          return;
        }

        if (!res.ok) {
          setStatus("error");
          const base = data.error ?? "Не удалось выполнить поиск. Попробуйте позже.";
          const detail =
            typeof data.detail === "string" && data.detail.trim()
              ? `\n\nПодробности: ${data.detail.trim()}`
              : "";
          const hint =
            typeof data.hint === "string" && data.hint.trim() ? `\n\n${data.hint.trim()}` : "";
          setErrorMessage(base + detail + hint);
          setResults([]);
          return;
        }

        const list = Array.isArray(data.results) ? data.results : [];
        setResults(list);
        setStatus(list.length === 0 ? "empty" : "success");
      } catch {
        setStatus("error");
        setErrorMessage("Не удалось выполнить поиск. Попробуйте позже.");
        setResults([]);
      }
    },
    [query],
  );

  return {
    query,
    setQuery,
    results,
    status,
    errorMessage,
    clientHint,
    search,
    MAX_QUERY,
  };
}
