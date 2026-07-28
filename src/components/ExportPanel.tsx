/**
 * PyroScope 33 — Export Panel (PHASE 7).
 *
 * Allows users to export layer data in GeoJSON or CSV format.
 * Includes mandatory attribution and legal warning in every export.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import {
  Download,
  FileJson,
  FileSpreadsheet,
  AlertTriangle,
  Map,
  Flame,
  Thermometer,
  TreePine,
} from "lucide-react";

const LAYERS = [
  {
    id: "risk",
    label: "Risque cellulaire",
    description: "Scores ignition_risk et spread_risk sur la grille",
    icon: AlertTriangle,
  },
  {
    id: "fwi",
    label: "Indice FWI",
    description: "FFMC, DMC, DC, ISI, BUI, FWI, DSR, classe EFFIS",
    icon: Flame,
  },
  {
    id: "hotspots",
    label: "Points chauds",
    description: "Détections satellite NASA FIRMS (VIIRS, MODIS)",
    icon: Map,
  },
  {
    id: "weather",
    label: "Données météo",
    description: "Température, humidité, vent, précipitations",
    icon: Thermometer,
  },
  {
    id: "vegetation",
    label: "Végétation et combustible",
    description: "Modèle combustible, essence, NDVI, pente",
    icon: TreePine,
  },
];

const FORMATS = [
  { id: "geojson", label: "GeoJSON (.geojson)", icon: FileJson, desc: "GeoJSON FeatureCollection — compatible SIG" },
  { id: "csv", label: "CSV (.csv)", icon: FileSpreadsheet, desc: "Tableau colonnes avec lat/lon — tableur, pandas" },
];

export interface ExportPanelProps {
  onClose?: () => void;
}

export default function ExportPanel({ onClose }: ExportPanelProps) {
  const [selectedLayer, setSelectedLayer] = useState("risk");
  const [selectedFormat, setSelectedFormat] = useState("geojson");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedLayerData = LAYERS.find((l) => l.id === selectedLayer);

  const handleExport = () => {
    setIsExporting(true);
    setError(null);

    // Build export URL — backend endpoint or sample generation for preview
    // In production: /api/v1/export/{layer}.{format}
    // In preview: generate sample data client-side
    const isBackendAvailable = false; // Replace with actual backend detection

    if (isBackendAvailable) {
      const url = `/api/v1/export/${selectedLayer}.${selectedFormat}`;
      window.open(url, "_blank");
      setIsExporting(false);
    } else {
      // Preview mode: generate sample data client-side
      try {
        const data = generateSampleData(selectedLayer, selectedFormat);
        downloadBlob(data, `pyroscope33_${selectedLayer}.${selectedFormat}`, selectedFormat);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur d'export");
      }
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          Export de données
        </h3>
        {onClose && (
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            ×
          </Button>
        )}
      </div>

      {/* Layer selector */}
      <div>
        <Label className="text-xs text-muted-foreground">Couche</Label>
        <Select value={selectedLayer} onValueChange={setSelectedLayer}>
          <SelectTrigger className="mt-1 h-8 text-xs">
            <SelectValue placeholder="Choisir une couche" />
          </SelectTrigger>
          <SelectContent>
            {LAYERS.map((layer) => {
              const Icon = layer.icon;
              return (
                <SelectItem key={layer.id} value={layer.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{layer.label}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {selectedLayerData && (
          <p className="mt-1 text-[10px] text-muted-foreground/60">
            {selectedLayerData.description}
          </p>
        )}
      </div>

      {/* Format selector */}
      <div>
        <Label className="text-xs text-muted-foreground">Format</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {FORMATS.map((fmt) => {
            const Icon = fmt.icon;
            const isSelected = selectedFormat === fmt.id;
            return (
              <button
                key={fmt.id}
                type="button"
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-center transition-colors ${
                  isSelected
                    ? "border-fire-500 bg-fire-500/10 text-fire-600"
                    : "border-border/50 text-muted-foreground hover:border-border hover:bg-accent/50"
                }`}
                onClick={() => setSelectedFormat(fmt.id)}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{fmt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Attribution notice */}
      <Alert className="border-amber-700/20 bg-amber-700/5 py-2">
        <AlertTriangle className="h-3 w-3 text-amber-700" />
        <AlertTitle className="text-[10px] font-medium text-amber-700">
          Attribution obligatoire
        </AlertTitle>
        <AlertDescription className="mt-0.5 text-[9px] leading-relaxed text-amber-700/70">
          NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN · OpenStreetMap ©
          contributeurs (ODbL)
        </AlertDescription>
      </Alert>

      {/* Legal warning */}
      <p className="text-[9px] leading-relaxed text-muted-foreground/40">
        ⚠️ Outil expérimental à visée informative et pédagogique. Ne pas utiliser pour une
        décision opérationnelle ou de sécurité. En cas d'incendie : 18 / 112.
      </p>

      {/* Export button */}
      <Button
        className="w-full gap-2 bg-fire-600 text-xs hover:bg-fire-500"
        size="sm"
        onClick={handleExport}
        disabled={isExporting}
      >
        <Download className="h-3.5 w-3.5" />
        {isExporting
          ? "Préparation..."
          : `Exporter ${selectedFormat.toUpperCase()}`}
      </Button>

      {/* Backend unavailable badge */}
      <div className="flex items-center justify-center gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-amber-700" />
        <span className="text-[9px] text-muted-foreground/50">
          Backend non connecté — données d'exemple
        </span>
      </div>

      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}

// ── Client-side sample data generation for preview ─────────────────────

function generateSampleData(layer: string, format: string): string {
  const warning = "# ⚠️ Données d'exemple — backend non connecté\n" +
    "# Export PyroScope 33 — outil expérimental\n" +
    "# Attribution: NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN · OSM (ODbL)\n\n";

  if (format === "geojson") {
    return warning + JSON.stringify(getSampleGeoJSON(layer), null, 2);
  }

  // CSV
  const rows = getSampleRows(layer);
  if (rows.length === 0) return warning + "# Aucune donnée disponible\n";
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(",")];
  for (const row of rows) {
    csvLines.push(
      headers
        .map((h) => {
          const val = row[h];
          if (typeof val === "string" && (val.includes(",") || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val ?? "");
        })
        .join(",")
    );
  }
  return warning + csvLines.join("\n");
}

function getSampleGeoJSON(layer: string) {
  const features = [];
  const coords = [
    [-0.65, 44.85],
    [-0.40, 44.70],
    [-0.80, 45.05],
    [-0.20, 44.40],
  ];

  if (layer === "risk") {
    const risks = [
      { ignition: 35, spread: 72, cls: "élevé" },
      { ignition: 55, spread: 45, cls: "modéré" },
      { ignition: 20, spread: 30, cls: "faible" },
      { ignition: 70, spread: 85, cls: "très élevé" },
    ];
    for (let i = 0; i < coords.length; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coords[i] },
        properties: {
          cell_id: i + 1,
          ignition_risk: risks[i].ignition,
          spread_risk: risks[i].spread,
          risk_class: risks[i].cls,
        },
      });
    }
  } else if (layer === "fwi") {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [-0.65, 44.85] },
      properties: {
        cell_id: 1,
        date: "2026-07-27",
        ffmc: 88.64, dmc: 7.1, dc: 16.8,
        isi: 7.48, bui: 8.6, fwi: 7.8,
        effis_class: "modéré",
      },
    });
  } else if (layer === "hotspots") {
    features.push(
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-0.65, 44.85] },
        properties: {
          satellite: "VIIRS_SNPP",
          frp: 12.5,
          confidence: "nominal",
          acq_date: "2026-07-27",
          acq_time: "1325",
        },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-0.40, 44.70] },
        properties: {
          satellite: "MODIS",
          frp: 5.8,
          confidence: "low",
          acq_date: "2026-07-26",
          acq_time: "0140",
        },
      }
    );
  } else {
    // Generic
    for (let i = 0; i < coords.length; i++) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: coords[i] },
        properties: { cell_id: i + 1, layer, note: "Donnée d'exemple" },
      });
    }
  }

  return {
    type: "FeatureCollection",
    metadata: {
      export_generated_at: new Date().toISOString(),
      application: "PyroScope 33",
      warning: "⚠️ Outil expérimental. Ne pas utiliser opérationnellement.",
      attribution: "NASA FIRMS · Copernicus · Open-Meteo (CC BY 4.0) · IGN · OSM (ODbL)",
    },
    features,
  };
}

function getSampleRows(layer: string): Record<string, string | number>[] {
  if (layer === "risk") {
    return [
      { cell_id: 1, latitude: 44.85, longitude: -0.65, ignition_risk: 35, spread_risk: 72, risk_class: "élevé" },
      { cell_id: 2, latitude: 44.70, longitude: -0.40, ignition_risk: 55, spread_risk: 45, risk_class: "modéré" },
      { cell_id: 3, latitude: 45.05, longitude: -0.80, ignition_risk: 20, spread_risk: 30, risk_class: "faible" },
      { cell_id: 4, latitude: 44.40, longitude: -0.20, ignition_risk: 70, spread_risk: 85, risk_class: "très élevé" },
    ];
  }
  if (layer === "fwi") {
    return [
      { cell_id: 1, latitude: 44.85, longitude: -0.65, date: "2026-07-27", ffmc: 88.6, dmc: 7.1, dc: 16.8, isi: 7.5, bui: 8.6, fwi: 7.8, effis_class: "modéré" },
    ];
  }
  if (layer === "hotspots") {
    return [
      { latitude: 44.85, longitude: -0.65, satellite: "VIIRS_SNPP", frp: 12.5, confidence: "nominal", acq_date: "2026-07-27", acq_time: "1325" },
      { latitude: 44.70, longitude: -0.40, satellite: "MODIS", frp: 5.8, confidence: "low", acq_date: "2026-07-26", acq_time: "0140" },
    ];
  }
  return [];
}

function downloadBlob(content: string, filename: string, format: string) {
  const mimeType = format === "geojson" ? "application/geo+json" : "text/csv;charset=utf-8";
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
