import mongoose, { Document, Schema } from 'mongoose';

export type HREmploymentType = 'Full-Time' | 'Part-Time' | 'Contract' | 'Intern';
export type HREmployeeSource = 'trainer' | 'bde' | 'manual';
export type HREmployeeStatus = 'active' | 'exited';

export interface IHREmployee extends Document {
  tenantId?: string;
  sourceType: HREmployeeSource;
  sourceId: string;
  employeeCode: string;
  name: string;
  email?: string;
  phone?: string;
  department: string;
  designation: string;
  branch: string;
  employmentType: HREmploymentType;
  joiningDate: string;
  reportingManager?: string;
  dateOfBirth?: string;
  status: HREmployeeStatus;
  exitDate?: string;
  exitReason?: string;
  baseSalary: number;
  /** Portal login (User with role "employee") for staff outside Trainer/BDE */
  userId?: string;
}

const HREmployeeSchema = new Schema(
  {
    tenantId: { type: String },
    sourceType: { type: String, enum: ['trainer', 'bde', 'manual'], required: true },
    sourceId: { type: String, required: true },
    employeeCode: { type: String, required: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    department: { type: String, default: 'General' },
    designation: { type: String, default: 'Staff' },
    branch: { type: String, default: 'Main Campus' },
    employmentType: {
      type: String,
      enum: ['Full-Time', 'Part-Time', 'Contract', 'Intern'],
      default: 'Full-Time',
    },
    joiningDate: { type: String, required: true },
    reportingManager: { type: String, default: 'Center Admin' },
    dateOfBirth: { type: String },
    status: { type: String, enum: ['active', 'exited'], default: 'active' },
    exitDate: { type: String },
    exitReason: { type: String },
    baseSalary: { type: Number, default: 0 },
    userId: { type: String },
  },
  { timestamps: true }
);

HREmployeeSchema.index({ tenantId: 1, sourceType: 1, sourceId: 1 }, { unique: true });
HREmployeeSchema.index({ tenantId: 1, employeeCode: 1 });

export default mongoose.model<IHREmployee>('HREmployee', HREmployeeSchema);
