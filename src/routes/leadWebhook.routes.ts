import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  receiveLeadWebhook,
  listLeadIntegrations,
  createLeadIntegration,
  updateLeadIntegration,
  rotateLeadIntegrationKey,
  deleteLeadIntegration,
  revealLeadIntegrationKey,
} from '../controllers/leadWebhook.controller';

const router = Router();

/** Public unified lead webhook — auth via X-API-Key */
router.post('/webhooks/leads', receiveLeadWebhook);

/** Owner management */
const manage = [verifyToken, requireRole(['super_admin', 'owner'])];

router.get('/lead-integrations', ...manage, listLeadIntegrations);
router.post('/lead-integrations', ...manage, createLeadIntegration);
router.patch('/lead-integrations/:id', ...manage, updateLeadIntegration);
router.post('/lead-integrations/:id/rotate-key', ...manage, rotateLeadIntegrationKey);
router.get('/lead-integrations/:id/reveal-key', ...manage, revealLeadIntegrationKey);
router.delete('/lead-integrations/:id', ...manage, deleteLeadIntegration);

export default router;
