/**
 * TerrainLayer — RGE ALTI elevation + slope + aspect on MapLibre.
 */

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

interface TerrainCellData {
  lat: number;
  lon: number;
  elevation_m?: number;
  slope_deg?: number;
  aspect_deg?: number;
}

interface TerrainLayerProps {
  map: maplibregl.Map;
  cells: TerrainCellData[];
  mode?: "elevation" | "slope";
  visible?: boolean;
}

function elevationColor(elev: number): string {
  if (elev <= 10) return "#a3e635";
  if (elev <= 30) return "#84cc16";
  if (elev <= 60) return "#65a30d";
  if (elev <= 100) return "#4d7c0f";
  return "#3f6212";
}

function slopeColor(slope: number): string {
  if (slope <= 1) return "#f0fdf4";
  if (slope <= 3) return "#bbf7d0";
  if (slope <= 5) return "#86efac";
  if (slope <= 10) return "#22c55e";
  return "#166534";
}

export default function TerrainLayer({
  map,
  cells,
  mode = "elevation",
  visible = true,
}: TerrainLayerProps) {
  const sourceId = "terrain-source";
  const layerId = "terrain-layer";

  useEffect(() => {
    if (!map || !visible || cells.length === 0) return;

    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const features: GeoJSON.Feature[] = cells.map((cell) => {
      const color =
        mode === "elevation"
          ? elevationColor(cell.elevation_m ?? 0)
          : slopeColor(cell.slope_deg ?? 0);

      return {
        type: "Feature",
        properties: {
          elevation: cell.elevation_m,
          slope: cell.slope_deg,
          aspect: cell.aspect_deg,
          color,
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
        "circle-radius": 5,
        "circle-opacity": 0.5,
        "circle-blur": 0.3,
      },
    });

    map.on("click", layerId, (e: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (!feature.length) return;
      const p = feature[0].properties;
      new maplibregl.Popup({ closeButton: true, maxWidth: "200px" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-xs font-sans">
            <p><strong>Altitude</strong> : ${p.elevation ?? "—"} m</p>
            <p><strong>Pente</strong> : ${p.slope ?? "—"}°</p>
            <p><strong>Exposition</strong> : ${p.aspect ?? "—"}°</p>
          </div>`,
        )
        .addTo(map);
    });

    return () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, cells, mode, visible]);

  return null;
}
