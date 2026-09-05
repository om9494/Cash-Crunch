import mongoose from 'mongoose';

const dailyProjectedBalanceSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    // All monetary values are integer paise — never floating-point rupees
    balance_paise: { type: Number, required: true },
  },
  { _id: false }
);

const forecastSchema = new mongoose.Schema(
  {
    merchant_id:   { type: String, required: true },
    generated_at:  { type: Date, default: Date.now },
    daily_projected_balance: [dailyProjectedBalanceSchema],
    shortfall_detected:      { type: Boolean, required: true },
    shortfall_date:          { type: Date, default: null },
    // All monetary values are integer paise — never floating-point rupees
    shortfall_amount_paise:  { type: Number, default: null },
  },
  { timestamps: false }
);

forecastSchema.index({ merchant_id: 1 });
forecastSchema.index({ merchant_id: 1, generated_at: -1 });

export default mongoose.model('Forecast', forecastSchema);
