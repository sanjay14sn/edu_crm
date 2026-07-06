import mongoose, { Document, Schema } from 'mongoose';
import { RolePermissions } from '../utils/rolePermissions';

export interface IRole extends Document {
  name: string;
  slug: string;
  description?: string;
  isSystem: boolean;
  baseRole?: string;
  tenantId?: string | null;
  permissions: RolePermissions;
}

const RoleSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, default: '' },
    isSystem: { type: Boolean, default: false },
    baseRole: { type: String },
    tenantId: { type: String, default: null, index: true },
    permissions: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

RoleSchema.index({ tenantId: 1, slug: 1 }, { unique: true });

export default mongoose.model<IRole>('Role', RoleSchema);
