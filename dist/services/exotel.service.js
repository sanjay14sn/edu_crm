"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isExotelConfigured = isExotelConfigured;
exports.normalizeIndianPhone = normalizeIndianPhone;
exports.mapExotelStatus = mapExotelStatus;
exports.getMockFinalStatus = getMockFinalStatus;
exports.initiateFeeReminderCall = initiateFeeReminderCall;
const FLOW_ENV_KEYS = {
    due_today: 'EXOTEL_FLOW_DUE_TODAY',
    overdue_7: 'EXOTEL_FLOW_OVERDUE_7',
    overdue_30: 'EXOTEL_FLOW_OVERDUE_30',
};
function isExotelConfigured() {
    return Boolean(process.env.EXOTEL_SID &&
        process.env.EXOTEL_API_KEY &&
        process.env.EXOTEL_API_TOKEN &&
        process.env.EXOTEL_CALLER_ID);
}
function getFlowId(flowType) {
    const envKey = FLOW_ENV_KEYS[flowType];
    const flowId = process.env[envKey] || process.env.EXOTEL_FLOW_DEFAULT;
    if (!flowId) {
        throw new Error(`Missing Exotel flow ID for ${flowType}. Set ${envKey} in .env`);
    }
    return flowId;
}
function buildFlowUrl(flowId) {
    const appId = process.env.EXOTEL_APP_ID;
    if (!appId) {
        throw new Error('EXOTEL_APP_ID is required for Exotel voice flows');
    }
    return `http://my.exotel.com/${appId}/exoml/start_voice/${flowId}`;
}
function normalizeIndianPhone(phone) {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10)
        return `0${digits}`;
    if (digits.length === 12 && digits.startsWith('91'))
        return `0${digits.slice(2)}`;
    if (digits.length === 11 && digits.startsWith('0'))
        return digits;
    return digits;
}
function mapExotelStatus(raw) {
    const value = (raw || '').toLowerCase().replace(/_/g, '-');
    if (value === 'in-progress' || value === 'ringing' || value === 'answered')
        return 'in-progress';
    if (value === 'completed' || value === 'complete')
        return 'completed';
    if (value === 'busy')
        return 'busy';
    if (value === 'no-answer' || value === 'noanswer')
        return 'no-answer';
    if (value === 'failed' || value === 'canceled' || value === 'cancelled')
        return 'failed';
    return 'queued';
}
function mockCallSid() {
    return `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
const MOCK_OUTCOMES = [
    'completed',
    'completed',
    'completed',
    'completed',
    'no-answer',
    'busy',
    'failed',
];
function getMockFinalStatus() {
    return MOCK_OUTCOMES[Math.floor(Math.random() * MOCK_OUTCOMES.length)];
}
async function initiateFeeReminderCall(input) {
    const normalizedPhone = normalizeIndianPhone(input.phone);
    if (!normalizedPhone || normalizedPhone.length < 10) {
        throw new Error('Invalid phone number for fee reminder call');
    }
    if (!isExotelConfigured()) {
        return {
            callSid: mockCallSid(),
            status: 'queued',
            mock: true,
        };
    }
    const sid = process.env.EXOTEL_SID;
    const apiKey = process.env.EXOTEL_API_KEY;
    const apiToken = process.env.EXOTEL_API_TOKEN;
    const callerId = process.env.EXOTEL_CALLER_ID;
    const flowUrl = buildFlowUrl(getFlowId(input.flowType));
    const body = new URLSearchParams({
        From: normalizedPhone,
        CallerId: callerId,
        Url: flowUrl,
        CallType: 'trans',
    });
    if (input.statusCallbackUrl) {
        body.set('StatusCallback', input.statusCallbackUrl);
    }
    if (input.customField) {
        body.set('CustomField', input.customField);
    }
    const auth = Buffer.from(`${apiKey}:${apiToken}`).toString('base64');
    const response = await fetch(`https://api.exotel.com/v1/Accounts/${sid}/Calls/connect.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });
    const payload = (await response.json());
    if (!response.ok) {
        const message = payload?.RestException?.Message ||
            `Exotel API error (${response.status})`;
        throw new Error(message);
    }
    return {
        callSid: payload?.Call?.Sid || mockCallSid(),
        status: mapExotelStatus(payload?.Call?.Status),
    };
}
