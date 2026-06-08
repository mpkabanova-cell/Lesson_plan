import { NextResponse } from "next/server";
import { assembleLessonHtml, assembleLessonMarkdown } from "@/lib/constructor/assemblePlan";
import {
  signConstructSession,
  verifyConstructSession,
} from "@/lib/constructor/constructSession";
import { isConstructorV3Enabled } from "@/lib/constructor/openRouter";
import { validateAssembledLesson } from "@/lib/lessonPlanValidator";
import { resolveSubjectGenerationMode } from "@/lib/subjectGenerationMode";
import { resolveConstructorFrpContext } from "@/lib/constructor/frpContext";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  sessionId: string;
};

export async function POST(req: Request) {
  if (!isConstructorV3Enabled()) {
    return NextResponse.json({ error: "Конструктор v3 отключён" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const session = verifyConstructSession(body.sessionId?.trim() ?? "");
  if (!session) {
    return NextResponse.json({ error: "Сессия недействительна" }, { status: 401 });
  }

  const missing = session.selectedStageIds.filter(
    (id) => !session.stageResults.some((r) => r.stageId === id),
  );
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: "Не все этапы сгенерированы",
        missingStageIds: missing,
      },
      { status: 400 },
    );
  }

  const raw = assembleLessonMarkdown({
    lessonType: session.lessonType,
    selectedStageIds: session.selectedStageIds,
    stageResults: session.stageResults,
    subject: session.subject,
    grade: session.grade,
    topic: session.topic,
    goal: session.goal,
  });

  const frpContext = resolveConstructorFrpContext(session.subject, session.grade, session.topic);
  const mode = resolveSubjectGenerationMode(session.subject, session.grade);
  const selectedTitles = session.stageResults.map((r) => r.title);

  const validation = validateAssembledLesson(raw, {
    subject: session.subject,
    grade: session.grade,
    topic: session.topic,
    mode,
    selectedStages: selectedTitles,
    lessonType: session.lessonType,
    selectedStageIds: session.selectedStageIds,
    frpContext,
  });

  const html = await assembleLessonHtml(raw);

  return NextResponse.json({
    generationVersion: 3,
    sessionId: signConstructSession(session),
    raw,
    html,
    validation: {
      ok: validation.ok,
      issues: validation.issues,
      failedStageIds: validation.failedStageIds,
    },
    stageResults: session.stageResults,
    frp: session.frpMeta,
  });
}
