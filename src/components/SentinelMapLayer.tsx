/**
 * SentinelMapLayer — Couche satellite Sentinel-2 via le PROXY backend.
 *
 * 🔒 POST-FREEZE PROXY (2026-07-28) :
 *   - MapLibre charge des tuiles depuis `/api/v1/tiles/sentinel/...`.
 *   - Le token OAuth CDSE reste strictement côté serveur
 *     (jamais transmis au navigateur, jamais en query string).
 *   - `.env` du backend : `CDSE_CLIENT_ID` + `CDSE_CLIENT_SECRET`.
 */

import { useEffect, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import { sentinelTileUrl } from "@/lib/api";

interface SentinelMapLayerProps {
  map: maplibregl.Map;
  layer: "ndvi" | "true_color" | "ndwi";
  visible?: boolean;
}

const LAYER_WMS_MAP: Record<string, string> = {
  ndvi: "NDVI",
  true_color: "TRUE_COLOR",
  ndwi: "NDWI",
};

const LAYER_LABELS: Record<string, string> = {
  ndvi: "NDVI",
  true_color: "Satellite",
  ndwi: "NDWI",
};

export default function SentinelMapLayer({
  map,
  layer,
  visible = true,
}: SentinelMapLayerProps) {
  const sourceId = `sentinel-${layer}`;
  const layerId = `sentinel-${layer}-raster`;
  // Référence gardée pour invalidation future (CDSE down → status)
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!map || !visible) return;

    // Cleanup précédent
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const wmsLayer = LAYER_WMS_MAP[layer] ?? "TRUE_COLOR";
    // ⚠️ IMPORTANT : l'URL ne contient AUCUN token. MapLibre envoie `{z}/{x}/{y}`
    // au backend, qui complète avec Bearer côté serveur.
    const proxyUrl = sentinelTileUrl(
      wmsLayer as "NDVI" | "NDMI" | "NDWI" | "TRUE_COLOR",
      0, 0, 0, // template (cf. raster source ci-dessous)
    ).replace("/0/0/0.png", "/{z}/{x}/{y}.png");

    try {
      map.addSource(sourceId, {
        type: "raster",
        tiles: [proxyUrl],
        tileSize: 256,
        attribution: `© Copernicus Sentinel-2 (${LAYER_LABELS[layer] ?? layer}) · via proxy PyroScope`,
      });

      map.addLayer({
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: {
          "raster-opacity": 0.7,
          "raster-resampling": "linear",
        },
      });
    } catch (e) {
      // Mode dégradé silencieux : la couche Sentinel n'apparaît pas,
      // le reste de la carte reste fonctionnel.
      // eslint-disable-next-line no-console
      console.warn("[SentinelMapLayer] proxy unreachable:", e);
    }

    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch { /* carte démontée */ }
    };
  }, [map, visible, layer, layerId, sourceId]);

  return null;
}
