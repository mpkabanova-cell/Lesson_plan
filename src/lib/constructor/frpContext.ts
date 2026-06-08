import fs from "node:fs";
import path from "node:path";
import {
  resolveFrpCanonicalSubject,
  resolveFrpFileForGrade,
  type FrpMatchQuality,
  type FrpTopicEntry,
} from "@/lib/knowledge/frpResolve";
import { resolveFrpKnowledgeContext } from "@/lib/knowledge/frpResolve";

export type FrpTopicRef = {
  code: string;
  title: string;
  type: string;
};

export type ConstructorFrpContext =
  | {
      available: true;
      canonicalSubject: string;
      appSubject: string;
      grade: string;
      userTopic: string;
      fileId: string;
      matchQuality: FrpMatchQuality;
      topic: FrpTopicRef & { section?: FrpTopicRef };
      prevTopic?: FrpTopicRef;
      nextTopic?: FrpTopicRef;
      concepts: string[];
      results: {
        personal: string;
        meta: string;
        subject: string;
      };
      contentScope: string;
      contentKeywords: string[];
    }
  | { available: false };

const CONCEPT_LINE_RE =
  /^(?:[-*•]\s*)?(?:Понимать|Знать|Уметь|Создавать|Осуществлять|Использовать|Анализировать|Оценивать)/i;

function parseGrade(grade: string): number | null {
  const n = Number.parseInt(grade.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function readMdFile(mdRelativePath: string): string {
  const filePath = path.join(process.cwd(), mdRelativePath);
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
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
      // try next
    }
  }
  return [];
}

function parseFrpMdSections(md: string): Record<"content" | "results" | "thematic", string> {
  const keys: Array<{ key: "content" | "results" | "thematic"; pattern: RegExp }> = [
    { key: "content", pattern: /^##\s*СОДЕРЖАНИЕ ОБУЧЕНИЯ\s*$/im },
    { key: "results", pattern: /^##\s*ПЛАНИРУЕМЫЕ РЕЗУЛЬТАТЫ\s*$/im },
    { key: "thematic", pattern: /^##\s*ТЕМАТИЧЕСКОЕ ПЛАНИРОВАНИЕ\s*$/im },
  ];

  const hits: Array<{ key: "content" | "results" | "thematic"; index: number; headerLen: number }> =
    [];
  for (const { key, pattern } of keys) {
    const re = new RegExp(pattern.source, "gim");
    let m: RegExpExecArray | null;
    while ((m = re.exec(md)) !== null) {
      hits.push({ key, index: m.index, headerLen: m[0].length });
    }
  }
  hits.sort((a, b) => a.index - b.index);

  const sections = { content: "", results: "", thematic: "" };
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

function extractGradeBlock(text: string, grade: string, maxChars = 6000): string {
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

function splitResultsByType(resultsText: string, grade: string): {
  personal: string;
  meta: string;
  subject: string;
} {
  const block = extractGradeBlock(resultsText, grade, 4000);
  const personal =
    block.match(/личностн[\s\S]*?(?=\n(?:мета|предмет)|$)/i)?.[0]?.trim() ?? "";
  const meta = block.match(/метапредметн[\s\S]*?(?=\nпредмет|$)/i)?.[0]?.trim() ?? "";
  const subject = block.match(/предметн[\s\S]*/i)?.[0]?.trim() ?? block.slice(0, 1500);
  return { personal, meta, subject };
}

function extractConcepts(thematicSlice: string, topicTitle: string): string[] {
  const lines = thematicSlice.split(/\r?\n/);
  const concepts: string[] = [];
  const topicLower = topicTitle.toLowerCase().slice(0, 24);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!CONCEPT_LINE_RE.test(trimmed)) continue;
    if (topicLower && !trimmed.toLowerCase().includes(topicLower.slice(0, 12))) {
      if (concepts.length >= 8) continue;
    }
    concepts.push(trimmed.replace(/^[-*•]\s*/, ""));
    if (concepts.length >= 12) break;
  }

  if (!concepts.length) {
    for (const line of lines) {
      if (CONCEPT_LINE_RE.test(line.trim())) {
        concepts.push(line.trim().replace(/^[-*•]\s*/, ""));
        if (concepts.length >= 6) break;
      }
    }
  }
  return concepts;
}

function findTopicNeighbors(
  topics: FrpTopicEntry[],
  matched: FrpTopicEntry | undefined,
  fileId: string,
  gradeNum: number | null,
): { prev?: FrpTopicRef; next?: FrpTopicRef; section?: FrpTopicRef } {
  if (!matched) return {};

  const filtered = topics.filter((t) => {
    if (t.fileId !== fileId) return false;
    if (gradeNum !== null && t.grade && Number.parseInt(t.grade, 10) !== gradeNum) return false;
    return t.type === "topic" || t.type === "section";
  });

  const idx = filtered.findIndex((t) => t.code === matched.code && t.title === matched.title);
  if (idx < 0) return {};

  let section: FrpTopicRef | undefined;
  for (let i = idx; i >= 0; i--) {
    if (filtered[i].type === "section") {
      section = { code: filtered[i].code, title: filtered[i].title, type: filtered[i].type };
      break;
    }
  }

  const topicOnly = filtered.filter((t) => t.type === "topic");
  const topicIdx = topicOnly.findIndex((t) => t.code === matched.code);
  const prev =
    topicIdx > 0
      ? {
          code: topicOnly[topicIdx - 1].code,
          title: topicOnly[topicIdx - 1].title,
          type: topicOnly[topicIdx - 1].type,
        }
      : undefined;
  const next =
    topicIdx >= 0 && topicIdx < topicOnly.length - 1
      ? {
          code: topicOnly[topicIdx + 1].code,
          title: topicOnly[topicIdx + 1].title,
          type: topicOnly[topicIdx + 1].type,
        }
      : undefined;

  return { prev, next, section };
}

function findMatchedTopicEntry(
  topics: FrpTopicEntry[],
  fileId: string,
  grade: string,
  matchedTitle?: string,
  matchedCode?: string,
): FrpTopicEntry | undefined {
  const gradeNum = parseGrade(grade);
  const pool = topics.filter((t) => {
    if (t.fileId !== fileId) return false;
    if (gradeNum !== null && t.grade && Number.parseInt(t.grade, 10) !== gradeNum) return false;
    return t.type === "topic";
  });

  if (matchedCode) {
    const byCode = pool.find((t) => t.code === matchedCode);
    if (byCode) return byCode;
  }
  if (matchedTitle) {
    const lower = matchedTitle.toLowerCase();
    return pool.find((t) => t.title.toLowerCase().includes(lower.slice(0, 20)));
  }
  return undefined;
}

/**
 * Структурированный контекст ФРП для конструктора v3.
 */
export function resolveConstructorFrpContext(
  appSubject: string,
  grade: string,
  topic: string,
): ConstructorFrpContext {
  const base = resolveFrpKnowledgeContext(appSubject, grade, topic, 14_000);
  if (!base.available) return { available: false };

  const canonical = resolveFrpCanonicalSubject(appSubject);
  if (!canonical) return { available: false };

  const file = resolveFrpFileForGrade(canonical, grade);
  if (!file) return { available: false };

  const fullMd = readMdFile(file.md);
  const sections = parseFrpMdSections(fullMd);
  const topics = loadTopics(canonical);
  const gradeNum = parseGrade(grade);

  const matchedEntry = findMatchedTopicEntry(
    topics,
    file.id,
    grade,
    base.matchedTopicTitle,
    base.matchedTopicCode,
  );

  const { prev, next, section } = findTopicNeighbors(topics, matchedEntry, file.id, gradeNum);

  const contentScope = extractGradeBlock(sections.content, grade, 3500);
  const thematicGrade = extractGradeBlock(sections.thematic, grade, 5000);
  const concepts = extractConcepts(thematicGrade, base.matchedTopicTitle ?? topic);
  const results = splitResultsByType(sections.results, grade);

  return {
    available: true,
    canonicalSubject: base.canonicalSubject,
    appSubject: base.appSubject,
    grade: base.grade,
    userTopic: base.userTopic,
    fileId: base.fileId,
    matchQuality: base.matchQuality,
    topic: {
      code: matchedEntry?.code ?? base.matchedTopicCode ?? "",
      title: matchedEntry?.title ?? base.matchedTopicTitle ?? topic,
      type: matchedEntry?.type ?? "topic",
      section,
    },
    prevTopic: prev,
    nextTopic: next,
    concepts,
    results,
    contentScope,
    contentKeywords: base.contentKeywords,
  };
}

/** Срез ФРП для конкретного этапа FGOS. */
export function getStageFrpSlice(
  ctx: Extract<ConstructorFrpContext, { available: true }>,
  stageId: string,
): Record<string, unknown> {
  const slice: Record<string, unknown> = {
    topic: ctx.topic,
    userTopic: ctx.userTopic,
    grade: ctx.grade,
    subject: ctx.canonicalSubject,
  };

  switch (stageId) {
    case "knowledge_activation":
    case "homework_check":
      if (ctx.prevTopic) slice.prevTopic = ctx.prevTopic;
      slice.hint = "Опирайся на опорные знания из предыдущих тем.";
      break;
    case "problem_situation_goal":
    case "primary_acquisition":
      if (ctx.concepts.length) slice.concepts = ctx.concepts.slice(0, 8);
      if (ctx.contentScope) slice.contentScope = ctx.contentScope.slice(0, 2000);
      break;
    case "reflection":
    case "goal_setting_motivation":
      if (ctx.results.subject) slice.subjectResults = ctx.results.subject.slice(0, 1200);
      break;
    case "generalization_systematization":
      if (ctx.concepts.length) slice.concepts = ctx.concepts.slice(0, 6);
      if (ctx.contentScope) slice.contentScope = ctx.contentScope.slice(0, 1500);
      break;
    default:
      if (ctx.contentKeywords.length) slice.keywords = ctx.contentKeywords.slice(0, 12);
  }

  return slice;
}

export function frpContextToApiMeta(ctx: ConstructorFrpContext): Record<string, unknown> | null {
  if (!ctx.available) return null;
  return {
    matchQuality: ctx.matchQuality,
    topic: ctx.topic.title,
    topicCode: ctx.topic.code,
    section: ctx.topic.section?.title,
    prevTopic: ctx.prevTopic?.title,
    nextTopic: ctx.nextTopic?.title,
    conceptsCount: ctx.concepts.length,
    fileId: ctx.fileId,
  };
}
