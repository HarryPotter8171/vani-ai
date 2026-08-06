import express from "express";
import { billingWebhook } from "../controllers/billingController.js";
import { createRateLimiter } from "../middleware/rateLimit.js";

const router = express.Router();

const webhookLimit = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: "Too many webhook requests.",
});

/**
 * Billing webhooks — mounted with express.raw() in app.js so signature
 * verification receives the unmodified body.
 *
 * POST /api/billing/webhooks           — auto-detect Stripe vs Razorpay
 * POST /api/billing/webhooks/stripe    — Stripe only
 * POST /api/billing/webhooks/razorpay  — Razorpay only
 */
router.post("/", webhookLimit, (req, res, next) => {
  req.billingWebhookProvider = "auto";
  return billingWebhook(req, res, next);
});

router.post("/stripe", webhookLimit, (req, res, next) => {
  req.billingWebhookProvider = "stripe";
  return billingWebhook(req, res, next);
});

router.post("/razorpay", webhookLimit, (req, res, next) => {
  req.billingWebhookProvider = "razorpay";
  return billingWebhook(req, res, next);
});

export default router;
