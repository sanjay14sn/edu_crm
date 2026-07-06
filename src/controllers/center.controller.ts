import { Request, Response } from 'express';
import Center from '../models/Center';
import { AuthRequest } from '../middleware/auth.middleware';
import {
  buildCenterPolicyPayload,
  getCenterByTenant,
  isFeatureEnabled,
  publicPortalPayload,
} from '../utils/centerPolicy';

function tenantFilter(tenantId: string) {
  const escaped = tenantId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return { $regex: new RegExp(`^${escaped}\\s*$`, 'i') };
}

export const getCenters = async (req: AuthRequest, res: Response) => {
  try {
    const filter =
      req.user?.role !== 'super_admin' && req.user?.tenantId
        ? { tenantName: tenantFilter(req.user.tenantId) }
        : {};

    const centers = await Center.find(filter).sort({ createdAt: -1 });
    res.status(200).json(centers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching centers', error });
  }
};

export const getCenterPolicy = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = req.user?.tenantId?.trim();
    if (!tenantId) {
      return res.status(400).json({ message: 'No institute context for this user.' });
    }
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const policy = await buildCenterPolicyPayload(tenantId);
    res.status(200).json(policy);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching center policy', error });
  }
};

export const getPublicCenterPortal = async (req: Request, res: Response) => {
  try {
    const { tenant } = req.params;
    const tenantName = Array.isArray(tenant) ? tenant[0] : tenant;
    const center = await getCenterByTenant(tenantName);
    if (!center || !isFeatureEnabled(center, 'publicPortalEnabled')) {
      return res.status(404).json({ message: 'Public portal is not available for this institute.' });
    }
    res.status(200).json(publicPortalPayload(center));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching public portal', error });
  }
};

export const getCenterById = async (req: Request, res: Response) => {
  try {
    const center = await Center.findById(req.params.id);
    if (!center) {
      return res.status(404).json({ message: 'Center not found' });
    }
    res.status(200).json(center);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching center', error });
  }
};

export const createCenter = async (req: Request, res: Response) => {
  try {
    const { email, phone } = req.body;
    
    // Check if center with email or phone already exists
    const existingCenter = await Center.findOne({
      $or: [{ email }, { phone }]
    });

    if (existingCenter) {
      if (existingCenter.email === email) {
        return res.status(400).json({ message: 'A center with this email already exists.' });
      }
      if (existingCenter.phone === phone) {
        return res.status(400).json({ message: 'A center with this mobile number already exists.' });
      }
    }

    const newCenter = new Center(req.body);
    const savedCenter = await newCenter.save();
    res.status(201).json(savedCenter);
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Error creating center', error });
  }
};

export const updateCenter = async (req: Request, res: Response) => {
  try {
    const updatedCenter = await Center.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updatedCenter) {
      return res.status(404).json({ message: 'Center not found' });
    }
    res.status(200).json(updatedCenter);
  } catch (error) {
    res.status(500).json({ message: 'Error updating center', error });
  }
};

export const deleteCenter = async (req: Request, res: Response) => {
  try {
    const deletedCenter = await Center.findByIdAndDelete(req.params.id);
    if (!deletedCenter) {
      return res.status(404).json({ message: 'Center not found' });
    }
    res.status(200).json({ message: 'Center deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting center', error });
  }
};

export const seedCenters = async () => {
  try {
    const defaultTenant = "Thinklance ";
    
    // Clean up any incorrectly named center
    await Center.deleteOne({ name: "Thinklance " });
    
    const count = await Center.countDocuments({ name: "Thinklance Center" });
    if (count === 0) {
      console.log(`Seeding default centers for tenant: "${defaultTenant}"...`);
      await Center.create([
        {
          name: "Thinklance Center",
          tenantName: defaultTenant,
          location: "New York, NY (Hybrid)",
          manager: "Marcus Vance",
          email: "info@thinklance.com",
          phone: "+1 (555) 019-2834",
          status: "active",
          enabledModules: ["crm", "students", "trainers", "courses", "attendance", "fees", "jobs", "analytics"]
        },
        {
          name: "Apex Downtown Hub",
          tenantName: defaultTenant,
          location: "Downtown Campus, NY",
          manager: "Marcus Vance",
          email: "apex@thinklance.com",
          phone: "+1 (555) 019-9999",
          status: "active",
          enabledModules: ["crm", "students", "trainers", "courses", "attendance", "fees", "jobs", "analytics"]
        }
      ]);
      console.log("Seeding default centers complete.");
    }
  } catch (error) {
    console.error("Error seeding default centers:", error);
  }
};

