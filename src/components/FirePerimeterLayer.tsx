/**
 * FirePerimeterLayer — Estimation prudente de périmètres de feu
 * à partir des hotspots satellite FIRMS (VIIRS).
 *
 * Méthode :
 * 1. Clustering spatial des hotspots (distance < 1 km)
 * 2. Enveloppe convexe (Andrew monotone chain) pour chaque cluster ≥ 3 pts
 * 3. Buffer de 250 m autour du polygone (1 pixel VIIRS)
 * 4. Calcul de surface (ha) par formule du shoelace
 *
 * ⚠️ Estimation conservative — ce ne sont PAS des surfaces brûlées vérifiées.
 * Les détections FIRMS sont des anomalies thermiques, pas des contours de feu.
 */

import { useEffect, useRef, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import type { HotspotData } from "./HotspotLayer";

// ── Constantes ──────────────────────────────────────────────────────────

/** Distance max entre deux hotspots pour être dans le même cluster (mètres) */
const CLUSTER_DISTANCE_M = 1000;

/** Buffer autour du convex hull (pixels VIIRS ~375 m, on prend 250 m prudents) */
const BUFFER_DEG = 0.0025; // ~250 m en degrés

/** Nb minimum de détections pour former un polygone */
const MIN_POINTS_PER_CLUSTER = 3;

/** Nb minimum de détections pour un cluster « confirmé » */
const CONFIRMED_THRESHOLD = 10;

// ── Géométrie ───────────────────────────────────────────────────────────

interface Point {
  x: number;
  y: number;
}

/** Distance haversine entre deux points (lon/lat) en mètres */
function haversineM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Andrew monotone chain — convex hull d'un ensemble de points */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const lower: Point[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Surface d'un polygone (lon/lat) en hectares via shoelace + cos(lat) correction */
function polygonAreaHa(polygon: Point[]): number {
  if (polygon.length < 3) return 0;
  const avgLat = polygon.reduce((s, p) => s + p.y, 0) / polygon.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const j = (i + 1) % polygon.length;
    area += polygon[i].x * polygon[j].y - polygon[j].x * polygon[i].y;
  }
  area = Math.abs(area) / 2;
  // 1 deg² ≈ (111320 m)² corrigé par cos(lat)
  const m2PerDeg2 = 111320 * 111320 * cosLat;
  return (area * m2PerDeg2) / 10000;
}

// ── Types exportés ──────────────────────────────────────────────────────

export interface FirePerimeter {
  /** Identifiant du cluster */
  id: number;
  /** Coordonnées du polygone (lon, lat) */
  polygon: [number, number][];
  /** Détections dans le cluster */
  detectionCount: number;
  /** FRP max dans le cluster */
  maxFrp: number;
  /** Date de la première détection */
  firstDate: string;
  /** Date de la dernière détection */
  lastDate: string;
  /** Surface estimée en hectares (base, sans buffer) */
  areaHa: number;
  /** Surface avec buffer (estimation prudente haute) */
  areaHaBuffered: number;
  /** Niveau de confiance : "confirmé" | "probable" | "possible" */
  confidence: "confirmé" | "probable" | "possible";
  /** Âge moyen en heures */
  avgAgeHours: number;
  /** Centroid du polygone */
  centroid: [number, number];
}

// ── Clustering + hull ───────────────────────────────────────────────────

export function estimateFirePerimeters(hotspots: HotspotData[]): FirePerimeter[] {
  if (hotspots.length < MIN_POINTS_PER_CLUSTER) return [];

  // 1. Trier par date (plus récent d'abord) pour des IDs stables
  const sorted = [...hotspots].sort(
    (a, b) => new Date(b.acq_date).getTime() - new Date(a.acq_date).getTime(),
  );

  // 2. Clustering spatial (distance < 1 km)
  const used = new Set<number>();
  const clusters: HotspotData[][] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue;
    const cluster: HotspotData[] = [sorted[i]];
    used.add(i);

    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue;
      const d = haversineM(sorted[i].lon, sorted[i].lat, sorted[j].lon, sorted[j].lat);
      if (d < CLUSTER_DISTANCE_M) {
        cluster.push(sorted[j]);
        used.add(j);
      }
    }

    if (cluster.length >= MIN_POINTS_PER_CLUSTER) {
      clusters.push(cluster);
    }
  }

  // 3. Pour chaque cluster : convex hull + buffer + surface
  return clusters.map((cluster, idx) => {
    const points: Point[] = cluster.map((h) => ({ x: h.lon, y: h.lat }));
    const hull = convexHull(points);

    // Hull étendu (buffer)
    const buffered = hull.map((p) => ({
      x: p.x,
      y: p.y + BUFFER_DEG, // Approximation N/S
    }));

    const area = polygonAreaHa(hull);
    const areaBuffered = polygonAreaHa(buffered);

    // Niveau de confiance
    const count = cluster.length;
    const confidence: "confirmé" | "probable" | "possible" =
      count >= CONFIRMED_THRESHOLD
        ? "confirmé"
        : count >= 5
          ? "probable"
          : "possible";

    const dates = cluster.map((h) => h.acq_date).filter(Boolean).sort();
    const frps = cluster.map((h) => h.frp);
    const ages = cluster.map((h) => h.age_hours).filter((a) => !isNaN(a));

    // Centroid
    const centroid: [number, number] = [
      hull.reduce((s, p) => s + p.x, 0) / hull.length,
      hull.reduce((s, p) => s + p.y, 0) / hull.length,
    ];

    return {
      id: idx,
      polygon: hull.map((p) => [p.x, p.y] as [number, number]),
      detectionCount: count,
      maxFrp: Math.max(...frps),
      firstDate: dates[0] ?? "",
      lastDate: dates[dates.length - 1] ?? "",
      areaHa: Math.round(area * 10) / 10,
      areaHaBuffered: Math.round(areaBuffered * 10) / 10,
      confidence,
      avgAgeHours: ages.length ? ages.reduce((s, a) => s + a, 0) / ages.length : 0,
      centroid,
    };
  }).filter((p) => p.areaHa > 0);
}

// ── Couleurs par confiance ─────────────────────────────────────────────

function confidenceColor(confidence: string): string {
  switch (confidence) {
    case "confirmé": return "#ef4444";
    case "probable": return "#f97316";
    case "possible": return "#eab308";
    default: return "#6b7280";
  }
}

// ── Composant MapLibre ──────────────────────────────────────────────────

interface FirePerimeterLayerProps {
  map: maplibregl.Map;
  perimeters: FirePerimeter[];
  visible?: boolean;
}

export default function FirePerimeterLayer({
  map,
  perimeters,
  visible = true,
}: FirePerimeterLayerProps) {
  const sourceId = "fire-perimeter-source";
  const fillLayerId = "fire-perimeter-fill";
  const lineLayerId = "fire-perimeter-line";
  const popupRef = useRef<maplibregl.Popup | null>(null);

  // GeoJSON stable par référence
  const geojson = useMemo(() => {
    if (!perimeters.length) return null;
    return {
      type: "FeatureCollection" as const,
      features: perimeters.map((p) => ({
        type: "Feature" as const,
        properties: {
          id: p.id,
          count: p.detectionCount,
          area: p.areaHa,
          areaBuf: p.areaHaBuffered,
          confidence: p.confidence,
          maxFrp: p.maxFrp,
          firstDate: p.firstDate,
          lastDate: p.lastDate,
          avgAge: Math.round(p.avgAgeHours),
          color: confidenceColor(p.confidence),
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [p.polygon],
        },
      })),
    };
  }, [perimeters]);

  useEffect(() => {
    if (!map || !visible || !geojson) {
      // Cleanup si pas visible
      if (map) {
        if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
        if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
      return;
    }

    // Cleanup existant
    if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
    if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    map.addSource(sourceId, {
      type: "geojson",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: geojson as any,
    });

    // Remplissage semi-transparent
    map.addLayer({
      id: fillLayerId,
      type: "fill",
      source: sourceId,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": [
          "case",
          ["==", ["get", "confidence"], "confirmé"],
          0.25,
          ["==", ["get", "confidence"], "probable"],
          0.18,
          0.1,
        ],
      },
    });

    // Contour
    map.addLayer({
      id: lineLayerId,
      type: "line",
      source: sourceId,
      paint: {
        "line-color": ["get", "color"],
        "line-width": [
          "case",
          ["==", ["get", "confidence"], "confirmé"],
          2.5,
          ["==", ["get", "confidence"], "probable"],
          2,
          1.5,
        ],
        "line-opacity": 0.8,
        "line-dasharray": [3, 2],
      },
    });

    // Clic → popup
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [fillLayerId],
      });
      if (!features.length) {
        popupRef.current?.remove();
        return;
      }

      const props = features[0].properties;
      if (!props) return;

      const html = `
        <div class="text-xs leading-relaxed" style="font-family:system-ui,sans-serif;max-width:240px">
          <p class="font-semibold text-sm mb-1">
            Foyer ${props.confidence === "confirmé" ? "🔥" : props.confidence === "probable" ? "⚠️" : "⚪"}
            ${props.confidence}
          </p>
          <p><strong>Détections</strong> : ${props.count} hotspots</p>
          <p><strong>Surface estimée</strong> : ${props.area} ha${
        props.areaBuf > props.area
          ? ` (${props.areaBuf} ha avec buffer)`
          : ""
      }</p>
          <p><strong>FRP max</strong> : ${props.maxFrp?.toFixed(1) ?? "—"} MW</p>
          <p><strong>Période</strong> : ${props.firstDate ?? "?"} → ${props.lastDate ?? "?"}</p>
          <p><strong>Âge moyen</strong> : ${props.avgAge ?? "?"} h</p>
          <hr class="my-1 border-border/30" />
          <p class="text-[9px] text-muted-foreground/60">
            ⚠️ Estimation conservative basée sur anomalies thermiques VIIRS.
            Ne remplace pas un relevé terrain.
          </p>
        </div>
      `;

      popupRef.current?.remove();
      popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: "280px" })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    };

    map.on("click", fillLayerId, onClick);

    map.on("mouseenter", fillLayerId, () => {
      map.getCanvas().style.cursor = "crosshair";
    });
    map.on("mouseleave", fillLayerId, () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.off("click", fillLayerId, onClick);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
      popupRef.current?.remove();
    };
  }, [map, geojson, visible]);

  return null;
}
