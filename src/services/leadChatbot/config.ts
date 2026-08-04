import {
  getGmailAuthError,
  isGmailAuthHealthy,
  isGmailOAuthConfigured,
} from './gmail.service';
import {
  isInboundEnabled as inboundFlag,
  isLeadChatbotEnabled,
  isMailConfigured,
} from './mail.service';

export async function isGmailReady(tenantId?: string) {
  return (await isGmailOAuthConfigured(tenantId)) && isGmailAuthHealthy();
}

export async function isInboundEnabled(tenantId?: string) {
  return (await inboundFlag(tenantId)) && (await isGmailReady(tenantId));
}

export async function chatbotRuntimeStatus(tenantId?: string) {
  return {
    enabled: await isLeadChatbotEnabled(tenantId),
    mailConfigured: await isMailConfigured(tenantId),
    gmailConnected: await isGmailReady(tenantId),
    gmailConfigured: await isGmailOAuthConfigured(tenantId),
    gmailAuthError: getGmailAuthError() || undefined,
    inboundEnabled: await isInboundEnabled(tenantId),
  };
}
