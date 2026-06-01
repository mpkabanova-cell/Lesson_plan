export const subjectClassMap = {
  "Русский язык": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "Литературное чтение": [1, 2, 3, 4],
  "Литература": [5, 6, 7, 8, 9, 10, 11],
  Математика: [1, 2, 3, 4, 5, 6],
  Алгебра: [7, 8, 9, 10, 11],
  Геометрия: [7, 8, 9, 10, 11],
  Информатика: [5, 6, 7, 8, 9, 10, 11],
  История: [5, 6, 7, 8, 9, 10, 11],
  Обществознание: [9, 10, 11],
  География: [5, 6, 7, 8, 9, 10, 11],
  Биология: [5, 6, 7, 8, 9, 10, 11],
  Физика: [7, 8, 9, 10, 11],
  Химия: [8, 9, 10, 11],
  "Окружающий мир": [1, 2, 3, 4],
  "Иностранный язык": [2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const;

export type SubjectName = keyof typeof subjectClassMap;

export const SUBJECT_OPTIONS = Object.keys(subjectClassMap) as SubjectName[];

export function getAvailableGrades(subject: string): string[] {
  const grades = subjectClassMap[subject as SubjectName];
  return grades ? grades.map(String) : [];
}

export function isSubjectGradeCompatible(subject: string, grade: string): boolean {
  return getAvailableGrades(subject).includes(grade);
}

export function firstAvailableGrade(subject: string): string {
  return getAvailableGrades(subject)[0] ?? "";
}

export function formatGradeRange(subject: string): string {
  const grades = getAvailableGrades(subject).map(Number).filter(Number.isFinite);
  if (grades.length === 0) return "";

  const min = Math.min(...grades);
  const max = Math.max(...grades);
  return min === max ? `${min} класс` : `${min}–${max} классы`;
}
