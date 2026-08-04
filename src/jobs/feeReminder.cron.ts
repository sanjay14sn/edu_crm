import { runAutoFeeReminderCron } from '../services/feeReminder.service';

let cronTimer: NodeJS.Timeout | null = null;
let lastRunDate = '';

function getCronHour() {
  const value = Number(process.env.FEE_REMINDER_CRON_HOUR ?? 9);
  return Number.isFinite(value) ? Math.min(23, Math.max(0, value)) : 9;
}

function shouldRunNow() {
  const now = new Date();
  const hour = getCronHour();
  const todayKey = now.toISOString().slice(0, 10);

  if (now.getHours() !== hour || now.getMinutes() > 5) {
    return false;
  }

  if (lastRunDate === todayKey) {
    return false;
  }

  lastRunDate = todayKey;
  return true;
}

export function startFeeReminderCron() {
  if (process.env.FEE_REMINDER_CRON_ENABLED === 'false') {
    console.log('Fee reminder cron disabled (FEE_REMINDER_CRON_ENABLED=false).');
    return;
  }

  if (cronTimer) return;

  cronTimer = setInterval(() => {
    if (!shouldRunNow()) return;

    void runAutoFeeReminderCron()
      .then((summaries) => {
        const total = summaries.reduce((sum, item) => sum + item.total, 0);
        console.log(
          `[FeeReminderCron] Triggered ${total} due-today calls across ${summaries.length} center(s).`
        );
      })
      .catch((error) => {
        console.error('[FeeReminderCron] Failed:', error);
      });
  }, 60_000);

  console.log(`Fee reminder cron scheduled for ${getCronHour()}:00 daily.`);
}

export function stopFeeReminderCron() {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
  }
}
