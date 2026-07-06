import mongoose, { Document, Schema } from 'mongoose';

export interface ITrainer extends Document {
  tenantId?: string;
  trainerId: string; // Auto Generated: TRN-XXXX
  name: string;
  email: string;
  phone: string;
  
  // Employment Details
  employmentType: 'Full Time' | 'Part Time' | 'Contract' | 'Freelancer / External Trainer' | 'Guest Lecturer';
  joiningDate: Date;
  status: 'Active' | 'Inactive' | 'available' | 'busy' | 'on_leave'; // keeping legacy status values for safety
  
  // Professional Details
  skills: string; // Skills / Specializations
  experience: number; // Experience (Years)
  highestQualification?: string;
  certifications?: string;
  
  // Login Access Configuration
  createAccount: boolean;

  // Training Details
  technologySubject: string;
  trainingMode: 'Online' | 'Offline' | 'Hybrid';
  availableDays?: string[];
  availableTimeSlots?: string[];
  
  // Payment Details
  paymentModel: 'Monthly Salary' | 'Per Hour' | 'Per Session' | 'Per Batch';
  salaryRateAmount: number;
  bankHolderName?: string;
  bankAccountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  panNumber?: string;
  
  // Documents
  resumeFileName?: string;
  idProofFileName?: string;
  certificationsFileName?: string;

  // Stats / Legacy compatibility
  activeBatches: number;
  hoursThisWeek: number;
  rating: number;
}

const TrainerSchema: Schema = new Schema({
  tenantId: { type: String },
  trainerId: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  
  // Employment Details
  employmentType: { 
    type: String, 
    enum: ['Full Time', 'Part Time', 'Contract', 'Freelancer / External Trainer', 'Guest Lecturer'], 
    required: true 
  },
  joiningDate: { type: Date, required: true },
  status: { 
    type: String, 
    enum: ['Active', 'Inactive', 'available', 'busy', 'on_leave'], 
    default: 'Active' 
  },
  
  // Professional Details
  skills: { type: String, required: true },
  experience: { type: Number, required: true },
  highestQualification: { type: String },
  certifications: { type: String },
  
  // Login Access Configuration
  createAccount: { type: Boolean, default: false },

  // Training Details
  technologySubject: { type: String, required: true },
  trainingMode: { 
    type: String, 
    enum: ['Online', 'Offline', 'Hybrid'], 
    default: 'Offline' 
  },
  availableDays: [{ type: String }],
  availableTimeSlots: [{ type: String }],
  
  // Payment Details
  paymentModel: { 
    type: String, 
    enum: ['Monthly Salary', 'Per Hour', 'Per Session', 'Per Batch'], 
    required: true 
  },
  salaryRateAmount: { type: Number, required: true },
  bankHolderName: { type: String },
  bankAccountNumber: { type: String },
  ifscCode: { type: String },
  upiId: { type: String },
  panNumber: { type: String },
  
  // Documents
  resumeFileName: { type: String },
  idProofFileName: { type: String },
  certificationsFileName: { type: String },

  // Stats / Legacy compatibility
  activeBatches: { type: Number, default: 0 },
  hoursThisWeek: { type: Number, default: 0 },
  rating: { type: Number, default: 5.0 }
}, { timestamps: true });

export default mongoose.model<ITrainer>('Trainer', TrainerSchema);

