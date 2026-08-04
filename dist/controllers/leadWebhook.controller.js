"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.revealLeadIntegrationKey = exports.deleteLeadIntegration = exports.rotateLeadIntegrationKey = exports.updateLeadIntegration = exports.createLeadIntegration = exports.listLeadIntegrations = exports.receiveLeadWebhook = void 0;
const LeadWebhookIntegration_1 = __importDefault(require("../models/LeadWebhookIntegration"));
const bdeStats_1 = require("../utils/bdeStats");
const leadWebhook_service_1 = require("../services/leadWebhook.service");
function paramId(value) {
    return Array.isArray(value) ? value[0] : value || '';
}
function resolveTenantId(req) {
    return req.user?.tenantId || 'ERP';
}
function extractApiKey(req) {
    const header = req.header('x-api-key') ||
        req.header('X-API-Key') ||
        (req.headers.authorization?.toLowerCase().startsWith('bearer ')
            ? req.headers.authorization.slice(7)
            : '');
    const queryKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : '';
    const bodyKey = req.body && typeof req.body === 'object' && typeof req.body.apiKey === 'string'
        ? req.body.apiKey
        : '';
    return String(header || queryKey || bodyKey || '').trim();
}
/** Public webhook — no JWT */
const receiveLeadWebhook = async (req, res) => {
    try {
        const auth = await (0, leadWebhook_service_1.authenticateIntegration)(extractApiKey(req));
        if (!auth.ok) {
            return res.status(auth.status).json({ success: false, message: auth.message });
        }
        const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
            ? req.body
            : {};
        const result = await (0, leadWebhook_service_1.createLeadFromWebhook)(auth.integration, body);
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }
        return res.status(result.created ? 201 : 200).json({
            success: true,
            created: result.created,
            leadId: result.leadId,
            source: result.source,
            message: result.created ? 'Lead created' : result.message || 'Lead already exists',
        });
    }
    catch (error) {
        console.error('[LeadWebhook] Error:', error);
        return res.status(500).json({
            success: false,
            message: error?.message || 'Failed to process lead webhook',
        });
    }
};
exports.receiveLeadWebhook = receiveLeadWebhook;
const listLeadIntegrations = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const filter = {};
        if (req.user?.role !== 'super_admin' || req.user?.tenantId) {
            filter.tenantId = (0, bdeStats_1.tenantFilter)(tenantId);
        }
        const items = await LeadWebhookIntegration_1.default.find(filter).sort({ createdAt: -1 });
        res.json(items.map((item) => (0, leadWebhook_service_1.serializeIntegration)(item)));
    }
    catch (error) {
        res.status(500).json({ message: error?.message || 'Error listing integrations' });
    }
};
exports.listLeadIntegrations = listLeadIntegrations;
const createLeadIntegration = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const { name, source, defaultCourse, assignedBdeId, counsellor, } = req.body;
        if (!name?.trim() || !source?.trim()) {
            return res.status(400).json({ message: 'name and source are required' });
        }
        const apiKey = (0, leadWebhook_service_1.generateIntegrationApiKey)(source, tenantId);
        const created = await LeadWebhookIntegration_1.default.create({
            tenantId,
            name: name.trim(),
            source: source.trim(),
            apiKey,
            isActive: true,
            defaultCourse: defaultCourse?.trim() || 'General Enquiry',
            assignedBdeId: assignedBdeId || '',
            counsellor: counsellor || '',
            createdBy: req.user?.id || '',
        });
        res.status(201).json({
            success: true,
            integration: (0, leadWebhook_service_1.serializeIntegration)(created, { revealKey: true }),
            message: 'Integration created. Copy the API key now — it is shown in full only once.',
        });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error creating integration' });
    }
};
exports.createLeadIntegration = createLeadIntegration;
const updateLeadIntegration = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const id = paramId(req.params.id);
        const integration = await LeadWebhookIntegration_1.default.findOne({
            _id: id,
            ...(req.user?.role === 'super_admin' && !req.user?.tenantId
                ? {}
                : { tenantId: (0, bdeStats_1.tenantFilter)(tenantId) }),
        });
        if (!integration)
            return res.status(404).json({ message: 'Integration not found' });
        const { name, source, defaultCourse, assignedBdeId, counsellor, isActive, } = req.body;
        if (typeof name === 'string' && name.trim())
            integration.name = name.trim();
        if (typeof source === 'string' && source.trim())
            integration.source = source.trim();
        if (typeof defaultCourse === 'string') {
            integration.defaultCourse = defaultCourse.trim() || 'General Enquiry';
        }
        if (typeof assignedBdeId === 'string')
            integration.assignedBdeId = assignedBdeId;
        if (typeof counsellor === 'string')
            integration.counsellor = counsellor;
        if (typeof isActive === 'boolean')
            integration.isActive = isActive;
        await integration.save();
        res.json({ success: true, integration: (0, leadWebhook_service_1.serializeIntegration)(integration) });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error updating integration' });
    }
};
exports.updateLeadIntegration = updateLeadIntegration;
const rotateLeadIntegrationKey = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const id = paramId(req.params.id);
        const integration = await LeadWebhookIntegration_1.default.findOne({
            _id: id,
            ...(req.user?.role === 'super_admin' && !req.user?.tenantId
                ? {}
                : { tenantId: (0, bdeStats_1.tenantFilter)(tenantId) }),
        });
        if (!integration)
            return res.status(404).json({ message: 'Integration not found' });
        integration.apiKey = (0, leadWebhook_service_1.generateIntegrationApiKey)(integration.source, integration.tenantId);
        await integration.save();
        res.json({
            success: true,
            integration: (0, leadWebhook_service_1.serializeIntegration)(integration, { revealKey: true }),
            message: 'API key rotated. Copy the new key now.',
        });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error rotating API key' });
    }
};
exports.rotateLeadIntegrationKey = rotateLeadIntegrationKey;
const deleteLeadIntegration = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const id = paramId(req.params.id);
        const integration = await LeadWebhookIntegration_1.default.findOne({
            _id: id,
            ...(req.user?.role === 'super_admin' && !req.user?.tenantId
                ? {}
                : { tenantId: (0, bdeStats_1.tenantFilter)(tenantId) }),
        });
        if (!integration)
            return res.status(404).json({ message: 'Integration not found' });
        // Soft-disable by default; hard delete if ?hard=true
        if (String(req.query.hard || '') === 'true') {
            await integration.deleteOne();
            return res.json({ success: true, deleted: true });
        }
        integration.isActive = false;
        await integration.save();
        res.json({ success: true, integration: (0, leadWebhook_service_1.serializeIntegration)(integration) });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error deleting integration' });
    }
};
exports.deleteLeadIntegration = deleteLeadIntegration;
const revealLeadIntegrationKey = async (req, res) => {
    try {
        const tenantId = resolveTenantId(req);
        const id = paramId(req.params.id);
        const integration = await LeadWebhookIntegration_1.default.findOne({
            _id: id,
            ...(req.user?.role === 'super_admin' && !req.user?.tenantId
                ? {}
                : { tenantId: (0, bdeStats_1.tenantFilter)(tenantId) }),
        });
        if (!integration)
            return res.status(404).json({ message: 'Integration not found' });
        res.json({
            success: true,
            integration: (0, leadWebhook_service_1.serializeIntegration)(integration, { revealKey: true }),
        });
    }
    catch (error) {
        res.status(400).json({ message: error?.message || 'Error revealing API key' });
    }
};
exports.revealLeadIntegrationKey = revealLeadIntegrationKey;
