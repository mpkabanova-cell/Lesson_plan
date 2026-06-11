import { trackEvent, trackUxfbTrigger } from "./metrika";

const LPC_SCENARIO = {
  lessonPlanConstructor: "lpc_lesson_plan_constructor",
  goalSuggestion: "lpc_goal_suggestion",
  resultEditing: "lpc_result_editing",
  workspaceNavigation: "lpc_workspace_navigation",
  materialsSearch: "lpc_materials_search",
  uxFeedback: "lpc_ux_feedback",
} as const;

type LessonContext = {
  subject?: string;
  grade?: string;
  lesson_type?: string;
};

export function trackLpcScenarioInit(): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_init`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
  });
}

export function trackLpcScenarioInputStart(input: {
  inputSource: "keyboard" | "suggestion";
  topicLength: number;
  subject: string;
  grade: string;
  lessonType: string;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_input_start`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    input_source: input.inputSource,
    topic_length: input.topicLength,
    subject: input.subject,
    grade: input.grade,
    lesson_type: input.lessonType,
  });
}

export function trackLpcTopicSuggestionClick(input: {
  topic: string;
  subject: string;
  grade: string;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_topic_suggestion_click`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    topic: input.topic,
    subject: input.subject,
    grade: input.grade,
  });
}

export function trackLpcGoalSuggestClick(ctx: LessonContext): void {
  trackEvent(`${LPC_SCENARIO.goalSuggestion}_click`, {
    scenario_slug: LPC_SCENARIO.goalSuggestion,
    subject: ctx.subject ?? "",
    grade: ctx.grade ?? "",
    lesson_type: ctx.lesson_type ?? "",
  });
}

export function trackLpcGoalSuggestSuccess(input: {
  subject: string;
  grade: string;
  goalLength: number;
}): void {
  trackEvent(`${LPC_SCENARIO.goalSuggestion}_success`, {
    scenario_slug: LPC_SCENARIO.goalSuggestion,
    subject: input.subject,
    grade: input.grade,
    goal_length: input.goalLength,
  });
}

export function trackLpcStageToggle(input: {
  stageId: string;
  enabled: boolean;
  selectedStagesCount: number;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_stage_toggle`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    stage_id: input.stageId,
    enabled: input.enabled,
    selected_stages_count: input.selectedStagesCount,
  });
}

export function trackLpcGenerateClick(input: {
  subject: string;
  grade: string;
  lessonType: string;
  duration: number;
  topicLength: number;
  goalLength: number;
  selectedStagesCount: number;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_generate_click`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    subject: input.subject,
    grade: input.grade,
    lesson_type: input.lessonType,
    duration: input.duration,
    topic_length: input.topicLength,
    goal_length: input.goalLength,
    selected_stages_count: input.selectedStagesCount,
  });
}

export function trackLpcGenerationSuccess(input: {
  subject: string;
  grade: string;
  lessonType: string;
  generationVersion: number;
  stagesCount: number;
  durationMs: number;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_generation_success`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    subject: input.subject,
    grade: input.grade,
    lesson_type: input.lessonType,
    generation_version: input.generationVersion,
    stages_count: input.stagesCount,
    duration_ms: input.durationMs,
  });
  trackUxfbTrigger(`${LPC_SCENARIO.uxFeedback}_generation_success`, {
    scenario_slug: LPC_SCENARIO.uxFeedback,
    subject: input.subject,
    grade: input.grade,
    generation_version: input.generationVersion,
  });
}

export function trackLpcGenerationError(input: {
  subject: string;
  grade: string;
  errorMessage: string;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_generation_error`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    subject: input.subject,
    grade: input.grade,
    error_message: input.errorMessage.slice(0, 200),
  });
}

export function trackLpcViewModeSelect(viewMode: "blocks" | "preview"): void {
  trackEvent(`${LPC_SCENARIO.resultEditing}_view_mode_select`, {
    scenario_slug: LPC_SCENARIO.resultEditing,
    view_mode: viewMode,
  });
}

export function trackLpcWorkspaceTabSelect(tab: "lesson" | "materials"): void {
  trackEvent(`${LPC_SCENARIO.workspaceNavigation}_tab_select`, {
    scenario_slug: LPC_SCENARIO.workspaceNavigation,
    tab,
  });
}

export function trackLpcParamsPanelToggle(collapsed: boolean): void {
  trackEvent(`${LPC_SCENARIO.workspaceNavigation}_params_panel_toggle`, {
    scenario_slug: LPC_SCENARIO.workspaceNavigation,
    collapsed,
  });
}

export function trackLpcExportDocxClick(input: {
  exportSource: "structured" | "html";
  subject: string;
  grade: string;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_export_docx_click`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    export_source: input.exportSource,
    subject: input.subject,
    grade: input.grade,
  });
}

export function trackLpcExportDocxSuccess(input: {
  exportSource: "structured" | "html";
  titleLength: number;
}): void {
  trackEvent(`${LPC_SCENARIO.lessonPlanConstructor}_export_docx_success`, {
    scenario_slug: LPC_SCENARIO.lessonPlanConstructor,
    export_source: input.exportSource,
    title_length: input.titleLength,
  });
  trackUxfbTrigger(`${LPC_SCENARIO.uxFeedback}_export_success`, {
    scenario_slug: LPC_SCENARIO.uxFeedback,
    export_source: input.exportSource,
  });
}

export function trackLpcStageRegenerate(input: { stageId: string; stageIndex: number }): void {
  trackEvent(`${LPC_SCENARIO.resultEditing}_stage_regenerate`, {
    scenario_slug: LPC_SCENARIO.resultEditing,
    stage_id: input.stageId,
    stage_index: input.stageIndex,
  });
}

export function trackLpcStageFieldRegenerate(input: {
  stageId: string;
  field: string;
  mode: "regenerate" | "improve";
}): void {
  trackEvent(`${LPC_SCENARIO.resultEditing}_stage_field_regenerate`, {
    scenario_slug: LPC_SCENARIO.resultEditing,
    stage_id: input.stageId,
    field: input.field,
    mode: input.mode,
  });
}

export function trackLpcTechniqueApply(input: {
  stageId: string;
  techniqueId: string;
  techniqueName: string;
}): void {
  trackEvent(`${LPC_SCENARIO.resultEditing}_technique_apply`, {
    scenario_slug: LPC_SCENARIO.resultEditing,
    stage_id: input.stageId,
    technique_id: input.techniqueId,
    technique_name: input.techniqueName,
  });
}

export function trackLpcMaterialsSearch(input: {
  queryLength: number;
  subject: string;
  grade: string;
  resultsCount: number;
}): void {
  trackEvent(`${LPC_SCENARIO.materialsSearch}_submit`, {
    scenario_slug: LPC_SCENARIO.materialsSearch,
    query_length: input.queryLength,
    subject: input.subject,
    grade: input.grade,
    results_count: input.resultsCount,
  });
}

export function trackLpcMaterialsResultClick(input: {
  urlHost: string;
  resultIndex: number;
  subject: string;
  grade: string;
}): void {
  trackEvent(`${LPC_SCENARIO.materialsSearch}_result_click`, {
    scenario_slug: LPC_SCENARIO.materialsSearch,
    url_host: input.urlHost,
    result_index: input.resultIndex,
    subject: input.subject,
    grade: input.grade,
  });
}

export function trackLpcMaterialsFallbackGoogle(queryLength: number): void {
  trackEvent(`${LPC_SCENARIO.materialsSearch}_fallback_google_click`, {
    scenario_slug: LPC_SCENARIO.materialsSearch,
    query_length: queryLength,
  });
}

export function trackLpcMaterialsPortalClick(): void {
  trackEvent(`${LPC_SCENARIO.materialsSearch}_portal_click`, {
    scenario_slug: LPC_SCENARIO.materialsSearch,
  });
}
