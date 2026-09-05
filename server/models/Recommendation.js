import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema(
  {
    type:        { type: String, required: true },
    description: { type: String, required: true },
    // All monetary values are integer paise — never floating-point rupees
    cost_paise:              { type: Number, required: true },
    resulting_balance_paise: { type: Number, required: true },
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    merchant_id: { type: String, required: true },
    forecast_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Forecast', required: true },
    // The AI service only writes "pending" — the Express server transitions to approved/rejected/approval_failed
    status:         { type: String, enum: ['pending', 'approved', 'rejected', 'approval_failed'], default: 'pending' },
    options:        { type: [optionSchema], required: true },
    chosen_option:  { type: optionSchema, default: null },
  },
  { timestamps: true }
);

recommendationSchema.index({ merchant_id: 1 });
recommendationSchema.index({ merchant_id: 1, status: 1 });

export default mongoose.model('Recommendation', recommendationSchema);
