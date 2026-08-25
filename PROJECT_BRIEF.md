# Project: Cash Crunch Autopilot

## One-liner
An agent that watches a small business's sales, bank balance, loan EMI, and payroll
together, predicts cash shortfalls before payroll fails, and proposes a bounded,
cost-labeled fix that the merchant must approve — never moves money on its own.

## Problem
Razorpay operates four separate products for the same merchant: Payment Gateway
(incoming sales), RazorpayX (current account), Razorpay Capital (loans), and
Razorpay Payroll (salary runs). None of these talk to each other today, so a
merchant discovers a cash shortfall only when a payroll payment actually fails.

## Data honesty (do not misrepresent this)
- Payment Gateway and RazorpayX both have real, public, self-serve TEST MODE APIs.
  We integrate against these live, in test mode, with test API keys.
- Razorpay Capital and Razorpay Payroll do NOT have public self-serve sandboxes
  (partner-gated). We model their data shape faithfully and generate synthetic
  data for them. Every place this happens must be clearly commented in code as
  `// SYNTHETIC: models Razorpay Capital shape, no public sandbox exists`.

## Architecture
- /client — React (Vite, JavaScript, Tailwind CSS) — merchant dashboard
- /server — Node.js + Express (ES modules) — orchestration API, MongoDB, Razorpay calls
- /ai-service — Python + FastAPI — forecasting, recommendation, accuracy reporting
- /scripts — Python — synthetic data generator (Capital + Payroll + planted shortfalls)

## Core data model (MongoDB collections)
- merchants: { _id, name, business_type, employees_count, created_at }
- sales_transactions: { merchant_id, razorpay_payment_id, amount_paise, status, captured_at }
- bank_balance: { merchant_id, date, closing_balance_paise }
- loans (SYNTHETIC): { merchant_id, loan_id, principal_paise, emi_amount_paise, emi_due_date, tenure_remaining }
- payroll (SYNTHETIC): { merchant_id, payroll_run_id, total_salary_paise, employees, pay_date }
- forecasts: { merchant_id, generated_at, daily_projected_balance: [{date, balance_paise}], shortfall_detected, shortfall_date, shortfall_amount_paise }
- recommendations: { merchant_id, forecast_id, options: [{type, description, cost_paise, resulting_balance_paise}], status: pending|approved|rejected, chosen_option }
- audit_log: { merchant_id, action, actor, before, after, timestamp }
- accuracy_reports: { run_id, total_merchants, planted_shortfalls, correctly_flagged, missed, false_alarms, precision, recall, exceptions: [{merchant_id, reason}], generated_at }

## Money handling rule
ALL monetary values are stored and calculated as integer paise (Razorpay's native
unit — 1 rupee = 100 paise). Never store or compute in floating-point rupees.
Convert to ₹ only at the final display layer in React.

## Governance rule
The AI service (ai-service) may only ever PROPOSE. It writes to `recommendations`
with status "pending" and never calls a Razorpay payout endpoint directly. Only
the Express server executes money-moving actions, and only after a recommendation's
status is explicitly set to "approved" by a human action from the dashboard.

## Success criteria (what "exceptional" means for this project)
1. Real Razorpay PG + X test-mode integration actually working, not mocked.
2. A forecast engine that runs against 50 seeded merchants and produces a genuine
   precision/recall number against planted ground-truth shortfalls.
3. An honest exception list — cases the model got wrong, with a one-line reason.
4. A recommendation step that shows real tradeoff comparison across 2-3 bounded
   options with exact costs, not just a single canned alert.
5. A distinctive, non-templated dashboard design (see Phase 9 design brief).
6. A visible, working approve → execute → audit-log → re-forecast loop.