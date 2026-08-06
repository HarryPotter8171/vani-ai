# Razorpay Integration Report

Razorpay is wired into the existing VANI billing foundation (`billing/`) as a peer to Stripe. Plan / Subscription / Usage / Invoice architecture is unchanged; subscriptions stay synchronized through `BillingService` → `SubscriptionService.applyRazorpaySubscription`.

## Status

| Capability | Status |
|------------|--------|
| Checkout (new paid subs via short_url) | Done |
| UPI / Cards / Net Banking | Done (Checkout methods) |
| Monthly + yearly plans | Done |
| Webhooks (HMAC signed) | Done |
| Subscription lifecycle sync | Done |
| Invoice history (Razorpay → Mongo) | Done |
| Upgrade / downgrade (plan update) | Done |
| Cancel at cycle end | Done |
| Resume (paused only) | Done |
| Coexists with Stripe | Done |
| Local fallback (no keys) | Preserved |

---

## Architecture

```
billing/
├── BillingService.ts      # Facade — routes Stripe vs Razorpay
├── RazorpayService.ts     # NEW — Razorpay SDK wrapper
├── razorpayConfig.ts      # NEW — env plan map + default provider
├── StripeService.ts       # unchanged peer adapter
├── SubscriptionService.ts # + applyRazorpaySubscription / provider-aware cancel
├── InvoiceService.ts      # + upsertFromRazorpay / upsertFromRazorpayPayment
├── WebhookService.ts      # + Razorpay signature verify + lifecycle handlers
├── PlanService.ts         # unchanged catalog
└── UsageService.ts        # unchanged metering
```

### Subscription model

| Field | Notes |
|-------|--------|
| `paymentProvider` | `none` \| `stripe` \| `razorpay` |
| `externalCustomerId` | Stripe `cus_…` or Razorpay `cust_…` |
| `externalSubscriptionId` | Provider `sub_…` |

Existing paid subscriptions always stick to their `paymentProvider` for upgrades / cancel / resume.

---

## Environment

```bash
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
RAZORPAY_PLAN_PRO_MONTHLY=plan_...
RAZORPAY_PLAN_PRO_YEARLY=plan_...
RAZORPAY_PLAN_BUSINESS_MONTHLY=plan_...
RAZORPAY_PLAN_BUSINESS_YEARLY=plan_...

# Optional
RAZORPAY_SUBSCRIPTION_TOTAL_COUNT=120
BILLING_DEFAULT_PROVIDER=razorpay   # when both Stripe + Razorpay configured
```

Optional: `NEXT_PUBLIC_APP_URL` / `APP_URL` for Checkout return query params.

When Razorpay keys are unset, the foundation continues with Stripe (if configured) or **local-only** plan changes.

---

## Payment methods (UPI · Cards · Net Banking)

Razorpay Subscription Checkout (`short_url`) surfaces payment methods enabled on the Razorpay account:

1. Razorpay Dashboard → **Settings → Payment Methods**
2. Enable **UPI**, **Cards**, and **Netbanking**
3. Complete any KYC / activation steps required for live mode

No method filtering is applied in API requests — customers see whatever the account allows. Recurring charges after authorization use the tokenized mandate from the first payment (UPI Autopay / card / netbanking as applicable).

---

## API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/billing/checkout` | Create Checkout (`provider` optional) |
| POST | `/api/billing/upgrade` | Upgrade / subscribe (`planId`, `interval`, `provider?`) |
| POST | `/api/billing/cancel` | Cancel at period / cycle end |
| POST | `/api/billing/resume` | Resume (Stripe cancel_at_period_end, or Razorpay paused) |
| GET | `/api/billing/overview` | Plan + usage + invoices + `razorpayEnabled` |
| POST | `/api/billing/webhooks` | Auto-detect Stripe / Razorpay (**raw body**) |
| POST | `/api/billing/webhooks/razorpay` | Razorpay webhooks only |
| POST | `/api/billing/webhooks/stripe` | Stripe webhooks only |

### Upgrade body

```json
{
  "planId": "pro",
  "interval": "month",
  "provider": "razorpay"
}
```

### Upgrade behavior

| From → To | Behavior |
|-----------|----------|
| Free → Pro/Business | Razorpay subscription `short_url` (`mode: checkout`) |
| Pro ↔ Business (same provider) | Razorpay `subscriptions.update` (`mode: updated`) |
| Paid → Free | Cancel at cycle end |
| → Enterprise | Sales message (`mode: sales`) |
| No gateway | Local Mongo update (`mode: local`) |

Provider selection:

1. Existing `paymentProvider` wins for paid subs  
2. Explicit `provider` in request  
3. `BILLING_DEFAULT_PROVIDER` (default `razorpay`)  
4. Whichever gateway is configured  

---

## Webhooks

Mounted **before** `express.json()`:

```
POST /api/billing/webhooks[/razorpay|/stripe]  →  express.raw({ type: application/json })
```

Verified with `RAZORPAY_WEBHOOK_SECRET` via HMAC SHA256 (`X-Razorpay-Signature`).

Handled events:

- `subscription.authenticated` / `activated` / `charged` / `updated`
- `subscription.pending` / `halted` / `paused` / `resumed`
- `subscription.cancelled` / `completed`
- `invoice.paid` / `partially_paid` / `expired`

Effects:

1. Sync plan, status, period, provider onto `Subscription` via `applyRazorpaySubscription`
2. Upsert invoices / charged payments into `Invoice`
3. On full cancel → revert user to active **Free** (customer id retained, `paymentProvider: none`)

---

## BillingService sync

```
Razorpay webhook / Checkout
        ↓
WebhookService.processRazorpayEvent
        ↓
SubscriptionService.applyRazorpaySubscription  ← single source of truth in Mongo
        ↓
BillingService.getOverview / changePlan / cancel / resume
```

Eager refresh after in-place plan updates (same pattern as Stripe) so Settings UI updates immediately without waiting for the webhook.

---

## Frontend

**Settings → Billing**

- Shows Razorpay / Stripe capability in the subtitle
- Upgrade CTAs redirect to `checkoutUrl` (works for Razorpay `short_url`)
- Customer Portal hidden for Razorpay-billed users (Stripe-only)
- Resume hidden after Razorpay cancel-at-cycle-end (API cannot reverse it)
- Copy mentions UPI, cards, and net banking when Razorpay is enabled

Overview fields added: `razorpayEnabled`, `defaultProvider`, `subscription.paymentProvider`.

---

## Razorpay Dashboard setup

1. Create **Plans** for Pro/Business (monthly + yearly) in INR (paise).
2. Copy Plan ids into the env vars above.
3. Enable **UPI**, **Cards**, **Netbanking** under Payment Methods.
4. Add webhook endpoint: `https://<api-host>/api/billing/webhooks/razorpay`
5. Subscribe to the subscription + invoice events listed above; copy signing secret → `RAZORPAY_WEBHOOK_SECRET`.
6. Use test keys (`rzp_test_…`) locally; switch to live keys for production.

---

## Dependency

- `razorpay@^2.9.8` (official Node SDK)

---

## Verification

```bash
cd backend && npm run build && npm run lint
cd backend && npx vitest run tests/unit/razorpayBilling.test.js tests/unit/stripeBilling.test.js tests/unit/billing.test.js
cd frontend && npm run build
```

---

## Notes

- Enterprise remains sales-assisted (no Plan id).
- Soft usage quotas are still not hard-enforced.
- Razorpay requires `total_count` (billing cycles); default 120 monthly / 10 yearly.
- Stripe Customer Portal is not available for Razorpay subscriptions — manage via Cancel / change plan.
- Razorpay cannot reverse `cancel_at_cycle_end`; access continues until the period ends.
- Currency for Razorpay invoices is typically **INR**; Stripe invoices remain USD as configured.
