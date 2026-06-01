"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DEFAULT_GOAL_SYSTEM_PROMPT } from "@/lib/defaultGoalSystemPrompt";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt";
import { LESSON_STAGES, LESSON_TYPE_LABELS } from "@/lib/lessonTypes";
import {
  extractTimingFromHtml,
  normalizeStageMinutesToTotal,
  type StageTiming,
} from "@/lib/parseTiming";
import { DURATION_OPTIONS, GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/options";
import { prepareLessonPlanHtmlForEditor } from "@/lib/prepareEditorHtml";
import { MaterialsSearchTab } from "./materialsSearch/MaterialsSearchTab";
import { PlanEditor, type PlanEditorLoadInfo } from "./PlanEditor";

const LESSON_TYPE_ID = "new_knowledge" as const;

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

const TOPIC_CHIPS = ["Дроби", "Уравнения", "Площадь", "Деление"];
const DEMO_LESSONS = [
  { subject: "Математика", grade: "5 класс", topic: "Дроби" },
  { subject: "Русский язык", grade: "4 класс", topic: "Имя прилагательное" },
  { subject: "Окружающий мир", grade: "3 класс", topic: "Круговорот воды" },
];
const DRAFT_STORAGE_KEY = "lesson-plan-wizard-draft";

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
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0] ?? "");
  const [grade, setGrade] = useState("5");
  const [duration, setDuration] = useState(45);
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [homework, setHomework] = useState("");

  const [planHtml, setPlanHtml] = useState("<p></p>");
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
  /** Итог успешной генерации (после loading). */
  const [generateSuccessInfo, setGenerateSuccessInfo] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const stages = LESSON_STAGES[LESSON_TYPE_ID];

  const [stageFlags, setStageFlags] = useState<boolean[]>(() =>
    LESSON_STAGES.new_knowledge.map(() => true),
  );

  const effectiveStageFlags = useMemo(() => {
    if (stageFlags.length !== stages.length) return stages.map(() => true);
    return stageFlags;
  }, [stageFlags, stages]);

  const timingRaw: StageTiming[] = useMemo(() => {
    if (!planHtml || planHtml === "<p></p>") return [];
    return extractTimingFromHtml(planHtml);
  }, [planHtml]);

  /** Минуты из плана приведены к выбранной длительности урока, сумма всегда = длительность. */
  const timing: StageTiming[] = useMemo(
    () => normalizeStageMinutesToTotal(timingRaw, duration),
    [timingRaw, duration],
  );

  const timingRawSum = useMemo(
    () => timingRaw.reduce((s, x) => s + x.minutes, 0),
    [timingRaw],
  );

  const totalMinutes = useMemo(
    () => timing.reduce((s, x) => s + x.minutes, 0),
    [timing],
  );

  const timingWasRescaled =
    timingRaw.length > 0 && timingRawSum > 0 && timingRawSum !== duration;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw) as Partial<{
        subject: string;
        grade: string;
        duration: number;
        topic: string;
        goal: string;
        homework: string;
      }>;
      if (draft.subject) setSubject(draft.subject);
      if (draft.grade) setGrade(draft.grade);
      if (typeof draft.duration === "number") setDuration(draft.duration);
      if (draft.topic) setTopic(draft.topic);
      if (draft.goal) setGoal(draft.goal);
      if (draft.homework) setHomework(draft.homework);
    } catch {
      /* ignore broken draft */
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({ subject, grade, duration, topic, goal, homework }),
      );
    } catch {
      /* ignore storage errors */
    }
  }, [subject, grade, duration, topic, goal, homework]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    const selectedStages = stages.filter((_, i) => effectiveStageFlags[i]);
    if (selectedStages.length === 0) {
      setError("Отметьте хотя бы один этап в структуре урока.");
      setGenerateStep(null);
      return;
    }
    setLoading(true);
    setGenerateStep("Отправка запроса на сервер…");
    try {
      setGenerateStep("Ожидание ответа от OpenRouter (обычно 20–90 с, максимум ~2 мин)…");
      const data = await postJson<{
        html?: string;
        raw?: string;
      }>("/api/generate", {
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        subject,
        grade,
        topic,
        goal,
        durationMinutes: duration,
        lessonType: LESSON_TYPE_ID,
        homework: homework.trim() || undefined,
        selectedStages,
        generationVersion: 1,
      });

      setGenerateStep("Обработка ответа и загрузка в редактор…");

      if (data == null || typeof data !== "object") {
        throw new Error("Сервер вернул не объект в JSON. Проверьте версию API /api/generate.");
      }
      const html = typeof data.html === "string" ? data.html : "";
      const prepared = prepareLessonPlanHtmlForEditor(html || "<p></p>");
      const textOnly = prepared.replace(/<[^>]+>/g, "").trim();
      if (!textOnly) {
        const hint = data.raw?.trim()
          ? ` Фрагмент сырого ответа: ${data.raw.slice(0, 400)}${data.raw.length > 400 ? "…" : ""}`
          : "";
        setError(
          `После обработки план пустой. Проверьте модель и системный промпт плана.${hint}`,
        );
        setGenerateSuccessInfo(null);
      } else {
        setError(null);
        setGenerateSuccessInfo(null);
        setToast("План урока готов");
      }
      setPlanHtml(prepared);
      setContentKey((k) => k + 1);
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
      const data = await postJson<{ goal?: string }>(
        "/api/generate-goal",
        {
          systemPrompt: DEFAULT_GOAL_SYSTEM_PROMPT,
          subject,
          grade,
          topic: topic.trim(),
          lessonType: LESSON_TYPE_ID,
        },
        70_000,
      );
      const g = typeof data.goal === "string" ? data.goal.trim() : "";
      if (!g) {
        throw new Error("Сервер не вернул текст.");
      }
      setGoal(g);
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
        { html: planHtml, title: exportTitle },
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

  const hasPlan = planHtml.replace(/<[^>]+>/g, "").trim().length > 0;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f4ddff_0,#eef2ff_32%,#f8fafc_62%)]">
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/80 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1680px] items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-violet-500">AI-мастер урока</p>
            <h1 className="text-lg font-semibold text-slate-950">Конструктор плана урока</h1>
          </div>
          <div className="hidden rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 ring-1 ring-violet-100 sm:block">
            Создайте сценарий за 1 минуту
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col px-3 py-4">
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
            <section className="order-1 flex max-h-[calc(100dvh-6rem)] flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-3xl border border-white/70 bg-white/45 p-3 shadow-[0_24px_80px_rgba(99,102,241,0.12)] backdrop-blur-xl">
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
                    {GRADE_OPTIONS.map((g) => (
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
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Например: Дробные числа"
                />
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TOPIC_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setTopic(chip)}
                    className="rounded-full bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-800 ring-1 ring-violet-100 hover:bg-violet-100"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </WizardCard>

            <WizardCard icon="🧩" title="Формат урока" hint="Тип урока уже подобран под открытие нового знания.">
              <div className="grid grid-cols-2 gap-2">
                <div className="block text-xs font-medium text-slate-600">
                  Тип урока
                  <div className="mt-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-800">
                    {LESSON_TYPE_LABELS[LESSON_TYPE_ID]}
                  </div>
                </div>
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
                  {stages.map((label, i) => (
                    <li key={label}>
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
                        <span>{label}</span>
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

            <button
              type="button"
              disabled={loading || !topic.trim()}
              onClick={handleGenerate}
              className="sticky bottom-3 z-10 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-4 text-base font-semibold text-white shadow-2xl shadow-violet-300 transition hover:-translate-y-0.5 hover:shadow-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "✨ Генерирую…" : "✨ Сгенерировать план урока"}
            </button>

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-700">Минуты по этапам</h3>
              {timing.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">Появятся после генерации.</p>
              ) : (
                <>
                  <table className="mt-2 w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-1 pr-2 font-medium">Этап</th>
                        <th className="py-1 font-medium">Мин.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timing.map((row) => (
                        <tr key={row.stage} className="border-b border-slate-100">
                          <td className="py-1 pr-2 text-slate-800">{row.stage}</td>
                          <td className="py-1 tabular-nums text-slate-800">{row.minutes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    В сумме:{" "}
                    <span className="font-semibold tabular-nums text-slate-900">{totalMinutes}</span> мин (как в
                    настройках урока:{" "}
                    <span className="tabular-nums">{duration}</span> мин)
                  </p>
                  {timingWasRescaled ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                      Минуты приведены к {duration} мин.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            </section>
          ) : null}

          <section className="order-2 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto pb-8">
            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-[0_24px_80px_rgba(99,102,241,0.10)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-500">Результат</p>
                  <h2 className="text-xl font-semibold text-slate-950">План урока</h2>
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
              {(generateStep || (generateSuccessInfo && !loading) || error) ? (
                <div className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs leading-snug text-slate-700">
                  {generateStep ? <p className="text-violet-900">{generateStep}</p> : null}
                  {error ? <p className="mt-1 text-red-800">{error}</p> : null}
                  {generateSuccessInfo && !loading ? <p className="mt-1 text-emerald-900">{generateSuccessInfo}</p> : null}
                </div>
              ) : null}
            </div>

            <div ref={resultRef} className="min-h-[360px]">
              {loading ? (
                <LessonSkeleton />
              ) : hasPlan ? (
                <div className="min-h-[560px] overflow-hidden rounded-3xl">
                  <PlanEditor
                    content={planHtml}
                    contentKey={contentKey}
                    onHtmlChange={onHtmlChange}
                    onExternalLoad={handlePlanEditorLoad}
                    disabled={loading}
                    placeholder="Здесь появится готовый сценарий урока."
                  />
                </div>
              ) : (
                <div className="rounded-3xl border border-white/70 bg-white/80 p-8 text-center shadow-[0_24px_80px_rgba(99,102,241,0.10)] backdrop-blur-xl">
                  <div className="mx-auto flex size-14 items-center justify-center rounded-3xl bg-violet-100 text-2xl">
                    ✨
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-slate-950">Создайте план урока за 1 минуту</h2>
                  <div className="mx-auto mt-5 grid max-w-2xl grid-cols-1 gap-3 text-left sm:grid-cols-2">
                    {["Выберите предмет и класс", "Укажите тему урока", "Нажмите «Сгенерировать»", "Отредактируйте результат"].map((step, i) => (
                      <div key={step} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        <span className="mr-2 font-semibold text-violet-700">{i + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSubject("Математика");
                      setGrade("5");
                      setTopic("Дроби");
                      setGoal("Ученики откроют новый способ действия с дробями и применят его по эталону.");
                    }}
                    className="mt-6 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-200 hover:-translate-y-0.5"
                  >
                    Создать пример
                  </button>
                  <div className="mt-8 grid gap-3 text-left md:grid-cols-3">
                    {DEMO_LESSONS.map((demo) => (
                      <button
                        key={`${demo.subject}-${demo.topic}`}
                        type="button"
                        onClick={() => {
                          setSubject(demo.subject);
                          setGrade(demo.grade.replace(" класс", ""));
                          setTopic(demo.topic);
                        }}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm hover:border-violet-200 hover:shadow-md"
                      >
                        <p className="text-xs font-medium text-violet-600">{demo.subject} · {demo.grade}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{demo.topic}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-[0_24px_80px_rgba(99,102,241,0.10)] backdrop-blur-xl">
              <div className="mb-3">
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-500">Материалы</p>
                <h2 className="text-xl font-semibold text-slate-950">Материалы к уроку</h2>
              </div>
              <MaterialsSearchTab
                active
                lessonSubject={subject}
                lessonGrade={grade}
                programmableSearchCx={googleProgrammableSearchCx}
              />
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
