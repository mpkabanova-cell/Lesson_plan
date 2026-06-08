import type { LessonTypeId, StageDefinition } from "./stageRegistry";
import type { ConstructorFrpContext } from "./frpContext";
import { getStageFrpSlice } from "./frpContext";
import type { SubjectProfile } from "./subjectProfiles";
import { getStageSubjectHint } from "./subjectProfiles";

export type StageGenerationInput = {
  stage: StageDefinition;
  stageIndex: number;
  totalStages: number;
  lessonType: LessonTypeId;
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  minutes: number;
  homework?: string;
  frpContext: ConstructorFrpContext;
  subjectProfile: SubjectProfile;
  previousSummaries: Record<string, string>;
  fixInstructions?: string;
};

const STAGE_SYSTEM_PROMPT = `Ты — методист, пишешь ОДИН этап урока по ФГОС в формате Markdown-карточки.
Правила:
- Заголовок этапа: ## {название этапа}
- Обязательные поля: Время: N мин; Учитель: ...; Ученики: ...; при необходимости Задание / материал:
- Нумерация заданий: Задание {номер_этапа}.{подномер} (номер этапа = порядковый в сценарии)
- Под каждым «Задание N.M» сразу строка «Ответ:» или «Разбор:»
- Не выноси ответы в конец; не обещай материал «который дам» — печатай в этапе
- Пиши по-русски, конкретно, с предметным содержанием
- Не добавляй другие этапы урока`;

function buildTemplateStage(input: StageGenerationInput): string {
  const { stage, minutes, topic, goal, subject, grade } = input;
  const n = input.stageIndex + 1;

  if (stage.id === "organizational_moment") {
    return `## ${stage.title}
Время: ${minutes} мин
Учитель: Приветствует класс, проверяет готовность (учебники, тетради, инвентарь). Настраивает на урок по теме «${topic}» (${subject}, ${grade} класс).
Ученики: Приветствуют учителя, готовят рабочее место, настраиваются на работу.`;
  }

  if (stage.id === "reflection") {
    return `## ${stage.title}
Время: ${minutes} мин
Учитель: Подводит итог: соответствие цели «${goal || topic}» и результата. Организует рефлексию (лист самооценки / «светофор» / 2 вопроса).
Ученики: Фиксируют, что узнали нового; отмечают затруднения; выставляют самооценку за урок.
Задание ${n}.1: Заполнить строку в листе достижений: «Сегодня я научился…», «Мне было трудно…»
Ответ: Критерий — конкретная формулировка нового знания и одно затруднение.`;
  }

  return `## ${stage.title}
Время: ${minutes} мин
Учитель: (шаблон)
Ученики: (шаблон)`;
}

function buildStageUserPrompt(input: StageGenerationInput): string {
  const frpSlice =
    input.frpContext.available === true
      ? getStageFrpSlice(input.frpContext, input.stage.id)
      : {};

  const prev = Object.entries(input.previousSummaries)
    .slice(-3)
    .map(([id, s]) => `${id}: ${s.slice(0, 300)}`)
    .join("\n");

  const subjectHint = getStageSubjectHint(input.subjectProfile, input.stage.id);

  return JSON.stringify(
    {
      lessonType: input.lessonType,
      stage: {
        id: input.stage.id,
        title: input.stage.title,
        goal: input.stage.goal,
        tasks: input.stage.tasks,
        forbidden: input.stage.forbidden,
        requiredOutputs: input.stage.requiredOutputs,
      },
      lesson: {
        subject: input.subject,
        grade: input.grade,
        topic: input.topic,
        goal: input.goal,
        homework: input.homework,
        stageIndex: input.stageIndex + 1,
        totalStages: input.totalStages,
        minutes: input.minutes,
      },
      frp: frpSlice,
      subjectProfile: {
        mode: input.subjectProfile.mode,
        requiredMaterials: input.subjectProfile.requiredMaterials,
        stageHint: subjectHint || undefined,
      },
      previousStages: prev || undefined,
      fixInstructions: input.fixInstructions || undefined,
    },
    null,
    2,
  );
}

export function buildStageMessages(input: StageGenerationInput): Array<{ role: string; content: string }> {
  return [
    { role: "system", content: STAGE_SYSTEM_PROMPT },
    { role: "user", content: buildStageUserPrompt(input) },
  ];
}

export function generateTemplateStage(input: StageGenerationInput): {
  markdown: string;
  summary: string;
} {
  const markdown = buildTemplateStage(input);
  const summary = `${input.stage.title}: ${input.minutes} мин. ${input.stage.goal.slice(0, 120)}`;
  return { markdown, summary };
}

export function isTemplateStage(stage: StageDefinition): boolean {
  return Boolean(stage.templateOnly);
}

export function extractStageSummary(markdown: string, stageTitle: string): string {
  const plain = markdown
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const snippet = plain.slice(0, 350);
  return `${stageTitle}: ${snippet}`;
}
