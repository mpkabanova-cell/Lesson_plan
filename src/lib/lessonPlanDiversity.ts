export type LessonFingerprint = {
  subject: string;
  topic: string;
  activities: string[];
  openingPattern: string;
  taskSnippet: string;
  createdAt: number;
};

const SIMILARITY_THRESHOLD = 0.55;
const MAX_RECENT_FINGERPRINTS = 5;

export function getMaxRecentFingerprints(): number {
  return MAX_RECENT_FINGERPRINTS;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim().toLowerCase();
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 4);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) {
    if (b.has(x)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Извлекает отпечаток урока из сырого Markdown для антишаблонности.
 */
export function extractLessonFingerprint(
  raw: string,
  subject: string,
  topic: string,
): LessonFingerprint {
  const lines = raw.split(/\r?\n/).map(normalizeLine).filter(Boolean);

  const activities: string[] = [];
  for (const line of lines) {
    if (
      line.startsWith("ученики:") ||
      line.includes("ученики ") ||
      line.includes("задание") ||
      line.includes("пробное")
    ) {
      activities.push(line.slice(0, 120));
      if (activities.length >= 12) break;
    }
  }

  const openingPattern =
    lines.find((l) => l.includes("пробн") || l.includes("актуализац"))?.slice(0, 160) ?? "";

  const taskLines = lines.filter((l) => l.includes("задани") || /^\d+[\.)]/.test(l));
  const taskSnippet = taskLines.slice(0, 5).join(" ").slice(0, 500);

  return {
    subject: subject.trim(),
    topic: topic.trim(),
    activities,
    openingPattern,
    taskSnippet,
    createdAt: Date.now(),
  };
}

export function compareFingerprints(
  current: LessonFingerprint,
  recent: LessonFingerprint[],
): { maxSimilarity: number; mostSimilar?: LessonFingerprint } {
  if (recent.length === 0) return { maxSimilarity: 0 };

  const currentText = [
    ...current.activities,
    current.openingPattern,
    current.taskSnippet,
  ].join(" ");
  const currentTokens = tokenize(currentText);

  let maxSimilarity = 0;
  let mostSimilar: LessonFingerprint | undefined;

  for (const fp of recent) {
    const otherText = [...fp.activities, fp.openingPattern, fp.taskSnippet].join(" ");
    const sim = jaccard(currentTokens, tokenize(otherText));
    if (sim > maxSimilarity) {
      maxSimilarity = sim;
      mostSimilar = fp;
    }
  }

  return { maxSimilarity, mostSimilar };
}

export function buildDiversityHint(recent: LessonFingerprint[]): string {
  if (!recent.length) return "";

  const examples = recent
    .slice(0, 3)
    .map((fp) => `«${fp.topic || fp.subject}»: ${fp.openingPattern || fp.activities[0] || "похожая структура"}`)
    .filter(Boolean);

  if (!examples.length) return "";

  return [
    "АНТИШАБЛОН:",
    "Предыдущие сгенерированные уроки использовали похожие активности:",
    ...examples.map((e) => `● ${e}`),
    "Используй **другой способ открытия нового знания** и другие типы заданий; не повторяй одинаковые формулировки этапов и однотипные приёмы.",
  ].join("\n");
}

export function shouldApplyDiversityHint(recent: LessonFingerprint[]): boolean {
  return recent.length > 0;
}

export function getSimilarityThreshold(): number {
  return SIMILARITY_THRESHOLD;
}

/** После генерации: сравнить с recent и при высокой схожести вернуть hint для регенерации. */
export function buildDiversityHintIfSimilar(
  raw: string,
  subject: string,
  topic: string,
  recent: LessonFingerprint[],
): string | null {
  if (recent.length === 0) return null;
  const fp = extractLessonFingerprint(raw, subject, topic);
  const { maxSimilarity, mostSimilar } = compareFingerprints(fp, recent);
  if (maxSimilarity < SIMILARITY_THRESHOLD) return null;

  const topicLabel = mostSimilar?.topic || mostSimilar?.subject || "предыдущий урок";
  return [
    "АНТИШАБЛОН:",
    `Текущий сценарий слишком похож на «${topicLabel}» (совпадение активностей ~${Math.round(maxSimilarity * 100)}%).`,
    "Используй другой способ открытия нового знания, другие материалы и другие типы заданий.",
  ].join("\n");
}
