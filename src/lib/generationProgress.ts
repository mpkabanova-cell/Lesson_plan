/** Оценка длительности генерации (мс) для v2: планировщик + сценарий + валидация на сервере. */
export const GENERATION_ESTIMATE_MS_V2 = 165_000;
export const GENERATION_ESTIMATE_MS_V1 = 95_000;

export type GenerationProgressStep = {
  id: string;
  shortLabel: string;
  /** Доля общего времени (сумма ≈ 1). */
  weight: number;
};

export const GENERATION_STEPS_V2: GenerationProgressStep[] = [
  { id: "send", shortLabel: "Запрос", weight: 0.03 },
  { id: "planner", shortLabel: "Каркас", weight: 0.28 },
  { id: "writer", shortLabel: "Сценарий", weight: 0.4 },
  { id: "validate", shortLabel: "Проверка", weight: 0.2 },
  { id: "process", shortLabel: "Редактор", weight: 0.09 },
];

export const GENERATION_STEPS_V1: GenerationProgressStep[] = [
  { id: "send", shortLabel: "Запрос", weight: 0.05 },
  { id: "writer", shortLabel: "Сценарий", weight: 0.82 },
  { id: "process", shortLabel: "Редактор", weight: 0.13 },
];

export type GenerationProgressMode = "v2" | "v1";

export type GenerationProgressState = {
  percent: number;
  label: string;
  etaLabel: string;
  steps: GenerationProgressStep[];
  activeStepIndex: number;
};

function stepLabelForRemotePhase(
  mode: GenerationProgressMode,
  elapsedMs: number,
  externalStep: string | null,
): { label: string; activeStepIndex: number } {
  if (externalStep?.includes("Обработка ответа") || externalStep?.includes("редактор")) {
    return { label: "Загрузка плана в редактор…", activeStepIndex: mode === "v2" ? 4 : 2 };
  }
  if (externalStep?.includes("Проверка содержательности")) {
    return { label: "Проверка содержательности сценария…", activeStepIndex: mode === "v2" ? 3 : 2 };
  }
  if (externalStep?.includes("версия 1") || externalStep?.includes("один шаг")) {
    if (elapsedMs < 12_000) {
      return { label: "Генерация сценария урока…", activeStepIndex: 1 };
    }
    return { label: "Модель пишет сценарий…", activeStepIndex: 1 };
  }
  if (mode === "v1") {
    return { label: "Генерация сценария урока…", activeStepIndex: 1 };
  }

  if (elapsedMs < 8_000) {
    return { label: "Отправка запроса на сервер…", activeStepIndex: 0 };
  }
  if (elapsedMs < 52_000) {
    return { label: "Проектирование каркаса урока…", activeStepIndex: 1 };
  }
  if (elapsedMs < 118_000) {
    return { label: "Написание сценария…", activeStepIndex: 2 };
  }
  return { label: "Проверка и доработка сценария…", activeStepIndex: 3 };
}

function cumulativeWeights(steps: GenerationProgressStep[]): number[] {
  const out: number[] = [];
  let sum = 0;
  for (const s of steps) {
    sum += s.weight;
    out.push(sum);
  }
  return out;
}

function percentFromElapsed(
  elapsedMs: number,
  totalMs: number,
  steps: GenerationProgressStep[],
  activeStepIndex: number,
  isProcessing: boolean,
): number {
  const cum = cumulativeWeights(steps);
  const prev = activeStepIndex > 0 ? cum[activeStepIndex - 1] : 0;
  const next = cum[activeStepIndex] ?? 1;
  const span = next - prev;

  const stepStartMs = prev * totalMs;
  const stepEndMs = next * totalMs;
  const stepElapsed = Math.max(0, elapsedMs - stepStartMs);
  const stepDuration = Math.max(stepEndMs - stepStartMs, 1);
  let local = Math.min(1, stepElapsed / stepDuration);

  if (!isProcessing && activeStepIndex >= steps.length - 2 && elapsedMs > stepStartMs + stepDuration * 0.85) {
    local = 0.85 + (1 - 0.85) * (1 - Math.exp(-(elapsedMs - stepStartMs - stepDuration * 0.85) / 25_000));
  }

  const raw = (prev + span * local) * 100;
  const cap = isProcessing ? 100 : 96;
  return Math.min(cap, Math.max(2, Math.round(raw)));
}

function formatEta(remainingMs: number, percent: number): string {
  if (percent >= 94) return "Почти готово…";
  if (remainingMs <= 8_000) return "Меньше 10 секунд";
  const sec = Math.ceil(remainingMs / 1000);
  if (sec < 60) return `Осталось около ${sec} сек`;
  const min = Math.ceil(sec / 60);
  if (min === 1) return "Осталось около 1 мин";
  return `Осталось около ${min} мин`;
}

export function computeGenerationProgress(
  elapsedMs: number,
  externalStep: string | null,
  mode: GenerationProgressMode,
): GenerationProgressState {
  const steps = mode === "v2" ? GENERATION_STEPS_V2 : GENERATION_STEPS_V1;
  const totalMs = mode === "v2" ? GENERATION_ESTIMATE_MS_V2 : GENERATION_ESTIMATE_MS_V1;
  const isProcessing =
    Boolean(externalStep?.includes("Обработка")) || Boolean(externalStep?.includes("редактор"));

  const { label, activeStepIndex } = stepLabelForRemotePhase(mode, elapsedMs, externalStep);
  const percent = percentFromElapsed(elapsedMs, totalMs, steps, activeStepIndex, isProcessing);

  const remainingMs = Math.max(0, totalMs - elapsedMs);
  let etaLabel = formatEta(remainingMs, percent);
  if (elapsedMs > totalMs * 1.15 && percent < 94) {
    etaLabel = "Чуть дольше обычного — модель ещё работает…";
  }

  return { percent, label, etaLabel, steps, activeStepIndex };
}

export function detectGenerationMode(step: string | null): GenerationProgressMode {
  if (
    step?.includes("версия 1") ||
    step?.includes("один шаг") ||
    step?.includes("Планировщик недоступен")
  ) {
    return "v1";
  }
  return "v2";
}
