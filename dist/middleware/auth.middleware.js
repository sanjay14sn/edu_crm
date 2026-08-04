"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireRole = exports.optionalVerifyToken = exports.verifyToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
        next();
    }
    catch (error) {
        res.status(400).json({ message: 'Invalid token.' });
    }
};
exports.verifyToken = verifyToken;
const optionalVerifyToken = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token)
        return next();
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'fallback_secret');
        req.user = decoded;
    }
    catch {
        // Ignore invalid tokens for optional auth routes
    }
    next();
};
exports.optionalVerifyToken = optionalVerifyToken;
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: Insufficient role permissions.' });
        }
        next();
    };
};
exports.requireRole = requireRole;
