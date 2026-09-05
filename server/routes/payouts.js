/**
 * server/routes/payouts.js
 *
 * Routes:
 *   GET /api/payouts/:payoutId/status — thin proxy to razorpayx.getPayout
 *
 * Used by the dashboard to poll the queued → processing → processed
 * lifecycle after an instant_advance recommendation is approved.
 *
 * SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
 * without a business account.
 */

import { Router } from 'express';
import { getPayout } from '../services/razorpayx.js';

const router = Router();

// ── GET /api/payouts/:payoutId/status ──────────────────────────────────────
router.get('/:payoutId/status', async (req, res) => {
  const { payoutId } = req.params;

  if (!payoutId || !payoutId.startsWith('pout_')) {
    return res.status(400).json({ error: 'Invalid payout id — expected pout_<id>' });
  }

  try {
    // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
    // without a business account
    const payout = await getPayout(payoutId);
    if (!payout) {
      return res.status(404).json({ error: 'Payout not found', payout_id: payoutId });
    }

    res.json({
      payout_id:      payout.payout_id,
      status:         payout.status,
      amount_paise:   payout.amount_paise,
      currency:       payout.currency,
      purpose:        payout.purpose,
      utr:            payout.utr ?? null,
      status_history: payout.status_history,
      created_at:     payout.created_at,
    });
  } catch (err) {
    console.error('[GET /api/payouts/:payoutId/status]', err.message);
    res.status(500).json({ error: 'Failed to fetch payout status', detail: err.message });
  }
});

export default router;
