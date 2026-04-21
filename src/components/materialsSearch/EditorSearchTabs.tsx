"use client";

export type WorkspaceTabId = "editor" | "search";

type Props = {
  active: WorkspaceTabId;
  onChange: (tab: WorkspaceTabId) => void;
};

export function EditorSearchTabs({ active, onChange }: Props) {
  const base =
    "rounded-md px-3 py-2 text-xs font-medium transition sm:text-sm min-h-[2.5rem] flex items-center justify-center";
  const activeCls = "bg-teal-700 text-white shadow-sm";
  const idleCls = "bg-slate-100 text-slate-700 hover:bg-slate-200";

  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-slate-50/90 p-0.5"
      role="tablist"
      aria-label="Режим правой колонки"
    >
      <button
        type="button"
        role="tab"
        aria-selected={active === "editor"}
        className={`${base} ${active === "editor" ? activeCls : idleCls}`}
        onClick={() => onChange("editor")}
      >
        Редактор урока
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={active === "search"}
        className={`${base} ${active === "search" ? activeCls : idleCls}`}
        onClick={() => onChange("search")}
      >
        Поиск материалов
      </button>
    </div>
  );
}
