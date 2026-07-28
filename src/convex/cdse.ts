/**
 * cdse.ts — Convex actions pour Copernicus Data Space Ecosystem (CDSE).
 *
 * 🔒 POLITIQUE SÉCURITÉ (audit 2026-07-28) :
 *   Le `client_secret` CDSE ne DOIT JAMAIS transiter par le frontend.
 *   Il est lu ici depuis process.env, qui est alimenté par le Convex
 *   dashboard (variables chiffrées au repos, jamais exposées au bundle).
 *
 *   Le frontend passe uniquement son `clientId` (public, type identifiant)
 *   ou rien du tout — le backend applique ses propres identifiants serveur.
 *
 *   Cette action ne prend plus `clientSecret` en argument. Toute tentative
 *   passe par configuration serveur.
 *
 * Configuration côté Convex dashboard (Settings → Environment Variables) :
 *   - CDSE_CLIENT_ID      (obligatoire)
 *   - CDSE_CLIENT_SECRET  (obligatoire, secret)
 */

import { v } from "convex/values";
import { action } from "./_generated/server";

// ── Constantes ─────────────────────────────────────────────────────────

// Endpoint OAuth2 Copernicus Data Space (valide pour Sentinel Hub sh-* clients).
const CDSE_TOKEN_URL =
  "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token";

// ── Action : obtenir un token OAuth CDSE ───────────────────────────────

export const getToken = action({
  args: {
    /**
     * clientId public (optionnel). Le secret est TOUJOURS lu côté serveur.
     * Si non fourni, on utilise la variable CDSE_CLIENT_ID du dashboard Convex.
     */
    clientId: v.optional(v.string()),
  },
  handler: async (_ctx, args) => {
    const clientId =
      args.clientId ?? (process.env as Record<string, string | undefined>)["CDSE_CLIENT_ID"] ?? "";
    // 🔒 Secret lu exclusivement depuis l'env Convex — jamais depuis args.
    const clientSecret =
      (process.env as Record<string, string | undefined>)["CDSE_CLIENT_SECRET"] ?? "";

    if (!clientId || !clientSecret) {
      return {
        success: false as const,
        error:
          "CDSE credentials non configurées côté serveur. " +
          "Configurer CDSE_CLIENT_ID et CDSE_CLIENT_SECRET dans le dashboard Convex " +
          "(Settings → Environment Variables).",
      };
    }

    try {
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
