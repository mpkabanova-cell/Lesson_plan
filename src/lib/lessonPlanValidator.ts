import type { ConstructorFrpContext } from "@/lib/constructor/frpContext";
import {
  getStageDefinition,
  requiredStageIds,
  type LessonTypeId,
} from "@/lib/constructor/stageRegistry";
import {
  getSubjectContentMarkers,
  type SubjectGenerationMode,
} from "@/lib/subjectGenerationMode";

export type ValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warn";
};

export type ValidationMetrics = {
  discussionMarkers: number;
  subjectMarkers: number;
  materialMarkers: number;
  taskCount: number;
};

export type ValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  metrics: ValidationMetrics;
};

export type LessonValidationContext = {
  subject: string;
  grade: string;
  topic: string;
  mode: SubjectGenerationMode;
  selectedStages: string[];
};

export type AssembledLessonValidationContext = LessonValidationContext & {
  lessonType: LessonTypeId;
  selectedStageIds: string[];
  frpContext?: ConstructorFrpContext;
};

export type AssembledValidationResult = ValidationResult & {
  failedStageIds: string[];
};

const DISCUSSION_MARKERS = [
  "обсуд",
  "подумай",
  "сформулируй",
  "ответь",
  "выскаж",
  "поговор",
  "расскаж",
  "предполож",
];

const MATERIAL_MARKERS = [
  "задание / материал",
  "текст:",
  "текст ",
  "источник",
  "таблиц",
  "схем",
  "карт",
  "формул",
  "задач",
  "упражнен",
  "документ",
  "фрагмент",
];

const MIN_TASK_COUNT = 3;
const MIN_SUBJECT_MARKERS = 4;
const MIN_MATERIAL_MARKERS = 2;
const DISCUSSION_RATIO_THRESHOLD = 1.2;

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function countMarkers(text: string, markers: string[]): number {
  const t = normalize(text);
  let count = 0;
  for (const m of markers) {
    let idx = 0;
    while (true) {
      const pos = t.indexOf(m, idx);
      if (pos === -1) break;
      count += 1;
      idx = pos + m.length;
    }
  }
  return count;
}

function extractStageSection(text: string, stageName: string): string {
  const lines = text.split(/\r?\n/);
  const lower = stageName.toLowerCase();
  let capture = false;
  const buf: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading =
      /^#{1,3}\s/.test(trimmed) ||
      /^[А-ЯA-ZЁ][^\n]{8,}$/.test(trimmed) ||
      trimmed.toLowerCase().includes("время:");

    if (capture && isHeading && !trimmed.toLowerCase().includes(lower.slice(0, 12))) {
      break;
    }

    if (!capture && trimmed.toLowerCase().includes(lower.slice(0, Math.min(lower.length, 18)))) {
      capture = true;
    }

    if (capture) buf.push(line);
  }

  return buf.join("\n");
}

function splitScenarioAndKeys(text: string): { body: string; keys: string | null } {
  const patterns = [
    /\*\*ключи к заданиям\*\*/i,
    /^#{1,3}\s*ключи к заданиям\s*$/im,
    /^ключи к заданиям\s*$/im,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match.index >= 0) {
      return {
        body: text.slice(0, match.index),
        keys: text.slice(match.index),
      };
    }
  }
  return { body: text, keys: null };
}

function extractNumberedTaskIds(section: string): Set<string> {
  const ids = new Set<string>();
  const re = /задание\s+(\d+)\.(\d+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section)) !== null) {
    ids.add(`${m[1]}.${m[2]}`);
  }
  return ids;
}

const DEFERRED_MATERIAL_PATTERNS = [
  /котор(?:ый|ую|ое)\s+я\s+(?:вам\s+)?дам/i,
  /дам\s+(?:вам\s+)?(?:эталон|таблиц|текст|схем|материал|карточ)/i,
  /(?:эталон|таблиц[уа]|текст|схем[уа]|материал),?\s+котор(?:ый|ую|ое)\s+я/i,
  /сравните\s+(?:сво[иё]\s+)?ответы?\s+с\s+эталоном,?\s+котор/i,
  /раздам\s+(?:вам\s+)?/i,
  /покажу\s+(?:вам\s+)?(?:эталон|таблиц|текст|схем)/i,
];

function countTasks(text: string): number {
  const t = normalize(text);
  const patterns = [
    /задание\s*\/\s*материал/g,
    /задание\s+\d/g,
    /\bзадание\b/g,
    /\d+[\.)]\s/g,
  ];
  let total = 0;
  for (const p of patterns) {
    const matches = t.match(p);
    if (matches) total += matches.length;
  }
  return total;
}

export function validateLessonPlan(
  rawMarkdown: string,
  ctx: LessonValidationContext,
): ValidationResult {
  const text = rawMarkdown.trim();
  const issues: ValidationIssue[] = [];

  if (text.length < 400) {
    issues.push({
      code: "too_short",
      message: "Сценарий слишком короткий для полноценного урока.",
      severity: "error",
    });
  }

  const trialSection =
    extractStageSection(text, "Актуализация") ||
    extractStageSection(text, "пробное") ||
    text.slice(0, Math.min(text.length, 3000));

  if (
    !/пробн/i.test(trialSection) &&
    !/попроб/i.test(trialSection) &&
    !/выполн/i.test(trialSection)
  ) {
    issues.push({
      code: "trial_action",
      message: "Не найдено пробное действие в ранних этапах урока.",
      severity: "error",
    });
  }

  if (
    !/затруднен/i.test(text) &&
    !/не получа/i.test(text) &&
    !/ошибк/i.test(text) &&
    !/разные ответ/i.test(text) &&
    !/сомнен/i.test(text)
  ) {
    issues.push({
      code: "difficulty",
      message: "Не выявлено затруднение учеников после пробного действия.",
      severity: "error",
    });
  }

  const openingToPractice = [
    extractStageSection(text, "Построение проекта"),
    extractStageSection(text, "Реализация построенного"),
    extractStageSection(text, "Первичное закрепление"),
    text,
  ].join("\n");

  if (
    !/эталон/i.test(openingToPractice) &&
    !/правил/i.test(openingToPractice) &&
    !/алгоритм/i.test(openingToPractice) &&
    !/схем/i.test(openingToPractice) &&
    !/модел/i.test(openingToPractice)
  ) {
    issues.push({
      code: "benchmark",
      message: "Не найден эталон (правило, алгоритм, схема или модель) для открытия/закрепления.",
      severity: "error",
    });
  }

  const subjectMarkers = getSubjectContentMarkers(ctx.mode);
  const subjectMarkerCount = countMarkers(text, subjectMarkers);
  if (subjectMarkerCount < MIN_SUBJECT_MARKERS) {
    issues.push({
      code: "subject_content",
      message: `Недостаточно предметного содержания для режима «${ctx.mode}» (найдено маркеров: ${subjectMarkerCount}, нужно ≥ ${MIN_SUBJECT_MARKERS}).`,
      severity: "error",
    });
  }

  const { body, keys } = splitScenarioAndKeys(text);
  const bodyTaskIds = extractNumberedTaskIds(body);

  if (keys) {
    issues.push({
      code: "answer_keys_at_end",
      message:
        "Ответы вынесены в раздел «Ключи к заданиям» в конце — перенеси «Ответ:» / «Разбор:» сразу под каждое «Задание N.M» в соответствующем этапе и убери отдельный раздел в конце.",
      severity: "error",
    });
    const keyTaskIds = extractNumberedTaskIds(keys);
    const orphanKeys = [...keyTaskIds].filter((id) => !bodyTaskIds.has(id));
    if (orphanKeys.length > 0) {
      issues.push({
        code: "orphan_answer_keys",
        message: `В ключах указаны номера без заданий в сценарии: ${orphanKeys.join(", ")}.`,
        severity: "error",
      });
    }
  }

  const bodyLines = body.split("\n");
  const tasksWithoutAnswer: string[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    const m = bodyLines[i].match(/^\s*(?:\*\*)?задание\s+(\d+\.\d+)/i);
    if (!m) continue;
    const id = m[1];
    let hasAnswer = false;
    for (let j = i + 1; j < Math.min(bodyLines.length, i + 16); j++) {
      const line = bodyLines[j];
      if (/^\s*(?:\*\*)?задание\s+\d+\.\d+/i.test(line) || /^#{1,3}\s/.test(line.trim())) break;
      if (/^\s*(?:\*\*)?(ответ|разбор)(?:\*\*)?:/i.test(line)) {
        hasAnswer = true;
        break;
      }
    }
    if (!hasAnswer) tasksWithoutAnswer.push(id);
  }
  if (tasksWithoutAnswer.length > 0 && tasksWithoutAnswer.length <= 8) {
    issues.push({
      code: "missing_inline_answer",
      message: `Нет ответа сразу под заданием в этапе: ${tasksWithoutAnswer.join(", ")}. Добавь «Ответ:» под каждым заданием.`,
      severity: "error",
    });
  }

  for (const pattern of DEFERRED_MATERIAL_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({
        code: "deferred_material",
        message:
          "В сценарии есть отсылка к материалу или эталону «который дам / раздам / покажу» — текст, эталон или задание должны быть в том же этапе, а не обещаны устно.",
        severity: "error",
      });
      break;
    }
  }

  const taskCount = countTasks(text);
  if (taskCount < MIN_TASK_COUNT) {
    issues.push({
      code: "tasks_count",
      message: `Мало проверяемых заданий (найдено: ${taskCount}, нужно ≥ ${MIN_TASK_COUNT}).`,
      severity: "error",
    });
  }

  const earlyStages = [
    extractStageSection(text, "Мотивация"),
    extractStageSection(text, "Актуализация"),
    extractStageSection(text, "Выявление"),
    extractStageSection(text, "Построение"),
  ].join("\n");

  const materialInEarly = countMarkers(earlyStages, MATERIAL_MARKERS);
  const materialTotal = countMarkers(text, MATERIAL_MARKERS);
  if (materialInEarly < 1 && materialTotal < MIN_MATERIAL_MARKERS) {
    issues.push({
      code: "opening_materials",
      message: "Нет материалов для открытия нового знания (текст, задачи, таблица, схема, источник).",
      severity: "error",
    });
  }

  const discussionCount = countMarkers(text, DISCUSSION_MARKERS);
  const contentScore = subjectMarkerCount + materialTotal + taskCount;
  if (
    discussionCount >= 6 &&
    contentScore > 0 &&
    discussionCount / Math.max(contentScore, 1) > DISCUSSION_RATIO_THRESHOLD
  ) {
    issues.push({
      code: "discussion_heavy",
      message:
        "Урок перегружен обсуждениями («обсудите», «подумайте», «сформулируйте») без достаточного предметного содержания.",
      severity: "error",
    });
  }

  return {
    ok: issues.filter((i) => i.severity === "error").length === 0,
    issues,
    metrics: {
      discussionMarkers: discussionCount,
      subjectMarkers: subjectMarkerCount,
      materialMarkers: materialTotal,
      taskCount,
    },
  };
}

function mapIssueToStageId(
  issue: ValidationIssue,
  lessonType: LessonTypeId,
  selectedStageIds: string[],
): string | null {
  const code = issue.code;
  const map: Record<string, string[]> = {
    trial_action: ["knowledge_activation", "problem_situation_goal"],
    difficulty: ["knowledge_activation", "problem_situation_goal"],
    benchmark: ["primary_acquisition", "primary_consolidation", "primary_comprehension_check"],
    missing_inline_answer: selectedStageIds,
    missing_task: selectedStageIds.filter((id) => {
      const d = getStageDefinition(lessonType, id);
      return d?.requiredOutputs.some((o) => /задание/i.test(o));
    }),
    vague_homework: ["homework_info"],
    missing_homework: ["homework_info"],
  };

  const candidates = map[code];
  if (!candidates?.length) return selectedStageIds[0] ?? null;
  return candidates.find((id) => selectedStageIds.includes(id)) ?? candidates[0];
}

/**
 * Финальная валидация собранного v3-урока с указанием проблемных этапов.
 */
export function validateAssembledLesson(
  rawMarkdown: string,
  ctx: AssembledLessonValidationContext,
): AssembledValidationResult {
  const base = validateLessonPlan(rawMarkdown, ctx);
  const issues = [...base.issues];
  const failedStageIds = new Set<string>();

  const required = requiredStageIds(ctx.lessonType);
  for (const reqId of required) {
    if (!ctx.selectedStageIds.includes(reqId)) {
      issues.push({
        code: "missing_required_stage",
        message: `Отсутствует обязательный FGOS-этап: ${getStageDefinition(ctx.lessonType, reqId)?.title ?? reqId}.`,
        severity: "error",
      });
      failedStageIds.add(reqId);
    }
  }

  if (ctx.frpContext?.available === true && ctx.frpContext.contentKeywords.length > 0) {
    const lower = rawMarkdown.toLowerCase();
    const hits = ctx.frpContext.contentKeywords.filter((k) => lower.includes(k.toLowerCase()));
    if (hits.length < Math.min(2, ctx.frpContext.contentKeywords.length)) {
      issues.push({
        code: "frp_keywords",
        message: "В сценарии мало ключевых понятий из ФРП по теме.",
        severity: "warn",
      });
    }
  }

  if (ctx.lessonType === "new_knowledge") {
    const hasTrial = /пробн|попроб|выполн/i.test(rawMarkdown);
    const hasDifficulty = /затруднен|не получ|ошибк|разные ответ/i.test(rawMarkdown);
    const hasOpening = /эталон|правил|алгоритм|схем|модел/i.test(rawMarkdown);
    if (!hasTrial || !hasDifficulty) {
      const id = ctx.selectedStageIds.find((s) => s === "knowledge_activation") ?? "knowledge_activation";
      failedStageIds.add(id);
    }
    if (!hasOpening) {
      const id =
        ctx.selectedStageIds.find((s) => s === "primary_acquisition") ?? "primary_acquisition";
      failedStageIds.add(id);
    }
  }

  for (const issue of issues.filter((i) => i.severity === "error")) {
    const stageId = mapIssueToStageId(issue, ctx.lessonType, ctx.selectedStageIds);
    if (stageId) failedStageIds.add(stageId);
  }

  const errors = issues.filter((i) => i.severity === "error");
  return {
    ok: errors.length === 0,
    issues,
    metrics: base.metrics,
    failedStageIds: [...failedStageIds],
  };
}

export function buildValidationFixInstructions(
  issues: ValidationIssue[],
  opts?: { frpHint?: string },
): string {
  const errors = issues.filter((i) => i.severity === "error");
  if (!errors.length) return "";

  const lines = [
    "ПРЕДЫДУЩИЙ СЦЕНАРИЙ НЕ ПРОШЁЛ АВТОПРОВЕРКУ:",
    ...errors.map((e) => `● ${e.message}`),
    "",
    "Исправь сценарий: добавь недостающие элементы, усиль предметное содержание, сократи пустые обсуждения.",
    "Если ошибка про ключи — перенеси «Ответ:» / «Разбор:» под задание в том же этапе; не выноси ответы в конец плана.",
    "Если ошибка про «дам эталон» — напечатай эталон/материал в том же этапе, где на него ссылаются.",
    "Сохрани этапы, тайминг и формат Markdown.",
  ];
  if (opts?.frpHint?.trim()) {
    lines.push("", `Подсказка по ФРП: ${opts.frpHint.trim()}`);
  }
  return lines.join("\n");
}

export const MAX_VALIDATION_ATTEMPTS = 2;
