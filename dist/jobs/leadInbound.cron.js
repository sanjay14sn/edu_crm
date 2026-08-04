"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLeadInboundCron = startLeadInboundCron;
exports.stopLeadInboundCron = stopLeadInboundCron;
const inboundLead_service_1 = require("../services/leadChatbot/inboundLead.service");
const config_1 = require("../services/leadChatbot/config");
let timer = null;
let running = false;
function startLeadInboundCron() {
    if (process.env.LEAD_CHATBOT_INBOUND_ENABLED === 'false') {
        console.log('Lead inbound cron disabled (LEAD_CHATBOT_INBOUND_ENABLED=false).');
        return;
    }
    if (timer)
        return;
    const intervalMs = Number(process.env.LEAD_CHATBOT_INBOUND_INTERVAL_MS || 60_000);
    const tick = async () => {
        if (running || !(await (0, config_1.isInboundEnabled)()))
            return;
        running = true;
        try {
            const result = await (0, inboundLead_service_1.processInboundInquiryEmails)();
            if (result.created > 0) {
                console.log(`[LeadInboundCron] scanned=${result.scanned} created=${result.created} skipped=${result.skipped}`);
            }
        }
        catch (err) {
            console.error('[LeadInboundCron] Failed:', err);
        }
        finally {
            running = false;
        }
    };
    timer = setInterval(() => {
        void tick();
    }, intervalMs);
    // initial delay so server finishes boot
    setTimeout(() => void tick(), 8_000);
    console.log(`Lead inbound cron scheduled every ${intervalMs}ms.`);
}
function stopLeadInboundCron() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
