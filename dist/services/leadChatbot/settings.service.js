"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLeadChatbotGlobalSettings = getLeadChatbotGlobalSettings;
exports.updateLeadChatbotGlobalSettings = updateLeadChatbotGlobalSettings;
exports.isGlobalAutoReplyEnabled = isGlobalAutoReplyEnabled;
exports.isGlobalFollowUpsEnabled = isGlobalFollowUpsEnabled;
const Center_1 = __importDefault(require("../../models/Center"));
const centerPolicy_1 = require("../../utils/centerPolicy");
async function resolveCenter(tenantId) {
    if (tenantId?.trim()) {
        const byTenant = await (0, centerPolicy_1.getCenterByTenant)(tenantId);
        if (byTenant)
            return byTenant;
    }
    return Center_1.default.findOne({ status: 'active' }).sort({ updatedAt: -1 });
}
async function getLeadChatbotGlobalSettings(tenantId) {
    const center = await resolveCenter(tenantId);
    return {
        autoReplyEnabled: center?.leadAutoReplyEnabled !== false,
        followUpsEnabled: center?.leadFollowUpsEnabled !== false,
        tenantId: tenantId || (center?.tenantName ?? null),
        centerId: center ? String(center._id) : null,
        centerName: center?.name || null,
    };
}
async function updateLeadChatbotGlobalSettings(tenantId, patch) {
    const center = await resolveCenter(tenantId);
    if (!center) {
        throw new Error('No center found to save chatbot settings');
    }
    if (typeof patch.autoReplyEnabled === 'boolean') {
        center.leadAutoReplyEnabled = patch.autoReplyEnabled;
    }
    if (typeof patch.followUpsEnabled === 'boolean') {
        center.leadFollowUpsEnabled = patch.followUpsEnabled;
    }
    await center.save();
    return {
        autoReplyEnabled: center.leadAutoReplyEnabled !== false,
        followUpsEnabled: center.leadFollowUpsEnabled !== false,
        tenantId: tenantId || center.tenantName || null,
        centerId: String(center._id),
        centerName: center.name || null,
    };
}
async function isGlobalAutoReplyEnabled(tenantId) {
    const settings = await getLeadChatbotGlobalSettings(tenantId);
    return settings.autoReplyEnabled;
}
async function isGlobalFollowUpsEnabled(tenantId) {
    const settings = await getLeadChatbotGlobalSettings(tenantId);
    return settings.followUpsEnabled;
}
