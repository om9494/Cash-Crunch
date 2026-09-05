import mongoose from 'mongoose';

const exceptionSchema = new mongoose.Schema(
  {
    merchant_id: { type: String, required: true },
    reason:      { type: String, required: true },
  },
  { _id: false }
);

const accuracyReportSchema = new mongoose.Schema(
  {
    run_id:             { type: String, required: true, unique: true },
    total_merchants:    { type: Number, required: true },
    planted_shortfalls: { type: Number, required: true },
    correctly_flagged:  { type: Number, required: true },
    missed:             { type: Number, required: true },
    false_alarms:       { type: Number, required: true },
    precision:          { type: Number, required: true }, // 0–1 float (display only)
    recall:             { type: Number, required: true }, // 0–1 float (display only)
    exceptions:         { type: [exceptionSchema], default: [] },
    generated_at:       { type: Date, default: Date.now },
  },
  { timestamps: false }
);

export default mongoose.model('AccuracyReport', accuracyReportSchema);
