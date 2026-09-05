// SYNTHETIC: models RazorpayX virtual current account balance for the platform,
// no public sandbox accessible without a business account.
// Singleton document — only one row ever exists (identified by key: "singleton").

import mongoose from 'mongoose';

const virtualPlatformBalanceSchema = new mongoose.Schema(
  {
    key:             { type: String, default: 'singleton', unique: true },
    // Platform's RazorpayX current account balance in integer paise.
    // Default: ₹50,00,000 = 500000000 paise.
    balance_paise:   { type: Number, required: true, default: 500_000_000 },
    updated_at:      { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model('VirtualPlatformBalance', virtualPlatformBalanceSchema);
