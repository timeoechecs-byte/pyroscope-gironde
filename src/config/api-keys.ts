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
  openaq?: string;
  cdseBaseUrl?: string;
  cdseClientId?: string;
  cdseClientSecret?: string;
  cdsApiToken?: string;
}

// ── Les globaux injectés par vite.config.ts (define) ──────────────────
declare const __VITE_FIRMS_API_KEY__: string | undefined;
declare const __VITE_OPENAQ_API_KEY__: string | undefined;
declare const __VITE_CDSE_BASE_URL__: string | undefined;
declare const __VITE_CDSE_CLIENT_ID__: string | undefined;
declare const __VITE_CDSE_CLIENT_SECRET__: string | undefined;
declare const __VITE_CDS_API_TOKEN__: string | undefined;

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
  openaq: readKey("VITE_OPENAQ_API_KEY", __VITE_OPENAQ_API_KEY__, "pyroscope_openaq_key"),
  cdseBaseUrl: readKey("VITE_CDSE_BASE_URL", __VITE_CDSE_BASE_URL__, "pyroscope_cdse_base_url"),
  cdseClientId: readKey("VITE_CDSE_CLIENT_ID", __VITE_CDSE_CLIENT_ID__, "pyroscope_cdse_client_id"),
  cdseClientSecret: readKey("VITE_CDSE_CLIENT_SECRET", __VITE_CDSE_CLIENT_SECRET__, "pyroscope_cdse_client_secret"),
  cdsApiToken: readKey("VITE_CDS_API_TOKEN", __VITE_CDS_API_TOKEN__, "pyroscope_cds_api_token"),
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

export function getOpenAqApiKey(): string | undefined {
  return API_KEYS.openaq;
}

export function hasOpenAqApiKey(): boolean {
  return Boolean(API_KEYS.openaq);
}

export function getCdseConfig() {
  return {
    baseUrl: API_KEYS.cdseBaseUrl,
    clientId: API_KEYS.cdseClientId,
    clientSecret: API_KEYS.cdseClientSecret,
  };
}

export function getCdsApiToken(): string | undefined {
  return API_KEYS.cdsApiToken;
}
