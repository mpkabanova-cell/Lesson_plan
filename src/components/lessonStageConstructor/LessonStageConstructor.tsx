"use client";

import { useMemo, useState } from "react";
import {
  getTechniquePickerOptions,
  getTechniqueByName,
  isTechniqueSuitableForStage,
  type StageTechnique,
} from "@/lib/constructor/stageTechniques";
import {
  type StageFieldKey,
  type StageMethod,
  type StructuredLesson,
  type StructuredLessonStage,
  updateStructuredStageField,
  validateStructuredStage,
} from "@/lib/constructor/structuredLesson";

type ApplyMode = "name-only" | "rebuild-stage";
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

  const updateStage = (stageIndex: number, updater: (stage: StructuredLessonStage) => StructuredLessonStage) => {
    onChange({
      ...lesson,
      stages: lesson.stages.map((stage, index) => (index === stageIndex ? updater(stage) : stage)),
    });
  };

  const regenerateField = async (stageIndex: number, field: StageFieldKey, mode: "improve" | "regenerate") => {
    const key = `${stageIndex}:${field}:${mode}`;
    setBusyKey(key);
    onError?.(null);
    try {
      const data = await postJson<{ value: string }>("/api/construct/field", {
        ...buildContext(lesson, stageIndex, sessionId),
        mode,
        field,
      });
      updateStage(stageIndex, (stage) => updateStructuredStageField(stage, field, data.value));
      onToast?.(mode === "improve" ? "Поле улучшено" : "Поле перегенерировано");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const improveStage = async (stageIndex: number) => {
    const key = `${stageIndex}:stage:improve`;
    setBusyKey(key);
    onError?.(null);
    try {
      const data = await postJson<{ fields: StagePatch }>("/api/construct/field", {
        ...buildContext(lesson, stageIndex, sessionId),
        mode: "improve-stage",
      });
      updateStage(stageIndex, (stage) => stageWithPatch(stage, data.fields ?? {}));
      onToast?.("Этап улучшен");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  const applyTechnique = async (stageIndex: number, technique: StageTechnique, mode: ApplyMode) => {
    const method = methodFromTechnique(technique);
    setPickerStageIndex(null);
    updateStage(stageIndex, (stage) => ({ ...stage, method }));
    if (mode === "name-only") {
      onToast?.("Приём добавлен");
      return;
    }

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
      onToast?.("Приём применён к этапу");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3 text-sm text-violet-950">
        <p className="font-semibold">Конструктор этапов</p>
        <p className="mt-1 text-xs leading-relaxed">
          Урок хранится как набор редактируемых блоков. Можно менять одно поле, приём или этап без перегенерации всего плана.
        </p>
      </div>
      <div className="space-y-4">
        {lesson.stages.map((stage, index) => (
          <StageCard
            key={stage.id}
            stage={stage}
            index={index}
            busyKey={busyKey}
            onImproveStage={() => improveStage(index)}
            onOpenTechniquePicker={() => setPickerStageIndex(index)}
            onChangeField={(field, value) =>
              updateStage(index, (current) => updateStructuredStageField(current, field, value))
            }
            onFixField={(field) => regenerateField(index, field, "regenerate")}
            onImproveField={(field) => regenerateField(index, field, "improve")}
            onRegenerateField={(field) => regenerateField(index, field, "regenerate")}
          />
        ))}
      </div>
      {pickerStageIndex !== null ? (
        <TechniquePickerPanel
          stage={lesson.stages[pickerStageIndex]}
          onClose={() => setPickerStageIndex(null)}
          onApply={(technique, mode) => applyTechnique(pickerStageIndex, technique, mode)}
        />
      ) : null}
    </div>
  );
}

function StageCard({
  stage,
  index,
  busyKey,
  onImproveStage,
  onOpenTechniquePicker,
  onChangeField,
  onFixField,
  onImproveField,
  onRegenerateField,
}: {
  stage: StructuredLessonStage;
  index: number;
  busyKey: string | null;
  onImproveStage: () => void;
  onOpenTechniquePicker: () => void;
  onChangeField: (field: StageFieldKey, value: string) => void;
  onFixField: (field: StageFieldKey) => void;
  onImproveField: (field: StageFieldKey) => void;
  onRegenerateField: (field: StageFieldKey) => void;
}) {
  const validation = useMemo(() => validateStructuredStage(stage), [stage]);
  const issuesByField = useMemo(() => {
    const map = new Map<string, string[]>();
    validation.issues.forEach((issue) => {
      map.set(issue.field, [...(map.get(issue.field) ?? []), issue.message]);
    });
    return map;
  }, [validation]);

  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-violet-500">
            Этап {index + 1}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-slate-950">{stage.title}</h3>
          <p className="mt-1 text-xs font-medium text-slate-500">Время: {stage.time}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!validation.ok ? (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-100">
              Есть замечания: {validation.issues.length}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-100">
              Этап заполнен
            </span>
          )}
          <button
            type="button"
            onClick={onImproveStage}
            disabled={busyKey === `${index}:stage:improve`}
            className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
          >
            {busyKey === `${index}:stage:improve` ? "Улучшаю…" : "✨ Улучшить этап"}
          </button>
        </div>
      </div>

      <StageMethodBlock
        stage={stage}
        issueMessages={issuesByField.get("method") ?? []}
        busy={busyKey === `${index}:method:apply`}
        onOpenPicker={onOpenTechniquePicker}
      />

      <div className="mt-4 grid gap-3">
        {FIELD_META.map((meta) => (
          <StageEditableField
            key={meta.key}
            label={meta.label}
            value={stage[meta.key]}
            minRows={meta.minRows}
            issueMessages={issuesByField.get(meta.key) ?? []}
            busyImprove={busyKey === `${index}:${meta.key}:improve`}
            busyRegenerate={busyKey === `${index}:${meta.key}:regenerate`}
            onChange={(value) => onChangeField(meta.key, value)}
            onFix={() => onFixField(meta.key)}
            onImprove={() => onImproveField(meta.key)}
            onRegenerate={() => onRegenerateField(meta.key)}
          />
        ))}
      </div>
    </article>
  );
}

function StageMethodBlock({
  stage,
  issueMessages,
  busy,
  onOpenPicker,
}: {
  stage: StructuredLessonStage;
  issueMessages: string[];
  busy: boolean;
  onOpenPicker: () => void;
}) {
  return (
    <section className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/60 p-3">
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
            {stage.method ? "🔄 Заменить приём" : "➕ Добавить приём"}
          </button>
          {stage.method ? (
            <button
              type="button"
              onClick={onOpenPicker}
              disabled={busy}
              className="rounded-full bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {busy ? "Применяю…" : "✨ Применить к этапу"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function StageEditableField({
  label,
  value,
  minRows = 3,
  issueMessages,
  busyImprove,
  busyRegenerate,
  onChange,
  onFix,
  onImprove,
  onRegenerate,
}: {
  label: string;
  value: string;
  minRows?: number;
  issueMessages: string[];
  busyImprove: boolean;
  busyRegenerate: boolean;
  onChange: (value: string) => void;
  onFix: () => void;
  onImprove: () => void;
  onRegenerate: () => void;
}) {
  return (
    <label className="group block rounded-2xl border border-slate-200 bg-slate-50/70 p-3 transition focus-within:border-violet-200 focus-within:bg-white">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
        <div className="flex flex-wrap gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            type="button"
            onClick={onImprove}
            disabled={busyImprove || busyRegenerate}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-800 ring-1 ring-violet-100 hover:bg-violet-50 disabled:opacity-50"
          >
            {busyImprove ? "Улучшаю…" : "✨ Улучшить"}
          </button>
          <button
            type="button"
            onClick={onRegenerate}
            disabled={busyImprove || busyRegenerate}
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 ring-1 ring-teal-100 hover:bg-teal-50 disabled:opacity-50"
          >
            {busyRegenerate ? "Генерирую…" : "🔄 Перегенерировать"}
          </button>
          <button
            type="button"
            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            title="Дополнительно"
          >
            ⋮ Дополнительно
          </button>
        </div>
      </div>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={minRows}
        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 shadow-inner outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
      />
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

function TechniquePickerPanel({
  stage,
  onClose,
  onApply,
}: {
  stage: StructuredLessonStage;
  onClose: () => void;
  onApply: (technique: StageTechnique, mode: ApplyMode) => void;
}) {
  const options = useMemo(() => getTechniquePickerOptions(stage.id), [stage.id]);
  const current = stage.method ? getTechniqueByName(stage.method.name) : undefined;
  const [selectedId, setSelectedId] = useState(current?.id ?? options.suitable[0]?.id ?? "");
  const [mode, setMode] = useState<ApplyMode>("name-only");
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
          <fieldset className="space-y-2 text-sm text-slate-700">
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Как применить приём?
            </legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "name-only"}
                onChange={() => setMode("name-only")}
              />
              Только добавить название приёма
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={mode === "rebuild-stage"}
                onChange={() => setMode("rebuild-stage")}
              />
              Перестроить этот этап под выбранный приём
            </label>
          </fieldset>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && onApply(selected, mode)}
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
