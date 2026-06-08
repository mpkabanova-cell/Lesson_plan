/**
 * Дополнительные правила содержания по stageId (цель этапа FGOS).
 * Дополняет forbidden из fgosStages.json.
 */
export type StageContentRule = {
  /** Подстроки, недопустимые на этом этапе. */
  forbidden: string[];
  /** Подстроки, которые должны присутствовать (методическая логика). */
  requiredPatterns?: string[];
  /** Этап должен содержать нумерованные задания с ответами. */
  requiresTasks?: boolean;
  minTasks?: number;
};

export const STAGE_CONTENT_RULES: Partial<Record<string, StageContentRule>> = {
  problem_situation_goal: {
    forbidden: [
      "рефлексия",
      "домашнее задание",
      "готовый вывод правила",
      "эталонное решение",
      "алгоритм решения",
      "готовое правило",
      "формула для решения",
    ],
    requiredPatterns: ["затруднен", "проблем", "вопрос", "противореч", "не получ", "сомнен"],
    requiresTasks: true,
    minTasks: 1,
  },
  knowledge_activation: {
    forbidden: [
      "рефлексия",
      "объяснение нового материала",
      "итог урока",
      "самооценк",
      "эталонное правило",
      "готовый алгоритм",
    ],
    requiredPatterns: ["пробн", "попроб", "выполн", "затруднен"],
    requiresTasks: true,
    minTasks: 1,
  },
  primary_acquisition: {
    forbidden: ["рефлексия", "фронтальный опрос", "опрос класса", "проектная работа", "групповой проект"],
    requiredPatterns: ["эталон", "правил", "алгоритм", "вывод", "схем", "формул"],
    requiresTasks: true,
    minTasks: 1,
  },
  primary_comprehension_check: {
    forbidden: ["рефлексия", "новая тема", "объяснение темы целиком", "проект"],
    requiresTasks: true,
    minTasks: 1,
  },
  primary_consolidation: {
    forbidden: [
      "опрос класса",
      "фронтальный опрос",
      "опросить класс",
      "устный опрос",
      "проектная работа",
      "групповой проект",
      "исследовательский проект",
      "рефлексия",
      "самооценк",
      "итог урока",
      "подведение итог",
      "новое правило",
      "открытие нового",
      "объяснение темы",
    ],
    requiredPatterns: ["примен", "реши", "выполн", "тренир", "задач", "упражнен"],
    requiresTasks: true,
    minTasks: 1,
  },
  creative_application: {
    forbidden: ["рефлексия", "фронтальный опрос", "итог урока"],
    requiresTasks: true,
    minTasks: 1,
  },
  apply_new_situation: {
    forbidden: ["рефлексия", "фронтальный опрос"],
    requiresTasks: true,
    minTasks: 1,
  },
  generalization_systematization: {
    forbidden: ["рефлексия", "проектная работа", "новая тема"],
    requiresTasks: true,
    minTasks: 1,
  },
  comprehension_control: {
    forbidden: ["рефлексия", "объяснение нового", "проект"],
    requiresTasks: true,
    minTasks: 1,
  },
  homework_check: {
    forbidden: ["рефлексия", "новая тема", "открытие нового"],
    requiresTasks: true,
    minTasks: 1,
  },
  homework_info: {
    forbidden: ["рефлексия", "подумайте дома", "по желанию", "пожелание"],
    requiresTasks: true,
    minTasks: 1,
  },
  goal_setting_motivation: {
    forbidden: ["рефлексия", "домашнее задание", "проверочная работа"],
    requiredPatterns: ["цел", "мотив", "задач урок"],
  },
  reflection: {
    forbidden: [
      "новое объяснение",
      "первичное усвоение",
      "эталонное правило",
      "открытие нового",
      "новая тема",
      "алгоритм решения",
    ],
    requiredPatterns: ["рефлекс", "итог", "самооцен", "понял", "узнал"],
  },
  organizational_moment: {
    forbidden: ["объяснение нового материала", "рефлексия", "домашнее задание"],
  },
};

export function getStageContentRule(stageId: string): StageContentRule | undefined {
  return STAGE_CONTENT_RULES[stageId];
}

export function getStageLogicForPrompt(stageId: string): {
  forbidden: string[];
  requiredPatterns: string[];
} {
  const rule = getStageContentRule(stageId);
  return {
    forbidden: rule?.forbidden ?? [],
    requiredPatterns: rule?.requiredPatterns ?? [],
  };
}
