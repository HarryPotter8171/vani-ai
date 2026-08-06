import { billingService } from "../billing/init.js";

function resolveUser(req) {
  if (!req.user?._id) {
    const err = new Error("Authentication required");
    err.status = 401;
    throw err;
  }
  return {
    _id: req.user._id,
    id: req.user.id,
    email: req.user.email,
    name: req.user.name,
  };
}

function userIdOf(user) {
  return String(user._id);
}

export const getBillingOverview = async (req, res) => {
  try {
    const user = resolveUser(req);
    const overview = await billingService.getOverview(userIdOf(user));
    res.json({ overview });
  } catch (err) {
    console.error("[billing]", err);
    res.status(err.status || 500).json({
      error: err.message || "Unable to load billing overview",
    });
  }
};

export const listPlans = async (_req, res) => {
  try {
    const plans = await billingService.listPlans();
    res.json({
      plans,
      stripeEnabled: billingService.isStripeEnabled(),
      razorpayEnabled: billingService.isRazorpayEnabled(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to list plans" });
  }
};

export const getSubscription = async (req, res) => {
  try {
    const user = resolveUser(req);
    const subscription = await billingService.getSubscription(userIdOf(user));
    res.json({ subscription });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Unable to load subscription",
    });
  }
};

export const getUsage = async (req, res) => {
  try {
    const user = resolveUser(req);
    const usage = await billingService.getUsage(userIdOf(user));
    res.json(usage);
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Unable to load usage",
    });
  }
};

export const listInvoices = async (req, res) => {
  try {
    const user = resolveUser(req);
    const invoices = await billingService.listInvoices(userIdOf(user));
    res.json({ invoices });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unable to list invoices" });
  }
};

/** Current plan feature flags + remaining quotas (for client gating UX). */
export const getEntitlements = async (req, res) => {
  try {
    const user = resolveUser(req);
    const entitlements = await billingService.getEntitlements(userIdOf(user));
    res.json({ entitlements });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Unable to load entitlements",
    });
  }
};

/**
 * Upgrade / downgrade / subscribe.
 * Returns checkoutUrl when Stripe or Razorpay Checkout is required.
 * Optional body.provider: "stripe" | "razorpay".
 */
export const requestUpgrade = async (req, res) => {
  try {
    const user = resolveUser(req);
    const planId = String(req.body?.planId || "").toLowerCase().trim();
    const intervalRaw = String(req.body?.interval || "month").toLowerCase();
    const interval = intervalRaw === "year" ? "year" : "month";
    const providerRaw = String(req.body?.provider || "").toLowerCase().trim();
    const provider =
      providerRaw === "stripe" || providerRaw === "razorpay"
        ? providerRaw
        : null;

    if (!["free", "pro", "business", "enterprise"].includes(planId)) {
      return res.status(400).json({
        error: "planId must be free, pro, business, or enterprise",
      });
    }

    const result = await billingService.changePlan({
      userId: userIdOf(user),
      email: user.email,
      name: user.name,
      planId,
      interval,
      provider,
    });

    res.status(200).json({
      ok: result.ok,
      mode: result.mode,
      message: result.message,
      provider: result.provider || null,
      keyId: result.keyId || null,
      checkoutUrl: result.checkoutUrl || null,
      checkout: result.checkoutUrl
        ? {
            url: result.checkoutUrl,
            sessionId: result.sessionId,
            provider: result.provider || null,
            keyId: result.keyId || null,
          }
        : null,
      sessionId: result.sessionId || null,
      subscription: result.subscription,
      overview: result.overview,
    });
  } catch (err) {
    console.error("[billing]", err);
    res.status(err.status || 500).json({
      error: err.message || "Unable to change plan",
    });
  }
};

/** Explicit Checkout session create (same as upgrade for free→paid). */
export const createCheckout = async (req, res) => {
  try {
    const user = resolveUser(req);
    const planId = String(req.body?.planId || "").toLowerCase().trim();
    const interval =
      String(req.body?.interval || "month").toLowerCase() === "year"
        ? "year"
        : "month";
    const providerRaw = String(req.body?.provider || "").toLowerCase().trim();
    const provider =
      providerRaw === "stripe" || providerRaw === "razorpay"
        ? providerRaw
        : null;

    const session = await billingService.createCheckoutSession({
      userId: userIdOf(user),
      email: user.email,
      name: user.name,
      planId,
      interval,
      provider,
    });
    res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.sessionId,
      subscriptionId: session.subscriptionId || session.sessionId,
      keyId: session.keyId || null,
      provider: session.keyId ? "razorpay" : provider || "stripe",
    });
  } catch (err) {
    console.error("[billing]", err);
    res.status(err.status || 500).json({
      error: err.message || "Unable to create checkout session",
    });
  }
};

export const createPortal = async (req, res) => {
  try {
    const user = resolveUser(req);
    const session = await billingService.createPortalSession({
      userId: userIdOf(user),
      email: user.email,
      name: user.name,
    });
    res.json({ ok: true, portalUrl: session.url });
  } catch (err) {
    console.error("[billing]", err);
    res.status(err.status || 500).json({
      error: err.message || "Unable to open customer portal",
    });
  }
};

export const cancelSubscription = async (req, res) => {
  try {
    const user = resolveUser(req);
    const subscription = await billingService.cancelAtPeriodEnd(userIdOf(user));
    res.json({
      ok: true,
      subscription,
      message:
        "Subscription will remain active until the end of the billing period.",
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Unable to cancel subscription",
    });
  }
};

export const resumeSubscription = async (req, res) => {
  try {
    const user = resolveUser(req);
    const subscription = await billingService.resumeSubscription(
      userIdOf(user)
    );
    res.json({
      ok: true,
      subscription,
      message: "Subscription resumed — auto-renew is on again.",
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: err.message || "Unable to resume subscription",
    });
  }
};

/**
 * Stripe / Razorpay webhook — expects raw body (Buffer) when mounted with express.raw().
 * Discriminates by signature header, or by req.billingWebhookProvider when
 * mounted on /webhooks/razorpay vs /webhooks.
 */
export const billingWebhook = async (req, res) => {
  try {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : typeof req.body === "string"
        ? Buffer.from(req.body)
        : req.rawBody || null;

    const result = await billingService.handleWebhook({
      type: !Buffer.isBuffer(req.body) ? req.body?.type : undefined,
      payload: !Buffer.isBuffer(req.body) ? req.body || {} : undefined,
      headers: {
        "content-type": req.headers["content-type"],
        "stripe-signature": req.headers["stripe-signature"],
        "x-razorpay-signature": req.headers["x-razorpay-signature"],
      },
      rawBody,
      provider: req.billingWebhookProvider || "auto",
    });
    res.status(200).json(result);
  } catch (err) {
    console.error("[billing:webhook]", err);
    res.status(err.status || 400).json({
      error: err.message || "Webhook failed",
    });
  }
};
