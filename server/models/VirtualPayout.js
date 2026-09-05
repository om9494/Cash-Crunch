// SYNTHETIC: models RazorpayX Payout shape, no public
// sandbox accessible without a business account

import mongoose from 'mongoose';

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    at:     { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

const virtualPayoutSchema = new mongoose.Schema(
  {
    merchant_id:     { type: String, required: true, index: true },
    payout_id:       { type: String, required: true, unique: true }, // pout_<14-char>
    fund_account_id: { type: String, required: true },
    amount_paise:    { type: Number, required: true }, // integer paise, never float rupees
    currency:        { type: String, required: true, default: 'INR' },
    purpose:         { type: String, required: true },
    status:          {
      type:    String,
      required: true,
      enum:    ['queued', 'processing', 'processed', 'failed'],
      default: 'queued',
    },
    status_history:  { type: [statusHistorySchema], default: [] },
    utr:             { type: String, default: null }, // set once status = "processed"
    created_at:      { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model('VirtualPayout', virtualPayoutSchema);
