import { processPendingLeadReplies } from '../services/leadChatbot/replyProcessor.service';
import { isLeadChatbotEnabled } from '../services/leadChatbot/mail.service';
import { isGmailReady } from '../services/leadChatbot/config';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startLeadReplyCron() {
  if (process.env.LEAD_CHATBOT_ENABLED === 'false') {
    console.log('Lead reply cron disabled (LEAD_CHATBOT_ENABLED=false).');
    return;
  }
  if (timer) return;

  const intervalMs = Number(process.env.LEAD_CHATBOT_REPLY_INTERVAL_MS || 15_000);

  const tick = async () => {
    if (running || !(await isLeadChatbotEnabled()) || !(await isGmailReady())) return;
    running = true;
    try {
      const result = await processPendingLeadReplies();
      if (result.replied > 0) {
        console.log(
          `[LeadReplyCron] checked=${result.checked} aiReplies=${result.replied}`
        );
      }
    } catch (err) {
      console.error('[LeadReplyCron] Failed:', err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  setTimeout(() => void tick(), 12_000);
  console.log(`Lead reply cron scheduled every ${intervalMs}ms.`);
}

export function stopLeadReplyCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
