"use client";

import { GRADE_OPTIONS, SUBJECT_OPTIONS } from "@/lib/options";

type Props = {
  query: string;
  onQueryChange: (v: string) => void;
  subject: string;
  onSubjectChange: (v: string) => void;
  grade: string;
  onGradeChange: (v: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  /** Подпись кнопки отправки. */
  submitLabel?: string;
};

export function MaterialsSearchForm({
  query,
  onQueryChange,
  subject,
  onSubjectChange,
  grade,
  onGradeChange,
  onSubmit,
  disabled,
  submitLabel = "Найти",
}: Props) {
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1 text-xs font-medium text-slate-600">
          Поиск
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Введите тему, класс, предмет или ключевые слова"
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            disabled={disabled}
            autoComplete="off"
          />
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="shrink-0 rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white shadow hover:bg-teal-800 disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="text-xs font-medium text-slate-600">
          Предмет
          <select
            value={subject}
            onChange={(e) => onSubjectChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
            disabled={disabled}
          >
            {SUBJECT_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-600">
          Класс
          <select
            value={grade}
            onChange={(e) => onGradeChange(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm"
            disabled={disabled}
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
