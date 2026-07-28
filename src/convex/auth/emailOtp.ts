import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

// 🔒 Clé API vly.ai — clé PARTAGÉE du gabarit Freebuff/vly.ai, pas un
// secret personnel.
//   - En développement / preview : cette valeur par défaut fonctionne.
//   - En production : remplacer par `process.env.VLY_API_KEY` et
//     définir la variable dans le dashboard Convex (Environment Variables).
//   - Historique : le 2026-07-28 une tentative de "sécuriser" en
//     passant par `process.env.VLY_API_KEY` a CASSÉ l'OTP car la
//     variable n'avait pas été posée côté Convex. Restauré le défaut
//     pour ne pas bloquer l'auth, avec ce commentaire pour qu'on ne
//     refasse pas l'erreur.
const VLY_API_KEY =
  process.env.VLY_API_KEY ?? "vlytothemoon2025";
const VLY_OTP_ENDPOINT =
  process.env.VLY_OTP_ENDPOINT ?? "https://email.vly.ai/send_otp";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    try {
      await axios.post(
        VLY_OTP_ENDPOINT,
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a vly.ai application",
        },
        {
          headers: {
            "x-api-key": VLY_API_KEY,
          },
        },
      );
    } catch (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
