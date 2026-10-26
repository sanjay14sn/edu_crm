import mongoose, { Document, Schema } from 'mongoose';

export type EmployeeTaskStatus = 'pending' | 'in_progress' | 'completed';
export type EmployeeTaskPriority = 'low' | 'medium' | 'high';

export interface IEmployeeTask extends Document {
  tenantId?: string;
  employeeId: string;
  title: string;
  description?: string;
  priority: EmployeeTaskPriority;
  status: EmployeeTaskStatus;
  dueDate?: string;
  assignedBy?: string;
  assignedByName?: string;
  remarks?: string;
  completedAt?: string;
}

const EmployeeTaskSchema = new Schema(
  {
    tenantId: { type: String },
    employeeId: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    status: { type: String, enum: ['pending', 'in_progress', 'completed'], default: 'pending' },
    dueDate: { type: String },
    assignedBy: { type: String },
    assignedByName: { type: String },
    remarks: { type: String },
    completedAt: { type: String },
  },
  { timestamps: true }
);

EmployeeTaskSchema.index({ tenantId: 1, employeeId: 1, status: 1 });

export default mongoose.model<IEmployeeTask>('EmployeeTask', EmployeeTaskSchema);
