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

  const [layers, setLayers] = useState<LayerToggle[]>([
    { id: "hotspots", label: "Points chauds", icon: Flame, enabled: true, available: false, eta: "PHASE 1 — Backend requis" },
    { id: "weather", label: "Température", icon: Thermometer, enabled: false, available: false, eta: "PHASE 1 — Backend requis" },
    { id: "wind", label: "Vent animé", icon: Wind, enabled: false, available: false, eta: "PHASE 1 — Backend requis" },
    { id: "risk", label: "Risque", icon: AlertTriangle, enabled: false, available: false, eta: "PHASE 4 — Score final" },
  ]);

  const toggleLayer = (id: string) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === id ? { ...l, enabled: !l.enabled } : l)),
    );
  };

  const handleMapClick = useCallback((lat: number, lon: number) => {
    setSelectedCell({ lat, lon });
  }, []);

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
            {/* Layers are injected into the map via children */}
            {/* When backend is connected, hotspots will be populated from API */}
          </MapContainer>

          {/* Filter bar (collapsible on mobile) */}
          <div className="absolute left-3 top-3 z-20">
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
                  Cliquez sur une cellule pour voir FWI, ROS, score de risque
                  et décomposition (PHASE 2–4)
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-border/50 bg-card/50 p-3">
                <p className="text-xs text-muted-foreground/60">
                  Cliquez sur la carte pour voir les données de la cellule
                </p>
              </div>
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
