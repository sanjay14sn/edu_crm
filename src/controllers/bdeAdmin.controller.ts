import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import BDEProfile from '../models/BDEProfile';
import { assertCapacity } from '../utils/centerPolicy';

function mapBdeProfileFields(profile?: {
  employeeId?: string;
  phone?: string;
  gender?: string;
  dob?: Date;
  address?: string;
  qualification?: string;
  experience?: string;
  joiningDate?: Date;
  monthlyTarget?: number;
  targetType?: 'revenue' | 'leads';
  commissionEnabled?: boolean;
  commissionPercentage?: number;
  commissionApplyFrom?: 'from_start' | 'after_target' | 'after_threshold';
  commissionThreshold?: number;
  status?: 'active' | 'inactive';
  weeklyOffDays?: number[];
}) {
  const commissionPercentage = profile?.commissionPercentage ?? 0;
  const weeklyOffDays =
    Array.isArray(profile?.weeklyOffDays) && profile!.weeklyOffDays.length > 0
      ? profile!.weeklyOffDays
      : [0];
  return {
    employeeId: profile?.employeeId,
    phone: profile?.phone || '',
    gender: profile?.gender || 'not-specified',
    dob: profile?.dob ? profile.dob.toISOString().split('T')[0] : '',
    address: profile?.address || '',
    qualification: profile?.qualification || '',
    experience: profile?.experience || '',
    joiningDate: profile?.joiningDate
      ? profile.joiningDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    monthlyTarget: profile?.monthlyTarget || 30,
    targetType: profile?.targetType || 'leads',
    commissionEnabled: profile?.commissionEnabled ?? commissionPercentage > 0,
    commissionPercentage,
    commissionApplyFrom: profile?.commissionApplyFrom || 'from_start',
    commissionThreshold: profile?.commissionThreshold,
    status: profile?.status || 'active',
    weeklyOffDays,
  };
}

// Get all BDEs (Combining User and BDEProfile data)
export const getBDEs = async (req: Request, res: Response) => {
  try {
    const authReq = req as any;
    const tenantId = authReq.user?.tenantId;
    const filter: any = { role: 'bde' };
    if (authReq.user?.role !== 'super_admin') {
      filter.tenantId = tenantId;
    }
    const users = await User.find(filter);
    const userIds = users.map(u => u._id);
    const profiles = await BDEProfile.find({ userId: { $in: userIds } });

    // Combine into a single payload format expected by frontend
    const bdes = users.map(user => {
      const profile = profiles.find(p => p.userId.toString() === user._id.toString());
      const profileFields = mapBdeProfileFields(profile || undefined);
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        ...profileFields,
        employeeId: profileFields.employeeId || `EMP-${user._id.toString().substring(0,6)}`,
        // Frontend handles leads counts locally based on `getLeads` data
        activeLeads: 0,
        convertedLeads: 0,
        lostLeads: 0,
        revenueGenerated: 0
      };
    });

    res.status(200).json(bdes);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching BDEs', error });
  }
};

// Create a new BDE
export const createBDE = async (req: Request, res: Response) => {
  try {
    const { 
      name, email, password, phone, gender, dob, 
      address, qualification, experience, joiningDate, 
      monthlyTarget, targetType, commissionEnabled, commissionPercentage,
      commissionApplyFrom, commissionThreshold, status, weeklyOffDays, tenantId 
    } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const resolvedTenant = (req as any).user?.tenantId || tenantId || 't-1';
    const capacity = await assertCapacity(resolvedTenant, 'bdes', (req as any).user?.role);
    if (!capacity.ok) {
      return res.status(403).json({
        message: capacity.message,
        code: 'CAPACITY_LIMIT',
        limit: capacity.limit,
        current: capacity.current,
      });
    }

    const salt = await bcrypt.genSalt(10);
    // Use provided password or a default if not provided
    const hashedPassword = await bcrypt.hash(password || 'bde123', salt);
    
    const avatar = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);

    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: 'bde',
      tenantId: (req as any).user?.tenantId || tenantId || 't-1',
      avatar
    });

    const savedUser = await newUser.save();

    // Auto-generate employee ID
    const count = await BDEProfile.countDocuments();
    const generatedEmployeeId = `EMP-BDE-${String(count + 1).padStart(2, '0')}`;

    const newProfile = new BDEProfile({
      userId: savedUser._id,
      employeeId: generatedEmployeeId,
      phone,
      gender,
      dob: dob ? new Date(dob) : undefined,
      address,
      qualification,
      experience,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      monthlyTarget: monthlyTarget || (targetType === 'revenue' ? 75000 : 30),
      targetType: targetType || 'leads',
      commissionEnabled: Boolean(commissionEnabled),
      commissionPercentage: commissionEnabled ? Number(commissionPercentage) || 0 : 0,
      commissionApplyFrom: commissionApplyFrom || 'from_start',
      commissionThreshold:
        commissionApplyFrom === 'after_threshold' && commissionThreshold != null
          ? Number(commissionThreshold)
          : undefined,
      status: status || 'active',
      weeklyOffDays: Array.isArray(weeklyOffDays) && weeklyOffDays.length > 0 ? weeklyOffDays : [0],
    });

    await newProfile.save();

    res.status(201).json({
      id: savedUser._id,
      name: savedUser.name,
      email: savedUser.email,
      ...mapBdeProfileFields(newProfile),
      employeeId: newProfile.employeeId,
    });

  } catch (error) {
    res.status(400).json({ message: 'Error creating BDE', error });
  }
};

// Update an existing BDE
export const updateBDE = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // This is the user _id
    const { 
      name, email, employeeId, phone, gender, dob, 
      address, qualification, experience, joiningDate, 
      monthlyTarget, targetType, commissionEnabled, commissionPercentage,
      commissionApplyFrom, commissionThreshold, status, weeklyOffDays 
    } = req.body;

    // Update User
    const updatedUser = await User.findByIdAndUpdate(
      id, 
      { name, email }, 
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update Profile
    const updatedProfile = await BDEProfile.findOneAndUpdate(
      { userId: id },
      { 
        employeeId, phone, gender, dob: dob ? new Date(dob) : undefined,
        address, qualification, experience, 
        joiningDate: joiningDate ? new Date(joiningDate) : undefined,
        monthlyTarget, targetType,
        commissionEnabled: Boolean(commissionEnabled),
        commissionPercentage: commissionEnabled ? Number(commissionPercentage) || 0 : 0,
        commissionApplyFrom: commissionApplyFrom || 'from_start',
        commissionThreshold:
          commissionApplyFrom === 'after_threshold' && commissionThreshold != null
            ? Number(commissionThreshold)
            : undefined,
        status,
        weeklyOffDays: Array.isArray(weeklyOffDays) ? weeklyOffDays : undefined,
      },
      { returnDocument: 'after', upsert: true }
    );

    res.status(200).json({
      id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      ...mapBdeProfileFields(updatedProfile || undefined),
      employeeId: updatedProfile?.employeeId,
    });
  } catch (error) {
    res.status(400).json({ message: 'Error updating BDE', error });
  }
};

// Delete a BDE
export const deleteBDE = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    await BDEProfile.findOneAndDelete({ userId: id });
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: 'Error deleting BDE', error });
  }
};
