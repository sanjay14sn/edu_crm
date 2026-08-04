"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMailConfigured = isMailConfigured;
exports.sendLeadEmail = sendLeadEmail;
exports.textToHtml = textToHtml;
exports.isLeadChatbotEnabled = isLeadChatbotEnabled;
exports.isAutoOutreachEnabled = isAutoOutreachEnabled;
exports.isInboundEnabled = isInboundEnabled;
exports.isAutoAiReplyEnabled = isAutoAiReplyEnabled;
const nodemailer_1 = __importDefault(require("nodemailer"));
const Center_1 = __importDefault(require("../../models/Center"));
const transporters = {};
async function getMailConfig(tenantId) {
    let center = null;
    if (tenantId) {
        center = await Center_1.default.findOne({
            $or: [
                { tenantName: tenantId },
                { name: tenantId }
            ]
        });
    }
    const host = center?.mailHost || process.env.MAIL_HOST || 'smtp.gmail.com';
    const port = (center?.mailPort ?? Number(process.env.MAIL_PORT)) || 587;
    const secure = center?.mailSecure !== undefined ? center.mailSecure : (process.env.MAIL_SECURE === 'true');
    const user = center?.mailUsername || process.env.MAIL_USERNAME || '';
    const rawPass = center?.mailPassword || process.env.MAIL_PASSWORD || '';
    const password = rawPass.replace(/^["']|["']$/g, '').replace(/\s/g, '');
    const from = center?.mailFrom || process.env.MAIL_FROM || user || '';
    return {
        host,
        port,
        secure,
        auth: {
            user,
            pass: password,
        },
        from,
    };
}
async function isMailConfigured(tenantId) {
    const cfg = await getMailConfig(tenantId);
    return Boolean(cfg.auth.user && cfg.auth.pass && cfg.host);
}
async function getTransporter(tenantId) {
    const cfg = await getMailConfig(tenantId);
    if (!cfg.auth.user || !cfg.auth.pass) {
        throw new Error('Mail not configured. Set MAIL_USERNAME and MAIL_PASSWORD in .env or Center settings');
    }
    const cacheKey = `${cfg.host}:${cfg.port}:${cfg.auth.user}`;
    if (transporters[cacheKey])
        return transporters[cacheKey];
    transporters[cacheKey] = nodemailer_1.default.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.auth,
    });
    return transporters[cacheKey];
}
async function sendLeadEmail(opts) {
    if (!opts.to?.trim())
        throw new Error('Recipient email is required');
    if (!opts.subject?.trim())
        throw new Error('Email subject is required');
    if (!opts.text?.trim() && !opts.html?.trim())
        throw new Error('Email body is required');
    const cfg = await getMailConfig(opts.tenantId);
    const transport = await getTransporter(opts.tenantId);
    const info = await transport.sendMail({
        from: cfg.from,
        to: opts.to.trim(),
        subject: opts.subject.trim(),
        text: opts.text?.trim() || undefined,
        html: opts.html?.trim() || undefined,
    });
    console.log(`[LeadChatbot] Email sent → ${opts.to.trim()} | ${opts.subject.trim()} | ${info.messageId}`);
    return { messageId: info.messageId, accepted: info.accepted };
}
function textToHtml(text = '') {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');
}
async function isLeadChatbotEnabled(tenantId) {
    let center = null;
    if (tenantId) {
        center = await Center_1.default.findOne({
            $or: [
                { tenantName: tenantId },
                { name: tenantId }
            ]
        });
    }
    if (center?.leadChatbotEnabled !== undefined) {
        return center.leadChatbotEnabled;
    }
    return process.env.LEAD_CHATBOT_ENABLED !== 'false';
}
async function isAutoOutreachEnabled(tenantId) {
    const enabled = await isLeadChatbotEnabled(tenantId);
    if (!enabled)
        return false;
    let center = null;
    if (tenantId) {
        center = await Center_1.default.findOne({
            $or: [
                { tenantName: tenantId },
                { name: tenantId }
            ]
        });
    }
    const autoOutreach = center?.leadChatbotAutoOutreach !== undefined
        ? center.leadChatbotAutoOutreach
        : process.env.LEAD_CHATBOT_AUTO_OUTREACH !== 'false';
    const mailConfigured = await isMailConfigured(tenantId);
    return autoOutreach && mailConfigured;
}
async function isInboundEnabled(tenantId) {
    const enabled = await isLeadChatbotEnabled(tenantId);
    if (!enabled)
        return false;
    let center = null;
    if (tenantId) {
        center = await Center_1.default.findOne({
            $or: [
                { tenantName: tenantId },
                { name: tenantId }
            ]
        });
    }
    return center?.leadChatbotInboundEnabled !== undefined
        ? center.leadChatbotInboundEnabled
        : process.env.LEAD_CHATBOT_INBOUND_ENABLED !== 'false';
}
async function isAutoAiReplyEnabled(tenantId) {
    const enabled = await isLeadChatbotEnabled(tenantId);
    if (!enabled)
        return false;
    let center = null;
    if (tenantId) {
        center = await Center_1.default.findOne({
            $or: [
                { tenantName: tenantId },
                { name: tenantId }
            ]
        });
    }
    const autoReply = center?.autoAiReply !== undefined
        ? center.autoAiReply
        : process.env.AUTO_AI_REPLY !== 'false';
    const mailConfigured = await isMailConfigured(tenantId);
    return autoReply && mailConfigured;
}
