import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    merchant_id: { type: String, required: true },
    action:      { type: String, required: true },
    actor:       { type: String, required: true }, // e.g. 'merchant', 'system'
    before:      { type: mongoose.Schema.Types.Mixed, default: null },
    after:       { type: mongoose.Schema.Types.Mixed, default: null },
    timestamp:   { type: Date, default: Date.now },
  },
  { timestamps: false }
);

auditLogSchema.index({ merchant_id: 1 });
auditLogSchema.index({ merchant_id: 1, timestamp: -1 });

export default mongoose.model('AuditLog', auditLogSchema);
