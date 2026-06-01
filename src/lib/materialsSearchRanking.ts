export type MaterialSearchResult = {
  title: string;
  url: string;
  snippet?: string;
};

export type MaterialRankingContext = {
  query?: string;
  subject?: string;
  grade?: string;
};

const STOP_WORDS = new Set([
  "и",
  "в",
  "во",
  "на",
  "по",
  "для",
  "к",
  "из",
  "от",
  "до",
  "с",
  "со",
  "у",
  "о",
  "об",
  "the",
  "a",
  "an",
  "класс",
  "класса",
  "классе",
  "урок",
  "урока",
  "уроки",
]);

const LESSON_KEYWORDS = [
  "конспект",
  "открытый урок",
  "план урока",
  "сценарий",
  "методическая разработка",
  "рабочая программа",
  "урок",
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function haystack(result: MaterialSearchResult): string {
  return normalizeText(`${result.title} ${result.snippet ?? ""} ${result.url}`).toLowerCase();
}

function tokenizeForMatch(text: string): string[] {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  return [...new Set(tokens)];
}

function subjectHints(subject: string): string[] {
  const normalized = normalizeText(subject).toLowerCase();
  if (!normalized) return [];

  const hints = new Set<string>([normalized]);
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord.length >= 4) hints.add(firstWord);

  if (normalized.includes("русск")) {
    hints.add("русск");
    hints.add("русский");
  }
  if (normalized.includes("математ")) hints.add("математ");
  if (normalized.includes("литерат")) hints.add("литерат");
  if (normalized.includes("англ")) hints.add("англ");
  if (normalized.includes("истор")) hints.add("истор");
  if (normalized.includes("биолог")) hints.add("биолог");
  if (normalized.includes("физик")) hints.add("физик");
  if (normalized.includes("хим")) hints.add("хим");
  if (normalized.includes("географ")) hints.add("географ");
  if (normalized.includes("обществ")) hints.add("обществ");

  return [...hints];
}

function extractFreshnessScore(text: string): number {
  const normalized = text.toLowerCase();

  const isoMatch = normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return year * 10000 + month * 100 + day;
    }
  }

  const dottedMatch = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/);
  if (dottedMatch) {
    const day = Number(dottedMatch[1]);
    const month = Number(dottedMatch[2]);
    const year = Number(dottedMatch[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return year * 10000 + month * 100 + day;
    }
  }

  const yearMatches = [...normalized.matchAll(/\b(19|20)\d{2}\b/g)];
  if (yearMatches.length > 0) {
    const years = yearMatches.map((match) => Number(match[0]));
    return Math.max(...years) * 10000 + 101;
  }

  return 0;
}

function freshnessBonus(freshness: number): number {
  if (freshness <= 0) return 0;

  const year = Math.floor(freshness / 10000);
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;

  if (age <= 1) return 15;
  if (age <= 3) return 12;
  if (age <= 5) return 8;
  if (age <= 10) return 4;
  return 1;
}

function gradeBonus(hay: string, grade: string): number {
  const normalizedGrade = grade.trim();
  if (!normalizedGrade) return 0;

  const patterns = [
    `${normalizedGrade} класс`,
    `${normalizedGrade}-й класс`,
    `${normalizedGrade}-го класса`,
    `${normalizedGrade} класса`,
    `${normalizedGrade} классе`,
  ];

  if (patterns.some((pattern) => hay.includes(pattern))) return 20;
  if (hay.includes(`${normalizedGrade} `) && hay.includes("класс")) return 8;
  return 0;
}

function hasRankingContext(context?: MaterialRankingContext): boolean {
  if (!context) return false;
  return Boolean(context.query?.trim() || context.subject?.trim() || context.grade?.trim());
}

function scoreResult(
  result: MaterialSearchResult,
  index: number,
  context: MaterialRankingContext,
): number {
  const title = result.title.toLowerCase();
  const hay = haystack(result);
  let score = Math.max(0, 40 - index);

  const query = context.query?.trim().toLowerCase() ?? "";
  if (query.length >= 4) {
    if (title.includes(query)) score += 45;
    else if (hay.includes(query)) score += 20;
  }

  for (const token of tokenizeForMatch(context.query ?? "")) {
    if (title.includes(token)) score += 22;
    else if (hay.includes(token)) score += 8;
  }

  for (const hint of subjectHints(context.subject ?? "")) {
    if (title.includes(hint)) score += 16;
    else if (hay.includes(hint)) score += 8;
  }

  score += gradeBonus(hay, context.grade ?? "");

  for (const keyword of LESSON_KEYWORDS) {
    if (hay.includes(keyword)) {
      score += keyword.length >= 10 ? 8 : 5;
    }
  }

  score += freshnessBonus(extractFreshnessScore(hay));

  return score;
}

function sortByFreshnessThenIndex<T extends MaterialSearchResult>(
  results: T[],
): T[] {
  return results
    .map((result, index) => ({
      result,
      index,
      freshness: extractFreshnessScore(haystack(result)),
    }))
    .sort((left, right) => {
      if (right.freshness !== left.freshness) return right.freshness - left.freshness;
      return left.index - right.index;
    })
    .map(({ result }) => result);
}

export function rankAndLimitMaterials<T extends MaterialSearchResult>(
  results: T[],
  limit = 10,
  context?: MaterialRankingContext,
): T[] {
  if (results.length === 0) return [];

  if (!hasRankingContext(context)) {
    return sortByFreshnessThenIndex(results).slice(0, limit);
  }

  const ranked = results
    .map((result, index) => ({
      result,
      index,
      score: scoreResult(result, index, context ?? {}),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.index - right.index;
    })
    .map(({ result }) => result);

  return ranked.slice(0, limit);
}
