/**
 * api-keys.ts — Récupération AUTOMATIQUE des clés API.
 *
 * Mécanismes :
 *   1. import.meta.env.VITE_FIRMS_API_KEY (Freebuff Keys UI, build-time)
 *   2. __VITE_FIRMS_API_KEY__ (vite.config.ts define, serve-time)
 *   3. localStorage (fallback utilisateur)
 *
 * Aucune interaction manuelle nécessaire si la clé est dans Freebuff Keys UI.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ApiKeys {
  firms?: string;
}

// ── Les globaux injectés par vite.config.ts (define) ──────────────────
declare const __VITE_FIRMS_API_KEY__: string | undefined;

// ── Lecture multi-source ───────────────────────────────────────────────

function readKey(
  envName: string,
  defineGlobal: string | undefined,
  lsKey: string,
): string | undefined {
  // 1. import.meta.env (Vite env vars — build-time)
  const envVal = (import.meta.env as Record<string, string | undefined>)[envName];
  if (envVal && envVal.length > 6) {
    localStorage.setItem(lsKey, envVal);
    return envVal;
  }

  // 2. define global (vite.config.ts — serve-time, après restart)
  if (defineGlobal && defineGlobal.length > 6) {
    localStorage.setItem(lsKey, defineGlobal);
    return defineGlobal;
  }

  // 3. localStorage (collé par l'utilisateur)
  const lsVal = localStorage.getItem(lsKey);
  if (lsVal && lsVal.length > 6) return lsVal;

  return undefined;
}

// ── Lecture et export ──────────────────────────────────────────────────

export const API_KEYS: ApiKeys = {
  firms: readKey("VITE_FIRMS_API_KEY", __VITE_FIRMS_API_KEY__, "pyroscope_firms_key"),
};

export function getFirmsApiKey(): string | undefined {
  return API_KEYS.firms;
}

export function hasFirmsApiKey(): boolean {
  return Boolean(API_KEYS.firms);
}

export function setFirmsApiKey(key: string): void {
  localStorage.setItem("pyroscope_firms_key", key);
  (API_KEYS as Record<string, string | undefined>).firms = key;
}
