export type MaterialSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const DEFAULT_LIMIT = 10;

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractFreshnessScore(result: MaterialSearchResult): number {
  const haystack = normalizeText(`${result.title} ${result.snippet} ${result.url}`);
  const nowYear = new Date().getFullYear();

  const dateMatch = haystack.match(/\b(0?[1-9]|[12]\d|3[01])[./-](0?[1-9]|1[0-2])[./-]((?:19|20)\d{2})\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const year = Number(dateMatch[3]);
    if (year >= 1990 && year <= nowYear + 1) {
      return year * 10000 + month * 100 + day;
    }
  }

  const years = [...haystack.matchAll(/\b((?:19|20)\d{2})\b/g)]
    .map((m) => Number(m[1]))
    .filter((year) => year >= 1990 && year <= nowYear + 1);

  return years.length > 0 ? Math.max(...years) * 10000 : 0;
}

/**
 * Google уже отдаёт результаты в порядке релевантности. Мы сохраняем этот порядок
 * как tie-breaker, но поднимаем выше более свежие материалы, если в результате виден год/дата.
 */
export function rankAndLimitMaterials<T extends MaterialSearchResult>(
  results: T[],
  limit = DEFAULT_LIMIT,
): T[] {
  return results
    .map((result, index) => ({
      result,
      index,
      freshness: extractFreshnessScore(result),
    }))
    .sort((a, b) => b.freshness - a.freshness || a.index - b.index)
    .slice(0, limit)
    .map((row) => row.result);
}
