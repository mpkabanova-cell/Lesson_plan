import type { SubjectGenerationMode } from "@/lib/subjectGenerationMode";
import { resolveSubjectGenerationMode } from "@/lib/subjectGenerationMode";

export type SubjectProfile = {
  subject: string;
  mode: SubjectGenerationMode;
  requiredMaterials: string[];
  forbiddenPatterns: string[];
  stageHints: Partial<Record<string, string>>;
};

const BASE_PROFILES: Record<string, Omit<SubjectProfile, "subject" | "mode">> = {
  История: {
    requiredMaterials: ["источник", "даты", "хронология", "карта", "документ"],
    forbiddenPatterns: ["обсудите без материала", "подумайте о прошлом"],
    stageHints: {
      knowledge_activation:
        "Используй короткий источник или фрагмент документа; зафиксируй затруднение по интерпретации.",
      primary_acquisition:
        "Дай эталон вывода по источнику: причина-следствие, периодизация, ключевые даты.",
      primary_consolidation: "Задание на сопоставление источников или хронологическую линию.",
    },
  },
  Математика: {
    requiredMaterials: ["задача", "формула", "эталон решения", "числовой пример"],
    forbiddenPatterns: ["решите устно без записи", "обсудите правило"],
    stageHints: {
      knowledge_activation: "Пробное задание с числовым ответом; зафиксируй типичную ошибку.",
      primary_acquisition: "Правило/алгоритм + разобранный пример с формулой.",
      primary_consolidation: "2–3 задачи разной сложности с эталоном.",
    },
  },
  Алгебра: {
    requiredMaterials: ["уравнение", "формула", "график", "эталон"],
    forbiddenPatterns: ["обсудите свойства"],
    stageHints: {
      primary_acquisition: "Алгоритм решения + пример с пошаговым эталоном.",
    },
  },
  Геометрия: {
    requiredMaterials: ["чертеж", "теорема", "доказательство", "задача"],
    forbiddenPatterns: ["нарисуйте без условия"],
    stageHints: {
      primary_acquisition: "Формулировка теоремы + чертёж с обозначениями.",
    },
  },
  "Русский язык": {
    requiredMaterials: ["правило", "примеры слов", "упражнение", "текст для анализа"],
    forbiddenPatterns: ["обсудите красоту языка"],
    stageHints: {
      knowledge_activation: "Пробное упражнение на орфографию/морфологию с типичной ошибкой.",
      primary_acquisition: "Правило + 3–4 примера + контрпример.",
    },
  },
  Информатика: {
    requiredMaterials: ["алгоритм", "код или псевдокод", "таблица", "задача"],
    forbiddenPatterns: ["обсудите IT", "подумайте о компьютерах"],
    stageHints: {
      knowledge_activation: "Пробная задача на алгоритм/ветвление/цикл.",
      primary_acquisition: "Блок-схема или псевдокод + эталон выполнения.",
    },
  },
  Обществознание: {
    requiredMaterials: ["понятие", "ситуация", "аргумент", "таблица"],
    forbiddenPatterns: ["обсудите общество"],
    stageHints: {
      primary_acquisition: "Определение понятия + пример из жизни + критерий.",
    },
  },
  География: {
    requiredMaterials: ["карта", "климатограмма", "таблица", "факт"],
    forbiddenPatterns: ["обсудите природу"],
    stageHints: {
      primary_acquisition: "Работа с картой/климатограммой + вывод.",
    },
  },
  Биология: {
    requiredMaterials: ["схема", "определение", "наблюдение", "задание"],
    forbiddenPatterns: ["обсудите живое"],
    stageHints: {
      primary_acquisition: "Схема процесса + термины + эталон объяснения.",
    },
  },
  Физика: {
    requiredMaterials: ["формула", "опыт", "задача", "схема"],
    forbiddenPatterns: ["обсудите физику"],
    stageHints: {
      primary_acquisition: "Закон/формула + разбор задачи с единицами измерения.",
    },
  },
  Химия: {
    requiredMaterials: ["уравнение реакции", "схема", "задача", "таблица"],
    forbiddenPatterns: ["обсудите вещества"],
    stageHints: {
      primary_acquisition: "Уравнение реакции + условия + пример расчёта.",
    },
  },
};

const MODE_FALLBACK: Record<SubjectGenerationMode, Omit<SubjectProfile, "subject" | "mode">> = {
  humanities: {
    requiredMaterials: ["текст", "источник", "задание", "таблица"],
    forbiddenPatterns: ["обсудите без материала"],
    stageHints: {},
  },
  languages: {
    requiredMaterials: ["правило", "примеры", "упражнение", "текст"],
    forbiddenPatterns: ["обсудите язык"],
    stageHints: {},
  },
  natural_sciences: {
    requiredMaterials: ["схема", "формула", "задание", "определение"],
    forbiddenPatterns: ["обсудите природу"],
    stageHints: {},
  },
  mathematics: {
    requiredMaterials: ["задача", "формула", "эталон", "алгоритм"],
    forbiddenPatterns: ["обсудите числа"],
    stageHints: {},
  },
  primary: {
    requiredMaterials: ["картинка", "задание", "игра", "пример"],
    forbiddenPatterns: ["сложная терминология"],
    stageHints: {
      primary_acquisition: "Простое правило + наглядный пример для начальной школы.",
    },
  },
};

export function resolveSubjectProfile(subject: string, grade: string): SubjectProfile {
  const s = subject.trim();
  const mode = resolveSubjectGenerationMode(s, grade);
  const specific = BASE_PROFILES[s] ?? MODE_FALLBACK[mode];

  return {
    subject: s,
    mode,
    requiredMaterials: specific.requiredMaterials,
    forbiddenPatterns: specific.forbiddenPatterns,
    stageHints: specific.stageHints,
  };
}

export function getStageSubjectHint(profile: SubjectProfile, stageId: string): string {
  return profile.stageHints[stageId] ?? "";
}
