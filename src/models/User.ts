import mongoose, { Document, Schema } from 'mongoose';

export type UserRole = "super_admin" | "owner" | "trainer" | "student" | "bde";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  avatar?: string;
  tenantId?: string;
}

const UserSchema: Schema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // Optional for dummy data, but required for real login
  role: { type: String, enum: ["super_admin", "owner", "trainer", "student", "bde"], required: true },
  avatar: { type: String },
  tenantId: { type: String }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
