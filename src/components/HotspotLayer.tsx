/**
 * HotspotLayer — FIRMS fire detections on MapLibre.
 *
 * Points colorés par FRP (Fire Radiative Power).
 * Clic → popup détaillée.
 *
 * En mode preview Freebuff : aucun hotspot n'est rendu
 * tant que le backend n'est pas connecté (§C-05.d).
 */

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";

export interface HotspotData {
  lat: number;
  lon: number;
  frp: number;
  confidence: string;
  satellite: string;
  acq_date: string;
  acq_time: number;
  age_hours: number;
  daynight: string;
}

interface HotspotLayerProps {
  map: maplibregl.Map;
  hotspots: HotspotData[];
  visible?: boolean;
}

/** FRP → couleur : vert (faible) → jaune → orange → rouge (élevé). */
function frpColor(frp: number): string {
  if (frp <= 1) return "#22c55e"; // vert
  if (frp <= 5) return "#eab308"; // jaune
  if (frp <= 20) return "#f97316"; // orange
  if (frp <= 50) return "#ef4444"; // rouge
  return "#7f1d1d"; // rouge sombre (feu intense)
}

/** Taille du cercle en fonction du FRP. */
function frpRadius(frp: number): number {
  if (frp <= 1) return 4;
  if (frp <= 5) return 6;
  if (frp <= 20) return 8;
  if (frp <= 50) return 10;
  return 12;
}

/** Opacité selon la confiance. */
function confidenceOpacity(confidence: string): number {
  if (confidence === "high") return 1;
  if (confidence === "nominal") return 0.7;
  return 0.4;
}

export default function HotspotLayer({
  map,
  hotspots,
  visible = true,
}: HotspotLayerProps) {
  const sourceId = "hotspots-source";
  const layerId = "hotspots-layer";
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!map || !visible || hotspots.length === 0) return;

    // Remove existing source/layer
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    // Build GeoJSON
    const features: GeoJSON.Feature[] = hotspots.map((h, i) => ({
      type: "Feature",
      properties: {
        id: i,
        frp: h.frp,
        confidence: h.confidence,
        satellite: h.satellite,
        acq_date: h.acq_date,
        acq_time: h.acq_time,
        age_hours: h.age_hours,
        daynight: h.daynight,
        color: frpColor(h.frp),
        radius: frpRadius(h.frp),
        opacity: confidenceOpacity(h.confidence),
      },
      geometry: {
        type: "Point",
        coordinates: [h.lon, h.lat],
      },
    }));

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features,
      },
    });

    // Circle layer
    map.addLayer({
      id: layerId,
      type: "circle",
      source: sourceId,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["get", "radius"],
        "circle-opacity": ["get", "opacity"],
        "circle-stroke-width": 1,
        "circle-stroke-color": "rgba(255,255,255,0.3)",
      },
    });

    // Click → popup
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const feature = map.queryRenderedFeatures(e.point, { layers: [layerId] });
      if (!feature.length) {
        popupRef.current?.remove();
        return;
      }

      const props = feature[0].properties;
      const coords = (feature[0].geometry as GeoJSON.Point).coordinates;

      const popupHtml = `
        <div class="text-xs leading-relaxed" style="font-family:system-ui,sans-serif;max-width:220px">
          <p><strong>FRP</strong> : ${props.frp.toFixed(1)} MW</p>
          <p><strong>Confiance</strong> : ${props.confidence}</p>
          <p><strong>Satellite</strong> : ${props.satellite}</p>
          <p><strong>Date</strong> : ${props.acq_date} ${String(props.acq_time).padStart(4, "0")}</p>
          <p><strong>Âge</strong> : ${props.age_hours.toFixed(1)} h</p>
          <p><strong>Jour/Nuit</strong> : ${props.daynight === "D" ? "Jour" : "Nuit"}</p>
        </div>
      `;

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "260px" })
        .setLngLat(coords as [number, number])
        .setHTML(popupHtml)
        .addTo(map);
    };

    map.on("click", layerId, onClick);

    // Cursor change
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
      popupRef.current?.remove();
    };
  }, [map, hotspots, visible]);

  return null;
}
