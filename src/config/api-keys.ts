/**
 * api-keys.ts — Clés API pour PyroScope 33.
 *
 * 🔑 PRIORITÉ ABSOLUE : les clés sont hardcodées ici (fournies par l'utilisateur).
 *    Fallback : import.meta.env.VITE_* (Freebuff Keys UI).
 *    Dernier recours : localStorage (champ manuel).
 *
 * ⚠️ Projet open source éducatif. Les clés sont visibles dans le bundle.
 *    En production, utilisez un backend proxy (Convex action).
 */

// ── TYPES ──────────────────────────────────────────────────────────────

export interface ApiKeys {
  firms: string;
  openaq: string;
  cdseClientId: string;
  cdseClientSecret: string;
  cdseBaseUrl: string;
  cdsApiToken: string;
}

// ── CLÉS HARCODÉES (fournies par l'utilisateur) ────────────────────────
// Pour override : définir la variable VITE_ correspondante dans Freebuff Keys UI

const HARDCODED: ApiKeys = {
  firms: "3622edb968086a7ed8d44e197cfdde1c",
  openaq: "559ecdb2dd79ca22d17d13da255e5c7624e1b61b6945c9c0820fe999f8b712f8",
  cdseClientId: "sh-a9b0ecc2-52bc-4888-9854-b9b9e9e560e0",
  cdseClientSecret: "cihDUelg3NyeY24lPBLAC6mVZy6F9dZR",
  cdseBaseUrl: "https://sh.dataspace.copernicus.eu",
  cdsApiToken: "2e63426d-50a5-44af-899e-8a4c35a75a65",
};

// ── LECTURE (hardcode → env → localStorage) ────────────────────────────

function readKey(
  hardcoded: string,
  envName: string,
  lsKey: string,
): string {
  // 1. import.meta.env (Freebuff Keys UI — si présent, écrase le hardcode)
  const envVal = (import.meta.env as Record<string, string | undefined>)[envName];
  if (envVal && envVal.length > 6) {
    localStorage.setItem(lsKey, envVal);
    return envVal;
  }

  // 2. Hardcodé
  if (hardcoded && hardcoded.length > 6) {
    localStorage.setItem(lsKey, hardcoded);
    return hardcoded;
  }

  // 3. localStorage (champ manuel)
  const lsVal = localStorage.getItem(lsKey);
  if (lsVal && lsVal.length > 6) return lsVal;

  return hardcoded; // dernier recours = la valeur hardcodée
}

// ── EXPORT ─────────────────────────────────────────────────────────────

export const API_KEYS: ApiKeys = {
  firms: readKey(HARDCODED.firms, "VITE_FIRMS_API_KEY", "pyroscope_firms_key"),
  openaq: readKey(HARDCODED.openaq, "VITE_OPENAQ_API_KEY", "pyroscope_openaq_key"),
  cdseClientId: readKey(HARDCODED.cdseClientId, "VITE_CDSE_CLIENT_ID", "pyroscope_cdse_client_id"),
  cdseClientSecret: readKey(HARDCODED.cdseClientSecret, "VITE_CDSE_CLIENT_SECRET", "pyroscope_cdse_client_secret"),
  cdseBaseUrl: readKey(HARDCODED.cdseBaseUrl, "VITE_CDSE_BASE_URL", "pyroscope_cdse_base_url"),
  cdsApiToken: readKey(HARDCODED.cdsApiToken, "VITE_CDS_API_TOKEN", "pyroscope_cds_api_token"),
};

export function getFirmsApiKey(): string {
  return API_KEYS.firms;
}

export function hasFirmsApiKey(): boolean {
  return Boolean(API_KEYS.firms) && API_KEYS.firms.length > 6;
}

export function getOpenAqApiKey(): string {
  return API_KEYS.openaq;
}

export function hasOpenAqApiKey(): boolean {
  return Boolean(API_KEYS.openaq) && API_KEYS.openaq.length > 6;
}

export function getCdseConfig() {
  return {
    baseUrl: API_KEYS.cdseBaseUrl,
    clientId: API_KEYS.cdseClientId,
    clientSecret: API_KEYS.cdseClientSecret,
  };
}

export function getCdsApiToken(): string {
  return API_KEYS.cdsApiToken;
}
