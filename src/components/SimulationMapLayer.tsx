/**
 * SimulationMapLayer — Visualisation de la simulation sur MapLibre.
 *
 * - Point d'allumage (cercle rouge animé)
 * - Cellules brûlées à l'instant courant (dégradé orange→rouge)
 * - Front de propagation (contour)
 * - Mise à jour réactive au curseur temporel
 */

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";

interface SimCell {
  cell_id: number;
  lat: number;
  lon: number;
  burn_time_min: number;
}

interface SimulationMapLayerProps {
  map: maplibregl.Map;
  ignitionPoint: { lat: number; lon: number } | null;
  burnedCells: SimCell[];
  currentTime_h: number;
  visible?: boolean;
}

export default function SimulationMapLayer({
  map,
  ignitionPoint,
  burnedCells,
  currentTime_h,
  visible = true,
}: SimulationMapLayerProps) {
  const ignitionSourceId = "sim-ignition-source";
  const ignitionLayerId = "sim-ignition-layer";
  const burnSourceId = "sim-burn-source";
  const burnLayerId = "sim-burn-layer";
  const animRef = useRef<number>(0);

  // ── Ignition marker ────────────────────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;

    // Cleanup
    if (map.getLayer(ignitionLayerId)) map.removeLayer(ignitionLayerId);
    if (map.getSource(ignitionSourceId)) map.removeSource(ignitionSourceId);

    if (!ignitionPoint) return;

    map.addSource(ignitionSourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: [ignitionPoint.lon, ignitionPoint.lat],
            },
          },
        ],
      },
    });

    // Pulsing ignition marker
    map.addLayer({
      id: ignitionLayerId,
      type: "circle",
      source: ignitionSourceId,
      paint: {
        "circle-color": "#ef4444",
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "pulse"],
          0, 6,
          1, 10,
        ],
        "circle-opacity": 0.8,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fca5a5",
      },
    });

    return () => {
      if (map.getLayer(ignitionLayerId)) map.removeLayer(ignitionLayerId);
      if (map.getSource(ignitionSourceId)) map.removeSource(ignitionSourceId);
    };
  }, [map, ignitionPoint, visible]);

  // ── Burned cells ───────────────────────────────────────────────
  useEffect(() => {
    if (!map || !visible) return;

    if (map.getLayer(burnLayerId)) map.removeLayer(burnLayerId);
    if (map.getSource(burnSourceId)) map.removeSource(burnSourceId);

    if (!burnedCells.length) return;

    // Filter cells burned up to current time
    const currentMin = currentTime_h * 60;
    const visibleCells = burnedCells.filter((c) => c.burn_time_min <= currentMin);

    if (!visibleCells.length) return;

    const features: GeoJSON.Feature[] = visibleCells.map((cell) => {
      // Color gradient: orange → red based on burn time
      const burnRatio = cell.burn_time_min / Math.max(...burnedCells.map(c => c.burn_time_min));
      const r = Math.round(220 + 35 * burnRatio);
      const g = Math.round(38 * (1 - burnRatio));
      const b = Math.round(38 * (1 - burnRatio));
      const color = `rgb(${r}, ${g}, ${b})`;

      return {
        type: "Feature",
        properties: { burn_time: cell.burn_time_min, color },
        geometry: {
          type: "Point",
          coordinates: [cell.lon, cell.lat],
        },
      };
    });

    map.addSource(burnSourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    map.addLayer({
      id: burnLayerId,
      type: "circle",
      source: burnSourceId,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 4,
        "circle-opacity": 0.6,
        "circle-blur": 0.3,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": "rgba(255,200,100,0.3)",
      },
    });

    return () => {
      if (map.getLayer(burnLayerId)) map.removeLayer(burnLayerId);
      if (map.getSource(burnSourceId)) map.removeSource(burnSourceId);
    };
  }, [map, burnedCells, currentTime_h, visible]);

  return null;
}
