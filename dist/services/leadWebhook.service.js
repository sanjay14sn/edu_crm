"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateIntegrationApiKey = generateIntegrationApiKey;
exports.maskApiKey = maskApiKey;
exports.authenticateIntegration = authenticateIntegration;
exports.normalizeLeadPayload = normalizeLeadPayload;
exports.createLeadFromWebhook = createLeadFromWebhook;
exports.serializeIntegration = serializeIntegration;
const crypto_1 = __importDefault(require("crypto"));
const Lead_1 = __importDefault(require("../models/Lead"));
const LeadWebhookIntegration_1 = __importDefault(require("../models/LeadWebhookIntegration"));
const bdeStats_1 = require("../utils/bdeStats");
const outreach_service_1 = require("./leadChatbot/outreach.service");
function pickString(body, keys) {
    for (const key of keys) {
        const value = body[key];
        if (typeof value === 'string' && value.trim())
            return value.trim();
        if (typeof value === 'number' && Number.isFinite(value))
            return String(value);
    }
    return '';
}
function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 16) || 'tenant';
}
function sourcePrefix(source) {
    const map = {
        website: 'web',
        facebook: 'fb',
        instagram: 'insta',
        justdial: 'jd',
        email: 'email',
        whatsapp: 'wa',
        google: 'google',
    };
    const key = source.trim().toLowerCase();
    return map[key] || key.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'src';
}
function generateIntegrationApiKey(source, tenantId) {
    const prefix = sourcePrefix(source);
    const tenant = slugify(tenantId);
    const random = crypto_1.default.randomBytes(8).toString('hex');
    return `${prefix}_${tenant}_${random}`;
}
function maskApiKey(apiKey) {
    if (!apiKey || apiKey.length < 8)
        return '****';
    return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
async function authenticateIntegration(apiKey) {
    const key = String(apiKey || '').trim();
    if (!key) {
        return { ok: false, status: 401, message: 'Missing API key. Send X-API-Key header.' };
    }
    const integration = await LeadWebhookIntegration_1.default.findOne({ apiKey: key });
    if (!integration) {
        return { ok: false, status: 401, message: 'Invalid API key.' };
    }
    if (!integration.isActive) {
        return { ok: false, status: 403, message: 'Integration is disabled.' };
    }
    return { ok: true, integration };
}
function normalizeLeadPayload(body, integration) {
    const name = pickString(body, ['name', 'full_name', 'fullName', 'lead_name', 'contact_name']);
    let phone = pickString(body, [
        'phone',
        'mobile',
        'phone_number',
        'phoneNumber',
        'mobile_number',
        'contact',
    ]).replace(/[^\d+]/g, '');
    let email = pickString(body, ['email', 'email_address', 'emailAddress']).toLowerCase();
    const course = pickString(body, ['course', 'interest', 'product', 'service', 'enquiry']) ||
        integration.defaultCourse ||
        'General Enquiry';
    const city = pickString(body, ['city', 'location', 'town']) || undefined;
    const notes = pickString(body, ['notes', 'message', 'comment', 'description', 'remarks']) || undefined;
    const valueRaw = body.value ?? body.intake_value ?? body.amount;
    const value = typeof valueRaw === 'number' ? valueRaw : Number(valueRaw) || 0;
    if (!name) {
        return { ok: false, message: 'name is required' };
    }
    if (!phone && !email) {
        return { ok: false, message: 'phone or email is required' };
    }
    if (!phone)
        phone = '0000000000';
    if (!email) {
        const digits = phone.replace(/\D/g, '').slice(-12) || 'unknown';
        email = `lead+${digits}@noreply.local`;
    }
    return {
        ok: true,
        data: { name, phone, email, course, city, notes, value },
    };
}
async function findDuplicateLead(tenantId, email, phone) {
    const or = [];
    if (email && !email.endsWith('@noreply.local')) {
        or.push({
            email: { $regex: new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        });
    }
    if (phone && phone !== '0000000000') {
        const digits = phone.replace(/\D/g, '');
        if (digits.length >= 8) {
            or.push({ phone: { $regex: new RegExp(`${digits.slice(-10)}$`) } });
        }
    }
    if (!or.length)
        return null;
    return Lead_1.default.findOne({
        tenantId: (0, bdeStats_1.tenantFilter)(tenantId),
        $or: or,
    }).sort({ createdAt: -1 });
}
async function createLeadFromWebhook(integration, body) {
    const normalized = normalizeLeadPayload(body, integration);
    if (!normalized.ok) {
        return { ok: false, status: 400, message: normalized.message };
    }
    const data = normalized.data;
    const existing = await findDuplicateLead(integration.tenantId, data.email, data.phone);
    if (existing) {
        integration.lastUsedAt = new Date();
        integration.requestCount = (integration.requestCount || 0) + 1;
        await integration.save();
        return {
            ok: true,
            created: false,
            leadId: String(existing._id),
            source: integration.source,
            message: 'Lead already exists',
        };
    }
    const noteText = data.notes
        ? `Webhook (${integration.source}): ${data.notes}`
        : `Lead received via ${integration.name} (${integration.source})`;
    const lead = await Lead_1.default.create({
        tenantId: integration.tenantId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        course: data.course,
        stage: 'new',
        value: data.value || 0,
        city: data.city,
        source: integration.source,
        priority: 'medium',
        assignedBdeId: integration.assignedBdeId || undefined,
        counsellor: integration.counsellor || undefined,
        chatbotEnabled: true,
        autoReplyEnabled: true,
        followUpsEnabled: true,
        notes: [{ text: noteText, date: new Date().toISOString() }],
    });
    integration.lastUsedAt = new Date();
    integration.requestCount = (integration.requestCount || 0) + 1;
    await integration.save();
    (0, outreach_service_1.queueOutreachForLead)(String(lead._id));
    return {
        ok: true,
        created: true,
        leadId: String(lead._id),
        source: integration.source,
    };
}
function serializeIntegration(doc, opts) {
    const obj = doc.toObject();
    return {
        id: String(doc._id),
        tenantId: obj.tenantId,
        name: obj.name,
        source: obj.source,
        apiKey: opts?.revealKey ? obj.apiKey : maskApiKey(obj.apiKey),
        apiKeyFull: opts?.revealKey ? obj.apiKey : undefined,
        isActive: obj.isActive !== false,
        defaultCourse: obj.defaultCourse || 'General Enquiry',
        assignedBdeId: obj.assignedBdeId || '',
        counsellor: obj.counsellor || '',
        createdBy: obj.createdBy || '',
        lastUsedAt: obj.lastUsedAt || null,
        requestCount: obj.requestCount || 0,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
    };
}
