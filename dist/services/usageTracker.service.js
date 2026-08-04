"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordCloudinaryUpload = recordCloudinaryUpload;
exports.recordAiTokenUsage = recordAiTokenUsage;
exports.estimateMongoUsageForTenant = estimateMongoUsageForTenant;
exports.getTenantUsageSnapshot = getTenantUsageSnapshot;
const TenantUsage_1 = __importDefault(require("../models/TenantUsage"));
const Center_1 = __importDefault(require("../models/Center"));
const Student_1 = __importDefault(require("../models/Student"));
const Lead_1 = __importDefault(require("../models/Lead"));
const Batch_1 = __importDefault(require("../models/Batch"));
const Course_1 = __importDefault(require("../models/Course"));
const Attendance_1 = __importDefault(require("../models/Attendance"));
const Campaign_1 = __importDefault(require("../models/Campaign"));
const User_1 = __importDefault(require("../models/User"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const formatBytes_1 = require("../utils/formatBytes");
function normalizeTenantId(tenantId) {
    return (tenantId || 'ERP').trim() || 'ERP';
}
function tenantRegex(tenantId) {
    const escaped = tenantId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escaped}\\s*$`, 'i');
}
async function recordCloudinaryUpload(tenantId, bytes) {
    const id = normalizeTenantId(tenantId);
    const size = Math.max(0, Number(bytes) || 0);
    if (!size)
        return;
    await TenantUsage_1.default.findOneAndUpdate({ tenantId: id }, {
        $inc: { cloudinaryBytes: size, cloudinaryFiles: 1 },
        $set: { lastCloudinaryUploadAt: new Date() },
        $setOnInsert: { tenantId: id },
    }, { upsert: true, returnDocument: 'after' });
}
async function recordAiTokenUsage(tenantId, usage, feature) {
    const id = normalizeTenantId(tenantId);
    const promptTokens = Math.max(0, Number(usage.promptTokens) || 0);
    const completionTokens = Math.max(0, Number(usage.completionTokens) || 0);
    const totalTokens = Math.max(0, Number(usage.totalTokens) || 0) || promptTokens + completionTokens;
    if (!totalTokens && !promptTokens && !completionTokens)
        return;
    const today = new Date().toISOString().split('T')[0];
    const existing = await TenantUsage_1.default.findOne({ tenantId: id }).lean();
    const dailyRequests = existing?.aiDailyDate === today ? (existing.aiDailyRequests || 0) + 1 : 1;
    await TenantUsage_1.default.findOneAndUpdate({ tenantId: id }, {
        $inc: {
            aiPromptTokens: promptTokens,
            aiCompletionTokens: completionTokens,
            aiTotalTokens: totalTokens,
            aiRequests: 1,
        },
        $set: {
            lastAiUsageAt: new Date(),
            aiDailyDate: today,
            aiDailyRequests: dailyRequests,
        },
        $setOnInsert: { tenantId: id },
    }, { upsert: true, returnDocument: 'after' });
    if (feature) {
        // reserved for future per-feature breakdown
    }
}
async function estimateCollectionBytes(model, filter) {
    const count = await model.countDocuments(filter);
    if (count === 0)
        return { count: 0, bytes: 0 };
    const samples = await model.find(filter).limit(8).lean();
    const avgSize = samples.reduce((sum, doc) => sum + Buffer.byteLength(JSON.stringify(doc), 'utf8'), 0) /
        Math.max(samples.length, 1);
    return { count, bytes: Math.round(count * avgSize) };
}
async function estimateMongoUsageForTenant(tenantId) {
    const regex = tenantRegex(tenantId);
    const tenantFilter = { tenantId: regex };
    const centerFilter = { tenantName: regex };
    const collections = await Promise.all([
        estimateCollectionBytes(Student_1.default, tenantFilter),
        estimateCollectionBytes(Lead_1.default, tenantFilter),
        estimateCollectionBytes(Batch_1.default, tenantFilter),
        estimateCollectionBytes(Course_1.default, tenantFilter),
        estimateCollectionBytes(Attendance_1.default, tenantFilter),
        estimateCollectionBytes(Campaign_1.default, tenantFilter),
        estimateCollectionBytes(User_1.default, tenantFilter),
        estimateCollectionBytes(Trainer_1.default, tenantFilter),
        estimateCollectionBytes(Center_1.default, centerFilter),
    ]);
    const documents = collections.reduce((sum, item) => sum + item.count, 0);
    const bytes = collections.reduce((sum, item) => sum + item.bytes, 0);
    return { documents, bytes, bytesLabel: (0, formatBytes_1.formatBytes)(bytes) };
}
async function getTenantUsageSnapshot() {
    const centers = await Center_1.default.find().sort({ tenantName: 1, name: 1 }).lean();
    const tenantMap = new Map();
    for (const center of centers) {
        const tenantId = normalizeTenantId(center.tenantName);
        const existing = tenantMap.get(tenantId.toLowerCase());
        if (existing) {
            existing.centerCount += 1;
            existing.centerNames.push(center.name);
            if (center.status === 'active')
                existing.status = 'active';
        }
        else {
            tenantMap.set(tenantId.toLowerCase(), {
                tenantId,
                tenantName: center.tenantName || tenantId,
                centerCount: 1,
                centerNames: [center.name],
                status: center.status || 'active',
            });
        }
    }
    if (tenantMap.size === 0) {
        tenantMap.set('erp', {
            tenantId: 'ERP',
            tenantName: 'ERP',
            centerCount: 0,
            centerNames: [],
            status: 'active',
        });
    }
    const usageDocs = await TenantUsage_1.default.find().lean();
    const usageByTenant = new Map(usageDocs.map((doc) => [normalizeTenantId(doc.tenantId).toLowerCase(), doc]));
    const institutions = await Promise.all(Array.from(tenantMap.values()).map(async (tenant) => {
        const key = tenant.tenantId.toLowerCase();
        const tracked = usageByTenant.get(key);
        const mongo = await estimateMongoUsageForTenant(tenant.tenantId);
        if (tracked && !tracked.tenantName) {
            await TenantUsage_1.default.updateOne({ tenantId: tracked.tenantId }, { tenantName: tenant.tenantName });
        }
        return {
            tenantId: tenant.tenantId,
            tenantName: tenant.tenantName,
            centerCount: tenant.centerCount,
            centerNames: tenant.centerNames,
            status: tenant.status,
            cloudinary: {
                bytes: tracked?.cloudinaryBytes || 0,
                bytesLabel: (0, formatBytes_1.formatBytes)(tracked?.cloudinaryBytes || 0),
                files: tracked?.cloudinaryFiles || 0,
                lastUploadAt: tracked?.lastCloudinaryUploadAt || null,
            },
            mongo: {
                bytes: mongo.bytes,
                bytesLabel: mongo.bytesLabel,
                documents: mongo.documents,
            },
            ai: {
                promptTokens: tracked?.aiPromptTokens || 0,
                completionTokens: tracked?.aiCompletionTokens || 0,
                totalTokens: tracked?.aiTotalTokens || 0,
                requests: tracked?.aiRequests || 0,
                lastUsedAt: tracked?.lastAiUsageAt || null,
            },
        };
    }));
    institutions.sort((a, b) => b.ai.totalTokens - a.ai.totalTokens || b.mongo.bytes - a.mongo.bytes);
    const totals = institutions.reduce((acc, row) => {
        acc.cloudinaryBytes += row.cloudinary.bytes;
        acc.cloudinaryFiles += row.cloudinary.files;
        acc.mongoBytes += row.mongo.bytes;
        acc.mongoDocuments += row.mongo.documents;
        acc.aiTotalTokens += row.ai.totalTokens;
        acc.aiRequests += row.ai.requests;
        return acc;
    }, {
        cloudinaryBytes: 0,
        cloudinaryFiles: 0,
        mongoBytes: 0,
        mongoDocuments: 0,
        aiTotalTokens: 0,
        aiRequests: 0,
    });
    return {
        institutions,
        totals: {
            ...totals,
            cloudinaryBytesLabel: (0, formatBytes_1.formatBytes)(totals.cloudinaryBytes),
            mongoBytesLabel: (0, formatBytes_1.formatBytes)(totals.mongoBytes),
        },
    };
}
