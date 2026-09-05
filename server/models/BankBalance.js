import mongoose from 'mongoose';

const bankBalanceSchema = new mongoose.Schema(
  {
    merchant_id: { type: String, required: true },
    date:        { type: Date, required: true },
    // All monetary values are integer paise — never floating-point rupees
    closing_balance_paise: { type: Number, required: true },
  },
  { timestamps: false }
);

bankBalanceSchema.index({ merchant_id: 1 });
bankBalanceSchema.index({ merchant_id: 1, date: -1 });

export default mongoose.model('BankBalance', bankBalanceSchema);
