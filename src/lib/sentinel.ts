/**
 * sentinel.ts — Stop-gap Sentinel-2 (post-freeze proxy 2026-07-28).
 *
 * 🔒 Le token OAuth CDSE ne franchit JAMAIS la frontière du serveur.
 *
 * Avant le freeze : cette couche construisait l'URL WMS avec `?token=...`
 * dans la query string. Cette fuite par l'historique de navigation, l'en-tête
 * `Referer` et les logs proxy Open-Meteo/CDSE est éliminée par le proxy
 * `/api/v1/tiles/sentinel/...` du backend.
 *
 * Le frontend construit désormais son URL via `src/lib/api.ts` →
 * `sentinelTileUrl()` qui ne porte aucun secret.
 *
 * Ce module conserve uniquement des constantes utilitaires pour les
 * couches Sentinel utilisées par `src/components/SentinelMapLayer.tsx`.
 */

export const SENTINEL_LAYERS = [
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
] as const;

// Stubs conservés pour rétro-compat : le proxy backend gère désormais
// refresh et expiration. Le frontend n'a plus à le faire.
export function isTokenValid(_expiresAt: number): boolean {
  return false;
}
export function getRefreshInterval(_expiresIn: number): number {
  return 60_000;
}
