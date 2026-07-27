/**
 * ZoneAlertPanel — Alertes par cellule surveillée.
 *
 * L'utilisateur peut :
 * - Marquer une cellule comme « surveillée »
 * - Définir un seuil de risque (ignition_risk, spread_risk)
 * - Définir un seuil FWI
 * - Activer/désactiver les notifications push
 * - Consulter l'historique des alertes déclenchées
 *
 * ⚠️ Avertissement affiché en permanence dans ce panneau :
 * « notifications informatives, sans garantie de délivrance —
 *   pour l'alerte, 18/112 et les canaux officiels »
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import {
  Bell,
  BellOff,
  AlertTriangle,
  Mail,
  Rss,
  Trash2,
  Plus,
  MapPin,
} from "lucide-react";

interface WatchedCell {
  id: string;
  lat: number;
  lon: number;
  label: string;
  thresholdIgnition: number;
  thresholdSpread: number;
  thresholdFWI: number;
  pushEnabled: boolean;
  lastAlert: string | null;
  triggered: boolean;
}

interface ZoneAlertPanelProps {
  watchedCells: WatchedCell[];
  currentLat?: number;
  currentLon?: number;
  onAddCell: (lat: number, lon: number) => void;
  onRemoveCell: (id: string) => void;
  onUpdateThreshold: (
    id: string,
    field: string,
    value: number
  ) => void;
  onTogglePush: (id: string, enabled: boolean) => void;
}

export default function ZoneAlertPanel({
  watchedCells,
  currentLat,
  currentLon,
  onRemoveCell,
  onUpdateThreshold,
  onTogglePush,
}: ZoneAlertPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);

  return (
    <div className="space-y-3">
      {/* ── Avertissement permanent ───────────────────────────── */}
      <div className="rounded-md border border-amber-800/30 bg-amber-950/10 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
          <p className="text-[10px] leading-tight text-amber-500/80">
            <strong>Notifications informatives</strong>, sans garantie de
            délivrance. Pour l&apos;alerte :{" "}
            <strong className="text-amber-400">18 / 112</strong> et les canaux
            officiels.
          </p>
        </div>
      </div>

      {/* ── Add current cell ──────────────────────────────────── */}
      {currentLat !== undefined && currentLon !== undefined && (
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-xs"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-3.5 w-3.5" />
          {showAddForm
            ? "Annuler"
            : `Surveiller la cellule (${currentLat.toFixed(3)}, ${currentLon.toFixed(3)})`}
        </Button>
      )}

      {/* ── List of watched cells ──────────────────────────────── */}
      <div className="space-y-2">
        {watchedCells.length === 0 && (
          <div className="rounded-md border border-border/50 bg-card/30 p-3 text-center">
            <BellOff className="mx-auto h-5 w-5 text-muted-foreground/40" />
            <p className="mt-1 text-[10px] text-muted-foreground/60">
              Aucune cellule surveillée.
            </p>
            <p className="text-[10px] text-muted-foreground/40">
              Cliquez sur une cellule de la carte puis ajoutez-la.
            </p>
          </div>
        )}

        {watchedCells.map((cell) => (
          <div
            key={cell.id}
            className={`rounded-md border px-2.5 py-2 ${
              cell.triggered
                ? "border-red-500/50 bg-red-950/15"
                : "border-border/50 bg-card/50"
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <MapPin
                  className={`h-3 w-3 ${
                    cell.triggered ? "text-red-400" : "text-muted-foreground"
                  }`}
                />
                <span className="text-xs font-medium">
                  {cell.label ||
                    `${cell.lat.toFixed(3)}, ${cell.lon.toFixed(3)}`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {cell.triggered && (
                  <span className="rounded bg-red-500/20 px-1 py-0.5 text-[9px] text-red-400">
                    ALERTE
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-muted-foreground/50 hover:text-red-400"
                  onClick={() => onRemoveCell(cell.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>

            {/* Thresholds */}
            <div className="mt-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Seuil départ (ignition)
                </span>
                <span className="text-[10px] font-medium">{cell.thresholdIgnition}</span>
              </div>
              <Slider
                value={[cell.thresholdIgnition]}
                onValueChange={([v]) =>
                  onUpdateThreshold(cell.id, "thresholdIgnition", v)
                }
                min={0}
                max={100}
                step={5}
                className="h-1"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Seuil propagation (spread)
                </span>
                <span className="text-[10px] font-medium">
                  {cell.thresholdSpread}
                </span>
              </div>
              <Slider
                value={[cell.thresholdSpread]}
                onValueChange={([v]) =>
                  onUpdateThreshold(cell.id, "thresholdSpread", v)
                }
                min={0}
                max={100}
                step={5}
                className="h-1"
              />

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  Seuil FWI
                </span>
                <span className="text-[10px] font-medium">
                  {cell.thresholdFWI}
                </span>
              </div>
              <Slider
                value={[cell.thresholdFWI]}
                onValueChange={([v]) =>
                  onUpdateThreshold(cell.id, "thresholdFWI", v)
                }
                min={0}
                max={100}
                step={5}
                className="h-1"
              />
            </div>

            {/* Push toggle + last alert */}
            <div className="mt-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={cell.pushEnabled}
                  onCheckedChange={(v) => onTogglePush(cell.id, v)}
                  className="h-4 w-7 data-[state=checked]:bg-fire-600"
                />
                <Bell
                  className={`h-3 w-3 ${
                    cell.pushEnabled
                      ? "text-fire-500"
                      : "text-muted-foreground/40"
                  }`}
                />
                <span className="text-[9px] text-muted-foreground/50">
                  Push
                </span>
              </div>
              {cell.lastAlert && (
                <span className="text-[9px] text-muted-foreground/40">
                  Dernière alerte :{" "}
                  {new Date(cell.lastAlert).toLocaleDateString("fr-FR")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Notification fallback info ─────────────────────────── */}
      <Separator className="bg-border/30" />
      <div className="rounded-md border border-border/30 bg-card/30 px-2.5 py-2">
        <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
          <Mail className="h-3 w-3" />
          Repli notification
        </p>
        <p className="text-[9px] text-muted-foreground/50">
          Si les notifications push échouent (iOS PWA hors écran d&apos;accueil,
          batterie faible, réseau instable), un récapitulatif des alertes peut
          être envoyé par e-mail ou via un fil RSS. Configurez votre adresse
          dans les paramètres.
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          <Input
            placeholder="email@exemple.fr (optionnel)"
            className="h-7 text-[10px]"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-[10px]"
          >
            <Mail className="h-3 w-3" />
            Enregistrer
          </Button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Rss className="h-3 w-3 text-orange-500" />
          <span className="text-[9px] text-muted-foreground/50">
            Fil RSS des alertes : disponible à /api/v1/alerts/feed
          </span>
        </div>
      </div>

      {/* ── Disclaimer répété ─────────────────────────────────── */}
      <div className="rounded-md bg-destructive/5 px-2 py-1.5 text-center text-[8px] leading-tight text-destructive/60">
        ⚠️ Les seuils et alertes ci-dessus n&apos;ont aucune valeur
        opérationnelle. En situation réelle, contactez les secours (18/112).
        Les notifications push ne sont pas un canal fiable d&apos;alerte de
        sécurité — iOS ne supporte le web push que depuis l&apos;écran
        d&apos;accueil.
      </div>
    </div>
  );
}
