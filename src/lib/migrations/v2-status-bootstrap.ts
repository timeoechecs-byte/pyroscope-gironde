/**
 * Migration v2 — Status bootstrap + extinction des anciens secrets.
 *
 * Contexte : post-freeze proxy (2026-07-28), le frontend ne porte plus
 * aucune clé d'API. Cette migration fait deux choses :
 *
 * 1. Démarre une première interrogation `/api/v1/status` pour amorcer le
 *    cache de `PublicSourceStatus` (mode dégradé imminent si le backend
 *    n'est pas encore déployé, c'est le comportement attendu).
 *
 * 2. Extinction définitive de toute clé qui pourrait subsister en
 *    `localStorage` du navigateur d'anciens utilisateurs. Les noms sont
 *    issus des anciens modules (v1-purge-stale-secrets 2026-07-28) PLUS
 *    les noms communs (firms_key, openaq_key, etc.) qui auraient pu être
 *    saisis manuellement par mégarde avant la purge.
 *
 *    Cette opération est idempotente et silencieuse.
 *
 * Exécutée au démarrage de l'app (import depuis src/main.tsx, comme la v1).
 */

const MIGRATIONS_FLAG = "pyroscope_migrations";
const MIGRATION_ID = "v2-status-bootstrap-2026-07-28";

const LEGACY_LOCAL_STORAGE_KEYS = [
  // V1 compromise keys (listée dans src/lib/migrations/v1-purge-stale-secrets)
  "pyroscope_firms_key",
  "pyroscope_openaq_key",
  "pyroscope_cdse_client_id",
  "pyroscope_cdse_client_secret",
  "pyroscope_cds_api_token",
  // Variations qui auraient pu être saisies à la main
  "firms_key", "firms_api_key", "firmsMapKey",
  "openaq_key", "openaq_api_key",
  "cdse_client_secret", "cdse_secret",
  "cds_api_token", "cds_token",
];

function alreadyApplied(): boolean {
  try {
    const raw = localStorage.getItem(MIGRATIONS_FLAG);
    if (!raw) return false;
    const applied = JSON.parse(raw);
    return Array.isArray(applied) && applied.includes(MIGRATION_ID);
  } catch {
    return false;
  }
}

function markApplied(): void {
  try {
    const raw = localStorage.getItem(MIGRATIONS_FLAG);
    const applied: string[] = Array.isArray(JSON.parse(raw ?? "[]"))
      ? (JSON.parse(raw ?? "[]") as string[])
      : [];
    applied.push(MIGRATION_ID);
    localStorage.setItem(MIGRATIONS_FLAG, JSON.stringify(applied));
  } catch {
    // Silencieux : si la persistance échoue, on refera la migration à la
    // prochaine session — coût nul.
  }
}

function purgeLegacyKeys(): void {
  if (typeof localStorage === "undefined") return;
  for (const k of LEGACY_LOCAL_STORAGE_KEYS) {
    try { localStorage.removeItem(k); } catch { /* accès bloqué : tant pis */ }
  }
}

function bootstrapStatus(): void {
  // Premier appel pour amorcer le cache PUBLIC_BASE_URL/src/lib/api-status.ts
  if (typeof window === "undefined") return;
  // Import dynamique pour éviter cycle si api-status importe aussi le bundle.
  void import("@/lib/api-status")
    .then(({ fetchPublicStatus }) => fetchPublicStatus())
    .catch(() => {
      // Backend down : c'est le mode dégradé attendu. Pas d'exception.
    });
}

function run(): void {
  if (typeof window === "undefined") return;
  if (alreadyApplied()) return;
  purgeLegacyKeys();
  bootstrapStatus();
  markApplied();
}

run();
