/**
 * InvoiceService — local invoice history + Stripe / Razorpay invoice sync.
 */

import type Stripe from "stripe";
import Invoice from "../models/Invoice.js";
import { planService } from "./PlanService.ts";
import { resolvePlanFromPriceId } from "./stripeConfig.ts";
import { resolvePlanFromRazorpayPlanId } from "./razorpayConfig.ts";
import type { RazorpayInvoiceLike, RazorpayPaymentLike } from "./RazorpayService.ts";
import type { InvoiceListItem, InvoiceStatus, PlanId } from "./types.ts";

export interface InvoiceSnapshot extends InvoiceListItem {
  userId: string;
  subtotalCents: number;
  taxCents: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmountCents: number;
    amountCents: number;
  }>;
}

function serialize(doc: Record<string, unknown>): InvoiceSnapshot {
  const items = Array.isArray(doc.lineItems) ? doc.lineItems : [];
  return {
    id: String(doc._id),
    userId: String(doc.user),
    planId: doc.planId as PlanId,
    status: doc.status as InvoiceStatus,
    currency: String(doc.currency || "usd"),
    subtotalCents: Number(doc.subtotalCents) || 0,
    taxCents: Number(doc.taxCents) || 0,
    totalCents: Number(doc.totalCents) || 0,
    lineItems: items.map((li: Record<string, unknown>) => ({
      description: String(li.description || ""),
      quantity: Number(li.quantity) || 0,
      unitAmountCents: Number(li.unitAmountCents) || 0,
      amountCents: Number(li.amountCents) || 0,
    })),
    periodStart: new Date(doc.periodStart as Date).toISOString(),
    periodEnd: new Date(doc.periodEnd as Date).toISOString(),
    issuedAt: doc.issuedAt ? new Date(doc.issuedAt as Date).toISOString() : null,
    paidAt: doc.paidAt ? new Date(doc.paidAt as Date).toISOString() : null,
    number: doc.number ? String(doc.number) : null,
    externalInvoiceId: doc.externalInvoiceId
      ? String(doc.externalInvoiceId)
      : null,
    hostedInvoiceUrl: doc.hostedInvoiceUrl
      ? String(doc.hostedInvoiceUrl)
      : null,
    invoicePdf: doc.invoicePdf ? String(doc.invoicePdf) : null,
    createdAt: new Date(doc.createdAt as Date).toISOString(),
  };
}

function toListItem(snap: InvoiceSnapshot): InvoiceListItem {
  return {
    id: snap.id,
    planId: snap.planId,
    status: snap.status,
    currency: snap.currency,
    totalCents: snap.totalCents,
    periodStart: snap.periodStart,
    periodEnd: snap.periodEnd,
    issuedAt: snap.issuedAt,
    paidAt: snap.paidAt,
    number: snap.number,
    hostedInvoiceUrl: snap.hostedInvoiceUrl,
    invoicePdf: snap.invoicePdf,
    externalInvoiceId: snap.externalInvoiceId,
    createdAt: snap.createdAt,
  };
}

function mapStripeInvoiceStatus(status: Stripe.Invoice.Status | null): InvoiceStatus {
  switch (status) {
    case "draft":
      return "draft";
    case "open":
      return "open";
    case "paid":
      return "paid";
    case "void":
      return "void";
    case "uncollectible":
      return "uncollectible";
    default:
      return "open";
  }
}

function invoiceNumber(userId: string, periodStart: Date): string {
  const y = periodStart.getUTCFullYear();
  const m = String(periodStart.getUTCMonth() + 1).padStart(2, "0");
  const short = String(userId).slice(-6);
  return `VANI-${y}${m}-${short}`;
}

export class InvoiceService {
  async list(userId: string, limit = 20): Promise<InvoiceSnapshot[]> {
    const docs = await Invoice.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
    return docs.map((d) => serialize(d as Record<string, unknown>));
  }

  async listSummaries(userId: string, limit = 20): Promise<InvoiceListItem[]> {
    const rows = await this.list(userId, limit);
    return rows.map(toListItem);
  }

  async get(userId: string, invoiceId: string): Promise<InvoiceSnapshot | null> {
    const doc = await Invoice.findOne({ _id: invoiceId, user: userId }).lean();
    return doc ? serialize(doc as Record<string, unknown>) : null;
  }

  /**
   * Ensure a draft invoice exists for the subscription period.
   * Free plans get a $0 paid placeholder for history consistency.
   */
  async ensurePeriodInvoice(opts: {
    userId: string;
    planId: PlanId;
    subscriptionId?: string | null;
    periodStart: Date;
    periodEnd: Date;
  }): Promise<InvoiceSnapshot> {
    const existing = await Invoice.findOne({
      user: opts.userId,
      periodStart: opts.periodStart,
      planId: opts.planId,
      externalInvoiceId: null,
    }).lean();
    if (existing) return serialize(existing as Record<string, unknown>);

    // Prefer Stripe-backed invoices when present for this period.
    const stripeExisting = await Invoice.findOne({
      user: opts.userId,
      periodStart: { $lte: opts.periodEnd },
      periodEnd: { $gte: opts.periodStart },
      externalInvoiceId: { $ne: null },
    }).lean();
    if (stripeExisting) {
      return serialize(stripeExisting as Record<string, unknown>);
    }

    const plan = await planService.getPlan(opts.planId);
    const unit =
      plan?.priceMonthlyCents == null ? 0 : Number(plan.priceMonthlyCents) || 0;
    const isFree = unit === 0 || opts.planId === "free";

    const lineItems = [
      {
        description: `${plan?.name || opts.planId} — monthly`,
        quantity: 1,
        unitAmountCents: unit,
        amountCents: unit,
      },
    ];

    const created = await Invoice.create({
      user: opts.userId,
      subscription: opts.subscriptionId || null,
      planId: opts.planId,
      status: isFree ? "paid" : "draft",
      currency: plan?.currency || "usd",
      subtotalCents: unit,
      taxCents: 0,
      totalCents: unit,
      lineItems,
      periodStart: opts.periodStart,
      periodEnd: opts.periodEnd,
      issuedAt: new Date(),
      paidAt: isFree ? new Date() : null,
      number: invoiceNumber(opts.userId, opts.periodStart),
      notes: isFree
        ? "Complimentary Free plan — no charge."
        : "Draft invoice — awaiting payment gateway confirmation.",
    });

    return serialize(created.toObject() as Record<string, unknown>);
  }

  /** Upsert a Stripe Invoice into Mongo (idempotent by externalInvoiceId). */
  async upsertFromStripe(
    userId: string,
    stripeInvoice: Stripe.Invoice,
    subscriptionMongoId?: string | null
  ): Promise<InvoiceSnapshot> {
    // Defensive reads — Stripe Invoice line shapes vary across API versions.
    const inv = stripeInvoice as Stripe.Invoice & {
      lines?: { data?: Array<Record<string, unknown>> };
      tax?: number | null;
      period_start?: number | null;
      period_end?: number | null;
      hosted_invoice_url?: string | null;
      invoice_pdf?: string | null;
      status_transitions?: { paid_at?: number | null };
    };

    const firstLine = inv.lines?.data?.[0] || {};
    const priceObj = firstLine.price as { id?: string; unit_amount?: number } | undefined;
    const pricing = firstLine.pricing as
      | { price_details?: { price?: string } }
      | undefined;
    const priceId =
      priceObj?.id ||
      pricing?.price_details?.price ||
      null;
    const mapped = resolvePlanFromPriceId(
      typeof priceId === "string" ? priceId : null
    );
    const planId: PlanId = mapped?.planId || "pro";

    const periodStart = inv.period_start
      ? new Date(inv.period_start * 1000)
      : new Date((inv.created || Date.now() / 1000) * 1000);
    const periodEnd = inv.period_end
      ? new Date(inv.period_end * 1000)
      : periodStart;

    const lineItems = (inv.lines?.data || []).map((line) => {
      const p = line.price as { unit_amount?: number } | undefined;
      return {
        description: String(line.description || "Subscription"),
        quantity: Number(line.quantity) || 1,
        unitAmountCents: Number(p?.unit_amount ?? line.amount) || 0,
        amountCents: Number(line.amount) || 0,
      };
    });

    const payload = {
      user: userId,
      subscription: subscriptionMongoId || null,
      planId,
      status: mapStripeInvoiceStatus(inv.status),
      currency: (inv.currency || "usd").toLowerCase(),
      subtotalCents: inv.subtotal || 0,
      taxCents: inv.tax || 0,
      totalCents: inv.total || 0,
      lineItems,
      periodStart,
      periodEnd,
      issuedAt: inv.created ? new Date(inv.created * 1000) : new Date(),
      paidAt: inv.status_transitions?.paid_at
        ? new Date(inv.status_transitions.paid_at * 1000)
        : inv.status === "paid"
          ? new Date()
          : null,
      number: inv.number || null,
      externalInvoiceId: inv.id,
      hostedInvoiceUrl: inv.hosted_invoice_url || null,
      invoicePdf: inv.invoice_pdf || null,
      notes: "Synced from Stripe",
    };

    const doc = await Invoice.findOneAndUpdate(
      { externalInvoiceId: inv.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return serialize(doc as Record<string, unknown>);
  }

  /** Upsert a Razorpay Invoice into Mongo (idempotent by externalInvoiceId). */
  async upsertFromRazorpay(
    userId: string,
    rzpInvoice: RazorpayInvoiceLike,
    subscriptionMongoId?: string | null,
    opts: { planId?: PlanId | null } = {}
  ): Promise<InvoiceSnapshot> {
    const notesPlan = rzpInvoice.notes?.vaniPlanId as PlanId | undefined;
    const planId: PlanId =
      opts.planId ||
      notesPlan ||
      "pro";

    const periodStart = rzpInvoice.billing_start
      ? new Date(rzpInvoice.billing_start * 1000)
      : rzpInvoice.issued_at
        ? new Date(rzpInvoice.issued_at * 1000)
        : new Date();
    const periodEnd = rzpInvoice.billing_end
      ? new Date(rzpInvoice.billing_end * 1000)
      : periodStart;

    const lineItems = (rzpInvoice.line_items || []).map((line) => ({
      description: String(line.name || line.description || "Subscription"),
      quantity: Number(line.quantity) || 1,
      unitAmountCents: Number(line.unit_amount ?? line.amount) || 0,
      amountCents: Number(line.amount) || 0,
    }));

    if (lineItems.length === 0) {
      lineItems.push({
        description: "Razorpay subscription charge",
        quantity: 1,
        unitAmountCents: Number(rzpInvoice.amount) || 0,
        amountCents: Number(rzpInvoice.amount) || 0,
      });
    }

    const status = mapRazorpayInvoiceStatus(rzpInvoice.status);
    const payload = {
      user: userId,
      subscription: subscriptionMongoId || null,
      planId,
      status,
      currency: (rzpInvoice.currency || "inr").toLowerCase(),
      subtotalCents: Number(rzpInvoice.amount) || 0,
      taxCents: 0,
      totalCents: Number(rzpInvoice.amount) || 0,
      lineItems,
      periodStart,
      periodEnd,
      issuedAt: rzpInvoice.issued_at
        ? new Date(rzpInvoice.issued_at * 1000)
        : new Date(),
      paidAt: rzpInvoice.paid_at
        ? new Date(rzpInvoice.paid_at * 1000)
        : status === "paid"
          ? new Date()
          : null,
      number: rzpInvoice.invoice_number || null,
      externalInvoiceId: rzpInvoice.id,
      hostedInvoiceUrl: rzpInvoice.short_url || null,
      invoicePdf: null,
      notes: "Synced from Razorpay",
    };

    const doc = await Invoice.findOneAndUpdate(
      { externalInvoiceId: rzpInvoice.id },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return serialize(doc as Record<string, unknown>);
  }

  /**
   * Upsert an invoice-like record from a Razorpay subscription.charged payment
   * when a full Invoice entity is not present in the webhook payload.
   */
  async upsertFromRazorpayPayment(
    userId: string,
    payment: RazorpayPaymentLike,
    opts: {
      subscriptionMongoId?: string | null;
      planId?: PlanId | null;
      periodStart?: Date | null;
      periodEnd?: Date | null;
      razorpayPlanId?: string | null;
    } = {}
  ): Promise<InvoiceSnapshot> {
    const mapped = resolvePlanFromRazorpayPlanId(opts.razorpayPlanId || null);
    const planId: PlanId =
      opts.planId ||
      mapped?.planId ||
      (payment.notes?.vaniPlanId as PlanId | undefined) ||
      "pro";

    const externalId = payment.invoice_id || `rzp_pay_${payment.id}`;
    const amount = Number(payment.amount) || 0;
    const paid =
      String(payment.status || "").toLowerCase() === "captured" ||
      String(payment.status || "").toLowerCase() === "authorized";

    const periodStart = opts.periodStart || new Date(
      (payment.created_at || Math.floor(Date.now() / 1000)) * 1000
    );
    const periodEnd =
      opts.periodEnd ||
      new Date(periodStart.getTime() + 30 * 24 * 3600 * 1000);

    const payload = {
      user: userId,
      subscription: opts.subscriptionMongoId || null,
      planId,
      status: (paid ? "paid" : "open") as InvoiceStatus,
      currency: (payment.currency || "inr").toLowerCase(),
      subtotalCents: amount,
      taxCents: 0,
      totalCents: amount,
      lineItems: [
        {
          description: `Razorpay ${payment.method || "payment"} — subscription`,
          quantity: 1,
          unitAmountCents: amount,
          amountCents: amount,
        },
      ],
      periodStart,
      periodEnd,
      issuedAt: payment.created_at
        ? new Date(payment.created_at * 1000)
        : new Date(),
      paidAt: paid ? new Date() : null,
      number: null,
      externalInvoiceId: externalId,
      hostedInvoiceUrl: null,
      invoicePdf: null,
      notes: `Synced from Razorpay payment ${payment.id}`,
    };

    const doc = await Invoice.findOneAndUpdate(
      { externalInvoiceId: externalId },
      { $set: payload },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return serialize(doc as Record<string, unknown>);
  }
}

function mapRazorpayInvoiceStatus(status: string | undefined | null): InvoiceStatus {
  switch ((status || "").toLowerCase()) {
    case "draft":
      return "draft";
    case "issued":
    case "partially_paid":
      return "open";
    case "paid":
      return "paid";
    case "cancelled":
    case "canceled":
      return "void";
    case "expired":
      return "uncollectible";
    default:
      return "open";
  }
}

export const invoiceService = new InvoiceService();
