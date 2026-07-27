/**
 * CrisisBanner — Mode crise activable.
 *
 * Quand activé :
 * - Bannière rouge prioritaire (z-index > LegalBanner)
 * - Certaines couches coûteuses sont désactivées (simulation, ellipses, alertes)
 * - L'API backend bascule en mode dégradé
 * - Les notifications push sont suspendues
 *
 * ⚠️ NON MASQUABLE une fois activé.
 * Peut être désactivé uniquement par toggle explicite.
 */

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ShieldOff,
  Activity,
  BarChart3,
  MessageSquareOff,
} from "lucide-react";

interface CrisisModeConfig {
  active: boolean;
  activated_at: string | null;
  degraded_layers: string[];
  notification_blocked: boolean;
}

interface CrisisBannerProps {
  config: CrisisModeConfig;
  onToggle: (active: boolean) => void;
}

const LAYER_LABELS: Record<string, string> = {
  simulation: "Simulation",
  ellipses: "Ellipses propagation",
  hotspots: "Points chauds (rafraîchissement)",
  alerts: "Alertes cellulaires",
};

export default function CrisisBanner({ config, onToggle }: CrisisBannerProps) {
  return (
    <>
      {/* ── Activation toggle ──────────────────────────────────── */}
      <div className="mb-3">
        <div className="flex items-center gap-3 rounded-md border border-red-900/30 bg-red-950/10 px-3 py-2.5">
          <ShieldOff className="h-4 w-4 shrink-0 text-red-500" />
          <div className="flex-1">
            <Label className="text-xs font-medium text-red-500">
              Mode crise
            </Label>
            <p className="text-[10px] text-muted-foreground/60">
              Désactive les fonctionnalités non essentielles
            </p>
          </div>
          <Switch
            checked={config.active}
            onCheckedChange={onToggle}
            className="data-[state=checked]:bg-red-600"
          />
        </div>
      </div>

      {/* ── Active banner ──────────────────────────────────────── */}
      {config.active && (
        <div
          role="alert"
          className="fixed inset-x-0 top-0 z-[10000] border-b-2 border-red-500/50 bg-red-950/95 px-4 py-3 text-white shadow-lg backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-7xl items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-red-400" />
            <div className="flex-1">
              <p className="font-bold text-sm">
                🚨 MODE CRISE ACTIF — Priorité à la vigilance
              </p>
              <p className="mt-0.5 text-xs text-red-200/90">
                Les fonctionnalités non essentielles sont désactivées pour
                préserver les ressources.
              </p>

              {/* Degraded layers */}
              <div className="mt-2 space-y-1">
                {config.degraded_layers.map((layer) => (
                  <div
                    key={layer}
                    className="flex items-center gap-2 rounded bg-red-900/30 px-2 py-1 text-[11px] text-red-200/80"
                  >
                    {layer === "simulation" && (
                      <Activity className="h-3 w-3 shrink-0" />
                    )}
                    {layer === "ellipses" && (
                      <BarChart3 className="h-3 w-3 shrink-0" />
                    )}
                    {layer === "alerts" && (
                      <MessageSquareOff className="h-3 w-3 shrink-0" />
                    )}
                    <span>
              ✘ {LAYER_LABELS[layer] || layer} — désactivé
                    </span>
                  </div>
                ))}
              </div>

              {/* Activation time */}
              {config.activated_at && (
                <p className="mt-1.5 text-[10px] text-red-300/60">
                  Activé le{" "}
                  {new Date(config.activated_at).toLocaleString("fr-FR")}
                </p>
              )}
            </div>

            {/* Deactivate button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 border border-red-500/30 px-2 text-[10px] text-red-300 hover:bg-red-800/50 hover:text-white"
              onClick={() => onToggle(false)}
            >
              Désactiver
            </Button>
          </div>

          {/* Warning footer */}
          <div className="mx-auto mt-2 max-w-7xl border-t border-red-500/20 pt-1.5 text-[10px] leading-tight text-red-300/70">
            ⚠️ Le mode crise désactive des fonctionnalités. Les canaux
            officiels d&apos;alerte (18/112, SDIS 33, Préfecture) restent seuls
            référents. Les notifications de cette application n&apos;ont aucune
            valeur opérationnelle.
          </div>
        </div>
      )}
    </>
  );
}
