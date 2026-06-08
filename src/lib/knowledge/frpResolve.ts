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

function readMdExcerpt(mdRelativePath: string, maxChars = 18_000): string {
  const filePath = path.join(process.cwd(), mdRelativePath);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    if (raw.length <= maxChars) return raw;
    return raw.slice(0, maxChars).trimEnd() + "\n\n[…фрагмент ФРП обрезан]";
  } catch {
    return "";
  }
}

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

function loadTopics(canonicalSubject: string): FrpTopicEntry[] {
  const filePath = path.join(process.cwd(), "src/lib/knowledge/frp", canonicalSubject, "topics.json");
  try {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as { topics?: FrpTopicEntry[] };
    return Array.isArray(data.topics) ? data.topics : [];
  } catch {
    return [];
  }
}

function findTopicSlice(md: string, topicTitle: string, windowChars = 6000): string | null {
  const lower = md.toLowerCase();
  const needle = topicTitle.toLowerCase().slice(0, 40);
  if (needle.length < 4) return null;
  const idx = lower.indexOf(needle);
  if (idx < 0) return null;
  const start = Math.max(0, idx - 800);
  const end = Math.min(md.length, idx + windowChars);
  return md.slice(start, end).trim();
}

/**
 * Фрагмент ФРП для подмешивания в промпт: по предмету, классу и теме урока.
 */
export function resolveFrpExcerpt(
  appSubject: string,
  grade: string,
  topic: string,
  maxChars = 14_000,
): { header: string; excerpt: string; fileId?: string } | null {
  const canonical = resolveFrpCanonicalSubject(appSubject);
  if (!canonical) return null;

  const file = resolveFrpFileForGrade(canonical, grade);
  if (!file) return null;

  const fullMd = readMdExcerpt(file.md, 250_000);
  if (!fullMd.trim()) return null;

  const topics = loadTopics(canonical);
  const gradeNum = parseGrade(grade);
  const queryTokens = tokenizeQuery(topic);

  let bestTopic: FrpTopicEntry | null = null;
  let bestScore = 0;

  for (const t of topics) {
    if (gradeNum !== null && t.grade && Number.parseInt(t.grade, 10) !== gradeNum) continue;
    const titleLower = t.title.toLowerCase();
    let score = 0;
    for (const tok of queryTokens) {
      if (titleLower.includes(tok)) score += 2;
    }
    if (topic.trim() && titleLower.includes(topic.trim().toLowerCase().slice(0, 20))) {
      score += 5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = t;
    }
  }

  let excerpt = "";
  if (bestTopic && bestScore > 0) {
    const slice = findTopicSlice(fullMd, bestTopic.title);
    if (slice) excerpt = slice;
  }

  if (!excerpt && topic.trim()) {
    const slice = findTopicSlice(fullMd, topic.trim());
    if (slice) excerpt = slice;
  }

  if (!excerpt) {
    const thematicIdx = fullMd.search(/## ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ/i);
    const contentIdx = fullMd.search(/## СОДЕРЖАНИЕ ОБУЧЕНИЯ/i);
    const start =
      thematicIdx >= 0 ? thematicIdx : contentIdx >= 0 ? contentIdx : 0;
    excerpt = fullMd.slice(start, start + maxChars);
  }

  if (excerpt.length > maxChars) {
    excerpt = excerpt.slice(0, maxChars).trimEnd() + "\n\n[…фрагмент ФРП обрезан]";
  }

  const header = `ФЕДЕРАЛЬНАЯ РАБОЧАЯ ПРОГРАММА (фрагмент, ${canonical}, ${grade} класс, базовый уровень). Тема урока должна соответствовать содержанию программы ниже.`;

  return { header, excerpt, fileId: file.id };
}
