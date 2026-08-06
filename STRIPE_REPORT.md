# Stripe Integration Report

Stripe is wired into the existing VANI billing foundation (`billing/`) without replacing Plan / Subscription / Usage / Invoice architecture.

## Status

| Capability | Status |
|------------|--------|
| Checkout (new paid subs) | Done |
| Monthly + yearly prices | Done |
| Webhooks (signed) | Done |
| Subscription lifecycle sync | Done |
| Customer Portal | Done |
| Invoice history (Stripe → Mongo) | Done |
| Upgrade / downgrade (proration) | Done |
| Cancel at period end + resume | Done |
| Local fallback (no Stripe keys) | Preserved |

---

## Architecture (unchanged shape)

```
billing/
├── BillingService.ts      # Facade — checkout / portal / changePlan
├── StripeService.ts       # NEW — Stripe SDK wrapper
├── stripeConfig.ts        # NEW — env price map
├── SubscriptionService.ts # + applyStripeSubscription / resume
├── InvoiceService.ts      # + upsertFromStripe
├── WebhookService.ts      # + signature verify + lifecycle handlers
├── PlanService.ts         # unchanged catalog
└── UsageService.ts        # unchanged metering
```

Models keep `externalCustomerId` / `externalSubscriptionId` for Stripe ids.  
Subscription adds `billingInterval` (`month` | `year`).  
Invoice adds `hostedInvoiceUrl` / `invoicePdf`.

---

## Environment

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_BUSINESS_MONTHLY=price_...
STRIPE_PRICE_BUSINESS_YEARLY=price_...
```

Optional: `NEXT_PUBLIC_APP_URL` / `APP_URL` for Checkout success/cancel and Portal return URLs.

When `STRIPE_SECRET_KEY` is unset, the foundation continues to work with **local-only** plan changes (no charges).

---

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/billing/checkout` | Create Checkout Session |
| POST | `/api/billing/upgrade` | Upgrade / downgrade / subscribe (`planId`, `interval`) |
| POST | `/api/billing/portal` | Stripe Customer Portal session |
| POST | `/api/billing/cancel` | Cancel at period end |
| POST | `/api/billing/resume` | Undo cancel_at_period_end |
| GET | `/api/billing/invoices` | Invoice history |
| GET | `/api/billing/overview` | Plan + usage + invoices + `stripeEnabled` |
| POST | `/api/billing/webhooks` | Stripe webhooks (**raw body**) |

### Upgrade behavior

| From → To | Behavior |
|-----------|----------|
| Free → Pro/Business | Stripe Checkout (`mode: checkout`) |
| Pro ↔ Business (or interval change) | Stripe Subscription update + proration (`mode: updated`) |
| Paid → Free | Cancel at period end |
| → Enterprise | Sales message (`mode: sales`) |
| Stripe disabled | Local Mongo update (`mode: local`) |

---

## Webhooks

Mounted **before** `express.json()`:

```
POST /api/billing/webhooks  →  express.raw({ type: application/json })
```

Verified with `STRIPE_WEBHOOK_SECRET`.

Handled events:

- `checkout.session.completed`
- `customer.subscription.created` / `updated` / `deleted`
- `invoice.paid` / `payment_failed` / `finalized` / `voided` / `updated`

Effects:

1. Sync plan, status, period, cancel flags onto `Subscription`
2. Upsert Stripe invoices into `Invoice`
3. On full cancel → revert user to active **Free** (customer id retained)

---

## Frontend

**Settings → Billing**

- Monthly / Yearly toggle
- Upgrade / Switch / Downgrade CTAs → Checkout or in-place update
- Customer Portal button (when Stripe enabled)
- Cancel / Resume
- Invoices tab with hosted invoice links

---

## Stripe Dashboard setup

1. Create Products + Prices for Pro/Business (monthly + yearly).
2. Copy Price ids into env vars above.
3. Add webhook endpoint: `https://<api-host>/api/billing/webhooks`
4. Subscribe to the events listed above; copy signing secret → `STRIPE_WEBHOOK_SECRET`.
5. Enable Customer Portal in Stripe Dashboard (payment method update, invoices, cancel).

Local CLI:

```bash
stripe listen --forward-to localhost:5001/api/billing/webhooks
```

---

## Dependency

- `stripe@^18` (API version `2025-08-27.basil`)

---

## Verification

```bash
cd backend && npm run build && npm run lint
cd backend && npx vitest run tests/unit/stripeBilling.test.js tests/unit/billing.test.js
cd frontend && npm run build
```

---

## Notes

- Enterprise remains sales-assisted (no Price id).
- Soft usage quotas are still not hard-enforced.
- Existing usage middleware and plan catalog are unchanged.
- Checkout success URL: `/?billing=success&session_id={CHECKOUT_SESSION_ID}`
