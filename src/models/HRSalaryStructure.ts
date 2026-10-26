import mongoose, { Document, Schema } from 'mongoose';

export type SalaryComponentMode = 'fixed' | 'ctc' | 'basic' | 'gross' | 'balance';

export interface ISalaryComponentRule {
  mode: SalaryComponentMode;
  value: number;
}

export interface ICustomSalaryComponent {
  name: string;
  kind: 'earning' | 'deduction';
  mode: SalaryComponentMode;
  value: number;
  amount: number;
}

export interface IHRSalaryStructure extends Document {
  tenantId?: string;
  employeeId: string;
  ctc: number;
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
  /** UI rules per built-in component (amounts above remain the source of truth) */
  rules: Record<string, ISalaryComponentRule>;
  customComponents: ICustomSalaryComponent[];
  effectiveFrom: string;
}

const CustomComponentSchema = new Schema(
  {
    name: { type: String, required: true },
    kind: { type: String, enum: ['earning', 'deduction'], required: true },
    mode: { type: String, enum: ['fixed', 'ctc', 'basic', 'gross', 'balance'], default: 'fixed' },
    value: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
  },
  { _id: false }
);

const HRSalaryStructureSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    ctc: { type: Number, default: 0 },
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
    rules: { type: Schema.Types.Mixed, default: {} },
    customComponents: { type: [CustomComponentSchema], default: [] },
    effectiveFrom: { type: String, required: true },
  },
  { timestamps: true, minimize: false }
);

HRSalaryStructureSchema.index({ tenantId: 1, employeeId: 1 }, { unique: true });

export function customComponentTotal(
  structure: { customComponents?: { kind: string; amount?: number }[] },
  kind: 'earning' | 'deduction'
) {
  return (structure.customComponents || [])
    .filter((c) => c.kind === kind)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export function structureGross(structure: Partial<IHRSalaryStructure>) {
  return (
    (structure.basic || 0) +
    (structure.hra || 0) +
    (structure.allowances || 0) +
    (structure.incentives || 0) +
    (structure.bonuses || 0) +
    customComponentTotal(structure, 'earning')
  );
}

export default mongoose.model<IHRSalaryStructure>('HRSalaryStructure', HRSalaryStructureSchema);
