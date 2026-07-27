/**
 * SimulationPanel — Interface de simulation interactive.
 *
 * L'utilisateur :
 * 1. Clique sur la carte pour poser un point d'allumage
 * 2. Sélectionne une date et une heure
 * 3. Règle la durée (1-24h), ISI, BUI
 * 4. Lance la simulation
 * 5. Visualise la progression avec le curseur temporel
 *
 * ⚠️ Encart d'avertissement permanent et non masquable.
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Play,
  Square,
  Clock,
  MapPin,
  AlertTriangle,
  Flame,
  Grip,
} from "lucide-react";

interface SimulationEpoch {
  hour: number;
  n_cells_burned: number;
  area_ha: number;
  mean_ros: number;
  max_ros: number;
}

interface SimulationResult {
  ignition_lat: number;
  ignition_lon: number;
  start_time: string;
  duration_h: number;
  n_burned_cells: number;
  total_area_ha: number;
  max_ros_m_min: number;
  fire_type: string;
  epochs: SimulationEpoch[];
  burned_cells?: Array<{ cell_id: number; lat: number; lon: number; burn_time_min: number }>;
}

interface SimulationPanelProps {
  ignitionPoint: { lat: number; lon: number } | null;
  onIgnitionClear: () => void;
  onSimulationStart: (params: {
    lat: number;
    lon: number;
    datetime: string;
    duration_h: number;
    isi: number;
    bui: number;
  }) => void;
  isRunning: boolean;
  result: SimulationResult | null;
  currentTime_h: number;
  onTimeChange: (h: number) => void;
}

export default function SimulationPanel({
  ignitionPoint,
  onIgnitionClear,
  onSimulationStart,
  isRunning,
  result,
  currentTime_h,
  onTimeChange,
}: SimulationPanelProps) {
  const [dateStr, setDateStr] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });
  const [timeStr, setTimeStr] = useState("14:00");
  const [duration, setDuration] = useState(6);
  const [isi, setIsi] = useState(10);
  const [bui, setBui] = useState(20);
  const [showWarning, setShowWarning] = useState(true);

  const handleLaunch = () => {
    if (!ignitionPoint) return;
    onSimulationStart({
      lat: ignitionPoint.lat,
      lon: ignitionPoint.lon,
      datetime: `${dateStr}T${timeStr}:00`,
      duration_h: duration,
      isi,
      bui,
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="text-sm font-semibold">Simulation</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── Point d'allumage ───────────────────────────────── */}
        <div>
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-orange-500" />
            Point d&apos;allumage
          </h4>
          {ignitionPoint ? (
            <div className="rounded-md border border-border/50 bg-card p-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium">
                  {ignitionPoint.lat.toFixed(4)}, {ignitionPoint.lon.toFixed(4)}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[10px] text-muted-foreground"
                  onClick={onIgnitionClear}
                >
                  Effacer
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Cliquez sur la carte pour déplacer
              </p>
            </div>
          ) : (
            <div className="rounded-md border border-border/50 border-dashed bg-card/30 p-3 text-center">
              <MapPin className="mx-auto mb-1 h-5 w-5 text-muted-foreground/30" />
              <p className="text-[11px] text-muted-foreground/50">
                Cliquez sur la carte pour placer le point d&apos;allumage
              </p>
            </div>
          )}
        </div>

        {/* ── Date et heure ──────────────────────────────────── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            <Clock className="mr-1 inline h-3.5 w-3.5" />
            Date et heure
          </h4>
          <div className="flex gap-2">
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="flex-1 rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-xs text-foreground"
            />
            <input
              type="time"
              value={timeStr}
              onChange={(e) => setTimeStr(e.target.value)}
              className="w-20 rounded-md border border-border/50 bg-card px-2.5 py-1.5 text-xs text-foreground"
            />
          </div>
        </div>

        {/* ── Paramètres ─────────────────────────────────────── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Paramètres
          </h4>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">
                Durée : {duration}h
              </Label>
              <Slider
                value={[duration]}
                onValueChange={([v]) => setDuration(v)}
                min={1}
                max={24}
                step={1}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">
                ISI : {isi}
              </Label>
              <Slider
                value={[isi]}
                onValueChange={([v]) => setIsi(v)}
                min={0}
                max={50}
                step={1}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">
                BUI : {bui}
              </Label>
              <Slider
                value={[bui]}
                onValueChange={([v]) => setBui(v)}
                min={0}
                max={100}
                step={1}
                className="mt-1"
              />
            </div>
          </div>
        </div>

        {/* ── Lancer ─────────────────────────────────────────── */}
        <Button
          className="w-full gap-2 bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40"
          disabled={!ignitionPoint || isRunning}
          onClick={handleLaunch}
        >
          {isRunning ? (
            <>
              <Square className="h-4 w-4" />
              Calcul en cours...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Lancer la simulation
            </>
          )}
        </Button>

        {/* ── Résultats ──────────────────────────────────────── */}
        {result && (
          <>
            <Separator className="bg-border/50" />

            {/* Curseur temporel */}
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                Progression (~{currentTime_h.toFixed(0)}h / {result.duration_h}h)
              </h4>
              <Slider
                value={[currentTime_h]}
                onValueChange={([v]) => onTimeChange(v)}
                min={0}
                max={result.duration_h}
                step={0.5}
                className="mt-1"
              />
            </div>

            {/* Statistiques */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md border border-border/50 bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Surface brûlée</p>
                <p className="text-lg font-bold text-orange-500">
                  {result.total_area_ha.toFixed(1)} ha
                </p>
              </div>
              <div className="rounded-md border border-border/50 bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Type de feu</p>
                <p className="text-lg font-bold text-red-500">
                  {result.fire_type === "crown" ? "Cime" : result.fire_type === "intermittent" ? "Intermittent" : "Surface"}
                </p>
              </div>
              <div className="rounded-md border border-border/50 bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">ROS max</p>
                <p className="text-base font-bold">{result.max_ros_m_min} m/min</p>
              </div>
              <div className="rounded-md border border-border/50 bg-card p-2.5">
                <p className="text-[10px] text-muted-foreground">Cellules touchées</p>
                <p className="text-base font-bold">{result.n_burned_cells}</p>
              </div>
            </div>

            {/* Epochs */}
            <div>
              <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
                Évolution horaire
              </h4>
              <div className="max-h-32 space-y-1 overflow-y-auto">
                {result.epochs.map((ep) => (
                  <div
                    key={ep.hour}
                    className={`flex items-center justify-between rounded px-2.5 py-1 text-[10px] ${
                      ep.hour <= currentTime_h
                        ? "bg-orange-900/10 text-foreground"
                        : "text-muted-foreground/40"
                    }`}
                  >
                    <span>H+{ep.hour}</span>
                    <span>{ep.area_ha.toFixed(1)} ha</span>
                    <span>{ep.max_ros.toFixed(1)} m/min</span>
                    <span>{ep.n_cells_burned} cell.</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Avertissement permanent non masquable ─────────── */}
        <div className="rounded-md border border-red-700/30 bg-red-900/10 p-2 text-[9px] leading-relaxed text-red-700">
          <strong>⚠️ Simulation à but pédagogique</strong>, en propagation
          libre, <strong>sans intervention des secours</strong>. Ne reflète pas
          le comportement réel d&apos;un incendie. En cas d&apos;incendie :{" "}
          <strong>18 / 112</strong>.
        </div>
      </div>
    </div>
  );
}
