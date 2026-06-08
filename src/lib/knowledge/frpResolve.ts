import fs from "node:fs";
import path from "node:path";

export type FrpFileEntry = {
  id: string;
  level: string;
  grades: number[];
  pdf: string;
  md: string;
  note?: string | null;
};

export type FrpSubjectManifest = {
  subject: string;
  appAliases: string[];
  files: FrpFileEntry[];
};

export type FrpManifest = {
  generatedAt: string;
  track: string;
  subjects: FrpSubjectManifest[];
};

export type FrpTopicEntry = {
  grade: string | null;
  code: string;
  title: string;
  type: string;
  fileId: string;
  mdPath: string;
};

export type FrpMatchQuality = "topic" | "topic_partial" | "grade" | "program" | "none";

export type FrpSectionKey = "thematic" | "content" | "results";

export type FrpKnowledgeContext =
  | {
      available: true;
      canonicalSubject: string;
      appSubject: string;
      grade: string;
      userTopic: string;
      fileId: string;
      mdPath: string;
      matchQuality: FrpMatchQuality;
      matchedTopicTitle?: string;
      matchedTopicCode?: string;
      sectionsUsed: FrpSectionKey[];
      excerpt: string;
      plannerExcerpt: string;
      contentKeywords: string[];
    }
  | { available: false };

const STOP_WORDS = new Set([
  "урок",
  "тема",
  "класс",
  "изучение",
  "основы",
  "введение",
  "понятие",
  "работа",
  "тип",
  "виды",
  "часть",
]);

/** Расширение запроса учителя для сопоставления с формулировками ФРП. */
const TOPIC_QUERY_EXPANSIONS: Array<{ pattern: RegExp; terms: string[] }> = [
  { pattern: /условн|ветвлен|\bif\b/i, terms: ["ветвлен", "условн", "оператор", "выбор"] },
  { pattern: /цикл|повтор/i, terms: ["цикл", "повтор", "итерац"] },
  { pattern: /массив|список/i, terms: ["массив", "список", "последователь"] },
  { pattern: /алгоритм/i, terms: ["алгоритм", "исполнител"] },
  { pattern: /график|диаграм/i, terms: ["график", "диаграм", "визуализац"] },
  { pattern: /уравнен/i, terms: ["уравнен", "решени"] },
  { pattern: /функци/i, terms: ["функци", "график"] },
  { pattern: /дроб/i, terms: ["дроб", "рациональн"] },
  { pattern: /падеж|склонен/i, terms: ["падеж", "склонен", "имен"] },
  { pattern: /причаст|деепричаст/i, terms: ["причаст", "деепричаст"] },
  { pattern: /орфограф|правописан/i, terms: ["орфограф", "правописан", "безударн"] },
  { pattern: /источник|документ/i, terms: ["источник", "документ", "архив"] },
  { pattern: /революц|импер/i, terms: ["революц", "импер", "реформ"] },
  { pattern: /обществ|государств/i, terms: ["обществ", "государств", "власт"] },
];

let manifestCache: FrpManifest | null = null;

export function loadFrpManifest(): FrpManifest | null {
  if (manifestCache) return manifestCache;
  const filePath = path.join(process.cwd(), "src/lib/knowledge/frp/manifest.json");
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    manifestCache = JSON.parse(raw) as FrpManifest;
    return manifestCache;
  } catch {
    return null;
  }
}

function parseGrade(grade: string): number | null {
  const n = Number.parseInt(grade.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/** Нормализует предмет приложения к каноническому предмету ФРП. */
export function resolveFrpCanonicalSubject(appSubject: string): string | null {
  const manifest = loadFrpManifest();
  if (!manifest) return null;
  const s = appSubject.trim();
  for (const entry of manifest.subjects) {
    if (entry.subject === s || entry.appAliases.includes(s)) {
      return entry.subject;
    }
  }
  if (s === "Алгебра" || s === "Геометрия") return "Математика";
  return null;
}

export function resolveFrpFileForGrade(
  canonicalSubject: string,
  grade: string,
): FrpFileEntry | null {
  const manifest = loadFrpManifest();
  if (!manifest) return null;
  const g = parseGrade(grade);
  if (g === null) return null;

  const subjectEntry = manifest.subjects.find((s) => s.subject === canonicalSubject);
  if (!subjectEntry) return null;

  return subjectEntry.files.find((f) => f.grades.includes(g)) ?? null;
}

function readMdFile(mdRelativePath: string): string {
  const filePath = path.join(process.cwd(), mdRelativePath);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

function normalizeTopicTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\d+\s*(?:час|урок|страниц)/gi, "")
    .replace(/\d+\.\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function expandQueryTokens(topic: string): string[] {
  const base = tokenizeQuery(topic);
  const expanded = new Set(base);
  for (const { pattern, terms } of TOPIC_QUERY_EXPANSIONS) {
    if (pattern.test(topic)) {
      for (const t of terms) expanded.add(t);
    }
  }
  return [...expanded];
}

function loadTopics(canonicalSubject: string): FrpTopicEntry[] {
  const dirName = canonicalSubject.replace(/ /g, "_");
  const candidates = [
    path.join(process.cwd(), "src/lib/knowledge/frp", dirName, "topics.json"),
    path.join(process.cwd(), "src/lib/knowledge/frp", canonicalSubject, "topics.json"),
  ];
  for (const filePath of candidates) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { topics?: FrpTopicEntry[] };
      if (Array.isArray(data.topics)) return data.topics;
    } catch {
      // try next path
    }
  }
  return [];
}

function parseFrpMdSections(md: string): Record<FrpSectionKey, string> {
  const keys: Array<{ key: FrpSectionKey; pattern: RegExp }> = [
    { key: "content", pattern: /^##\s*СОДЕРЖАНИЕ ОБУЧЕНИЯ\s*$/im },
    { key: "results", pattern: /^##\s*ПЛАНИРУЕМЫЕ РЕЗУЛЬТАТЫ\s*$/im },
    { key: "thematic", pattern: /^##\s*ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ\s*$/im },
  ];

  const hits: Array<{ key: FrpSectionKey; index: number; headerLen: number }> = [];
  for (const { key, pattern } of keys) {
    const re = new RegExp(pattern.source, "gim");
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      hits.push({ key, index: m.index, headerLen: m[0].length });
    }
  }
  hits.sort((a, b) => a.index - b.index);

  const sections: Record<FrpSectionKey, string> = {
    content: "",
    results: "",
    thematic: "",
  };

  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].index + hits[i].headerLen;
    const end = i + 1 < hits.length ? hits[i + 1].index : md.length;
    const chunk = md.slice(start, end).trim();
    if (chunk.length > sections[hits[i].key].length) {
      sections[hits[i].key] = chunk;
    }
  }

  return sections;
}

function extractGradeBlock(text: string, grade: string, maxChars = 8000): string {
  if (!text.trim()) return "";
  const startRe = new RegExp(`(?:^|\\n)(?:##\\s*)?${grade}\\s*КЛАСС`, "i");
  const startMatch = startRe.exec(text);
  if (!startMatch) return text.slice(0, maxChars);

  const start = startMatch.index;
  const after = text.slice(start + startMatch[0].length);
  const nextGradeRe = /\n(?:##\s*)?(\d{1,2})\s*КЛАСС/i;
  const nextMatch = nextGradeRe.exec(after);
  const end = nextMatch ? start + startMatch[0].length + nextMatch.index : text.length;
  const block = text.slice(start, end).trim();
  return block.length > maxChars ? block.slice(0, maxChars) : block;
}

function findTextWindow(
  md: string,
  queries: string[],
  beforeChars = 600,
  afterChars = 5500,
): string | null {
  const lower = md.toLowerCase();
  let bestIdx = -1;
  let bestLen = 0;

  for (const q of queries) {
    const needles = [q.toLowerCase()];
    const norm = normalizeTopicTitle(q);
    if (norm.length >= 4 && norm !== q.toLowerCase()) needles.push(norm);
    const short = norm.split(" ").filter((w) => w.length >= 5).slice(0, 4).join(" ");
    if (short.length >= 8) needles.push(short);

    for (const needle of needles) {
      if (needle.length < 4) continue;
      const idx = lower.indexOf(needle);
      if (idx >= 0 && needle.length >= bestLen) {
        bestIdx = idx;
        bestLen = needle.length;
      }
    }
  }

  if (bestIdx < 0) return null;
  const start = Math.max(0, bestIdx - beforeChars);
  const end = Math.min(md.length, bestIdx + afterChars);
  return md.slice(start, end).trim();
}

type TopicMatch = {
  entry: FrpTopicEntry;
  score: number;
  quality: FrpMatchQuality;
};

function scoreTopicMatch(
  userTopic: string,
  entry: FrpTopicEntry,
  gradeNum: number | null,
): TopicMatch | null {
  if (gradeNum !== null && entry.grade && Number.parseInt(entry.grade, 10) !== gradeNum) {
    return null;
  }

  const queryTokens = expandQueryTokens(userTopic);
  if (!queryTokens.length && !userTopic.trim()) return null;

  const titleNorm = normalizeTopicTitle(entry.title);
  const titleTokens = tokenizeQuery(entry.title);
  let score = 0;

  for (const tok of queryTokens) {
    if (titleNorm.includes(tok)) score += entry.type === "topic" ? 3 : 2;
  }

  const userNorm = normalizeTopicTitle(userTopic);
  if (userNorm.length >= 4) {
    if (titleNorm.includes(userNorm.slice(0, Math.min(userNorm.length, 30)))) score += 8;
    const overlap = queryTokens.filter((t) => titleTokens.includes(t)).length;
    score += overlap * 2;
  }

  if (score <= 0) return null;

  let quality: FrpMatchQuality = "topic_partial";
  if (score >= 8) quality = "topic";
  else if (score >= 4) quality = "topic_partial";

  return { entry, score, quality };
}

function pickBestTopicMatch(userTopic: string, topics: FrpTopicEntry[], gradeNum: number | null): TopicMatch | null {
  let best: TopicMatch | null = null;
  for (const t of topics) {
    const m = scoreTopicMatch(userTopic, t, gradeNum);
    if (!m) continue;
    if (!best || m.score > best.score) best = m;
  }
  return best;
}

function extractContentKeywords(text: string, max = 12): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 5 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);

  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function assembleExcerpt(parts: Array<{ key: FrpSectionKey; text: string; budget: number }>, maxChars: number): {
  excerpt: string;
  plannerExcerpt: string;
  sectionsUsed: FrpSectionKey[];
} {
  const sectionsUsed: FrpSectionKey[] = [];
  const chunks: string[] = [];
  let total = 0;

  for (const part of parts) {
    if (!part.text.trim() || total >= maxChars) continue;
    const room = Math.min(part.budget, maxChars - total);
    const slice = part.text.slice(0, room).trim();
    if (!slice) continue;
    const label =
      part.key === "thematic"
        ? "### Тематическое планирование"
        : part.key === "content"
          ? "### Содержание обучения"
          : "### Планируемые результаты";
    chunks.push(`${label}\n\n${slice}`);
    sectionsUsed.push(part.key);
    total += slice.length;
  }

  const excerpt = chunks.join("\n\n---\n\n");
  const plannerExcerpt = chunks
    .map((c) => c.slice(0, 1800))
    .join("\n\n")
    .slice(0, 3500);

  return { excerpt, plannerExcerpt, sectionsUsed };
}

function buildExcerptFromSections(
  sections: Record<FrpSectionKey, string>,
  grade: string,
  userTopic: string,
  topicMatch: TopicMatch | null,
  maxChars: number,
): {
  excerpt: string;
  plannerExcerpt: string;
  sectionsUsed: FrpSectionKey[];
  matchQuality: FrpMatchQuality;
  contentKeywords: string[];
} {
  const gradeThematic = extractGradeBlock(sections.thematic, grade, 12_000);
  const gradeContent = extractGradeBlock(sections.content, grade, 10_000);

  const queries = topicMatch
    ? [topicMatch.entry.title, userTopic.trim()].filter(Boolean)
    : [userTopic.trim()].filter(Boolean);

  let thematicSlice = findTextWindow(gradeThematic || sections.thematic, queries) ?? "";
  let contentSlice = findTextWindow(gradeContent || sections.content, queries) ?? "";

  let matchQuality: FrpMatchQuality = "program";

  if (topicMatch && thematicSlice) {
    matchQuality = topicMatch.quality;
  } else if (thematicSlice || contentSlice) {
    matchQuality = "topic_partial";
  } else if (gradeThematic || gradeContent) {
    thematicSlice = gradeThematic || thematicSlice;
    contentSlice = gradeContent || contentSlice;
    matchQuality = "grade";
  } else {
    thematicSlice = sections.thematic.slice(0, maxChars);
    contentSlice = "";
    matchQuality = sections.thematic ? "program" : "none";
  }

  const resultsSlice = sections.results.slice(0, 1200);

  const { excerpt, plannerExcerpt, sectionsUsed } = assembleExcerpt(
    [
      { key: "thematic", text: thematicSlice, budget: Math.floor(maxChars * 0.55) },
      { key: "content", text: contentSlice, budget: Math.floor(maxChars * 0.35) },
      { key: "results", text: resultsSlice, budget: Math.floor(maxChars * 0.1) },
    ],
    maxChars,
  );

  const keywordSource = [thematicSlice, contentSlice].filter(Boolean).join("\n");
  const contentKeywords = extractContentKeywords(keywordSource);

  return { excerpt, plannerExcerpt, sectionsUsed, matchQuality, contentKeywords };
}

/**
 * Полный контекст ФРП для пайплайна генерации.
 */
export function resolveFrpKnowledgeContext(
  appSubject: string,
  grade: string,
  topic: string,
  maxChars = 12_000,
): FrpKnowledgeContext {
  const canonical = resolveFrpCanonicalSubject(appSubject);
  if (!canonical) return { available: false };

  const file = resolveFrpFileForGrade(canonical, grade);
  if (!file) return { available: false };

  const fullMd = readMdFile(file.md);
  if (!fullMd.trim()) return { available: false };

  const sections = parseFrpMdSections(fullMd);
  const topics = loadTopics(canonical);
  const gradeNum = parseGrade(grade);
  const topicMatch = pickBestTopicMatch(topic, topics, gradeNum);

  const built = buildExcerptFromSections(sections, grade, topic, topicMatch, maxChars);
  if (!built.excerpt.trim() || built.matchQuality === "none") {
    return { available: false };
  }

  return {
    available: true,
    canonicalSubject: canonical,
    appSubject: appSubject.trim(),
    grade: grade.trim(),
    userTopic: topic.trim(),
    fileId: file.id,
    mdPath: file.md,
    matchQuality: built.matchQuality,
    matchedTopicTitle: topicMatch?.entry.title,
    matchedTopicCode: topicMatch?.entry.code,
    sectionsUsed: built.sectionsUsed,
    excerpt: built.excerpt,
    plannerExcerpt: built.plannerExcerpt,
    contentKeywords: built.contentKeywords,
  };
}

/**
 * @deprecated Используйте resolveFrpKnowledgeContext + buildFrpSystemPromptBlock из frpUsage.
 */
export function resolveFrpExcerpt(
  appSubject: string,
  grade: string,
  topic: string,
  maxChars = 14_000,
): { header: string; excerpt: string; fileId?: string } | null {
  const ctx = resolveFrpKnowledgeContext(appSubject, grade, topic, maxChars);
  if (!ctx.available) return null;

  const header = `ФЕДЕРАЛЬНАЯ РАБОЧАЯ ПРОГРАММА (фрагмент, ${ctx.canonicalSubject}, ${ctx.grade} класс, базовый уровень). Тема урока должна соответствовать содержанию программы ниже.`;

  return { header, excerpt: ctx.excerpt, fileId: ctx.fileId };
}
