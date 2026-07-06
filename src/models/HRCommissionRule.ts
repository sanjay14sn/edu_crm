import mongoose, { Document, Schema } from 'mongoose';

export interface IHRCommissionRule extends Document {
  tenantId?: string;
  employeeId: string;
  perBatchPayout: number;
  perStudentPayout: number;
  attendanceBonusThreshold: number;
  attendanceBonusAmount: number;
  studentFeedbackBonusThreshold: number;
  studentFeedbackBonusAmount: number;
  retentionIncentivePct: number;
}

const HRCommissionRuleSchema = new Schema({
  tenantId: { type: String },
  employeeId: { type: String, required: true, unique: true },
  perBatchPayout: { type: Number, default: 4000 },
  perStudentPayout: { type: Number, default: 150 },
  attendanceBonusThreshold: { type: Number, default: 90 },
  attendanceBonusAmount: { type: Number, default: 2500 },
  studentFeedbackBonusThreshold: { type: Number, default: 4.5 },
  studentFeedbackBonusAmount: { type: Number, default: 2000 },
  retentionIncentivePct: { type: Number, default: 5 },
}, { timestamps: true });

export default mongoose.model<IHRCommissionRule>('HRCommissionRule', HRCommissionRuleSchema);
