import Campaign from '../models/Campaign';
import { sendCampaignEmails } from '../services/campaign.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

export function startCampaignCron() {
  if (timer) return;

  const intervalMs = 30_000; // Check every 30 seconds

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      // Find all scheduled campaigns that are ready to run
      const scheduledCampaigns = await Campaign.find({
        status: 'Scheduled',
        scheduledAt: { $lte: new Date() },
      });

      for (const campaign of scheduledCampaigns) {
        console.log(`[CampaignCron] Triggering scheduled campaign: "${campaign.name}"`);
        // Transition to Active status first
        campaign.status = 'Active';
        await campaign.save();
        
        // Execute campaign in background
        void sendCampaignEmails(String(campaign._id));
      }
    } catch (err) {
      console.error('[CampaignCron] Failed:', err);
    } finally {
      running = false;
    }
  };

  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  setTimeout(() => void tick(), 5_000);
  console.log(`Campaign cron scheduled every ${intervalMs}ms.`);
}

export function stopCampaignCron() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
