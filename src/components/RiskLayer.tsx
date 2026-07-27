/**
 * RiskLayer — Deux couches de risque séparées sur MapLibre.
 *
 * ignition_risk : dominé par facteur humain + sécheresse (pastilles oranges)
 * spread_risk   : dominé par ROS + vent + combustible (pastilles rouges)
 *
 * Au clic : popup avec les scores + classes.
 * L'écart ignition/spread est visible visuellement.
 */

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

export interface RiskCellData {
  cell_id: number;
  lat: number;
  lon: number;
  ignition_risk: number;
  spread_risk: number;
  combined_score: number;
  dominant: "ignition" | "spread" | "equal";
  risk_class: string;
  fuel_species?: string;
}

interface RiskLayerProps {
  map: maplibregl.Map;
  cells: RiskCellData[];
  mode?: "ignition" | "spread" | "combined";
  visible?: boolean;
  onCellClick?: (cell: RiskCellData) => void;
}

/** Score → couleur : 0-100 → vert → jaune → orange → rouge foncé. */
function riskColor(score: number): string {
  if (score <= 20) return "#166534";
  if (score <= 40) return "#a16207";
  if (score <= 60) return "#ea580c";
  if (score <= 80) return "#dc2626";
  return "#7f1d1d";
}

/** Taille du cercle selon le score. */
function riskRadius(score: number): number {
  if (score <= 20) return 4;
  if (score <= 40) return 5;
  if (score <= 60) return 6;
  if (score <= 80) return 7;
  return 8;
}

export default function RiskLayer({
  map,
  cells,
  mode = "combined",
  visible = true,
  onCellClick,
}: RiskLayerProps) {
  const sourceId = `risk-layer-${mode}`;
  const layerId = `risk-layer-${mode}`;

  useEffect(() => {
    if (!map || !visible || cells.length === 0) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const features: GeoJSON.Feature[] = cells.map((cell) => {
      const score =
        mode === "ignition"
          ? cell.ignition_risk
          : mode === "spread"
            ? cell.spread_risk
            : cell.combined_score;

      return {
        type: "Feature",
        properties: {
          cell_id: cell.cell_id,
          lat: cell.lat,
          lon: cell.lon,
          ignition_risk: cell.ignition_risk,
          spread_risk: cell.spread_risk,
          combined: cell.combined_score,
          dominant: cell.dominant,
          risk_class: cell.risk_class,
          color: riskColor(score),
          radius: riskRadius(score),
        },
        geometry: { type: "Point", coordinates: [cell.lon, cell.lat] },
      };
    });

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["get", "radius"],
        "circle-opacity": 0.55,
        "circle-blur": 0.4,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": "rgba(255,255,255,0.2)",
      },
    });

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (!feature.length) return;
      const p = feature[0].properties;

      // Notify parent if callback provided
      if (onCellClick) {
        onCellClick({
          cell_id: p.cell_id,
          lat: p.lat,
          lon: p.lon,
          ignition_risk: p.ignition_risk,
          spread_risk: p.spread_risk,
          combined_score: p.combined,
          dominant: p.dominant,
          risk_class: p.risk_class,
        });
      }

      new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-xs font-sans leading-relaxed" style="max-width:250px">
            <p class="font-semibold mb-1">Cellule #${p.cell_id}</p>
            <div class="flex gap-4 mb-1">
              <div>
                <span class="text-muted-foreground">Départ</span><br/>
                <span class="text-lg font-bold" style="color:${riskColor(p.ignition_risk)}">${p.ignition_risk}</span>
              </div>
              <div>
                <span class="text-muted-foreground">Propagation</span><br/>
                <span class="text-lg font-bold" style="color:${riskColor(p.spread_risk)}">${p.spread_risk}</span>
              </div>
              <div>
                <span class="text-muted-foreground">Combiné</span><br/>
                <span class="text-lg font-bold" style="color:${riskColor(p.combined)}">${p.combined}</span>
              </div>
            </div>
            <p>Classe : ${p.risk_class}</p>
            <p>Régime : ${p.dominant}</p>
            <p class="mt-1 text-[10px] text-muted-foreground">Cliquez pour la décomposition détaillée →</p>
          </div>`,
        )
        .addTo(map);
    };

    map.on("click", layerId, onClick);
    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.off("click", layerId, onClick);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, cells, mode, visible, sourceId, layerId, onCellClick]);

  return null;
}
