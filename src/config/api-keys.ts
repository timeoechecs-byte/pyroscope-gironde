/**
 * api-keys.ts — LECTURE SEULE des clés API pour PyroScope 33.
 *
 * 🔒 POLITIQUE (audit 2026-07-28) :
 *   1. Aucun secret n'est JAMAIS écrit dans ce fichier.
 *   2. Les clés sont lues (par ordre de priorité) :
 *      a. Variables d'environnement VITE_* au build (Freebuff Keys UI).
 *      b. localStorage (saisie manuelle de l'utilisateur final).
 *      c. Sinon : null → l'application fonctionne en mode dégradé et affiche
 *         « clé manquante, données indisponibles ».
 *   3. Les secrets backend-only (CDSE_CLIENT_SECRET, CDS_API_TOKEN) ne sont
 *      JAMAIS exposés au frontend. Ils sont lus côté serveur Python uniquement.
 *   4. Aucune valeur n'est jamais seedée, mockée ou suggérée « au cas où ».
 *
 * 📜 Procédure de rotation complète : voir docs/SECURITY.md.
 * 📜 Politique non négociable : voir docs/SECURITY.md §Politique.
 */

// ── TYPES ──────────────────────────────────────────────────────────────

export interface ApiKeys {
  firms: string | null;
  openaq: string | null;
  cdseClientId: string | null;
  cdseBaseUrl: string | null;
}

export interface CdseConfig {
  baseUrl: string;
  clientId: string;
}

// ── LECTURE SÉCURISÉE ─────────────────────────────────────────────────

function readEnv(name: string): string | null {
  const v = (import.meta.env as Record<string, string | undefined>)[name];
  return typeof v === "string" && v.length > 6 ? v : null;
}

function readLocalStorage(key: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const v = localStorage.getItem(key);
    return typeof v === "string" && v.length > 6 ? v : null;
  } catch {
    // localStorage inaccessible (mode strict, iframe isolé, etc.)
    return null;
  }
}

function readKey(envName: string, lsKey: string): string | null {
  return readEnv(envName) ?? readLocalStorage(lsKey);
}

// ── GETTERS PUBLICS — backward-compatibles (string vide si non configuré) ─

const _firms = readKey("VITE_FIRMS_API_KEY", "pyroscope_firms_key");
const _openaq = readKey("VITE_OPENAQ_API_KEY", "pyroscope_openaq_key");
const _cdseId = readKey("VITE_CDSE_CLIENT_ID", "pyroscope_cdse_client_id");
const _cdseBase = readKey("VITE_CDSE_BASE_URL", "pyroscope_cdse_base_url");

/**
 * Retourne la clé FIRMS ou une chaîne vide.
 * Utiliser `hasFirmsApiKey()` pour les conditions d'affichage.
 */
export function getFirmsApiKey(): string {
  return _firms ?? "";
}

export function hasFirmsApiKey(): boolean {
  return _firms !== null;
}

export function getOpenAqApiKey(): string {
  return _openaq ?? "";
}

export function hasOpenAqApiKey(): boolean {
  return _openaq !== null;
}

/**
 * Configuration CDSE — seulement la partie publique (baseUrl + clientId).
 * Le secret OAuth reste côté backend Python.
 * Retourne `null` si aucune configuration n'est disponible côté frontend ;
 * dans ce cas, tous les appels Copernicus doivent être routés via le backend.
 */
export function getCdseConfig(): CdseConfig | null {
  if (!_cdseId || !_cdseBase) return null;
  return { baseUrl: _cdseBase, clientId: _cdseId };
}

export function hasCdseConfig(): boolean {
  return _cdseId !== null && _cdseBase !== null;
}

// ── FUNNEURS — JAMAIS DE VALEUR CÔTÉ FRONTEND ─────────────────────────

/**
 * 🔒 Le `client_secret` CDSE ne quitte JAMAIS le backend Python.
 * Renvoie `null` intentionnellement. Si un composant frontend demande ce
 * secret, c'est un bug architectural qu'il faut corriger en routant l'appel
 * via le backend (cf. docs/SECURITY.md §Politique).
 */
export function getCdseClientSecret(): null {
  console.warn(
    "[api-keys] getCdseClientSecret() appelé côté frontend : interdit. " +
      "Routage via backend requis (cf. docs/SECURITY.md).",
  );
  return null;
}

/**
 * 🔒 Le CDS `api_token` (ECMWF) ne quitte JAMAIS le backend Python.
 * Renvoie `null` intentionnellement.
 */
export function getCdsApiToken(): null {
  console.warn(
    "[api-keys] getCdsApiToken() appelé côté frontend : interdit. " +
      "Routage via backend requis (cf. docs/SECURITY.md).",
  );
  return null;
}

// ── DIAGNOSTIC ─────────────────────────────────────────────────────────

/**
 * Renvoie la liste des clés configurées — utile pour afficher clairement
 * à l'utilisateur quelles sources sont actives ou en mode dégradé.
 */
export function getKeyStatus(): Record<
  "firms" | "openaq" | "cdseClientId" | "cdseBaseUrl",
  boolean
> {
  return {
    firms: _firms !== null,
    openaq: _openaq !== null,
    cdseClientId: _cdseId !== null,
    cdseBaseUrl: _cdseBase !== null,
  };
}
