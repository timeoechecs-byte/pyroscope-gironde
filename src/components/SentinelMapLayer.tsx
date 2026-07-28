/**
 * SentinelMapLayer — Couche satellite Sentinel-2 via WMS CDSE.
 *
 * Gère le cycle de vie du token OAuth et ajoute une source raster
 * MapLibre pour l'affichage des indices NDVI/NBR/TrueColor.
 */

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import { useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { getCdseConfig } from "@/config/api-keys";
import { buildWmsTileUrl, isTokenValid, getRefreshInterval } from "@/lib/sentinel";

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
  const getToken = useAction(api.cdse.getToken);
  const tokenRef = useRef<string | null>(null);
  const expiresAtRef = useRef<number>(0);
  const [status, setStatus] = useState<"loading" | "active" | "error" | "unconfigured">("loading");

  // Gestion du token OAuth
  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    async function fetchToken() {
      const config = getCdseConfig();
      // 🔒 On ne vérifie que la partie publique (clientId). Le clientSecret
      // reste côté serveur Convex et n'est jamais passé en argument.
      if (!config?.clientId) {
        if (mounted) setStatus("unconfigured");
        return;
      }

      try {
        const result = await getToken({
          clientId: config.clientId,
        });

        if (!mounted) return;

        if (result.success) {
          tokenRef.current = result.token;
          expiresAtRef.current = result.expiresAt;
          setStatus("active");

          // Planifier le rafraîchissement
          const interval = getRefreshInterval(result.expiresIn);
          refreshTimer = setTimeout(fetchToken, interval);
        } else {
          setStatus("error");
          console.warn("[CDSE] Token error:", result.error);
        }
      } catch {
        if (mounted) setStatus("error");
      }
    }

    fetchToken();

    return () => {
      mounted = false;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [getToken, visible, layer]);

  // Ajout/suppression de la couche raster sur la carte
  useEffect(() => {
    if (!map || !visible) {
      // Nettoyage
      if (map && map.getLayer(layerId)) map.removeLayer(layerId);
      if (map && map.getSource(sourceId)) map.removeSource(sourceId);
      return;
    }

    const token = tokenRef.current;
    if (!token || !isTokenValid(expiresAtRef.current)) {
      // Token pas encore prêt ou expiré — ne pas ajouter la couche
      return;
    }

    // Nettoyage précédent
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    const cdseBaseUrl = getCdseConfig()?.baseUrl ?? "https://sh.dataspace.copernicus.eu";
    const wmsLayer = LAYER_WMS_MAP[layer] ?? "TRUE_COLOR";
    const tileUrl = buildWmsTileUrl(cdseBaseUrl, token, wmsLayer);

    map.addSource(sourceId, {
      type: "raster",
      tiles: [tileUrl],
      tileSize: 256,
      attribution: `© Copernicus Sentinel-2 (${LAYER_LABELS[layer] ?? layer})`,
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

    return () => {
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    };
  }, [map, visible, layer, status]);

  return null;
}
