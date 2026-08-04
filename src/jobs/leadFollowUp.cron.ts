import { processLeadFollowUps } from '../services/leadChatbot/followUp.service';
import { isLeadChatbotEnabled } from '../services/leadChatbot/mail.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startLeadFollowUpCron() {
  if (process.env.LEAD_CHATBOT_FOLLOWUPS_CRON_ENABLED === 'false') {
    console.log('Lead follow-up cron disabled (LEAD_CHATBOT_FOLLOWUPS_CRON_ENABLED=false).');
    return;
  }
  if (timer) return;

  // Check hourly by default
  const intervalMs = Number(process.env.LEAD_CHATBOT_FOLLOWUP_INTERVAL_MS || 60 * 60 * 1000);

  const tick = async () => {
    if (running || !(await isLeadChatbotEnabled())) return;
    running = true;
    try {
      const result = await processLeadFollowUps();
      if (result.sent > 0) {
        console.log(`[LeadFollowUpCron] checked=${result.checked} sent=${result.sent}`);
      }
    } catch (err) {
      console.error('[LeadFollowUpCron] Failed:', err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  setTimeout(() => void tick(), 20_000);
  console.log(`Lead follow-up cron scheduled every ${intervalMs}ms.`);
}

export function stopLeadFollowUpCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
