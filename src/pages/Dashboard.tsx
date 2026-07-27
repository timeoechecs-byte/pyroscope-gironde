/**
 * PyroScope 33 — Dashboard (authenticated).
 *
 * Carte interactive MapLibre + couches (hotspots, vent, isothermes).
 * Filtres : période, confiance, seuil FRP, affichage des couches.
 * Panneau latéral : info cellule + état des sources.
 */

import { useState, useRef, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
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
import RiskLayer from "@/components/RiskLayer";
import SpreadEllipseLayer from "@/components/SpreadEllipseLayer";
import RiskDecompositionPanel from "@/components/RiskDecompositionPanel";
import SimulationPanel from "@/components/SimulationPanel";
import SimulationMapLayer from "@/components/SimulationMapLayer";
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Flame,
  LogOut,
  Settings2,
  Thermometer,
  Wind,
  Layers,
  Info,
  SlidersHorizontal,
  ArrowRightLeft,
  Grip,
  Play,
} from "lucide-react";
import { useNavigate } from "react-router";

// ── Simulation data — strictly for frontend development preview
// These are NOT real hotspots, just layout verification.
// In production (backend connected), this will be replaced by real API data.
const SAMPLE_HOTSPOTS: HotspotData[] = [];

// ── Layer toggles ────────────────────────────────────────────────────────
interface LayerToggle {
  id: string;
  label: string;
  icon: React.ElementType;
  enabled: boolean;
  available: boolean;
  eta: string;
}

interface RiskCellData {
  cell_id: number; lat: number; lon: number;
  ignition_risk: number; spread_risk: number; combined_score: number;
  dominant: "ignition" | "spread" | "equal"; risk_class: string;
  fuel_species?: string;
}

interface EllipseData {
  horizon_h: number; center_lon: number; center_lat: number;
  semi_major_m: number; semi_minor_m: number; orientation_deg: number;
  area_ha: number; head_ros_m_min: number;
  wind_direction_deg: number; wind_speed_kmh: number;
}

interface Contribution {
  name: string; value: number; contribution: number; pct: number;
}

interface RiskDetail {
  cell_id: number; lat: number; lon: number;
  ignition_risk: number; spread_risk: number; combined: number;
  dominant_regime: string; risk_class: string; fwi: number;
  fbp: { ros_m_min: number; intensity_kw_m: number; flame_length_m: number; fire_type: string };
  rothermel: { ros_m_min: number; intensity_kw_m: number; flame_length_m: number };
  local_coefficient: { score: number; ignition_score: number; spread_score: number; n_available_factors: number; n_total_factors: number; renormalized: boolean };
  contributions: Contribution[];
  quality: Record<string, boolean | number | string>;
}

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  // ── Filters state ──────────────────────────────────────────────────────
  const [periodHours, setPeriodHours] = useState(48);
  const [minConfidence, setMinConfidence] = useState<"low" | "nominal" | "high">("low");
  const [minFrp, setMinFrp] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{
    lat: number;
    lon: number;
  } | null>(null);
  const [selectedRiskCell, setSelectedRiskCell] = useState<RiskDetail | null>(null);
  const [riskMode, setRiskMode] = useState<"combined" | "ignition" | "spread">("combined");
  const [horizon, setHorizon] = useState(6);

  // ── Simulation state ────────────────────────────────────────────────
  const [simMode, setSimMode] = useState(false);
  const [ignitionPoint, setIgnitionPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [simResult, setSimResult] = useState<any>(null);
  const [simIsRunning, setSimIsRunning] = useState(false);
  const [simCurrentTime, setSimCurrentTime] = useState(0);

  const [layers, setLayers] = useState<LayerToggle[]>([
    { id: "hotspots", label: "Points chauds", icon: Flame, enabled: true, available: false, eta: "PHASE 1 — Backend requis" },
    { id: "weather", label: "Température", icon: Thermometer, enabled: false, available: false, eta: "PHASE 1 — Backend requis" },
    { id: "wind", label: "Vent animé", icon: Wind, enabled: false, available: false, eta: "PHASE 1 — Backend requis" },
    { id: "risk", label: "Risque cellulaire", icon: AlertTriangle, enabled: true, available: true, eta: "" },
    { id: "ellipses", label: "Ellipses propagation", icon: ArrowRightLeft, enabled: true, available: true, eta: "" },
  ]);

  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
    );
  };

  // Demo risk cells for preview
  // REPLACED by real API data when backend is connected
  const demoRiskCells: RiskCellData[] = [
    { cell_id: 1, lat: 44.85, lon: -0.65, ignition_risk: 35, spread_risk: 72, combined_score: 72, dominant: "spread", risk_class: "élevé" },
    { cell_id: 2, lat: 44.70, lon: -0.40, ignition_risk: 55, spread_risk: 45, combined_score: 55, dominant: "ignition", risk_class: "modéré" },
    { cell_id: 3, lat: 45.05, lon: -0.80, ignition_risk: 20, spread_risk: 30, combined_score: 30, dominant: "spread", risk_class: "faible" },
    { cell_id: 4, lat: 44.40, lon: -0.20, ignition_risk: 70, spread_risk: 85, combined_score: 85, dominant: "spread", risk_class: "très élevé" },
  ];

  const demoEllipses: EllipseData[] = [1, 3, 6, 12].map((h) => ({
    horizon_h: h,
    center_lon: -0.65,
    center_lat: 44.85,
    semi_major_m: 300 + h * 200,
    semi_minor_m: 100 + h * 50,
    orientation_deg: 225,
    area_ha: (() => { const a = 300 + h * 200; const b = 100 + h * 50; return Math.round(Math.PI * a * b / 10000); })(),
    head_ros_m_min: 5 + h * 1.5,
    wind_direction_deg: 225,
    wind_speed_kmh: 15 + h * 2,
  }));

  const riskLayerEnabled = layers.find((l) => l.id === "risk")?.enabled ?? false;
  const ellipseLayerEnabled = layers.find((l) => l.id === "ellipses")?.enabled ?? false;

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setSelectedCell({ lat, lon });
  }, []);

  const handleRiskCellClick = (cell: RiskCellData) => {
    // Build a full RiskDetail from demo data
    const detail: RiskDetail = {
      cell_id: cell.cell_id,
      lat: cell.lat,
      lon: cell.lon,
      ignition_risk: cell.ignition_risk,
      spread_risk: cell.spread_risk,
      combined: cell.combined_score,
      dominant_regime: cell.dominant,
      risk_class: cell.risk_class,
      fwi: 15.2,
      fbp: { ros_m_min: 12.5, intensity_kw_m: 850, flame_length_m: 3.2, fire_type: "intermittent" },
      rothermel: { ros_m_min: 8.3, intensity_kw_m: 520, flame_length_m: 2.1 },
      local_coefficient: { score: 0.42, ignition_score: 0.35, spread_score: 0.48, n_available_factors: 12, n_total_factors: 14, renormalized: true },
      contributions: [
        { name: "spread.ROS potentielle (FBP)", value: 0.30, contribution: 30, pct: 30 },
        { name: "ignition.Coefficient local — facteur humain", value: 0.20, contribution: 20, pct: 20 },
        { name: "spread.FWI normalisé", value: 0.25, contribution: 25, pct: 25 },
        { name: "spread.Coefficient local — combustible", value: 0.15, contribution: 15, pct: 15 },
        { name: "ignition.Coefficient local — sécheresse", value: 0.10, contribution: 10, pct: 10 },
      ],
      quality: {
        fwi_available: true,
        ros_fbp_available: true,
        ros_rothermel_available: true,
        ros_dispersion_ratio: 0.34,
        fuel_confidence: "medium",
        local_coefficient_available: true,
      },
    };
    setSelectedRiskCell(detail);
  };

  // ── Simulation handlers ──────────────────────────────────────────────
  const handleMapClickSim = useCallback((lat: number, lon: number) => {
    if (simMode) {
      setIgnitionPoint({ lat, lon });
      setSimResult(null);
      setSimCurrentTime(0);
    }
  }, [simMode]);

  const handleSimulationStart = (params: {
    lat: number; lon: number; datetime: string;
    duration_h: number; isi: number; bui: number;
  }) => {
    setSimIsRunning(true);
    // Generate demo simulation result
    const duration = params.duration_h;
    const epochs = [];
    let totalCells = 0;
    for (let h = 1; h <= duration; h++) {
      const nCells = Math.round(5 + h * 3 + Math.random() * 10);
      totalCells += nCells;
      epochs.push({
        hour: h,
        n_cells_burned: nCells,
        area_ha: parseFloat((nCells * 6.25).toFixed(1)),
        mean_ros: parseFloat((3 + h * 1.2 + Math.random()).toFixed(2)),
        max_ros: parseFloat((5 + h * 1.5 + Math.random() * 2).toFixed(2)),
      });
    }

    // Generate burned cells
    const burnedCells = [];
    let cid = 0;
    for (let h = 0; h < duration; h++) {
      const nInEpoch = Math.round(5 + h * 3);
      for (let i = 0; i < nInEpoch; i++) {
        const offsetLat = (Math.random() - 0.5) * 0.04;
        const offsetLon = (Math.random() - 0.5) * 0.04;
        burnedCells.push({
          cell_id: cid++,
          lat: params.lat + offsetLat,
          lon: params.lon + offsetLon,
          burn_time_min: h * 60 + Math.random() * 60,
        });
      }
    }

    const result = {
      ignition_lat: params.lat,
      ignition_lon: params.lon,
      start_time: params.datetime,
      duration_h: duration,
      n_burned_cells: totalCells,
      total_area_ha: parseFloat((totalCells * 6.25).toFixed(1)),
      max_ros_m_min: parseFloat((5 + duration * 1.5).toFixed(2)),
      fire_type: params.isi > 15 ? "crown" : params.isi > 8 ? "intermittent" : "surface",
      epochs,
      burned_cells: burnedCells,
    };

    setTimeout(() => {
      setSimResult(result);
      setSimCurrentTime(result.duration_h);
      setSimIsRunning(false);
    }, 800);
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
            <Flame className="h-5 w-5 text-fire-500" />
            <span className="text-sm font-semibold tracking-tight">
              PyroScope<span className="text-fire-500">33</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={simMode ? "default" : "ghost"}
              size="sm"
              className={`gap-1.5 text-xs ${simMode ? "bg-orange-600 text-white hover:bg-orange-500" : "text-muted-foreground"}`}
              onClick={() => { setSimMode(!simMode); if (!simMode) setSelectedRiskCell(null); }}
            >
              <Play className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Simulation</span>
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {/* Sources freshness indicator */}
            <div className="hidden items-center gap-2 sm:flex">
              <div className="h-2 w-2 rounded-full bg-amber-700" />
              <span className="text-xs text-muted-foreground">
                Backend non connecté
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {user?.email ?? "Invité"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
            >
              <LogOut className="mr-1 h-3.5 w-3.5" />
              <span className="text-xs hidden sm:inline">Quitter</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ── Map area ─────────────────────────────────────────── */}
        <main className="relative flex flex-1 flex-col">
          <MapContainer>
            {/* Risk layer */}
            <RiskLayer
              map={null as any}
              cells={demoRiskCells}
              mode={riskMode}
              visible={riskLayerEnabled}
              onCellClick={handleRiskCellClick}
            />
            {/* Spread ellipses */}
            <SpreadEllipseLayer
              map={null as any}
              ellipses={demoEllipses.filter((e) => e.horizon_h <= horizon)}
              visible={ellipseLayerEnabled}
            />
            {/* Simulation layer */}
            {simMode && (
              <SimulationMapLayer
                map={null as any}
                ignitionPoint={ignitionPoint}
                burnedCells={simResult?.burned_cells ?? []}
                currentTime_h={simCurrentTime}
                visible={true}
              />
            )}
          </MapContainer>

          {/* Risk mode selector */}
          <div className="absolute left-3 top-3 z-20 flex gap-1">
            {(["combined", "ignition", "spread"] as const).map((mode) => (
              <Button
                key={mode}
                variant={riskMode === mode ? "default" : "secondary"}
                size="sm"
                className="h-7 bg-background/90 px-2 text-[10px] backdrop-blur-sm"
                onClick={() => setRiskMode(mode)}
              >
                {mode === "combined" ? "Combiné" : mode === "ignition" ? "Départ" : "Propagation"}
              </Button>
            ))}
          </div>

          {/* Horizon selector */}
          <div className="absolute left-3 top-12 z-20 flex gap-1">
            {[1, 3, 6, 12].map((h) => (
              <Button
                key={h}
                variant={horizon === h ? "default" : "secondary"}
                size="sm"
                className="h-7 bg-background/90 px-2 text-[10px] backdrop-blur-sm"
                onClick={() => setHorizon(h)}
              >
                {h}h
              </Button>
            ))}
          </div>

          {/* Filter bar */}
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

          {/* Filter panel */}
          {filterOpen && (
            <div className="absolute left-3 top-12 z-20 w-64 rounded-lg border border-border/50 bg-background/95 p-4 shadow-lg backdrop-blur-sm">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Filtres
              </h4>

              {/* Période */}
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

              {/* Confiance */}
              <div className="mb-3">
                <Label className="text-xs text-muted-foreground">
                  Confiance min.
                </Label>
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

              {/* Seuil FRP */}
              <div className="mb-2">
                <Label className="text-xs text-muted-foreground">
                  FRP min : {minFrp} MW
                </Label>
                <Slider
                  value={[minFrp]}
                  onValueChange={([v]) => setMinFrp(v)}
                  min={0}
                  max={100}
                  step={1}
                  className="mt-1"
                />
              </div>
            </div>
          )}

          {/* Coordinate display */}
          <div className="absolute bottom-3 left-3 z-20 rounded border border-border/50 bg-background/80 px-2 py-1 text-[10px] text-muted-foreground backdrop-blur-sm">
            Gironde · lon [-1.35, 0.35] · lat [44.15, 45.60]
          </div>

          {/* Backend status badge */}
          <div className="absolute bottom-3 right-3 z-20">
            <Badge
              variant="outline"
              className="border-amber-700/30 bg-background/80 text-[10px] text-amber-700 backdrop-blur-sm"
            >
              🔧 Backend requis
            </Badge>
          </div>
        </main>

        {/* ── Sidebar ───────────────────────────────────────────── */}
        <aside className="flex w-full flex-col border-t border-border/50 bg-card/30 lg:w-72 lg:border-l lg:border-t-0">
          <div className="flex-1 overflow-y-auto p-4">
            {/* ── Couches ──────────────────────────────────────── */}
            <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              Couches
            </h3>

            <div className="space-y-1">
              {layers.map((layer) => (
                <div
                  key={layer.id}
                  className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-accent/50"
                >
                  <Switch
                    checked={layer.enabled}
                    onCheckedChange={() => toggleLayer(layer.id)}
                    disabled={!layer.available}
                    className="data-[state=checked]:bg-fire-600"
                  />
                  <layer.icon
                    className={`h-4 w-4 ${layer.enabled ? "text-fire-500" : "text-muted-foreground/50"}`}
                  />
                  <div className="flex-1">
                    <p className="text-sm">{layer.label}</p>
                    {!layer.available && (
                      <p className="text-[10px] text-muted-foreground/60">
                        {layer.eta}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-4 bg-border/50" />

            {/* ── Simulation panel (when active) ──────────────── */}
            {simMode ? (
              <SimulationPanel
                ignitionPoint={ignitionPoint}
                onIgnitionClear={() => { setIgnitionPoint(null); setSimResult(null); }}
                onSimulationStart={handleSimulationStart}
                isRunning={simIsRunning}
                result={simResult}
                currentTime_h={simCurrentTime}
                onTimeChange={setSimCurrentTime}
              />
            ) : selectedRiskCell ? (
              /* Decomposition panel when a risk cell is selected */
              <RiskDecompositionPanel
                data={selectedRiskCell}
                onClose={() => setSelectedRiskCell(null)}
              />
            ) : (
              <>
              {/* ── Cellule ──────────────────────────────────────── */}
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Info className="h-3.5 w-3.5" />
                Cellule
              </h3>

              {selectedCell ? (
                <div className="rounded-md border border-border/50 bg-card p-3">
                  <p className="text-xs font-medium">
                    {selectedCell.lat.toFixed(4)}, {selectedCell.lon.toFixed(4)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Cliquez sur une cellule risque pour voir la décomposition
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-border/50 bg-card/50 p-3">
                  <p className="text-xs text-muted-foreground/60">
                    Cliquez sur la carte pour voir les données de la cellule
                  </p>
                </div>
              )}
              </>
            )}

            <Separator className="my-4 bg-border/50" />

            {/* ── État des sources ──────────────────────────────── */}
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Settings2 className="h-3.5 w-3.5" />
              Sources
            </h3>

            <div className="space-y-1.5 text-xs">
              {[
                { name: "NASA FIRMS", status: "Non configuré", color: "bg-amber-700" },
                { name: "Open-Meteo", status: "Non configuré", color: "bg-amber-700" },
                { name: "Copernicus", status: "Non configuré", color: "bg-amber-700" },
              ].map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded-md px-2 py-1.5"
                >
                  <span className="text-muted-foreground">{s.name}</span>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${s.color}`} />
                    <span className="text-muted-foreground/50">{s.status}</span>
                  </div>
                </div>
              ))}
            </div>

            <Separator className="my-4 bg-border/50" />

            {/* ── Attributions ─────────────────────────────────── */}
            <p className="text-[9px] leading-relaxed text-muted-foreground/40">
              NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN ·
              OpenStreetMap © contributeurs (ODbL)
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
