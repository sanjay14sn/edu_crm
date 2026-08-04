"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOutreachPrompt = buildOutreachPrompt;
exports.buildReplyPrompt = buildReplyPrompt;
const knowledgeBase_1 = require("./knowledgeBase");
const conversationMemory_1 = require("./conversationMemory");
function buildOutreachPrompt(lead, brand) {
    const s = brand.sender;
    const c = brand.company;
    return `You write admissions emails for ${c.name}.
Write a short friendly first outreach email to a student lead who enquired about a course.

Lead name: ${lead.name}
Email: ${lead.email}
Phone: ${lead.phone}
Course enquired: ${lead.course}
City: ${lead.city || 'n/a'}
Center name: ${c.name}

Goals:
- Thank them for the enquiry
- Confirm interest in "${lead.course}" at ${c.name}
- Offer a free counseling call / demo
- Ask 1 short clarifying question (timeline or background)
- Keep 60–110 words, plain text, no markdown
- Do NOT use "Admissions Team", "Edu CRM", or any brand other than "${c.name}"
- Sign off EXACTLY as (center name only):
Best,
${c.name}

Return ONLY valid JSON:
{
  "subject": "...",
  "body": "..."
}`;
}
function buildReplyPrompt(lead, incomingReply, brand) {
    const c = brand.company;
    const memory = (0, conversationMemory_1.buildMemory)(lead, lead.name);
    const history = (memory.events || [])
        .slice(-8)
        .map((e) => `[${e.role}]: ${e.body.slice(0, 400)}`)
        .join('\n\n') || '(no prior conversation)';
    const kb = (0, knowledgeBase_1.retrieveRelevantKnowledge)(`${lead.course} ${incomingReply}`, c.name);
    return `You are the admissions assistant for ${c.name}.
Tone: friendly, professional, concise.
Sign off EXACTLY as center name only:
Best,
${c.name}

Do NOT sign as "Admissions Team" or "Edu CRM Training Center". Only use "${c.name}".

${c.whatWeDo}

═══ LEAD CRM STATE ═══
Name: ${lead.name}
Course: ${lead.course}
Stage: ${lead.stage}
Phone: ${lead.phone}
Intent score: ${lead.intentScore || 0}
City: ${lead.city || 'n/a'}
Center: ${c.name}

═══ RELEVANT KNOWLEDGE ═══
${kb}

═══ RECENT EMAIL THREAD ═══
${history}

═══ LATEST STUDENT EMAIL ═══
"${incomingReply}"

Rules:
- Answer their latest question in the first 1–2 sentences
- If they ask fees, share that packages depend on batch/course and offer a counseling call for exact pricing
- If they want a demo/call, propose 2 time windows (weekday evenings IST) and mark demo interest
- If not interested / stop, acknowledge politely and stop pitching
- Keep reply.body 50–110 words, plain text, no markdown

Return ONLY valid JSON:
{
  "intents": ["fee_inquiry" | "demo_request" | "interested" | "not_interested" | "follow_up" | "general"],
  "sentiment": "positive" | "neutral" | "negative",
  "leadScore": 0-100,
  "summary": "1 sentence CRM note",
  "suggestedStage": "contacted" | "interested" | "demo_scheduled" | "follow_up" | "lost" | null,
  "reply": { "subject": "Re: ...", "body": "..." },
  "actions": ["updateCRM"]
}`;
}
