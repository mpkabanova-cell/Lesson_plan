import {
  buildStageMessages,
  extractStageSummary,
  generateTemplateStage,
  isTemplateStage,
  type StageGenerationInput,
} from "./stageGenerator";
import {
  buildStageFixInstructions,
  MAX_STAGE_ATTEMPTS,
  validateStageMarkdown,
} from "./stageValidators";
import { openRouterCompletion, openRouterHeaders } from "./openRouter";
import type { ConstructSessionPayload, StageResult } from "./constructSession";
import { resolveConstructorFrpContext } from "./frpContext";
import { resolveSubjectProfile } from "./subjectProfiles";
import { buildStageSummaries, upsertStageResult } from "./constructSession";
import {
  getStageDefinition,
  type LessonTypeId,
} from "./stageRegistry";

export async function generateStageForSession(
  session: ConstructSessionPayload,
  stageId: string,
  key: string,
  model: string,
): Promise<{ session: ConstructSessionPayload; result: StageResult }> {
  const stageIndex = session.selectedStageIds.indexOf(stageId);
  if (stageIndex < 0) {
    throw new Error(`Этап ${stageId} не входит в сессию`);
  }

  const stage = getStageDefinition(session.lessonType, stageId);
  if (!stage) throw new Error(`Неизвестный этап: ${stageId}`);

  const frpContext = resolveConstructorFrpContext(session.subject, session.grade, session.topic);
  const subjectProfile = resolveSubjectProfile(session.subject, session.grade);
  const previousSummaries = buildStageSummaries(session);
  const minutes = session.stageMinutes[stageId] ?? 5;

  const baseInput: StageGenerationInput = {
    stage,
    stageIndex,
    totalStages: session.selectedStageIds.length,
    lessonType: session.lessonType,
    subject: session.subject,
    grade: session.grade,
    topic: session.topic,
    goal: session.goal,
    minutes,
    homework: session.homework,
    frpContext,
    subjectProfile,
    previousSummaries,
  };

  if (isTemplateStage(stage)) {
    const { markdown, summary } = generateTemplateStage(baseInput);
    const result: StageResult = {
      stageId,
      title: stage.title,
      markdown,
      summary,
      attempts: 1,
    };
    return { session: upsertStageResult(session, result), result };
  }

  let fixInstructions: string | undefined;
  let markdown = "";
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_STAGE_ATTEMPTS; attempt++) {
    attempts = attempt;
    const input: StageGenerationInput = { ...baseInput, fixInstructions };
    const messages = buildStageMessages(input);
    const out = await openRouterCompletion(
      key,
      model,
      openRouterHeaders(key),
      messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
      0.35,
    );

    if (!out.ok) {
      throw new Error(`OpenRouter: ${out.detail}`);
    }

    markdown = out.content;
    const validation = validateStageMarkdown(markdown, stage, subjectProfile);
    if (validation.ok) break;
    fixInstructions = buildStageFixInstructions(validation.issues);
    if (attempt === MAX_STAGE_ATTEMPTS) {
      // keep last attempt even if invalid — finish validation will catch
    }
  }

  const summary = extractStageSummary(markdown, stage.title);
  const result: StageResult = {
    stageId,
    title: stage.title,
    markdown,
    summary,
    attempts,
  };
  return { session: upsertStageResult(session, result), result };
}

export function validateLessonTypeId(v: unknown): LessonTypeId | null {
  if (v === "new_knowledge" || v === "consolidation" || v === "review") return v;
  return null;
}
