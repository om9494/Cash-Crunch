// SYNTHETIC: models RazorpayX Contact + Fund Account shape, no public
// sandbox accessible without a business account

import mongoose from 'mongoose';

const virtualFundAccountSchema = new mongoose.Schema(
  {
    merchant_id:           { type: String, required: true, index: true },
    fund_account_id:       { type: String, required: true, unique: true }, // fa_<14-char>
    contact_id:            { type: String, required: true, unique: true }, // cont_<14-char>
    account_holder_name:   { type: String, required: true },
    account_number_masked: { type: String, required: true }, // e.g. "XXXXXX1234"
    ifsc:                  { type: String, required: true },
    created_at:            { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model('VirtualFundAccount', virtualFundAccountSchema);
