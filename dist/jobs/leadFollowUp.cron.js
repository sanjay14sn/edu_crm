"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLeadFollowUpCron = startLeadFollowUpCron;
exports.stopLeadFollowUpCron = stopLeadFollowUpCron;
const followUp_service_1 = require("../services/leadChatbot/followUp.service");
const mail_service_1 = require("../services/leadChatbot/mail.service");
let timer = null;
let running = false;
function startLeadFollowUpCron() {
    if (process.env.LEAD_CHATBOT_FOLLOWUPS_CRON_ENABLED === 'false') {
        console.log('Lead follow-up cron disabled (LEAD_CHATBOT_FOLLOWUPS_CRON_ENABLED=false).');
        return;
    }
    if (timer)
        return;
    // Check hourly by default
    const intervalMs = Number(process.env.LEAD_CHATBOT_FOLLOWUP_INTERVAL_MS || 60 * 60 * 1000);
    const tick = async () => {
        if (running || !(await (0, mail_service_1.isLeadChatbotEnabled)()))
            return;
        running = true;
        try {
            const result = await (0, followUp_service_1.processLeadFollowUps)();
            if (result.sent > 0) {
                console.log(`[LeadFollowUpCron] checked=${result.checked} sent=${result.sent}`);
            }
        }
        catch (err) {
            console.error('[LeadFollowUpCron] Failed:', err);
        }
        finally {
            running = false;
        }
    };
    timer = setInterval(() => {
        void tick();
    }, intervalMs);
    setTimeout(() => void tick(), 20_000);
    console.log(`Lead follow-up cron scheduled every ${intervalMs}ms.`);
}
function stopLeadFollowUpCron() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
