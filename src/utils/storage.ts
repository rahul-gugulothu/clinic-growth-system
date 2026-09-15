const PREFIX = 'cgs:v1:';

export function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function safeSet<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore quota / private mode failures
  }
}

export function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export function safeClearAll(): void {
  try {
    const all = Object.keys(window.localStorage);
    for (const k of all) {
      if (k.startsWith(PREFIX)) window.localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}