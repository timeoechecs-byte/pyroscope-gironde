/**
 * PyroScope 33 — Dashboard (authenticated).
 *
 * Données réelles uniquement :
 * - Open-Meteo API (sans clé) → météo, vent, température
 * - NASA FIRMS API (clé utilisateur) → hotspots satellite
 * - Fonds de carte OSM / IGN
 *
 * Zéro simulation, zéro donnée d'exemple, zéro badge « Backend requis ».
 */

import { useState, useEffect, useCallback } from "react";
import type * as maplibregl from "maplibre-gl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import MapContainer from "@/components/MapContainer";
import HotspotLayer from "@/components/HotspotLayer";
import type { HotspotData } from "@/components/HotspotLayer";
import WindParticlesLayer from "@/components/WindParticlesLayer";
import IsothermLayer from "@/components/IsothermLayer";
import CrisisBanner from "@/components/CrisisBanner";
import ZoneAlertPanel from "@/components/ZoneAlertPanel";
import ExportPanel from "@/components/ExportPanel";
import {
  Flame,
  LogOut,
  Thermometer,
  Wind,
  Layers,
  Info,
  SlidersHorizontal,
  Bell,
  Download,
  PanelRightClose,
  PanelRightOpen,
  RefreshCw,
  Satellite,
} from "lucide-react";
import { useNavigate } from "react-router";

// ── Constantes Gironde ──────────────────────────────────────────────────

// ── Points de grille météo (grille régulière ~10 km sur la Gironde) ────
const WEATHER_POINTS = [
  { lat: 44.3, lon: -1.2 }, { lat: 44.3, lon: -0.7 }, { lat: 44.3, lon: -0.2 },
  { lat: 44.7, lon: -1.2 }, { lat: 44.7, lon: -0.7 }, { lat: 44.7, lon: -0.2 },
  { lat: 45.1, lon: -1.2 }, { lat: 45.1, lon: -0.7 }, { lat: 45.1, lon: -0.2 },
  { lat: 45.4, lon: -1.0 }, { lat: 45.4, lon: -0.5 },
];

interface LayerToggle {
  id: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
}

interface WeatherData {
  time: string;
  temperature_2m: number;
  relative_humidity_2m: number;
  precipitation: number;
  wind_speed_10m: number;
  wind_direction_10m: number;
  wind_gusts_10m: number;
}

interface WeatherGridPoint {
  lat: number;
  lon: number;
  data: WeatherData | null;
}

// ── Hooks API ──────────────────────────────────────────────────────────

/** Récupère la météo Open-Meteo pour un point donné. */
function fetchWeatherAt(lat: number, lon: number): Promise<WeatherData | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=auto`;
  return fetch(url)
    .then((r) => {
      if (!r.ok) return null;
      return r.json();
    })
    .then((json) => {
      if (!json?.current) return null;
      return {
        time: json.current.time,
        temperature_2m: json.current.temperature_2m,
        relative_humidity_2m: json.current.relative_humidity_2m,
        precipitation: json.current.precipitation ?? 0,
        wind_speed_10m: json.current.wind_speed_10m,
        wind_direction_10m: json.current.wind_direction_10m,
        wind_gusts_10m: json.current.wind_gusts_10m,
      };
    })
    .catch(() => null);
}

/** Récupère les hotspots NASA FIRMS pour la Gironde. */
function fetchFirmsHotspots(apiKey: string): Promise<HotspotData[]> {
  const bbox = "-1.35,44.15,0.35,45.60";
  // On essaie VIIRS SNPP + NOAA20
  const urls = [
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_SNPP_NRT/1/${bbox}`,
    `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${apiKey}/VIIRS_NOAA20_NRT/1/${bbox}`,
  ];

  return Promise.all(
    urls.map((url) =>
      fetch(url)
        .then((r) => (r.ok ? r.text() : ""))
        .catch(() => ""),
    ),
  ).then(([csv1, csv2]) => {
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

        const frp = parseFloat(row.frp ?? "0");
        const lat = parseFloat(row.latitude ?? "0");
        const lon = parseFloat(row.longitude ?? "0");
        const confidence = row.confidence ?? "low";

        // Vérifier bbox
        if (lat < 44.15 || lat > 45.60 || lon < -1.35 || lon > 0.35) continue;

        // Calculer l'âge en heures
        const acqDate = row.acq_date ?? "";
        const acqTimeRaw = row.acq_time ?? "0000";
        const hh = parseInt(acqTimeRaw.substring(0, 2), 10) || 0;
        const mm = parseInt(acqTimeRaw.substring(2, 4), 10) || 0;
        const acqTimeNum = hh * 100 + mm;
        const acqDateTime = new Date(acqDate + "T" + String(hh).padStart(2, "0") + ":" + String(mm).padStart(2, "0") + ":00Z");
        const ageHours = isNaN(acqDateTime.getTime()) ? 0 : (Date.now() - acqDateTime.getTime()) / 3600000;

        all.push({
          lat,
          lon,
          acq_date: acqDate,
          acq_time: acqTimeNum,
          satellite: row.satellite ?? "VIIRS",
          confidence: (confidence === "n" ? "nominal" : confidence) as "low" | "nominal" | "high",
          frp,
          daynight: row.daynight ?? "D",
          age_hours: Math.round(ageHours * 10) / 10,
        });
      }
    }
    // Trier par FRP décroissant
    all.sort((a, b) => b.frp - a.frp);
    return all;
  });
}

// ── Composant ──────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // ── Sources config ────────────────────────────────────────────────────
  const [firmsApiKey] = useState(() => {
    // L'utilisateur peut stocker sa clé FIRMS via l'interface Keys
    // Valeur par défaut : tentative depuis env ou localStorage
    return (import.meta as any).env?.VITE_FIRMS_API_KEY ?? localStorage.getItem("pyroscope_firms_key") ?? "";
  });
  const [firmsKeyInput, setFirmsKeyInput] = useState(firmsApiKey);

  // ── Hotspots (FIRMS) ────────────────────────────────────────────────
  const [hotspots, setHotspots] = useState<HotspotData[]>([]);
  const [hotspotsLoading, setHotspotsLoading] = useState(false);
  const [hotspotsError, setHotspotsError] = useState<string | null>(null);
  const [hotspotsLastUpdate, setHotspotsLastUpdate] = useState<string | null>(null);

  const loadHotspots = useCallback(async (key: string) => {
    if (!key) {
      setHotspotsError("Clé API NASA FIRMS manquante — ajoutez-la dans les paramètres");
      return;
    }
    setHotspotsLoading(true);
    setHotspotsError(null);
    try {
      const data = await fetchFirmsHotspots(key);
      setHotspots(data);
      setHotspotsLastUpdate(new Date().toISOString());
      if (data.length === 0) {
        setHotspotsError("Aucun point chaud détecté sur la Gironde dans les dernières 24h");
      }
    } catch {
      setHotspotsError("Erreur de chargement NASA FIRMS");
    } finally {
      setHotspotsLoading(false);
    }
  }, []);

  // ── Weather grid (Open-Meteo) ───────────────────────────────────────
  const [weatherGrid, setWeatherGrid] = useState<WeatherGridPoint[]>([]);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState<string | null>(null);
  const [weatherLastUpdate, setWeatherLastUpdate] = useState<string | null>(null);

  const loadWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    try {
      const results = await Promise.all(
        WEATHER_POINTS.map((p) => fetchWeatherAt(p.lat, p.lon)),
      );
      setWeatherGrid(
        WEATHER_POINTS.map((p, i) => ({ ...p, data: results[i] })),
      );
      setWeatherLastUpdate(new Date().toISOString());
    } catch {
      setWeatherError("Erreur de chargement Open-Meteo");
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  // ── Premiers chargements ────────────────────────────────────────────
  useEffect(() => {
    loadWeather();
    if (firmsApiKey) loadHotspots(firmsApiKey);
  }, []);

  // ── Filtres ────────────────────────────────────────────────────────
  const [periodHours, setPeriodHours] = useState(48);
  const [minConfidence, setMinConfidence] = useState<"low" | "nominal" | "high">("low");
  const [minFrp, setMinFrp] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCell] = useState<{ lat: number; lon: number } | null>(null);

  // ── Crisis ──────────────────────────────────────────────────────────
  const [crisisConfig] = useState({
    active: false,
    activated_at: null as string | null,
    degraded_layers: ["simulation", "ellipses", "alerts"] as string[],
    notification_blocked: false,
  });

  // ── Alertes ─────────────────────────────────────────────────────────
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [watchedCells] = useState<Array<{
    id: string; lat: number; lon: number; label: string;
    thresholdIgnition: number; thresholdSpread: number; thresholdFWI: number;
    pushEnabled: boolean; lastAlert: string | null; triggered: boolean;
  }>>([]);

  // ── UI ──────────────────────────────────────────────────────────────
  const [exportOpen, setExportOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [layers, setLayers] = useState<LayerToggle[]>([
    { id: "hotspots", label: "Points chauds satellite", icon: Satellite, enabled: true },
    { id: "temperature", label: "Température", icon: Thermometer, enabled: true },
    { id: "wind", label: "Vent animé", icon: Wind, enabled: true },
  ]);

  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
    );
  };

  // ── Hotspots filtrés ──────────────────────────────────────────────
  const filteredHotspots = hotspots.filter((h) => {
    if (minConfidence === "high" && h.confidence !== "high") return false;
    if (minConfidence === "nominal" && h.confidence === "low") return false;
    if (h.frp < minFrp) return false;
    return true;
  });

  // ── Données vent pour les particules ──────────────────────────────
  const windData = weatherGrid
    .filter((p) => p.data)
    .map((p) => ({
      lat: p.lat,
      lon: p.lon,
      wind_u: -(p.data!.wind_speed_10m * Math.sin((p.data!.wind_direction_10m * Math.PI) / 180)),
      wind_v: -(p.data!.wind_speed_10m * Math.cos((p.data!.wind_direction_10m * Math.PI) / 180)),
      speed: p.data!.wind_speed_10m,
    }));

  // ── Température moyenne ───────────────────────────────────────────
  const avgTemp = weatherGrid
    .filter((p) => p.data)
    .reduce((sum, p) => sum + p.data!.temperature_2m, 0) /
    (weatherGrid.filter((p) => p.data).length || 1);

  const hotspotCount = filteredHotspots.length;
  const hotspotLayerEnabled = layers.find((l) => l.id === "hotspots")?.enabled ?? false;
  const tempLayerEnabled = layers.find((l) => l.id === "temperature")?.enabled ?? false;
  const windLayerEnabled = layers.find((l) => l.id === "wind")?.enabled ?? false;

  const handleSaveFirmsKey = () => {
    localStorage.setItem("pyroscope_firms_key", firmsKeyInput);
    loadHotspots(firmsKeyInput);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/90 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden text-muted-foreground -ml-1"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? "Fermer" : "Ouvrir"}
            >
              {sidebarOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
            </Button>
            <Flame className="h-5 w-5 text-fire-500" />
            <span className="text-sm font-semibold tracking-tight">
              PyroScope<span className="text-fire-500">33</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Statut sources */}
            <div className="hidden items-center gap-2 md:flex">
              <div className={`h-2 w-2 rounded-full ${hotspots.length > 0 ? "bg-green-500" : hotspotsError ? "bg-red-500" : "bg-amber-500"}`} />
              <span className="text-xs text-muted-foreground">
                {hotspots.length > 0 ? `${hotspotCount} hotspots` : hotspotsError ? "FIRMS erreur" : "… FIRMS"}
              </span>
              <div className={`h-2 w-2 rounded-full ${weatherGrid.some((p) => p.data) ? "bg-green-500" : weatherError ? "bg-red-500" : "bg-amber-500"}`} />
              <span className="text-xs text-muted-foreground">
                {weatherGrid.some((p) => p.data) ? `${avgTemp.toFixed(1)}°C` : weatherError ? "Météo erreur" : "… Météo"}
              </span>
            </div>
            <span className="hidden sm:inline text-xs text-muted-foreground">
              {user?.email ?? "Invité"}
            </span>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* ── Mobile overlay ─────────────────────────────────────── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden="true" />
      )}

      {/* ── Layout principal ───────────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ── Carte ───────────────────────────────────────────── */}

        <main className="relative flex flex-1 flex-col">
          <MapContainer>
            <HotspotLayer
              map={null as unknown as maplibregl.Map}
              hotspots={filteredHotspots}
              visible={hotspotLayerEnabled}
            />
            <IsothermLayer
              map={null as unknown as maplibregl.Map}
              data={{
                grid: weatherGrid
                  .filter((p) => p.data)
                  .map((p) => ({
                    lon: p.lon,
                    lat: p.lat,
                    temperature: p.data!.temperature_2m,
                  })),
              }}
              visible={tempLayerEnabled}
            />
            <WindParticlesLayer
              map={null as unknown as maplibregl.Map}
              windData={{
                grid: windData.map((w) => ({
                  lon: w.lon,
                  lat: w.lat,
                  u: w.wind_u,
                  v: w.wind_v,
                })),
              }}
              visible={windLayerEnabled}
            />
          </MapContainer>

          {/* ── Refresh overlay ───────────────────────────────── */}
          <div className="absolute left-3 top-3 z-20 flex flex-wrap gap-1">
            <Button
              variant="secondary"
              size="sm"
              className="h-7 bg-background/90 px-2 text-[10px] backdrop-blur-sm"
              onClick={() => { loadWeather(); if (firmsApiKey) loadHotspots(firmsApiKey); }}
              disabled={weatherLoading || hotspotsLoading}
            >
              <RefreshCw className={`mr-1 h-3 w-3 ${weatherLoading || hotspotsLoading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </div>

          {/* ── Filtres ───────────────────────────────────────── */}
          <div className="absolute right-3 top-3 z-20">
            <Button
              variant="secondary"
              size="sm"
              className="gap-2 bg-background/90 backdrop-blur-sm shadow-sm"
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Filtres</span>
            </Button>
          </div>

          {filterOpen && (
            <div className="absolute right-3 top-12 z-20 w-64 rounded-lg border border-border/50 bg-background/95 p-4 shadow-lg backdrop-blur-sm">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filtres hotspots
              </h4>
              <div className="mb-3">
                <Label className="text-xs text-muted-foreground">
                  Période : {periodHours}h
                </Label>
                <div className="mt-1 flex gap-1">
                  {[24, 48, 168].map((h) => (
                    <Button
                      key={h}
                      variant={periodHours === h ? "default" : "outline"}
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => setPeriodHours(h)}
                    >
                      {h === 24 ? "24h" : h === 48 ? "48h" : "7j"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <Label className="text-xs text-muted-foreground">Confiance min.</Label>
                <div className="mt-1 flex gap-1">
                  {(["low", "nominal", "high"] as const).map((c) => (
                    <Button
                      key={c}
                      variant={minConfidence === c ? "default" : "outline"}
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={() => setMinConfidence(c)}
                    >
                      {c === "low" ? "Toute" : c === "nominal" ? "Moyenne" : "Haute"}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">FRP min : {minFrp} MW</Label>
                <Slider value={[minFrp]} onValueChange={([v]) => setMinFrp(v)} min={0} max={100} step={1} className="mt-1" />
              </div>
            </div>
          )}

          {/* Infos coordonnées */}
          <div className="absolute bottom-3 left-3 z-20 rounded border border-border/50 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
            Gironde · © OpenStreetMap contributeurs
          </div>

          {/* Compteur hotspots */}
          <div className="absolute bottom-3 right-3 z-20 flex gap-2">
            <div className="rounded border border-border/50 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
              {hotspotCount > 0
                ? `${hotspotCount} détection${hotspotCount > 1 ? "s" : ""} satellite`
                : hotspotsLoading
                  ? "Chargement FIRMS…"
                  : "Aucune détection"}
            </div>
          </div>
        </main>

        {/* ── Sidebar ───────────────────────────────────────────── */}
        <aside className={`flex w-full flex-col border-t border-border/50 bg-card/30 transition-all duration-200 ease-in-out
            ${sidebarOpen ? "max-h-[50vh] lg:max-h-none" : "max-h-0 overflow-hidden border-t-0 lg:max-h-none"}
            lg:w-72 lg:border-l lg:border-t-0`}>
          <div className="flex-1 overflow-y-auto p-4">

            {/* ── Couches ──────────────────────────────────────── */}
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              Couches
            </h3>
            <div className="space-y-1">
              {layers.map((layer) => (
                <div key={layer.id} className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent/50">
                  <Switch
                    checked={layer.enabled}
                    onCheckedChange={() => toggleLayer(layer.id)}
                    className="data-[state=checked]:bg-fire-600"
                  />
                  <layer.icon className={`h-4 w-4 ${layer.enabled ? "text-fire-500" : "text-muted-foreground/50"}`} />
                  <p className="text-sm">{layer.label}</p>
                </div>
              ))}
            </div>

            <Separator className="my-4 bg-border/50" />

            {/* ── Infos données ───────────────────────────────── */}
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Info className="h-3.5 w-3.5" />
              Données en direct
            </h3>

            {/* NASA FIRMS */}
            <div className="mb-3 rounded-md border border-border/50 bg-card p-3">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Satellite className="h-3.5 w-3.5 text-fire-500" />
                NASA FIRMS
              </p>
              <div className="mt-1.5 space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>Détections</span>
                  <span className="font-medium">{hotspots.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dernière mise à jour</span>
                  <span>{hotspotsLastUpdate ? new Date(hotspotsLastUpdate).toLocaleTimeString("fr-FR") : "—"}</span>
                </div>
                {hotspotsError && (
                  <p className="mt-1 text-[9px] text-red-500">{hotspotsError}</p>
                )}
              </div>
            </div>

            {/* Open-Meteo */}
            <div className="mb-3 rounded-md border border-border/50 bg-card p-3">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Wind className="h-3.5 w-3.5 text-blue-500" />
                Open-Meteo (AROME HD)
              </p>
              <div className="mt-1.5 space-y-1 text-[10px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>Température</span>
                  <span className="font-medium">{avgTemp.toFixed(1)}°C</span>
                </div>
                <div className="flex justify-between">
                  <span>Points de grille</span>
                  <span className="font-medium">{weatherGrid.filter((p) => p.data).length}/{WEATHER_POINTS.length}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mise à jour</span>
                  <span>{weatherLastUpdate ? new Date(weatherLastUpdate).toLocaleTimeString("fr-FR") : "—"}</span>
                </div>
                {weatherError && <p className="mt-1 text-[9px] text-red-500">{weatherError}</p>}
              </div>
            </div>

            {/* Clé FIRMS */}
            <div className="mb-3 rounded-md border border-border/50 bg-card p-3">
              <p className="text-xs font-medium mb-1.5">🔑 Clé API NASA FIRMS</p>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={firmsKeyInput}
                  onChange={(e) => setFirmsKeyInput(e.target.value)}
                  placeholder="Saisir la clé FIRMS…"
                  className="flex-1 rounded border border-border/50 bg-background px-2 py-1 text-[10px]"
                />
                <Button variant="default" size="sm" className="h-7 text-[10px]" onClick={handleSaveFirmsKey}>
                  OK
                </Button>
              </div>
              <p className="mt-1 text-[9px] text-muted-foreground/50">
                Clé gratuite via <a href="https://firms.modaps.eosdis.nasa.gov" target="_blank" rel="noopener noreferrer" className="underline">firms.modaps.eosdis.nasa.gov</a>
              </p>
            </div>

            <Separator className="my-4 bg-border/50" />

            {/* ── Alertes ──────────────────────────────────────── */}
            <div className="mb-3">
              <Button
                variant="ghost" size="sm"
                className={`w-full justify-start gap-2 text-xs ${alertsOpen ? "bg-accent/30" : "text-muted-foreground"}`}
                onClick={() => setAlertsOpen(!alertsOpen)}
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Alertes seuil</span>
              </Button>
              {alertsOpen && (
                <div className="mt-2">
                  <ZoneAlertPanel
                    watchedCells={watchedCells}
                    currentLat={selectedCell?.lat}
                    currentLon={selectedCell?.lon}
                    onAddCell={() => {}}
                    onRemoveCell={() => {}}
                    onUpdateThreshold={() => {}}
                    onTogglePush={() => {}}
                  />
                </div>
              )}
            </div>

            {/* ── Crise ────────────────────────────────────────── */}
            <div className="mb-3">
              <CrisisBanner config={crisisConfig} onToggle={() => {}} />
            </div>

            <Separator className="my-4 bg-border/50" />

            {/* ── Export ──────────────────────────────────────── */}
            <div className="mb-3">
              <Button
                variant="ghost" size="sm"
                className={`w-full justify-start gap-2 text-xs ${exportOpen ? "bg-accent/30" : "text-muted-foreground"}`}
                onClick={() => setExportOpen(!exportOpen)}
              >
                <Download className="h-3.5 w-3.5" />
                <span>Exporter</span>
              </Button>
              {exportOpen && (
                <div className="mt-2 rounded-md border border-border/50 bg-card p-3">
                  <ExportPanel onClose={() => setExportOpen(false)} />
                </div>
              )}
            </div>

            <Separator className="my-4 bg-border/50" />

            {/* Attributions */}
            <p className="text-[9px] leading-relaxed text-muted-foreground/40">
              NASA FIRMS · Open-Meteo (CC BY 4.0) · IGN · OpenStreetMap © contributeurs (ODbL)
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
