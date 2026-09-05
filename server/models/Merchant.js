import mongoose from 'mongoose';

const merchantSchema = new mongoose.Schema(
  {
    merchant_id:      { type: String, required: true, unique: true },
    name:             { type: String, required: true },
    business_type:    { type: String, required: true },
    employees_count:  { type: Number, required: true },
    // RazorpayX virtual account fields — populated by setup_virtual_accounts.js
    // SYNTHETIC: models RazorpayX Contact + Fund Account shape, no public
    // sandbox accessible without a business account
    contact_id:       { type: String, default: null }, // cont_<14-char>
    fund_account_id:  { type: String, default: null }, // fa_<14-char>
    created_at:       { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model('Merchant', merchantSchema);
