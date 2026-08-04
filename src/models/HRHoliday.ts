import mongoose, { Document, Schema } from 'mongoose';

export interface IHRHoliday extends Document {
  tenantId?: string;
  name: string;
  date: string;
  optional: boolean;
  notes?: string;
}

const HRHolidaySchema = new Schema(
  {
    tenantId: { type: String },
    name: { type: String, required: true },
    date: { type: String, required: true },
    optional: { type: Boolean, default: false },
    notes: { type: String },
  },
  { timestamps: true }
);

HRHolidaySchema.index({ tenantId: 1, date: 1 });

export default mongoose.model<IHRHoliday>('HRHoliday', HRHolidaySchema);
