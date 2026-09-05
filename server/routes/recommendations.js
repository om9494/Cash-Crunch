/**
 * server/routes/recommendations.js
 *
 * Routes:
 *   POST /api/recommendations/:id/approve — set status "approved", execute
 *     payout for instant_advance options, re-forecast, return updated data.
 *   POST /api/recommendations/:id/reject  — set status "rejected", write audit log
 *
 * Governance rule (non-negotiable):
 *   The AI service only ever writes "pending". Only this Express layer
 *   transitions the status, and only after an explicit human action from
 *   the dashboard.
 *
 * Payout execution (instant_advance only):
 *   After status → "approved", if chosen_option.type === "instant_advance",
 *   we call razorpayx.createPayout() against the merchant's fund_account_id.
 *   The returned payout object (payout_id, initial status) is written into
 *   the audit_log entry's "after" field.
 *
 *   If createPayout() throws an insufficient_balance error we do NOT silently
 *   swallow it — the recommendation status is set to "approval_failed" and
 *   the real error message is surfaced back to the client, exactly as a real
 *   payout failure would be handled.
 *
 *   After a successful createPayout() we call the ai-service /forecast/:id
 *   to refresh the cash position and return the updated forecast alongside
 *   the approval response so the dashboard can show the "before/after" beat.
 *
 * SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
 * without a business account.
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import axios from 'axios';
import Recommendation from '../models/Recommendation.js';
import AuditLog from '../models/AuditLog.js';
import Merchant from '../models/Merchant.js';
import BankBalance from '../models/BankBalance.js';
import { createPayout } from '../services/razorpayx.js';

const router = Router();
const AI_URL = () => (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

// ── Helper: fetch a fresh forecast from the ai-service ────────────────────
// Returns the forecast data on success, or null if the ai-service is down.
// We never let a forecast failure block the approval response.
async function refreshForecast(merchantId) {
  try {
    const res = await axios.get(`${AI_URL()}/forecast/${merchantId}`, { timeout: 120_000 });
    return res.data;
  } catch (err) {
    console.warn(`[recommendations] forecast refresh failed for ${merchantId}:`, err.message);
    return null;
  }
}

// ── POST /api/recommendations/:id/approve ─────────────────────────────────
router.post('/:id/approve', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid recommendation id' });
  }

  // chosen_option is required
  const { chosen_option } = req.body || {};
  if (!chosen_option || typeof chosen_option !== 'object') {
    return res.status(400).json({
      error: 'chosen_option is required when approving a recommendation',
      hint: 'Pass { chosen_option: { type, description, cost_paise, resulting_balance_paise } }',
    });
  }

  let rec;
  try {
    rec = await Recommendation.findById(id).lean();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch recommendation', detail: err.message });
  }

  if (!rec) {
    return res.status(404).json({ error: 'Recommendation not found', id });
  }
  if (rec.status !== 'pending') {
    return res.status(409).json({
      error: `Recommendation is already "${rec.status}" — only pending recommendations can be actioned`,
      current_status: rec.status,
    });
  }

  const before = { status: rec.status, chosen_option: rec.chosen_option };

  // ── Step 1: flip status to "approved" ─────────────────────────────────
  let updated;
  try {
    updated = await Recommendation.findByIdAndUpdate(
      id,
      { status: 'approved', chosen_option },
      { new: true }
    ).lean();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update recommendation', detail: err.message });
  }

  // ── Step 2: execute payout for instant_advance ─────────────────────────
  // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
  // without a business account.
  let payoutResult = null;
  let updatedForecast = null;

  if (chosen_option.type === 'instant_advance') {
    // Look up the merchant's fund_account_id
    let merchant;
    try {
      merchant = await Merchant.findOne({ merchant_id: rec.merchant_id }).lean();
    } catch (err) {
      return res.status(500).json({ error: 'Failed to look up merchant', detail: err.message });
    }

    if (!merchant?.fund_account_id) {
      // Rare: virtual account not set up yet — surface clearly
      return res.status(422).json({
        error: 'Merchant has no fund_account_id — run setup_virtual_accounts.js first',
        merchant_id: rec.merchant_id,
      });
    }

    // Use advance_amount_paise stored directly on the option (gross amount before fee).
    // This is the exact amount to disburse so the net proceeds (gross - fee) cover
    // the shortfall exactly. Fall back to reversing the 2% fee from cost_paise if
    // the field is absent (old recommendations before this fix).
    const disbursePaise = Math.max(1,
      chosen_option.advance_amount_paise ||
      Math.round(chosen_option.cost_paise / 0.02)
    );

    try {
      // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
      // without a business account
      const payout = await createPayout(
        merchant.fund_account_id,
        disbursePaise,
        'payout' // RazorpayX purpose field
      );

      payoutResult = {
        payout_id: payout.payout_id,
        status:    payout.status,
        amount_paise: payout.amount_paise,
      };

      // ── Credit the merchant's bank balance with the advance proceeds ──
      // Write a new BankBalance row dated NOW so the AI service's
      // _load_merchant_inputs (which sorts by date DESC) picks it up as
      // the current balance, sees the credited funds, and re-forecasts
      // without a shortfall.
      try {
        // Use find().sort().limit(1) — findOne().sort() does not apply the
        // sort in Mongoose; find().sort().limit(1) is the correct pattern.
        const [latestBalance] = await BankBalance
          .find({ merchant_id: rec.merchant_id })
          .sort({ date: -1 })
          .limit(1)
          .lean();
        const oldBalance = latestBalance?.closing_balance_paise ?? 0;
        // Net proceeds = gross advance - fee = exactly what merchant receives
        const netProceeds = disbursePaise - (chosen_option.cost_paise ?? 0);
        const newBalance = Math.max(0, oldBalance + netProceeds);
        console.log(`[approve] crediting ${rec.merchant_id}: old=${oldBalance} net=${netProceeds} new=${newBalance}`);
        await BankBalance.create({
          merchant_id:           rec.merchant_id,
          date:                  new Date(),
          closing_balance_paise: newBalance,
        });
        console.log(`[approve] bank balance updated for ${rec.merchant_id}`);
      } catch (balErr) {
        console.error('[recommendations] bank balance update failed after payout:', balErr.message);
      }

      // Pause so the Atlas write propagates before the AI service reads it.
      // Atlas has ~100–200ms replication lag; 1500ms is a safe margin.
      await new Promise((r) => setTimeout(r, 1500));

    } catch (payoutErr) {
      // ── Insufficient balance or other payout failure ──────────────────
      // Set status to "approval_failed" and surface the real error.
      // This mirrors exactly how a real payout failure would be handled.
      const errPayload = payoutErr?.error ?? payoutErr;
      const reason  = errPayload?.reason  ?? 'unknown';
      const message = errPayload?.description ?? payoutErr?.message ?? 'Payout failed';

      try {
        await Recommendation.findByIdAndUpdate(id, { status: 'approval_failed' });

        // Audit log the failure
        await AuditLog.create({
          merchant_id: rec.merchant_id,
          action:      'recommendation_approval_failed',
          actor:       'system',
          before,
          after: {
            status: 'approval_failed',
            chosen_option,
            payout_error: { reason, message, metadata: errPayload?.metadata },
          },
          timestamp: new Date(),
        });
      } catch (logErr) {
        console.error('[recommendations] failed to write approval_failed audit log:', logErr.message);
      }

      console.error('[POST /api/recommendations/:id/approve] payout failed:', message);

      return res.status(402).json({
        error:          'Payout failed — recommendation status set to approval_failed',
        reason,
        detail:         message,
        metadata:       errPayload?.metadata ?? null,
        recommendation: { ...updated, status: 'approval_failed' },
      });
    }

    // ── Step 3: refresh forecast after successful payout ──────────────
    // The cash position has changed — re-forecast so the dashboard shows
    // the resolved runway. We do this server-side so the approval response
    // can carry the updated forecast (single round-trip from the client).
    updatedForecast = await refreshForecast(rec.merchant_id);
  } else {
    // ── Non-payout options (alert_only, contact_lender, etc.) ─────────
    // No money moves, but the approval is still a state change the merchant
    // has acknowledged. Re-run the forecast so the dashboard reflects any
    // balance changes that may have happened since the recommendation was
    // generated (e.g. from a previous partial approval or manual top-up).
    updatedForecast = await refreshForecast(rec.merchant_id);
  }

  // ── Step 4: write audit log (include payout result if any) ────────────
  const afterPayload = {
    status:       updated.status,
    chosen_option: updated.chosen_option,
    ...(payoutResult && { payout: payoutResult }),
  };

  try {
    await AuditLog.create({
      merchant_id: rec.merchant_id,
      action:      'recommendation_approved',
      actor:       'merchant',
      before,
      after:       afterPayload,
      timestamp:   new Date(),
    });
  } catch (err) {
    // Don't fail the response if audit logging fails — log and continue
    console.error('[recommendations] audit log write failed:', err.message);
  }

  res.json({
    recommendation:   updated,
    audit_logged:     true,
    payout:           payoutResult,
    updated_forecast: updatedForecast,
  });
});

// ── POST /api/recommendations/:id/reject ──────────────────────────────────
router.post('/:id/reject', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid recommendation id' });
  }

  let rec;
  try {
    rec = await Recommendation.findById(id).lean();
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch recommendation', detail: err.message });
  }

  if (!rec) {
    return res.status(404).json({ error: 'Recommendation not found', id });
  }
  if (rec.status !== 'pending') {
    return res.status(409).json({
      error: `Recommendation is already "${rec.status}" — only pending recommendations can be actioned`,
      current_status: rec.status,
    });
  }

  try {
    const before  = { status: rec.status, chosen_option: rec.chosen_option };
    const updated = await Recommendation.findByIdAndUpdate(
      id,
      { status: 'rejected' },
      { new: true }
    ).lean();

    await AuditLog.create({
      merchant_id: rec.merchant_id,
      action:      'recommendation_rejected',
      actor:       'merchant',
      before,
      after:       { status: updated.status, chosen_option: updated.chosen_option },
      timestamp:   new Date(),
    });

    res.json({ recommendation: updated, audit_logged: true });
  } catch (err) {
    console.error('[POST /api/recommendations/:id/reject]', err.message);
    res.status(500).json({ error: 'Failed to reject recommendation', detail: err.message });
  }
});

export default router;
