"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startLeadReplyCron = startLeadReplyCron;
exports.stopLeadReplyCron = stopLeadReplyCron;
const replyProcessor_service_1 = require("../services/leadChatbot/replyProcessor.service");
const mail_service_1 = require("../services/leadChatbot/mail.service");
const config_1 = require("../services/leadChatbot/config");
let timer = null;
let running = false;
function startLeadReplyCron() {
    if (process.env.LEAD_CHATBOT_ENABLED === 'false') {
        console.log('Lead reply cron disabled (LEAD_CHATBOT_ENABLED=false).');
        return;
    }
    if (timer)
        return;
    const intervalMs = Number(process.env.LEAD_CHATBOT_REPLY_INTERVAL_MS || 15_000);
    const tick = async () => {
        if (running || !(await (0, mail_service_1.isLeadChatbotEnabled)()) || !(await (0, config_1.isGmailReady)()))
            return;
        running = true;
        try {
            const result = await (0, replyProcessor_service_1.processPendingLeadReplies)();
            if (result.replied > 0) {
                console.log(`[LeadReplyCron] checked=${result.checked} aiReplies=${result.replied}`);
            }
        }
        catch (err) {
            console.error('[LeadReplyCron] Failed:', err);
        }
        finally {
            running = false;
        }
    };
    timer = setInterval(() => {
        void tick();
    }, intervalMs);
    setTimeout(() => void tick(), 12_000);
    console.log(`Lead reply cron scheduled every ${intervalMs}ms.`);
}
function stopLeadReplyCron() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
