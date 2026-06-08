export type MaterialScoreBreakdown = {
  relevanceScore: number;
  subjectScore: number;
  gradeScore: number;
  freshnessScore: number;
  materialTypeScore: number;
  penaltyScore: number;
  finalScore: number;
};

export type MaterialSearchMeta = {
  year?: number;
  detectedGrade?: string;
  detectedSubject?: string;
  materialType?: string;
};

export type MaterialSearchResult = {
  title: string;
  url: string;
  snippet?: string;
  meta?: MaterialSearchMeta;
  _breakdown?: MaterialScoreBreakdown;
};

export type MaterialRankingContext = {
  query?: string;
  subject?: string;
  grade?: string;
};

export type RankMaterialsOptions = {
  debug?: boolean;
  minStrictResults?: number;
};

type GradeMatch = "exact" | "range" | "other" | "none";

type ScoredEntry<T extends MaterialSearchResult> = {
  result: T;
  index: number;
  breakdown: MaterialScoreBreakdown;
  meta: MaterialSearchMeta;
  passesStrictGate: boolean;
};

const STOP_WORDS = new Set([
  "и", "в", "во", "на", "по", "для", "к", "из", "от", "до", "с", "со", "у", "о", "об",
  "the", "a", "an", "класс", "класса", "классе", "урок", "урока", "уроки",
]);

const ROMAN_GRADE: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5",
  vi: "6", vii: "7", viii: "8", ix: "9", x: "10", xi: "11",
};

export const SUBJECT_MARKERS: Record<string, string[]> = {
  "Русский язык": ["русский язык", "орфография", "пунктуация", "морфология", "фонетика", "лексика"],
  "Литературное чтение": ["литературное чтение", "текст", "чтение", "сказка"],
  Литература: ["литература", "литературный", "стихотворение", "проза", "анализ текста"],
  Математика: ["математика", "математический", "дроби", "уравнение", "арифметика", "геометрия"],
  Алгебра: ["алгебра", "алгебраический", "уравнение", "функция", "линейн"],
  Геометрия: ["геометрия", "геометрический", "треугольник", "окружность", "теорема"],
  Информатика: ["информатика", "алгоритм", "программирование", "кодирование", "блок-схем"],
  История: ["история", "исторический", "древний мир", "русское государство", "хронология"],
  Обществознание: ["обществознание", "общество", "государство", "право", "экономика"],
  География: ["география", "географический", "климат", "карта", "материк"],
  Биология: ["биология", "биологический", "клетка", "организм", "экология"],
  Физика: ["физика", "физический", "механика", "электричество", "опыт"],
  Химия: ["химия", "химический", "реакция", "вещество", "молекула"],
  "Окружающий мир": ["окружающий мир", "природа", "экология", "животные", "растения"],
  "Иностранный язык": ["иностранный язык", "английский", "лексика", "грамматика", "диалог"],
};

const MATERIAL_TYPE_POSITIVE: Array<{ pattern: string; label: string; score: number }> = [
  { pattern: "конспект урока", label: "Конспект", score: 12 },
  { pattern: "конспект", label: "Конспект", score: 10 },
  { pattern: "разработка урока", label: "Разработка", score: 12 },
  { pattern: "методическая разработка", label: "Разработка", score: 11 },
  { pattern: "сценарий урока", label: "Сценарий", score: 11 },
  { pattern: "сценарий", label: "Сценарий", score: 9 },
  { pattern: "технологическая карта", label: "Техн. карта", score: 12 },
  { pattern: "презентация", label: "Презентация", score: 8 },
  { pattern: "рабочий лист", label: "Рабочий лист", score: 10 },
  { pattern: "карточки", label: "Карточки", score: 8 },
  { pattern: "задания", label: "Задания", score: 7 },
  { pattern: "практическая работа", label: "Практическая работа", score: 9 },
  { pattern: "план урока", label: "План урока", score: 9 },
  { pattern: "открытый урок", label: "Открытый урок", score: 8 },
];

const MATERIAL_TYPE_NEGATIVE: Array<{ pattern: string; penalty: number }> = [
  { pattern: "новости", penalty: 12 },
  { pattern: "объявлен", penalty: 12 },
  { pattern: "эссе", penalty: 8 },
  { pattern: "интервью", penalty: 8 },
  { pattern: "репортаж", penalty: 10 },
  { pattern: "анонс", penalty: 10 },
];

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function haystack(result: MaterialSearchResult): string {
  return normalizeText(`${result.title} ${result.snippet ?? ""} ${result.url}`).toLowerCase();
}

function tokenizeForMatch(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .map((t) => t.trim())
        .filter((t) => t.length >= 3 && !STOP_WORDS.has(t)),
    ),
  ];
}

function subjectHints(subject: string): string[] {
  const normalized = normalizeText(subject).toLowerCase();
  if (!normalized) return [];
  const markers = SUBJECT_MARKERS[subject];
  if (markers) return markers;

  const hints = new Set<string>([normalized]);
  const firstWord = normalized.split(/\s+/)[0];
  if (firstWord.length >= 4) hints.add(firstWord);
  if (normalized.includes("русск")) { hints.add("русск"); hints.add("русский"); }
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

export function extractYear(text: string): number | undefined {
  const normalized = text.toLowerCase();
  const iso = normalized.match(/\b(20\d{2}|19\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (iso) return Number(iso[1]);

  const dotted = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|19\d{2})\b/);
  if (dotted) return Number(dotted[3]);

  const years = [...normalized.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  if (years.length > 0) return Math.max(...years);
  return undefined;
}

function parseGradeRange(text: string): { min: number; max: number } | null {
  const m = text.match(/(\d{1,2})\s*[–\-]\s*(\d{1,2})\s*класс/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { min: Math.min(a, b), max: Math.max(a, b) };
}

function gradesMentionedInHay(hay: string): Set<string> {
  const found = new Set<string>();
  for (let g = 1; g <= 11; g++) {
    const gs = String(g);
    const patterns = [
      `${gs} класс`, `${gs}-й класс`, `${gs}-го класса`, `${gs} класса`,
      `для ${gs} класса`, `${gs}–`, `${gs}-`,
    ];
    if (patterns.some((p) => hay.includes(p))) found.add(gs);
  }
  for (const [roman, num] of Object.entries(ROMAN_GRADE)) {
    if (new RegExp(`\\b${roman}\\s+класс`, "i").test(hay)) found.add(num);
  }
  const range = parseGradeRange(hay);
  if (range) {
    for (let g = range.min; g <= range.max; g++) found.add(String(g));
  }
  return found;
}

export function detectGrade(hay: string, targetGrade: string): GradeMatch {
  const grade = targetGrade.trim();
  if (!grade) return "none";

  const exactPatterns = [
    `${grade} класс`, `${grade}-й класс`, `${grade}-го класса`,
    `${grade} класса`, `для ${grade} класса`,
  ];
  if (exactPatterns.some((p) => hay.includes(p))) return "exact";

  const roman = Object.entries(ROMAN_GRADE).find(([, n]) => n === grade)?.[0];
  if (roman && new RegExp(`\\b${roman}\\s+класс`, "i").test(hay)) return "exact";

  const range = parseGradeRange(hay);
  const gNum = Number(grade);
  if (range && Number.isFinite(gNum) && gNum >= range.min && gNum <= range.max) return "range";

  const mentioned = gradesMentionedInHay(hay);
  if (mentioned.size > 0 && !mentioned.has(grade)) return "other";

  return "none";
}

export function detectMaterialType(hay: string): { label: string; score: number } | null {
  for (const { pattern, label, score } of MATERIAL_TYPE_POSITIVE) {
    if (hay.includes(pattern)) return { label, score };
  }
  return null;
}

export function detectSubjectInMaterial(
  hay: string,
  selectedSubject: string,
): { selected: boolean; other: boolean; detectedName?: string } {
  if (!selectedSubject.trim()) return { selected: false, other: false };

  const selectedMarkers = subjectHints(selectedSubject);
  const selected = selectedMarkers.some((m) => hay.includes(m.toLowerCase()));

  for (const [name, markers] of Object.entries(SUBJECT_MARKERS)) {
    if (name === selectedSubject) continue;
    if (markers.some((m) => hay.includes(m))) {
      return { selected, other: true, detectedName: name };
    }
  }
  return { selected, other: false };
}

function scoreFreshnessByYear(year?: number): number {
  if (!year) return 0;
  if (year >= 2023) return 25;
  if (year >= 2020) return 15;
  if (year >= 2015) return 5;
  return -20;
}

function countTopicTokensInText(tokens: string[], title: string, snippet: string, url: string): number {
  const combined = `${title} ${snippet} ${url}`.toLowerCase();
  return tokens.filter((t) => combined.includes(t)).length;
}

function passesOldMaterialGate(
  result: MaterialSearchResult,
  context: MaterialRankingContext,
  hay: string,
  year: number | undefined,
  gradeMatch: GradeMatch,
  subjectMatch: ReturnType<typeof detectSubjectInMaterial>,
): boolean {
  if (!year || year >= 2015) return true;

  const query = normalizeText(context.query ?? "").toLowerCase();
  const title = result.title.toLowerCase();
  const snippet = (result.snippet ?? "").toLowerCase();
  const tokens = tokenizeForMatch(context.query ?? "");

  if (query.length >= 4 && title.includes(query)) return true;
  if (countTopicTokensInText(tokens, title, snippet, result.url) >= 2) return true;
  if (gradeMatch === "exact" && subjectMatch.selected) return true;

  return false;
}

type ScoreOpts = {
  penaltyMultiplier: number;
  applyGate: boolean;
};

function scoreMaterialInternal<T extends MaterialSearchResult>(
  result: T,
  index: number,
  context: MaterialRankingContext,
  opts: ScoreOpts,
): ScoredEntry<T> {
  const hay = haystack(result);
  const title = result.title.toLowerCase();
  const snippet = (result.snippet ?? "").toLowerCase();
  const url = result.url.toLowerCase();
  const query = normalizeText(context.query ?? "").toLowerCase();
  const tokens = tokenizeForMatch(context.query ?? "");
  const pm = opts.penaltyMultiplier;

  let relevanceScore = Math.max(0, 40 - index);
  let penaltyScore = 0;

  if (query.length >= 4) {
    if (title.includes(query)) relevanceScore += 45;
    else if (snippet.includes(query)) relevanceScore += 25;
    else if (hay.includes(query)) relevanceScore += 20;
  }

  for (const token of tokens) {
    if (title.includes(token)) relevanceScore += 22;
    else if (hay.includes(token)) relevanceScore += 8;
  }

  const tokenHits = countTopicTokensInText(tokens, title, snippet, url);
  if (tokens.length > 0 && tokenHits === 0) {
    penaltyScore -= Math.round(30 * pm);
  }

  const year = extractYear(hay);
  const freshnessScore = scoreFreshnessByYear(year);

  const gradeMatch = detectGrade(hay, context.grade ?? "");
  let gradeScore = 0;
  if (gradeMatch === "exact") gradeScore = 25;
  else if (gradeMatch === "range") gradeScore = 15;
  else if (gradeMatch === "other") penaltyScore -= Math.round(20 * pm);

  let detectedGrade: string | undefined;
  if (gradeMatch === "exact" || gradeMatch === "range") {
    detectedGrade = context.grade;
  } else {
    const mentioned = [...gradesMentionedInHay(hay)];
    if (mentioned.length === 1) detectedGrade = mentioned[0];
  }

  const subject = context.subject ?? "";
  const subjectInfo = detectSubjectInMaterial(hay, subject);
  let subjectScore = 0;
  let detectedSubject: string | undefined;

  if (subject) {
    const markers = subjectHints(subject);
    if (markers.some((m) => title.includes(m))) subjectScore += 16;
    else if (markers.some((m) => hay.includes(m))) subjectScore += 8;
    else penaltyScore -= Math.round(8 * pm);

    if (subjectInfo.other) {
      penaltyScore -= Math.round(25 * pm);
      detectedSubject = subjectInfo.detectedName;
    } else if (subjectInfo.selected) {
      detectedSubject = subject;
    }
  }

  const materialTypeHit = detectMaterialType(hay);
  let materialTypeScore = 0;
  let materialType: string | undefined;
  if (materialTypeHit) {
    materialTypeScore = materialTypeHit.score;
    materialType = materialTypeHit.label;
  }
  for (const neg of MATERIAL_TYPE_NEGATIVE) {
    if (hay.includes(neg.pattern)) {
      penaltyScore -= Math.round(neg.penalty * pm);
    }
  }

  const breakdown: MaterialScoreBreakdown = {
    relevanceScore,
    subjectScore,
    gradeScore,
    freshnessScore,
    materialTypeScore,
    penaltyScore,
    finalScore:
      relevanceScore +
      subjectScore +
      gradeScore +
      freshnessScore +
      materialTypeScore +
      penaltyScore,
  };

  const meta: MaterialSearchMeta = {
    year,
    detectedGrade,
    detectedSubject,
    materialType,
  };

  const passesStrictGate = opts.applyGate
    ? passesOldMaterialGate(result, context, hay, year, gradeMatch, subjectInfo)
    : true;

  return {
    result,
    index,
    breakdown,
    meta,
    passesStrictGate,
  };
}

export function scoreMaterial(
  result: MaterialSearchResult,
  context: MaterialRankingContext,
  index = 0,
): { breakdown: MaterialScoreBreakdown; meta: MaterialSearchMeta; passesStrictGate: boolean } {
  const entry = scoreMaterialInternal(result, index, context, {
    penaltyMultiplier: 1,
    applyGate: true,
  });
  return {
    breakdown: entry.breakdown,
    meta: entry.meta,
    passesStrictGate: entry.passesStrictGate,
  };
}

export function explainMaterialRanking(
  results: MaterialSearchResult[],
  context: MaterialRankingContext,
): Array<{
  title: string;
  url: string;
  year?: number;
  breakdown: MaterialScoreBreakdown;
  meta: MaterialSearchMeta;
}> {
  return results.map((result, index) => {
    const { breakdown, meta } = scoreMaterial(result, context, index);
    return { title: result.title, url: result.url, year: meta.year, breakdown, meta };
  });
}

function hasRankingContext(context?: MaterialRankingContext): boolean {
  if (!context) return false;
  return Boolean(context.query?.trim() || context.subject?.trim() || context.grade?.trim());
}

function sortScoredEntries<T extends MaterialSearchResult>(
  entries: ScoredEntry<T>[],
): ScoredEntry<T>[] {
  return [...entries].sort((a, b) => {
    if (b.breakdown.finalScore !== a.breakdown.finalScore) {
      return b.breakdown.finalScore - a.breakdown.finalScore;
    }
    return a.index - b.index;
  });
}

function attachMetaToResult<T extends MaterialSearchResult>(
  entry: ScoredEntry<T>,
  debug: boolean,
): T {
  const out = {
    ...entry.result,
    meta: entry.meta,
  } as T;
  if (debug) {
    (out as MaterialSearchResult)._breakdown = entry.breakdown;
  }
  return out;
}

function rankWithMode<T extends MaterialSearchResult>(
  results: T[],
  context: MaterialRankingContext,
  opts: { penaltyMultiplier: number; applyGate: boolean; debug: boolean },
): ScoredEntry<T>[] {
  const entries = results.map((result, index) =>
    scoreMaterialInternal(result, index, context, {
      penaltyMultiplier: opts.penaltyMultiplier,
      applyGate: opts.applyGate,
    }),
  );

  const filtered = opts.applyGate
    ? entries.filter((e) => e.passesStrictGate)
    : entries;

  return sortScoredEntries(filtered);
}

function sortByFreshnessThenIndex<T extends MaterialSearchResult>(results: T[]): T[] {
  return results
    .map((result, index) => ({
      result,
      index,
      year: extractYear(haystack(result)) ?? 0,
    }))
    .sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      return a.index - b.index;
    })
    .map(({ result }) => result);
}

export function rankAndLimitMaterials<T extends MaterialSearchResult>(
  results: T[],
  limit = 10,
  context?: MaterialRankingContext,
  options?: RankMaterialsOptions,
): T[] {
  if (results.length === 0) return [];

  const debug = options?.debug ?? false;
  const minStrict = options?.minStrictResults ?? 3;
  const ctx = context ?? {};

  if (!hasRankingContext(context)) {
    return sortByFreshnessThenIndex(results).slice(0, limit);
  }

  const strictRanked = rankWithMode(results, ctx, {
    penaltyMultiplier: 1,
    applyGate: true,
    debug,
  });

  let chosen = strictRanked;

  if (strictRanked.length < minStrict) {
    const relaxedRanked = rankWithMode(results, ctx, {
      penaltyMultiplier: 0.5,
      applyGate: false,
      debug,
    });
    chosen = relaxedRanked;
  }

  return chosen.slice(0, limit).map((entry) => attachMetaToResult(entry, debug));
}
