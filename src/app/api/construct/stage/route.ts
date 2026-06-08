import { NextResponse } from "next/server";
import {
  signConstructSession,
  verifyConstructSession,
} from "@/lib/constructor/constructSession";
import { generateStageForSession } from "@/lib/constructor/constructOrchestrator";
import { getOpenRouterConfig, isConstructorV3Enabled } from "@/lib/constructor/openRouter";
import { getStageDefinition } from "@/lib/constructor/stageRegistry";
import { resolveSubjectProfile } from "@/lib/constructor/subjectProfiles";
import { validateStageMarkdown } from "@/lib/constructor/stageValidators";

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = {
  sessionId: string;
  stageId: string;
};

export async function POST(req: Request) {
  if (!isConstructorV3Enabled()) {
    return NextResponse.json({ error: "Конструктор v3 отключён" }, { status: 503 });
  }

  const cfg = getOpenRouterConfig();
  if (!cfg) {
    return NextResponse.json({ error: "OPENROUTER_API_KEY не задан" }, { status: 500 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const session = verifyConstructSession(body.sessionId?.trim() ?? "");
  if (!session) {
    return NextResponse.json({ error: "Сессия недействительна или истекла" }, { status: 401 });
  }

  const stageId = body.stageId?.trim();
  if (!stageId || !session.selectedStageIds.includes(stageId)) {
    return NextResponse.json({ error: "Некорректный stageId" }, { status: 400 });
  }

  try {
    const { session: updated, result } = await generateStageForSession(
      session,
      stageId,
      cfg.key,
      cfg.model,
    );

    const stage = getStageDefinition(session.lessonType, stageId);
    const profile = resolveSubjectProfile(session.subject, session.grade);
    const validation =
      stage && !stage.templateOnly
        ? validateStageMarkdown(result.markdown, stage, profile)
        : { ok: true, issues: [] };

    return NextResponse.json({
      generationVersion: 3,
      sessionId: signConstructSession(updated),
      stageId,
      stageResult: result,
      validation,
      completedStages: updated.stageResults.length,
      totalStages: updated.selectedStageIds.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
