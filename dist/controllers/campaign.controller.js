"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCampaignTemplate = exports.getCampaignTemplates = exports.duplicateCampaign = exports.deleteCampaign = exports.updateCampaign = exports.createCampaign = exports.getCampaignStats = exports.getCampaigns = exports.getAudienceEstimate = exports.getCampaignById = void 0;
const Campaign_1 = __importDefault(require("../models/Campaign"));
const CampaignTemplate_1 = __importDefault(require("../models/CampaignTemplate"));
const Lead_1 = __importDefault(require("../models/Lead"));
const Student_1 = __importDefault(require("../models/Student"));
const Trainer_1 = __importDefault(require("../models/Trainer"));
const campaign_service_1 = require("../services/campaign.service");
function tenantFilter(req) {
    const filter = {};
    if (req.user?.tenantId && req.user.role !== 'super_admin') {
        filter.tenantId = req.user.tenantId;
    }
    return filter;
}
function formatCampaign(c) {
    const obj = c.toObject ? c.toObject() : c;
    return {
        ...obj,
        id: obj._id,
        createdAt: obj.createdAt,
    };
}
async function estimateAudienceCount(audience, tenantId) {
    const tenantFilter = tenantId ? { tenantId } : {};
    switch (audience) {
        case 'all_students':
        case 'active_students':
            return Student_1.default.countDocuments({
                ...tenantFilter,
                ...(audience === 'active_students' ? { status: 'active' } : {}),
            });
        case 'trainers':
            return Trainer_1.default.countDocuments(tenantFilter);
        case 'defaulters':
            return Student_1.default.countDocuments({ ...tenantFilter, status: 'active' });
        case 'all_leads':
        default:
            return Lead_1.default.countDocuments({
                ...tenantFilter,
                stage: { $nin: ['converted', 'lost'] },
            });
    }
}
const getCampaignById = async (req, res) => {
    try {
        const campaign = await Campaign_1.default.findById(req.params.id);
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        if (req.user?.tenantId && req.user.role !== 'super_admin' && campaign.tenantId !== req.user.tenantId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        res.status(200).json(formatCampaign(campaign));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching campaign', error });
    }
};
exports.getCampaignById = getCampaignById;
const getAudienceEstimate = async (req, res) => {
    try {
        const audience = String(req.query.audience || 'all_leads');
        const tenantId = req.user?.tenantId || 'ERP';
        const count = await estimateAudienceCount(audience, tenantId);
        res.status(200).json({ audience, count });
    }
    catch (error) {
        res.status(500).json({ message: 'Error estimating audience', error });
    }
};
exports.getAudienceEstimate = getAudienceEstimate;
const getCampaigns = async (req, res) => {
    try {
        const campaigns = await Campaign_1.default.find(tenantFilter(req)).sort({ createdAt: -1 });
        res.status(200).json(campaigns.map(formatCampaign));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching campaigns', error });
    }
};
exports.getCampaigns = getCampaigns;
const getCampaignStats = async (req, res) => {
    try {
        const campaigns = await Campaign_1.default.find(tenantFilter(req));
        const totalCampaigns = campaigns.length;
        const totalReached = campaigns.reduce((sum, c) => sum + (c.recipientCount || 0), 0);
        const withRates = campaigns.filter(c => c.openRate != null && c.status !== 'Draft' && c.status !== 'Scheduled');
        const avgOpenRate = withRates.length
            ? Math.round(withRates.reduce((sum, c) => sum + (c.openRate || 0), 0) / withRates.length)
            : 0;
        const scheduled = campaigns.filter(c => c.status === 'Scheduled').length;
        res.status(200).json({ totalCampaigns, totalReached, avgOpenRate, scheduled });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching campaign stats', error });
    }
};
exports.getCampaignStats = getCampaignStats;
const createCampaign = async (req, res) => {
    try {
        const data = { ...req.body };
        data.tenantId = data.tenantId || req.user?.tenantId || 'ERP';
        if (data.status === 'Active' || data.status === 'Completed') {
            data.recipientCount = await estimateAudienceCount(data.audience || 'all_leads', data.tenantId);
            data.sentAt = data.sentAt || new Date();
            if (data.openRate == null) {
                data.openRate = Math.floor(Math.random() * 30) + 35;
                data.clickRate = Math.floor(Math.random() * 15) + 5;
            }
        }
        if (data.status === 'Scheduled' && !data.scheduledAt) {
            data.scheduledAt = new Date(Date.now() + 86400000);
        }
        const campaign = new Campaign_1.default(data);
        await campaign.save();
        if (campaign.status === 'Active') {
            void (0, campaign_service_1.sendCampaignEmails)(String(campaign._id));
        }
        res.status(201).json(formatCampaign(campaign));
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating campaign', error });
    }
};
exports.createCampaign = createCampaign;
const updateCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };
        if (updateData.status === 'Active' && !updateData.sentAt) {
            const existing = await Campaign_1.default.findById(id);
            if (existing && !existing.sentAt) {
                updateData.recipientCount = await estimateAudienceCount(updateData.audience || existing.audience, existing.tenantId);
                updateData.sentAt = new Date();
                if (updateData.openRate == null) {
                    updateData.openRate = Math.floor(Math.random() * 30) + 35;
                    updateData.clickRate = Math.floor(Math.random() * 15) + 5;
                }
            }
        }
        const campaign = await Campaign_1.default.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        if (campaign.status === 'Active') {
            void (0, campaign_service_1.sendCampaignEmails)(String(campaign._id));
        }
        res.status(200).json(formatCampaign(campaign));
    }
    catch (error) {
        res.status(500).json({ message: 'Error updating campaign', error });
    }
};
exports.updateCampaign = updateCampaign;
const deleteCampaign = async (req, res) => {
    try {
        const { id } = req.params;
        const campaign = await Campaign_1.default.findByIdAndDelete(id);
        if (!campaign) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        res.status(200).json({ message: 'Campaign deleted successfully', id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error deleting campaign', error });
    }
};
exports.deleteCampaign = deleteCampaign;
const duplicateCampaign = async (req, res) => {
    try {
        const original = await Campaign_1.default.findById(req.params.id);
        if (!original) {
            return res.status(404).json({ message: 'Campaign not found' });
        }
        const copy = new Campaign_1.default({
            tenantId: original.tenantId,
            name: `${original.name} (Copy)`,
            channel: original.channel,
            status: 'Draft',
            audience: original.audience,
            subject: original.subject,
            body: original.body,
            recipientCount: 0,
            templateId: original.templateId,
        });
        await copy.save();
        res.status(201).json(formatCampaign(copy));
    }
    catch (error) {
        res.status(500).json({ message: 'Error duplicating campaign', error });
    }
};
exports.duplicateCampaign = duplicateCampaign;
const getCampaignTemplates = async (req, res) => {
    try {
        const templates = await CampaignTemplate_1.default.find(tenantFilter(req)).sort({ createdAt: -1 });
        res.status(200).json(templates.map(t => ({ ...t.toObject(), id: t._id })));
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching templates', error });
    }
};
exports.getCampaignTemplates = getCampaignTemplates;
const createCampaignTemplate = async (req, res) => {
    try {
        const data = { ...req.body };
        if (req.user?.tenantId && !data.tenantId) {
            data.tenantId = req.user.tenantId;
        }
        const template = new CampaignTemplate_1.default(data);
        await template.save();
        res.status(201).json({ ...template.toObject(), id: template._id });
    }
    catch (error) {
        res.status(500).json({ message: 'Error creating template', error });
    }
};
exports.createCampaignTemplate = createCampaignTemplate;
