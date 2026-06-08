export type {
  LessonTypeId,
  StageDefinition,
  FgosFlag,
} from "@/lib/constructor/stageRegistry";

export {
  LESSON_TYPE_IDS,
  LESSON_TYPE_LABELS,
  LESSON_STAGES,
  lessonTypeForPrompt,
  getLessonTypeStages,
  getStageDefinition,
  defaultSelectedStageIds,
  defaultSelectedStageTitles,
  allocateStageMinutes,
  estimateGenerationMs,
  requiredStageIds,
} from "@/lib/constructor/stageRegistry";
