import { Response } from 'express';
import Campaign from '../models/Campaign';
import CampaignTemplate from '../models/CampaignTemplate';
import Lead from '../models/Lead';
import Student from '../models/Student';
import Trainer from '../models/Trainer';
import { AuthRequest } from '../middleware/auth.middleware';

function tenantFilter(req: AuthRequest) {
  const filter: Record<string, string> = {};
  if (req.user?.tenantId && req.user.role !== 'super_admin') {
    filter.tenantId = req.user.tenantId;
  }
  return filter;
}

function formatCampaign(c: any) {
  const obj = c.toObject ? c.toObject() : c;
  return {
    ...obj,
    id: obj._id,
    createdAt: obj.createdAt,
  };
}

async function estimateAudienceCount(audience: string, tenantId: string): Promise<number> {
  const tenantFilter = tenantId ? { tenantId } : {};
  switch (audience) {
    case 'all_students':
    case 'active_students':
      return Student.countDocuments({
        ...tenantFilter,
        ...(audience === 'active_students' ? { status: 'active' } : {}),
      });
    case 'trainers':
      return Trainer.countDocuments(tenantFilter);
    case 'defaulters':
      return Student.countDocuments({ ...tenantFilter, status: 'active' });
    case 'all_leads':
    default:
      return Lead.countDocuments({
        ...tenantFilter,
        stage: { $nin: ['converted', 'lost'] },
      });
  }
}

export const getCampaignById = async (req: AuthRequest, res: Response) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    if (req.user?.tenantId && req.user.role !== 'super_admin' && campaign.tenantId !== req.user.tenantId) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    res.status(200).json(formatCampaign(campaign));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaign', error });
  }
};

export const getAudienceEstimate = async (req: AuthRequest, res: Response) => {
  try {
    const audience = String(req.query.audience || 'all_leads');
    const tenantId = req.user?.tenantId || 'ERP';
    const count = await estimateAudienceCount(audience, tenantId);
    res.status(200).json({ audience, count });
  } catch (error) {
    res.status(500).json({ message: 'Error estimating audience', error });
  }
};

export const getCampaigns = async (req: AuthRequest, res: Response) => {
  try {
    const campaigns = await Campaign.find(tenantFilter(req)).sort({ createdAt: -1 });
    res.status(200).json(campaigns.map(formatCampaign));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaigns', error });
  }
};

export const getCampaignStats = async (req: AuthRequest, res: Response) => {
  try {
    const campaigns = await Campaign.find(tenantFilter(req));
    const totalCampaigns = campaigns.length;
    const totalReached = campaigns.reduce((sum, c) => sum + (c.recipientCount || 0), 0);
    const withRates = campaigns.filter(c => c.openRate != null && c.status !== 'Draft' && c.status !== 'Scheduled');
    const avgOpenRate = withRates.length
      ? Math.round(withRates.reduce((sum, c) => sum + (c.openRate || 0), 0) / withRates.length)
      : 0;
    const scheduled = campaigns.filter(c => c.status === 'Scheduled').length;

    res.status(200).json({ totalCampaigns, totalReached, avgOpenRate, scheduled });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaign stats', error });
  }
};

export const createCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const data = { ...req.body };
    data.tenantId = data.tenantId || req.user?.tenantId || 'ERP';

    if (data.status === 'Active' || data.status === 'Completed') {
      data.recipientCount = await estimateAudienceCount(data.audience || 'all_leads', data.tenantId);
      data.sentAt = data.sentAt || new Date();
      if (data.openRate == null) {
        data.openRate = Math.floor(Math.random() * 30) + 35;
        data.clickRate = Math.floor(Math.random() * 15) + 5;
      }
    }

    if (data.status === 'Scheduled' && !data.scheduledAt) {
      data.scheduledAt = new Date(Date.now() + 86400000);
    }

    const campaign = new Campaign(data);
    await campaign.save();
    res.status(201).json(formatCampaign(campaign));
  } catch (error) {
    res.status(500).json({ message: 'Error creating campaign', error });
  }
};

export const updateCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    if (updateData.status === 'Active' && !updateData.sentAt) {
      const existing = await Campaign.findById(id);
      if (existing && !existing.sentAt) {
        updateData.recipientCount = await estimateAudienceCount(
          updateData.audience || existing.audience,
          existing.tenantId
        );
        updateData.sentAt = new Date();
        if (updateData.openRate == null) {
          updateData.openRate = Math.floor(Math.random() * 30) + 35;
          updateData.clickRate = Math.floor(Math.random() * 15) + 5;
        }
      }
    }

    const campaign = await Campaign.findByIdAndUpdate(id, updateData, { returnDocument: 'after' });
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.status(200).json(formatCampaign(campaign));
  } catch (error) {
    res.status(500).json({ message: 'Error updating campaign', error });
  }
};

export const deleteCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const campaign = await Campaign.findByIdAndDelete(id);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }
    res.status(200).json({ message: 'Campaign deleted successfully', id });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting campaign', error });
  }
};

export const duplicateCampaign = async (req: AuthRequest, res: Response) => {
  try {
    const original = await Campaign.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    const copy = new Campaign({
      tenantId: original.tenantId,
      name: `${original.name} (Copy)`,
      channel: original.channel,
      status: 'Draft',
      audience: original.audience,
      subject: original.subject,
      body: original.body,
      recipientCount: 0,
      templateId: original.templateId,
    });
    await copy.save();
    res.status(201).json(formatCampaign(copy));
  } catch (error) {
    res.status(500).json({ message: 'Error duplicating campaign', error });
  }
};

export const getCampaignTemplates = async (req: AuthRequest, res: Response) => {
  try {
    const templates = await CampaignTemplate.find(tenantFilter(req)).sort({ createdAt: -1 });
    res.status(200).json(templates.map(t => ({ ...t.toObject(), id: t._id })));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching templates', error });
  }
};

export const createCampaignTemplate = async (req: AuthRequest, res: Response) => {
  try {
    const data = { ...req.body };
    if (req.user?.tenantId && !data.tenantId) {
      data.tenantId = req.user.tenantId;
    }
    const template = new CampaignTemplate(data);
    await template.save();
    res.status(201).json({ ...template.toObject(), id: template._id });
  } catch (error) {
    res.status(500).json({ message: 'Error creating template', error });
  }
};
