import mongoose from "mongoose";
import { PLAN_IDS } from "./Plan.js";

export const INVOICE_STATUSES = [
  "draft",
  "open",
  "paid",
  "void",
  "uncollectible",
];

const LineItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true, maxlength: 240 },
    quantity: { type: Number, default: 1, min: 0 },
    unitAmountCents: { type: Number, default: 0 },
    amountCents: { type: Number, default: 0 },
  },
  { _id: false }
);

const InvoiceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },
    planId: {
      type: String,
      enum: PLAN_IDS,
      required: true,
    },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: "draft",
      index: true,
    },
    currency: { type: String, default: "usd", lowercase: true, maxlength: 8 },
    subtotalCents: { type: Number, default: 0 },
    taxCents: { type: Number, default: 0 },
    totalCents: { type: Number, default: 0 },
    lineItems: { type: [LineItemSchema], default: [] },
    periodStart: { type: Date, required: true },
    periodEnd: { type: Date, required: true },
    issuedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    /** Stripe invoice id (in_…). */
    externalInvoiceId: {
      type: String,
      default: null,
      trim: true,
      maxlength: 120,
      index: true,
    },
    /** Stripe hosted invoice URL for customer download/pay. */
    hostedInvoiceUrl: { type: String, default: null, trim: true, maxlength: 500 },
    invoicePdf: { type: String, default: null, trim: true, maxlength: 500 },
    number: { type: String, default: null, trim: true, maxlength: 40 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

InvoiceSchema.index({ user: 1, createdAt: -1 });
InvoiceSchema.index({ user: 1, status: 1 });
InvoiceSchema.index(
  { externalInvoiceId: 1 },
  { unique: true, partialFilterExpression: { externalInvoiceId: { $type: "string" } } }
);

export default mongoose.models.Invoice || mongoose.model("Invoice", InvoiceSchema);
