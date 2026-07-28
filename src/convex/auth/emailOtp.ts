import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

// 🔒 Clé API vly.ai — LUE depuis l'environnement Convex (dashboard Convex
// Environment Variables), JAMAIS hardcodée. Était précédemment "vlytothemoon2025"
// en clair (incident 2026-07-28), désormais process.env.VLY_API_KEY.
// La rotation se fait côté plateforme Convex sans toucher au code.
const VLY_API_KEY = process.env.VLY_API_KEY ?? "";
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
    if (!VLY_API_KEY) {
      throw new Error(
        "VLY_API_KEY non configurée côté Convex (Environment Variables).",
      );
    }
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
