/**
 * FWIMapLayer — FWI danger classe par cellule sur la carte.
 *
 * Utilise une source GeoJSON avec chaque cellule colorée selon sa classe EFFIS.
 * En mode preview : génère des cellules de démonstration (C-05.d compliant —
 * montre la structure visuelle sans données fabriquées pour la valeur).
 */

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

interface FWICellData {
  cell_id: number;
  lat: number;
  lon: number;
  fwi: number;
  effis_class: string;
  effis_class_color: string;
}

interface FWIMapLayerProps {
  map: maplibregl.Map;
  cells: FWICellData[];
  visible?: boolean;
}

export default function FWIMapLayer({
  map,
  cells,
  visible = true,
}: FWIMapLayerProps) {
  const sourceId = "fwi-cells-source";
  const layerId = "fwi-cells-layer";

  useEffect(() => {
    if (!map || !visible || cells.length === 0) {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    // Cleanup existing
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    // Convert EFFIS color to hex for maplibre
    const colorMap: Record<string, string> = {
      "bg-green-700": "#166534",
      "bg-yellow-600": "#a16207",
      "bg-orange-500": "#ea580c",
      "bg-orange-700": "#c2410c",
      "bg-red-600": "#dc2626",
      "bg-red-900": "#7f1d1d",
    };

    const features: GeoJSON.Feature[] = cells.map((cell) => {
      const hexColor = colorMap[cell.effis_class_color] ?? "#6b7280";
      return {
        type: "Feature",
        properties: {
          cell_id: cell.cell_id,
          fwi: cell.fwi,
          effis_class: cell.effis_class,
          color: hexColor,
        },
        geometry: {
          type: "Point",
          coordinates: [cell.lon, cell.lat],
        },
      };
    });

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 6,
        "circle-opacity": 0.5,
        "circle-blur": 0.5,
        "circle-stroke-width": 0.5,
        "circle-stroke-color": "rgba(255,255,255,0.2)",
      },
    });

    // Click → popup
    map.on("click", layerId, (e: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (!feature.length) return;

      const props = feature[0].properties;
      const coords = (feature[0].geometry as GeoJSON.Point).coordinates;

      new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(coords as [number, number])
        .setHTML(
          `<div class="text-xs leading-relaxed" style="font-family:system-ui,sans-serif;max-width:200px">
            <p><strong>Cellule</strong> : ${props.cell_id}</p>
            <p><strong>FWI</strong> : ${props.fwi?.toFixed(1) ?? "—"}</p>
            <p><strong>Classe EFFIS</strong> : ${props.effis_class}</p>
          </div>`,
        )
        .addTo(map);
    });

    map.on("mouseenter", layerId, () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", layerId, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.off("click", layerId, () => {});
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, cells, visible]);

  return null;
}
