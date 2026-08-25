/**
 * server/routes/recommendations.js
 *
 * Routes:
 *   POST /api/recommendations/:id/approve — set status "approved", write audit log
 *   POST /api/recommendations/:id/reject  — set status "rejected", write audit log
 *
 * IMPORTANT: Approve does NOT execute any payout. That is Phase 10.
 * Governance rule: the AI service only ever writes "pending". Only this Express
 * layer transitions the status, and only after an explicit human action.
 */

import { Router } from 'express';
import mongoose from 'mongoose';
import Recommendation from '../models/Recommendation.js';
import AuditLog from '../models/AuditLog.js';

const router = Router();

// ── Helper: update recommendation status and write an audit log entry ─────────
async function transitionStatus(req, res, newStatus) {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid recommendation id' });
  }

  // chosen_option is required for "approved" (merchant must pick one option)
  let chosenOption = null;
  if (newStatus === 'approved') {
    const { chosen_option } = req.body || {};
    if (!chosen_option || typeof chosen_option !== 'object') {
      return res.status(400).json({
        error: 'chosen_option is required when approving a recommendation',
        hint: 'Pass { chosen_option: { type, description, cost_paise, resulting_balance_paise } }',
      });
    }
    chosenOption = chosen_option;
  }

  const rec = await Recommendation.findById(id).lean();
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

  // Build the update
  const update = { status: newStatus };
  if (newStatus === 'approved') update.chosen_option = chosenOption;

  const updated = await Recommendation.findByIdAndUpdate(id, update, { new: true }).lean();

  const after = { status: updated.status, chosen_option: updated.chosen_option };

  // Write audit log entry — actor: "merchant" as specified
  await AuditLog.create({
    merchant_id: rec.merchant_id,
    action:      `recommendation_${newStatus}`,
    actor:       'merchant',
    before,
    after,
    timestamp:   new Date(),
  });

  res.json({
    recommendation: updated,
    audit_logged: true,
    note:
      newStatus === 'approved'
        ? 'Payout execution is Phase 10 — status flipped and logged only.'
        : undefined,
  });
}

// ── POST /api/recommendations/:id/approve ─────────────────────────────────────
router.post('/:id/approve', async (req, res) => {
  try {
    await transitionStatus(req, res, 'approved');
  } catch (err) {
    console.error('[POST /api/recommendations/:id/approve]', err.message);
    res.status(500).json({ error: 'Failed to approve recommendation', detail: err.message });
  }
});

// ── POST /api/recommendations/:id/reject ──────────────────────────────────────
router.post('/:id/reject', async (req, res) => {
  try {
    await transitionStatus(req, res, 'rejected');
  } catch (err) {
    console.error('[POST /api/recommendations/:id/reject]', err.message);
    res.status(500).json({ error: 'Failed to reject recommendation', detail: err.message });
  }
});

export default router;
