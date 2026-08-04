import mongoose, { Document, Schema } from 'mongoose';

export interface IHRSalaryStructure extends Document {
  tenantId?: string;
  employeeId: string;
  basic: number;
  hra: number;
  allowances: number;
  incentives: number;
  bonuses: number;
  pf: number;
  esi: number;
  professionalTax: number;
  tds: number;
  otherDeductions: number;
  effectiveFrom: string;
}

const HRSalaryStructureSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    basic: { type: Number, default: 0 },
    hra: { type: Number, default: 0 },
    allowances: { type: Number, default: 0 },
    incentives: { type: Number, default: 0 },
    bonuses: { type: Number, default: 0 },
    pf: { type: Number, default: 0 },
    esi: { type: Number, default: 0 },
    professionalTax: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    effectiveFrom: { type: String, required: true },
  },
  { timestamps: true }
);

HRSalaryStructureSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });

export default mongoose.model<IHRSalaryStructure>('HRSalaryStructure', HRSalaryStructureSchema);
