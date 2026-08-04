"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.KB = exports.POLICIES = exports.COURSES = void 0;
exports.resolveCenterBrand = resolveCenterBrand;
exports.buildBrand = buildBrand;
exports.retrieveRelevantKnowledge = retrieveRelevantKnowledge;
const Center_1 = __importDefault(require("../../models/Center"));
const DEFAULT_CENTER_NAME = process.env.LEAD_CHATBOT_CENTER_NAME || 'Training Center';
async function resolveCenterBrand(tenantId) {
    if (tenantId) {
        const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const center = await Center_1.default.findOne({
            tenantName: { $regex: new RegExp(`^${escaped}$`, 'i') },
        }).lean();
        if (center?.name?.trim()) {
            return {
                name: center.name.trim(),
                website: center.website || process.env.LEAD_CHATBOT_WEBSITE || '',
                tagline: center.tagline || '',
                email: center.email || process.env.MAIL_USERNAME || '',
            };
        }
    }
    // Fallback: first active center, then env default
    const anyCenter = await Center_1.default.findOne({ status: 'active' }).sort({ createdAt: 1 }).lean();
    if (anyCenter?.name?.trim()) {
        return {
            name: anyCenter.name.trim(),
            website: anyCenter.website || process.env.LEAD_CHATBOT_WEBSITE || '',
            tagline: anyCenter.tagline || '',
            email: anyCenter.email || process.env.MAIL_USERNAME || '',
        };
    }
    return {
        name: DEFAULT_CENTER_NAME,
        website: process.env.LEAD_CHATBOT_WEBSITE || '',
        email: process.env.MAIL_USERNAME || '',
    };
}
/** Branding for emails: center name only (no "Admissions Team |" prefix). */
function buildBrand(center) {
    return {
        company: {
            name: center.name,
            type: 'Education / Training Institute',
            tagline: center.tagline || 'Practical career courses with placement support.',
            whatWeDo: `${center.name} offers career-focused training programs with counselor guidance, demos, and flexible fee plans.`,
            whyUs: 'Hands-on projects, experienced trainers, counselor support, and clear admission paths from enquiry to enrollment.',
            location: 'India',
            website: center.website || '',
            workingHours: 'Monday–Saturday, 10 AM–7 PM IST',
            email: center.email || process.env.MAIL_USERNAME || '',
        },
        sender: {
            name: center.name,
            role: 'Admissions',
            // Sign-off must be center name only
            signoff: center.name,
        },
    };
}
exports.COURSES = [
    {
        name: 'Mobile App Development',
        keywords: ['mobile', 'android', 'ios', 'flutter', 'react native', 'app'],
        description: 'Build Android/iOS apps with modern frameworks, portfolio projects, and mentor support.',
        typicalFeeHint: 'Fees vary by batch — counselors share current packages after a short call/demo.',
    },
    {
        name: 'ERP',
        keywords: ['erp', 'odoo', 'sap', 'enterprise'],
        description: 'Practical ERP training covering business modules, workflows, and implementation basics.',
        typicalFeeHint: 'Package depends on module depth — we share options after understanding your goal.',
    },
    {
        name: 'Full Stack Development',
        keywords: ['full stack', 'web', 'mern', 'mean', 'javascript', 'react', 'node'],
        description: 'End-to-end web development covering frontend, backend, databases, and deployment.',
        typicalFeeHint: 'Multiple packages available; we recommend based on your background.',
    },
    {
        name: 'Abacus',
        keywords: ['abacus', 'vedic', 'mental math'],
        description: 'Abacus and mental math training for strong number skills.',
        typicalFeeHint: 'Batch fees shared during counseling.',
    },
];
exports.POLICIES = {
    demos: 'We can schedule a free counseling call or course demo at a convenient slot.',
    fees: 'Share goals/budget and we will recommend a suitable package. Exact fees are confirmed by the counsellor.',
    admission: 'After interest confirmation we guide registration, documents, batch selection, and payment schedule.',
    followUp: 'If busy, reply with a preferred time and we will reconnect.',
};
function retrieveRelevantKnowledge(text = '', centerName = DEFAULT_CENTER_NAME) {
    const lower = text.toLowerCase();
    const matched = exports.COURSES.filter((c) => c.keywords.some((k) => lower.includes(k)) || lower.includes(c.name.toLowerCase()));
    const courses = (matched.length ? matched : exports.COURSES).map((c) => `- ${c.name}: ${c.description} (${c.typicalFeeHint})`);
    return [
        `Center: ${centerName}`,
        `Hours: Monday–Saturday, 10 AM–7 PM IST`,
        'Courses:',
        ...courses,
        `Demos: ${exports.POLICIES.demos}`,
        `Fees: ${exports.POLICIES.fees}`,
        `Admission: ${exports.POLICIES.admission}`,
    ].join('\n');
}
/** @deprecated static KB — prefer buildBrand(await resolveCenterBrand(...)) */
exports.KB = buildBrand({ name: DEFAULT_CENTER_NAME });
