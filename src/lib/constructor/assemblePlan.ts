import { aiResponseToHtml } from "@/lib/aiResponseToHtml";
import { embedAnswerKeysInStages } from "@/lib/embedAnswerKeysInStages";
import { convertAllMathToSpans } from "@/lib/convertInlineMathToSpans";
import type { StageResult } from "./constructSession";
import type { LessonTypeId } from "./stageRegistry";
import { getStageDefinition } from "./stageRegistry";

export type AssembleInput = {
  lessonType: LessonTypeId;
  selectedStageIds: string[];
  stageResults: StageResult[];
  subject: string;
  grade: string;
  topic: string;
  goal: string;
};

function renumberTasks(markdown: string, stageOrder: number): string {
  let sub = 0;
  return markdown.replace(/задание\s+(\d+)\.(\d+)/gi, () => {
    sub += 1;
    return `Задание ${stageOrder}.${sub}`;
  });
}

export function assembleLessonMarkdown(input: AssembleInput): string {
  const { selectedStageIds, stageResults, subject, grade, topic, goal } = input;

  const byId = new Map(stageResults.map((r) => [r.stageId, r]));
  const parts: string[] = [
    `# План урока: ${subject}, ${grade} класс`,
    `**Тема:** ${topic}`,
  ];
  if (goal.trim()) parts.push(`**Цель:** ${goal.trim()}`);
  parts.push("");

  selectedStageIds.forEach((stageId, idx) => {
    const result = byId.get(stageId);
    const def = getStageDefinition(input.lessonType, stageId);
    const title = def?.title ?? result?.title ?? stageId;
    const body = result?.markdown?.trim() ?? `## ${title}\nВремя: —\n(этап не сгенерирован)`;
    const renumbered = renumberTasks(body, idx + 1);
    parts.push(renumbered);
    parts.push("");
  });

  let raw = parts.join("\n").trim();
  raw = embedAnswerKeysInStages(raw);
  return raw;
}

export async function assembleLessonHtml(markdown: string): Promise<string> {
  const withMath = convertAllMathToSpans(markdown);
  return aiResponseToHtml(withMath);
}
