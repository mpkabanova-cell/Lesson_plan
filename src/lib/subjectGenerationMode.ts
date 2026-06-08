export type SubjectGenerationMode =
  | "humanities"
  | "languages"
  | "natural_sciences"
  | "mathematics"
  | "primary";

const PRIMARY_SUBJECTS = new Set(["Окружающий мир", "Литературное чтение"]);
const HUMANITIES_SUBJECTS = new Set(["История", "Обществознание", "Литература"]);
const LANGUAGES_SUBJECTS = new Set(["Русский язык", "Иностранный язык"]);
const NATURAL_SCIENCES_SUBJECTS = new Set(["Биология", "Физика", "Химия", "География"]);
const MATHEMATICS_SUBJECTS = new Set(["Алгебра", "Геометрия", "Информатика"]);

const MODE_LABELS: Record<SubjectGenerationMode, string> = {
  humanities: "гуманитарный",
  languages: "языковой",
  natural_sciences: "естественно-научный",
  mathematics: "математический",
  primary: "начальная школа",
};

function parseGrade(grade: string): number | null {
  const n = Number.parseInt(grade.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Определяет группу предмета для динамических инструкций генерации.
 */
export function resolveSubjectGenerationMode(subject: string, grade: string): SubjectGenerationMode {
  const s = subject.trim();
  const g = parseGrade(grade);

  if (PRIMARY_SUBJECTS.has(s)) return "primary";
  if (s === "Математика" && g !== null && g >= 1 && g <= 4) return "primary";

  if (HUMANITIES_SUBJECTS.has(s)) return "humanities";
  if (LANGUAGES_SUBJECTS.has(s)) return "languages";
  if (NATURAL_SCIENCES_SUBJECTS.has(s)) return "natural_sciences";
  if (MATHEMATICS_SUBJECTS.has(s)) return "mathematics";
  if (s === "Математика") return "mathematics";

  return "humanities";
}

export function getSubjectModeLabel(mode: SubjectGenerationMode): string {
  return MODE_LABELS[mode];
}

/**
 * Предметные маркеры для валидатора (подстроки в нижнем регистре).
 */
export function getSubjectContentMarkers(mode: SubjectGenerationMode): string[] {
  const common = ["текст", "задани", "пример", "таблиц", "схем"];
  switch (mode) {
    case "humanities":
      return [
        ...common,
        "причин",
        "следств",
        "факт",
        "личност",
        "источник",
        "дат",
        "событи",
        "хронолог",
        "карт",
        "документ",
      ];
    case "languages":
      return [
        ...common,
        "правил",
        "орфограф",
        "пунктуац",
        "предложен",
        "слов",
        "текст",
        "контрпример",
        "упражнен",
        "фраз",
      ];
    case "natural_sciences":
      return [
        ...common,
        "эксперимент",
        "наблюден",
        "измерен",
        "формул",
        "опыт",
        "явлен",
        "процесс",
        "данн",
        "расчёт",
        "расчет",
      ];
    case "mathematics":
      return [
        ...common,
        "задач",
        "уравнен",
        "формул",
        "алгоритм",
        "решени",
        "вычислен",
        "контрпример",
        "способ",
        "числ",
      ];
    case "primary":
      return [
        ...common,
        "наблюден",
        "картин",
        "рисунк",
        "факт",
        "природ",
        "животн",
        "растен",
        "числ",
        "счёт",
        "счет",
      ];
  }
}

/**
 * Краткие требования для планировщика v2.
 */
export function getSubjectModePlannerHints(mode: SubjectGenerationMode, subject: string): string {
  const base = `Предмет: ${subject}. Режим: ${getSubjectModeLabel(mode)}.`;
  switch (mode) {
    case "humanities":
      return `${base} В keyActivity и subjectMaterials заложи факты, причины/следствия, источники, личности или карту/хронологию — не только обсуждение.`;
    case "languages":
      return `${base} В keyActivity и subjectMaterials заложи языковой материал, тексты, примеры и контрпримеры с проверяемыми упражнениями.`;
    case "natural_sciences":
      return `${base} В keyActivity и subjectMaterials заложи наблюдение/эксперимент, данные, измерения, схему или расчёт.`;
    case "mathematics":
      return `${base} В keyActivity и subjectMaterials заложи задачи, примеры, контрпримеры и применение нового способа с эталоном решения.`;
    case "primary":
      return `${base} В keyActivity и subjectMaterials заложи конкретные факты, короткий текст, наглядность и простые проверяемые задания.`;
  }
}

/**
 * Развёрнутый блок инструкций для системного промпта.
 */
export function getSubjectModeInstructions(
  mode: SubjectGenerationMode,
  subject: string,
  grade: string,
  topic: string,
): string {
  const header = `Предмет: **${subject}**, класс **${grade}**, тема: **${topic || "не указана"}**.`;
  const antiGeneric =
    "Урок не должен быть универсальным «обсуждательным» сценарием: каждый этап наполняй предметным содержанием, характерным для этого учебного предмета.";

  switch (mode) {
    case "humanities":
      return [
        header,
        antiGeneric,
        "Обязательно включи в сценарий:",
        "● конкретные исторические/обществоведческие/литературные **факты** по теме;",
        "● **причины и последствия** (где уместно по теме);",
        "● **личности**, **источники** или **документ** для работы;",
        "● **карту**, **хронологию** или таблицу дат/событий — если тема это допускает;",
        "● проверяемые задания: по источнику, по факту, по причинно-следственной связи.",
        "Не заменяй содержание урока серией устных «обсудите / подумайте» без материала для анализа.",
      ].join("\n");

    case "languages":
      return [
        header,
        antiGeneric,
        "Обязательно включи в сценарий:",
        "● **языковой материал** (правило, орфограмма, лексика, конструкция — по теме);",
        "● **текст** или фрагмент для разбора/заполнения;",
        "● серию **примеров** и **контрпримеров**;",
        "● проверяемые упражнения: вставить, исправить, объяснить выбор, составить фразу.",
        "Каждое задание должно тренировать конкретный языковой материал, а не общие рассуждения.",
      ].join("\n");

    case "natural_sciences":
      return [
        header,
        antiGeneric,
        "Обязательно включи в сценарий:",
        "● **наблюдение**, **эксперимент** или описание опыта (даже мысленного/демонстрационного);",
        "● **данные**, **измерения**, таблицу или схему;",
        "● **формулу** или закономерность — если тема это требует;",
        "● расчёты или интерпретацию результатов — где уместно;",
        "● задания на объяснение явления, процесса, ошибки в схеме или расчёте.",
      ].join("\n");

    case "mathematics":
      return [
        header,
        antiGeneric,
        "Обязательно включи в сценарий:",
        "● несколько **задач** или **примеров** с нарастанием сложности;",
        "● **контрпримеры** или типичные ошибки;",
        "● **эталон** нового способа/алгоритма/правила;",
        "● применение нового способа в **новой ситуации**;",
        "● самостоятельную задачу с проверкой по эталону.",
        "Не ограничивайся организационными действиями и устными обсуждениями без вычислений и записей.",
      ].join("\n");

    case "primary":
      return [
        header,
        antiGeneric,
        "Обязательно включи в сценарий:",
        "● конкретные **факты**, **наблюдения** или **картинки**;",
        "● короткий **текст** для чтения/анализа (по возрасту);",
        "● наглядные материалы и простые **проверяемые задания**;",
        "● задания на классификацию, сравнение, заполнение, рисование схемы — по теме.",
        "Формулировки и объём материала должны соответствовать начальной школе.",
      ].join("\n");
  }
}

export function buildSubjectModePromptBlock(
  subject: string,
  grade: string,
  topic: string,
): { mode: SubjectGenerationMode; block: string } {
  const mode = resolveSubjectGenerationMode(subject, grade);
  const instructions = getSubjectModeInstructions(mode, subject, grade, topic);
  const block = `ПРЕДМЕТНЫЙ РЕЖИМ ГЕНЕРАЦИИ (${getSubjectModeLabel(mode)})

${instructions}`;
  return { mode, block };
}
