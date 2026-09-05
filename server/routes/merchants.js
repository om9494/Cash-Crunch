/**
 * server/routes/merchants.js
 *
 * Routes:
 *   GET  /api/merchants             — list all merchants with latest cash-health status
 *   GET  /api/merchants/:id         — merchant detail with latest forecast + recommendation
 *   POST /api/merchants/:id/forecast  — proxy to ai-service to force a re-run
 *   POST /api/merchants/:id/recommend — proxy to ai-service for a fresh recommendation
 *
 * Design choice: GET /api/merchants reads CACHED Forecast documents from MongoDB
 * (not a live ai-service call) so the list view is fast and doesn't stall when
 * the ai-service is down. The POST /forecast route is the explicit way to force
 * a re-run.
 */

import { Router } from 'express';
import axios from 'axios';
import Merchant from '../models/Merchant.js';
import Forecast from '../models/Forecast.js';
import Recommendation from '../models/Recommendation.js';
import Loan from '../models/Loan.js';
import Payroll from '../models/Payroll.js';
import SalesTransaction from '../models/SalesTransaction.js';
import BankBalance from '../models/BankBalance.js';
import AuditLog from '../models/AuditLog.js';
import { createTopUpOrder, verifyAndCapturePayment } from '../services/razorpay.js';

const router = Router();
const AI_URL = () => process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';

// ── POST /api/merchants/forecast-all ─────────────────────────────────────────
// Proxy to ai-service GET /forecast/all — runs forecasts for all merchants.
// NOTE: registered BEFORE /:id so it doesn't get swallowed.
router.post('/forecast-all', async (req, res) => {
  try {
    const aiRes = await axios.get(`${AI_URL()}/forecast/all`, { timeout: 120_000 });
    res.status(aiRes.status).json(aiRes.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[POST /api/merchants/forecast-all]', err.message);
    res.status(502).json({ error: 'AI service unavailable', detail: err.message });
  }
});

// ── GET /api/merchants ────────────────────────────────────────────────────────
// Returns every merchant with their most-recent cached forecast summary.
// Uses cached Forecast documents — no ai-service call — so this stays fast.
router.get('/', async (req, res) => {
  try {
    const merchants = await Merchant.find().lean();

    // Bulk-fetch latest forecast per merchant in a single aggregation.
    // Include daily_projected_balance so the fleet-view sparklines have data.
    const latestForecasts = await Forecast.aggregate([
      { $sort: { merchant_id: 1, generated_at: -1 } },
      {
        $group: {
          _id:                      '$merchant_id',
          generated_at:             { $first: '$generated_at' },
          shortfall_detected:       { $first: '$shortfall_detected' },
          shortfall_date:           { $first: '$shortfall_date' },
          shortfall_amount_paise:   { $first: '$shortfall_amount_paise' },
          daily_projected_balance:  { $first: '$daily_projected_balance' },
        },
      },
    ]);

    const forecastMap = Object.fromEntries(
      latestForecasts.map((f) => [f._id, f])
    );

    const result = merchants.map((m) => {
      const f = forecastMap[m.merchant_id] || null;
      return {
        merchant_id:      m.merchant_id,
        name:             m.name,
        business_type:    m.business_type,
        employees_count:  m.employees_count,
        fund_account_id:  m.fund_account_id,
        cash_health: f
          ? {
              generated_at:           f.generated_at,
              shortfall_detected:     f.shortfall_detected,
              shortfall_date:         f.shortfall_date,
              shortfall_amount_paise: f.shortfall_amount_paise,
            }
          : null,
        // Expose the 14-day projection for fleet-view sparklines.
        // Kept as a top-level field (not nested under cash_health) so
        // MerchantCard can access it directly without restructuring.
        daily_projected_balance: f?.daily_projected_balance ?? [],
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[GET /api/merchants]', err.message);
    res.status(500).json({ error: 'Failed to fetch merchants', detail: err.message });
  }
});

// ── GET /api/merchants/:id ────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const merchant = await Merchant.findOne({ merchant_id: req.params.id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: req.params.id });
    }

    // Latest forecast (full 14-day projection)
    const forecast = await Forecast.findOne({ merchant_id: req.params.id })
      .sort({ generated_at: -1 })
      .lean();

    // Latest recommendation (any status)
    const recommendation = await Recommendation.findOne({ merchant_id: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    // SYNTHETIC: Loan + Payroll for EMI/pay-date display on the dashboard
    const loan = await Loan.findOne({ merchant_id: req.params.id }).lean();
    const payroll = await Payroll.findOne({ merchant_id: req.params.id })
      .sort({ pay_date: 1 })
      .lean();

    res.json({
      merchant: {
        ...merchant,
        // Expose upcoming dates directly on merchant object for the dashboard timeline
        next_emi_date:     loan?.emi_due_date ?? null,
        next_payroll_date: payroll?.pay_date ?? null,
        // SYNTHETIC: expose EMI + payroll amounts for the detail panel
        emi_amount_paise:       loan?.emi_amount_paise ?? null,
        total_salary_paise:     payroll?.total_salary_paise ?? null,
        payroll_employees:      payroll?.employees ?? null,
      },
      latest_forecast:       forecast || null,
      latest_recommendation: recommendation || null,
    });
  } catch (err) {
    console.error('[GET /api/merchants/:id]', err.message);
    res.status(500).json({ error: 'Failed to fetch merchant detail', detail: err.message });
  }
});

// ── POST /api/merchants/:id/forecast ─────────────────────────────────────────
// Proxy to ai-service GET /forecast/:id — forces a fresh forecast run.
// The ai-service exposes this as GET (idempotent re-run), so we call GET
// internally even though our Express surface is POST (dashboard "force refresh"
// button semantics).
router.post('/:id/forecast', async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    const aiRes = await axios.get(`${AI_URL()}/forecast/${id}`, { timeout: 30_000 });
    res.status(aiRes.status).json(aiRes.data);
  } catch (err) {
    if (err.response) {
      // ai-service returned a non-2xx — pass it through
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[POST /api/merchants/:id/forecast]', err.message);
    res.status(502).json({ error: 'AI service unavailable', detail: err.message });
  }
});

// ── POST /api/merchants/:id/recommend ────────────────────────────────────────
// Proxy to ai-service POST /recommend/:id — generates a new recommendation.
router.post('/:id/recommend', async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    const aiRes = await axios.post(`${AI_URL()}/recommend/${id}`, {}, { timeout: 30_000 });
    res.status(aiRes.status).json(aiRes.data);
  } catch (err) {
    if (err.response) {
      return res.status(err.response.status).json(err.response.data);
    }
    console.error('[POST /api/merchants/:id/recommend]', err.message);
    res.status(502).json({ error: 'AI service unavailable', detail: err.message });
  }
});

// ── GET /api/merchants/:id/transactions ──────────────────────────────────────
// Returns payment stats + last 5 transactions for the merchant detail panel.
router.get('/:id/transactions', async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    // Total counts and amounts
    const allTxns = await SalesTransaction.find({ merchant_id: id }).lean();
    const captured = allTxns.filter((t) => t.status === 'captured');
    const failed   = allTxns.filter((t) => t.status !== 'captured');

    const totalCapturedPaise = captured.reduce((s, t) => s + t.amount_paise, 0);
    const totalFailedPaise   = failed.reduce((s, t) => s + t.amount_paise, 0);

    // Monthly breakdown — last 3 months (for mini bar chart)
    const monthlyMap = {};
    for (const t of captured) {
      const key = t.captured_at.toISOString().slice(0, 7); // "YYYY-MM"
      monthlyMap[key] = (monthlyMap[key] ?? 0) + t.amount_paise;
    }
    const monthly = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-3)
      .map(([month, total_paise]) => ({ month, total_paise }));

    // Last 5 transactions (most recent first)
    const last5 = await SalesTransaction.find({ merchant_id: id })
      .sort({ captured_at: -1 })
      .limit(5)
      .lean();

    res.json({
      total_transactions:    allTxns.length,
      captured_count:        captured.length,
      failed_count:          failed.length,
      total_captured_paise:  totalCapturedPaise,
      total_failed_paise:    totalFailedPaise,
      avg_transaction_paise: captured.length
        ? Math.round(totalCapturedPaise / captured.length)
        : 0,
      monthly_totals: monthly,
      last_5: last5.map((t) => ({
        payment_id:   t.razorpay_payment_id,
        amount_paise: t.amount_paise,
        status:       t.status,
        captured_at:  t.captured_at,
      })),
    });
  } catch (err) {
    console.error('[GET /api/merchants/:id/transactions]', err.message);
    res.status(500).json({ error: 'Failed to fetch transactions', detail: err.message });
  }
});

// ── Helper: refresh forecast from ai-service ──────────────────────────────────
async function refreshForecastForMerchant(merchantId) {
  try {
    const res = await axios.get(`${AI_URL()}/forecast/${merchantId}`, { timeout: 30_000 });
    return res.data;
  } catch (err) {
    console.warn(`[topup] forecast refresh failed for ${merchantId}:`, err.message);
    return null;
  }
}

// ── POST /api/merchants/:id/topup/create-order ────────────────────────────────
// Creates a Razorpay order for a merchant-initiated funds top-up.
// Body: { amount_paise? } — defaults to the latest forecast shortfall if absent.
// Returns: { order_id, amount_paise, currency, key_id }
// key_id is the PUBLIC Razorpay key — safe to send to the browser.
router.post('/:id/topup/create-order', async (req, res) => {
  const { id } = req.params;
  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    // Use provided amount or fall back to latest shortfall
    let amountPaise = req.body?.amount_paise;
    if (!amountPaise || typeof amountPaise !== 'number' || amountPaise <= 0) {
      const latestForecast = await Forecast.findOne({ merchant_id: id })
        .sort({ generated_at: -1 })
        .lean();
      amountPaise = latestForecast?.shortfall_amount_paise ?? 10_000; // ₹100 floor
    }

    // Razorpay minimum is ₹1 (100 paise)
    amountPaise = Math.max(100, Math.round(amountPaise));

    const order = await createTopUpOrder(id, amountPaise);

    res.json({
      order_id:     order.id,
      amount_paise: order.amount,   // Razorpay echoes in paise
      currency:     order.currency, // 'INR'
      key_id:       process.env.RAZORPAY_KEY_ID, // public key — safe to expose
    });
  } catch (err) {
    console.error('[POST topup/create-order]', err.message);
    res.status(502).json({ error: 'Failed to create order', detail: err.message });
  }
});

// ── POST /api/merchants/:id/topup/verify ─────────────────────────────────────
// Verifies Razorpay signature, captures payment, credits bank balance,
// writes audit log, refreshes forecast. Returns 400 (nothing written) on
// signature mismatch — we NEVER touch the balance on an unverified payment.
router.post('/:id/topup/verify', async (req, res) => {
  const { id } = req.params;
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    amount_paise,
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !amount_paise) {
    return res.status(400).json({
      error: 'razorpay_order_id, razorpay_payment_id, razorpay_signature, and amount_paise are all required',
    });
  }

  try {
    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    // ── Step 1: verify signature & capture ────────────────────────────────
    // verifyAndCapturePayment throws with code SIGNATURE_MISMATCH on bad sig.
    // Balance is NEVER touched unless this passes.
    let capturedPayment;
    try {
      capturedPayment = await verifyAndCapturePayment(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        Math.round(amount_paise)
      );
    } catch (sigErr) {
      if (sigErr.code === 'SIGNATURE_MISMATCH') {
        console.warn('[topup/verify] signature mismatch for', id, razorpay_payment_id);
        return res.status(400).json({
          error: 'Payment signature verification failed — no funds added',
          code:  'SIGNATURE_MISMATCH',
        });
      }
      if (sigErr.code === 'UNEXPECTED_PAYMENT_STATUS') {
        console.warn('[topup/verify] unexpected payment status:', sigErr.paymentStatus);
        return res.status(400).json({
          error: `Payment is in status "${sigErr.paymentStatus}" — no funds added`,
          code:  'UNEXPECTED_PAYMENT_STATUS',
        });
      }
      console.error('[topup/verify] capture error:', sigErr.message);
      return res.status(502).json({ error: 'Payment capture failed', detail: sigErr.message });
    }

    // ── Step 2: credit the merchant's bank balance ─────────────────────────
    const [latestBalance] = await BankBalance
      .find({ merchant_id: id })
      .sort({ date: -1 })
      .limit(1)
      .lean();

    const oldBalance = latestBalance?.closing_balance_paise ?? 0;
    const newBalance = oldBalance + Math.round(amount_paise);

    await BankBalance.create({
      merchant_id:           id,
      date:                  new Date(),
      closing_balance_paise: newBalance,
    });

    // ── Step 3: audit log — include the REAL payment_id ───────────────────
    // This payment_id is genuinely real (test-mode Payment Gateway),
    // not a synthetic RazorpayX payout ID.
    await AuditLog.create({
      merchant_id: id,
      action:      'funds_added',
      actor:       'merchant',
      before: { closing_balance_paise: oldBalance },
      after: {
        closing_balance_paise: newBalance,
        amount_added_paise:    Math.round(amount_paise),
        razorpay_payment_id:   razorpay_payment_id,
        razorpay_order_id:     razorpay_order_id,
      },
      timestamp: new Date(),
    });

    // ── Step 4: refresh forecast so dashboard shows new runway ─────────────
    // Wait for Atlas replication before the AI service reads the new balance.
    await new Promise((r) => setTimeout(r, 1500));
    const updatedForecast = await refreshForecastForMerchant(id);

    res.json({
      success:           true,
      payment_id:        razorpay_payment_id,
      amount_paise:      Math.round(amount_paise),
      new_balance_paise: newBalance,
      updated_forecast:  updatedForecast,
    });
  } catch (err) {
    console.error('[POST topup/verify]', err.message);
    res.status(500).json({ error: 'Top-up verification failed', detail: err.message });
  }
});

export default router;
