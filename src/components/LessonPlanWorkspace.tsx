"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  firstAvailableGrade,
  formatGradeRange,
  getAvailableGrades,
  isSubjectGradeCompatible,
} from "@/config/subjectClassMap";
import { getTopicSuggestions } from "@/config/topicSuggestions";
import { suggestLessonGoal } from "@/app/actions/suggestLessonGoal";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt";
import { estimateGenerationMs } from "@/lib/lessonTypes";
import {
  getLessonTypeStages,
  LESSON_TYPE_IDS,
  LESSON_TYPE_LABELS,
  type LessonTypeId,
} from "@/lib/lessonTypes";
import { DURATION_OPTIONS, SUBJECT_OPTIONS } from "@/lib/options";
import {
  extractLessonFingerprint,
  getMaxRecentFingerprints,
  type LessonFingerprint,
} from "@/lib/lessonPlanDiversity";
import { prepareLessonPlanHtmlForEditor } from "@/lib/prepareEditorHtml";
import {
  structuredLessonFromStageResults,
  type StructuredLesson,
} from "@/lib/constructor/structuredLesson";
import { GenerationProgressPanel } from "./GenerationProgressPanel";
import { LessonDocumentPreview } from "./lessonStageConstructor/LessonDocumentPreview";
import { LessonStageConstructor } from "./lessonStageConstructor/LessonStageConstructor";
import { MaterialsSearchTab } from "./materialsSearch/MaterialsSearchTab";
import { PlanEditor, type PlanEditorLoadInfo } from "./PlanEditor";

type ConstructStartResponse = {
  sessionId: string;
  stages: Array<{ id: string; title: string; fgosFlag: string; minutes: number }>;
  totalStages: number;
  frp?: Record<string, unknown> | null;
};

type ConstructStageResponse = {
  sessionId: string;
  stageResult: { stageId: string; title: string; markdown: string; attempts: number };
  completedStages: number;
  totalStages: number;
};

type ConstructFinishResponse = {
  sessionId: string;
  raw: string;
  html: string;
  validation: {
    ok: boolean;
    issues: Array<{ code: string; message: string }>;
    failedStageIds?: string[];
  };
  stageResults?: Array<{ stageId: string; title: string; markdown: string; summary: string; attempts: number }>;
  stageMinutes?: Record<string, number>;
  frp?: Record<string, unknown> | null;
  generationVersion?: number;
};

type LessonViewMode = "blocks" | "preview";

function PanelIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
      <path d="M5.8 8h.01" />
      <path d="M5.8 12h.01" />
      <path d="M5.8 16h.01" />
      {direction === "left" ? <path d="M16 9l-3 3 3 3" /> : <path d="M13 9l3 3-3 3" />}
    </svg>
  );
}

function buildExportTitle(subject: string, grade: string, topic: string): string {
  const t = topic.trim() || "План урока";
  return `${subject} — ${grade} класс — ${t}`.slice(0, 180);
}

function WizardCard({
  icon,
  title,
  hint,
  children,
}: {
  icon: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_18px_50px_rgba(99,102,241,0.08)] backdrop-blur">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-lg">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {hint ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function LessonSkeleton() {
  return (
    <div className="space-y-4 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-sm">
      <div className="h-6 w-56 animate-pulse rounded-full bg-violet-100" />
      <div className="space-y-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-2xl border border-slate-100 p-4">
            <div className="h-4 w-1/3 animate-pulse rounded-full bg-slate-200" />
            <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
            <div className="h-3 w-5/6 animate-pulse rounded-full bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

const DRAFT_STORAGE_KEY = "lesson-plan-wizard-draft";
const RESULT_DRAFT_STORAGE_KEY = "lesson-plan-result-draft";
const FINGERPRINTS_STORAGE_KEY = "lesson-plan-recent-fingerprints";

function loadRecentFingerprints(): LessonFingerprint[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FINGERPRINTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LessonFingerprint[];
    return Array.isArray(parsed) ? parsed.slice(0, getMaxRecentFingerprints()) : [];
  } catch {
    return [];
  }
}

function saveRecentFingerprint(fp: LessonFingerprint): void {
  try {
    const existing = loadRecentFingerprints();
    const next = [fp, ...existing].slice(0, getMaxRecentFingerprints());
    window.localStorage.setItem(FINGERPRINTS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

function lessonParamsKey(subject: string, grade: string, topic: string): string {
  return `${subject}|${grade}|${topic.trim()}`;
}

type GenerateApiResponse = {
  html?: string;
  raw?: string;
  validationAttempts?: number;
  validationIssues?: Array<{ code: string; message: string }>;
  subjectMode?: string;
  detail?: string;
  error?: string;
};

async function requestLessonPlan(
  payload: Record<string, unknown>,
  onStep?: (step: string) => void,
): Promise<GenerateApiResponse> {
  onStep?.("Проектирование каркаса урока…");
  const data = await postJson<GenerateApiResponse>("/api/generate", payload, 220_000);
  onStep?.("Проверка содержательности сценария…");
  return data;
}

async function requestConstructV3(
  payload: {
    subject: string;
    grade: string;
    topic: string;
    goal: string;
    durationMinutes: number;
    lessonType: LessonTypeId;
    homework?: string;
    selectedStageIds: string[];
  },
  onStep?: (step: string) => void,
): Promise<ConstructFinishResponse> {
  onStep?.("Версия 3: подготовка каркаса FGOS и ФРП…");
  const start = await postJson<ConstructStartResponse>("/api/construct/start", payload, 60_000);

  let sessionId = start.sessionId;
  const total = start.totalStages;

  for (let i = 0; i < start.stages.length; i++) {
    const stage = start.stages[i];
    onStep?.(`Этап ${i + 1} из ${total} — ${stage.title}`);
    const stageRes = await postJson<ConstructStageResponse>(
      "/api/construct/stage",
      { sessionId, stageId: stage.id },
      120_000,
    );
    sessionId = stageRes.sessionId;
  }

  onStep?.("Сборка сценария и финальная проверка…");
  let finish = await postJson<ConstructFinishResponse>(
    "/api/construct/finish",
    { sessionId },
    60_000,
  );

  const failed = finish.validation.failedStageIds ?? [];
  if (!finish.validation.ok && failed.length > 0) {
    for (let i = 0; i < failed.length; i++) {
      const stageId = failed[i];
      const title =
        start.stages.find((s) => s.id === stageId)?.title ??
        finish.stageResults?.find((s) => s.stageId === stageId)?.title ??
        stageId;
      onStep?.(`Перегенерация: ${title} (${i + 1}/${failed.length})`);
      const regen = await postJson<ConstructStageResponse>(
        "/api/construct/stage",
        { sessionId: finish.sessionId, stageId },
        120_000,
      );
      sessionId = regen.sessionId;
    }
    onStep?.("Повторная сборка и проверка…");
    finish = await postJson<ConstructFinishResponse>(
      "/api/construct/finish",
      { sessionId },
      60_000,
    );
  }

  return {
    ...finish,
    stageMinutes: Object.fromEntries(start.stages.map((stage) => [stage.id, stage.minutes])),
  };
}

/** Запрос с таймаутом; тело всегда читается как текст, затем JSON — так видны не-JSON и пустые ответы. */
async function postJson<T>(url: string, body: unknown, timeoutMs = 130_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const aborted =
      (e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError");
    if (aborted) {
      throw new Error(
        `Превышено время ожидания (${Math.round(timeoutMs / 1000)} с). Сервер или OpenRouter не ответили вовремя. На Render на бесплатном плане запросы иногда обрываются — повторите или сократите системный промпт.`,
      );
    }
    const m = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Сеть: запрос не выполнен (${m}). Проверьте соединение, что открыта та же страница (без блокировки mixed content) и что деплой живой.`,
    );
  }
  clearTimeout(timer);

  const text = await res.text();
  const snippet = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n)}…`);

  if (!res.ok) {
    let msg = `HTTP ${res.status} ${res.statusText || ""}`.trim();
    if (text.trim()) {
      try {
        const j = JSON.parse(text) as { error?: string; detail?: string };
        const parts = [j.error, j.detail].filter(
          (x): x is string => typeof x === "string" && x.length > 0,
        );
        if (parts.length > 0) msg = parts.join(" — ");
        else msg += ` — ${snippet(text, 800)}`;
      } catch {
        msg += ` — ${snippet(text, 800)}`;
      }
    }
    throw new Error(msg);
  }

  if (!text.trim()) {
    throw new Error(
      "Сервер вернул пустой ответ (200 без тела). Смотрите логи деплоя: возможно, упал обработчик /api/generate.",
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    const hint = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Ответ сервера не JSON (${hint}). Начало ответа: ${snippet(text, 400)}`,
    );
  }
}

/** Минимальная высота поля цели (px), максимум — после него внутри поля включается прокрутка. */
const GOAL_TEXTAREA_MIN_HEIGHT_PX = 72;
const GOAL_TEXTAREA_MAX_HEIGHT_PX = 480;

async function downloadBlob(path: string, body: unknown, filename: string) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string; hint?: string };
      msg = [j.error, j.hint].filter(Boolean).join(" — ") || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type LessonPlanWorkspaceProps = {
  /** cx для встроенного поиска Google (Programmable Search Element). Передаётся из page.tsx с сервера. */
  googleProgrammableSearchCx?: string;
};

export default function LessonPlanWorkspace({ googleProgrammableSearchCx }: LessonPlanWorkspaceProps) {
  const [subject, setSubject] = useState<string>("Математика");
  const [grade, setGrade] = useState("5");
  const [duration, setDuration] = useState(45);
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [homework, setHomework] = useState("");

  const [planHtml, setPlanHtml] = useState("");
  const [structuredLesson, setStructuredLesson] = useState<StructuredLesson | null>(null);
  const [constructSessionId, setConstructSessionId] = useState<string | null>(null);
  const [contentKey, setContentKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [goalSuggesting, setGoalSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [goalError, setGoalError] = useState<string | null>(null);
  const goalTextareaRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = goalTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const clamped = Math.min(Math.max(scrollH, GOAL_TEXTAREA_MIN_HEIGHT_PX), GOAL_TEXTAREA_MAX_HEIGHT_PX);
    el.style.height = `${clamped}px`;
    el.style.overflowY = scrollH > GOAL_TEXTAREA_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [goal]);
  /** Текущий этап длинного запроса (пока loading). */
  const [generateStep, setGenerateStep] = useState<string | null>(null);
  /** Время старта генерации — для оценки прогресса. */
  const [generateStartedAt, setGenerateStartedAt] = useState<number | null>(null);
  /** Итог успешной генерации (после loading). */
  const [generateSuccessInfo, setGenerateSuccessInfo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [activeWorkspace, setActiveWorkspace] = useState<"lesson" | "materials">("lesson");
  const [lessonViewMode, setLessonViewMode] = useState<LessonViewMode>("blocks");
  const [materialsWorkspaceMounted, setMaterialsWorkspaceMounted] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const generateActionRef = useRef<HTMLDivElement>(null);

  const [lessonTypeId, setLessonTypeId] = useState<LessonTypeId>("new_knowledge");
  const stageDefs = useMemo(() => getLessonTypeStages(lessonTypeId), [lessonTypeId]);
  const stages = useMemo(() => stageDefs.map((s) => s.title), [stageDefs]);
  const availableGradeOptions = useMemo(() => getAvailableGrades(subject), [subject]);
  const topicSuggestions = useMemo(() => getTopicSuggestions(subject, grade), [subject, grade]);
  const suggestionsKey = `${subject}-${grade}`;

  const [stageFlags, setStageFlags] = useState<boolean[]>(() =>
    getLessonTypeStages("new_knowledge").map(() => true),
  );
  const [constructEstimateMs, setConstructEstimateMs] = useState<number | undefined>(undefined);

  useEffect(() => {
    setStageFlags(stageDefs.map(() => true));
  }, [lessonTypeId, stageDefs]);

  const effectiveStageFlags = useMemo(() => {
    if (stageFlags.length !== stages.length) return stages.map(() => true);
    return stageFlags;
  }, [stageFlags, stages]);

  const clearWorkspaceResult = useCallback(() => {
    setPlanHtml("");
    setStructuredLesson(null);
    setConstructSessionId(null);
    setGenerateSuccessInfo(null);
    setContentKey((k) => k + 1);
    try {
      window.localStorage.removeItem(RESULT_DRAFT_STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      window.localStorage.removeItem(RESULT_DRAFT_STORAGE_KEY);
    } catch {
      /* ignore storage errors */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (isSubjectGradeCompatible(subject, grade)) return;

    const nextGrade = firstAvailableGrade(subject);
    if (!nextGrade) return;

    setGrade(nextGrade);
    const range = formatGradeRange(subject);
    setToast(
      range
        ? `Для предмета “${subject}” доступны только ${range}`
        : `Для предмета “${subject}” выбран доступный класс`,
    );
  }, [subject, grade]);

  useEffect(() => {
    if (selectedSuggestion && !topicSuggestions.includes(selectedSuggestion)) {
      setSelectedSuggestion(null);
    }
  }, [selectedSuggestion, topicSuggestions]);

  useEffect(() => {
    if (loading) return;

    const hasSavedResult =
      Boolean(structuredLesson?.stages.length) ||
      planHtml.replace(/<[^>]+>/g, "").trim().length > 0;
    if (!hasSavedResult) return;

    const savedKey = structuredLesson
      ? lessonParamsKey(structuredLesson.subject, structuredLesson.grade, structuredLesson.topic)
      : lessonParamsKey(subject, grade, topic);
    const currentKey = lessonParamsKey(subject, grade, topic);

    if (savedKey !== currentKey) {
      clearWorkspaceResult();
    }
  }, [
    clearWorkspaceResult,
    grade,
    loading,
    planHtml,
    structuredLesson,
    subject,
    topic,
  ]);

  const handleTopicSuggestionClick = useCallback((suggestion: string) => {
    setTopic(suggestion);
    setSelectedSuggestion(suggestion);
    window.setTimeout(() => {
      generateActionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
  }, []);

  const handlePlanEditorLoad = useCallback((info: PlanEditorLoadInfo) => {
    if (info.contentKey === 0 && info.approxPlainFromHtml === 0 && info.textLength === 0) {
      return;
    }

    if (info.approxPlainFromHtml > 0 && info.textLength === 0) {
      setError(
        `Текст от модели есть (~${info.approxPlainFromHtml.toLocaleString("ru-RU")} симв.), но редактор не отобразил содержимое даже в упрощённом виде. Попробуйте другую модель или упростите системный промпт плана (абзацы, списки, без сложной вёрстки).`,
      );
      setGenerateSuccessInfo(null);
      return;
    }

    if (info.textLength > 0) {
      setError(null);
      setGenerateSuccessInfo(
        `Успешно: в редакторе ${info.textLength.toLocaleString("ru-RU")} симв.${info.usedFallback ? " Показан упрощённый текст (без части форматирования)." : ""}`,
      );
    } else if (info.contentKey > 0) {
      setGenerateSuccessInfo(null);
    }
  }, []);

  const handleGenerate = async () => {
    setError(null);
    setGenerateSuccessInfo(null);
    if (!isSubjectGradeCompatible(subject, grade)) {
      setError("Этот предмет не изучается в выбранном классе.");
      setToast("Этот предмет не изучается в выбранном классе");
      setGenerateStep(null);
      return;
    }
    const selectedStageDefs = stageDefs.filter((_, i) => effectiveStageFlags[i]);
    const selectedStages = selectedStageDefs.map((s) => s.title);
    const selectedStageIds = selectedStageDefs.map((s) => s.id);
    if (selectedStages.length === 0) {
      setError("Отметьте хотя бы один этап в структуре урока.");
      setGenerateStep(null);
      return;
    }
    setLoading(true);
    setGenerateStartedAt(Date.now());
    setConstructEstimateMs(estimateGenerationMs(lessonTypeId, selectedStageIds));
    setGenerateStep("Отправка запроса на сервер…");
    try {
      const basePayload = {
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        subject,
        grade,
        topic,
        goal,
        durationMinutes: duration,
        lessonType: lessonTypeId,
        homework: homework.trim() || undefined,
        selectedStages,
        recentLessonFingerprints: loadRecentFingerprints(),
      };

      let html = "";
      let raw = "";
      let usedVersion = 3;
      let successInfo: string | null = null;
      let nextStructuredLesson: StructuredLesson | null = null;
      let nextConstructSessionId: string | null = null;

      try {
        setGenerateStep("Версия 3: поэтапный конструктор FGOS…");
        const constructData = await requestConstructV3(
          {
            subject,
            grade,
            topic,
            goal,
            durationMinutes: duration,
            lessonType: lessonTypeId,
            homework: homework.trim() || undefined,
            selectedStageIds,
          },
          setGenerateStep,
        );
        html = constructData.html ?? "";
        raw = constructData.raw ?? "";
        nextConstructSessionId = constructData.sessionId;
        if (constructData.stageResults?.length) {
          nextStructuredLesson = structuredLessonFromStageResults({
            subject,
            grade,
            topic,
            goal,
            durationMinutes: duration,
            lessonType: lessonTypeId,
            homework: homework.trim() || undefined,
            frpMeta: constructData.frp,
            selectedStageIds,
            stageMinutes: constructData.stageMinutes ?? {},
            stageResults: constructData.stageResults,
          });
        }
        if (!constructData.validation.ok) {
          const issueCount = constructData.validation.issues?.length ?? 0;
          successInfo =
            issueCount > 0
              ? `Конструктор v3: план собран с замечаниями проверки (${issueCount}).`
              : "План собран конструктором v3 (FGOS, поэтапно).";
        } else {
          successInfo = "План собран конструктором v3 (FGOS, поэтапно).";
        }
      } catch (v3Error) {
        const msg = v3Error instanceof Error ? v3Error.message : String(v3Error);
        const v3Disabled = msg.includes("503") || msg.includes("отключён");
        if (!v3Disabled && !msg.includes("HTTP 5") && !msg.includes("OpenRouter")) {
          throw v3Error;
        }

        usedVersion = 2;
        nextStructuredLesson = null;
        nextConstructSessionId = null;
        setConstructEstimateMs(undefined);
        let data: GenerateApiResponse;
        try {
          setGenerateStep("Конструктор v3 недоступен, версия 2…");
          data = await requestLessonPlan(
            { ...basePayload, generationVersion: 2 },
            setGenerateStep,
          );
        } catch (v2Error) {
          const v2msg = v2Error instanceof Error ? v2Error.message : String(v2Error);
          const isPlannerFailure =
            v2msg.includes("422") ||
            v2msg.includes("планировщик") ||
            v2msg.includes("версия 2");
          if (!isPlannerFailure) {
            throw v2Error;
          }
          usedVersion = 1;
          setGenerateStep("Планировщик недоступен, генерация в один шаг (версия 1)…");
          data = await requestLessonPlan(
            { ...basePayload, generationVersion: 1 },
            setGenerateStep,
          );
        }
        html = typeof data.html === "string" ? data.html : "";
        raw = typeof data.raw === "string" ? data.raw : "";
        const attempts = data.validationAttempts ?? 0;
        const refined = attempts > 0 ? ` (доработок: ${attempts})` : "";
        successInfo =
          attempts > 0
            ? `План прошёл проверку содержательности${refined}.`
            : null;
      }

      setGenerateStep("Обработка ответа и загрузка в редактор…");

      const prepared = prepareLessonPlanHtmlForEditor(html || "<p></p>");
      const textOnly = prepared.replace(/<[^>]+>/g, "").trim();
      if (!textOnly) {
        const hint = raw?.trim()
          ? ` Фрагмент сырого ответа: ${raw.slice(0, 400)}${raw.length > 400 ? "…" : ""}`
          : "";
        setError(
          `После обработки план пустой. Проверьте модель и системный промпт плана.${hint}`,
        );
        setGenerateSuccessInfo(null);
      } else {
        setError(null);
        setGenerateSuccessInfo(successInfo);
        setToast(`План урока готов (v${usedVersion})`);
        if (raw.trim()) {
          saveRecentFingerprint(extractLessonFingerprint(raw, subject, topic));
        }
      }
      setPlanHtml(prepared);
      setStructuredLesson(nextStructuredLesson);
      setConstructSessionId(nextConstructSessionId);
      setContentKey((k) => k + 1);
      setActiveWorkspace("lesson");
      setLessonViewMode("blocks");
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 80);
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim().length > 0
          ? e.message
          : `Неизвестная ошибка: ${String(e)}`;
      setError(msg);
      setGenerateSuccessInfo(null);
    } finally {
      setLoading(false);
      setGenerateStep(null);
      setGenerateStartedAt(null);
    }
  };

  const handleSuggestGoal = async () => {
    setGoalError(null);
    if (!topic.trim()) {
      setGoalError("Укажите тему урока.");
      return;
    }
    setGoalSuggesting(true);
    try {
      const result = await suggestLessonGoal({
        subject,
        grade,
        topic: topic.trim(),
        lessonType: lessonTypeId,
      });
      if (!result.ok) {
        throw new Error(result.detail ? `${result.error} — ${result.detail}` : result.error);
      }
      setGoal(result.goal);
      setToast("Формулировка добавлена");
    } catch (e) {
      const msg =
        e instanceof Error && e.message.trim().length > 0
          ? e.message
          : `Неизвестная ошибка: ${String(e)}`;
      setGoalError(msg);
    } finally {
      setGoalSuggesting(false);
    }
  };

  const exportTitle = buildExportTitle(subject, grade, topic || goal);

  const handleExportDocx = async () => {
    setError(null);
    setExporting(true);
    try {
      await downloadBlob(
        "/api/export/docx",
        structuredLesson
          ? { lesson: structuredLesson, title: exportTitle }
          : { html: planHtml, title: exportTitle },
        "plan.docx",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка экспорта Word");
    } finally {
      setExporting(false);
    }
  };

  const onHtmlChange = useCallback((html: string) => {
    setPlanHtml(html);
  }, []);

  const hasPlan =
    Boolean(structuredLesson?.stages.length) ||
    planHtml.replace(/<[^>]+>/g, "").trim().length > 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,#f4ddff_0,#eef2ff_32%,#f8fafc_62%)]">
      <style>{`
        @keyframes suggestionsFade {
          from { opacity: 0; transform: translateY(3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .suggestions-fade {
          animation: suggestionsFade 180ms ease-out;
        }
      `}</style>
      <header className="z-20 shrink-0 border-b border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-500">AI-мастер урока</p>
            <h1 className="text-lg font-semibold text-slate-950">Конструктор плана урока</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1680px] min-h-0 flex-1 flex-col overflow-hidden px-3 py-4">
        <div
          className={`grid min-h-0 flex-1 grid-cols-1 gap-4 xl:items-stretch xl:overflow-hidden ${
            leftPanelCollapsed ? "xl:grid-cols-[48px_minmax(0,1fr)]" : "xl:grid-cols-[390px_minmax(0,1fr)]"
          }`}
        >
          {leftPanelCollapsed ? (
            <aside className="order-1 flex min-h-0 items-center rounded-xl border border-slate-200 bg-white p-2 shadow-sm xl:flex-col">
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed(false)}
                aria-label="Показать параметры"
                title="Показать параметры"
                className="flex size-8 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 hover:text-teal-800"
              >
                <PanelIcon direction="right" />
              </button>
            </aside>
          ) : null}

          {/* Column 1: параметры + этапы + тайминг — своя прокрутка */}
          {!leftPanelCollapsed ? (
            <section className="order-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/45 p-3 shadow-[0_24px_80px_rgba(99,102,241,0.12)] backdrop-blur-xl">
            <div className="flex items-center justify-between gap-2 px-1">
              <div>
                <p className="text-xs font-medium text-violet-600">Шаги создания</p>
                <h2 className="text-base font-semibold text-slate-950">Параметры урока</h2>
              </div>
              <button
                type="button"
                onClick={() => setLeftPanelCollapsed(true)}
                aria-label="Скрыть параметры"
                title="Скрыть параметры"
                className="flex size-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-teal-800"
              >
                <PanelIcon direction="left" />
              </button>
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden pb-6">
            <WizardCard icon="📘" title="Основная информация" hint="Начните с темы, предмета и класса.">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  Предмет
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    {SUBJECT_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-medium text-slate-600">
                  Класс
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm"
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                  >
                    {availableGradeOptions.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-3 block text-xs font-medium text-slate-600">
                Тема урока
                <input
                  className="mt-1 w-full rounded-2xl border border-violet-200 bg-white px-3 py-3 text-base font-medium text-slate-950 shadow-sm outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setSelectedSuggestion(null);
                  }}
                  placeholder="Например: Дробные числа"
                />
              </label>
              <div key={`sidebar-${suggestionsKey}`} className="suggestions-fade mt-2 flex flex-wrap gap-2">
                {topicSuggestions.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleTopicSuggestionClick(chip)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                      selectedSuggestion === chip
                        ? "bg-violet-600 text-white ring-violet-500 shadow-sm shadow-violet-200"
                        : "bg-violet-50 text-violet-800 ring-violet-100 hover:bg-violet-100"
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </WizardCard>

            <WizardCard icon="🧩" title="Тип урока по ФГОС">
              <div className="grid grid-cols-1 gap-2">
                <label className="block text-xs font-medium text-slate-600">
                  Структура урока (ФГОС)
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm"
                    value={lessonTypeId}
                    onChange={(e) => setLessonTypeId(e.target.value as LessonTypeId)}
                  >
                    {LESSON_TYPE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {LESSON_TYPE_LABELS[id]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Длительность
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-sm shadow-sm"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  >
                    {DURATION_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} мин
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <details className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/90">
                <summary className="cursor-pointer select-none px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100/80">
                  Структура урока
                </summary>
                <ul className="space-y-2 border-t border-slate-200 p-3">
                  {stageDefs.map((def, i) => (
                    <li key={def.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                        <input
                          type="checkbox"
                          className="mt-0.5 shrink-0 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                          checked={effectiveStageFlags[i]}
                          onChange={() => {
                            setStageFlags((prev) => {
                              const base =
                                prev.length === stages.length ? [...prev] : stages.map(() => true);
                              base[i] = !base[i];
                              return base;
                            });
                          }}
                        />
                        <span>
                          {def.title}
                          <span className="ml-1 text-xs text-slate-500">
                            ({def.fgosFlag === "required" ? "+" : "*"})
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </details>
            </WizardCard>

            <WizardCard icon="🎯" title="Результаты" hint="Опишите простыми словами, чему научатся ученики.">
              <button
                type="button"
                disabled={!topic.trim() || goalSuggesting}
                onClick={handleSuggestGoal}
                className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
              >
                {goalSuggesting ? "Формулирую…" : "✨ Помочь сформулировать"}
              </button>
              <textarea
                ref={goalTextareaRef}
                rows={1}
                className="mt-3 min-h-[86px] w-full resize-none overflow-x-hidden rounded-2xl border border-slate-200 px-3 py-3 text-sm leading-snug shadow-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Чему научатся ученики"
              />
              {goalError ? (
                <p
                  role="alert"
                  className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950"
                >
                  {goalError}
                </p>
              ) : null}
            </WizardCard>

            <WizardCard icon="🏠" title="Домашнее задание">
              <label className="block text-xs font-medium text-slate-600">
                Необязательно
                <textarea
                  className="mt-1 min-h-[74px] w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm shadow-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                  value={homework}
                  onChange={(e) => setHomework(e.target.value)}
                  placeholder="Готовое ДЗ или пожелание"
                />
              </label>
            </WizardCard>

            </div>

            <div ref={generateActionRef} className="shrink-0 border-t border-white/70 bg-white/70 pt-3 backdrop-blur">
              <button
                type="button"
                disabled={loading || !topic.trim()}
                onClick={handleGenerate}
                className="w-full rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-4 text-base font-semibold text-white shadow-lg shadow-violet-300 transition hover:-translate-y-0.5 hover:shadow-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "✨ Генерирую…" : "✨ Сгенерировать план урока"}
              </button>
            </div>
            </section>
          ) : null}

          <section className="order-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/80 shadow-[0_24px_80px_rgba(99,102,241,0.10)] backdrop-blur-xl">
            <div className="z-20 shrink-0 rounded-t-3xl border-b border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-500">
                    {activeWorkspace === "lesson" ? "Результат" : "Материалы"}
                  </p>
                  <h2 className="text-xl font-semibold text-slate-950">
                    {activeWorkspace === "lesson" ? "План урока" : "Поиск материалов"}
                  </h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {structuredLesson ? (
                    <div
                      className="inline-flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1"
                      role="group"
                      aria-label="Режим просмотра плана"
                    >
                      <button
                        type="button"
                        title="Блоки"
                        aria-pressed={lessonViewMode === "blocks"}
                        onClick={() => setLessonViewMode("blocks")}
                        className={`rounded-xl px-3 py-2 transition ${
                          lessonViewMode === "blocks"
                            ? "bg-violet-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        <svg
                          aria-hidden
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 5h6v6H4V5zm10 0h6v6h-6V5zM4 13h6v6H4v-6zm10 0h6v6h-6v-6z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        title="Как в документе"
                        aria-pressed={lessonViewMode === "preview"}
                        onClick={() => setLessonViewMode("preview")}
                        className={`rounded-xl px-3 py-2 transition ${
                          lessonViewMode === "preview"
                            ? "bg-violet-600 text-white shadow-sm"
                            : "text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        <svg
                          aria-hidden
                          className="h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </button>
                    </div>
                  ) : null}
                  <div
                    className="inline-flex rounded-2xl border border-slate-200 bg-slate-100/80 p-1"
                    role="tablist"
                    aria-label="Рабочая область"
                  >
                    {[
                      { id: "lesson" as const, label: "✍ План урока" },
                      { id: "materials" as const, label: "📚 Поиск материалов" },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={activeWorkspace === tab.id}
                        onClick={() => {
                          setActiveWorkspace(tab.id);
                          if (tab.id === "materials") {
                            setMaterialsWorkspaceMounted(true);
                          }
                        }}
                        className={`whitespace-nowrap rounded-xl px-4 py-2 text-sm font-semibold transition ${
                          activeWorkspace === tab.id
                            ? "bg-violet-600 text-white shadow-lg shadow-violet-200"
                            : "text-slate-600 hover:bg-white hover:text-slate-950"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={!hasPlan || exporting}
                    onClick={handleExportDocx}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                  >
                    {exporting ? "Готовлю Word…" : "Скачать Word"}
                  </button>
                </div>
              </div>
              {loading ? (
                <GenerationProgressPanel
                  active={loading}
                  step={generateStep}
                  startedAt={generateStartedAt}
                  estimateMs={constructEstimateMs}
                />
              ) : null}
              {!loading && (generateSuccessInfo || error) ? (
                <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-700">
                  {error ? <p className="text-red-800">{error}</p> : null}
                  {generateSuccessInfo ? <p className="text-emerald-900">{generateSuccessInfo}</p> : null}
                </div>
              ) : null}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6">
              <div
                ref={resultRef}
                className={`min-h-0 flex-1 flex-col overflow-hidden ${activeWorkspace === "lesson" ? "flex" : "hidden"}`}
                aria-hidden={activeWorkspace !== "lesson"}
              >
                  {loading ? (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <LessonSkeleton />
                    </div>
                  ) : hasPlan ? (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                      <div className="shrink-0 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-2.5 text-sm font-medium text-emerald-950">
                        ✨ План создан. Можно продолжить редактирование.
                      </div>
                      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                        {structuredLesson ? (
                          lessonViewMode === "preview" ? (
                            <LessonDocumentPreview lesson={structuredLesson} />
                          ) : (
                            <LessonStageConstructor
                              lesson={structuredLesson}
                              sessionId={constructSessionId}
                              onChange={(nextLesson) => setStructuredLesson(nextLesson)}
                              onToast={setToast}
                              onError={setError}
                            />
                          )
                        ) : (
                          <PlanEditor
                            content={planHtml}
                            contentKey={contentKey}
                            onHtmlChange={onHtmlChange}
                            onExternalLoad={handlePlanEditorLoad}
                            disabled={loading}
                            placeholder="Здесь появится готовый сценарий урока."
                          />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 text-center text-sm text-slate-500">
                      Сгенерируйте план урока — текст появится здесь.
                    </div>
                  )}
              </div>

              <div
                className={`min-h-0 flex-1 overflow-y-auto ${activeWorkspace === "materials" ? "block" : "hidden"}`}
                aria-hidden={activeWorkspace !== "materials"}
              >
                {materialsWorkspaceMounted ? (
                  <MaterialsSearchTab
                    programmableSearchCx={googleProgrammableSearchCx}
                  />
                ) : null}
              </div>
            </div>
          </section>
        </div>
      </main>
      {toast ? (
        <div className="fixed bottom-5 right-5 z-50 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-medium text-white shadow-2xl">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
