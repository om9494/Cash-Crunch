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
