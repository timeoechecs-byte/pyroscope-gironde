/**
 * SpreadEllipseLayer — Ellipses de propagation sur MapLibre.
 *
 * Affiche les ellipses de propagation à 1/3/6/12h.
 * Chaque ellipse est orientée selon le vent de son échéance.
 * Couleur dégradée : 1h = clair, 12h = foncé.
 */

import { useEffect } from "react";
import * as maplibregl from "maplibre-gl";

interface EllipseData {
  horizon_h: number;
  center_lon: number;
  center_lat: number;
  semi_major_m: number;
  semi_minor_m: number;
  orientation_deg: number;
  area_ha: number;
  head_ros_m_min: number;
  wind_direction_deg: number;
  wind_speed_kmh: number;
}

interface SpreadEllipseLayerProps {
  map: maplibregl.Map;
  ellipses: EllipseData[];
  visible?: boolean;
}

/** Horizon → couleur (1h=clair, 12h=foncé). */
function horizonColor(h: number): string {
  const colors: Record<number, string> = {
    1: "rgba(239, 68, 68, 0.15)",
    3: "rgba(220, 38, 38, 0.25)",
    6: "rgba(185, 28, 28, 0.35)",
    12: "rgba(127, 29, 29, 0.45)",
  };
  return colors[h] ?? "rgba(220, 38, 38, 0.20)";
}

function horizonBorder(h: number): string {
  const colors: Record<number, string> = {
    1: "#fca5a5",
    3: "#f87171",
    6: "#ef4444",
    12: "#dc2626",
  };
  return colors[h] ?? "#ef4444";
}

/** Convert semi-major/minor (m) to degrees at given latitude. */
function metersToDegrees(m: number, lat: number): number {
  const latRad = (lat * Math.PI) / 180;
  const mPerDegLat = 111320;
  const mPerDegLon = 111320 * Math.cos(latRad);
  return m / Math.min(mPerDegLat, mPerDegLon);
}

/** Build SVG path for an oriented ellipse. */
function buildEllipsePath(
  cx: number,
  cy: number,
  a_deg: number,
  b_deg: number,
  angle_deg: number,
  n_points: number = 64,
): string {
  const points: string[] = [];
  const rad = (angle_deg * Math.PI) / 180;

  for (let i = 0; i <= n_points; i++) {
    const t = (2 * Math.PI * i) / n_points;
    const x = a_deg * Math.cos(t);
    const y = b_deg * Math.sin(t);
    const xr = x * Math.cos(rad) - y * Math.sin(rad);
    const yr = x * Math.sin(rad) + y * Math.cos(rad);
    points.push(`${(cx + xr).toFixed(6)},${(cy + yr).toFixed(6)}`);
  }

  return `POLYGON((${points.join(", ")}))`;
}

export default function SpreadEllipseLayer({
  map,
  ellipses,
  visible = true,
}: SpreadEllipseLayerProps) {
  const sourceId = "spread-ellipses-source";
  const layerFill = "spread-ellipses-fill";
  const layerLine = "spread-ellipses-line";

  useEffect(() => {
    if (!map || !visible || ellipses.length === 0) {
      if (map.getLayer(layerFill)) map.removeLayer(layerFill);
      if (map.getLayer(layerLine)) map.removeLayer(layerLine);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    if (map.getLayer(layerFill)) map.removeLayer(layerFill);
    if (map.getLayer(layerLine)) map.removeLayer(layerLine);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const features: GeoJSON.Feature[] = ellipses.map((e) => {
      const a_deg = metersToDegrees(e.semi_major_m, e.center_lat);
      const b_deg = metersToDegrees(e.semi_minor_m, e.center_lat);
      const wkt = buildEllipsePath(
        e.center_lon, e.center_lat, a_deg, b_deg, e.orientation_deg,
      );

      return {
        type: "Feature",
        properties: {
          horizon: e.horizon_h,
          area_ha: e.area_ha,
          orientation: e.orientation_deg,
          head_ros: e.head_ros_m_min,
          wind_dir: e.wind_direction_deg,
          wind_speed: e.wind_speed_kmh,
          color: horizonColor(e.horizon_h),
          border: horizonBorder(e.horizon_h),
        },
        geometry: {
          type: "Polygon",
          coordinates: [
            wkt
              .replace("POLYGON((", "")
              .replace("))", "")
              .split(", ")
              .map((pt) => {
                const [lon, lat] = pt.split(",").map(Number);
                return [lon, lat];
              }),
          ],
        },
      };
    });

    map.addSource(sourceId, {
      type: "geojson",
      data: { type: "FeatureCollection", features },
    });

    // Fill layer
    map.addLayer({
      id: layerFill,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.5,
      },
    });

    // Outline layer
    map.addLayer({
      id: layerLine,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["get", "border"],
        "line-width": [
          "match",
          ["get", "horizon"],
          1, 1.5,
          3, 1.5,
          6, 2,
          12, 2,
          1,
        ],
        "line-opacity": 0.8,
        "line-dasharray": [3, 2],
      },
    });

    // Popup on click
    map.on("click", layerFill, (e: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, {
        layers: [layerFill],
      });
      if (!feature.length) return;
      const p = feature[0].properties;

      new maplibregl.Popup({ closeButton: true, maxWidth: "250px" })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="text-xs font-sans leading-relaxed">
            <p><strong>Horizon</strong> : ${p.horizon}h</p>
            <p><strong>Surface</strong> : ${p.area_ha?.toFixed(1) ?? "?"} ha</p>
            <p><strong>Orientation</strong> : ${p.orientation}°</p>
            <p><strong>ROS tête</strong> : ${p.head_ros ?? "?"} m/min</p>
            <p><strong>Vent</strong> : ${p.wind_speed ?? "?"} km/h (${p.wind_dir ?? "?"}°)</p>
          </div>`,
        )
        .addTo(map);
    });

    return () => {
      if (map.getLayer(layerFill)) map.removeLayer(layerFill);
      if (map.getLayer(layerLine)) map.removeLayer(layerLine);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, ellipses, visible]);

  return null;
}
