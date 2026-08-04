import Center from '../../models/Center';
import { getCenterByTenant } from '../../utils/centerPolicy';

export type LeadChatbotGlobalSettings = {
  autoReplyEnabled: boolean;
  followUpsEnabled: boolean;
  tenantId: string | null;
  centerId: string | null;
  centerName: string | null;
};

async function resolveCenter(tenantId?: string | null) {
  if (tenantId?.trim()) {
    const byTenant = await getCenterByTenant(tenantId);
    if (byTenant) return byTenant;
  }
  return Center.findOne({ status: 'active' }).sort({ updatedAt: -1 });
}

export async function getLeadChatbotGlobalSettings(
  tenantId?: string | null
): Promise<LeadChatbotGlobalSettings> {
  const center = await resolveCenter(tenantId);
  return {
    autoReplyEnabled: center?.leadAutoReplyEnabled !== false,
    followUpsEnabled: center?.leadFollowUpsEnabled !== false,
    tenantId: tenantId || (center?.tenantName ?? null),
    centerId: center ? String(center._id) : null,
    centerName: center?.name || null,
  };
}

export async function updateLeadChatbotGlobalSettings(
  tenantId: string | undefined | null,
  patch: { autoReplyEnabled?: boolean; followUpsEnabled?: boolean }
): Promise<LeadChatbotGlobalSettings> {
  const center = await resolveCenter(tenantId);
  if (!center) {
    throw new Error('No center found to save chatbot settings');
  }

  if (typeof patch.autoReplyEnabled === 'boolean') {
    center.leadAutoReplyEnabled = patch.autoReplyEnabled;
  }
  if (typeof patch.followUpsEnabled === 'boolean') {
    center.leadFollowUpsEnabled = patch.followUpsEnabled;
  }
  await center.save();

  return {
    autoReplyEnabled: center.leadAutoReplyEnabled !== false,
    followUpsEnabled: center.leadFollowUpsEnabled !== false,
    tenantId: tenantId || center.tenantName || null,
    centerId: String(center._id),
    centerName: center.name || null,
  };
}

export async function isGlobalAutoReplyEnabled(tenantId?: string | null) {
  const settings = await getLeadChatbotGlobalSettings(tenantId);
  return settings.autoReplyEnabled;
}

export async function isGlobalFollowUpsEnabled(tenantId?: string | null) {
  const settings = await getLeadChatbotGlobalSettings(tenantId);
  return settings.followUpsEnabled;
}
