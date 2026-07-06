import Center, { ICenter } from '../models/Center';
import Student from '../models/Student';
import Trainer from '../models/Trainer';
import User from '../models/User';
import { tenantFilter } from './bdeStats';

export type CenterFeatureFlag =
  | 'allowStudentPortal'
  | 'allowLeadCsvImport'
  | 'allowBdeDirectConvert'
  | 'allowTrainerDeleteBatch'
  | 'enableCampaigns'
  | 'enableHrModule'
  | 'enableLmsAiTutor'
  | 'enableJobPortal'
  | 'publicPortalEnabled'
  | 'scholarshipTrackingEnabled';

export type CapacityResource = 'students' | 'trainers' | 'bdes';

const CAPACITY_META: Record<
  CapacityResource,
  { plural: string; singular: string; shortLabel: string }
> = {
  students: { plural: 'students', singular: 'student', shortLabel: 'Student seats' },
  trainers: { plural: 'trainers', singular: 'trainer', shortLabel: 'Trainer seats' },
  bdes: { plural: 'BDE staff', singular: 'BDE', shortLabel: 'BDE seats' },
};

const FLAGS_DEFAULT_FALSE: CenterFeatureFlag[] = [
  'allowBdeDirectConvert',
  'allowTrainerDeleteBatch',
  'scholarshipTrackingEnabled',
];

export function tenantNameFilter(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

export async function getCenterByTenant(tenantId?: string | null): Promise<ICenter | null> {
  if (!tenantId?.trim()) return null;
  const centers = await Center.find({ tenantName: tenantNameFilter(tenantId) })
    .sort({ updatedAt: -1 })
    .limit(1);
  return centers[0] ?? null;
}

export function isFeatureEnabled(center: ICenter | null, flag: CenterFeatureFlag): boolean {
  if (!center) return !FLAGS_DEFAULT_FALSE.includes(flag);
  const val = center[flag as keyof ICenter];
  if (FLAGS_DEFAULT_FALSE.includes(flag)) {
    return val === true;
  }
  return val !== false;
}

export async function assertFeature(
  tenantId: string | undefined,
  flag: CenterFeatureFlag,
  role?: string
): Promise<{ ok: true; center: ICenter | null } | { ok: false; message: string }> {
  if (role === 'super_admin') return { ok: true, center: null };
  const center = await getCenterByTenant(tenantId);
  if (!isFeatureEnabled(center, flag)) {
    return { ok: false, message: 'This feature is disabled for your institute.' };
  }
  return { ok: true, center };
}

export async function countCapacityUsage(tenantId: string, resource: CapacityResource): Promise<number> {
  switch (resource) {
    case 'students':
      return Student.countDocuments({
        tenantId: tenantFilter(tenantId),
        status: { $ne: 'completed' },
      });
    case 'trainers':
      return Trainer.countDocuments({ tenantId: tenantFilter(tenantId) });
    case 'bdes':
      return User.countDocuments({ role: 'bde', tenantId: tenantFilter(tenantId) });
  }
}

export function getCapacityLimit(center: ICenter | null, resource: CapacityResource): number {
  if (!center) {
    return resource === 'students' ? 500 : resource === 'trainers' ? 25 : 10;
  }
  if (resource === 'students') return center.maxStudentCapacity ?? 500;
  if (resource === 'trainers') return center.maxTrainers ?? 25;
  return center.maxBdes ?? 10;
}

export async function assertCapacity(
  tenantId: string | undefined,
  resource: CapacityResource,
  role?: string
): Promise<
  | { ok: true }
  | { ok: false; message: string; limit: number; current: number; resource: CapacityResource }
> {
  if (role === 'super_admin' || !tenantId) return { ok: true };
  const center = await getCenterByTenant(tenantId);
  const limit = getCapacityLimit(center, resource);
  const current = await countCapacityUsage(tenantId, resource);
  if (current >= limit) {
    const meta = CAPACITY_META[resource];
    return {
      ok: false,
      message: `You've reached your ${meta.plural} limit (${current}/${limit}). Upgrade your institute plan to add more ${meta.plural}.`,
      limit,
      current,
      resource,
    };
  }
  return { ok: true };
}

export async function buildCenterPolicyPayload(tenantId: string) {
  const center = await getCenterByTenant(tenantId);
  const [studentCount, trainerCount, bdeCount] = await Promise.all([
    countCapacityUsage(tenantId, 'students'),
    countCapacityUsage(tenantId, 'trainers'),
    countCapacityUsage(tenantId, 'bdes'),
  ]);

  return {
    tenantId,
    maxStudentCapacity: getCapacityLimit(center, 'students'),
    maxTrainers: getCapacityLimit(center, 'trainers'),
    maxBdes: getCapacityLimit(center, 'bdes'),
    studentCount,
    trainerCount,
    bdeCount,
    allowStudentPortal: isFeatureEnabled(center, 'allowStudentPortal'),
    allowLeadCsvImport: isFeatureEnabled(center, 'allowLeadCsvImport'),
    allowBdeDirectConvert: isFeatureEnabled(center, 'allowBdeDirectConvert'),
    allowTrainerDeleteBatch: isFeatureEnabled(center, 'allowTrainerDeleteBatch'),
    enableCampaigns: isFeatureEnabled(center, 'enableCampaigns'),
    enableHrModule: isFeatureEnabled(center, 'enableHrModule'),
    enableLmsAiTutor: isFeatureEnabled(center, 'enableLmsAiTutor'),
    enableJobPortal: isFeatureEnabled(center, 'enableJobPortal'),
    publicPortalEnabled: isFeatureEnabled(center, 'publicPortalEnabled'),
    scholarshipTrackingEnabled: isFeatureEnabled(center, 'scholarshipTrackingEnabled'),
    enabledModules: center?.enabledModules || [],
    centerName: center?.name || tenantId,
  };
}

export function publicPortalPayload(center: ICenter) {
  return {
    tenantId: center.tenantName,
    name: center.name,
    tagline: center.tagline || '',
    logoUrl: center.logoUrl || '',
    brandColor: center.brandColor || '#3b82f6',
    website: center.website || '',
    welcomeMessage: center.welcomeMessage || '',
    location: center.location || '',
    email: center.email || '',
    phone: center.phone || '',
  };
}
