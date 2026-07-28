/**
 * cdse.ts — Convex actions pour Copernicus Data Space Ecosystem (CDSE).
 *
 * Proxy OAuth2 client_credentials → token pour appels WMS/WMTS frontend.
 * Les credentials CDSE sont lues depuis process.env (Convex dashboard)
 * ou passées en argument (fallback depuis les clés VITE_ du frontend).
 *
 * Appel depuis le frontend :
 *   const { token, expiresAt } = await useAction(api.cdse.getToken, {
 *     clientId: "...", clientSecret: "..."
 *   });
 *
 * Puis utilisation du token dans une source raster MapLibre :
 *   "https://sh.dataspace.copernicus.eu/ogc/wms/sentinel-2-l2a"
 *   + "?token=" + token + "&SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap"
 *   + "&FORMAT=image/png&TRANSPARENT=true&LAYERS=" + layer
 *   + "&CRS=EPSG:3857&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256"
 */

import { v } from "convex/values";
import { action } from "./_generated/server";

// ── Constantes ─────────────────────────────────────────────────────────

// Endpoint OAuth2 Copernicus Data Space (valide pour Sentinel Hub sh-* clients).
// Note : le sous-domaine sh.dataspace renvoie 503 sur le token endpoint — on garde
// donc identity.dataspace qui renvoie au moins un 401 propre sur credentials invalides.
const CDSE_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

// ── Action : obtenir un token OAuth CDSE ───────────────────────────────

export const getToken = action({
  args: {
    clientId: v.optional(v.string()),
    clientSecret: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    // 1. Déterminer les credentials : Convex env vars → args
    const clientId =
      args.clientId ?? (process.env as Record<string, string>)["VITE_CDSE_CLIENT_ID"] ?? "";
    const clientSecret =
      args.clientSecret ??
      (process.env as Record<string, string>)["VITE_CDSE_CLIENT_SECRET"] ?? "";

    if (!clientId || !clientSecret) {
      return {
        success: false as const,
        error: "CDSE credentials non configurées. Ajouter VITE_CDSE_CLIENT_ID et VITE_CDSE_CLIENT_SECRET dans le Keys UI Freebuff ou via Convex dashboard.",
      };
    }

    try {
      // 2. Appel OAuth2 client_credentials
      const params = new URLSearchParams();
      params.append("grant_type", "client_credentials");
      params.append("client_id", clientId);
      params.append("client_secret", clientSecret);

      const r = await fetch(CDSE_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!r.ok) {
        const text = await r.text();
        return {
          success: false as const,
          error: `CDSE OAuth error ${r.status} : ${text.slice(0, 200)}`,
        };
      }

      const json = (await r.json()) as { access_token: string; expires_in: number };
      const expiresIn = json.expires_in ?? 3600;

      return {
        success: true as const,
        token: json.access_token,
        expiresIn,
        expiresAt: Date.now() + expiresIn * 1000,
      };
    } catch (e) {
      return {
        success: false as const,
        error: e instanceof Error ? e.message : "Erreur CDSE inconnue",
      };
    }
  },
});
