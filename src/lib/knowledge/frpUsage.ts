import {
  resolveFrpKnowledgeContext,
  type FrpKnowledgeContext,
} from "@/lib/knowledge/frpResolve";

export type { FrpKnowledgeContext };

/** Единая точка входа: есть ли ФРП для урока и какой фрагмент подобран. */
export function resolveFrpForLesson(
  appSubject: string,
  grade: string,
  topic: string,
): FrpKnowledgeContext {
  return resolveFrpKnowledgeContext(appSubject, grade, topic);
}

export function isFrpAvailable(ctx: FrpKnowledgeContext): ctx is Extract<
  FrpKnowledgeContext,
  { available: true }
> {
  return ctx.available;
}

/** Legacy-заглушка informatika_7_9.md не нужна, если ФРП уже покрывает класс. */
export function shouldSkipLegacyInformaticsStub(
  ctx: FrpKnowledgeContext,
  subject?: string,
  grade?: string,
): boolean {
  if (!isFrpAvailable(ctx)) return false;
  if (subject?.trim() !== "Информатика") return false;
  const g = grade?.trim();
  return g === "7" || g === "8" || g === "9";
}

const SYSTEM_USAGE_RULES = `Как использовать фрагмент ФРП при генерации сценария:
1. Содержание урока (тексты, задачи, факты, термины) должно соответствовать теме и классу из программы ниже — не выдумывай содержание вне программы.
2. Цель урока из запроса пользователя уточняет фокус, но не отменяет требования ФРП по теме и уровню.
3. В этапах от актуализации до закрепления используй конкретные предметные материалы (источник, задача, текст, схема), опираясь на перечисленные в ФРП знания и умения.
4. Не дублируй дословно большие куски программы — перерабатывай в учебные задания и речь учителя.
5. Предметный режим (блок ниже) задаёт форму урока; ФРП задаёт **что** именно учить на этом уроке.`;

function describeMatch(ctx: Extract<FrpKnowledgeContext, { available: true }>): string {
  const q = ctx.matchQuality;
  if (q === "topic" && ctx.matchedTopicTitle) {
    return `Тема урока сопоставлена с программой: «${ctx.matchedTopicTitle}»${ctx.matchedTopicCode ? ` (${ctx.matchedTopicCode})` : ""}.`;
  }
  if (q === "topic_partial" && ctx.matchedTopicTitle) {
    return `Тема урока частично совпала с разделом программы: «${ctx.matchedTopicTitle}». Уточни содержание по фрагменту ниже.`;
  }
  if (q === "grade") {
    return `Точного совпадения темы в программе нет — подобран блок для ${ctx.grade} класса. Сверь содержание урока с перечнем тем класса.`;
  }
  return `Используется общий фрагмент программы для ${ctx.canonicalSubject}, ${ctx.grade} класс. Сверь тему урока с содержанием вручную.`;
}

/** Полный блок для системного промпта (писатель / v1). */
export function buildFrpSystemPromptBlock(ctx: FrpKnowledgeContext): string | null {
  if (!isFrpAvailable(ctx) || !ctx.excerpt.trim()) return null;

  const sectionsNote =
    ctx.sectionsUsed.length > 0
      ? `Источники фрагмента: ${ctx.sectionsUsed.join(", ")}.`
      : "";

  return `ФЕДЕРАЛЬНАЯ РАБОЧАЯ ПРОГРАММА (ФРП): ${ctx.canonicalSubject}, ${ctx.grade} класс, базовый уровень.
${describeMatch(ctx)}
${sectionsNote}

${SYSTEM_USAGE_RULES}

---

${ctx.excerpt}`;
}

/** Краткий контекст для шага планировщика (v2) — без дублирования полного excerpt в system. */
export function buildFrpPlannerUserBlock(ctx: FrpKnowledgeContext): string | null {
  if (!isFrpAvailable(ctx)) return null;

  const plannerExcerpt =
    ctx.plannerExcerpt.trim() || ctx.excerpt.slice(0, 3500).trim();

  return [
    "КОНТЕКСТ ФРП (для полей subjectMaterials, trialActionIdea, keyActivity):",
    describeMatch(ctx),
    "Планируй открытие нового знания и материалы по фрагменту программы ниже; полный ФРП также в системном промпте шага сценария.",
    "",
    plannerExcerpt,
  ].join("\n");
}

/** Подсказка при регенерации, если не хватает предметного содержания. */
export function buildFrpValidationHint(ctx: FrpKnowledgeContext): string | null {
  if (!isFrpAvailable(ctx)) return null;
  if (ctx.matchQuality === "program" || ctx.matchQuality === "none") return null;

  const topicLine = ctx.matchedTopicTitle
    ? `Опирайся на тему программы: «${ctx.matchedTopicTitle}».`
    : `Опирайся на содержание программы для ${ctx.grade} класса.`;

  const keywords = ctx.contentKeywords.slice(0, 8).join(", ");
  const kwLine = keywords
    ? `Включи в сценарий предметные элементы из программы (термины, задания, материалы): ${keywords}.`
    : "";

  return [topicLine, kwLine].filter(Boolean).join(" ");
}

export function toFrpApiMeta(
  ctx: FrpKnowledgeContext,
): {
  available: boolean;
  canonicalSubject?: string;
  fileId?: string;
  matchQuality?: string;
  matchedTopicTitle?: string;
  matchedTopicCode?: string;
  sectionsUsed?: string[];
} | null {
  if (!isFrpAvailable(ctx)) {
    return { available: false };
  }
  return {
    available: true,
    canonicalSubject: ctx.canonicalSubject,
    fileId: ctx.fileId,
    matchQuality: ctx.matchQuality,
    matchedTopicTitle: ctx.matchedTopicTitle,
    matchedTopicCode: ctx.matchedTopicCode,
    sectionsUsed: ctx.sectionsUsed,
  };
}
