/**
 * PyroScope 33 — Dashboard (authenticated).
 *
 * Contient la carte MapLibre (zone « Carte indisponible » en mode preview),
 * un panneau latéral d'information cellule, et les contrôles de couches.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertTriangle,
  Flame,
  Layers,
  LogOut,
  Map,
  Satellite,
  Thermometer,
  Wind,
} from "lucide-react";
import { useNavigate } from "react-router";

const layers = [
  {
    id: "hotspots",
    label: "Points chauds",
    icon: Flame,
    available: false,
    eta: "PHASE 1 — Connecteur FIRMS",
  },
  {
    id: "weather",
    label: "Météo",
    icon: Thermometer,
    available: false,
    eta: "PHASE 1 — AROME HD",
  },
  {
    id: "wind",
    label: "Vent animé",
    icon: Wind,
    available: false,
    eta: "PHASE 1 — Particules",
  },
  {
    id: "satellite",
    label: "Satellite",
    icon: Satellite,
    available: false,
    eta: "PHASE 3 — Sentinel-2",
  },
  {
    id: "risk",
    label: "Risque",
    icon: AlertTriangle,
    available: false,
    eta: "PHASE 4 — Score final",
  },
];

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0f1a0f] text-[#e8e0d8]">
      {/* ── Header ──────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[#2a3a2a]/50 bg-[#0f1a0f]/90 px-4 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="h-5 w-5 text-amber-500" />
            <span className="text-sm font-semibold tracking-tight">
              PyroScope<span className="text-amber-500">33</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#607060]">
              {user?.email ?? "Invité"}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#a0b0a0] hover:text-[#e8e0d8]"
              onClick={handleSignOut}
            >
              <LogOut className="mr-1 h-3.5 w-3.5" />
              <span className="text-xs">Quitter</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Main layout ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:flex-row">
        {/* ── Map area ─────────────────────────────────────────── */}
        <main className="relative flex flex-1 flex-col">
          {/* Map placeholder */}
          <div className="relative flex flex-1 items-center justify-center bg-[#0a120a]">
            {/* Grid background simulation */}
            <div className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            <div className="relative z-10 flex flex-col items-center gap-4 p-8 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#1a2e1a]/50">
                <Map className="h-10 w-10 text-amber-700/50" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#607060]">
                  Carte non disponible
                </h2>
                <p className="mt-1 max-w-sm text-sm text-[#405040]">
                  <strong className="text-[#607060]">Mode preview</strong>
                  &nbsp;— Fond de carte IGN, couches dynamiques (points chauds,
                  vent, risque) disponibles après déploiement du backend.
                </p>
              </div>
              <Badge
                variant="outline"
                className="border-amber-700/30 text-[10px] text-amber-700"
              >
                🔧 Backend requis — voir README mode B
              </Badge>
            </div>

            {/* Bbox overlay hint */}
            <div className="absolute bottom-3 left-3 rounded border border-[#2a3a2a]/50 bg-[#0f1a0f]/80 px-2 py-1 text-[10px] text-[#405040]">
              Gironde · lon [-1.35, 0.35] · lat [44.15, 45.60]
            </div>
          </div>
        </main>

        {/* ── Sidebar ───────────────────────────────────────────── */}
        <aside className="w-full border-t border-[#2a3a2a]/50 bg-[#1a2e1a]/30 lg:w-72 lg:border-l lg:border-t-0">
          <div className="p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#607060]">
              Couches de données
            </h3>

            <div className="space-y-1.5">
              {layers.map((layer) => (
                <button
                  key={layer.id}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[#2a3a2a]/50"
                >
                  <layer.icon className="h-4 w-4 text-amber-700" />
                  <span className="flex-1 text-[#a0b0a0]">{layer.label}</span>
                  <Badge
                    variant="outline"
                    className="border-[#2a3a2a] text-[10px] text-[#607060]"
                  >
                    {layer.available ? "✔" : "🔧"}
                  </Badge>
                </button>
              ))}
            </div>

            <Separator className="my-4 bg-[#2a3a2a]" />

            {/* Cell info placeholder */}
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#607060]">
              Cellule
            </h3>
            <div className="rounded-md border border-[#2a3a2a] bg-[#0f1a0f]/50 p-3">
              <p className="text-xs text-[#405040]">
                Cliquez sur la carte pour voir les données de la cellule
              </p>
            </div>

            <Separator className="my-4 bg-[#2a3a2a]" />

            {/* Data freshness */}
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[#607060]">
              État des sources
            </h3>
            <div className="space-y-1.5 text-xs">
              {[
                { name: "NASA FIRMS", status: "Non configuré" },
                { name: "Open-Meteo", status: "Non configuré" },
                { name: "Copernicus", status: "Non configuré" },
              ].map((s) => (
                <div
                  key={s.name}
                  className="flex items-center justify-between rounded px-2 py-1"
                >
                  <span className="text-[#607060]">{s.name}</span>
                  <span className="text-[#405040]">{s.status}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
