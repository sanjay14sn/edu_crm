import { google, gmail_v1 } from 'googleapis';
import Center from '../../models/Center';

export type GmailMessage = {
  messageId: string;
  threadId: string;
  subject: string;
  body: string;
  snippet: string;
  from: string;
  fromEmail: string;
  fromName: string;
  date: Date;
};

/** Pause Gmail API calls after auth failures (invalid_grant) to avoid log spam. */
const AUTH_COOLDOWN_MS = Number(process.env.GMAIL_AUTH_COOLDOWN_MS || 30 * 60 * 1000);

let authBlockedUntil = 0;
let lastAuthError = '';
let authFailureLogged = false;

export function isGmailAuthHealthy() {
  return Date.now() >= authBlockedUntil;
}

export function getGmailAuthError() {
  if (isGmailAuthHealthy()) return '';
  return lastAuthError || 'Gmail OAuth unavailable';
}

export function clearGmailAuthCircuit() {
  authBlockedUntil = 0;
  lastAuthError = '';
  authFailureLogged = false;
}

function isAuthFailure(err: any) {
  const msg = String(err?.message || err?.response?.data?.error || err || '');
  const code = String(err?.code || err?.response?.data?.error || '');
  return (
    /invalid_grant|invalid_client|unauthorized|401|403|token.*(expired|revoked)|login required/i.test(
      msg
    ) || /invalid_grant|invalid_client/i.test(code)
  );
}

function tripAuthCircuit(err: any) {
  const msg = String(err?.message || err || 'Gmail auth failed');
  lastAuthError = msg;
  authBlockedUntil = Date.now() + AUTH_COOLDOWN_MS;
  if (!authFailureLogged) {
    authFailureLogged = true;
    const mins = Math.round(AUTH_COOLDOWN_MS / 60000);
    console.warn(
      `[LeadChatbot] Gmail OAuth broken (${msg}). Pausing Gmail polls for ${mins}m. ` +
        `Reconnect Google refresh token in .env (GOOGLE_REFRESH_TOKEN) or Center config, then restart.`
    );
  }
}

async function getGoogleOAuthConfig(tenantId?: string) {
  let center = null;
  if (tenantId) {
    center = await Center.findOne({
      $or: [
        { tenantName: tenantId },
        { name: tenantId }
      ]
    });
  }

  const clientId = center?.googleClientId || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = center?.googleClientSecret || process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = center?.googleRedirectUri || process.env.GOOGLE_REDIRECT_URI || '';
  const refreshToken = center?.googleRefreshToken || process.env.GOOGLE_REFRESH_TOKEN;

  return {
    clientId,
    clientSecret,
    redirectUri,
    refreshToken,
  };
}

async function createOAuthClient(tenantId?: string) {
  const cfg = await getGoogleOAuthConfig(tenantId);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required in .env or Center settings');
  }
  const redirectUri =
    cfg.redirectUri ||
    `http://localhost:${process.env.PORT || 5002}/auth/google/callback`;
  return new google.auth.OAuth2(cfg.clientId, cfg.clientSecret, redirectUri);
}

export async function isGmailOAuthConfigured(tenantId?: string) {
  const cfg = await getGoogleOAuthConfig(tenantId);
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.refreshToken);
}

export async function getGmailClient(tenantId?: string) {
  if (!(await isGmailOAuthConfigured(tenantId))) {
    throw new Error('Gmail OAuth not configured');
  }
  if (!isGmailAuthHealthy()) {
    throw new Error(getGmailAuthError() || 'Gmail OAuth paused after invalid_grant');
  }

  const oauth2 = await createOAuthClient(tenantId);
  const cfg = await getGoogleOAuthConfig(tenantId);
  oauth2.setCredentials({ refresh_token: cfg.refreshToken });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

export async function getGmailStatus(tenantId?: string) {
  let center = null;
  if (tenantId) {
    center = await Center.findOne({
      $or: [
        { tenantName: tenantId },
        { name: tenantId }
      ]
    });
  }

  const mailUser = center?.mailUsername || process.env.MAIL_USERNAME || '';
  const mailPass = center?.mailPassword || process.env.MAIL_PASSWORD || '';
  const oAuthConfigured = await isGmailOAuthConfigured(tenantId);

  return {
    connected: oAuthConfigured && isGmailAuthHealthy(),
    configured: oAuthConfigured,
    authHealthy: isGmailAuthHealthy(),
    authError: getGmailAuthError() || undefined,
    accountEmail: mailUser,
    mailConfigured: Boolean(mailUser && mailPass),
  };
}

function extractPlainBody(payload?: gmail_v1.Schema$MessagePart): string {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  for (const part of payload.parts || []) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      return Buffer.from(part.body.data, 'base64').toString('utf8');
    }
  }
  for (const part of payload.parts || []) {
    const nested = extractPlainBody(part);
    if (nested) return nested;
  }
  return '';
}

export function cleanReplyBody(text = '') {
  const lines = text.split('\n');
  const cleaned: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (/^On .+ wrote:/i.test(t)) break;
    if (/^On (Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+\d/i.test(t)) break;
    if (/^wrote:$/i.test(t)) break;
    if (/^>/.test(line)) break;
    if (/^From:/i.test(t)) break;
    if (/^Sent:/i.test(t)) break;
    cleaned.push(line);
  }
  return cleaned.join('\n').trim();
}

function parseFromHeader(from = '') {
  const match = from.match(/^(?:"?([^"]*)"?\s)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    return {
      fromName: (match[1] || '').trim() || match[2].split('@')[0],
      fromEmail: match[2].trim().toLowerCase(),
    };
  }
  const email = from.trim().toLowerCase();
  return { fromName: email.split('@')[0] || 'Lead', fromEmail: email };
}

async function hydrateMessage(
  gmail: gmail_v1.Gmail,
  id: string
): Promise<GmailMessage | null> {
  const full = await gmail.users.messages.get({
    userId: 'me',
    id,
    format: 'full',
  });
  const headers = full.data.payload?.headers || [];
  const get = (name: string) =>
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

  const from = get('From');
  const { fromName, fromEmail } = parseFromHeader(from);
  const rawBody = extractPlainBody(full.data.payload || undefined);
  const body = cleanReplyBody(rawBody) || rawBody.trim().slice(0, 2000);

  return {
    messageId: full.data.id || id,
    threadId: full.data.threadId || '',
    subject: get('Subject'),
    body,
    snippet: full.data.snippet || body.slice(0, 200),
    from,
    fromEmail,
    fromName,
    date: new Date(Number(full.data.internalDate || Date.now())),
  };
}

async function withGmailAuth<T>(fn: () => Promise<T>): Promise<T> {
  if (!isGmailAuthHealthy()) {
    throw new Error(getGmailAuthError() || 'Gmail OAuth paused after invalid_grant');
  }
  try {
    return await fn();
  } catch (err: any) {
    if (isAuthFailure(err)) {
      tripAuthCircuit(err);
    }
    throw err;
  }
}

export async function fetchLatestFromLead(
  leadEmail: string,
  afterDate: Date,
  tenantId?: string
): Promise<GmailMessage | null> {
  return withGmailAuth(async () => {
    const gmail = await getGmailClient(tenantId);
    const after = `${afterDate.getFullYear()}/${afterDate.getMonth() + 1}/${afterDate.getDate()}`;
    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `from:${leadEmail} after:${after} in:inbox`,
      maxResults: 1,
    });
    const msg = list.data.messages?.[0];
    if (!msg?.id) return null;
    return hydrateMessage(gmail, msg.id);
  });
}

/**
 * Fetch recent inbox messages that look like new student inquiries
 * (not replies to our own outbound threads).
 */
export async function fetchRecentInquiryEmails(opts?: {
  maxResults?: number;
  newerThanDays?: number;
  tenantId?: string;
}): Promise<GmailMessage[]> {
  return withGmailAuth(async () => {
    const gmail = await getGmailClient(opts?.tenantId);
    const days = opts?.newerThanDays ?? 2;
    const maxResults = opts?.maxResults ?? 15;

    let center = null;
    if (opts?.tenantId) {
      center = await Center.findOne({
        $or: [
          { tenantName: opts.tenantId },
          { name: opts.tenantId }
        ]
      });
    }
    const own = (center?.mailUsername || process.env.MAIL_USERNAME || '').toLowerCase();

    const list = await gmail.users.messages.list({
      userId: 'me',
      q: `in:inbox newer_than:${days}d -from:me`,
      maxResults,
    });

    const results: GmailMessage[] = [];
    for (const item of list.data.messages || []) {
      if (!item.id) continue;
      const msg = await hydrateMessage(gmail, item.id);
      if (!msg) continue;
      if (own && msg.fromEmail === own) continue;
      const subj = msg.subject.toLowerCase();
      const isReply = subj.startsWith('re:');
      const looksLikeInquiry =
        /enquiry|inquiry|admission|course|demo|fees?|join|interested|register|lead/i.test(
          `${msg.subject} ${msg.body}`
        );
      if (isReply && !looksLikeInquiry) continue;
      results.push(msg);
    }
    return results;
  });
}
