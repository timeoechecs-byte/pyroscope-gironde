/**
 * sentinel.ts — Gestion des tokens CDSE et couches Sentinel-2 pour MapLibre.
 *
 * Flow :
 *   1. Appel Convex action `getToken` avec les credentials CDSE
 *   2. Utilisation du token pour ajouter une source raster WMS sur la carte
 *   3. Rafraîchissement automatique du token avant expiration
 */

import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";

type TokenResult = FunctionReturnType<typeof api.cdse.getToken>;

interface SentinelLayer {
  id: string;
  label: string;
  wmsLayer: string;
  description: string;
}

/** Couches Sentinel-2 disponibles via WMS */
export const SENTINEL_LAYERS: SentinelLayer[] = [
  {
    id: "ndvi",
    label: "NDVI (végétation)",
    wmsLayer: "NDVI",
    description: "Normalized Difference Vegetation Index",
  },
  {
    id: "true_color",
    label: "Image satellite",
    wmsLayer: "TRUE_COLOR",
    description: "True color Sentinel-2 L2A",
  },
  {
    id: "ndwi",
    label: "NDWI (eau)",
    wmsLayer: "NDWI",
    description: "Normalized Difference Water Index",
  },
];

/**
 * Construit l'URL WMS pour MapLibre avec le token.
 *
 * 🛑 STOP-GAP DE SÉCURITÉ — le token CDSE est inclus dans l'URL de la tuile.
 * Pendant son heure de validité (TTL 1 h), le token fuit via :
 *   - l'historique du navigateur,
 *   - l'en-tête `Referer` envoyé au serveur cartographique,
 *   - les logs des proxies / CDN en chemin,
 *   - les devtools affichant les requêtes raster de MapLibre.
 *
 * La cible définie dans `docs/ARCHITECTURE_PROXY.md` §Niveau 3 est de
 * proxifier les tuiles via le backend :
 *   `/api/v1/tiles/sentinel/{layer}/{z}/{x}/{y}.png`
 * Le navigateur n'appelle plus Copernicus qu'au travers du proxy ; le token
 * CDSE est passé en en-tête `Authorization` côté serveur uniquement ; les
 * images sont mises en cache 24 h car Sentinel-2 change au mieux une fois
 * par jour.
 *
 * Tant que ce proxy backend n'existe pas dans ce dépôt, l'application
 * accepte cette fenêtre d'exposition d'1 h par cycle de rafraîchissement.
 * Quand ARCHITECTURE_PROXY.md sera implémenté, cette fonction sera
 * supprimée et `SentinelMapLayer.tsx` pointera vers le proxy.
 */
export function buildWmsTileUrl(
  baseUrl: string,
  token: string,
  layer: string,
): string {
  return (
    `${baseUrl}/ogc/wms/sentinel-2-l2a` +
    `?token=${encodeURIComponent(token)}` +
    `&SERVICE=WMS` +
    `&VERSION=1.3.0` +
    `&REQUEST=GetMap` +
    `&FORMAT=image/png` +
    `&TRANSPARENT=true` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&CRS=EPSG:3857` +
    `&BBOX={bbox-epsg-3857}` +
    `&WIDTH=256` +
    `&HEIGHT=256`
  );
}

/** Vérifie si un token est encore valide (marge de 60s) */
export function isTokenValid(expiresAt: number): boolean {
  return Date.now() < expiresAt - 60_000;
}

/** Extrait le message d'erreur d'un résultat de token */
export function getTokenErrorMessage(result: TokenResult): string | null {
  if (!result.success) return result.error;
  return null;
}

/** Durée recommandée entre rafraîchissements (moitié du temps de vie) */
export function getRefreshInterval(expiresIn: number): number {
  return Math.max(60_000, (expiresIn * 1000) / 2);
}
