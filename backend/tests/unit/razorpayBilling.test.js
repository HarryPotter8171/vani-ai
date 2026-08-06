import { createHmac } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  getDefaultPaymentProvider,
  getRazorpayPlanId,
  getRazorpayTotalCount,
  isRazorpayConfigured,
  resolvePlanFromRazorpayPlanId,
} from "../../billing/razorpayConfig.ts";
import { razorpayService } from "../../billing/RazorpayService.ts";

describe("Razorpay billing config", () => {
  const keys = [
    "RAZORPAY_KEY_ID",
    "RAZORPAY_KEY_SECRET",
    "RAZORPAY_WEBHOOK_SECRET",
    "RAZORPAY_PLAN_PRO_MONTHLY",
    "RAZORPAY_PLAN_PRO_YEARLY",
    "RAZORPAY_PLAN_BUSINESS_MONTHLY",
    "RAZORPAY_PLAN_BUSINESS_YEARLY",
    "RAZORPAY_SUBSCRIPTION_TOTAL_COUNT",
    "BILLING_DEFAULT_PROVIDER",
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

  it("reports razorpay configured only when key id and secret are set", () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    expect(isRazorpayConfigured()).toBe(false);
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    expect(isRazorpayConfigured()).toBe(false);
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(isRazorpayConfigured()).toBe(true);
  });

  it("resolves plan ids from env", () => {
    process.env.RAZORPAY_PLAN_PRO_MONTHLY = "plan_pro_m";
    process.env.RAZORPAY_PLAN_PRO_YEARLY = "plan_pro_y";
    process.env.RAZORPAY_PLAN_BUSINESS_MONTHLY = "plan_biz_m";
    expect(getRazorpayPlanId("pro", "month")).toBe("plan_pro_m");
    expect(getRazorpayPlanId("pro", "year")).toBe("plan_pro_y");
    expect(getRazorpayPlanId("business", "month")).toBe("plan_biz_m");
    expect(getRazorpayPlanId("free", "month")).toBeNull();
    expect(getRazorpayPlanId("enterprise", "year")).toBeNull();
  });

  it("maps plan id back to plan + interval", () => {
    process.env.RAZORPAY_PLAN_BUSINESS_YEARLY = "plan_biz_y";
    expect(resolvePlanFromRazorpayPlanId("plan_biz_y")).toEqual({
      planId: "business",
      interval: "year",
    });
    expect(resolvePlanFromRazorpayPlanId("plan_unknown")).toBeNull();
  });

  it("defaults provider to razorpay unless overridden", () => {
    delete process.env.BILLING_DEFAULT_PROVIDER;
    expect(getDefaultPaymentProvider()).toBe("razorpay");
    process.env.BILLING_DEFAULT_PROVIDER = "stripe";
    expect(getDefaultPaymentProvider()).toBe("stripe");
  });

  it("uses sensible subscription total_count defaults", () => {
    delete process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT;
    expect(getRazorpayTotalCount("month")).toBe(120);
    expect(getRazorpayTotalCount("year")).toBe(10);
    process.env.RAZORPAY_SUBSCRIPTION_TOTAL_COUNT = "24";
    expect(getRazorpayTotalCount("month")).toBe(24);
  });
});

describe("RazorpayService helpers", () => {
  const keys = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];
  const prev = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
    process.env.RAZORPAY_KEY_ID = "rzp_test_x";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test";
  });

  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("maps Razorpay subscription statuses", () => {
    expect(razorpayService.mapRazorpayStatus("active")).toBe("active");
    expect(razorpayService.mapRazorpayStatus("authenticated")).toBe("trialing");
    expect(razorpayService.mapRazorpayStatus("pending")).toBe("past_due");
    expect(razorpayService.mapRazorpayStatus("halted")).toBe("past_due");
    expect(razorpayService.mapRazorpayStatus("paused")).toBe("paused");
    expect(razorpayService.mapRazorpayStatus("cancelled")).toBe("canceled");
    expect(razorpayService.mapRazorpayStatus("completed")).toBe("canceled");
    expect(razorpayService.mapRazorpayStatus("created")).toBe("incomplete");
  });

  it("verifies webhook HMAC signatures", () => {
    const body = JSON.stringify({ event: "subscription.activated" });
    const signature = createHmac("sha256", "whsec_test")
      .update(body)
      .digest("hex");
    expect(razorpayService.verifyWebhookSignature(body, signature)).toBe(true);
    expect(razorpayService.verifyWebhookSignature(body, "deadbeef")).toBe(false);
  });

  it("extracts plan from notes when plan id is unmapped", () => {
    const mapped = razorpayService.extractSubscriptionPlan({
      id: "sub_x",
      plan_id: "plan_unknown",
      notes: { vaniPlanId: "pro", vaniInterval: "month" },
    });
    expect(mapped).toEqual({
      planId: "pro",
      interval: "month",
      razorpayPlanId: "plan_unknown",
    });
  });
});
