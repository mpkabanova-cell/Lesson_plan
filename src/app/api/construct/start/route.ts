import { NextResponse } from "next/server";
import {
  allocateStageMinutes,
  defaultSelectedStageIds,
  getLessonTypeStages,
  lessonTypeForPrompt,
} from "@/lib/constructor/stageRegistry";
import {
  buildInitialSession,
  signConstructSession,
} from "@/lib/constructor/constructSession";
import { frpContextToApiMeta, resolveConstructorFrpContext } from "@/lib/constructor/frpContext";
import { validateLessonTypeId } from "@/lib/constructor/constructOrchestrator";
import { isConstructorV3Enabled } from "@/lib/constructor/openRouter";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  subject: string;
  grade: string;
  topic: string;
  goal: string;
  durationMinutes: number;
  lessonType: string;
  homework?: string;
  selectedStageIds?: string[];
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

  const lessonType = validateLessonTypeId(body.lessonType);
  if (!lessonType) {
    return NextResponse.json({ error: "Некорректный тип урока FGOS" }, { status: 400 });
  }
  if (!body.subject?.trim() || !body.grade?.trim()) {
    return NextResponse.json({ error: "Укажите предмет и класс" }, { status: 400 });
  }
  if (!body.topic?.trim() && !body.goal?.trim()) {
    return NextResponse.json({ error: "Укажите тему и/или цель" }, { status: 400 });
  }
  if (!Number.isFinite(body.durationMinutes) || body.durationMinutes < 5) {
    return NextResponse.json({ error: "Длительность не менее 5 мин" }, { status: 400 });
  }

  const allIds = getLessonTypeStages(lessonType).map((s) => s.id);
  const selectedStageIds =
    Array.isArray(body.selectedStageIds) && body.selectedStageIds.length > 0
      ? body.selectedStageIds.filter((id) => allIds.includes(id))
      : defaultSelectedStageIds(lessonType);

  if (!selectedStageIds.length) {
    return NextResponse.json({ error: "Выберите хотя бы один этап" }, { status: 400 });
  }

  const frpContext = resolveConstructorFrpContext(body.subject, body.grade, body.topic);
  const frpMeta = frpContextToApiMeta(frpContext);
  const stageMinutes = allocateStageMinutes(lessonType, selectedStageIds, body.durationMinutes);

  const session = buildInitialSession({
    subject: body.subject.trim(),
    grade: body.grade.trim(),
    topic: body.topic.trim(),
    goal: body.goal.trim(),
    durationMinutes: body.durationMinutes,
    lessonType,
    homework: body.homework?.trim() || undefined,
    selectedStageIds,
    stageMinutes,
    frpMeta,
  });

  const sessionId = signConstructSession(session);
  const stages = getLessonTypeStages(lessonType)
    .filter((s) => selectedStageIds.includes(s.id))
    .map((s) => ({
      id: s.id,
      title: s.title,
      fgosFlag: s.fgosFlag,
      minutes: stageMinutes[s.id],
      templateOnly: Boolean(s.templateOnly),
    }));

  return NextResponse.json({
    generationVersion: 3,
    sessionId,
    lessonType,
    lessonTypeLabel: lessonTypeForPrompt(lessonType),
    stages,
    stageMinutes,
    frp: frpMeta,
    totalStages: stages.length,
  });
}
