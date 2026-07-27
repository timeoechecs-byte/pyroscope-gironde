/**
 * VegetationLayer — BD Forêt V2 essences + NDVI stress hydrique.
 */

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

interface VegetationCellData {
  lat: number;
  lon: number;
  species: string;
  ndvi_anomaly?: number; // écart à la médiane saisonnière
  canopy_density?: number;
}

interface VegetationLayerProps {
  map: maplibregl.Map;
  cells: VegetationCellData[];
  mode?: "species" | "ndvi";
  visible?: boolean;
}

const SPECIES_COLORS: Record<string, string> = {
  pin_maritime: "#166534", // vert foncé
  feuillus: "#22c55e",     // vert clair
  mixte: "#86efac",        // vert tendre
  non_foret: "#92400e",    // brun
  autre: "#a1a1aa",        // gris
};

const NDVI_STRESS_COLORS = [
  { max: -0.3, color: "#dc2626" },  // stress sévère
  { max: 0.0, color: "#f97316" },   // stress modéré
  { max: 0.3, color: "#eab308" },   // normal bas
  { max: 0.6, color: "#22c55e" },   // normal
  { max: 1.0, color: "#166534" },   // vigoureux
];

export default function VegetationLayer({
  map,
  cells,
  mode = "species",
  visible = true,
}: VegetationLayerProps) {
  const sourceId = "vegetation-source";
  const layerId = "vegetation-layer";

  useEffect(() => {
    if (!map || !visible || cells.length === 0) return;

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const features: GeoJSON.Feature[] = cells.map((cell) => {
      let color = "#a1a1aa";
      if (mode === "species") {
        color = SPECIES_COLORS[cell.species] ?? "#a1a1aa";
      } else if (mode === "ndvi" && cell.ndvi_anomaly != null) {
        for (const band of NDVI_STRESS_COLORS) {
          if ((cell.ndvi_anomaly ?? 0) < band.max) {
            color = band.color;
            break;
          }
        }
      }

      return {
        type: "Feature",
        properties: {
          species: cell.species,
          canopy_density: cell.canopy_density,
          ndvi_anomaly: cell.ndvi_anomaly,
          color,
        },
        geometry: {
          type: "Point",
          coordinates: [cell.lon, cell.lat],
        },
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
        "circle-radius": 5,
        "circle-opacity": 0.5,
        "circle-blur": 0.3,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": "rgba(255,255,255,0.15)",
      },
    });

    map.on("click", layerId, (e: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (!feature.length) return;
      const props = feature[0].properties;
      new maplibregl.Popup({ closeButton: true, maxWidth: "220px" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-xs font-sans">
            <p><strong>Espèce</strong> : ${props.species}</p>
            <p><strong>Couvert</strong> : ${props.canopy_density ?? "—"}%</p>
            ${props.ndvi_anomaly != null ? `<p><strong>Anomalie NDVI</strong> : ${props.ndvi_anomaly.toFixed(2)}</p>` : ""}
          </div>`,
        )
        .addTo(map);
    });

    map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });

    return () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, cells, mode, visible]);

  return null;
}
