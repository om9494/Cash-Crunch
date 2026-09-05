/**
 * server/services/razorpayx.js
 *
 * SYNTHETIC: models RazorpayX Payouts shape, no public sandbox accessible
 * without a business account.
 *
 * This file is the ENTIRE swap surface for a real RazorpayX integration.
 * All exported function signatures match what a live RazorpayX SDK integration
 * would expose. When real keys become available, replace this file's internals
 * with the actual Razorpay SDK calls — nothing else in the codebase changes.
 *
 * Real RazorpayX API reference:
 *   https://razorpay.com/docs/api/x/contacts/
 *   https://razorpay.com/docs/api/x/fund-accounts/
 *   https://razorpay.com/docs/api/x/payouts/
 */

import Merchant from '../models/Merchant.js';
import VirtualFundAccount from '../models/VirtualFundAccount.js';
import VirtualPayout from '../models/VirtualPayout.js';
import VirtualPlatformBalance from '../models/VirtualPlatformBalance.js';

// ── ID generation ────────────────────────────────────────────────────────────
// Mirrors Razorpay's real ID style: prefix + 14 alphanumeric characters.
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a Razorpay-style ID, e.g. "fa_K3mN8xQrT1vW2y"
 * @param {string} prefix - e.g. "fa_", "cont_", "pout_"
 * @returns {string}
 */
function generateId(prefix) {
  let id = prefix;
  for (let i = 0; i < 14; i++) {
    id += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return id;
}

/**
 * Generate a synthetic UTR (Unique Transaction Reference) in the format
 * used by Indian banks: <bank-code><YYYYMMDD><15-digit sequence>
 * e.g. "RAZR20260825000000000000001"
 * @returns {string}
 */
function generateUTR() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const seq = String(Math.floor(Math.random() * 1e15)).padStart(15, '0');
  return `RAZR${date}${seq}`;
}

/**
 * Return (or lazily create) the singleton platform balance document.
 * @returns {Promise<import('mongoose').Document>}
 */
async function getPlatformBalanceDoc() {
  // SYNTHETIC: models RazorpayX virtual current account balance, no public
  // sandbox accessible without a business account
  let doc = await VirtualPlatformBalance.findOne({ key: 'singleton' });
  if (!doc) {
    doc = await VirtualPlatformBalance.create({
      key: 'singleton',
      balance_paise: 500_000_000, // ₹50,00,000 in paise
    });
  }
  return doc;
}

// ── Exported functions (swap surface) ────────────────────────────────────────

/**
 * Create a RazorpayX Contact for a merchant.
 * Real API: POST /v1/contacts
 *
 * SYNTHETIC: models RazorpayX Contact shape, no public sandbox accessible
 * without a business account.
 *
 * @param {string} merchantId - our internal merchant_id
 * @param {string} name - account holder name
 * @returns {Promise<string>} contact_id (e.g. "cont_K3mN8xQrT1vW2y")
 */
export async function createContact(merchantId, name) {
  // SYNTHETIC: models RazorpayX Contact shape, no public sandbox accessible
  // without a business account
  const contact_id = generateId('cont_');
  // Store contact_id on the merchant document for reference
  await Merchant.findOneAndUpdate(
    { merchant_id: merchantId },
    { contact_id },
    { new: true }
  );
  return contact_id;
}

/**
 * Create a RazorpayX Fund Account linked to a contact.
 * Real API: POST /v1/fund_accounts
 *
 * SYNTHETIC: models RazorpayX Fund Account shape, no public sandbox accessible
 * without a business account.
 *
 * @param {string} merchantId - our internal merchant_id
 * @param {string} contactId  - contact_id returned by createContact
 * @returns {Promise<string>} fund_account_id (e.g. "fa_K3mN8xQrT1vW2y")
 */
export async function createFundAccount(merchantId, contactId) {
  // SYNTHETIC: models RazorpayX Fund Account shape, no public sandbox accessible
  // without a business account

  // Look up merchant name for account holder
  const merchant = await Merchant.findOne({ merchant_id: merchantId });
  if (!merchant) throw new Error(`Merchant not found: ${merchantId}`);

  const fund_account_id = generateId('fa_');

  // Generate a plausible masked account number (last 4 digits visible)
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const account_number_masked = `XXXXXX${last4}`;

  // Plausible IFSC codes from major Indian banks
  const IFSC_POOL = [
    'HDFC0001234', 'ICIC0002345', 'SBIN0003456', 'UTIB0004567',
    'KKBK0005678', 'YESB0006789', 'IDFB0040101', 'RATN0000156',
  ];
  const ifsc = IFSC_POOL[Math.floor(Math.random() * IFSC_POOL.length)];

  // SYNTHETIC: models RazorpayX Fund Account shape, no public sandbox accessible
  // without a business account
  await VirtualFundAccount.create({
    merchant_id:           merchantId,
    fund_account_id,
    contact_id:            contactId,
    account_holder_name:   merchant.name,
    account_number_masked,
    ifsc,
  });

  // Persist fund_account_id on the Merchant document
  await Merchant.findOneAndUpdate(
    { merchant_id: merchantId },
    { fund_account_id },
    { new: true }
  );

  return fund_account_id;
}

/**
 * Get the platform's RazorpayX current account balance.
 * Real API: GET /v1/balance (account-level balance)
 *
 * SYNTHETIC: models RazorpayX account balance shape, no public sandbox
 * accessible without a business account.
 *
 * @returns {Promise<{ balance_paise: number, balance_rupees: string }>}
 */
export async function getAccountBalance() {
  // SYNTHETIC: models RazorpayX account balance shape, no public sandbox
  // accessible without a business account
  const doc = await getPlatformBalanceDoc();
  return {
    balance_paise:  doc.balance_paise,
    // For display only — all internal math uses balance_paise
    balance_rupees: (doc.balance_paise / 100).toFixed(2),
  };
}

/**
 * Create a RazorpayX Payout from the platform account to a fund account.
 * Real API: POST /v1/payouts
 *
 * SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
 * without a business account.
 *
 * Simulates the real RazorpayX status lifecycle:
 *   queued  →  processing  →  processed
 * with realistic delays (~3–6 s total) and status_history timestamps.
 * A synthetic UTR is generated once status reaches "processed".
 *
 * Fails with an insufficient_balance error object — matching Razorpay's
 * documented error shape — if the platform balance cannot cover the payout.
 *
 * NOTE: This function must NOT be called from any route until Phase 10.
 *       Currently only called from setup scripts and the test script.
 *
 * @param {string} fundAccountId - fund_account_id of the recipient
 * @param {number} amountPaise   - integer paise, never float rupees
 * @param {string} purpose       - e.g. "payout", "salary"
 * @returns {Promise<import('mongoose').Document>} the VirtualPayout document
 * @throws {Object} Razorpay-shaped error if platform balance is insufficient
 */
export async function createPayout(fundAccountId, amountPaise, purpose) {
  // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
  // without a business account

  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new Error('amountPaise must be a positive integer (paise)');
  }

  // Resolve merchant from fund account
  const fundAccount = await VirtualFundAccount.findOne({ fund_account_id: fundAccountId });
  if (!fundAccount) {
    throw new Error(`Fund account not found: ${fundAccountId}`);
  }

  // Check platform balance — fail with Razorpay-shaped error if insufficient
  const platformDoc = await getPlatformBalanceDoc();
  if (platformDoc.balance_paise < amountPaise) {
    // SYNTHETIC: mirrors Razorpay's documented error response shape
    // https://razorpay.com/docs/errors/
    throw {
      error: {
        code:        'BAD_REQUEST_ERROR',
        description: 'Your RazorpayX account does not have sufficient balance to complete this payout',
        reason:      'insufficient_balance',
        source:      'business',
        step:        'payment_initiation',
        metadata:    {
          balance_paise:   platformDoc.balance_paise,
          requested_paise: amountPaise,
        },
      },
    };
  }

  // Deduct from platform balance immediately (funds are reserved on creation)
  platformDoc.balance_paise -= amountPaise;
  platformDoc.updated_at = new Date();
  await platformDoc.save();

  // Create the payout in "queued" state
  const payout_id = generateId('pout_');
  const now = new Date();

  // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
  // without a business account
  const payout = await VirtualPayout.create({
    merchant_id:     fundAccount.merchant_id,
    payout_id,
    fund_account_id: fundAccountId,
    amount_paise:    amountPaise, // integer paise, never float rupees
    currency:        'INR',
    purpose,
    status:          'queued',
    status_history:  [{ status: 'queued', at: now }],
  });

  // ── Simulate the real RazorpayX status lifecycle asynchronously ──────────
  // queued → processing (~1.5–2.5 s) → processed (~3–6 s total)
  // Updates are persisted to MongoDB so getPayout() reflects real state.
  const processingDelay = 1500 + Math.floor(Math.random() * 1000); // 1.5–2.5 s
  const processedDelay  = processingDelay + 1500 + Math.floor(Math.random() * 2000); // +1.5–3.5 s

  setTimeout(async () => {
    try {
      // SYNTHETIC: models RazorpayX Payout lifecycle, no public sandbox
      await VirtualPayout.findOneAndUpdate(
        { payout_id },
        {
          status: 'processing',
          $push:  { status_history: { status: 'processing', at: new Date() } },
        }
      );
    } catch (err) {
      console.error(`[razorpayx] lifecycle error (processing) for ${payout_id}:`, err.message);
    }
  }, processingDelay);

  setTimeout(async () => {
    try {
      const utr = generateUTR();
      // SYNTHETIC: models RazorpayX Payout lifecycle, no public sandbox
      await VirtualPayout.findOneAndUpdate(
        { payout_id },
        {
          status: 'processed',
          utr,
          $push:  { status_history: { status: 'processed', at: new Date() } },
        }
      );
    } catch (err) {
      console.error(`[razorpayx] lifecycle error (processed) for ${payout_id}:`, err.message);
    }
  }, processedDelay);

  return payout;
}

/**
 * Get the current state of a payout (for polling).
 * Real API: GET /v1/payouts/:id
 *
 * SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
 * without a business account.
 *
 * @param {string} payoutId - payout_id (e.g. "pout_K3mN8xQrT1vW2y")
 * @returns {Promise<import('mongoose').Document|null>}
 */
export async function getPayout(payoutId) {
  // SYNTHETIC: models RazorpayX Payout shape, no public sandbox accessible
  // without a business account
  return VirtualPayout.findOne({ payout_id: payoutId }).lean();
}
