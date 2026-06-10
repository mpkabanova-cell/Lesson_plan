import type { LessonTypeId, StageDefinition } from "./stageRegistry";
import type { ConstructorFrpContext } from "./frpContext";
import { getStageFrpSlice } from "./frpContext";
import type { SubjectProfile } from "./subjectProfiles";
import { getStageSubjectHint } from "./subjectProfiles";
import { STAGE_BLOCK_LABELS } from "./stageBlockSchema";
import { getLessonTypePromptRules, motivationalStageOpeningSpeech } from "./lessonTypeContentRules";
import { getStageLogicForPrompt } from "./stageContentRules";
import type { StageTechnique } from "./stageTechniques";

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
  requiredTechnique: StageTechnique;
  previousTechniques: string[];
  previousTaskConditions: string[];
  fixInstructions?: string;
};

const STAGE_SYSTEM_PROMPT = `Ты — опытный методист. Пишешь ОДИН этап урока по ФГОС как полноценный методический сценарный блок в Markdown.

ОБЯЗАТЕЛЬНАЯ СТРУКТУРА (все поля обязательны):
## {название этапа}
Время: N мин
${STAGE_BLOCK_LABELS.goal} {цель этапа — 1–2 предложения}
${STAGE_BLOCK_LABELS.technique} {название приёма из requiredTechnique}
${STAGE_BLOCK_LABELS.teacherSpeech} «Готовая речь учителя: 2–6 предложений с конкретными вопросами, формулировками, инструкциями. Обязательно в кавычках «…».»
${STAGE_BLOCK_LABELS.studentAnswers}
- {вариант ответа 1}
- {вариант ответа 2}
- {типичное затруднение или ошибка}
${STAGE_BLOCK_LABELS.students} {конкретные действия: читают, записывают, обсуждают, сравнивают…}
Задание {номер_этапа}.{подномер}: {условие с предметным содержанием}
Ответ: {ожидаемый ответ}
${STAGE_BLOCK_LABELS.expectedResult} {к чему приходят ученики}
${STAGE_BLOCK_LABELS.comment} {на что обратить внимание учителю}

ПЛОХО (речь учителя):
Учитель организует обсуждение.

ХОРОШО (речь учителя):
${STAGE_BLOCK_LABELS.teacherSpeech} «Посмотрите на рисунок. Мы можем измерить стороны треугольника, но как узнать длину диагонали, если измерить её напрямую нельзя? Запишите в тетради, что вы уже знаете об этом треугольнике.»

ПРАВИЛА:
- Нумерация заданий: Задание {номер_этапа}.{подномер} (номер этапа = stageIndex из данных)
- Каждое задание: условие + строка «Ответ:» сразу под ним
- Не повторяй задания из previousTasks — другое содержание, другой угол
- Соблюдай stageLogic: forbidden запрещено, requiredPatterns желательно отразить
- На этапе проблемной ситуации НЕ давай готовый способ решения новой темы
- На этапе закрепления НЕ вводи новый материал
- На рефлексии НЕ изучай новое
- Предметное содержание обязательно: задачи, факты, тексты, алгоритмы — по subjectProfile
- Запрещены плейсхолдеры: ..., TBD, TODO, null
- Пиши по-русски, конкретно
- Не добавляй другие этапы урока`;

function buildTemplateStage(input: StageGenerationInput): string {
  const { stage, minutes, topic, subject, grade, requiredTechnique } = input;
  const n = input.stageIndex + 1;
  const stageGoal = stage.goal;

  if (stage.id === "organizational_moment") {
    const openingSpeech = motivationalStageOpeningSpeech({
      lessonType: input.lessonType,
      topic,
      subject,
      grade,
    });
    return `## ${stage.title}
Время: ${minutes} мин
${STAGE_BLOCK_LABELS.goal} ${stageGoal}
${STAGE_BLOCK_LABELS.technique} ${requiredTechnique.name}
${STAGE_BLOCK_LABELS.teacherSpeech} ${openingSpeech}
${STAGE_BLOCK_LABELS.studentAnswers}
- «Готовы к уроку»
- «Нужно достать тетрадь»
- Типичное затруднение: шум, задержка с подготовкой места
${STAGE_BLOCK_LABELS.students} Приветствуют учителя, проверяют рабочее место, достают учебные материалы, настраиваются на урок.
${STAGE_BLOCK_LABELS.expectedResult} Класс готов к работе, внимание сосредоточено на теме урока.
${STAGE_BLOCK_LABELS.comment} ${requiredTechnique.description} Мотивационный этап — кратко, без объяснения нового материала.`;
  }

  return `## ${stage.title}
Время: ${minutes} мин
${STAGE_BLOCK_LABELS.goal} ${stageGoal}
${STAGE_BLOCK_LABELS.technique} ${requiredTechnique.name}
${STAGE_BLOCK_LABELS.teacherSpeech} «(шаблон)»
${STAGE_BLOCK_LABELS.studentAnswers}
- вариант 1
- вариант 2
- типичное затруднение
${STAGE_BLOCK_LABELS.students} (шаблон)
Задание ${n}.1: (шаблон)
Ответ: (шаблон)
${STAGE_BLOCK_LABELS.expectedResult} (шаблон)
${STAGE_BLOCK_LABELS.comment} (шаблон)`;
}

function buildStageUserPrompt(input: StageGenerationInput): string {
  const frpSlice =
    input.frpContext.available === true
      ? getStageFrpSlice(input.frpContext, input.stage.id)
      : {};

  const prev = Object.entries(input.previousSummaries)
    .slice(-3)
    .map(([id, s]) => `${id}: ${s.slice(0, 400)}`)
    .join("\n");

  const subjectHint = getStageSubjectHint(input.subjectProfile, input.stage.id);
  const stageLogic = getStageLogicForPrompt(input.stage.id);

  return JSON.stringify(
    {
      lessonType: input.lessonType,
      stage: {
        id: input.stage.id,
        title: input.stage.title,
        goal: input.stage.goal,
        tasks: input.stage.tasks,
        successIndicators: input.stage.successIndicators,
        allowedTeacher: input.stage.allowedTeacher,
        allowedStudent: input.stage.allowedStudent,
        forbidden: input.stage.forbidden,
        requiredOutputs: input.stage.requiredOutputs,
      },
      requiredTechnique: {
        name: input.requiredTechnique.name,
        description: input.requiredTechnique.description,
      },
      stageLogic,
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
      previousTechniques: input.previousTechniques.length ? input.previousTechniques : undefined,
      previousTasks: input.previousTaskConditions.length ? input.previousTaskConditions : undefined,
      fixInstructions: input.fixInstructions || undefined,
    },
    null,
    2,
  );
}

export function buildStageMessages(input: StageGenerationInput): Array<{ role: string; content: string }> {
  const lessonTypeRules = getLessonTypePromptRules(input.lessonType);
  const systemContent = lessonTypeRules
    ? `${STAGE_SYSTEM_PROMPT}\n\n${lessonTypeRules}`
    : STAGE_SYSTEM_PROMPT;
  return [
    { role: "system", content: systemContent },
    { role: "user", content: buildStageUserPrompt(input) },
  ];
}

export function generateTemplateStage(input: StageGenerationInput): {
  markdown: string;
  summary: string;
} {
  const markdown = buildTemplateStage(input);
  const technique = input.requiredTechnique.name;
  const summary = `${input.stage.title}: ${input.minutes} мин, приём «${technique}». ${input.stage.goal.slice(0, 100)}`;
  return { markdown, summary };
}

export function isTemplateStage(stage: StageDefinition): boolean {
  return Boolean(stage.templateOnly);
}

export function extractStageSummary(markdown: string, stageTitle: string): string {
  const block = markdown.match(/^\s*(?:\*\*)?методический\s+при[её]м(?:\*\*)?\s*:\s*(.+)$/im);
  const technique = block ? block[1].trim() : "";
  const tasks = markdown.match(/^\s*(?:\*\*)?задание\s+\d+\.\d+/gim);
  const taskHint = tasks?.length ? ` Заданий: ${tasks.length}.` : "";

  const plain = markdown
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const snippet = plain.slice(0, 280);
  const techPart = technique ? `Приём: ${technique}.` : "";
  return `${stageTitle}: ${techPart}${taskHint} ${snippet}`;
}
