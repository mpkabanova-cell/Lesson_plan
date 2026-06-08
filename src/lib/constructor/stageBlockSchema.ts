/** Метки обязательных полей методического блока этапа (v3). */
export const STAGE_BLOCK_LABELS = {
  goal: "Цель:",
  technique: "Методический приём:",
  teacherSpeech: "Речь учителя:",
  studentAnswers: "Предполагаемые ответы учеников:",
  students: "Ученики:",
  expectedResult: "Ожидаемый результат:",
  comment: "Методический комментарий:",
} as const;

export type StageMethodologicalBlock = {
  goal: string;
  technique: string;
  teacherSpeech: string;
  studentAnswers: string;
  students: string;
  expectedResult: string;
  comment: string;
};

/** Этапы, где обязателен блок «Предполагаемые ответы учеников». */
export const STAGES_REQUIRING_STUDENT_ANSWERS = new Set([
  "problem_situation_goal",
  "knowledge_activation",
  "primary_acquisition",
  "reflection",
]);

/** Шаблонные фразы вместо готовой речи учителя. */
export const GENERIC_TEACHER_PHRASES = [
  "организует обсуждение",
  "объясняет тему",
  "направляет работу",
  "контролирует выполнение",
  "проводит опрос",
  "даёт инструкции без конкретики",
];

export const MIN_TEACHER_SPEECH_QUOTED_CHARS = 40;
export const MIN_EXPECTED_RESULT_CHARS = 20;
export const MIN_STUDENT_ANSWER_BULLETS = 2;

export function orderedBlockFieldKeys(): Array<keyof typeof STAGE_BLOCK_LABELS> {
  return [
    "goal",
    "technique",
    "teacherSpeech",
    "studentAnswers",
    "students",
    "expectedResult",
    "comment",
  ];
}
