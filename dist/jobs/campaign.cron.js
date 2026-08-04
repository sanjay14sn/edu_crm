"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startCampaignCron = startCampaignCron;
exports.stopCampaignCron = stopCampaignCron;
const Campaign_1 = __importDefault(require("../models/Campaign"));
const campaign_service_1 = require("../services/campaign.service");
let timer = null;
let running = false;
function startCampaignCron() {
    if (timer)
        return;
    const intervalMs = 30_000; // Check every 30 seconds
    const tick = async () => {
        if (running)
            return;
        running = true;
        try {
            // Find all scheduled campaigns that are ready to run
            const scheduledCampaigns = await Campaign_1.default.find({
                status: 'Scheduled',
                scheduledAt: { $lte: new Date() },
            });
            for (const campaign of scheduledCampaigns) {
                console.log(`[CampaignCron] Triggering scheduled campaign: "${campaign.name}"`);
                // Transition to Active status first
                campaign.status = 'Active';
                await campaign.save();
                // Execute campaign in background
                void (0, campaign_service_1.sendCampaignEmails)(String(campaign._id));
            }
        }
        catch (err) {
            console.error('[CampaignCron] Failed:', err);
        }
        finally {
            running = false;
        }
    };
    timer = setInterval(() => {
        void tick();
    }, intervalMs);
    setTimeout(() => void tick(), 5_000);
    console.log(`Campaign cron scheduled every ${intervalMs}ms.`);
}
function stopCampaignCron() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
}
