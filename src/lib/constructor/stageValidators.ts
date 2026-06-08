import {
  GENERIC_TEACHER_PHRASES,
  MIN_EXPECTED_RESULT_CHARS,
  MIN_STUDENT_ANSWER_BULLETS,
  MIN_TEACHER_SPEECH_QUOTED_CHARS,
  STAGE_BLOCK_LABELS,
  STAGES_REQUIRING_STUDENT_ANSWERS,
  type StageMethodologicalBlock,
} from "./stageBlockSchema";
import { getStageContentRule } from "./stageContentRules";
import type { StageDefinition } from "./stageRegistry";
import { normalizeTechniqueName, type StageTechnique } from "./stageTechniques";
import { findDuplicateTasksInStage } from "./stageTaskDiversity";
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

export type StageValidationContext = {
  requiredTechnique?: StageTechnique;
  previousTaskConditions?: string[];
  topic?: string;
  isTemplateStage?: boolean;
};

const TASK_LINE_RE = /^\s*(?:\*\*)?задание\s+(\d+\.\d+)(?:\*\*)?[:\s]*(.*)$/i;
const MATERIAL_HEADER_RE = /^\s*(?:\*\*)?задание\s*\/\s*материал(?:\*\*)?\s*:?\s*(.*)$/i;
const ANSWER_LINE_RE = /^\s*(?:\*\*)?(?:ответ|разбор)(?:\*\*)?\s*:\s*(.*)$/i;
const TEACHER_NOTE_RE = /^\s*(?:\*\*)?(?:пояснение(?:\s+для\s+учителя)?|для\s+учителя)(?:\*\*)?\s*:/i;

const STAGE_BREAK_RE =
  /^(?:#{1,3}\s|время\s*:|цель\s*:|методический\s+при|речь\s+учител|предполагаемые\s+ответ|ученик|ожидаемый\s+результат|методический\s+коммент)/i;

const BLOCK_FIELD_RES: Array<{ key: keyof StageMethodologicalBlock; re: RegExp }> = [
  { key: "goal", re: /^\s*(?:\*\*)?цель(?:\*\*)?\s*:\s*(.*)$/i },
  { key: "technique", re: /^\s*(?:\*\*)?методический\s+при[её]м(?:\*\*)?\s*:\s*(.*)$/i },
  { key: "teacherSpeech", re: /^\s*(?:\*\*)?речь\s+учителя(?:\*\*)?\s*:\s*(.*)$/i },
  {
    key: "studentAnswers",
    re: /^\s*(?:\*\*)?предполагаемые\s+ответы\s+учеников(?:\*\*)?\s*:\s*(.*)$/i,
  },
  { key: "students", re: /^\s*(?:\*\*)?ученики(?:\*\*)?\s*:\s*(.*)$/i },
  { key: "expectedResult", re: /^\s*(?:\*\*)?ожидаемый\s+результат(?:\*\*)?\s*:\s*(.*)$/i },
  { key: "comment", re: /^\s*(?:\*\*)?методический\s+комментарий(?:\*\*)?\s*:\s*(.*)$/i },
];

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

function isFieldHeaderLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^#{1,3}\s/.test(trimmed)) return true;
  if (/^время\s*:/i.test(trimmed)) return true;
  if (TASK_LINE_RE.test(trimmed) || MATERIAL_HEADER_RE.test(trimmed)) return true;
  return BLOCK_FIELD_RES.some(({ re }) => re.test(trimmed));
}

export function parseStageBlock(markdown: string): Partial<StageMethodologicalBlock> {
  const lines = markdown.split(/\r?\n/);
  const block: Partial<StageMethodologicalBlock> = {};
  let currentKey: keyof StageMethodologicalBlock | null = null;
  const parts: Partial<Record<keyof StageMethodologicalBlock, string[]>> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let matched = false;
    for (const { key, re } of BLOCK_FIELD_RES) {
      const m = trimmed.match(re);
      if (m) {
        currentKey = key;
        parts[key] = [];
        const inline = m[1]?.trim();
        if (inline) parts[key]!.push(inline);
        matched = true;
        break;
      }
    }

    if (matched) continue;

    if (currentKey) {
      if (isFieldHeaderLine(trimmed) && !trimmed.startsWith("-") && !trimmed.startsWith("•")) {
        const isTask = TASK_LINE_RE.test(trimmed) || MATERIAL_HEADER_RE.test(trimmed);
        if (isTask) {
          currentKey = null;
        } else {
          continue;
        }
      } else if (TASK_LINE_RE.test(trimmed) || MATERIAL_HEADER_RE.test(trimmed)) {
        currentKey = null;
      } else {
        parts[currentKey]!.push(trimmed);
      }
    }
  }

  for (const key of Object.keys(parts) as Array<keyof StageMethodologicalBlock>) {
    block[key] = parts[key]!.join("\n").trim();
  }

  return block;
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

function extractQuotedSpeech(text: string): string | null {
  const matches = [...text.matchAll(/«([^»]+)»/g)].map((m) => m[1].trim());
  if (matches.length === 0) return null;
  return matches.join(" ");
}

function countStudentAnswerBullets(text: string): number {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let count = 0;
  for (const line of lines) {
    if (/^[-•*]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) count += 1;
    else if (line.includes(";") && line.length > 10) count += line.split(";").filter((p) => p.trim().length > 3).length;
    else if (line.length > 8) count += 1;
  }
  return count;
}

function validateMethodologicalBlock(
  block: Partial<StageMethodologicalBlock>,
  stage: StageDefinition,
  issues: StageValidationIssue[],
  context?: StageValidationContext,
): void {
  const isTemplate = context?.isTemplateStage ?? false;

  for (const key of Object.keys(STAGE_BLOCK_LABELS) as Array<keyof typeof STAGE_BLOCK_LABELS>) {
    const label = STAGE_BLOCK_LABELS[key];
    const value = block[key]?.trim();
    if (!value || isPlaceholderText(value)) {
      issues.push({
        code: `missing_${key}`,
        message: `Отсутствует или пустое поле «${label}».`,
      });
    }
  }

  if (block.technique && context?.requiredTechnique && !isTemplate) {
    const expected = normalizeTechniqueName(context.requiredTechnique.name);
    const actual = normalizeTechniqueName(block.technique);
    if (!actual.includes(expected) && !expected.includes(actual.split(/[—–-]/)[0].trim())) {
      issues.push({
        code: "technique_mismatch",
        message: `Методический приём должен быть «${context.requiredTechnique.name}».`,
      });
    }
  }

  if (block.teacherSpeech && !isTemplate) {
    const quoted = extractQuotedSpeech(block.teacherSpeech);
    if (!quoted || quoted.length < MIN_TEACHER_SPEECH_QUOTED_CHARS) {
      issues.push({
        code: "missing_teacher_speech",
        message: `«Речь учителя:» должна содержать готовую речь в кавычках «…» (не менее ${MIN_TEACHER_SPEECH_QUOTED_CHARS} символов).`,
      });
    }

    const speechLower = block.teacherSpeech.toLowerCase();
    const onlyGeneric = GENERIC_TEACHER_PHRASES.some(
      (p) => speechLower.includes(p) && (!quoted || quoted.length < 60),
    );
    if (onlyGeneric) {
      issues.push({
        code: "generic_teacher_speech",
        message:
          "Замени шаблонные формулировки («организует обсуждение», «объясняет тему») на конкретную готовую речь с вопросами и инструкциями.",
      });
    }
  }

  if (STAGES_REQUIRING_STUDENT_ANSWERS.has(stage.id) && block.studentAnswers) {
    const bullets = countStudentAnswerBullets(block.studentAnswers);
    if (bullets < MIN_STUDENT_ANSWER_BULLETS) {
      issues.push({
        code: "missing_student_answers",
        message: `«Предполагаемые ответы учеников:» — минимум ${MIN_STUDENT_ANSWER_BULLETS} варианта (маркированный список).`,
      });
    }
    const hasDifficulty = hasAny(block.studentAnswers, ["затруднен", "ошибк", "не знаю", "сомнен", "типичн"]);
    if (!hasDifficulty) {
      issues.push({
        code: "missing_typical_difficulty",
        message: "В ответах учеников укажи типичное затруднение или ошибку.",
      });
    }
  }

  if (block.expectedResult && block.expectedResult.length < MIN_EXPECTED_RESULT_CHARS) {
    issues.push({
      code: "short_expected_result",
      message: `«Ожидаемый результат:» слишком короткий (минимум ${MIN_EXPECTED_RESULT_CHARS} символов).`,
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

  if (rule.requiredPatterns?.length) {
    if (!hasAny(text, rule.requiredPatterns)) {
      issues.push({
        code: "stage_logic_required",
        message: `Этап «${stage.title}»: нужны маркеры методической логики (${rule.requiredPatterns.slice(0, 3).join(", ")}).`,
      });
    }
  }
}

function validateProblemSituationTask(
  text: string,
  stage: StageDefinition,
  context: StageValidationContext | undefined,
  issues: StageValidationIssue[],
): void {
  if (stage.id !== "problem_situation_goal") return;
  const topic = context?.topic?.trim().toLowerCase();
  if (!topic || topic.length < 3) return;

  const topicMarkers = topic
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .flatMap((w) => [w, w.slice(0, 5)]);

  const tasks = parseStageTasks(text);
  for (const task of tasks) {
    const cond = task.condition.toLowerCase();
    const appliesNewMethod =
      hasAny(cond, ["найд", "вычисл", "примен", "реш", "определ"]) &&
      hasAny(cond, topicMarkers) &&
      !hasAny(cond, ["пробн", "попроб", "известн", "ранее", "раньше", "без нового", "не используя"]);

    if (
      appliesNewMethod &&
      task.answer &&
      !hasAny(task.answer, ["затруднен", "не получ", "разные", "ошибк", "не знаю", "не могу"])
    ) {
      issues.push({
        code: "premature_solution",
        message:
          "Проблемная ситуация: задание не должно требовать ещё не открытого способа решения. Создай затруднение, а не эталонный ответ.",
      });
    }
  }
}

function validateSubjectContent(
  text: string,
  stage: StageDefinition,
  profile: SubjectProfile,
  issues: StageValidationIssue[],
): void {
  const keyStages = [
    "problem_situation_goal",
    "knowledge_activation",
    "primary_acquisition",
    "primary_consolidation",
    "primary_comprehension_check",
  ];
  if (!keyStages.includes(stage.id)) return;

  const materialHits = profile.requiredMaterials.filter((m) => hasAny(text, [m]));
  const taskCount = parseStageTasks(text).length;
  if (materialHits.length < 1 && taskCount < 1) {
    issues.push({
      code: "subject_content_missing",
      message: `Добавь предметное содержание (${profile.requiredMaterials.slice(0, 4).join(", ")}).`,
    });
  }
}

export function validateStageMarkdown(
  markdown: string,
  stage: StageDefinition,
  profile: SubjectProfile,
  context?: StageValidationContext,
): StageValidationResult {
  const text = markdown.trim();
  const issues: StageValidationIssue[] = [];

  if (text.length < 120) {
    issues.push({ code: "too_short", message: "Этап слишком короткий." });
  }

  if (!/время\s*:/i.test(text)) {
    issues.push({ code: "missing_time", message: "Укажи строку «Время: N мин»." });
  }

  const block = parseStageBlock(text);
  validateMethodologicalBlock(block, stage, issues, context);
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
  validateProblemSituationTask(text, stage, context, issues);
  validateSubjectContent(text, stage, profile, issues);

  const prevTasks = context?.previousTaskConditions ?? [];
  const duplicate = findDuplicateTasksInStage(text, prevTasks);
  if (duplicate) {
    issues.push({
      code: "duplicate_task",
      message: `Задание повторяет предыдущий этап по сути: «${duplicate.slice(0, 80)}…». Сформулируй другое задание.`,
    });
  }

  const needsHomework = stage.id === "homework_info";
  if (needsHomework && !hasAny(text, ["домашн", "дз", "задани"])) {
    issues.push({
      code: "missing_homework",
      message: "Укажи конкретные задания домашней работы.",
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
    "Исправь только этот этап. Сохрани формат методического блока:",
    "## {название этапа}",
    "Время: N мин",
    "Цель: …",
    "Методический приём: …",
    "Речь учителя: «конкретная готовая речь с вопросами»",
    "Предполагаемые ответы учеников:",
    "- вариант 1; - вариант 2; - типичное затруднение",
    "Ученики: …",
    "Задание N.M: …",
    "Ответ: …",
    "Ожидаемый результат: …",
    "Методический комментарий: …",
    "Не повторяй задания предыдущих этапов. Запрещены плейсхолдеры: ..., TBD, TODO, null.",
  ].join("\n");
}

export const MAX_STAGE_ATTEMPTS = 3;
