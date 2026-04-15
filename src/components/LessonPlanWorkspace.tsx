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
import { PlanEditor } from "./PlanEditor";

function buildExportTitle(subject: string, grade: string, topic: string): string {
  const t = topic.trim() || "План урока";
  return `${subject} — ${grade} класс — ${t}`.slice(0, 180);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      const parts = [j.error, j.detail].filter(
        (s): s is string => typeof s === "string" && s.length > 0,
      );
      msg = parts.length > 0 ? parts.join(" — ") : msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
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
    const selectedStages = stages.filter((_, i) => effectiveStageFlags[i]);
    if (selectedStages.length === 0) {
      setError("Отметьте хотя бы один этап в структуре урока.");
      return;
    }
    setLoading(true);
    try {
      const data = await postJson<{ html: string; raw?: string }>("/api/generate", {
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
      const textOnly = data.html.replace(/<[^>]+>/g, "").trim();
      if (!textOnly) {
        const hint = data.raw?.trim()
          ? ` Фрагмент ответа: ${data.raw.slice(0, 400)}${data.raw.length > 400 ? "…" : ""}`
          : "";
        setError(
          `После обработки план пустой. Проверьте модель и системный промпт.${hint}`,
        );
      }
      setPlanHtml(data.html || "<p></p>");
      setContentKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setLoading(false);
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

            {error ? (
              <p className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-xs text-red-800">
                {error}
              </p>
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
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
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
