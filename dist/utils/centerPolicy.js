"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.tenantNameFilter = tenantNameFilter;
exports.getCenterByTenant = getCenterByTenant;
exports.isFeatureEnabled = isFeatureEnabled;
exports.assertFeature = assertFeature;
exports.countCapacityUsage = countCapacityUsage;
exports.getCapacityLimit = getCapacityLimit;
exports.assertCapacity = assertCapacity;
exports.buildCenterPolicyPayload = buildCenterPolicyPayload;
exports.publicPortalPayload = publicPortalPayload;
const Center_1 = __importDefault(require("../models/Center"));
const Student_1 = __importDefault(require("../models/Student"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const User_1 = __importDefault(require("../models/User"));
const bdeStats_1 = require("./bdeStats");
const CAPACITY_META = {
    students: { plural: 'students', singular: 'student', shortLabel: 'Student seats' },
    trainers: { plural: 'trainers', singular: 'trainer', shortLabel: 'Trainer seats' },
    bdes: { plural: 'BDE staff', singular: 'BDE', shortLabel: 'BDE seats' },
};
const FLAGS_DEFAULT_FALSE = [
    'allowBdeDirectConvert',
    'allowTrainerDeleteBatch',
    'scholarshipTrackingEnabled',
];
function tenantNameFilter(tenantId) {
    const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}
async function getCenterByTenant(tenantId) {
    if (!tenantId?.trim())
        return null;
    const centers = await Center_1.default.find({ tenantName: tenantNameFilter(tenantId) })
        .sort({ updatedAt: -1 })
        .limit(1);
    return centers[0] ?? null;
}
function isFeatureEnabled(center, flag) {
    if (!center)
        return !FLAGS_DEFAULT_FALSE.includes(flag);
    const val = center[flag];
    if (FLAGS_DEFAULT_FALSE.includes(flag)) {
        return val === true;
    }
    return val !== false;
}
async function assertFeature(tenantId, flag, role) {
    if (role === 'super_admin')
        return { ok: true, center: null };
    const center = await getCenterByTenant(tenantId);
    if (!isFeatureEnabled(center, flag)) {
        return { ok: false, message: 'This feature is disabled for your institute.' };
    }
    return { ok: true, center };
}
async function countCapacityUsage(tenantId, resource) {
    switch (resource) {
        case 'students':
            return Student_1.default.countDocuments({
                tenantId: (0, bdeStats_1.tenantFilter)(tenantId),
                status: { $ne: 'completed' },
            });
        case 'trainers':
            return Trainer_1.default.countDocuments({ tenantId: (0, bdeStats_1.tenantFilter)(tenantId) });
        case 'bdes':
            return User_1.default.countDocuments({ role: 'bde', tenantId: (0, bdeStats_1.tenantFilter)(tenantId) });
    }
}
function getCapacityLimit(center, resource) {
    if (!center) {
        return resource === 'students' ? 500 : resource === 'trainers' ? 25 : 10;
    }
    if (resource === 'students')
        return center.maxStudentCapacity ?? 500;
    if (resource === 'trainers')
        return center.maxTrainers ?? 25;
    return center.maxBdes ?? 10;
}
async function assertCapacity(tenantId, resource, role) {
    if (role === 'super_admin' || !tenantId)
        return { ok: true };
    const center = await getCenterByTenant(tenantId);
    const limit = getCapacityLimit(center, resource);
    const current = await countCapacityUsage(tenantId, resource);
    if (current >= limit) {
        const meta = CAPACITY_META[resource];
        return {
            ok: false,
            message: `You've reached your ${meta.plural} limit (${current}/${limit}). Upgrade your institute plan to add more ${meta.plural}.`,
            limit,
            current,
            resource,
        };
    }
    return { ok: true };
}
async function buildCenterPolicyPayload(tenantId) {
    const center = await getCenterByTenant(tenantId);
    const [studentCount, trainerCount, bdeCount] = await Promise.all([
        countCapacityUsage(tenantId, 'students'),
        countCapacityUsage(tenantId, 'trainers'),
        countCapacityUsage(tenantId, 'bdes'),
    ]);
    return {
        tenantId,
        maxStudentCapacity: getCapacityLimit(center, 'students'),
        maxTrainers: getCapacityLimit(center, 'trainers'),
        maxBdes: getCapacityLimit(center, 'bdes'),
        studentCount,
        trainerCount,
        bdeCount,
        allowStudentPortal: isFeatureEnabled(center, 'allowStudentPortal'),
        allowLeadCsvImport: isFeatureEnabled(center, 'allowLeadCsvImport'),
        allowBdeDirectConvert: isFeatureEnabled(center, 'allowBdeDirectConvert'),
        allowTrainerDeleteBatch: isFeatureEnabled(center, 'allowTrainerDeleteBatch'),
        enableCampaigns: isFeatureEnabled(center, 'enableCampaigns'),
        enableHrModule: isFeatureEnabled(center, 'enableHrModule'),
        enableLmsAiTutor: isFeatureEnabled(center, 'enableLmsAiTutor'),
        enableJobPortal: isFeatureEnabled(center, 'enableJobPortal'),
        publicPortalEnabled: isFeatureEnabled(center, 'publicPortalEnabled'),
        scholarshipTrackingEnabled: isFeatureEnabled(center, 'scholarshipTrackingEnabled'),
        enabledModules: center?.enabledModules || [],
        centerName: center?.name || tenantId,
    };
}
function publicPortalPayload(center) {
    return {
        tenantId: center.tenantName,
        name: center.name,
        tagline: center.tagline || '',
        logoUrl: center.logoUrl || '',
        brandColor: center.brandColor || '#3b82f6',
        website: center.website || '',
        welcomeMessage: center.welcomeMessage || '',
        location: center.location || '',
        email: center.email || '',
        phone: center.phone || '',
    };
}
