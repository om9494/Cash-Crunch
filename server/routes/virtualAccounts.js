/**
 * server/routes/virtualAccounts.js
 *
 * Routes:
 *   GET /api/merchants/:id/virtual-account — fund account + payout history
 *   GET /api/platform-balance              — singleton platform reserve balance
 *
 * SYNTHETIC: models RazorpayX Fund Account + Payout + Platform Balance shape,
 * no public sandbox accessible without a business account.
 */

import { Router } from 'express';
import Merchant from '../models/Merchant.js';
import VirtualFundAccount from '../models/VirtualFundAccount.js';
import VirtualPayout from '../models/VirtualPayout.js';
import VirtualPlatformBalance from '../models/VirtualPlatformBalance.js';

const router = Router();

// ── GET /api/merchants/:id/virtual-account ────────────────────────────────────
// Returns the merchant's VirtualFundAccount plus their payout history,
// newest first.
// SYNTHETIC: models RazorpayX Fund Account + Payout shape, no public sandbox
// accessible without a business account.
router.get('/merchants/:id/virtual-account', async (req, res) => {
  try {
    const { id } = req.params;

    const merchant = await Merchant.findOne({ merchant_id: id }).lean();
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found', merchant_id: id });
    }

    if (!merchant.fund_account_id) {
      return res.status(404).json({
        error: 'No virtual fund account found for this merchant',
        merchant_id: id,
        hint: 'Run server/scripts/setup_virtual_accounts.js to provision virtual accounts for all merchants.',
      });
    }

    // SYNTHETIC: models RazorpayX Fund Account shape, no public sandbox
    // accessible without a business account
    const fundAccount = await VirtualFundAccount.findOne({
      fund_account_id: merchant.fund_account_id,
    }).lean();

    if (!fundAccount) {
      return res.status(404).json({
        error: 'VirtualFundAccount document missing in DB',
        fund_account_id: merchant.fund_account_id,
        hint: 'Re-run setup_virtual_accounts.js to rebuild fund account records.',
      });
    }

    // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
    // without a business account
    const payouts = await VirtualPayout.find({ merchant_id: id })
      .sort({ created_at: -1 })
      .lean();

    res.json({
      fund_account: fundAccount,
      payouts,      // newest first; empty array if no payouts yet
    });
  } catch (err) {
    console.error('[GET /api/merchants/:id/virtual-account]', err.message);
    res.status(500).json({ error: 'Failed to fetch virtual account', detail: err.message });
  }
});

// ── GET /api/platform-balance ─────────────────────────────────────────────────
// Returns the singleton platform reserve balance.
// SYNTHETIC: models RazorpayX current account balance shape, no public sandbox
// accessible without a business account.
router.get('/platform-balance', async (req, res) => {
  try {
    // SYNTHETIC: models RazorpayX virtual current account balance, no public
    // sandbox accessible without a business account
    let doc = await VirtualPlatformBalance.findOne({ key: 'singleton' }).lean();
    if (!doc) {
      return res.status(404).json({
        error: 'Platform balance not initialised',
        hint: 'Run setup_virtual_accounts.js to seed the platform balance.',
      });
    }
    res.json({
      balance_paise: doc.balance_paise,
      updated_at:    doc.updated_at,
    });
  } catch (err) {
    console.error('[GET /api/platform-balance]', err.message);
    res.status(500).json({ error: 'Failed to fetch platform balance', detail: err.message });
  }
});

export default router;
