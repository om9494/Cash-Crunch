import mongoose from 'mongoose';

const salesTransactionSchema = new mongoose.Schema(
  {
    merchant_id:         { type: String, required: true },
    razorpay_payment_id: { type: String, required: true, unique: true },
    // All monetary values are integer paise — never floating-point rupees
    amount_paise:        { type: Number, required: true },
    status:              { type: String, required: true },
    captured_at:         { type: Date, required: true },
  },
  { timestamps: false }
);

salesTransactionSchema.index({ merchant_id: 1 });
salesTransactionSchema.index({ merchant_id: 1, captured_at: -1 });

export default mongoose.model('SalesTransaction', salesTransactionSchema);
