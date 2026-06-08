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
    requiredMaterials: ["источник", "даты", "хронология", "карта", "документ", "событие", "причин"],
    forbiddenPatterns: ["обсудите без материала", "подумайте о прошлом"],
    stageHints: {
      problem_situation_goal:
        "Проблема через источник, дату или противоречие фактов; без готового исторического вывода.",
      knowledge_activation:
        "Используй короткий источник или фрагмент документа; зафиксируй затруднение по интерпретации.",
      primary_acquisition:
        "Дай эталон вывода по источнику: причина-следствие, периодизация, ключевые даты.",
      primary_consolidation: "Задание на сопоставление источников или хронологическую линию.",
      reflection: "Рефлексия по усвоенным фактам и хронологии; без нового материала.",
    },
  },
  Математика: {
    requiredMaterials: ["задача", "формула", "эталон решения", "числовой пример", "уравнен", "вычисл"],
    forbiddenPatterns: ["решите устно без записи", "обсудите правило"],
    stageHints: {
      problem_situation_goal:
        "Задача на известные действия, ведущая к затруднению; не применяй ещё не открытый способ.",
      knowledge_activation: "Пробное задание с числовым ответом; зафиксируй типичную ошибку.",
      primary_acquisition: "Правило/алгоритм + разобранный пример с формулой.",
      primary_consolidation: "2–3 задачи разной сложности с эталоном; только уже открытый способ.",
      reflection: "Самооценка по усвоенному способу решения; без новых задач на правило.",
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
    requiredMaterials: ["правило", "примеры слов", "упражнение", "текст", "предложен", "орфограф"],
    forbiddenPatterns: ["обсудите красоту языка"],
    stageHints: {
      problem_situation_goal: "Языковая проблема в предложении или тексте без готового правила.",
      knowledge_activation: "Пробное упражнение на орфографию/морфологию с типичной ошибкой.",
      primary_acquisition: "Правило + 3–4 примера + контрпример.",
      reflection: "Рефлексия по усвоенному правилу и типичным ошибкам.",
    },
  },
  Информатика: {
    requiredMaterials: ["алгоритм", "код", "псевдокод", "таблица", "задача", "схем", "ветвлен", "цикл"],
    forbiddenPatterns: ["обсудите IT", "подумайте о компьютерах"],
    stageHints: {
      problem_situation_goal: "Ситуация с алгоритмом или данными, где известный способ не подходит.",
      knowledge_activation: "Пробная задача на алгоритм/ветвление/цикл.",
      primary_acquisition: "Блок-схема или псевдокод + эталон выполнения.",
      primary_consolidation: "Задача на применение нового оператора/конструкции.",
      reflection: "Рефлексия: что понял про алгоритм и где были ошибки.",
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
    requiredMaterials: ["схема", "определение", "наблюдение", "задание", "признак", "процесс", "организм"],
    forbiddenPatterns: ["обсудите живое"],
    stageHints: {
      problem_situation_goal: "Наблюдение или факт о живом объекте, вызывающий вопрос без готового объяснения.",
      primary_acquisition: "Схема процесса + термины + эталон объяснения.",
      reflection: "Рефлексия по признакам, процессам и новым терминам.",
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
