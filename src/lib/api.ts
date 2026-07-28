/**
 * api.ts — Client HTTP vers le backend proxy PyroScope 33.
 *
 * 🔒 ARCHITECTURE PROXY (audit 2026-07-28, cf. docs/ARCHITECTURE_PROXY.md).
 *
 * Règle d'or : aucun secret ne traverse la frontière du serveur.
 * Le frontend appelle UNIQUEMENT `/api/v1/*` exposé par le backend FastAPI.
 *
 * `VITE_API_URL` est la SEULE variable `VITE_*` légitime : c'est l'URL
 * publique de notre propre service. Aucun token, aucune clé d'API tierce,
 * aucun quota nominatif.
 *
 * Toutes les clés API (FIRMS, OpenAQ, CDSE, CDS) sont lues côté backend
 * depuis `Settings` (`SecretStr`). Le frontend ne peut que constater que
 * telle source est configurée (via `/api/v1/status`) ou pas.
 */

const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
  ?? "http://localhost:8000";

export const SOURCE_STATUS = {
  unknown: "unknown" as const,
  configured: "configured" as const,
  degraded: "degraded" as const,
};

export interface SourceStatusResponse {
  version: string;
  sources: {
    firms_configured: boolean;
    openaq_configured: boolean;
    cdse_configured: boolean;
    cds_configured: boolean;
  };
}

export interface HotspotDTO {
  lat: number;
  lon: number;
  acq_date: string;
  acq_time: number;
  satellite: string;
  confidence: string;
  frp: number;
  daynight: string;
  bright_ti4: number | null;
  bright_ti5: number | null;
  age_hours?: number;
}

export interface HotspotsResponse {
  count: number;
  hotspots: HotspotDTO[];
  sensor: string;
  bbox: number[];
  source: { name: string };
  cache?: "hit" | "miss";
  quality?: "fresh" | "stale";
}

export interface WeatherGridPoint {
  lat: number;
  lon: number;
  temperature: number | null;
  humidity: number | null;
  wind_speed: number | null;
  wind_gusts: number | null;
  precip: number | null;
}

export interface WeatherInvalidResponse {
  error: string;
}

export interface AirQualityResponse {
  source: "openaq" | "openmeteo";
  stationName: string;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  aod: number | null;
  uvIndex: number | null;
  time: string;
  error: string | null;
}

/** Statut global public du backend — booléens uniquement. */
export async function fetchStatus(): Promise<SourceStatusResponse> {
  const r = await fetch(`${API_BASE}/api/v1/status`);
  if (!r.ok) throw new Error(`status ${r.status}`);
  return r.json();
}

/**
 * Hotspots FIRMS via le proxy backend.
 * Le backend détient la clé FIRMS ; le frontend reçoit uniquement les
 * détections normalisées.
 */
export async function fetchHotspots(
  sensor: "VIIRS_SNPP_NRT" | "VIIRS_NOAA20_NRT" | "VIIRS_NOAA21_NRT" | "MODIS_NRT" = "VIIRS_SNPP_NRT",
  days = 1,
): Promise<HotspotsResponse> {
  const r = await fetch(
    `${API_BASE}/api/v1/hotspots?sensor=${encodeURIComponent(sensor)}&days=${days}`,
  );
  if (!r.ok) throw new Error(`hotspots ${r.status}`);
  return r.json();
}

/**
 * Grille météo sur BBOX_CALCUL via le proxy backend.
 * Le backend appelle Open-Meteo (sans clé, CC BY 4.0) et applique
 * cache + rate-limit. Le frontend ne contacte jamais Open-Meteo directement :
 * uniformité avec la règle "no VITE_* + serveur fait foi".
 */
export async function fetchWeatherGrid(
  model = "meteofrance_arome_france_hd",
): Promise<WeatherGridPoint[]> {
  const r = await fetch(
    `${API_BASE}/api/weather/grid?variable=temperature_2m&model=${encodeURIComponent(model)}&forecast_hours=6`,
  );
  if (!r.ok) throw new Error(`weather/grid ${r.status}`);
  const j = await r.json();
  return (j.locations ?? []).map(
    (loc: { lat: number; lon: number; values: Array<number | null> }) => ({
      lat: loc.lat,
      lon: loc.lon,
      temperature: loc.values[0] ?? null,
      humidity: null,
      wind_speed: null,
      wind_gusts: null,
      precip: null,
    }),
  );
}

/**
 * URL publique du proxy de tuiles Sentinel. Le token CDSE reste
 * strictement côté serveur (jamais transmis au navigateur).
 */
export function sentinelTileUrl(
  layer: "NDVI" | "NDMI" | "NDWI" | "TRUE_COLOR",
  z: number,
  x: number,
  y: number,
): string {
  return `${API_BASE}/api/v1/tiles/sentinel/${layer}/${z}/${x}/${y}.png`;
}

/**
 * URL de fallback Open-Meteo côté frontend pour la qualité de l'air.
 * Open-Meteo ne nécessite aucune clé ; ce call direct reste acceptable
 * (CC BY 4.0, validé par le thinker). En cas de panne backend complète,
 * l'UI reste informative.
 */
export async function fetchAirQualityFallback(): Promise<AirQualityResponse> {
  const lat = 44.8;
  const lon = -0.5;
  try {
    const r = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,aerosol_optical_depth,uv_index,ozone,nitrogen_dioxide&timezone=auto`,
    );
    if (!r.ok) {
      return {
        source: "openmeteo",
        stationName: "",
        pm25: null, pm10: null, o3: null, no2: null, so2: null, aod: null, uvIndex: null,
        time: "",
        error: `Open-Meteo AQ ${r.status}`,
      };
    }
    const j = await r.json();
    const c = j?.current ?? {};
    return {
      source: "openmeteo",
      stationName: "Modèle CAMS (Copernicus) · fallback direct",
      pm25: c.pm2_5 ?? null,
      pm10: c.pm10 ?? null,
      o3: c.ozone ?? null,
      no2: c.nitrogen_dioxide ?? null,
      so2: null,
      aod: c.aerosol_optical_depth ?? null,
      uvIndex: c.uv_index ?? null,
      time: new Date().toLocaleTimeString("fr-FR"),
      error: null,
    };
  } catch (e) {
    return {
      source: "openmeteo",
      stationName: "",
      pm25: null, pm10: null, o3: null, no2: null, so2: null, aod: null, uvIndex: null,
      time: "",
      error: e instanceof Error ? e.message : "Erreur Open-Meteo",
    };
  }
}

export const API_CONFIG = Object.freeze({
  base: API_BASE,
  isLocalDev: API_BASE.includes("localhost"),
});
