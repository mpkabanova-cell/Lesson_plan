"use server";

import {
  generateLessonGoal,
  type GenerateLessonGoalInput,
  type GenerateLessonGoalResult,
} from "@/lib/generateLessonGoal";

export async function suggestLessonGoal(
  input: GenerateLessonGoalInput,
): Promise<GenerateLessonGoalResult> {
  return generateLessonGoal(input);
}
