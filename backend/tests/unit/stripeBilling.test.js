import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getStripePriceId,
  isStripeConfigured,
  resolvePlanFromPriceId,
} from "../../billing/stripeConfig.ts";

describe("Stripe billing config", () => {
  const keys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_PRO_MONTHLY",
    "STRIPE_PRICE_PRO_YEARLY",
    "STRIPE_PRICE_BUSINESS_MONTHLY",
    "STRIPE_PRICE_BUSINESS_YEARLY",
  ];
  const prev = {};

  beforeEach(() => {
    for (const k of keys) {
      prev[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("reports stripe configured only when secret is set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    expect(isStripeConfigured()).toBe(true);
  });

  it("resolves price ids from env", () => {
    process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro_m";
    process.env.STRIPE_PRICE_PRO_YEARLY = "price_pro_y";
    process.env.STRIPE_PRICE_BUSINESS_MONTHLY = "price_biz_m";
    expect(getStripePriceId("pro", "month")).toBe("price_pro_m");
    expect(getStripePriceId("pro", "year")).toBe("price_pro_y");
    expect(getStripePriceId("business", "month")).toBe("price_biz_m");
    expect(getStripePriceId("free", "month")).toBeNull();
    expect(getStripePriceId("enterprise", "year")).toBeNull();
  });

  it("maps price id back to plan + interval", () => {
    process.env.STRIPE_PRICE_BUSINESS_YEARLY = "price_biz_y";
    expect(resolvePlanFromPriceId("price_biz_y")).toEqual({
      planId: "business",
      interval: "year",
    });
    expect(resolvePlanFromPriceId("price_unknown")).toBeNull();
  });
});
