import fgosData from "./data/fgosStages.json";

export type LessonTypeId = "new_knowledge" | "consolidation" | "review";

export type FgosFlag = "required" | "optional";

export type StageDefinition = {
  id: string;
  title: string;
  fgosFlag: FgosFlag;
  goal: string;
  tasks: string[];
  successIndicators: string[];
  allowedTeacher: string[];
  allowedStudent: string[];
  forbidden: string[];
  requiredOutputs: string[];
  /** Шаблон без LLM (орг. момент, рефлексия). */
  templateOnly?: boolean;
  avgGenerationMs?: number;
};

type LessonTypeBundle = {
  label: string;
  stages: StageDefinition[];
};

const REGISTRY = fgosData as Record<LessonTypeId, LessonTypeBundle>;

export const LESSON_TYPE_IDS: LessonTypeId[] = ["new_knowledge", "consolidation", "review"];

export const LESSON_TYPE_LABELS: Record<LessonTypeId, string> = Object.fromEntries(
  LESSON_TYPE_IDS.map((id) => [id, REGISTRY[id].label]),
) as Record<LessonTypeId, string>;

/** Заголовки этапов для UI и обратной совместимости с v1/v2. */
export const LESSON_STAGES: Record<LessonTypeId, string[]> = Object.fromEntries(
  LESSON_TYPE_IDS.map((id) => [id, REGISTRY[id].stages.map((s) => s.title)]),
) as Record<LessonTypeId, string[]>;

export function lessonTypeForPrompt(id: LessonTypeId): string {
  return LESSON_TYPE_LABELS[id];
}

export function getLessonTypeStages(lessonType: LessonTypeId): StageDefinition[] {
  return REGISTRY[lessonType]?.stages ?? [];
}

export function getStageDefinition(
  lessonType: LessonTypeId,
  stageId: string,
): StageDefinition | undefined {
  return getLessonTypeStages(lessonType).find((s) => s.id === stageId);
}

/** Этапы, включённые по умолчанию: все required + optional. */
export function defaultSelectedStageIds(lessonType: LessonTypeId): string[] {
  return getLessonTypeStages(lessonType).map((s) => s.id);
}

export function defaultSelectedStageTitles(lessonType: LessonTypeId): string[] {
  return getLessonTypeStages(lessonType).map((s) => s.title);
}

/** Распределение минут по выбранным этапам (пропорционально весу). */
export function allocateStageMinutes(
  lessonType: LessonTypeId,
  selectedStageIds: string[],
  totalMinutes: number,
): Record<string, number> {
  const stages = getLessonTypeStages(lessonType).filter((s) => selectedStageIds.includes(s.id));
  if (!stages.length) return {};

  const weights: Record<string, number> = {
    organizational_moment: 2,
    reflection: 3,
    homework_info: 4,
    homework_check: 5,
    goal_setting_motivation: 5,
    problem_situation_goal: 8,
    knowledge_activation: 10,
    primary_acquisition: 12,
    primary_comprehension_check: 8,
    primary_consolidation: 10,
    creative_application: 10,
    apply_new_situation: 10,
    generalization_systematization: 8,
    comprehension_control: 10,
  };

  let sum = 0;
  for (const s of stages) {
    sum += weights[s.id] ?? 8;
  }

  const out: Record<string, number> = {};
  let allocated = 0;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    const w = weights[s.id] ?? 8;
    if (i === stages.length - 1) {
      out[s.id] = Math.max(2, totalMinutes - allocated);
    } else {
      const mins = Math.max(2, Math.round((totalMinutes * w) / sum));
      out[s.id] = mins;
      allocated += mins;
    }
  }
  return out;
}

export function estimateGenerationMs(
  lessonType: LessonTypeId,
  selectedStageIds: string[],
): number {
  let total = 8000;
  for (const id of selectedStageIds) {
    const def = getStageDefinition(lessonType, id);
    total += def?.avgGenerationMs ?? 18000;
  }
  return total;
}

export function requiredStageIds(lessonType: LessonTypeId): string[] {
  return getLessonTypeStages(lessonType)
    .filter((s) => s.fgosFlag === "required")
    .map((s) => s.id);
}
