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
    "Сохрани этапы, тайминг и формат Markdown.",
  ];
  if (opts?.frpHint?.trim()) {
    lines.push("", `Подсказка по ФРП: ${opts.frpHint.trim()}`);
  }
  return lines.join("\n");
}

export const MAX_VALIDATION_ATTEMPTS = 2;
