"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  trackLpcStageFieldRegenerate,
  trackLpcStageRegenerate,
  trackLpcTechniqueApply,
} from "@/lib/analytics/lpcEvents";
import { getStageDefinition } from "@/lib/constructor/stageRegistry";
import {
  getTechniquePickerOptions,
  getTechniqueByName,
  isTechniqueSuitableForStage,
  type StageTechnique,
} from "@/lib/constructor/stageTechniques";
import type { LessonTypeId } from "@/lib/constructor/stageRegistry";
import {
  type StageFieldKey,
  type StageMethod,
  type StructuredLesson,
  type StructuredLessonStage,
  type StructuredStageIssue,
  updateStructuredStageField,
  validateStructuredStage,
} from "@/lib/constructor/structuredLesson";

type FieldRegenerateTarget = {
  stageIndex: number;
  field: StageFieldKey;
};
type StagePatch = Partial<
  Pick<
    StructuredLessonStage,
    | "teacherSpeech"
    | "studentActions"
    | "expectedAnswers"
    | "task"
    | "answer"
    | "result"
    | "teacherComment"
  >
>;

type Props = {
  lesson: StructuredLesson;
  sessionId?: string | null;
  onChange: (lesson: StructuredLesson) => void;
  onToast?: (message: string) => void;
  onError?: (message: string | null) => void;
};

function AutoResizeTextarea({
  value,
  onChange,
  minRows,
}: {
  value: string;
  onChange: (value: string) => void;
  minRows: number;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, minRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={minRows}
      className="max-h-[32rem] w-full resize-y overflow-y-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-inner outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
    />
  );
}

const FIELD_META: Array<{ key: StageFieldKey; label: string; minRows?: number }> = [
  { key: "goal", label: "Цель этапа", minRows: 2 },
  { key: "teacherSpeech", label: "Речь учителя", minRows: 4 },
  { key: "studentActions", label: "Действия учеников", minRows: 3 },
  { key: "expectedAnswers", label: "Предполагаемые ответы", minRows: 3 },
  { key: "task", label: "Задание / материал", minRows: 4 },
  { key: "answer", label: "Ответ / ключ", minRows: 3 },
  { key: "result", label: "Ожидаемый результат", minRows: 2 },
  { key: "teacherComment", label: "Комментарий учителю", minRows: 2 },
];

function methodFromTechnique(technique: StageTechnique): StageMethod {
  return {
    id: technique.id,
    name: technique.name,
    description: technique.description,
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data: { error?: string } & Partial<T> = {};
  try {
    data = text.trim() ? (JSON.parse(text) as typeof data) : {};
  } catch {
    throw new Error(`Сервер вернул некорректный ответ: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(data.error || `Ошибка запроса: HTTP ${res.status}`);
  }
  return data as T;
}

function buildContext(
  lesson: StructuredLesson,
  stageIndex: number,
  sessionId?: string | null,
) {
  const previous = stageIndex > 0 ? lesson.stages[stageIndex - 1] : null;
  const next = stageIndex < lesson.stages.length - 1 ? lesson.stages[stageIndex + 1] : null;
  return {
    sessionId,
    lesson: {
      subject: lesson.subject,
      grade: lesson.grade,
      topic: lesson.topic,
      goal: lesson.goal,
      lessonType: lesson.lessonType,
      durationMinutes: lesson.durationMinutes,
    },
    stage: lesson.stages[stageIndex],
    previousStageSummary: previous
      ? `${previous.title}: ${previous.result || previous.goal || previous.task}`.slice(0, 500)
      : undefined,
    nextStageSummary: next
      ? `${next.title}: ${next.goal || next.task || next.result}`.slice(0, 500)
      : undefined,
  };
}

function stageWithPatch(stage: StructuredLessonStage, patch: StagePatch): StructuredLessonStage {
  return { ...stage, ...patch };
}

export function LessonStageConstructor({ lesson, sessionId, onChange, onToast, onError }: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [pickerStageIndex, setPickerStageIndex] = useState<number | null>(null);
  const [regenerateStageIndex, setRegenerateStageIndex] = useState<number | null>(null);
  const [regenerateFieldTarget, setRegenerateFieldTarget] = useState<FieldRegenerateTarget | null>(null);

  const updateStage = (stageIndex: number, updater: (stage: StructuredLessonStage) => StructuredLessonStage) => {
    onChange({
      ...lesson,
      stages: lesson.stages.map((stage, index) => (index === stageIndex ? updater(stage) : stage)),
    });
  };

  const regenerateField = async (
    stageIndex: number,
    field: StageFieldKey,
    mode: "improve" | "regenerate",
    userInstructions?: string,
  ) => {
    const key = `${stageIndex}:${field}:${mode}`;
    setBusyKey(key);
    onError?.(null);
    try {
      const data = await postJson<{ value: string }>("/api/construct/field", {
        ...buildContext(lesson, stageIndex, sessionId),
        mode,
        field,
        userInstructions: userInstructions?.trim() || undefined,
      });
      const currentValue = lesson.stages[stageIndex]?.[field] ?? "";
      updateStage(stageIndex, (stage) => updateStructuredStageField(stage, field, data.value));
      trackLpcStageFieldRegenerate({
        stageId: lesson.stages[stageIndex]?.id ?? `stage_${stageIndex}`,
        field,
        mode,
      });
      setRegenerateFieldTarget(null);
      if (data.value.trim() === currentValue.trim()) {
        onToast?.("Модель вернула тот же текст. Уточните пожелание к изменению.");
      } else {
        onToast?.(mode === "improve" ? "Поле исправлено" : "Поле перегенерировано");
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const regenerateStage = async (stageIndex: number, userInstructions: string) => {
    const stage = lesson.stages[stageIndex];
    if (!stage.method) return;

    const key = `${stageIndex}:method:apply`;
    setBusyKey(key);
    onError?.(null);
    try {
      const data = await postJson<{ fields: StagePatch }>("/api/construct/field", {
        ...buildContext(lesson, stageIndex, sessionId),
        mode: "apply-method",
        method: stage.method,
        userInstructions: userInstructions.trim() || undefined,
      });
      updateStage(stageIndex, (current) => stageWithPatch(current, data.fields ?? {}));
      trackLpcStageRegenerate({
        stageId: stage.id,
        stageIndex,
      });
      setRegenerateStageIndex(null);
      onToast?.("Этап перегенерирован");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const applyTechnique = async (stageIndex: number, technique: StageTechnique) => {
    const method = methodFromTechnique(technique);
    setPickerStageIndex(null);
    updateStage(stageIndex, (stage) => ({ ...stage, method }));

    const key = `${stageIndex}:method:apply`;
    setBusyKey(key);
    onError?.(null);
    try {
      const data = await postJson<{ fields: StagePatch }>("/api/construct/field", {
        ...buildContext(
          {
            ...lesson,
            stages: lesson.stages.map((stage, index) =>
              index === stageIndex ? { ...stage, method } : stage,
            ),
          },
          stageIndex,
          sessionId,
        ),
        mode: "apply-method",
        method,
      });
      updateStage(stageIndex, (stage) => stageWithPatch({ ...stage, method }, data.fields ?? {}));
      trackLpcTechniqueApply({
        stageId: lesson.stages[stageIndex]?.id ?? `stage_${stageIndex}`,
        techniqueId: technique.id,
        techniqueName: technique.name,
      });
      onToast?.("Приём применён к этапу");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
      <div className="space-y-4">
        {lesson.stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            stage={stage}
            index={index}
            lessonType={lesson.lessonType}
            busyKey={busyKey}
            onOpenTechniquePicker={() => setPickerStageIndex(index)}
            onOpenRegenerate={() => setRegenerateStageIndex(index)}
            onChangeField={(field, value) =>
              updateStage(index, (current) => updateStructuredStageField(current, field, value))
            }
            onFixField={(field, messages) =>
              regenerateField(index, field, "improve", `Исправь поле по замечаниям: ${messages.join("; ")}`)
            }
            onRegenerateField={(field) => setRegenerateFieldTarget({ stageIndex: index, field })}
          />
        ))}
      </div>
      {pickerStageIndex !== null ? (
        <TechniquePickerPanel
          stage={lesson.stages[pickerStageIndex]}
          onClose={() => setPickerStageIndex(null)}
          onApply={(technique) => applyTechnique(pickerStageIndex, technique)}
        />
      ) : null}
      {regenerateStageIndex !== null ? (
        <RegenerateStageModal
          stage={lesson.stages[regenerateStageIndex]}
          busy={busyKey === `${regenerateStageIndex}:method:apply`}
          onClose={() => setRegenerateStageIndex(null)}
          onSubmit={(instructions) => regenerateStage(regenerateStageIndex, instructions)}
        />
      ) : null}
      {regenerateFieldTarget !== null ? (
        <RegenerateFieldModal
          label={FIELD_META.find((meta) => meta.key === regenerateFieldTarget.field)?.label ?? "Поле"}
          value={lesson.stages[regenerateFieldTarget.stageIndex]?.[regenerateFieldTarget.field] ?? ""}
          busy={busyKey === `${regenerateFieldTarget.stageIndex}:${regenerateFieldTarget.field}:regenerate`}
          onClose={() => setRegenerateFieldTarget(null)}
          onSubmit={(instructions) =>
            regenerateField(
              regenerateFieldTarget.stageIndex,
              regenerateFieldTarget.field,
              "regenerate",
              instructions,
            )
          }
        />
      ) : null}
    </div>
  );
}

function scrollToStageSection(stageIndex: number, field: StructuredStageIssue["field"]) {
  const id = field === "method" ? `stage-${stageIndex}-method` : `stage-${stageIndex}-field-${field}`;
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function StageCard({
  stage,
  index,
  lessonType,
  busyKey,
  onOpenTechniquePicker,
  onOpenRegenerate,
  onChangeField,
  onFixField,
  onRegenerateField,
}: {
  stage: StructuredLessonStage;
  index: number;
  lessonType: LessonTypeId;
  busyKey: string | null;
  onOpenTechniquePicker: () => void;
  onOpenRegenerate: () => void;
  onChangeField: (field: StageFieldKey, value: string) => void;
  onFixField: (field: StageFieldKey, issueMessages: string[]) => void;
  onRegenerateField: (field: StageFieldKey) => void;
}) {
  const validation = useMemo(() => validateStructuredStage(stage, lessonType), [stage, lessonType]);
  const visibleFields = useMemo(() => {
    const templateOnly = getStageDefinition(lessonType, stage.id)?.templateOnly === true;
    if (!templateOnly) return FIELD_META;
    return FIELD_META.filter((meta) => meta.key !== "task" && meta.key !== "answer");
  }, [lessonType, stage.id]);
  const displayTitle = useMemo(
    () => getStageDefinition(lessonType, stage.id)?.title ?? stage.title,
    [lessonType, stage.id, stage.title],
  );
  const issuesByField = useMemo(() => {
    const map = new Map<string, string[]>();
    validation.issues.forEach((issue) => {
      map.set(issue.field, [...(map.get(issue.field) ?? []), issue.message]);
    });
    return map;
  }, [validation]);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="border-b border-slate-100 pb-3">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-500">
          Этап {index + 1}
        </p>
        <h3 className="mt-1 text-lg font-semibold text-slate-950">{displayTitle}</h3>
        <p className="mt-1 text-xs font-medium text-slate-500">Время: {stage.time}</p>
      </div>

      {!validation.ok ? (
        <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2.5">
          <p className="text-xs font-semibold text-amber-950">
            Что нужно исправить ({validation.issues.length}):
          </p>
          <ul className="mt-1.5 space-y-1">
            {validation.issues.map((issue) => (
              <li key={`${issue.field}:${issue.message}`}>
                <button
                  type="button"
                  onClick={() => scrollToStageSection(index, issue.field)}
                  className="text-left text-xs leading-relaxed text-amber-900 underline decoration-amber-300 underline-offset-2 hover:text-amber-950"
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <StageMethodBlock
        stage={stage}
        sectionId={`stage-${index}-method`}
        issueMessages={issuesByField.get("method") ?? []}
        busy={busyKey === `${index}:method:apply`}
        onOpenPicker={onOpenTechniquePicker}
        onRegenerate={onOpenRegenerate}
      />

      <div className="mt-4 grid gap-3">
        {visibleFields.map((meta) => (
          <StageEditableField
            key={meta.key}
            sectionId={`stage-${index}-field-${meta.key}`}
            label={meta.label}
            value={stage[meta.key]}
            minRows={meta.minRows}
            issueMessages={issuesByField.get(meta.key) ?? []}
            busyImprove={busyKey === `${index}:${meta.key}:improve`}
            busyRegenerate={busyKey === `${index}:${meta.key}:regenerate`}
            onChange={(value) => onChangeField(meta.key, value)}
            onFix={() => onFixField(meta.key, issuesByField.get(meta.key) ?? [])}
            onRegenerate={() => onRegenerateField(meta.key)}
          />
        ))}
      </div>
    </article>
  );
}

function StageMethodBlock({
  stage,
  sectionId,
  issueMessages,
  busy,
  onOpenPicker,
  onRegenerate,
}: {
  stage: StructuredLessonStage;
  sectionId: string;
  issueMessages: string[];
  busy: boolean;
  onOpenPicker: () => void;
  onRegenerate: () => void;
}) {
  return (
    <section id={sectionId} className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">
            Методический приём
          </p>
          {stage.method ? (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-950">{stage.method.name}</p>
              {stage.method.description ? (
                <p className="mt-1 text-xs leading-relaxed text-slate-600">{stage.method.description}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Методический приём не выбран</p>
          )}
          {issueMessages.map((message) => (
            <p key={message} className="mt-1 text-xs font-medium text-amber-800">
              {message}
            </p>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenPicker}
            disabled={busy}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 ring-1 ring-violet-100 hover:bg-violet-100 disabled:opacity-60"
          >
            {stage.method ? "🎲 Заменить приём" : "➕ Добавить приём"}
          </button>
          {stage.method ? (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={busy}
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? "Генерирую…" : "🔄 Перегенерировать"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StageEditableField({
  sectionId,
  label,
  value,
  minRows = 3,
  issueMessages,
  busyImprove,
  busyRegenerate,
  onChange,
  onFix,
  onRegenerate,
}: {
  sectionId: string;
  label: string;
  value: string;
  minRows?: number;
  issueMessages: string[];
  busyImprove: boolean;
  busyRegenerate: boolean;
  onChange: (value: string) => void;
  onFix: () => void;
  onRegenerate: () => void;
}) {
  return (
    <label
      id={sectionId}
      className="group block scroll-mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition focus-within:border-violet-200 focus-within:bg-white"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <div className="flex flex-wrap gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busyImprove || busyRegenerate}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-teal-100 hover:bg-teal-50 disabled:opacity-50"
          >
            {busyRegenerate ? "Генерирую…" : "🔄 Перегенерировать"}
          </button>
        </div>
      </div>
      <AutoResizeTextarea value={value} onChange={onChange} minRows={minRows} />
      {issueMessages.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {issueMessages.map((message) => (
            <span key={message} className="text-xs font-medium text-amber-800">
              {message}
            </span>
          ))}
          <button
            type="button"
            onClick={onFix}
            disabled={busyRegenerate}
            className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-100 hover:bg-amber-100 disabled:opacity-50"
          >
            Исправить
          </button>
        </div>
      ) : null}
    </label>
  );
}

function RegenerateStageModal({
  stage,
  busy,
  onClose,
  onSubmit,
}: {
  stage: StructuredLessonStage;
  busy: boolean;
  onClose: () => void;
  onSubmit: (instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regenerate-stage-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">
              Перегенерировать этап
            </p>
            <h3 id="regenerate-stage-title" className="mt-1 text-lg font-semibold text-slate-950">
              {stage.title}
            </h3>
            {stage.method ? (
              <p className="mt-1 text-xs text-slate-600">
                Приём: <span className="font-medium text-slate-800">{stage.method.name}</span>
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Закрыть
          </button>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-800">Пожелания к изменениям</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Опишите, что нужно изменить: тон, акценты, примеры, длина речи и т.д. Поле можно оставить пустым.
          </span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={5}
            autoFocus
            placeholder="Например: сделать речь короче, добавить вопрос к классу, использовать пример из жизни…"
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-inner outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onSubmit(instructions)}
            disabled={busy}
            className="rounded-full bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
          >
            {busy ? "Генерирую…" : "Перегенерировать"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegenerateFieldModal({
  label,
  value,
  busy,
  onClose,
  onSubmit,
}: {
  label: string;
  value: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (instructions: string) => void;
}) {
  const [instructions, setInstructions] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="regenerate-field-title"
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-600">
              Перегенерировать поле
            </p>
            <h3 id="regenerate-field-title" className="mt-1 text-lg font-semibold text-slate-950">
              {label}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Закрыть
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Сейчас</p>
          <p className="mt-1 max-h-32 overflow-y-auto text-sm leading-relaxed text-slate-700">
            {value || "Поле пустое"}
          </p>
        </div>

        <label className="mt-4 block">
          <span className="text-sm font-medium text-slate-800">Что изменить?</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Например: сделать конкретнее, добавить действия учеников, убрать общие слова, привязать к заданию.
          </span>
          <textarea
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={5}
            autoFocus
            placeholder="Например: заменить общую фразу на конкретные действия учеников с тетрадью и чертежом…"
            className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-inner outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-full px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onSubmit(instructions)}
            disabled={busy}
            className="rounded-full bg-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? "Генерирую…" : "Перегенерировать поле"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TechniquePickerPanel({
  stage,
  onClose,
  onApply,
}: {
  stage: StructuredLessonStage;
  onClose: () => void;
  onApply: (technique: StageTechnique) => void;
}) {
  const options = useMemo(() => getTechniquePickerOptions(stage.id), [stage.id]);
  const current = stage.method ? getTechniqueByName(stage.method.name) : undefined;
  const [selectedId, setSelectedId] = useState(current?.id ?? options.suitable[0]?.id ?? "");
  const all = [...options.suitable, ...options.other];
  const selected = all.find((technique) => technique.id === selectedId) ?? options.suitable[0] ?? all[0];
  const suitable = selected ? isTechniqueSuitableForStage(stage.id, selected.id) : true;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-500">
                Методический приём
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">{stage.title}</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Закрыть
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <TechniqueList
            title="Подходящие приёмы для этапа"
            techniques={options.suitable}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          {options.other.length > 0 ? (
            <TechniqueList
              title="Другие приёмы"
              techniques={options.other}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : null}
        </div>

        <div className="border-t border-slate-200 px-5 py-4">
          {!suitable ? (
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-100">
              Этот приём обычно не используется на данном этапе. Вы всё равно можете его применить.
            </p>
          ) : null}
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onApply(selected)}
            className="mt-4 w-full rounded-2xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            Применить
          </button>
        </div>
      </div>
    </div>
  );
}

function TechniqueList({
  title,
  techniques,
  selectedId,
  onSelect,
}: {
  title: string;
  techniques: StageTechnique[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mb-5">
      <h4 className="mb-2 text-sm font-semibold text-slate-900">{title}</h4>
      <div className="space-y-2">
        {techniques.map((technique) => (
          <button
            key={technique.id}
            type="button"
            onClick={() => onSelect(technique.id)}
            className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
              selectedId === technique.id
                ? "border-violet-300 bg-violet-50"
                : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/50"
            }`}
          >
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-sm font-semibold text-violet-700">
                {selectedId === technique.id ? "✓" : "○"}
              </span>
              <span>
                <span className="block text-sm font-semibold text-slate-950">{technique.name}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-600">
                  {technique.description}
                </span>
                {technique.example ? (
                  <span className="mt-1 block text-xs italic text-slate-500">Пример: {technique.example}</span>
                ) : null}
              </span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
