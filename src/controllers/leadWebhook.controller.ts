import { Request, Response } from 'express';
import LeadWebhookIntegration from '../models/LeadWebhookIntegration';
import { AuthRequest } from '../middleware/auth.middleware';
import { tenantFilter } from '../utils/bdeStats';
import {
  authenticateIntegration,
  createLeadFromWebhook,
  generateIntegrationApiKey,
  serializeIntegration,
} from '../services/leadWebhook.service';

function paramId(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || '';
}

function resolveTenantId(req: AuthRequest) {
  return req.user?.tenantId || 'ERP';
}

function extractApiKey(req: Request) {
  const header =
    req.header('x-api-key') ||
    req.header('X-API-Key') ||
    (req.headers.authorization?.toLowerCase().startsWith('bearer ')
      ? req.headers.authorization.slice(7)
      : '');
  const queryKey = typeof req.query.apiKey === 'string' ? req.query.apiKey : '';
  const bodyKey =
    req.body && typeof req.body === 'object' && typeof (req.body as any).apiKey === 'string'
      ? (req.body as any).apiKey
      : '';
  return String(header || queryKey || bodyKey || '').trim();
}

/** Public webhook — no JWT */
export const receiveLeadWebhook = async (req: Request, res: Response) => {
  try {
    const auth = await authenticateIntegration(extractApiKey(req));
    if (!auth.ok) {
      return res.status(auth.status).json({ success: false, message: auth.message });
    }

    const body =
      req.body && typeof req.body === 'object' && !Array.isArray(req.body)
        ? (req.body as Record<string, unknown>)
        : {};

    const result = await createLeadFromWebhook(auth.integration, body);
    if (!result.ok) {
      return res.status(result.status).json({ success: false, message: result.message });
    }

    return res.status(result.created ? 201 : 200).json({
      success: true,
      created: result.created,
      leadId: result.leadId,
      source: result.source,
      message: result.created ? 'Lead created' : result.message || 'Lead already exists',
    });
  } catch (error: any) {
    console.error('[LeadWebhook] Error:', error);
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to process lead webhook',
    });
  }
};

export const listLeadIntegrations = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const filter: Record<string, unknown> = {};
    if (req.user?.role !== 'super_admin' || req.user?.tenantId) {
      filter.tenantId = tenantFilter(tenantId);
    }

    const items = await LeadWebhookIntegration.find(filter).sort({ createdAt: -1 });
    res.json(items.map((item) => serializeIntegration(item)));
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Error listing integrations' });
  }
};

export const createLeadIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const {
      name,
      source,
      defaultCourse,
      assignedBdeId,
      counsellor,
    } = req.body as {
      name?: string;
      source?: string;
      defaultCourse?: string;
      assignedBdeId?: string;
      counsellor?: string;
    };

    if (!name?.trim() || !source?.trim()) {
      return res.status(400).json({ message: 'name and source are required' });
    }

    const apiKey = generateIntegrationApiKey(source, tenantId);
    const created = await LeadWebhookIntegration.create({
      tenantId,
      name: name.trim(),
      source: source.trim(),
      apiKey,
      isActive: true,
      defaultCourse: defaultCourse?.trim() || 'General Enquiry',
      assignedBdeId: assignedBdeId || '',
      counsellor: counsellor || '',
      createdBy: req.user?.id || '',
    });

    res.status(201).json({
      success: true,
      integration: serializeIntegration(created, { revealKey: true }),
      message: 'Integration created. Copy the API key now — it is shown in full only once.',
    });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error creating integration' });
  }
};

export const updateLeadIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const id = paramId(req.params.id);
    const integration = await LeadWebhookIntegration.findOne({
      _id: id,
      ...(req.user?.role === 'super_admin' && !req.user?.tenantId
        ? {}
        : { tenantId: tenantFilter(tenantId) }),
    });
    if (!integration) return res.status(404).json({ message: 'Integration not found' });

    const {
      name,
      source,
      defaultCourse,
      assignedBdeId,
      counsellor,
      isActive,
    } = req.body as {
      name?: string;
      source?: string;
      defaultCourse?: string;
      assignedBdeId?: string;
      counsellor?: string;
      isActive?: boolean;
    };

    if (typeof name === 'string' && name.trim()) integration.name = name.trim();
    if (typeof source === 'string' && source.trim()) integration.source = source.trim();
    if (typeof defaultCourse === 'string') {
      integration.defaultCourse = defaultCourse.trim() || 'General Enquiry';
    }
    if (typeof assignedBdeId === 'string') integration.assignedBdeId = assignedBdeId;
    if (typeof counsellor === 'string') integration.counsellor = counsellor;
    if (typeof isActive === 'boolean') integration.isActive = isActive;

    await integration.save();
    res.json({ success: true, integration: serializeIntegration(integration) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error updating integration' });
  }
};

export const rotateLeadIntegrationKey = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const id = paramId(req.params.id);
    const integration = await LeadWebhookIntegration.findOne({
      _id: id,
      ...(req.user?.role === 'super_admin' && !req.user?.tenantId
        ? {}
        : { tenantId: tenantFilter(tenantId) }),
    });
    if (!integration) return res.status(404).json({ message: 'Integration not found' });

    integration.apiKey = generateIntegrationApiKey(integration.source, integration.tenantId);
    await integration.save();

    res.json({
      success: true,
      integration: serializeIntegration(integration, { revealKey: true }),
      message: 'API key rotated. Copy the new key now.',
    });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error rotating API key' });
  }
};

export const deleteLeadIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const id = paramId(req.params.id);
    const integration = await LeadWebhookIntegration.findOne({
      _id: id,
      ...(req.user?.role === 'super_admin' && !req.user?.tenantId
        ? {}
        : { tenantId: tenantFilter(tenantId) }),
    });
    if (!integration) return res.status(404).json({ message: 'Integration not found' });

    // Soft-disable by default; hard delete if ?hard=true
    if (String(req.query.hard || '') === 'true') {
      await integration.deleteOne();
      return res.json({ success: true, deleted: true });
    }

    integration.isActive = false;
    await integration.save();
    res.json({ success: true, integration: serializeIntegration(integration) });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error deleting integration' });
  }
};

export const revealLeadIntegrationKey = async (req: AuthRequest, res: Response) => {
  try {
    const tenantId = resolveTenantId(req);
    const id = paramId(req.params.id);
    const integration = await LeadWebhookIntegration.findOne({
      _id: id,
      ...(req.user?.role === 'super_admin' && !req.user?.tenantId
        ? {}
        : { tenantId: tenantFilter(tenantId) }),
    });
    if (!integration) return res.status(404).json({ message: 'Integration not found' });

    res.json({
      success: true,
      integration: serializeIntegration(integration, { revealKey: true }),
    });
  } catch (error: any) {
    res.status(400).json({ message: error?.message || 'Error revealing API key' });
  }
};
