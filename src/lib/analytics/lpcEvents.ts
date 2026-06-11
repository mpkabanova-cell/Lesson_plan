import { trackEvent, trackUxfbTrigger } from "./metrika";

type LessonContext = {
  subject?: string;
  grade?: string;
  lesson_type?: string;
};

export function trackLpcScenarioInit(): void {
  trackEvent("lpc_scenario_init", { scenario: "lesson_plan_constructor" });
}

export function trackLpcScenarioInputStart(input: {
  inputSource: "keyboard" | "suggestion";
  topicLength: number;
  subject: string;
  grade: string;
  lessonType: string;
}): void {
  trackEvent("lpc_scenario_input_start", {
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
  trackEvent("lpc_topic_suggestion_click", {
    topic: input.topic,
    subject: input.subject,
    grade: input.grade,
  });
}

export function trackLpcGoalSuggestClick(ctx: LessonContext): void {
  trackEvent("lpc_goal_suggest_click", {
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
  trackEvent("lpc_goal_suggest_success", {
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
  trackEvent("lpc_stage_toggle", {
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
  trackEvent("lpc_generate_click", {
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
  trackEvent("lpc_generation_success", {
    subject: input.subject,
    grade: input.grade,
    lesson_type: input.lessonType,
    generation_version: input.generationVersion,
    stages_count: input.stagesCount,
    duration_ms: input.durationMs,
  });
  trackUxfbTrigger("uxfb_trigger_generation_success", {
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
  trackEvent("lpc_generation_error", {
    subject: input.subject,
    grade: input.grade,
    error_message: input.errorMessage.slice(0, 200),
  });
}

export function trackLpcViewModeSelect(viewMode: "blocks" | "preview"): void {
  trackEvent("lpc_view_mode_select", { view_mode: viewMode });
}

export function trackLpcWorkspaceTabSelect(tab: "lesson" | "materials"): void {
  trackEvent("lpc_workspace_tab_select", { tab });
}

export function trackLpcParamsPanelToggle(collapsed: boolean): void {
  trackEvent("lpc_params_panel_toggle", { collapsed });
}

export function trackLpcExportDocxClick(input: {
  exportSource: "structured" | "html";
  subject: string;
  grade: string;
}): void {
  trackEvent("lpc_export_docx_click", {
    export_source: input.exportSource,
    subject: input.subject,
    grade: input.grade,
  });
}

export function trackLpcExportDocxSuccess(input: {
  exportSource: "structured" | "html";
  titleLength: number;
}): void {
  trackEvent("lpc_export_docx_success", {
    export_source: input.exportSource,
    title_length: input.titleLength,
  });
  trackUxfbTrigger("uxfb_trigger_export_success", {
    export_source: input.exportSource,
  });
}

export function trackLpcStageRegenerate(input: { stageId: string; stageIndex: number }): void {
  trackEvent("lpc_stage_regenerate", {
    stage_id: input.stageId,
    stage_index: input.stageIndex,
  });
}

export function trackLpcStageFieldRegenerate(input: {
  stageId: string;
  field: string;
  mode: "regenerate" | "improve";
}): void {
  trackEvent("lpc_stage_field_regenerate", {
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
  trackEvent("lpc_technique_apply", {
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
  trackEvent("lpc_materials_search", {
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
  trackEvent("lpc_materials_result_click", {
    url_host: input.urlHost,
    result_index: input.resultIndex,
    subject: input.subject,
    grade: input.grade,
  });
}

export function trackLpcMaterialsFallbackGoogle(queryLength: number): void {
  trackEvent("lpc_materials_fallback_google", { query_length: queryLength });
}

export function trackLpcMaterialsPortalClick(): void {
  trackEvent("lpc_materials_portal_click", {});
}
