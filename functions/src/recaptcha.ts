/**
 * NUNULIA — reCAPTCHA v3 Verification
 *
 * Verifies reCAPTCHA v3 tokens server-side before allowing
 * sensitive actions (login, seller registration).
 *
 * The client sends a token obtained via grecaptcha.execute(),
 * and this function verifies it with Google's siteverify API.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { RECAPTCHA_SECRET_KEY, ALLOWED_ORIGINS } from "./config.js";

/** Minimum score to pass (0.0 = bot, 1.0 = human) */
const MIN_SCORE = 0.5;

export const verifyRecaptcha = onRequest(
  {
    secrets: [RECAPTCHA_SECRET_KEY],
    maxInstances: 10,
    cors: ALLOWED_ORIGINS,
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const { token, action } = req.body || {};

    if (!token || typeof token !== "string") {
      res.status(400).json({ success: false, error: "Missing reCAPTCHA token" });
      return;
    }

    try {
      const secretKey = RECAPTCHA_SECRET_KEY.value();
      const verifyUrl = "https://www.google.com/recaptcha/api/siteverify";

      const response = await fetch(verifyUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`,
      });

      const data = await response.json();

      if (!data.success) {
        logger.warn("[verifyRecaptcha] Verification failed:", data["error-codes"]);
        res.status(403).json({ success: false, error: "reCAPTCHA verification failed" });
        return;
      }

      // Verify action matches (prevents token reuse across different actions)
      if (action && data.action !== action) {
        logger.warn("[verifyRecaptcha] Action mismatch:", { expected: action, got: data.action });
        res.status(403).json({ success: false, error: "Action mismatch" });
        return;
      }

      // Check score
      if (data.score < MIN_SCORE) {
        logger.warn("[verifyRecaptcha] Low score:", { score: data.score, action: data.action });
        res.status(403).json({ success: false, error: "Score too low", score: data.score });
        return;
      }

      logger.info("[verifyRecaptcha] Passed:", { score: data.score, action: data.action });
      res.json({ success: true, score: data.score });
    } catch (err: any) {
      logger.error("[verifyRecaptcha] Error:", err.message);
      res.status(500).json({ success: false, error: "Verification service unavailable" });
    }
  }
);
