const API_KEY_STORAGE = "aegis_api_key";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(API_KEY_STORAGE);
}

export function setApiKey(key: string): void {
  localStorage.setItem(API_KEY_STORAGE, key);
}

export function clearApiKey(): void {
  localStorage.removeItem(API_KEY_STORAGE);
}

export function authHeaders(): Record<string, string> {
  const key = getApiKey();
  if (!key) return {};
  return { "X-Aegis-API-Key": key };
}