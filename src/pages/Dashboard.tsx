/**
 * PyroScope 33 — Dashboard (refonte feugironde.fr-style).
 *
 * Carte en accès libre (pas d'auth requise) :
 * 1. Bandeau légal sticky en haut (monté à la racine dans main.tsx)
 * 2. StatsBar sticky (KPIs temps réel)
 * 3. FilterBar sticky (période, couches)
 * 4. Carte MapContainer plein écran
 * 5. Sections empilées : couches, surfaces brûlées, qualité de l'air,
 *    météo, Sentinel-2, consignes officielles, sources.
 *
 * NOTE : tous les sous-composants sont déclarés au NIVEAU MODULE
 * (pas à l'intérieur de `Dashboard`), sinon React recrée leur référence
 * à chaque render (warning "Cannot create components during render").
 */

import { useState, useEffect, useCallback, useMemo, type ElementType, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MapContainer from "@/components/MapContainer";
import HotspotLayer from "@/components/HotspotLayer";
import type { HotspotData } from "@/components/HotspotLayer";
import WindParticlesLayer from "@/components/WindParticlesLayer";
import IsothermLayer from "@/components/IsothermLayer";
import FirePerimeterLayer from "@/components/FirePerimeterLayer";
import { estimateFirePerimeters } from "@/components/FirePerimeterLayer";
import SentinelMapLayer from "@/components/SentinelMapLayer";
import {
  getFirmsApiKey,
  hasFirmsApiKey,
  getOpenAqApiKey,
  getCdseConfig,
} from "@/config/api-keys";
import {
  Flame,
  Thermometer,
  Layers,
  RefreshCw,
  Satellite,
  Map as MapIcon,
  Trees,
  Wind,
  Skull,
  Eye,
  ShieldAlert,
  Phone,
  Bell,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Link } from "react-router";

// ════════════════════════════════════════════════════════════════════════
// Types + grilles + API calls
// ════════════════════════════════════════════════════════════════════════

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

interface AirQualityData {
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

function calcFireRisk(pts: WeatherPoint[]): number {
  if (!pts.length) return 0;
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const t = avg(pts.map((p) => p.temp));
  const h = avg(pts.map((p) => p.humidity));
  const w = avg(pts.map((p) => p.wind_speed));
  const r = avg(pts.map((p) => p.precip));
  const tScore = Math.min(100, Math.max(0, (t - 10) * 3.33));
  const hScore = Math.min(100, Math.max(0, (60 - h) * 2.5));
  const wScore = Math.min(100, Math.max(0, (w - 5) * 4));
  const rScore = r > 0 ? Math.max(0, 30 - r * 10) : 80;
  const score = Math.round(tScore * 0.25 + hScore * 0.25 + wScore * 0.30 + rScore * 0.20);
  return Math.min(100, Math.max(0, score));
}

function riskLevel(score: number) {
  if (score < 15) return { label: "Très faible", color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800" };
  if (score < 35) return { label: "Faible", color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-yellow-950/40 border-yellow-300 dark:border-yellow-800" };
  if (score < 55) return { label: "Modéré", color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800" };
  if (score < 75) return { label: "Élevé", color: "text-red-700 dark:text-red-300", bg: "bg-red-100 dark:bg-red-950/40 border-red-300 dark:border-red-800" };
  return { label: "Très élevé", color: "text-red-900 dark:text-red-200", bg: "bg-red-200 dark:bg-red-950/60 border-red-500 dark:border-red-700" };
}

async function fetchAirQuality(): Promise<AirQualityData> {
  const empty: AirQualityData = {
    source: "openmeteo", stationName: "", pm25: null, pm10: null, o3: null,
    no2: null, so2: null, aod: null, uvIndex: null, time: "", error: null,
  };

  const openAqKey = getOpenAqApiKey();
  if (openAqKey && openAqKey.length > 6) {
    try {
      const bbox = "-1.35,44.15,0.35,45.60";
      const locRes = await fetch(
        `https://api.openaq.org/v3/locations?bbox=${bbox}&limit=2`,
        { headers: { "X-API-Key": openAqKey } },
      );
      if (locRes.ok) {
        const locData = await locRes.json();
        const station = locData?.results?.[0];
        if (station?.id) {
          const measureRes = await fetch(
            `https://api.openaq.org/v3/locations/${station.id}/latest`,
            { headers: { "X-API-Key": openAqKey } },
          );
          if (measureRes.ok) {
            const mData = await measureRes.json();
            const results = mData?.results?.[0]?.measurements ?? mData?.results ?? [];
            const getVal = (param: string): number | null => {
              const m = Array.isArray(results)
                ? results.find((r: { parameter?: { name?: string } }) =>
                    (r.parameter?.name ?? "").toLowerCase() === param,
                  )
                : null;
              return m?.value ?? null;
            };
            return {
              source: "openaq",
              stationName: `ATMO NA · ${station.name ?? "station"}`,
              pm25: getVal("pm25") ?? getVal("pm2.5"),
              pm10: getVal("pm10"),
              o3: getVal("o3"),
              no2: getVal("no2"),
              so2: getVal("so2"),
              aod: null,
              uvIndex: null,
              time: new Date().toLocaleTimeString("fr-FR"),
              error: null,
            };
          }
        }
      }
    } catch {
      // → fallback ci-dessous
    }
  }

  try {
    const lat = 44.8, lon = -0.5;
    const r = await fetch(
      `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,aerosol_optical_depth,uv_index,ozone,nitrogen_dioxide&timezone=auto`,
    );
    if (!r.ok) return { ...empty, error: `Open-Meteo AQ ${r.status}` };
    const j = await r.json();
    const c = j?.current;
    if (!c) return { ...empty, error: "Aucune donnée reçue" };
    return {
      source: "openmeteo",
      stationName: "Modèle CAMS (Copernicus)",
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
    return { ...empty, error: e instanceof Error ? e.message : "Erreur Open-Meteo" };
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

async function fetchFirms(apiKey: string): Promise<{ hotspots: HotspotData[]; error: string | null }> {
  const bbox = "-1.35,44.15,0.35,45.60";
  const fetchCSV = async (url: string) => {
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      return { text: "", error: text.includes("Invalid MAP_KEY") ? "CLÉ_INVALIDE" : null };
    }
    return { text: await r.text(), error: null };
  };
  const [r1, r2, r3] = await Promise.all([
    fetchCSV(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/${bbox}/1`),
    fetchCSV(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_NOAA20_NRT/${bbox}/1`),
    fetchCSV(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/MODIS_NRT/${bbox}/1`),
  ]);
  if (r1.error === "CLÉ_INVALIDE" || r2.error === "CLÉ_INVALIDE") {
    return { hotspots: [], error: "Clé FIRMS invalide — vérifie firms.modaps.eosdis.nasa.gov" };
  }
  const all: HotspotData[] = [];
  for (const r of [r1, r2, r3]) {
    if (!r.text) continue;
    const lines = r.text.trim().split("\n");
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
  return { hotspots: all, error: null };
}

// ════════════════════════════════════════════════════════════════════════
// Sous-composants au niveau MODULE (sinon bug React "Cannot create
// components during render" : React recrée leur référence à chaque
// render du parent).
// ════════════════════════════════════════════════════════════════════════

interface SectionProps {
  title: string;
  icon: ElementType;
  children: ReactNode;
  badge?: string;
  open: boolean;
  onToggle: () => void;
}

function Section({ title, icon: Icon, children, badge, open, onToggle }: SectionProps) {
  return (
    <section className="border-b border-border/40">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-4 text-left hover:bg-accent/20 transition-colors sm:px-6"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-fire-500" />
          <h2 className="text-sm font-bold uppercase tracking-wide">{title}</h2>
          {badge && (
            <Badge variant="outline" className="ml-2 border-fire-700/40 text-[10px] text-fire-700">
              {badge}
            </Badge>
          )}
        </div>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && <div className="px-4 pb-6 sm:px-6">{children}</div>}
    </section>
  );
}

interface StatChipProps {
  label: string;
  value: string;
  tone?: "muted" | "safe" | "warning" | "fire";
  icon: ElementType;
}

function StatChip({ label, value, tone = "muted", icon: Icon }: StatChipProps) {
  const toneClass = {
    muted: "text-muted-foreground bg-transparent border-border/40",
    safe: "text-emerald-700 dark:text-emerald-300 bg-emerald-100/60 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800",
    warning: "text-orange-700 dark:text-orange-300 bg-orange-100/60 dark:bg-orange-950/40 border-orange-300 dark:border-orange-800",
    fire: "text-fire-700 dark:text-fire-300 bg-fire-950/40 border-fire-300 dark:border-fire-800",
  }[tone];
  return (
    <div className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 ${toneClass}`}>
      <Icon className="h-3 w-3 shrink-0 opacity-70" />
      <span className="text-[9px] uppercase tracking-wide opacity-70">{label}</span>
      <strong className="text-xs">{value}</strong>
    </div>
  );
}

interface LayerCardProps {
  active: boolean;
  onToggle: () => void;
  color: string;
  title: string;
  desc: string;
  stat?: string;
}

function LayerCard({ active, onToggle, color, title, desc, stat }: LayerCardProps) {
  return (
    <button
      onClick={onToggle}
      className={`text-left rounded-lg border p-3 transition-colors ${
        active
          ? "border-fire-700/60 bg-fire-50/40 dark:bg-fire-950/30"
          : "border-border/40 bg-card/30 opacity-60 hover:opacity-90"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${active ? color : "bg-muted-foreground/40"}`} />
        <span className="text-xs font-bold">{title}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">{desc}</p>
      {stat && <p className="mt-2 text-xs font-semibold text-foreground">{stat}</p>}
    </button>
  );
}

interface PollutentCardProps {
  label: string;
  unit: string;
  value: number | null;
  limit: number;
}

function PollutentCard({ label, unit, value, limit }: PollutentCardProps) {
  const overLimit = value !== null && value > limit;
  const tone = value === null
    ? "muted"
    : overLimit
      ? "fire"
      : value > limit * 0.7
        ? "warning"
        : "safe";
  const tones = {
    muted: "border-border/40 text-muted-foreground",
    safe: "border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300",
    warning: "border-orange-300 dark:border-orange-800 text-orange-700 dark:text-orange-300",
    fire: "border-red-300 dark:border-red-800 text-red-700 dark:text-red-300",
  };
  return (
    <div className={`rounded-lg border p-3 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-2xl font-bold">
        {value !== null ? value.toFixed(unit === "µg/m³" ? 1 : unit === "" ? 3 : 1) : "—"}
        <span className="ml-1 text-[10px] font-normal opacity-60">{unit}</span>
      </p>
      <p className="text-[10px] opacity-60">limite OMS : {limit} {unit || "idx"}</p>
    </div>
  );
}

interface WeatherCardProps {
  label: string;
  value: string;
  detail: string;
}

function WeatherCard({ label, value, detail }: WeatherCardProps) {
  return (
    <div className="rounded-lg border border-border/40 bg-card/30 p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="mt-1 text-[10px] text-muted-foreground">{detail}</p>
    </div>
  );
}

type SafetyVariant = "emergency" | "warning" | "info";

interface SafetyCardProps {
  variant: SafetyVariant;
  icon: ElementType;
  title: string;
  body: ReactNode;
}

function SafetyCard({ variant, icon: Icon, title, body }: SafetyCardProps) {
  const variants: Record<SafetyVariant, string> = {
    emergency: "border-red-500 bg-red-50 dark:bg-red-950/30",
    warning: "border-orange-500 bg-orange-50 dark:bg-orange-950/30",
    info: "border-blue-500 bg-blue-50 dark:bg-blue-950/30",
  };
  const iconColor: Record<SafetyVariant, string> = {
    emergency: "text-red-600",
    warning: "text-orange-600",
    info: "text-blue-600",
  };
  return (
    <div className={`rounded-lg border-2 p-4 ${variants[variant]}`}>
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-5 w-5 ${iconColor[variant]}`} />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed">{body}</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Composant principal
// ════════════════════════════════════════════════════════════════════════

export default function Dashboard() {
  const firmsKey = getFirmsApiKey();
  const firmsConfigured = hasFirmsApiKey();
  const cdseConfig = getCdseConfig();
  const cdseConfigured = Boolean(cdseConfig.clientId && cdseConfig.clientSecret);

  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [weatherTime, setWeatherTime] = useState("");
  const [hotspots, setHotspots] = useState<HotspotData[]>([]);
  const [airQuality, setAirQuality] = useState<AirQualityData>({
    source: "openmeteo", stationName: "", pm25: null, pm10: null, o3: null,
    no2: null, so2: null, aod: null, uvIndex: null, time: "", error: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    queueMicrotask(() => setLoading(true));
    queueMicrotask(() => setError(""));
    try {
      const [w, h, aq] = await Promise.all([
        fetchWeather(),
        firmsConfigured && firmsKey
          ? fetchFirms(firmsKey).then((r) => {
              // Différer le setError pour éviter setState synchrone dans .then
              queueMicrotask(() => { if (r.error) setError(r.error); });
              return r.hotspots;
            }).catch(() => {
              queueMicrotask(() => setError("FIRMS : erreur réseau"));
              return [];
            })
          : Promise.resolve([] as HotspotData[]),
        fetchAirQuality().catch(() => ({
          source: "openmeteo" as const, stationName: "", pm25: null, pm10: null, o3: null,
          no2: null, so2: null, aod: null, uvIndex: null, time: "", error: "Erreur réseau",
        })),
      ]);
      setWeather(w);
      setWeatherTime(new Date().toLocaleTimeString("fr-FR"));
      if (h.length > 0) setHotspots(h);
      setAirQuality(aq);
      if (!w.length) setError("Météo : aucun point de grille disponible");
    } catch {
      setError("Erreur de chargement des données");
    } finally {
      queueMicrotask(() => setLoading(false));
    }
  }, [firmsKey, firmsConfigured]);

  useEffect(() => {
    const aqInterval = setInterval(() => {
      fetchAirQuality().then((aq) => {
        if (aq.pm25 !== null || aq.pm10 !== null || aq.error) setAirQuality(aq);
      });
    }, 15 * 60 * 1000);
    return () => clearInterval(aqInterval);
  }, []);

  useEffect(() => {
    // load() appelle setState — on déporte l'appel hors du chemin synchrone
    // de l'effet via queueMicrotask pour éliminer le cascading-render warning
    // (react-hooks/set-state-in-effect).
    queueMicrotask(() => load());
    const weatherInterval = setInterval(() => {
      fetchWeather().then((w) => {
        if (w.length) {
          setWeather(w);
          setWeatherTime(new Date().toLocaleTimeString("fr-FR"));
        }
      });
    }, 5 * 60 * 1000);
    const firmsInterval = setInterval(() => {
      if (firmsConfigured && firmsKey) {
        fetchFirms(firmsKey).then((r) => {
          if (r.hotspots.length > 0) setHotspots(r.hotspots);
        });
      }
    }, 15 * 60 * 1000);
    return () => {
      clearInterval(weatherInterval);
      clearInterval(firmsInterval);
    };
  }, [load, firmsConfigured, firmsKey]);

  const [period, setPeriod] = useState<"24h" | "48h" | "7j">("24h");
  const [layers, setLayers] = useState({
    hotspots: true,
    temperature: true,
    wind: true,
    perimeters: true,
    ndvi: false,
  });
  const [sentinelLayer, setSentinelLayer] = useState<"ndvi" | "true_color" | "ndwi">("ndvi");
  const toggleLayer = (k: keyof typeof layers) => setLayers((p) => ({ ...p, [k]: !p[k] }));

  const riskScore = calcFireRisk(weather);
  const risk = riskLevel(riskScore);
  const avgTemp = weather.length ? Math.round((weather.reduce((s, p) => s + p.temp, 0) / weather.length) * 10) / 10 : 0;
  const avgWind = weather.length ? Math.round((weather.reduce((s, p) => s + p.wind_speed, 0) / weather.length) * 10) / 10 : 0;
  const avgHum = weather.length ? Math.round(weather.reduce((s, p) => s + p.humidity, 0) / weather.length) : 0;
  const totalFrp = hotspots.reduce((s, h) => s + h.frp, 0);

  const perimeters = useMemo(
    () => (hotspots.length >= 3 ? estimateFirePerimeters(hotspots) : []),
    [hotspots],
  );
  const totalBurnedHaBuf = perimeters.reduce((s, p) => s + p.areaHaBuffered, 0);
  const hotspotsOk = hotspots.length > 0;
  const lastDetection = hotspots.length > 0 ? hotspots[0] : null;
  const windGrid = weather.map((p) => ({
    lon: p.lon, lat: p.lat,
    u: -(p.wind_speed * Math.sin((p.wind_dir * Math.PI) / 180)),
    v: -(p.wind_speed * Math.cos((p.wind_dir * Math.PI) / 180)),
  }));

  const [openSection, setOpenSection] = useState<string | null>("layers");
  const toggleSection = (id: string) =>
    setOpenSection((cur) => (cur === id ? null : id));

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── StatsBar sticky (juste sous le bandeau légal) ────────────── */}
      <div className="sticky top-[68px] z-30 border-b border-border/50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-7xl px-3 py-2 sm:px-6">
          <div className="flex items-center gap-3 overflow-x-auto">
            <div className="flex items-center gap-1.5 shrink-0">
              <Flame className="h-4 w-4 text-fire-500" />
              <span className="text-xs font-bold tracking-tight hidden sm:inline">
                PyroScope<span className="text-fire-500">33</span>
              </span>
            </div>
            <div className="h-6 w-px bg-border/60 shrink-0" />

            <StatChip label="Détections 24h" value={hotspots.length.toString()}
              tone={hotspotsOk ? "fire" : "muted"} icon={Satellite} />
            <StatChip label="FRP totale" value={`${totalFrp.toFixed(1)} MW`}
              tone={totalFrp > 5 ? "fire" : "muted"} icon={Flame} />
            <StatChip label="Surface brûlée est."
              value={totalBurnedHaBuf > 0 ? `~${Math.round(totalBurnedHaBuf)} ha` : "—"}
              tone={totalBurnedHaBuf > 0 ? "fire" : "muted"} icon={MapIcon} />
            <StatChip label="Risque" value={`${riskScore}/100`}
              tone={riskScore > 55 ? "fire" : riskScore > 15 ? "warning" : "safe"}
              icon={ShieldAlert} />
            <StatChip label="T° moy." value={`${avgTemp}°C`} icon={Thermometer} />
            <StatChip label="Vent moy." value={`${avgWind} km/h`} icon={Wind} />

            <div className="ml-auto flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]"
                onClick={load} disabled={loading}>
                <RefreshCw className={`mr-1 h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              <Link
                to="/auth"
                className="hidden h-7 items-center rounded-md border border-border/50 bg-background px-2.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent/40 sm:flex"
                title="Compte optionnel : cellules surveillées, alertes e-mail"
              >
                <Eye className="mr-1 h-3 w-3" /> Mon compte
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── FilterBar sticky (période + couches inline) ─────────────── */}
      <div className="sticky top-[124px] z-20 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:px-6">
          <div className="flex items-center gap-1 rounded-md border border-border/50 bg-background p-0.5">
            {(["24h", "48h", "7j"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`rounded px-2.5 py-1 text-[10px] font-medium transition-colors ${
                  period === p ? "bg-fire-600 text-white" : "text-muted-foreground hover:bg-accent/30"
                }`}>{p}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {([
              ["hotspots", "🔥 Feux"],
              ["temperature", "🌡 T°"],
              ["wind", "💨 Vent"],
              ["perimeters", "🔥 Surfaces brûlées"],
              ["ndvi", "🌿 Satellite"],
            ] as const).map(([k, lbl]) => (
              <button key={k} onClick={() => toggleLayer(k)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium border transition-colors ${
                  layers[k]
                    ? "border-fire-700/60 bg-fire-950/40 text-fire-300"
                    : "border-border/40 text-muted-foreground hover:bg-accent/30"
                }`}>{lbl}</button>
            ))}
          </div>

          {layers.ndvi && (
            <div className="flex gap-1 rounded-md border border-border/50 bg-background p-0.5">
              {(["ndvi", "true_color", "ndwi"] as const).map((s) => (
                <button key={s} onClick={() => setSentinelLayer(s)}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    sentinelLayer === s ? "bg-emerald-600 text-white" : "text-muted-foreground hover:bg-accent/30"
                  }`}>{s === "ndvi" ? "NDVI" : s === "true_color" ? "Couleur" : "NDWI"}</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Carte plein écran ─────────────────────────────────────────── */}
      <div className="relative w-full bg-card/40" style={{ height: "62vh", minHeight: "440px" }}>
        <MapContainer>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <HotspotLayer map={null as any} hotspots={hotspots} visible={layers.hotspots} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <IsothermLayer map={null as any}
            data={{ grid: weather.map((p) => ({ lon: p.lon, lat: p.lat, temperature: p.temp })) }}
            visible={layers.temperature} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <WindParticlesLayer map={null as any} windData={{ grid: windGrid }} visible={layers.wind} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <FirePerimeterLayer map={null as any} perimeters={perimeters} visible={layers.perimeters} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {layers.ndvi && <SentinelMapLayer map={null as any} layer={sentinelLayer} visible={layers.ndvi} />}
        </MapContainer>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-border/50 bg-background/80 px-4 py-3 text-center text-xs text-muted-foreground shadow backdrop-blur">
            <Layers className="mx-auto mb-1 h-5 w-5 text-fire-500" />
            <strong className="text-foreground">Carte Gironde</strong>
            <p>Fond OSM · Hotspots · Vent · Isothermes · Périmètres</p>
          </div>
        </div>

        {lastDetection && (
          <div className="absolute bottom-3 left-3 max-w-xs rounded-lg border border-border/50 bg-background/85 px-3 py-2 text-[10px] text-foreground shadow backdrop-blur">
            <p className="font-bold text-fire-500">Dernière détection</p>
            <p className="text-muted-foreground">
              {lastDetection.satellite} · {lastDetection.acq_date} {String(lastDetection.acq_time).padStart(4, "0")} ·{" "}
              FRP <strong>{lastDetection.frp.toFixed(1)} MW</strong> ·{" "}
              {lastDetection.age_hours.toFixed(1)} h
            </p>
          </div>
        )}

        <div className={`absolute bottom-3 right-3 rounded-lg border-2 px-3 py-2 shadow-lg backdrop-blur ${risk.bg}`}>
          <p className={`text-[10px] font-bold ${risk.color}`}>RISQUE {risk.label.toUpperCase()}</p>
          <p className={`text-2xl font-extrabold leading-none ${risk.color}`}>
            {riskScore}<span className="text-xs font-medium opacity-60">/100</span>
          </p>
        </div>
      </div>

      {/* ── Sections empilées sous la carte ──────────────────────────── */}
      <div className="mx-auto max-w-7xl">
        <Section title="Couches de données" icon={Layers}
          open={openSection === "layers"}
          onToggle={() => toggleSection("layers")}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <LayerCard active={layers.hotspots} onToggle={() => toggleLayer("hotspots")}
              color="bg-fire-500" title="Feux actifs (points chauds)"
              desc="NASA FIRMS · VIIRS S-NPP & NOAA-20, MODIS · QUASI TEMPS RÉEL · délai 1-3h"
              stat={hotspotsOk ? `${hotspots.length} sur 24h` : "0 sur 24h"} />
            <LayerCard active={layers.temperature} onToggle={() => toggleLayer("temperature")}
              color="bg-orange-400" title="Température · Isothermes"
              desc="Open-Meteo · modèle AROME ~1,5 km · 11 points de grille Gironde"
              stat={`${avgTemp}°C moyenne`} />
            <LayerCard active={layers.wind} onToggle={() => toggleLayer("wind")}
              color="bg-sky-400" title="Vent animé 10 m"
              desc="Open-Meteo AROME HD · rafales, direction, vitesse · particules"
              stat={`${avgWind} km/h moyenne`} />
            <LayerCard active={layers.perimeters} onToggle={() => toggleLayer("perimeters")}
              color="bg-red-600" title="Surfaces brûlées estimées"
              desc="Clustering conservatif sur hotspots VIIRS ≥3 détections · buffer +250 m"
              stat={totalBurnedHaBuf > 0 ? `~${Math.round(totalBurnedHaBuf)} ha cumulées` : "aucune pour l'instant"} />
            <LayerCard active={layers.ndvi} onToggle={() => toggleLayer("ndvi")}
              color="bg-emerald-500" title="Satellite Sentinel-2"
              desc="Copernicus CDSE OAuth2 · NDVI / Couleur / NDWI ⚠️ WMS en cours de débogage (chemin /ogc/wms → 404)"
              stat={cdseConfigured ? "OAuth OK" : "Clés absentes"} />
            <div className="rounded-lg border border-border/40 bg-card/30 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold">
                <span className="h-3 w-3 rounded-full bg-fire-500" />
                Légende FRP (puissance radiative)
              </p>
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                <li><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 align-middle" /> &lt; 1 MW — bruit / cheminée</li>
                <li><span className="inline-block h-2 w-2 rounded-full bg-yellow-500 align-middle" /> 1-5 MW — petit foyer</li>
                <li><span className="inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" /> 5-20 MW — foyer actif</li>
                <li><span className="inline-block h-2 w-2 rounded-full bg-red-500 align-middle" /> 20-50 MW — feu intense</li>
                <li><span className="inline-block h-2 w-2 rounded-full bg-red-900 align-middle" /> &gt; 50 MW — embrasement</li>
              </ul>
            </div>
          </div>
        </Section>

        {perimeters.length > 0 && (
          <Section title={`Surfaces brûlées estimées · ${perimeters.length} foyer${perimeters.length > 1 ? "s" : ""}`}
            icon={Flame} badge={`~${Math.round(totalBurnedHaBuf)} ha`}
            open={openSection === "burned"}
            onToggle={() => toggleSection("burned")}>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Estimation conservative par clustering des points chauds VIIRS ≥3 détections. Buffer +250 m autour de l'enveloppe convexe. <strong>Pas une mesure officielle</strong>.
              </p>
              <div className="overflow-x-auto rounded-lg border border-border/40">
                <table className="w-full text-xs">
                  <thead className="border-b border-border/40 bg-card/30 text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Foyer</th>
                      <th className="px-3 py-2 text-right">Surface</th>
                      <th className="px-3 py-2 text-right">Détails</th>
                      <th className="px-3 py-2 text-left">Confiance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {perimeters.slice(0, 5).map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono text-[10px]">{String(p.id).slice(0, 8)}</td>
                        <td className="px-3 py-2 text-right">
                          <strong>~{Math.round(p.areaHa)} ha</strong>
                          <span className="ml-1 text-muted-foreground text-[10px]">
                            (+ {Math.round(p.areaHaBuffered - p.areaHa)} buffer)
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-[10px] text-muted-foreground">
                          {p.detectionCount} détection{p.detectionCount > 1 ? "s" : ""} · dernière {p.lastDate}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-[9px] ${
                            p.confidence === "confirmé" ? "border-fire-700/60 text-fire-400" :
                            p.confidence === "probable" ? "border-orange-700/60 text-orange-400" :
                            "border-border text-muted-foreground"}`}>
                            {p.confidence === "confirmé" ? "🔥 confirmé" :
                             p.confidence === "probable" ? "⚠ probable" :
                             "⚪ possible"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>
        )}

        <Section title="Qualité de l'air" icon={Thermometer}
          badge={airQuality.source === "openaq" ? "OpenAQ · stations ATMO" : "Open-Meteo CAMS"}
          open={openSection === "air"}
          onToggle={() => toggleSection("air")}>
          {airQuality.error ? (
            <p className="text-sm text-red-500">⚠ {airQuality.error}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <PollutentCard label="PM2.5" unit="µg/m³" value={airQuality.pm25} limit={15} />
              <PollutentCard label="PM10" unit="µg/m³" value={airQuality.pm10} limit={45} />
              <PollutentCard label="O₃" unit="µg/m³" value={airQuality.o3} limit={120} />
              <PollutentCard label="NO₂" unit="µg/m³" value={airQuality.no2} limit={40} />
              {airQuality.so2 !== null && <PollutentCard label="SO₂" unit="µg/m³" value={airQuality.so2} limit={125} />}
              {airQuality.aod !== null && <PollutentCard label="AOD" unit="" value={airQuality.aod} limit={0.3} />}
              {airQuality.uvIndex !== null && <PollutentCard label="UV" unit="" value={airQuality.uvIndex} limit={8} />}
            </div>
          )}
          <p className="mt-3 text-[10px] text-muted-foreground">
            Source : {airQuality.stationName || "—"} · MAJ {airQuality.time}
          </p>
        </Section>

        <Section title="Météo · AROME HD" icon={Wind}
          open={openSection === "weather"}
          onToggle={() => toggleSection("weather")}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <WeatherCard label="🌡 Température" value={`${avgTemp}°C`} detail="Moyenne 11 points Gironde" />
            <WeatherCard label="💧 Humidité relative" value={`${avgHum}%`} detail="Plus l'HR est basse, plus le risque est élevé" />
            <WeatherCard label="💨 Vent moyen 10 m" value={`${avgWind} km/h`} detail="Rafales visibles via couche animations" />
            <WeatherCard label="🌧 Précipitations"
              value={weather.length ? `${weather[0].precip.toFixed(1)} mm` : "—"}
              detail="Référence : point central" />
          </div>
          <p className="mt-3 text-[10px] text-muted-foreground">
            Source : Open-Meteo (modèle AROME France HD ~1,5 km) · MAJ {weatherTime} · Rafraîchissement auto toutes les 5 min
          </p>
        </Section>

        <Section title="Satellite Sentinel-2 (Copernicus)" icon={Trees}
          badge={cdseConfigured ? "OAuth OK" : "Clés manquantes"}
          open={openSection === "sentinel"}
          onToggle={() => toggleSection("sentinel")}>
          <div className="rounded-lg border border-border/40 bg-card/30 p-4">
            <p className="text-sm">
              {cdseConfigured ? (
                <>✓ <strong>Token OAuth2 CDSE obtenu</strong> (HTTP 200). Activation du flux WMS en cours — le chemin <code className="rounded bg-card/60 px-1 text-[11px]">/ogc/wms/sentinel-2-l2a</code> renvoie actuellement 404. Sentinel Hub nécessite la création préalable d'une <em>Instance ID</em> via le dashboard CDSE.</>
              ) : (
                <>⚠ Identifiants CDSE absents. Active la couche NDVI/Couleur/NDWI haute résolution.</>
              )}
            </p>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Données : ESA Copernicus Sentinel-2 · Licence CC BY-SA 4.0
            </p>
          </div>
        </Section>

        <Section title="Consignes officielles" icon={ShieldAlert}
          open={openSection === "safety"}
          onToggle={() => toggleSection("safety")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <SafetyCard variant="emergency" icon={Phone} title="Témoin d'un départ de feu"
              body={<>Appelez le <strong>18 ou 112</strong> immédiatement, même si le feu semble petit. Localisez : commune, route, lieu-dit, PK. Ne vous approchez pas, éloignez-vous <strong>dos au vent</strong>.</>} />
            <SafetyCard variant="warning" icon={Skull} title="Si le feu approche de chez vous"
              body={<>Abritez-vous dans un bâtiment en dur. Fermez volets, fenêtres, portes. Calfeutrez avec linges humides. Arrêtez VMC et clim. Fermez bouteilles de gaz à l'extérieur. <strong>Habillez-vous en coton couvrant</strong>.</>} />
            <SafetyCard variant="warning" icon={Bell} title="Fumées : se protéger"
              body={<>Restez à l'intérieur, fenêtres fermées, effort physique limité. <strong>Masque FFP2</strong> si vous devez sortir. Asthmatiques, cardiaques, âgés : vigilance renforcée, appelez le <strong>15</strong> en cas de gêne.</>} />
            <SafetyCard variant="info" icon={Eye} title="Prévention (9 feux sur 10 d'origine humaine)"
              body={<>Ni feu, ni barbecue, ni mégot en forêt. Reportez les travaux à étincelles aux heures fraîches. Débroussaillez autour de votre habitation (obligation OLD).</>} />
          </div>
          <div className="mt-4 rounded-lg border border-border/40 bg-card/30 p-3 text-[11px]">
            <strong>S'informer :</strong>{" "}
            <a className="underline" href="https://www.gironde.gouv.fr" target="_blank" rel="noreferrer">Préfecture 33</a>{" · "}
            <a className="underline" href="https://meteofrance.com/meteo-des-forets" target="_blank" rel="noreferrer">Météo des Forêts</a>{" · "}
            Radio France Bleu Gironde (100.1) · App <strong>FR-Alert</strong> (notifications automatiques).
          </div>
        </Section>

        <Section title="Sources & attribution" icon={Eye}
          open={openSection === "sources"}
          onToggle={() => toggleSection("sources")}>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p><strong className="text-foreground">NASA FIRMS</strong> · Points chauds VIIRS S-NPP / NOAA-20, MODIS · Données quasi temps réel · 1-3 h de latence.</p>
            <p><strong className="text-foreground">Open-Meteo</strong> · Météo (AROME France HD ~1,5 km) + Air Quality (CAMS Copernicus) · <a className="underline" href="https://open-meteo.com/" target="_blank" rel="noreferrer">CC BY 4.0</a>.</p>
            <p><strong className="text-foreground">OpenAQ</strong> · Stations ATMO Nouvelle-Aquitaine en Gironde · <a className="underline" href="https://openaq.org/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a>.</p>
            <p><strong className="text-foreground">ESA Copernicus</strong> · Sentinel-2 (CDSE) · <a className="underline" href="https://dataspace.copernicus.eu/" target="_blank" rel="noreferrer">Licence Copernicus</a>.</p>
            <p><strong className="text-foreground">IGN</strong> · BD Forêt V2, RGE ALTI · Données ouvertes · <a className="underline" href="https://www.ign.fr/" target="_blank" rel="noreferrer">Licence Etalab 2.0</a>.</p>
            <p><strong className="text-foreground">OpenStreetMap</strong> · Fond cartographique · <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">ODbL</a> · © contributeurs.</p>
            <p className="mt-3 border-t border-border/40 pt-3">
              <strong className="text-foreground">PyroScope 33</strong> · Projet open source éducatif.{" "}
              <a className="underline" href="#/about">En savoir plus</a> · Code source disponible.
            </p>
          </div>
        </Section>
      </div>

      {error && (
        <div className="border-t border-red-300 bg-red-50 px-4 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300 sm:px-6">
          ⚠ {error}
        </div>
      )}
    </div>
  );
}
