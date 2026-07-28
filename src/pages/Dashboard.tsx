/**
 * PyroScope 33 — Dashboard.
 *
 * Estimation risque feu temps réel : satellites (FIRMS) + météo (Open-Meteo).
 * Zéro simulation, zéro donnée d'exemple.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import MapContainer from "@/components/MapContainer";
import HotspotLayer from "@/components/HotspotLayer";
import type { HotspotData } from "@/components/HotspotLayer";
import WindParticlesLayer from "@/components/WindParticlesLayer";
import IsothermLayer from "@/components/IsothermLayer";
import FirePerimeterLayer from "@/components/FirePerimeterLayer";
import type { FirePerimeter } from "@/components/FirePerimeterLayer";
import { estimateFirePerimeters } from "@/components/FirePerimeterLayer";
import SentinelMapLayer from "@/components/SentinelMapLayer";
import { getFirmsApiKey, getOpenAqApiKey, hasOpenAqApiKey, getCdseConfig } from "@/config/api-keys";
import {
  Flame,
  LogOut,
  Thermometer,
  Layers,
  RefreshCw,
  Satellite,
  Map,
  Trees,
} from "lucide-react";
import { useNavigate } from "react-router";

// ── Grille météo Gironde (~10 km) ─────────────────────────────────────
const GRID = [
  { lat: 44.3, lon: -1.2 }, { lat: 44.3, lon: -0.7 }, { lat: 44.3, lon: -0.2 },
  { lat: 44.7, lon: -1.2 }, { lat: 44.7, lon: -0.7 }, { lat: 44.7, lon: -0.2 },
  { lat: 45.1, lon: -1.2 }, { lat: 45.1, lon: -0.7 }, { lat: 45.1, lon: -0.2 },
  { lat: 45.4, lon: -1.0 }, { lat: 45.4, lon: -0.5 },
];

interface WeatherPoint {
  lat: number; lon: number;
  temp: number; humidity: number; precip: number;
  wind_speed: number; wind_dir: number; wind_gusts: number;
}

/** Calcule un indice de danger feu [0-100] depuis les données météo */
function calcFireRisk(pts: WeatherPoint[]): number {
  if (!pts.length) return 0;
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const t = avg(pts.map((p) => p.temp));
  const h = avg(pts.map((p) => p.humidity));
  const w = avg(pts.map((p) => p.wind_speed));
  const r = avg(pts.map((p) => p.precip));

  // Température : > 25°C contribue au risque
  const tScore = Math.min(100, Math.max(0, (t - 10) * 3.33));
  // Humidité : < 40% contribue
  const hScore = Math.min(100, Math.max(0, (60 - h) * 2.5));
  // Vent : > 15 km/h accélère la propagation
  const wScore = Math.min(100, Math.max(0, (w - 5) * 4));
  // Précipitations récentes : > 0 réduit le risque
  const rScore = r > 0 ? Math.max(0, 30 - r * 10) : 80;

  const score = Math.round(tScore * 0.25 + hScore * 0.25 + wScore * 0.30 + rScore * 0.20);
  return Math.min(100, Math.max(0, score));
}

/** Couleur + classe selon le score */
function riskLevel(score: number): { label: string; color: string; bg: string } {
  if (score < 15) return { label: "Très faible", color: "text-green-600", bg: "bg-green-900/20 border-green-700/30" };
  if (score < 35) return { label: "Faible", color: "text-yellow-600", bg: "bg-yellow-900/20 border-yellow-700/30" };
  if (score < 55) return { label: "Modéré", color: "text-orange-500", bg: "bg-orange-900/20 border-orange-700/30" };
  if (score < 75) return { label: "Élevé", color: "text-red-500", bg: "bg-red-900/20 border-red-700/30" };
  return { label: "Très élevé", color: "text-red-300", bg: "bg-red-900/40 border-red-600/50" };
}

// ── Air Quality types ─────────────────────────────────────────────────

interface AirQualityData {
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  aod: number | null;
  uvIndex: number | null;
  time: string;
}

// ── API calls ──────────────────────────────────────────────────────────

async function fetchAirQuality(apiKey: string): Promise<AirQualityData> {
  const empty = { pm25: null, pm10: null, o3: null, no2: null, aod: null, uvIndex: null, time: "" };
  try {
    // Coordonnées centre Gironde
    const lat = 44.8, lon = -0.5;
    const r = await fetch(
      `https://api.openaq.org/v2/latest?coordinates=${lat},${lon}&radius=100000&limit=5`,
      { headers: { "X-API-Key": apiKey } },
    );
    if (!r.ok) return empty;
    const j = await r.json();
    if (!j?.results?.[0]?.measurements) return empty;
    const measurements = j.results[0].measurements as Array<{ parameter: string; value: number }>;
    const findVal = (param: string) => {
      // L'API peut retourner pm25, pm10, o3, no2, etc.
      const m = measurements.find((m) => m.parameter === param);
      return m ? m.value : null;
    };
    return {
      pm25: findVal("pm25"),
      pm10: findVal("pm10"),
      o3: findVal("o3"),
      no2: findVal("no2"),
      aod: findVal("aod") ?? findVal("aerosol_optical_depth"),
      uvIndex: findVal("uv_index"),
      time: new Date().toLocaleTimeString("fr-FR"),
    };
  } catch {
    return empty;
  }
}

async function fetchWeather(): Promise<WeatherPoint[]> {
  const results = await Promise.all(
    GRID.map(async (p) => {
      try {
        const r = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto`,
        );
        const j = await r.json();
        if (!j?.current) return null;
        return {
          lat: p.lat, lon: p.lon,
          temp: j.current.temperature_2m,
          humidity: j.current.relative_humidity_2m,
          precip: j.current.precipitation ?? 0,
          wind_speed: j.current.wind_speed_10m,
          wind_dir: j.current.wind_direction_10m,
          wind_gusts: j.current.wind_gusts_10m,
        };
      } catch { return null; }
    }),
  );
  return results.filter((x): x is WeatherPoint => x !== null);
}

async function fetchFirms(apiKey: string): Promise<HotspotData[]> {
  const bbox = "-1.35,44.15,0.35,45.60";
  const fetchCSV = (url: string) => fetch(url).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  const [csv1, csv2] = await Promise.all([
    fetchCSV(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/1/${bbox}`),
    fetchCSV(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_NOAA20_NRT/1/${bbox}`),
  ]);
  const all: HotspotData[] = [];
  for (const csv of [csv1, csv2]) {
    if (!csv) continue;
    const lines = csv.trim().split("\n");
    if (lines.length < 2) continue;
    const headers = lines[0].split(",").map((h) => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => { row[h] = vals[idx]; });
      const lat = parseFloat(row.latitude ?? "0");
      const lon = parseFloat(row.longitude ?? "0");
      if (lat < 44.15 || lat > 45.60 || lon < -1.35 || lon > 0.35) continue;
      const frp = parseFloat(row.frp ?? "0");
      const conf = row.confidence ?? "low";
      const acqDate = row.acq_date ?? "";
      const acqTime = row.acq_time ?? "0000";
      const hh = parseInt(acqTime.substring(0, 2), 10) || 0;
      const mm = parseInt(acqTime.substring(2, 4), 10) || 0;
      const dt = new Date(acqDate + "T" + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":00Z");
      all.push({
        lat, lon, frp,
        confidence: conf === "n" ? "nominal" : conf,
        satellite: row.satellite ?? "VIIRS",
        acq_date: acqDate,
        acq_time: hh * 100 + mm,
        age_hours: isNaN(dt.getTime()) ? 0 : (Date.now() - dt.getTime()) / 3600000,
        daynight: row.daynight ?? "D",
      });
    }
  }
  all.sort((a, b) => b.frp - a.frp);
  return all;
}

// ── Composant ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // ── Clés API ──────────────────────────────────────────────────────
  // Lues AUTOMATIQUEMENT depuis Freebuff Keys UI
  // via src/config/api-keys.ts. Aucune action manuelle nécessaire.
  const firmsKey = getFirmsApiKey();
  const firmsConfigured = Boolean(firmsKey);
  const openaqKey = getOpenAqApiKey();
  const openaqConfigured = hasOpenAqApiKey();
  const cdseConfig = getCdseConfig();
  const cdseConfigured = Boolean(cdseConfig.clientId && cdseConfig.clientSecret);

  // ── Données sources ────────────────────────────────────────────────
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [weatherTime, setWeatherTime] = useState("");
  const [hotspots, setHotspots] = useState<HotspotData[]>([]);
  const [airQuality, setAirQuality] = useState<AirQualityData>({ pm25: null, pm10: null, o3: null, no2: null, aod: null, uvIndex: null, time: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [w, h, aq] = await Promise.all([
        fetchWeather(),
        firmsConfigured && firmsKey
          ? fetchFirms(firmsKey).catch(() => {
              setError("FIRMS : erreur de récupération — clé invalide ?");
              return [];
            })
          : Promise.resolve([]),
        openaqConfigured && openaqKey
          ? fetchAirQuality(openaqKey).catch(() => ({
              pm25: null, pm10: null, o3: null, no2: null, aod: null, uvIndex: null, time: "",
            }))
          : Promise.resolve({ pm25: null, pm10: null, o3: null, no2: null, aod: null, uvIndex: null, time: "" }),
      ]);
      setWeather(w);
      setWeatherTime(new Date().toLocaleTimeString("fr-FR"));
      if (h.length > 0) setHotspots(h);
      setAirQuality(aq);
      if (!w.length) setError("Météo : aucun point de grille disponible");
      if (!firmsConfigured) setError((prev) => (prev ? prev + " · " : "") + "Clé FIRMS manquante — hotspots désactivés");
      if (!openaqConfigured) setError((prev) => (prev ? prev + " · " : "") + "Clé OpenAQ manquante — qualité de l'air désactivée");
    } catch {
      setError("Erreur de chargement des données");
    } finally {
      setLoading(false);
    }
  }, [firmsKey, firmsConfigured, openaqKey, openaqConfigured]);

  // Re-fetch air quality toutes les 15 minutes aussi (en arrière-plan)
  useEffect(() => {
    if (!openaqConfigured || !openaqKey) return;
    const aqInterval = setInterval(() => {
      fetchAirQuality(openaqKey).then((aq) => {
        if (aq.pm25 !== null || aq.pm10 !== null) setAirQuality(aq);
      });
    }, 15 * 60 * 1000);
    return () => clearInterval(aqInterval);
  }, [openaqKey, openaqConfigured]);

  // Chargement initial + rafraîchissement automatique
  useEffect(() => {
    load();
    // Météo : rafraîchir toutes les 5 minutes
    const weatherInterval = setInterval(() => {
      fetchWeather().then((w) => {
        if (w.length) {
          setWeather(w);
          setWeatherTime(new Date().toLocaleTimeString("fr-FR"));
        }
      });
    }, 5 * 60 * 1000);
    // FIRMS : rafraîchir toutes les 15 minutes
    const firmsInterval = setInterval(() => {
      if (firmsConfigured && firmsKey) {
        fetchFirms(firmsKey).then((h) => {
          if (h.length > 0) setHotspots(h);
        });
      }
    }, 15 * 60 * 1000);
    return () => {
      clearInterval(weatherInterval);
      clearInterval(firmsInterval);
    };
  }, [load, firmsConfigured, firmsKey]);

  // ── Risque calculé ────────────────────────────────────────────────
  const riskScore = calcFireRisk(weather);
  const risk = riskLevel(riskScore);
  const avgTemp = weather.length ? Math.round(weather.reduce((s, p) => s + p.temp, 0) / weather.length * 10) / 10 : 0;
  const avgWind = weather.length ? Math.round(weather.reduce((s, p) => s + p.wind_speed, 0) / weather.length * 10) / 10 : 0;
  const avgHum = weather.length ? Math.round(weather.reduce((s, p) => s + p.humidity, 0) / weather.length) : 0;

  // ── Périmètres feu estimés depuis les hotspots ───────────────────
  const perimeters = useMemo(
    () => (hotspots.length >= 3 ? estimateFirePerimeters(hotspots) : []),
    [hotspots],
  );
  const totalBurnedHa = perimeters.reduce((s, p) => s + p.areaHa, 0);
  const totalBurnedHaBuf = perimeters.reduce((s, p) => s + p.areaHaBuffered, 0);
  const confirmedFires = perimeters.filter((p) => p.confidence === "confirmé").length;

  // ── Couches ───────────────────────────────────────────────────────
  const [layers, setLayers] = useState({ hotspots: true, temperature: true, wind: true, perimeters: true, ndvi: false });
  const [sentinelLayer, setSentinelLayer] = useState<"ndvi" | "true_color" | "ndwi">("ndvi");
  const toggle = (k: keyof typeof layers) => setLayers((p) => ({ ...p, [k]: !p[k] }));

  const windGrid = weather.map((p) => ({
    lon: p.lon, lat: p.lat,
    u: -(p.wind_speed * Math.sin((p.wind_dir * Math.PI) / 180)),
    v: -(p.wind_speed * Math.cos((p.wind_dir * Math.PI) / 180)),
  }));

  const hotspotsOk = hotspots.length > 0;

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-fire-500" />
            <span className="text-sm font-semibold">PyroScope<span className="text-fire-500">33</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs text-muted-foreground">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={async () => { await signOut(); navigate("/"); }}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ── Carte ───────────────────────────────────────────── */}
        <main className="relative flex flex-1 flex-col">
          <MapContainer>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <HotspotLayer map={null as any} hotspots={hotspots} visible={layers.hotspots} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <IsothermLayer map={null as any} data={{ grid: weather.map((p) => ({ lon: p.lon, lat: p.lat, temperature: p.temp })) }} visible={layers.temperature} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <WindParticlesLayer map={null as any} windData={{ grid: windGrid }} visible={layers.wind} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            <FirePerimeterLayer map={null as any} perimeters={perimeters} visible={layers.perimeters} />
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {layers.ndvi && <SentinelMapLayer map={null as any} layer={sentinelLayer} visible={layers.ndvi} />}
          </MapContainer>

          {/* ── Overlay risque ───────────────────────────────── */}
          <div className="absolute left-3 top-3 z-20 flex flex-col gap-2">
            <div className={`rounded-lg border px-3 py-2 backdrop-blur-sm ${risk.bg}`}>
              <div className="flex items-center gap-2">
                <Flame className={`h-4 w-4 ${risk.color}`} />
                <span className={`text-xs font-bold ${risk.color}`}>{risk.label}</span>
              </div>
              <div className="mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-fire-500 transition-all" style={{ width: `${riskScore}%` }} />
              </div>
            </div>
            <Button variant="secondary" size="sm" className="h-7 bg-background/80 px-2 text-[10px] backdrop-blur-sm" onClick={load} disabled={loading}>
              <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "…" : "Actualiser"}
            </Button>
          </div>

          {/* Footer carte */}
          <div className="absolute bottom-3 left-3 z-20 rounded border border-border/40 bg-background/70 px-2 py-1 text-[9px] text-muted-foreground backdrop-blur-sm">
            Gironde · © OSM contributeurs · Open-Meteo · NASA FIRMS
          </div>
          <div className="absolute bottom-3 right-3 z-20 flex gap-2">
            <div className="rounded border border-border/40 bg-background/70 px-2 py-1 text-[9px] text-muted-foreground backdrop-blur-sm">
              {hotspotsOk ? `${hotspots.length} hotspot${hotspots.length > 1 ? "s" : ""}` : "Aucune détection"}
            </div>
            <div className={`rounded border px-2 py-1 text-[9px] backdrop-blur-sm ${risk.bg}`}>
              <span className={risk.color}>Risque {riskScore}/100</span>
            </div>
          </div>
        </main>

        {/* ── Sidebar ─────────────────────────────────────────── */}
        <aside className="w-full border-t border-border/50 bg-card/30 lg:w-64 lg:border-l lg:border-t-0">
          <div className="overflow-y-auto p-3 space-y-3">

            {/* Couches */}
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3 w-3" /> Couches
            </h4>
            {(["hotspots", "temperature", "wind", "perimeters", "ndvi"] as const).map((k) => (
              <div key={k} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-accent/30">
                <Switch checked={layers[k]} onCheckedChange={() => toggle(k)} className="h-4 w-7 data-[state=checked]:bg-fire-600" />
                <span className="text-xs text-muted-foreground">
                  {k === "hotspots" ? "Hotspots satellite" : k === "temperature" ? "Température" : k === "wind" ? "Vent animé" : k === "perimeters" ? "Périmètres feux" : "Satellite (Sentinel-2)"}
                </span>
              </div>
            ))}

            {/* Sélecteur de couche Sentinel-2 */}
            {layers.ndvi && (
              <div className="flex gap-1 rounded border border-border/30 p-1">
                {(["ndvi", "true_color", "ndwi"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSentinelLayer(s)}
                    className={`flex-1 rounded px-2 py-1 text-[9px] font-medium transition-colors ${
                      sentinelLayer === s
                        ? "bg-fire-600 text-white"
                        : "text-muted-foreground hover:bg-accent/30"
                    }`}
                  >
                    {s === "ndvi" ? "NDVI" : s === "true_color" ? "Couleur" : "NDWI"}
                  </button>
                ))}
              </div>
            )}

            <hr className="border-border/40" />

            {/* Risque */}
            <h4 className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Flame className="h-3 w-3 text-fire-500" /> Risque feu temps réel
            </h4>
            <div className={`rounded-lg border p-3 ${risk.bg}`}>
              <div className="flex items-center justify-between">
                <span className={`text-lg font-bold ${risk.color}`}>{riskScore}</span>
                <span className={`text-[10px] font-medium ${risk.color}`}>/ 100</span>
              </div>
              <p className={`text-xs font-semibold ${risk.color}`}>{risk.label}</p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-fire-500 transition-all" style={{ width: `${riskScore}%` }} />
              </div>
              <p className="mt-1 text-[9px] text-muted-foreground/50">
                Basé sur T={avgTemp}°C · HR={avgHum}% · Vent={avgWind} km/h · {hotspotsOk ? `${hotspots.length} détections` : "pas de détection"}
              </p>
            </div>

            {/* Hotspots FIRMS */}
            <div className="rounded border border-border/40 p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Satellite className="h-3 w-3 text-fire-500" /> NASA FIRMS
              </p>
              <p className={`text-[10px] ${!firmsConfigured ? "text-yellow-600/70" : "text-green-600/70"}`}>
                {firmsConfigured ? "✓ Clé configurée" : "Clé manquante — définir VITE_FIRMS_API_KEY dans Freebuff Keys UI"}
              </p>
              {firmsConfigured && (
                <>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    {hotspotsOk
                      ? `${hotspots.length} détection${hotspots.length > 1 ? "s" : ""} satellite`
                      : "Aucune détection active"}
                  </p>
                  {hotspotsOk && (
                    <div className="mt-1 text-[9px] text-muted-foreground/40">
                      FRP max : {Math.max(...hotspots.map((h) => h.frp)).toFixed(1)} MW · Dernier : {hotspots[0].acq_date}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Surfaces brûlées estimées */}
            {perimeters.length > 0 && (
              <div className="rounded border border-red-900/30 bg-red-950/10 p-2.5">
                <p className="flex items-center gap-1 text-[10px] font-medium text-red-400">
                  <Map className="h-3 w-3" /> Zones brûlées estimées
                </p>
                <div className="mt-1.5 space-y-1">
                  <p className="text-[11px] font-semibold text-red-300">
                    ~{Math.round(totalBurnedHa)} ha{" "}
                    <span className="text-[9px] font-normal text-red-400/60">
                      ({Math.round(totalBurnedHaBuf)} ha avec buffer)
                    </span>
                  </p>
                  <p className="text-[9px] text-muted-foreground/60">
                    {perimeters.length} foyer{perimeters.length > 1 ? "s" : ""} détecté{perimeters.length > 1 ? "s" : ""}
                    {confirmedFires > 0 && ` · ${confirmedFires} confirmé${confirmedFires > 1 ? "s" : ""}`}
                  </p>
                  {perimeters.slice(0, 3).map((p) => (
                    <div key={p.id} className="flex items-center justify-between border-t border-red-900/20 pt-1 text-[8px] text-muted-foreground/50">
                      <span>
                        {p.confidence === "confirmé" ? "🔥" : p.confidence === "probable" ? "⚠️" : "⚪"}{" "}
                        ~{Math.round(p.areaHa)} ha
                      </span>
                      <span>{p.detectionCount} détections · {p.lastDate}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[7px] leading-tight text-muted-foreground/30">
                  ⚠️ Estimation conservative par clustering VIIRS. Ne reflète pas la surface brûlée réelle.
                  Cliquez sur un polygone pour le détail. Sources : NASA FIRMS.
                </p>
              </div>
            )}

            {/* CDSE Sentinel-2 */}
            <div className="rounded border border-border/40 p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Trees className="h-3 w-3" /> Copernicus Sentinel-2
              </p>
              {!cdseConfigured ? (
                <p className="text-[9px] text-yellow-600/70">
                  Clés CDSE manquantes — définir VITE_CDSE_CLIENT_ID et VITE_CDSE_CLIENT_SECRET
                </p>
              ) : (
                <>
                  <p className="text-[9px] text-green-600/70">✓ Clés configurées</p>
                  <p className="mt-0.5 text-[8px] text-muted-foreground/50">
                    Activez « Satellite (Sentinel-2) » dans les couches pour voir NDVI / True Color / NDWI
                  </p>
                  <p className="mt-1 text-[7px] text-muted-foreground/30">
                    Données : ESA Copernicus · CC BY-SA 4.0
                  </p>
                </>
              )}
            </div>

            {/* Météo */}
            <div className="rounded border border-border/40 p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Thermometer className="h-3 w-3" /> Open-Meteo (AROME HD)
              </p>
              <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground/70">
                <span>🌡 {avgTemp}°C</span>
                <span>💧 {avgHum}%</span>
                <span>💨 {avgWind} km/h</span>
                <span>🌧 {weather.length ? weather[0].precip.toFixed(1) : "-"} mm</span>
              </div>
              <p className="mt-1 text-[8px] text-muted-foreground/40">MAJ {weatherTime}</p>
            </div>

            {/* Qualité de l'air */}
            <div className="rounded border border-border/40 p-2.5">
              <p className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <span className="h-3 w-3 text-center text-[8px]">🌍</span> Qualité de l'air (OpenAQ)
              </p>
              {!openaqConfigured ? (
                <p className="text-[9px] text-yellow-600/70">Clé manquante — définir VITE_OPENAQ_API_KEY dans Keys UI</p>
              ) : airQuality.pm25 === null && airQuality.pm10 === null ? (
                <p className="text-[9px] text-muted-foreground/50">Aucune donnée disponible</p>
              ) : (
                <>
                  <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground/70">
                    <span>
                      PM2.5 : {airQuality.pm25 !== null ? `${airQuality.pm25.toFixed(1)} µg/m³` : "—"}
                    </span>
                    <span>
                      PM10 : {airQuality.pm10 !== null ? `${airQuality.pm10.toFixed(1)} µg/m³` : "—"}
                    </span>
                    <span>
                      O₃ : {airQuality.o3 !== null ? `${airQuality.o3.toFixed(1)} µg/m³` : "—"}
                    </span>
                    <span>
                      NO₂ : {airQuality.no2 !== null ? `${airQuality.no2.toFixed(1)} µg/m³` : "—"}
                    </span>
                    {airQuality.aod !== null && (
                      <span>AOD : {airQuality.aod.toFixed(3)}</span>
                    )}
                    {airQuality.uvIndex !== null && (
                      <span>UV : {airQuality.uvIndex.toFixed(1)}</span>
                    )}
                  </div>
                  <p className="mt-1 text-[8px] text-muted-foreground/40">MAJ {airQuality.time}</p>
                </>
              )}
            </div>

            {/* Erreur */}
            {error && <p className="text-[10px] text-red-500">{error}</p>}

            {/* Légende */}
            <hr className="border-border/40" />
            <p className="text-[8px] leading-relaxed text-muted-foreground/30">
              ⚠️ Estimation basée sur données Open-Meteo et NASA FIRMS.
              Sans valeur opérationnelle. En cas d'incendie : 18/112.
              Sources : SDIS 33 · Préfecture · Météo-France.
              NASA FIRMS · Open-Meteo (CC BY 4.0) · IGN · © OSM contributeurs (ODbL)
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
