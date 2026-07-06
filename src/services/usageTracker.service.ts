import TenantUsage from '../models/TenantUsage';
import Center from '../models/Center';
import Student from '../models/Student';
import Lead from '../models/Lead';
import Batch from '../models/Batch';
import Course from '../models/Course';
import Attendance from '../models/Attendance';
import Campaign from '../models/Campaign';
import User from '../models/User';
import Trainer from '../models/Trainer';
import { formatBytes } from '../utils/formatBytes';

function normalizeTenantId(tenantId?: string | null) {
  return (tenantId || 'ERP').trim() || 'ERP';
}

function tenantRegex(tenantId: string) {
  const escaped = tenantId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped}\\s*$`, 'i');
}

export async function recordCloudinaryUpload(tenantId: string | undefined, bytes: number) {
  const id = normalizeTenantId(tenantId);
  const size = Math.max(0, Number(bytes) || 0);
  if (!size) return;

  await TenantUsage.findOneAndUpdate(
    { tenantId: id },
    {
      $inc: { cloudinaryBytes: size, cloudinaryFiles: 1 },
      $set: { lastCloudinaryUploadAt: new Date() },
      $setOnInsert: { tenantId: id },
    },
    { upsert: true, new: true }
  );
}

export async function recordAiTokenUsage(
  tenantId: string | undefined,
  usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number },
  feature?: string
) {
  const id = normalizeTenantId(tenantId);
  const promptTokens = Math.max(0, Number(usage.promptTokens) || 0);
  const completionTokens = Math.max(0, Number(usage.completionTokens) || 0);
  const totalTokens =
    Math.max(0, Number(usage.totalTokens) || 0) || promptTokens + completionTokens;

  if (!totalTokens && !promptTokens && !completionTokens) return;

  const today = new Date().toISOString().split('T')[0];
  const existing = await TenantUsage.findOne({ tenantId: id }).lean();
  const dailyRequests =
    existing?.aiDailyDate === today ? (existing.aiDailyRequests || 0) + 1 : 1;

  await TenantUsage.findOneAndUpdate(
    { tenantId: id },
    {
      $inc: {
        aiPromptTokens: promptTokens,
        aiCompletionTokens: completionTokens,
        aiTotalTokens: totalTokens,
        aiRequests: 1,
      },
      $set: {
        lastAiUsageAt: new Date(),
        aiDailyDate: today,
        aiDailyRequests: dailyRequests,
      },
      $setOnInsert: { tenantId: id },
    },
    { upsert: true, new: true }
  );

  if (feature) {
    // reserved for future per-feature breakdown
  }
}

async function estimateCollectionBytes(
  model: { countDocuments: (f: object) => Promise<number>; find: (f: object) => { limit: (n: number) => { lean: () => Promise<object[]> } } },
  filter: object
) {
  const count = await model.countDocuments(filter);
  if (count === 0) return { count: 0, bytes: 0 };

  const samples = await model.find(filter).limit(8).lean();
  const avgSize =
    samples.reduce((sum, doc) => sum + Buffer.byteLength(JSON.stringify(doc), 'utf8'), 0) /
    Math.max(samples.length, 1);

  return { count, bytes: Math.round(count * avgSize) };
}

export async function estimateMongoUsageForTenant(tenantId: string) {
  const regex = tenantRegex(tenantId);
  const tenantFilter = { tenantId: regex };
  const centerFilter = { tenantName: regex };

  const collections = await Promise.all([
    estimateCollectionBytes(Student, tenantFilter),
    estimateCollectionBytes(Lead, tenantFilter),
    estimateCollectionBytes(Batch, tenantFilter),
    estimateCollectionBytes(Course, tenantFilter),
    estimateCollectionBytes(Attendance, tenantFilter),
    estimateCollectionBytes(Campaign, tenantFilter),
    estimateCollectionBytes(User, tenantFilter),
    estimateCollectionBytes(Trainer, tenantFilter),
    estimateCollectionBytes(Center, centerFilter),
  ]);

  const documents = collections.reduce((sum, item) => sum + item.count, 0);
  const bytes = collections.reduce((sum, item) => sum + item.bytes, 0);

  return { documents, bytes, bytesLabel: formatBytes(bytes) };
}

export async function getTenantUsageSnapshot() {
  const centers = await Center.find().sort({ tenantName: 1, name: 1 }).lean();
  const tenantMap = new Map<
    string,
    { tenantId: string; tenantName: string; centerCount: number; centerNames: string[]; status: string }
  >();

  for (const center of centers) {
    const tenantId = normalizeTenantId(center.tenantName);
    const existing = tenantMap.get(tenantId.toLowerCase());
    if (existing) {
      existing.centerCount += 1;
      existing.centerNames.push(center.name);
      if (center.status === 'active') existing.status = 'active';
    } else {
      tenantMap.set(tenantId.toLowerCase(), {
        tenantId,
        tenantName: center.tenantName || tenantId,
        centerCount: 1,
        centerNames: [center.name],
        status: center.status || 'active',
      });
    }
  }

  if (tenantMap.size === 0) {
    tenantMap.set('erp', {
      tenantId: 'ERP',
      tenantName: 'ERP',
      centerCount: 0,
      centerNames: [],
      status: 'active',
    });
  }

  const usageDocs = await TenantUsage.find().lean();
  const usageByTenant = new Map(
    usageDocs.map((doc) => [normalizeTenantId(doc.tenantId).toLowerCase(), doc])
  );

  const institutions = await Promise.all(
    Array.from(tenantMap.values()).map(async (tenant) => {
      const key = tenant.tenantId.toLowerCase();
      const tracked = usageByTenant.get(key);
      const mongo = await estimateMongoUsageForTenant(tenant.tenantId);

      if (tracked && !tracked.tenantName) {
        await TenantUsage.updateOne({ tenantId: tracked.tenantId }, { tenantName: tenant.tenantName });
      }

      return {
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        centerCount: tenant.centerCount,
        centerNames: tenant.centerNames,
        status: tenant.status,
        cloudinary: {
          bytes: tracked?.cloudinaryBytes || 0,
          bytesLabel: formatBytes(tracked?.cloudinaryBytes || 0),
          files: tracked?.cloudinaryFiles || 0,
          lastUploadAt: tracked?.lastCloudinaryUploadAt || null,
        },
        mongo: {
          bytes: mongo.bytes,
          bytesLabel: mongo.bytesLabel,
          documents: mongo.documents,
        },
        ai: {
          promptTokens: tracked?.aiPromptTokens || 0,
          completionTokens: tracked?.aiCompletionTokens || 0,
          totalTokens: tracked?.aiTotalTokens || 0,
          requests: tracked?.aiRequests || 0,
          lastUsedAt: tracked?.lastAiUsageAt || null,
        },
      };
    })
  );

  institutions.sort((a, b) => b.ai.totalTokens - a.ai.totalTokens || b.mongo.bytes - a.mongo.bytes);

  const totals = institutions.reduce(
    (acc, row) => {
      acc.cloudinaryBytes += row.cloudinary.bytes;
      acc.cloudinaryFiles += row.cloudinary.files;
      acc.mongoBytes += row.mongo.bytes;
      acc.mongoDocuments += row.mongo.documents;
      acc.aiTotalTokens += row.ai.totalTokens;
      acc.aiRequests += row.ai.requests;
      return acc;
    },
    {
      cloudinaryBytes: 0,
      cloudinaryFiles: 0,
      mongoBytes: 0,
      mongoDocuments: 0,
      aiTotalTokens: 0,
      aiRequests: 0,
    }
  );

  return {
    institutions,
    totals: {
      ...totals,
      cloudinaryBytesLabel: formatBytes(totals.cloudinaryBytes),
      mongoBytesLabel: formatBytes(totals.mongoBytes),
    },
  };
}
