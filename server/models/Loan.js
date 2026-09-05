import mongoose from 'mongoose';

// SYNTHETIC: models Razorpay Capital shape, no public sandbox exists
const loanSchema = new mongoose.Schema(
  {
    merchant_id: { type: String, required: true },
    loan_id:     { type: String, required: true, unique: true },
    // All monetary values are integer paise — never floating-point rupees
    principal_paise:   { type: Number, required: true },
    emi_amount_paise:  { type: Number, required: true },
    emi_due_date:      { type: Date, required: true },
    tenure_remaining:  { type: Number, required: true }, // months remaining
  },
  { timestamps: false }
);

loanSchema.index({ merchant_id: 1 });

export default mongoose.model('Loan', loanSchema);
