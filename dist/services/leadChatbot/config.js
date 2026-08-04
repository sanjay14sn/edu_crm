"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGmailReady = isGmailReady;
exports.isInboundEnabled = isInboundEnabled;
exports.chatbotRuntimeStatus = chatbotRuntimeStatus;
const gmail_service_1 = require("./gmail.service");
const mail_service_1 = require("./mail.service");
async function isGmailReady(tenantId) {
    return (await (0, gmail_service_1.isGmailOAuthConfigured)(tenantId)) && (0, gmail_service_1.isGmailAuthHealthy)();
}
async function isInboundEnabled(tenantId) {
    return (await (0, mail_service_1.isInboundEnabled)(tenantId)) && (await isGmailReady(tenantId));
}
async function chatbotRuntimeStatus(tenantId) {
    return {
        enabled: await (0, mail_service_1.isLeadChatbotEnabled)(tenantId),
        mailConfigured: await (0, mail_service_1.isMailConfigured)(tenantId),
        gmailConnected: await isGmailReady(tenantId),
        gmailConfigured: await (0, gmail_service_1.isGmailOAuthConfigured)(tenantId),
        gmailAuthError: (0, gmail_service_1.getGmailAuthError)() || undefined,
        inboundEnabled: await isInboundEnabled(tenantId),
    };
}
