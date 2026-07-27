/**
 * MapContainer — MapLibre GL JS centered on Gironde (BBOX_DEPARTEMENT).
 *
 * Fond : OpenStreetMap (gratuit, sans clé).
 * Données dynamiques : injectées via les composants enfants (HotspotLayer, etc.).
 *
 * SPEC §C-05.d : en mode preview Freebuff, la carte affiche
 * « données indisponibles » plutôt que des données mockées.
 */

import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

// BBOX_DEPARTEMENT: lon [-1.35, 0.35] × lat [44.15, 45.60]
const CENTER: [number, number] = [-0.5, 44.9];
const ZOOM = 9;
const MIN_ZOOM = 8;
const MAX_ZOOM = 14;

// OSM raster tiles — gratuit, sans clé, pas de quota
const OSM_STYLE = `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json`;

export interface MapContainerHandle {
  getMap: () => maplibregl.Map | null;
}

interface MapContainerProps {
  children?: React.ReactNode;
  interactive?: boolean;
}

export default function MapContainer({
  children,
  interactive = true,
}: MapContainerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    try {
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: OSM_STYLE,
        center: CENTER,
        zoom: ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        attributionControl: { compact: true },

      });

      // Navigation controls
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      // Scale
      map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

      map.on("load", () => {
        setMapLoaded(true);
        mapRef.current = map;
      });

      map.on("error", () => {
        setMapError(true);
      });
    } catch {
      setMapError(true);
    }

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  if (mapError) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a120a] text-[#607060]">
        <div className="text-center">
          <p className="text-sm font-semibold">Erreur de chargement de la carte</p>
          <p className="mt-1 text-xs">Fond OpenStreetMap indisponible</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={mapContainer} className="relative h-full w-full">
      {mapLoaded && children}
    </div>
  );
}
