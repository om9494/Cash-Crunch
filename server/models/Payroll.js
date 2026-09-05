import mongoose from 'mongoose';

// SYNTHETIC: models Razorpay Payroll shape, no public sandbox exists
const payrollSchema = new mongoose.Schema(
  {
    merchant_id:    { type: String, required: true },
    payroll_run_id: { type: String, required: true, unique: true },
    // All monetary values are integer paise — never floating-point rupees
    total_salary_paise: { type: Number, required: true },
    employees:          { type: Number, required: true },
    pay_date:           { type: Date, required: true },
  },
  { timestamps: false }
);

payrollSchema.index({ merchant_id: 1 });

export default mongoose.model('Payroll', payrollSchema);
