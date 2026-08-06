import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import {
  getBillingOverview,
  listPlans,
  getSubscription,
  getUsage,
  listInvoices,
  getEntitlements,
  requestUpgrade,
  createCheckout,
  createPortal,
  cancelSubscription,
  resumeSubscription,
} from "../controllers/billingController.js";

const router = express.Router();

const writeLimit = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  message: "Too many billing requests. Please try again shortly.",
});

/** Public plan catalog (marketing / upgrade UI). */
router.get("/plans", listPlans);

router.use(requireAuth);

router.get("/overview", getBillingOverview);
router.get("/subscription", getSubscription);
router.get("/usage", getUsage);
router.get("/entitlements", getEntitlements);
router.get("/invoices", listInvoices);

router.post("/upgrade", writeLimit, requestUpgrade);
router.post("/checkout", writeLimit, createCheckout);
router.post("/portal", writeLimit, createPortal);
router.post("/cancel", writeLimit, cancelSubscription);
router.post("/resume", writeLimit, resumeSubscription);

export default router;
