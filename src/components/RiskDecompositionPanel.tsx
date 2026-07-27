/**
 * RiskDecompositionPanel — Panneau de décomposition des contributions.
 *
 * Affiche au clic sur une cellule :
 * - Les deux scores (ignition / spread) avec classes
 * - Les barres horizontales de contribution (positives/négatives)
 * - Les facteurs détaillés du coefficient local
 * - L'indicateur de qualité de donnée
 */

import { X } from "lucide-react";

interface Contribution {
  name: string;
  value: number;
  contribution: number;
  pct: number;
}

interface RiskDetail {
  cell_id: number;
  lat: number;
  lon: number;
  ignition_risk: number;
  spread_risk: number;
  combined: number;
  dominant_regime: string;
  risk_class: string;
  fwi: number;
  fbp: { ros_m_min: number; intensity_kw_m: number; flame_length_m: number; fire_type: string };
  rothermel: { ros_m_min: number; intensity_kw_m: number; flame_length_m: number };
  local_coefficient: {
    score: number; ignition_score: number; spread_score: number;
    n_available_factors: number; n_total_factors: number; renormalized: boolean;
  };
  contributions: Contribution[];
  quality: Record<string, boolean | number | string>;
}

interface RiskDecompositionPanelProps {
  data: RiskDetail | null;
  onClose: () => void;
}

function scoreBadgeColor(score: number): string {
  if (score <= 20) return "bg-green-700 text-white";
  if (score <= 40) return "bg-yellow-600 text-white";
  if (score <= 60) return "bg-orange-500 text-white";
  if (score <= 80) return "bg-red-600 text-white";
  return "bg-red-900 text-white";
}

function Bar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="mb-1.5">
      <div className="mb-0.5 flex justify-between text-[10px]">
        <span className="truncate text-muted-foreground">{label}</span>
        <span className="font-medium">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function RiskDecompositionPanel({
  data,
  onClose,
}: RiskDecompositionPanelProps) {
  if (!data) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Cellule #{data.cell_id}</p>
          <p className="text-[10px] text-muted-foreground/60">
            {data.lat.toFixed(4)}, {data.lon.toFixed(4)}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── Scores ──────────────────────────────────────────── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Scores de risque
          </h4>
          <div className="flex gap-2">
            <div className={`flex-1 rounded-md px-3 py-2 text-center ${scoreBadgeColor(data.ignition_risk)}`}>
              <p className="text-[10px] opacity-80">Départ</p>
              <p className="text-lg font-bold">{data.ignition_risk}</p>
            </div>
            <div className={`flex-1 rounded-md px-3 py-2 text-center ${scoreBadgeColor(data.spread_risk)}`}>
              <p className="text-[10px] opacity-80">Propagation</p>
              <p className="text-lg font-bold">{data.spread_risk}</p>
            </div>
          </div>
          <p className="mt-1 text-center text-[10px] text-muted-foreground/60">
            Régime dominant : <strong>{data.dominant_regime}</strong>
          </p>
        </div>

        {/* ── Modèles de propagation ──────────────────────────── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Propagation
          </h4>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="rounded border border-border/50 p-2">
              <p className="font-medium text-foreground">FBP</p>
              <p className="text-muted-foreground">ROS : {data.fbp.ros_m_min} m/min</p>
              <p className="text-muted-foreground">Intensité : {data.fbp.intensity_kw_m} kW/m</p>
              <p className="text-muted-foreground">Flamme : {data.fbp.flame_length_m} m</p>
              <p className="text-muted-foreground">Type : {data.fbp.fire_type}</p>
            </div>
            <div className="rounded border border-border/50 p-2">
              <p className="font-medium text-foreground">Rothermel</p>
              <p className="text-muted-foreground">ROS : {data.rothermel.ros_m_min} m/min</p>
              <p className="text-muted-foreground">Intensité : {data.rothermel.intensity_kw_m} kW/m</p>
              <p className="text-muted-foreground">Flamme : {data.rothermel.flame_length_m} m</p>
            </div>
          </div>
        </div>

        {/* ── Décomposition des contributions ─────────────────── */}
        {data.contributions.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
              Contributions
            </h4>
            {data.contributions.map((c, i) => (
              <Bar
                key={i}
                label={c.name}
                pct={c.pct}
                color={
                  c.name.startsWith("ignition")
                    ? "#f97316"
                    : "#dc2626"
                }
              />
            ))}
          </div>
        )}

        {/* ── Coefficient local ───────────────────────────────── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Coefficient local
          </h4>
          <div className="space-y-1 text-[10px]">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Score global</span>
              <span>{(data.local_coefficient.score * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Ignition</span>
              <span>{(data.local_coefficient.ignition_score * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Spread</span>
              <span>{(data.local_coefficient.spread_score * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Facteurs présents</span>
              <span>
                {data.local_coefficient.n_available_factors}/
                {data.local_coefficient.n_total_factors}
              </span>
            </div>
            {data.local_coefficient.renormalized && (
              <p className="text-[9px] text-amber-600">
                ⚠ Certains facteurs manquants — poids renormalisés
              </p>
            )}
          </div>
        </div>

        {/* ── Quality ─────────────────────────────────────────── */}
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">
            Qualité des données
          </h4>
          <div className="space-y-1 text-[10px] text-muted-foreground">
            {Object.entries(data.quality).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span>{key.replace(/_/g, " ")}</span>
                <span className={val ? "text-green-600" : "text-red-500"}>
                  {val ? "✔" : "✘"}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Warning (non-masquable) ─────────────────────────── */}
        <div className="rounded-md border border-amber-700/30 bg-amber-900/10 p-2 text-[9px] leading-relaxed text-amber-700">
          ⚠ Scores calculés à partir de modèles scientifiques. Sans valeur
          opérationnelle. En cas d&apos;incendie : <strong>18 / 112</strong>.
        </div>
      </div>
    </div>
  );
}
