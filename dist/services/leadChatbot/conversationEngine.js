"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateOutreachEmail = generateOutreachEmail;
exports.generateReplyForLead = generateReplyForLead;
exports.sendGeneratedEmail = sendGeneratedEmail;
exports.mapIntentToStage = mapIntentToStage;
const knowledgeBase_1 = require("./knowledgeBase");
const promptBuilder_1 = require("./promptBuilder");
const mail_service_1 = require("./mail.service");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODELS = [
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ...(process.env.GEMINI_MODEL_FALLBACKS || 'gemini-2.5-flash-lite').split(','),
]
    .map((m) => m.trim())
    .filter(Boolean);
function extractJson(text) {
    const trimmed = text.trim();
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced?.[1]?.trim() || trimmed;
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
    }
    return JSON.parse(candidate);
}
let geminiKeyInvalidLogged = false;
async function callGemini(prompt) {
    if (!GEMINI_API_KEY)
        return null;
    for (const model of [...new Set(MODELS)]) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.45,
                        maxOutputTokens: 2048,
                        responseMimeType: 'application/json',
                    },
                }),
            });
            const data = await res.json();
            if (data?.error) {
                const msg = String(data.error.message || '');
                if (/api key not valid|invalid api key|api_key_invalid/i.test(msg)) {
                    if (!geminiKeyInvalidLogged) {
                        geminiKeyInvalidLogged = true;
                        console.warn(`[LeadChatbot] GEMINI_API_KEY is invalid. Using template emails until you set a valid key in .env.`);
                    }
                    return null; // don't retry every model with a bad key
                }
                console.warn(`[LeadChatbot] Gemini ${model}: ${msg}`);
                continue;
            }
            const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ||
                '';
            if (!text)
                continue;
            return extractJson(text);
        }
        catch (err) {
            console.warn(`[LeadChatbot] Gemini ${model} failed: ${err?.message || err}`);
        }
    }
    return null;
}
/** Force email sign-off to be center name only. */
function enforceCenterSignoff(body, centerName) {
    let text = String(body || '').trim();
    if (!text)
        return text;
    // Strip common wrong signatures and replace with center name only
    text = text
        .replace(/\n*(?:Best(?: regards)?|Regards|Thanks|Thank you)[,!]?\s*\n[\s\S]*$/i, '')
        .replace(/\n*(?:Admissions Team|Edu CRM(?: Training Center)?|Counsellor|Counselor)[^\n]*$/gim, '')
        .trim();
    return `${text}\n\nBest,\n${centerName}`;
}
function fallbackOutreach(lead, centerName) {
    const first = lead.name?.split(' ')[0] || 'there';
    return {
        subject: `Quick help with your ${lead.course} enquiry`,
        body: enforceCenterSignoff(`Hi ${first},\n\n` +
            `Thanks for your interest in ${lead.course} at ${centerName}. ` +
            `I'd love to understand your goals and share the right batch, demo options, and fee plans.\n\n` +
            `Would you prefer a short counseling call this week, or a course demo first?`, centerName),
    };
}
function fallbackReply(lead, incoming, centerName) {
    const first = lead.name?.split(' ')[0] || 'there';
    const lower = incoming.toLowerCase();
    let suggestedStage = 'contacted';
    let intents = ['general'];
    let core = `Hi ${first},\n\nThanks for your message. Happy to help with your ${lead.course} enquiry at ${centerName}. ` +
        `Could you share whether you'd like fee details, batch timing, or a free demo call?`;
    if (/fee|price|cost|fees|package|amount/i.test(lower)) {
        intents = ['fee_inquiry'];
        suggestedStage = 'interested';
        core =
            `Hi ${first},\n\nThanks for asking about fees for ${lead.course} at ${centerName}. ` +
                `Packages depend on batch and learning track — I can share exact options after a quick counseling call. ` +
                `Are evenings this week convenient?`;
    }
    else if (/demo|call|meet|schedule|zoom|discussion/i.test(lower)) {
        intents = ['demo_request'];
        suggestedStage = 'demo_scheduled';
        core =
            `Hi ${first},\n\nAbsolutely — we can schedule a free demo/counseling session for ${lead.course} at ${centerName}. ` +
                `Would tomorrow 5–6 PM IST or day after 11 AM–12 PM IST work for you?`;
    }
    else if (/not interested|stop|unsubscribe|don't contact|do not contact/i.test(lower)) {
        intents = ['not_interested'];
        suggestedStage = 'lost';
        core =
            `Hi ${first},\n\nUnderstood — thanks for letting me know. I'll pause outreach for now. ` +
                `If you revisit ${lead.course} later, just reply anytime.`;
    }
    else if (/interested|want to join|enroll|register/i.test(lower)) {
        intents = ['interested'];
        suggestedStage = 'interested';
    }
    return {
        intents,
        sentiment: 'neutral',
        leadScore: suggestedStage === 'lost' ? 10 : 55,
        summary: `Lead replied about ${lead.course}: ${incoming.slice(0, 80)}`,
        suggestedStage,
        reply: {
            subject: lead.replySubject ? `Re: ${lead.replySubject}` : `Re: your ${lead.course} enquiry`,
            body: enforceCenterSignoff(core, centerName),
        },
        actions: ['updateCRM'],
    };
}
async function generateOutreachEmail(lead) {
    const center = await (0, knowledgeBase_1.resolveCenterBrand)(lead.tenantId);
    const brand = (0, knowledgeBase_1.buildBrand)(center);
    const parsed = await callGemini((0, promptBuilder_1.buildOutreachPrompt)(lead, brand));
    if (parsed?.subject && parsed?.body) {
        return {
            subject: String(parsed.subject),
            body: enforceCenterSignoff(String(parsed.body), center.name),
        };
    }
    return fallbackOutreach(lead, center.name);
}
async function generateReplyForLead(lead, incomingReply) {
    const center = await (0, knowledgeBase_1.resolveCenterBrand)(lead.tenantId);
    const brand = (0, knowledgeBase_1.buildBrand)(center);
    const parsed = await callGemini((0, promptBuilder_1.buildReplyPrompt)(lead, incomingReply, brand));
    if (parsed?.reply?.body || parsed?.body) {
        const replyObj = parsed.reply && typeof parsed.reply === 'object'
            ? parsed.reply
            : { subject: parsed.subject, body: parsed.body };
        const stage = parsed.suggestedStage;
        const validStages = [
            'contacted',
            'interested',
            'demo_scheduled',
            'follow_up',
            'lost',
        ];
        return {
            intents: Array.isArray(parsed.intents) ? parsed.intents.map(String) : ['general'],
            sentiment: parsed.sentiment || 'neutral',
            leadScore: Number(parsed.leadScore) || 50,
            summary: String(parsed.summary || '').trim() || `Lead said: ${incomingReply.slice(0, 80)}`,
            suggestedStage: validStages.includes(stage) ? stage : null,
            reply: {
                subject: String(replyObj.subject || '').trim() ||
                    (lead.replySubject ? `Re: ${lead.replySubject}` : `Re: your ${lead.course} enquiry`),
                body: enforceCenterSignoff(String(replyObj.body || '').trim(), center.name),
            },
            actions: Array.isArray(parsed.actions)
                ? parsed.actions.map((a) => (typeof a === 'string' ? a : a?.tool)).filter(Boolean)
                : ['updateCRM'],
        };
    }
    return fallbackReply(lead, incomingReply, center.name);
}
async function sendGeneratedEmail(to, subject, body, tenantId) {
    if (!(await (0, mail_service_1.isMailConfigured)(tenantId)))
        throw new Error('Mail not configured');
    return (0, mail_service_1.sendLeadEmail)({
        to,
        subject,
        text: body,
        html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#333">${(0, mail_service_1.textToHtml)(body)}</div>`,
        tenantId,
    });
}
function mapIntentToStage(current, suggested, intents) {
    if (current === 'converted' || current === 'requested_as_student')
        return current;
    if (suggested)
        return suggested;
    if (intents.includes('not_interested'))
        return 'lost';
    if (intents.includes('demo_request'))
        return 'demo_scheduled';
    if (intents.includes('interested') || intents.includes('fee_inquiry'))
        return 'interested';
    if (intents.includes('follow_up'))
        return 'follow_up';
    if (current === 'new')
        return 'contacted';
    return current;
}
