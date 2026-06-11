const CLIENT_ID_STORAGE_KEY = "lpc_client_id";

export function readClientIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const fromQuery = new URLSearchParams(window.location.search).get("client_id")?.trim();
  return fromQuery || null;
}

export function getStoredClientId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY)?.trim();
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  return readClientIdFromUrl();
}

export function persistClientIdFromUrl(): string | null {
  const clientId = readClientIdFromUrl();
  if (!clientId || typeof window === "undefined") return clientId;
  try {
    window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, clientId);
  } catch {
    /* ignore */
  }
  return clientId;
}

export function appendClientId(url: string, clientId?: string | null): string {
  const id = clientId ?? getStoredClientId();
  if (!id) return url;
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "https://example.com");
    if (!parsed.searchParams.has("client_id")) {
      parsed.searchParams.set("client_id", id);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
