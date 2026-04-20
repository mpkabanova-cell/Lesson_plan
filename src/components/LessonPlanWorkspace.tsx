"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_GOAL_SYSTEM_PROMPT } from "@/lib/defaultGoalSystemPrompt";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt";
import { LESSON_GOAL_SHORT_EXAMPLES } from "@/lib/lessonGoalExamples";
import {
  LESSON_STAGES,
  LESSON_TYPE_LABELS,
  type LessonTypeId,
} from "@/lib/lessonTypes";
import {
  extractTimingFromHtml,
  normalizeStageMinutesToTotal,
  type StageTiming,
} from "@/lib/parseTiming";
import { DURATION_OPTIONS, GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/options";
import { prepareLessonPlanHtmlForEditor } from "@/lib/prepareEditorHtml";
import { PlanEditor, type PlanEditorLoadInfo } from "./PlanEditor";

function buildExportTitle(subject: string, grade: string, topic: string): string {
  const t = topic.trim() || "План урока";
  return `${subject} — ${grade} класс — ${t}`.slice(0, 180);
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

export default function LessonPlanWorkspace() {
  const [subject, setSubject] = useState(SUBJECT_OPTIONS[0] ?? "");
  const [grade, setGrade] = useState("5");
  const [duration, setDuration] = useState(45);
  const [lessonType, setLessonType] = useState<LessonTypeId>("new_knowledge");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [homework, setHomework] = useState("");
  /** Системный промпт для генерации плана (POST /api/generate, поле `systemPrompt`). */
  const [planSystemPrompt, setPlanSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  /** Системный промпт для кнопки «Предложить цель» (POST /api/generate-goal). */
  const [goalSystemPrompt, setGoalSystemPrompt] = useState(DEFAULT_GOAL_SYSTEM_PROMPT);

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
  /** Сверка: длина текста в строке HTML vs в TipTap (после onExternalLoad). */
  const [editorDiagnosticsLine, setEditorDiagnosticsLine] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const stages = LESSON_STAGES[lessonType];

  const [stageFlags, setStageFlags] = useState<boolean[]>(() =>
    LESSON_STAGES.new_knowledge.map(() => true),
  );

  useEffect(() => {
    setStageFlags(LESSON_STAGES[lessonType].map(() => true));
  }, [lessonType]);

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

  const resetPlanSystemPrompt = () => setPlanSystemPrompt(DEFAULT_SYSTEM_PROMPT);
  const resetGoalSystemPrompt = () => setGoalSystemPrompt(DEFAULT_GOAL_SYSTEM_PROMPT);

  const handlePlanEditorLoad = useCallback((info: PlanEditorLoadInfo) => {
    if (info.contentKey === 0 && info.approxPlainFromHtml === 0 && info.textLength === 0) {
      return;
    }

    setEditorDiagnosticsLine(
      `Исходный текст после очистки HTML ≈ ${info.approxPlainFromHtml.toLocaleString("ru-RU")} симв. · в редакторе ${info.textLength.toLocaleString("ru-RU")} · вставка: ${info.usedJsonParse ? "JSON (TipTap)" : "HTML"}${info.usedFallback ? " · фолбэк: простой текст" : ""}`,
    );

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
    setEditorDiagnosticsLine(null);
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
      const data = await postJson<{ html?: string; raw?: string }>("/api/generate", {
        systemPrompt: planSystemPrompt,
        subject,
        grade,
        topic,
        goal,
        durationMinutes: duration,
        lessonType,
        homework: homework.trim() || undefined,
        selectedStages,
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
      }
      setPlanHtml(prepared);
      setContentKey((k) => k + 1);
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
          systemPrompt: goalSystemPrompt,
          subject,
          grade,
          topic: topic.trim(),
          lessonType,
        },
        70_000,
      );
      const g = typeof data.goal === "string" ? data.goal.trim() : "";
      if (!g) {
        throw new Error("Сервер не вернул текст цели.");
      }
      setGoal(g);
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
    <div className="flex min-h-screen flex-col xl:h-[100dvh] xl:max-h-[100dvh] xl:overflow-hidden">
      <header className="shrink-0 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold text-slate-900">Конструктор плана урока</h1>
        <p className="text-xs text-slate-600">
          Слева — что за урок и какие этапы взять в сценарий; справа — готовый текст плана и экспорт в Word. Кнопка
          «Предложить цель» и настройки промптов — ниже поля темы.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-[1680px] min-h-0 flex-1 flex-col px-3 py-4 xl:overflow-hidden">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)] xl:items-stretch xl:overflow-hidden">
          {/* Column 1: параметры + этапы + тайминг — своя прокрутка */}
          <section className="order-1 flex min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm xl:max-h-full">
            <h2 className="text-sm font-semibold text-slate-800">Параметры урока</h2>

            <label className="block text-xs font-medium text-slate-600">
              Предмет
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
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
              Класс (параллель)
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
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

            <label className="block text-xs font-medium text-slate-600">
              Длительность (мин.)
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs font-medium text-slate-600">
              Тип урока
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
                value={lessonType}
                onChange={(e) => setLessonType(e.target.value as LessonTypeId)}
              >
                {(Object.keys(LESSON_TYPE_LABELS) as LessonTypeId[]).map((id) => (
                  <option key={id} value={id}>
                    {LESSON_TYPE_LABELS[id]}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50/90 p-3">
              <h3 className="text-xs font-semibold text-slate-800">
                Этапы урока ({LESSON_TYPE_LABELS[lessonType]})
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                По умолчанию отмечено всё: сценарий строится по полной линейке этого типа урока. Снимите галочку с этапа,
                если его не будет на уроке — в план попадут только отмеченные шаги (порядок сохраняется).
              </p>
              <ul className="mt-2 space-y-2 pr-1">
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
            </div>

            <label className="block text-xs font-medium text-slate-600">
              Тема урока
              <input
                className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например: Дробные числа"
              />
            </label>

            <div className="block text-xs font-medium text-slate-600">
              <span className="block">Цель / ожидаемый результат</span>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
                <span className="font-medium text-slate-700">Ориентир для выбранного типа урока: </span>
                {LESSON_GOAL_SHORT_EXAMPLES[lessonType]}
              </p>
              <button
                type="button"
                disabled={!topic.trim() || goalSuggesting}
                onClick={handleSuggestGoal}
                className="mt-2 w-full rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900 shadow-sm hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {goalSuggesting ? "Запрос цели…" : "Предложить цель"}
              </button>
              <textarea
                ref={goalTextareaRef}
                rows={1}
                className="mt-2 min-h-[72px] w-full resize-none overflow-x-hidden rounded-lg border border-slate-200 px-2 py-2 text-sm leading-snug"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Напишите своими словами или воспользуйтесь кнопкой — подставим формулировку под тему и тип урока"
              />
              {goalError ? (
                <p
                  role="alert"
                  className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-950"
                >
                  {goalError}
                </p>
              ) : null}
            </div>

            <label className="block text-xs font-medium text-slate-600">
              Домашнее задание (необязательно)
              <textarea
                className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                placeholder="Если оставить пустым — в плане появится предложение от модели; если вставите свой текст — он попадёт в этап про ДЗ дословно"
              />
            </label>

            <details className="rounded-lg border border-slate-200 bg-slate-50/80">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700">
                Системный промпт: цель
              </summary>
              <div className="border-t border-slate-200 p-2">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                  Здесь задаёте тон и требования к формулировке цели. На сервер к этому тексту подмешивается фрагмент
                  методики (целеполагание) из <code className="rounded bg-slate-100 px-1">konstruktorUroka.md</code> —
                  как опора, не как дублирование всего файла.
                </p>
                <textarea
                  className="h-36 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-[11px] leading-snug"
                  value={goalSystemPrompt}
                  onChange={(e) => setGoalSystemPrompt(e.target.value)}
                />
                <button
                  type="button"
                  onClick={resetGoalSystemPrompt}
                  className="mt-2 text-xs text-teal-700 underline hover:text-teal-900"
                >
                  Сбросить к шаблону
                </button>
              </div>
            </details>

            <details className="rounded-lg border border-slate-200 bg-slate-50/80">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700">
                Системный промпт: план
              </summary>
              <div className="border-t border-slate-200 p-2">
                <p className="mb-2 text-[11px] leading-relaxed text-slate-600">
                  Здесь — роль модели, структура этапов и то, что должно быть в блоках «цель этапа», «действия учителя» и
                  т.д. Полный текст методики KONSTRUKTOR_UROKA подставляется на сервере автоматически; в поле ниже его
                  не нужно копировать.
                </p>
                <textarea
                  className="h-48 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-[11px] leading-snug"
                  value={planSystemPrompt}
                  onChange={(e) => setPlanSystemPrompt(e.target.value)}
                />
                <button
                  type="button"
                  onClick={resetPlanSystemPrompt}
                  className="mt-2 text-xs text-teal-700 underline hover:text-teal-900"
                >
                  Сбросить к шаблону
                </button>
              </div>
            </details>

            <button
              type="button"
              disabled={loading}
              onClick={handleGenerate}
              className="rounded-lg bg-teal-700 px-4 py-2.5 text-sm font-medium text-white shadow hover:bg-teal-800 disabled:opacity-60"
            >
              {loading ? "Генерация…" : "Сформировать план"}
            </button>

            {generateStep ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-2 text-xs text-sky-950"
              >
                <span
                  className="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-sky-600"
                  aria-hidden
                />
                <span>{generateStep}</span>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-900"
              >
                <p className="font-semibold">Ошибка генерации</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{error}</p>
              </div>
            ) : null}

            {generateSuccessInfo && !loading ? (
              <div
                role="status"
                className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-2 text-xs text-emerald-900"
              >
                <p className="font-semibold">Итог</p>
                <p className="mt-1">{generateSuccessInfo}</p>
              </div>
            ) : null}

            {editorDiagnosticsLine ? (
              <p className="rounded-md border border-slate-200 bg-slate-50 px-2 py-2 text-[11px] text-slate-700">
                <span className="font-medium">Сверка: </span>
                {editorDiagnosticsLine}
              </p>
            ) : null}

            {homework.trim() ? (
              <p className="rounded-md bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
                Указано домашнее задание учителя — модель должна встроить его дословно в этап «Информация о
                домашнем задании» (если этот этап включён в чеклист).
              </p>
            ) : null}

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-700">Минуты по этапам</h3>
              {timing.length === 0 ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Здесь появится сводка по этапам из сгенерированного плана (удобно сверить с выбранной длительностью).
                </p>
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
                      В черновике плана сумма минут была {timingRawSum} — в таблице ниже она приведена к {duration} мин,
                      чтобы совпадать с длительностью урока.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>

          {/* Column 2: шапка + редактор; прокрутка только у текста в PlanEditor */}
          <section className="order-2 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden xl:max-h-full">
            <div className="shrink-0 rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <h2 className="text-sm font-semibold text-slate-800">План урока (редактор)</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!hasPlan || exporting}
                    onClick={handleExportDocx}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {exporting ? "Word…" : "Скачать Word"}
                  </button>
                </div>
              </div>
              {(generateStep ||
                (generateSuccessInfo && !loading) ||
                error ||
                editorDiagnosticsLine) ? (
                <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] leading-snug text-slate-700">
                  {generateStep ? (
                    <p className="text-sky-900">
                      <span className="font-medium">Статус: </span>
                      {generateStep}
                    </p>
                  ) : null}
                  {error ? (
                    <p className="mt-1 text-red-800">
                      <span className="font-medium">Ошибка: </span>
                      {error}
                    </p>
                  ) : null}
                  {generateSuccessInfo && !loading ? (
                    <p className="mt-1 text-emerald-900">
                      <span className="font-medium">Итог: </span>
                      {generateSuccessInfo}
                    </p>
                  ) : null}
                  {editorDiagnosticsLine ? (
                    <p className="mt-1 text-slate-600">
                      <span className="font-medium">Сверка: </span>
                      {editorDiagnosticsLine}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex min-h-[240px] flex-1 flex-col overflow-hidden xl:min-h-0">
              <PlanEditor
                content={planHtml}
                contentKey={contentKey}
                onHtmlChange={onHtmlChange}
                onExternalLoad={handlePlanEditorLoad}
                disabled={loading}
              />
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
