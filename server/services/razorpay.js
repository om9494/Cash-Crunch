/**
 * Razorpay SDK client — Payment Gateway (test mode).
 *
 * All Razorpay SDK calls in the entire server layer must go through
 * this module — nowhere else — so swapping keys or upgrading the SDK
 * is a one-file change.
 *
 * RazorpayX (banking/payout) would use a separate key pair
 * (RAZORPAYX_KEY_ID / RAZORPAYX_KEY_SECRET) and is NOT configured here;
 * it will be wired in a later phase.
 */

import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
  throw new Error(
    'RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in environment variables'
  );
}

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export default razorpay;

/**
 * createTopUpOrder — creates a Razorpay order for a merchant funds top-up.
 *
 * @param {string} merchantId   - merchant identifier (used in receipt)
 * @param {number} amountPaise  - amount in integer paise (never rupees)
 * @returns {Promise<object>}   - Razorpay order object { id, amount, currency, ... }
 */
export async function createTopUpOrder(merchantId, amountPaise) {
  const order = await razorpay.orders.create({
    amount:   amountPaise,
    currency: 'INR',
    receipt:  `topup_${merchantId}_${Date.now()}`,
  });
  return order;
}

/**
 * verifyAndCapturePayment — verifies Razorpay Checkout signature, then captures
 * the payment if it hasn't been auto-captured already.
 *
 * Signature verification uses HMAC-SHA256 of `${orderId}|${paymentId}` keyed
 * with RAZORPAY_KEY_SECRET, compared via timing-safe equality so there is
 * no timing oracle on the secret.
 *
 * IMPORTANT: we NEVER touch the balance or call capture() if the signature
 * does not match — an unverified payment must be rejected outright.
 *
 * In Razorpay test mode, Checkout payments are auto-captured by default
 * (payment_capture defaults to 1 on the order). Calling capture() on an
 * already-captured payment throws BAD_REQUEST_ERROR. We fetch the payment
 * first and only call capture() when status === 'authorized'.
 *
 * @param {string} orderId      - razorpay_order_id returned by Checkout
 * @param {string} paymentId    - razorpay_payment_id returned by Checkout
 * @param {string} signature    - razorpay_signature returned by Checkout
 * @param {number} amountPaise  - amount in integer paise to capture
 * @returns {Promise<object>}   - payment object (captured or already-captured)
 * @throws  {Error}             - SIGNATURE_MISMATCH on bad signature
 */
export async function verifyAndCapturePayment(orderId, paymentId, signature, amountPaise) {
  // ── Step 1: verify signature ───────────────────────────────────────────
  const expectedHex = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(signature,   'hex');

  if (
    expected.length !== received.length ||
    !crypto.timingSafeEqual(expected, received)
  ) {
    const err = new Error('Invalid payment signature — payment not captured');
    err.code = 'SIGNATURE_MISMATCH';
    throw err;
  }

  // ── Step 2: fetch current payment status ──────────────────────────────
  // Razorpay Checkout auto-captures by default (payment_capture=1 on order).
  // Calling capture() on an already-captured payment throws BAD_REQUEST_ERROR,
  // so we check first and skip the capture call when the payment is already done.
  const payment = await razorpay.payments.fetch(paymentId);

  if (payment.status === 'captured') {
    // Already captured (auto-capture in test mode) — nothing left to do.
    return payment;
  }

  if (payment.status === 'authorized') {
    // Manual capture needed — call capture() now.
    const captured = await razorpay.payments.capture(paymentId, amountPaise, 'INR');
    return captured;
  }

  // Any other status (failed, refunded, etc.) — reject clearly.
  const err = new Error(`Payment is in unexpected status "${payment.status}" — cannot proceed`);
  err.code = 'UNEXPECTED_PAYMENT_STATUS';
  err.paymentStatus = payment.status;
  throw err;
}
