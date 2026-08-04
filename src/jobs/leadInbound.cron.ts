import { processInboundInquiryEmails } from '../services/leadChatbot/inboundLead.service';
import { isInboundEnabled } from '../services/leadChatbot/config';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startLeadInboundCron() {
  if (process.env.LEAD_CHATBOT_INBOUND_ENABLED === 'false') {
    console.log('Lead inbound cron disabled (LEAD_CHATBOT_INBOUND_ENABLED=false).');
    return;
  }
  if (timer) return;

  const intervalMs = Number(process.env.LEAD_CHATBOT_INBOUND_INTERVAL_MS || 60_000);

  const tick = async () => {
    if (running || !(await isInboundEnabled())) return;
    running = true;
    try {
      const result = await processInboundInquiryEmails();
      if (result.created > 0) {
        console.log(
          `[LeadInboundCron] scanned=${result.scanned} created=${result.created} skipped=${result.skipped}`
        );
      }
    } catch (err) {
      console.error('[LeadInboundCron] Failed:', err);
    } finally {
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

export function stopLeadInboundCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
