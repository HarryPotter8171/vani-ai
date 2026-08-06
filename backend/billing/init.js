import {
  billingService,
  isStripeConfigured,
  isRazorpayConfigured,
} from "./index.ts";

let initialized = false;

/**
 * Seed plan catalog. Safe to call multiple times.
 * Stripe activates when STRIPE_SECRET_KEY is present.
 * Razorpay activates when RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are present.
 */
export async function initBilling() {
  if (initialized) return billingService;
  try {
    await billingService.init();
    initialized = true;
    const stripe = isStripeConfigured();
    const razorpay = isRazorpayConfigured();
    if (stripe && razorpay) {
      console.log("✅ Billing ready (Stripe + Razorpay enabled)");
    } else if (stripe) {
      console.log("✅ Billing ready (Stripe enabled)");
    } else if (razorpay) {
      console.log("✅ Billing ready (Razorpay enabled — UPI / Cards / Net Banking)");
    } else {
      console.log(
        "✅ Billing foundation ready (no payment gateway configured)"
      );
    }
  } catch (err) {
    // Mongo may be unavailable at import-time in some tests — soft fail.
    console.warn(
      "ℹ️  Billing seed deferred:",
      err instanceof Error ? err.message : err
    );
  }
  return billingService;
}

export { billingService };
