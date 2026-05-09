export type LessonTypeId = "new_knowledge";

export const LESSON_TYPE_LABELS: Record<LessonTypeId, string> = {
  new_knowledge: "Урок открытия нового знания",
};

/** Этапы урока открытия нового знания (деятельностный подход). */
export const LESSON_STAGES: Record<LessonTypeId, string[]> = {
  new_knowledge: [
    "Мотивация к учебной деятельности",
    "Актуализация знаний и пробное действие",
    "Выявление места и причины затруднения",
    "Построение проекта выхода из затруднения",
    "Реализация построенного проекта",
    "Первичное закрепление с проговариванием",
    "Самостоятельная работа с проверкой по эталону",
    "Включение нового знания в систему знаний",
    "Домашнее задание",
    "Рефлексия учебной деятельности",
  ],
};

export function lessonTypeForPrompt(id: LessonTypeId): string {
  return LESSON_TYPE_LABELS[id];
}
