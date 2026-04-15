"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/defaultSystemPrompt";
import {
  LESSON_STAGES,
  LESSON_TYPE_LABELS,
  type LessonTypeId,
} from "@/lib/lessonTypes";
import { extractTimingFromHtml, type StageTiming } from "@/lib/parseTiming";
import { DURATION_OPTIONS, GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/options";
import { prepareLessonPlanHtmlForEditor } from "@/lib/prepareEditorHtml";
import { PlanEditor } from "./PlanEditor";

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
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);

  const [planHtml, setPlanHtml] = useState("<p></p>");
  const [contentKey, setContentKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Текущий этап длинного запроса (пока loading). */
  const [generateStep, setGenerateStep] = useState<string | null>(null);
  /** Итог успешной генерации (после loading). */
  const [generateSuccessInfo, setGenerateSuccessInfo] = useState<string | null>(null);
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

  const timing: StageTiming[] = useMemo(() => {
    if (!planHtml || planHtml === "<p></p>") return [];
    return extractTimingFromHtml(planHtml);
  }, [planHtml]);

  const totalMinutes = useMemo(
    () => timing.reduce((s, x) => s + x.minutes, 0),
    [timing],
  );
  const durationMismatch =
    timing.length > 0 && totalMinutes > 0 && totalMinutes !== duration;

  const resetSystemPrompt = () => setSystemPrompt(DEFAULT_SYSTEM_PROMPT);

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
      const data = await postJson<{ html?: string; raw?: string }>("/api/generate", {
        systemPrompt,
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
          `После обработки план пустой. Проверьте модель и системный промпт.${hint}`,
        );
        setGenerateSuccessInfo(null);
      } else {
        setError(null);
        setGenerateSuccessInfo(
          `Успешно: план загружен в редактор (${textOnly.length.toLocaleString("ru-RU")} симв. текста).`,
        );
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
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <h1 className="text-lg font-semibold text-slate-900">Конструктор плана урока</h1>
        <p className="text-xs text-slate-600">
          Параметры и этапы слева, готовый план справа; экспорт в Word.
        </p>
      </header>

      <main className="mx-auto max-w-[1680px] px-3 py-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
          {/* Column 1: параметры + этапы + тайминг */}
          <section className="order-1 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
              <p className="mt-1 text-[11px] text-slate-600">
                По умолчанию включены все этапы. Снимите галочки с тех, что не должны попасть в план — модель
                учтёт только отмеченные.
              </p>
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
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

            <label className="block text-xs font-medium text-slate-600">
              Цель / ожидаемый результат
              <textarea
                className="mt-1 min-h-[72px] w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Сформулируйте результат урока"
              />
            </label>

            <label className="block text-xs font-medium text-slate-600">
              Домашнее задание (необязательно)
              <textarea
                className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                placeholder="Если пусто — модель предложит своё"
              />
            </label>

            <details className="rounded-lg border border-slate-200 bg-slate-50/80">
              <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-700">
                Системный промпт
              </summary>
              <div className="border-t border-slate-200 p-2">
                <textarea
                  className="h-48 w-full resize-y rounded-md border border-slate-200 bg-white px-2 py-2 font-mono text-[11px] leading-snug"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
                <button
                  type="button"
                  onClick={resetSystemPrompt}
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

            {homework.trim() ? (
              <p className="rounded-md bg-amber-50 px-2 py-2 text-[11px] text-amber-900">
                Указано домашнее задание учителя — модель должна встроить его дословно в этап «Информация о
                домашнем задании» (если этот этап включён в чеклист).
              </p>
            ) : null}

            <div className="border-t border-slate-100 pt-3">
              <h3 className="text-xs font-semibold text-slate-700">Тайминг по ответу</h3>
              {timing.length === 0 ? (
                <p className="mt-1 text-xs text-slate-500">
                  После генерации — этап и минуты из ответа модели.
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
                  <p className="mt-2 text-xs text-slate-600">
                    Итого:{" "}
                    <span className="font-semibold tabular-nums text-slate-900">{totalMinutes}</span> мин
                    (урок:{" "}
                    <span className="tabular-nums">{duration}</span> мин)
                  </p>
                  {durationMismatch ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-800">
                      Сумма минут не совпадает с длительностью урока — проверьте ответ модели или отредактируйте
                      план.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>

          {/* Column 2: редактор */}
          <section className="order-2 flex flex-col gap-3">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
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
              {(generateStep || (generateSuccessInfo && !loading) || error) ? (
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
                </div>
              ) : null}
            </div>

            <PlanEditor
              content={planHtml}
              contentKey={contentKey}
              onHtmlChange={onHtmlChange}
              disabled={loading}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
