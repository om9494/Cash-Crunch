# Cash Crunch Autopilot — Server API

Base URL: `http://localhost:5000`

All responses are JSON. All monetary values are **integer paise** (not rupees).
Convert to ₹ only in the React display layer.

---

## 1. GET /api/merchants

List all merchants with their latest cached cash-health summary.

**Implementation note:** reads cached `Forecast` documents from MongoDB — no
ai-service call — so the list stays fast even when the ai-service is down.
Use `POST /api/merchants/:id/forecast` to force a fresh run.

```bash
curl -s http://localhost:5000/api/merchants | jq .
```

**Response shape (array):**
```json
[
  {
    "merchant_id": "merchant_001",
    "name": "Sunrise Retail",
    "business_type": "retail",
    "employees_count": 12,
    "fund_account_id": "fa_K3mN8xQrT1vW2y",
    "cash_health": {
      "generated_at": "2026-08-25T10:00:00.000Z",
      "shortfall_detected": true,
      "shortfall_date": "2026-09-02T00:00:00.000Z",
      "shortfall_amount_paise": -45000000
    }
  }
]
```

---

## 2. GET /api/merchants/:id

Merchant profile + full 14-day forecast projection + latest recommendation.

```bash
curl -s http://localhost:5000/api/merchants/merchant_001 | jq .
```

**Response shape:**
```json
{
  "merchant": {
    "merchant_id": "merchant_001",
    "name": "Sunrise Retail",
    "business_type": "retail",
    "employees_count": 12,
    "fund_account_id": "fa_K3mN8xQrT1vW2y",
    "contact_id": "cont_AbCdEfGhIjKlMn"
  },
  "latest_forecast": {
    "_id": "...",
    "merchant_id": "merchant_001",
    "generated_at": "2026-08-25T10:00:00.000Z",
    "daily_projected_balance": [
      { "date": "2026-08-26T00:00:00.000Z", "balance_paise": 120000000 }
    ],
    "shortfall_detected": true,
    "shortfall_date": "2026-09-02T00:00:00.000Z",
    "shortfall_amount_paise": -45000000
  },
  "latest_recommendation": {
    "_id": "...",
    "merchant_id": "merchant_001",
    "forecast_id": "...",
    "status": "pending",
    "options": [
      {
        "type": "defer_payroll",
        "description": "Defer salary run by 5 days",
        "cost_paise": 0,
        "resulting_balance_paise": 5000000
      }
    ],
    "chosen_option": null
  }
}
```

---

## 3. POST /api/merchants/:id/forecast

Proxy to ai-service `GET /forecast/:id` — triggers a fresh forecast run for
this merchant. The ai-service exposes this as GET (idempotent re-run); the
Express surface is POST to model the dashboard's explicit "force refresh"
intent. The ai-service writes a new `Forecast` document to MongoDB.

```bash
curl -s -X POST http://localhost:5000/api/merchants/merchant_001/forecast | jq .
```

**Response:** proxied directly from the ai-service (typically the new Forecast
document or a status message).

---

## 4. POST /api/merchants/:id/recommend

Proxy to ai-service `POST /recommend/:id` — generates a new recommendation
based on the latest forecast. The ai-service writes a `Recommendation` document
with `status: "pending"`.

```bash
curl -s -X POST http://localhost:5000/api/merchants/merchant_001/recommend | jq .
```

**Response:** proxied directly from the ai-service.

---

## 5. POST /api/recommendations/:id/approve

Approve a pending recommendation. Sets `status` → `"approved"`, records the
chosen option, and writes an `audit_log` entry with `actor: "merchant"`.

**Does NOT execute any payout — that is Phase 10.**

```bash
curl -s -X POST http://localhost:5000/api/recommendations/<RECOMMENDATION_OBJECT_ID>/approve \
  -H "Content-Type: application/json" \
  -d '{
    "chosen_option": {
      "type": "defer_payroll",
      "description": "Defer salary run by 5 days",
      "cost_paise": 0,
      "resulting_balance_paise": 5000000
    }
  }' | jq .
```

**Response shape:**
```json
{
  "recommendation": {
    "_id": "...",
    "merchant_id": "merchant_001",
    "status": "approved",
    "chosen_option": {
      "type": "defer_payroll",
      "description": "Defer salary run by 5 days",
      "cost_paise": 0,
      "resulting_balance_paise": 5000000
    }
  },
  "audit_logged": true,
  "note": "Payout execution is Phase 10 — status flipped and logged only."
}
```

**Errors:**
- `400` — `chosen_option` missing or malformed
- `404` — recommendation not found
- `409` — recommendation is already approved or rejected

---

## 6. POST /api/recommendations/:id/reject

Reject a pending recommendation. Sets `status` → `"rejected"` and writes an
`audit_log` entry with `actor: "merchant"`. No `chosen_option` needed.

```bash
curl -s -X POST http://localhost:5000/api/recommendations/<RECOMMENDATION_OBJECT_ID>/reject \
  -H "Content-Type: application/json" | jq .
```

**Response shape:**
```json
{
  "recommendation": {
    "_id": "...",
    "merchant_id": "merchant_001",
    "status": "rejected",
    "chosen_option": null
  },
  "audit_logged": true
}
```

**Errors:**
- `404` — recommendation not found
- `409` — recommendation is already approved or rejected

---

## 7. GET /api/accuracy-report

Proxy to ai-service `GET /accuracy-report` — returns the latest precision/recall
report against planted ground-truth shortfalls.

```bash
curl -s http://localhost:5000/api/accuracy-report | jq .
```

**Response:** proxied directly from the ai-service.

---

## 8. GET /api/merchants/:id/virtual-account

Returns the merchant's `VirtualFundAccount` document plus their full payout
history from `VirtualPayout`, sorted newest first.

**SYNTHETIC:** models RazorpayX Fund Account + Payout shape; no public sandbox
accessible without a business account. Data is populated by
`server/scripts/setup_virtual_accounts.js`.

```bash
curl -s http://localhost:5000/api/merchants/merchant_001/virtual-account | jq .
```

**Response shape:**
```json
{
  "fund_account": {
    "merchant_id": "merchant_001",
    "fund_account_id": "fa_K3mN8xQrT1vW2y",
    "contact_id": "cont_AbCdEfGhIjKlMn",
    "account_holder_name": "Sunrise Retail",
    "account_number_masked": "XXXXXX4321",
    "ifsc": "HDFC0001234",
    "created_at": "2026-08-25T10:00:00.000Z"
  },
  "payouts": [
    {
      "payout_id": "pout_XyZ1234567890a",
      "fund_account_id": "fa_K3mN8xQrT1vW2y",
      "amount_paise": 50000000,
      "currency": "INR",
      "purpose": "salary",
      "status": "processed",
      "utr": "RAZR202608250000000000000001",
      "created_at": "2026-08-25T10:05:00.000Z"
    }
  ]
}
```

**Errors:**
- `404` — merchant not found, or merchant has no `fund_account_id` (setup not run)

---

## 9. GET /api/platform-balance

Returns the singleton `VirtualPlatformBalance` — the platform's RazorpayX
current account reserve, used to fund payouts.

**SYNTHETIC:** models RazorpayX account balance shape; no public sandbox
accessible without a business account.

```bash
curl -s http://localhost:5000/api/platform-balance | jq .
```

**Response shape:**
```json
{
  "balance_paise": 499950000,
  "updated_at": "2026-08-25T10:05:00.000Z"
}
```

---

## Common error shapes

Every route that can fail returns a JSON error body — never a raw stack trace:

```json
{ "error": "Human-readable message", "detail": "underlying error text" }
```

HTTP status codes used:
- `400` — bad request / validation failure
- `404` — resource not found
- `409` — conflict (e.g. already approved)
- `502` — ai-service unreachable
- `500` — unexpected server error
