import { getStoredClientId, persistClientIdFromUrl } from "./clientId";

export const METRIKA_COUNTER_ID = 108472990;

export type AnalyticsPayloadValue = string | number | boolean;
export type AnalyticsPayload = Record<string, AnalyticsPayloadValue>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    ym?: (counterId: number, method: string, goalSlug: string, payload?: Record<string, unknown>) => void;
    __lpcTrackTest?: () => void;
  }
}

function isAnalyticsEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_ANALYTICS_ENABLED?.trim();
  if (flag === "0" || flag === "false") return false;
  return true;
}

function getCounterId(): number {
  const raw = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID?.trim();
  if (!raw) return METRIKA_COUNTER_ID;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : METRIKA_COUNTER_ID;
}

export function sanitizePayload(payload: AnalyticsPayload): AnalyticsPayload {
  const out: AnalyticsPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    out[key] = value;
  }
  return out;
}

export function withClientId(payload: AnalyticsPayload): AnalyticsPayload {
  const clientId = getStoredClientId();
  return sanitizePayload({
    ...payload,
    ...(clientId ? { client_id: clientId } : {}),
    has_client_id: Boolean(clientId),
  });
}

export function ensureDataLayer(): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
}

export function pushDataLayerEvent(event: string, payload: AnalyticsPayload): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  ensureDataLayer();
  window.dataLayer!.push({
    event,
    ...payload,
  });
}

export function reachGoal(goalSlug: string, payload: AnalyticsPayload): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  const counterId = getCounterId();
  const nestedPayload = sanitizePayload(payload);
  const ymPayload =
    Object.keys(nestedPayload).length > 0 ? { [goalSlug]: nestedPayload } : undefined;

  if (typeof window.ym === "function") {
    if (ymPayload) {
      window.ym(counterId, "reachGoal", goalSlug, ymPayload);
    } else {
      window.ym(counterId, "reachGoal", goalSlug);
    }
  }
}

export function trackEvent(goalSlug: string, payload: AnalyticsPayload = {}): void {
  const enriched = withClientId(payload);
  reachGoal(goalSlug, enriched);
  pushDataLayerEvent(goalSlug, enriched);
}

export function trackUxfbTrigger(eventName: string, payload: AnalyticsPayload = {}): void {
  pushDataLayerEvent(eventName, withClientId(payload));
}

export function initAnalyticsClient(): void {
  if (typeof window === "undefined") return;
  persistClientIdFromUrl();
  ensureDataLayer();
  if (process.env.NODE_ENV === "development") {
    window.__lpcTrackTest = () => {
      trackEvent("lpc_scenario_init", { scenario: "lesson_plan_constructor" });
    };
  }
}
