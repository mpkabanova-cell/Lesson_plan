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
- Не начинай каждый этап с «Сегодня мы начнём/будем изучать…». Такое объявление темы допустимо только один раз — в организационно-мотивационном блоке
- На этапе целеполагания НЕ давай готовый способ решения новой темы: сформулируй цель и план изучения
- На этапе закрепления НЕ вводи новый материал
- На рефлексии НЕ изучай новое
- На физкультминутке НЕ проверяй знания и НЕ вводи учебный материал: это 1–2 минуты тематической двигательной паузы
- На этапе «Открытие нового знания» для объёмной темы сделай 2–4 смысловых мини-блока внутри одного этапа
- Предметное содержание обязательно: задачи, факты, тексты, алгоритмы — по subjectProfile
- Каждый этап должен быть как часть технологической карты: конкретная деятельность учителя, конкретная деятельность учащихся, учебный материал и ожидаемый продукт
- Если предмет гуманитарный или исторический: используй карту, источник, текст учебника, схему, имена, даты, понятия или факты, а не общие рассуждения
- Если в уроке есть проблемный вопрос, связывай с ним этап: в начале фиксируй гипотезу, в середине собирай доказательства, в конце возвращайся к ответу
- Для домашнего задания и контроля по возможности давай базовый и повышенный уровень
- Запрещены плейсхолдеры: ..., TBD, TODO, null
- Пиши по-русски, конкретно
- Не добавляй другие этапы урока`;

function buildTemplateStage(input: StageGenerationInput): string {
  const { stage, minutes, topic, subject, grade, requiredTechnique } = input;
  const n = input.stageIndex + 1;
  const stageGoal = stage.goal;

  if (stage.id === "organizational_moment") {
    const hook = buildMotivationHook({
      subject,
      topic,
      techniqueName: requiredTechnique.name,
    });
    const openingSpeech = motivationalStageOpeningSpeech({
      lessonType: input.lessonType,
      topic,
      subject,
      grade,
      hook,
    });
    const studentAnswers =
      input.lessonType === "new_knowledge"
        ? [
            "- «Готовы к уроку»",
            "- «Можно предположить, что тема связана с новым вопросом»",
            "- Типичное затруднение: пока не хватает фактов или способа, чтобы ответить на вопрос урока",
          ]
        : [
            "- «Готовы к уроку»",
            "- «Нужно достать тетрадь»",
            "- Типичное затруднение: шум, задержка с подготовкой места",
          ];
    const studentActions =
      input.lessonType === "new_knowledge"
        ? "Приветствуют учителя, проверяют рабочее место, записывают тему и вопрос урока, высказывают 1–2 первичные версии."
        : "Приветствуют учителя, проверяют рабочее место, достают учебные материалы, настраиваются на урок.";
    const expectedResult =
      input.lessonType === "new_knowledge"
        ? "Класс готов к работе; зафиксированы тема, вопрос урока и первичные предположения учащихся."
        : "Класс готов к работе, внимание сосредоточено на теме урока.";
    return `## ${stage.title}
Время: ${minutes} мин
${STAGE_BLOCK_LABELS.goal} ${stageGoal}
${STAGE_BLOCK_LABELS.technique} ${requiredTechnique.name}
${STAGE_BLOCK_LABELS.teacherSpeech} ${openingSpeech}
${STAGE_BLOCK_LABELS.studentAnswers}
${studentAnswers.join("\n")}
${STAGE_BLOCK_LABELS.students} ${studentActions}
${STAGE_BLOCK_LABELS.expectedResult} ${expectedResult}
${STAGE_BLOCK_LABELS.comment} ${requiredTechnique.description} Организационно-мотивационный блок — кратко: готовность, настрой, вопрос урока; без объяснения нового материала.`;
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

function buildMotivationHook(input: {
  subject: string;
  topic: string;
  techniqueName: string;
}): string {
  const subject = input.subject.toLowerCase();
  const topic = input.topic;
  const topicLower = topic.toLowerCase();
  const technique = input.techniqueName.toLowerCase();

  const baseQuestion = (() => {
    if (subject.includes("геометр") && /признак.*равенств.*треугольник|равенств.*треугольник/.test(topicLower)) {
      return "На рисунке два треугольника выглядят одинаковыми, но измерить все стороны и углы нельзя. Как доказать, что они равны, если известных данных меньше?";
    }
    if (subject.includes("геометр") && /пифагор/.test(topicLower)) {
      return "Представьте лестницу у стены: высоту и расстояние от стены знаем, а длину лестницы измерить нельзя. Как найти её без прямого измерения?";
    }
    if (subject.includes("истор") && /древн.*инд/.test(topicLower)) {
      return "В Древней Индии люди верили, что место человека в обществе определено с рождения. Справедливо ли это и мог ли человек изменить свою судьбу?";
    }
    if (subject.includes("истор") && /древн.*грец|эллинизм/.test(topicLower)) {
      return "Как небольшие греческие полисы смогли оставить след, который мы видим в культуре, науке и политике до сих пор?";
    }
    if (subject.includes("истор")) {
      return `Как один факт или событие по теме «${topic}» могло изменить жизнь людей своего времени?`;
    }
    if (subject.includes("алгебр") || subject.includes("математ")) {
      return `Посмотрите на задачу по теме «${topic}»: какой привычный способ здесь уже не помогает и какой новый ход нужно найти?`;
    }
    return `Посмотрите на пример по теме «${topic}»: что в нём вызывает вопрос или противоречие?`;
  })();

  if (technique.includes("удивляй")) {
    return `Начнём с неожиданного вопроса: ${baseQuestion}`;
  }
  if (technique.includes("отсроч")) {
    return `${baseQuestion} Ответ пока не называем: вернёмся к нему после открытия нового знания.`;
  }
  if (technique.includes("корзин")) {
    return `${baseQuestion} Назовите 2–3 первые версии, я запишу их в «корзину идей».`;
  }
  if (technique.includes("проблем")) {
    return `Проблемный вопрос урока: ${baseQuestion}`;
  }
  return baseQuestion;
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
  const stageSpecificGuidance = (() => {
    if (input.stage.id === "primary_acquisition") {
      return [
        "Назови внутри этапа 2–4 смысловых блока, если тема объёмная.",
        "Каждый блок должен иметь конкретный материал и учебный продукт: схема, таблица, вывод, запись в тетради или рабочий лист.",
        "Для истории используй карту, текст учебника, источник, имена, понятия, даты и причинно-следственные связи.",
      ];
    }
    if (input.stage.id === "problem_situation_goal") {
      return [
        "Это этап целеполагания: подведи учеников к цели и краткому плану урока.",
        "Не объясняй новое содержание, не давай готовый алгоритм или правило.",
        "Можно опереться на вопрос, заданный на организационно-мотивационном этапе.",
      ];
    }
    if (input.stage.id === "knowledge_activation") {
      return [
        "Актуализируй опорные знания через блиц-опрос, карту, схему, текст или короткое задание.",
        "Не называй это продолжением темы; тема урока остаётся новой.",
        "Не требуй обязательного учебного затруднения, если достаточно связать опорный материал с новой темой.",
      ];
    }
    if (input.stage.id === "physical_break") {
      return [
        "Сделай короткую тематическую двигательную паузу на 1–2 минуты.",
        "В задании опиши только движения учащихся; ответ может фиксировать, что упражнения выполнены.",
        "Не добавляй проверку знаний, объяснение, вопросы по содержанию или контроль.",
      ];
    }
    if (input.stage.id === "homework_info") {
      return [
        "Дай базовый и повышенный вариант домашнего задания, если это уместно.",
        "Укажи, что именно записывают ученики и как будет оцениваться работа.",
      ];
    }
    return undefined;
  })();

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
      qualityPatterns: {
        documentFormat: "технологическая карта урока",
        mustHaveConcreteMaterials: true,
        crossCuttingQuestion:
          input.lessonType === "new_knowledge"
            ? "Желателен проблемный вопрос, к которому можно вернуться на рефлексии."
            : "Связывай задания с целью и ожидаемым результатом урока.",
        strongContentExamples: [
          "карта / схема / таблица / источник / текст учебника",
          "конкретные понятия, факты, имена, алгоритмы или задачи",
          "учебный продукт: запись в тетради, схема, вывод, ответ, заполненный рабочий лист",
        ],
        avoid: [
          "общие фразы без предметного материала",
          "фронтальный опрос как единственная активность",
          "одинаковые действия учеников на всех этапах",
        ],
      },
      stageSpecificGuidance,
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
