import mongoose, { Document, Schema } from 'mongoose';

export interface IEmployeeDailyReport extends Document {
  tenantId?: string;
  employeeId: string;
  employeeName: string;
  date: string; // YYYY-MM-DD
  summary?: string;
  tasksCompleted: string;
  tasksInProgress?: string;
  blockers?: string;
  planForTomorrow?: string;
  hoursWorked?: number;
}

const EmployeeDailyReportSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    date: { type: String, required: true },
    summary: { type: String },
    tasksCompleted: { type: String },
    tasksInProgress: { type: String },
    blockers: { type: String },
    planForTomorrow: { type: String },
    hoursWorked: { type: Number },
  },
  { timestamps: true }
);

EmployeeDailyReportSchema.index({ tenantId: 1, employeeId: 1, date: 1 }, { unique: true });

export default mongoose.model<IEmployeeDailyReport>('EmployeeDailyReport', EmployeeDailyReportSchema);
