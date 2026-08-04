"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.login = exports.me = exports.seedUsers = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const Student_1 = __importDefault(require("../models/Student"));
const centerPolicy_1 = require("../utils/centerPolicy");
const SUPER_ADMIN = {
    name: "Sanjay",
    email: "snsanjay2002@gmail.com",
    role: "super_admin",
    avatar: "SA"
};
const SUPER_ADMIN_PASSWORD = "1234";
function getStudentAccessDeniedMessage(status) {
    if (status === 'on_hold') {
        return 'Your account is on hold. Portal access has been disabled — please contact your institute.';
    }
    if (status === 'completed') {
        return 'Your enrollment is completed. Portal access is no longer available.';
    }
    return 'Your account does not have portal access.';
}
async function findStudentByEmail(email) {
    const normalized = email.trim();
    if (!normalized)
        return null;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return Student_1.default.findOne({ email: { $regex: new RegExp(`^${escaped}$`, 'i') } });
}
const seedUsers = async () => {
    try {
        const adminExists = await User_1.default.findOne({ email: SUPER_ADMIN.email });
        if (!adminExists) {
            const salt = await bcryptjs_1.default.genSalt(10);
            const hashedPassword = await bcryptjs_1.default.hash(SUPER_ADMIN_PASSWORD, salt);
            const adminUser = new User_1.default({ ...SUPER_ADMIN, password: hashedPassword });
            await adminUser.save();
            console.log(`Super admin seeded: ${SUPER_ADMIN.email}`);
        }
        else {
            console.log(`Super admin already exists: ${SUPER_ADMIN.email}`);
        }
    }
    catch (err) {
        console.error('Error seeding data:', err);
    }
};
exports.seedUsers = seedUsers;
const me = async (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token)
        return res.status(401).json({ message: 'No token' });
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        const user = await User_1.default.findById(decoded.id).select('-password');
        if (!user)
            return res.status(401).json({ message: 'User not found' });
        res.status(200).json({ user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar, tenantId: user.tenantId } });
    }
    catch {
        res.status(401).json({ message: 'Invalid token' });
    }
};
exports.me = me;
const login = async (req, res) => {
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
            const center = await (0, centerPolicy_1.getCenterByTenant)(studentRecord.tenantId);
            if (!(0, centerPolicy_1.isFeatureEnabled)(center, 'allowStudentPortal')) {
                return res.status(403).json({
                    message: 'Student portal access is disabled for your institute. Please contact your center.',
                    code: 'PORTAL_DISABLED',
                });
            }
        }
        const user = await User_1.default.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: 'Invalid email or password.' });
        }
        if (user.password) {
            const isMatch = await bcryptjs_1.default.compare(password, user.password);
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
            const center = await (0, centerPolicy_1.getCenterByTenant)(user.tenantId);
            if (!(0, centerPolicy_1.isFeatureEnabled)(center, 'allowStudentPortal')) {
                return res.status(403).json({
                    message: 'Student portal access is disabled for your institute. Please contact your center.',
                    code: 'PORTAL_DISABLED',
                });
            }
        }
        const payload = { id: user._id, role: user.role, tenantId: user.tenantId };
        const token = jsonwebtoken_1.default.sign(payload, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '1d' });
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
    }
    catch (error) {
        console.error("Login error:", error);
        res.status(500).json({ message: 'Server error', error: error.message || String(error) });
    }
};
exports.login = login;
const register = async (req, res) => {
    const { name, email, password, role, tenantId } = req.body;
    try {
        let user = await User_1.default.findOne({ email });
        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }
        const avatar = name.split(' ').map((n) => n[0]).join('').toUpperCase().substring(0, 2);
        const salt = await bcryptjs_1.default.genSalt(10);
        const hashedPassword = await bcryptjs_1.default.hash(password, salt);
        user = new User_1.default({
            name,
            email,
            password: hashedPassword,
            role,
            tenantId,
            avatar
        });
        await user.save();
        res.status(201).json({ message: 'User registered successfully', userId: user._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};
exports.register = register;
