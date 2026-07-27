/**
 * api-keys.ts — Gestion sécurisée des clés API PyroScope 33.
 *
 * Ordre de lecture :
 *   1. localStorage (persistant, collé une seule fois par l'utilisateur)
 *   2. import.meta.env.VITE_* (injecté par Freebuff Keys UI au build)
 *
 * Utilisation :
 *   import { FIRMS_API_KEY } from "@/config/api-keys";
 *   if (FIRMS_API_KEY) { ... }
 *
 * La clé n'est JAMAIS affichée dans l'UI, uniquement stockée dans localStorage.
 * Pour effacer : localStorage.removeItem("pyroscope_firms_key")
 */

const LS_KEY = "pyroscope_firms_key";

/** Récupère la clé FIRMS depuis localStorage ou import.meta.env */
export function getFirmsApiKey(): string | undefined {
  // 1. localStorage (persistant, collé par l'utilisateur)
  const stored = localStorage.getItem(LS_KEY);
  if (stored && stored.length > 8) return stored;

  // 2. Variable d'environnement Freebuff (VITE_)
  const envKey = (import.meta.env as Record<string, string | undefined>).VITE_FIRMS_API_KEY;
  if (envKey && envKey.length > 8) {
    // Sauvegarde dans localStorage pour persister
    localStorage.setItem(LS_KEY, envKey);
    return envKey;
  }

  return undefined;
}

/** Stocke une clé FIRMS dans localStorage */
export function setFirmsApiKey(key: string): void {
  localStorage.setItem(LS_KEY, key);
}

/** Vérifie si une clé FIRMS est disponible */
export function hasFirmsApiKey(): boolean {
  return Boolean(getFirmsApiKey());
}

/** Clé FIRMS exportée directement */
export const FIRMS_API_KEY = getFirmsApiKey();
