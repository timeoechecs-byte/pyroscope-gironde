/**
 * api-keys.ts — Récupération automatique des clés API PyroScope 33.
 *
 * Mécanismes de lecture (par ordre de priorité) :
 *   1. import.meta.env.VITE_*      — Freebuff Keys UI (si serveur démarré après)
 *   2. __VITE_*__ globaux           — Défini dans vite.config.ts (define)
 *   3. localStorage                 — Collé manuellement une fois par l'utilisateur
 *
 * Le module api-keys.ts lit TOUTES les clés dès l'import.
 * Les clés non trouvées = undefined → le Dashboard les ignore.
 */

// ── Types ──────────────────────────────────────────────────────────────

export interface ApiKeys {
  /** NASA FIRMS — hotspots satellite feux actifs */
  firms?: string;
}

// ── Déclaration des globaux Vite define ───────────────────────────────
declare const __VITE_FIRMS_API_KEY__: string | undefined;

// ── Lecture depuis toutes les sources ──────────────────────────────────

/** Tente de lire une valeur depuis toutes les sources */
function readKey(
  envName: string,
  globalName: string | undefined,
  lsKey: string,
): string | undefined {
  // 1. import.meta.env (Freebuff Keys UI)
  const envVal = (import.meta.env as Record<string, string | undefined>)[envName];
  if (envVal && envVal.length > 6) {
    localStorage.setItem(lsKey, envVal);
    return envVal;
  }

  // 2. Global define (vite.config.ts)
  if (globalName) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const globalVal = (typeof globalThis !== "undefined" ? (globalThis as any)[globalName] : undefined) as string | undefined;
      if (globalVal && globalVal.length > 6) {
        localStorage.setItem(lsKey, globalVal);
        return globalVal;
      }
    } catch { /* ignore */ }
  }

  // 3. localStorage (collé par l'utilisateur)
  const lsVal = localStorage.getItem(lsKey);
  if (lsVal && lsVal.length > 6) return lsVal;

  return undefined;
}

// ── Lecture de toutes les clés ────────────────────────────────────────

const firmsKey = readKey("VITE_FIRMS_API_KEY", "__VITE_FIRMS_API_KEY__", "pyroscope_firms_key");

export const API_KEYS: ApiKeys = {
  firms: firmsKey,
};

// ── Helpers ────────────────────────────────────────────────────────────

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
