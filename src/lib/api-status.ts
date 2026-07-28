/**
 * api-status.ts — Statut public des sources (booléens uniquement).
 *
 * Aucun secret. Aucune clé. Aucune URL sensible.
 *
 * Le frontend peut demander au backend `/api/v1/status` pour savoir quelles
 * sources sont configurées côté serveur. Ce module expose :
 *   - l'URL publique du backend (VITE_API_URL, variable publique)
 *   - un type pour typer la réponse
 *   - un fallback statique "inconnu" si le backend n'est pas joignable
 *
 * À l'initialisation de l'app on appelle `fetchStatus()` une fois ; le
 * résultat est mis en cache dans `localStorage` sous une clé de migration.
 * Si le backend est down, l'UI affiche « statut inconnu » et le bandeau
 * légal reste présent.
 */

export type SourceAvailability = "unknown" | "configured" | "degraded";

export interface PublicSourceStatus {
  firms: SourceAvailability;
  openaq: SourceAvailability;
  cdse: SourceAvailability;
  cds: SourceAvailability;
}

export const PUBLIC_BASE_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
  ?? "http://localhost:8000";

export const DEFAULT_STATUS: PublicSourceStatus = Object.freeze({
  firms: "unknown",
  openaq: "unknown",
  cdse: "unknown",
  cds: "unknown",
});

const STATUS_CACHE_KEY = "pyroscope_public_status_v1";

/**
 * Lecture cache local (synchrone). N'évalue pas la disponibilité réelle :
 * c'est juste un mémo de la dernière mesure pour éviter des appels redondants.
 */
export function readCachedStatus(): PublicSourceStatus | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed == null ||
      typeof parsed !== "object" ||
      typeof parsed.firms !== "string"
    ) return null;
    return parsed as PublicSourceStatus;
  } catch {
    return null;
  }
}

/**
 * Interroge le backend. En cas d'échec, retourne le cache s'il existe,
 * sinon DEFAULT_STATUS. Aucune exception levée — l'UI doit rester visible.
 */
export async function fetchPublicStatus(): Promise<PublicSourceStatus> {
  try {
    const r = await fetch(`${PUBLIC_BASE_URL}/api/v1/status`);
    if (!r.ok) return readCachedStatus() ?? { ...DEFAULT_STATUS };
    const j = await r.json();
    const sources = (j?.sources ?? {}) as Record<string, boolean>;
    const status: PublicSourceStatus = {
      firms: sources.firms_configured ? "configured" : "degraded",
      openaq: sources.openaq_configured ? "configured" : "degraded",
      cdse: sources.cdse_configured ? "configured" : "degraded",
      cds: sources.cds_configured ? "configured" : "degraded",
    };
    try {
      localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(status));
    } catch { /* localStorage inaccessible : pas grave */ }
    return status;
  } catch {
    return readCachedStatus() ?? { ...DEFAULT_STATUS };
  }
}
