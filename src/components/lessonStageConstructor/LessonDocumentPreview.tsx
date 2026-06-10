"use client";

import { useEffect, useState } from "react";
import { structuredLessonToHtml, type StructuredLesson } from "@/lib/constructor/structuredLesson";

type Props = {
  lesson: StructuredLesson;
};

export function LessonDocumentPreview({ lesson }: Props) {
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    structuredLessonToHtml(lesson)
      .then((next) => {
        if (cancelled) return;
        setHtml(next);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lesson]);

  if (loading) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white text-sm text-slate-500">
        Готовлю предпросмотр документа…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Не удалось показать предпросмотр: {error}
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div
        className="ProseMirror max-w-none px-6 py-5 text-[15px] leading-relaxed text-slate-900"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
