import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import Student from '../models/Student';
import { getCenterByTenant, isFeatureEnabled } from '../utils/centerPolicy';

const SUPER_ADMIN = {
  name: "Sanjay",
  email: "snsanjay2002@gmail.com",
  role: "super_admin" as const,
  avatar: "SA"
};

const SUPER_ADMIN_PASSWORD = "1234";

function getStudentAccessDeniedMessage(status?: string) {
  if (status === 'on_hold') {
    return 'Your account is on hold. Portal access has been disabled — please contact your institute.';
  }
  if (status === 'completed') {
    return 'Your enrollment is completed. Portal access is no longer available.';
  }
  return 'Your account does not have portal access.';
}

async function findStudentByEmail(email: string) {
  const normalized = email.trim();
  if (!normalized) return null;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Student.findOne({ email: { $regex: new RegExp(`^${escaped}$`, 'i') } });
}

export const seedUsers = async () => {
  try {
    const adminExists = await User.findOne({ email: SUPER_ADMIN.email });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, salt);

      const adminUser = new User({ ...SUPER_ADMIN, password: hashedPassword });
      await adminUser.save();
      console.log(`Super admin seeded: ${SUPER_ADMIN.email}`);
    } else {
      console.log(`Super admin already exists: ${SUPER_ADMIN.email}`);
    }
  } catch (err) {
    console.error('Error seeding data:', err);
  }
};


export const me = async (req: Request, res: Response) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'No token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret') as { id: string };
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    res.status(200).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, tenantId: user.tenantId } });
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    const studentRecord = await findStudentByEmail(email || '');
    if (studentRecord && studentRecord.status !== 'active') {
      return res.status(403).json({
        message: getStudentAccessDeniedMessage(studentRecord.status),
        code: 'ACCESS_DENIED',
        status: studentRecord.status,
      });
    }

    if (studentRecord?.tenantId) {
      const center = await getCenterByTenant(studentRecord.tenantId);
      if (!isFeatureEnabled(center, 'allowStudentPortal')) {
        return res.status(403).json({
          message: 'Student portal access is disabled for your institute. Please contact your center.',
          code: 'PORTAL_DISABLED',
        });
      }
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    if (user.password) {
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ message: 'Invalid email or password.' });
      }
    }

    if (user.role === 'student') {
      const linkedStudent = studentRecord || await findStudentByEmail(user.email);
      if (linkedStudent && linkedStudent.status !== 'active') {
        return res.status(403).json({
          message: getStudentAccessDeniedMessage(linkedStudent.status),
          code: 'ACCESS_DENIED',
          status: linkedStudent.status,
        });
      }

      const center = await getCenterByTenant(user.tenantId);
      if (!isFeatureEnabled(center, 'allowStudentPortal')) {
        return res.status(403).json({
          message: 'Student portal access is disabled for your institute. Please contact your center.',
          code: 'PORTAL_DISABLED',
        });
      }
    }

    const payload = { id: user._id, role: user.role, tenantId: user.tenantId };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });

    res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        tenantId: user.tenantId
      }
    });
  } catch (error: any) {
    console.error("Login error:", error);
    res.status(500).json({ message: 'Server error', error: error.message || String(error) });
  }
};

export const register = async (req: Request, res: Response) => {
  const { name, email, password, role, tenantId } = req.body;

  try {
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const avatar = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0, 2);

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      password: hashedPassword,
      role,
      tenantId,
      avatar
    });

    await user.save();

    res.status(201).json({ message: 'User registered successfully', userId: user._id });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};
