import mongoose from "mongoose";
import { PLAN_IDS } from "./Plan.js";

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "incomplete",
  "paused",
];

const SubscriptionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: String,
      required: true,
      enum: PLAN_IDS,
      default: "free",
      index: true,
    },
    status: {
      type: String,
      enum: SUBSCRIPTION_STATUSES,
      default: "active",
      index: true,
    },
    /** Current billing period (UTC). */
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    canceledAt: { type: Date, default: null },
    trialEnd: { type: Date, default: null },
    /** month | year when on a paid plan. */
    billingInterval: {
      type: String,
      enum: ["month", "year"],
      default: null,
    },
    /**
     * Which payment gateway owns external* ids.
     * none = local-only; stripe = Stripe; razorpay = Razorpay.
     */
    paymentProvider: {
      type: String,
      enum: ["none", "stripe", "razorpay"],
      default: "none",
      index: true,
    },
    /** Provider customer id (Stripe cus_… or Razorpay cust_…). */
    externalCustomerId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      index: true,
    },
    /** Provider subscription id (Stripe/Razorpay sub_…). */
    externalSubscriptionId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      index: true,
    },
    metadata: { type: Map, of: String, default: undefined },
  },
  { timestamps: true }
);

SubscriptionSchema.index({ user: 1, status: 1 });
SubscriptionSchema.index({ user: 1 }, { unique: true });

export default mongoose.models.Subscription ||
  mongoose.model("Subscription", SubscriptionSchema);
