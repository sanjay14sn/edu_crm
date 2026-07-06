import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';
import { formatBytes } from '../utils/formatBytes';
import { getTenantUsageSnapshot } from '../services/usageTracker.service';
import { getInstituteProfileSnapshot } from '../services/instituteProfile.service';

export const getPlatformUsage = async (_req: AuthRequest, res: Response) => {
  try {
    const snapshot = await getTenantUsageSnapshot();

    let cloudinaryAccount: {
      configured: boolean;
      storageBytes?: number;
      storageLabel?: string;
      bandwidthBytes?: number;
      bandwidthLabel?: string;
      resources?: number;
      derivedResources?: number;
    } = { configured: isCloudinaryConfigured() };

    if (isCloudinaryConfigured()) {
      try {
        const usage = await cloudinary.api.usage();
        const storageBytes = Number(usage?.storage?.usage || usage?.resources?.usage || 0);
        const bandwidthBytes = Number(usage?.bandwidth?.usage || 0);
        cloudinaryAccount = {
          configured: true,
          storageBytes,
          storageLabel: formatBytes(storageBytes),
          bandwidthBytes,
          bandwidthLabel: formatBytes(bandwidthBytes),
          resources: Number(usage?.resources?.usage || 0),
          derivedResources: Number(usage?.derived_resources?.usage || 0),
        };
      } catch (error) {
        console.warn('Cloudinary account usage fetch failed:', error);
      }
    }

    res.status(200).json({
      ...snapshot,
      cloudinaryAccount,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching platform usage', error });
  }
};

export const getInstituteProfile = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(400).json({ message: 'Tenant context is required for institute profile' });
    }

    const profile = await getInstituteProfileSnapshot(tenantId);
    res.status(200).json(profile);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching institute profile', error });
  }
};
