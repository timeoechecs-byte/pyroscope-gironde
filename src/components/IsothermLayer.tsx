/**
 * IsothermLayer — Isothermes de température sur la carte.
 *
 * Affiche des lignes de contour de température interpolées.
 * En mode preview : couche désactivée (donnée indisponible).
 */

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

interface IsothermData {
  /** Grid points with temperature values */
  grid: Array<{ lon: number; lat: number; temperature: number }>;
}

interface IsothermLayerProps {
  map: maplibregl.Map;
  data: IsothermData | null;
  visible?: boolean;
}

/** Température → couleur dégradé bleu (froid) → rouge (chaud). */
function tempColor(temp: number): string {
  if (temp <= 0) return "#3b82f6";
  if (temp <= 10) return "#60a5fa";
  if (temp <= 20) return "#fbbf24";
  if (temp <= 30) return "#f97316";
  if (temp <= 40) return "#ef4444";
  return "#7f1d1d";
}

export default function IsothermLayer({
  map,
  data,
  visible = true,
}: IsothermLayerProps) {
  const sourceId = "isotherms-source";
  const layerId = "isotherms-layer";

  useEffect(() => {
    if (!map || !visible || !data || data.grid.length === 0) {
      // Nettoyer
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    // Nettoyer existant
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    // Construire des points GeoJSON avec température
    const features: GeoJSON.Feature[] = data.grid.map((p) => ({
      type: "Feature",
      properties: {
        temperature: p.temperature,
        color: tempColor(p.temperature),
      },
      geometry: {
        type: "Point",
        coordinates: [p.lon, p.lat],
      },
    }));

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    // Cercle coloré par température
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 3,
        "circle-opacity": 0.6,
        "circle-blur": 1,
      },
    });

    return () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, data, visible]);

  return null;
}
