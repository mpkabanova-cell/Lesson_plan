import { getStageContentRule } from "./stageContentRules";
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

export type ParsedStageTask = {
  id: string;
  condition: string;
  answer: string | null;
};

const TASK_LINE_RE = /^\s*(?:\*\*)?задание\s+(\d+\.\d+)(?:\*\*)?[:\s]*(.*)$/i;
const MATERIAL_HEADER_RE = /^\s*(?:\*\*)?задание\s*\/\s*материал(?:\*\*)?\s*:?\s*(.*)$/i;
const ANSWER_LINE_RE = /^\s*(?:\*\*)?(?:ответ|разбор)(?:\*\*)?\s*:\s*(.*)$/i;
const TEACHER_NOTE_RE = /^\s*(?:\*\*)?(?:пояснение(?:\s+для\s+учителя)?|для\s+учителя)(?:\*\*)?\s*:/i;
const STAGE_BREAK_RE = /^(?:#{1,3}\s|время\s*:|учитель\s*:|ученик)/i;

const PLACEHOLDER_VALUES = new Set([
  "...",
  "…",
  "tbd",
  "todo",
  "null",
  "—",
  "-",
  "n/a",
  "нет",
  "пусто",
]);

const PLACEHOLDER_INLINE_RE = /(?:^|\s)(\.\.\.|…|\bTBD\b|\bTODO\b|\bnull\b)(?:\s|$)/i;

const MIN_CONDITION_CHARS = 12;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAny(text: string, patterns: string[]): boolean {
  const t = normalize(text);
  return patterns.some((p) => t.includes(p.toLowerCase()));
}

function isPlaceholderText(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  const lower = t.toLowerCase();
  if (PLACEHOLDER_VALUES.has(lower)) return true;
  if (/^\.{2,}$|^…+$/.test(t)) return true;
  if (PLACEHOLDER_INLINE_RE.test(t) && t.length <= 24) return true;
  return false;
}

function extractActivityValue(text: string, label: "учитель" | "ученик"): string | null {
  const re = new RegExp(
    `^\\s*(?:\\*\\*)?${label}(?:и)?(?:\\*\\*)?\\s*:\\s*(.+)$`,
    "im",
  );
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

export function parseStageTasks(markdown: string): ParsedStageTask[] {
  const lines = markdown.split(/\r?\n/);
  const tasks: ParsedStageTask[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const taskMatch = line.match(TASK_LINE_RE);
    const materialMatch = line.match(MATERIAL_HEADER_RE);

    if (!taskMatch && !materialMatch) {
      i += 1;
      continue;
    }

    let id: string;
    const conditionParts: string[] = [];
    let answer: string | null = null;

    if (taskMatch) {
      id = taskMatch[1];
      const inlineCondition = taskMatch[2]?.trim();
      if (inlineCondition) conditionParts.push(inlineCondition);
    } else {
      id = `material-${tasks.length + 1}`;
      const inline = materialMatch![1]?.trim();
      if (inline) conditionParts.push(inline);
    }

    i += 1;
    while (i < lines.length) {
      const cur = lines[i];
      if (TASK_LINE_RE.test(cur) || MATERIAL_HEADER_RE.test(cur)) break;
      if (STAGE_BREAK_RE.test(cur.trim()) && !ANSWER_LINE_RE.test(cur)) break;

      const answerMatch = cur.match(ANSWER_LINE_RE);
      if (answerMatch) {
        answer = answerMatch[1]?.trim() ?? "";
        i += 1;
        while (i < lines.length) {
          const next = lines[i];
          if (
            TASK_LINE_RE.test(next) ||
            MATERIAL_HEADER_RE.test(next) ||
            STAGE_BREAK_RE.test(next.trim())
          ) {
            break;
          }
          if (TEACHER_NOTE_RE.test(next)) {
            i += 1;
            continue;
          }
          if (next.trim()) {
            answer = `${answer} ${next.trim()}`.trim();
          }
          i += 1;
        }
        break;
      }

      if (!TEACHER_NOTE_RE.test(cur) && cur.trim()) {
        conditionParts.push(cur.trim());
      }
      i += 1;
    }

    tasks.push({
      id,
      condition: conditionParts.join(" ").trim(),
      answer,
    });
  }

  return tasks;
}

function validateActivityBlocks(
  text: string,
  issues: StageValidationIssue[],
): void {
  const teacher = extractActivityValue(text, "учитель");
  const students = extractActivityValue(text, "ученик");

  if (teacher === null) {
    issues.push({ code: "missing_teacher", message: "Укажи блок «Учитель:»." });
  } else if (isPlaceholderText(teacher)) {
    issues.push({
      code: "empty_teacher_activity",
      message: "Блок «Учитель:» пустой или содержит плейсхолдер (... / TBD / TODO / null).",
    });
  }

  if (students === null) {
    issues.push({ code: "missing_students", message: "Укажи блок «Ученики:»." });
  } else if (isPlaceholderText(students)) {
    issues.push({
      code: "empty_student_activity",
      message: "Блок «Ученики:» пустой или содержит плейсхолдер (... / TBD / TODO / null).",
    });
  }
}

function validatePlaceholdersInBody(text: string, issues: StageValidationIssue[]): void {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(?:#{1,3}\s|время\s*:)/i.test(trimmed)) continue;

    if (PLACEHOLDER_INLINE_RE.test(trimmed)) {
      issues.push({
        code: "placeholder_in_text",
        message: `Недопустимый плейсхолдер в тексте этапа: «${trimmed.slice(0, 80)}».`,
      });
      break;
    }
  }
}

function validateTasks(
  text: string,
  stage: StageDefinition,
  issues: StageValidationIssue[],
): void {
  const contentRule = getStageContentRule(stage.id);
  const needsTasks =
    contentRule?.requiresTasks ||
    stage.requiredOutputs.some((o) => /задание|пробн/i.test(o));

  const tasks = parseStageTasks(text);

  if (needsTasks && tasks.length === 0 && !/задание\s*\/\s*материал/i.test(text)) {
    issues.push({
      code: "missing_task",
      message: `На этапе «${stage.title}» нужно хотя бы одно задание «Задание N.M» с условием и ответом.`,
    });
    return;
  }

  const minTasks = contentRule?.minTasks ?? (needsTasks ? 1 : 0);
  if (minTasks > 0 && tasks.length < minTasks) {
    issues.push({
      code: "tasks_count",
      message: `На этапе «${stage.title}» нужно минимум ${minTasks} задание(й), найдено: ${tasks.length}.`,
    });
  }

  for (const task of tasks) {
    if (!task.condition || task.condition.length < MIN_CONDITION_CHARS) {
      issues.push({
        code: "missing_task_condition",
        message: `Задание ${task.id}: нет условия (нужен конкретный текст задачи, не менее ${MIN_CONDITION_CHARS} символов).`,
      });
    } else if (isPlaceholderText(task.condition)) {
      issues.push({
        code: "placeholder_condition",
        message: `Задание ${task.id}: условие — плейсхолдер (... / TBD / TODO / null).`,
      });
    }

    if (task.answer === null) {
      issues.push({
        code: "missing_answer",
        message: `Задание ${task.id}: нет строки «Ответ:» сразу под условием.`,
      });
    } else if (isPlaceholderText(task.answer)) {
      issues.push({
        code: "empty_answer",
        message: `Задание ${task.id}: после «Ответ:» нет текста (пусто или плейсхолдер).`,
      });
    }
  }
}

function validateStageContentRules(
  text: string,
  stage: StageDefinition,
  issues: StageValidationIssue[],
): void {
  const rule = getStageContentRule(stage.id);
  if (!rule) return;

  for (const forbidden of rule.forbidden) {
    if (hasAny(text, [forbidden])) {
      issues.push({
        code: "stage_content_rule",
        message: `Этап «${stage.title}» не соответствует цели: запрещено «${forbidden}».`,
      });
    }
  }
}

function countTasks(text: string): number {
  return parseStageTasks(text).length;
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

  validateActivityBlocks(text, issues);
  validatePlaceholdersInBody(text, issues);

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

  validateStageContentRules(text, stage, issues);
  validateTasks(text, stage, issues);

  const needsTrial = stage.id === "knowledge_activation";
  const needsDifficulty =
    stage.id === "knowledge_activation" || stage.id === "problem_situation_goal";
  const needsBenchmark =
    stage.id === "primary_acquisition" ||
    stage.id === "primary_consolidation" ||
    stage.id === "primary_comprehension_check";
  const needsHomework = stage.id === "homework_info";
  const needsReflection = stage.id === "reflection";

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

  if (needsReflection && !hasAny(text, ["рефлекс", "итог", "самооцен", "лист"])) {
    issues.push({
      code: "missing_reflection",
      message: "Рефлексия: укажи приём рефлексии или итог урока.",
    });
  }

  const materialHits = profile.requiredMaterials.filter((m) => hasAny(text, [m]));
  if (
    ["primary_acquisition", "primary_consolidation", "knowledge_activation"].includes(stage.id) &&
    materialHits.length < 1 &&
    countTasks(text) < 1
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
    "Каждое «Задание N.M» обязано содержать: (1) условие, (2) строку «Ответ:» с непустым ожидаемым ответом.",
    "Опционально под заданием: «Пояснение для учителя:».",
    "Запрещены плейсхолдеры: ..., TBD, TODO, null. Блоки «Учитель:» и «Ученики:» — с конкретным содержанием.",
    "Содержание этапа должно соответствовать его цели FGOS (без запрещённых приёмов для этого этапа).",
    "Ответы — inline под «Задание N.M», не в конце плана.",
  ].join("\n");
}

export const MAX_STAGE_ATTEMPTS = 3;
