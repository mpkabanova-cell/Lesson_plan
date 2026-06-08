import type { StageDefinition } from "./stageRegistry";
import type { SubjectProfile } from "./subjectProfiles";

export type StageValidationIssue = {
  code: string;
  message: string;
};

export type StageValidationResult = {
  ok: boolean;
  issues: StageValidationIssue[];
};

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAny(text: string, patterns: string[]): boolean {
  const t = normalize(text);
  return patterns.some((p) => t.includes(p.toLowerCase()));
}

function countTasks(text: string): number {
  const matches = text.match(/задание\s+\d+\.\d+/gi);
  return matches?.length ?? 0;
}

export function validateStageMarkdown(
  markdown: string,
  stage: StageDefinition,
  profile: SubjectProfile,
): StageValidationResult {
  const text = markdown.trim();
  const issues: StageValidationIssue[] = [];

  if (text.length < 80) {
    issues.push({ code: "too_short", message: "Этап слишком короткий." });
  }

  if (!/время\s*:/i.test(text)) {
    issues.push({ code: "missing_time", message: "Укажи строку «Время: N мин»." });
  }

  if (!/учитель\s*:/i.test(text)) {
    issues.push({ code: "missing_teacher", message: "Укажи блок «Учитель:»." });
  }

  if (!/ученик/i.test(text)) {
    issues.push({ code: "missing_students", message: "Укажи блок «Ученики:»." });
  }

  for (const forbidden of stage.forbidden) {
    if (hasAny(text, [forbidden])) {
      issues.push({
        code: "forbidden_pattern",
        message: `Запрещённый приём на этапе «${stage.title}»: ${forbidden}.`,
      });
    }
  }

  for (const pattern of profile.forbiddenPatterns) {
    if (hasAny(text, [pattern])) {
      issues.push({
        code: "subject_forbidden",
        message: `Предметный запрет: ${pattern}.`,
      });
    }
  }

  const needsTask = stage.requiredOutputs.some((o) =>
    /задание|пробн|материал/i.test(o),
  );
  const needsAnswer = stage.requiredOutputs.some((o) => /ответ/i.test(o));
  const needsTrial = stage.id === "knowledge_activation";
  const needsDifficulty = stage.id === "knowledge_activation" || stage.id === "problem_situation_goal";
  const needsBenchmark =
    stage.id === "primary_acquisition" ||
    stage.id === "primary_consolidation" ||
    stage.id === "primary_comprehension_check";
  const needsHomework = stage.id === "homework_info";
  const needsReflection = stage.id === "reflection";

  if (needsTask && countTasks(text) < 1 && !/задание\s*\/\s*материал/i.test(text)) {
    issues.push({
      code: "missing_task",
      message: `На этапе «${stage.title}» нужно задание или материал.`,
    });
  }

  if (needsAnswer && !/ответ\s*:/i.test(text) && countTasks(text) > 0) {
    issues.push({
      code: "missing_answer",
      message: "Добавь «Ответ:» под заданием в этом этапе.",
    });
  }

  if (needsTrial && !hasAny(text, ["пробн", "попроб", "выполн"])) {
    issues.push({
      code: "missing_trial",
      message: "Актуализация: нужно пробное учебное действие.",
    });
  }

  if (
    needsDifficulty &&
    !hasAny(text, ["затруднен", "не получ", "ошибк", "разные ответ", "сомнен"])
  ) {
    issues.push({
      code: "missing_difficulty",
      message: "Зафиксируй затруднение учащихся.",
    });
  }

  if (
    needsBenchmark &&
    !hasAny(text, ["эталон", "правил", "алгоритм", "схем", "модел", "формул"])
  ) {
    issues.push({
      code: "missing_benchmark",
      message: "Нужен эталон: правило, алгоритм, схема или модель.",
    });
  }

  if (needsHomework && !hasAny(text, ["домашн", "дз", "задани"])) {
    issues.push({
      code: "missing_homework",
      message: "Укажи конкретные задания домашней работы.",
    });
  }

  if (needsHomework && hasAny(text, ["подумайте дома", "пожелание", "по желанию"])) {
    issues.push({
      code: "vague_homework",
      message: "ДЗ должно быть конкретным, не пожеланием.",
    });
  }

  if (needsReflection && !hasAny(text, ["рефлекс", "итог", "самооцен", "лист"])) {
    issues.push({
      code: "missing_reflection",
      message: "Рефлексия: укажи приём рефлексии или итог урока.",
    });
  }

  const materialHits = profile.requiredMaterials.filter((m) => hasAny(text, [m]));
  if (
    ["primary_acquisition", "primary_consolidation", "knowledge_activation"].includes(stage.id) &&
    materialHits.length < 1
  ) {
    issues.push({
      code: "subject_materials",
      message: `Добавь предметный материал (${profile.requiredMaterials.slice(0, 3).join(", ")}).`,
    });
  }

  return { ok: issues.length === 0, issues };
}

export function buildStageFixInstructions(issues: StageValidationIssue[]): string {
  if (!issues.length) return "";
  return [
    "ЭТАП НЕ ПРОШЁЛ ПРОВЕРКУ:",
    ...issues.map((i) => `● ${i.message}`),
    "",
    "Исправь только этот этап. Сохрани формат Markdown-карточки.",
    "Ответы — inline под «Задание N.M», не в конце плана.",
  ].join("\n");
}

export const MAX_STAGE_ATTEMPTS = 3;
