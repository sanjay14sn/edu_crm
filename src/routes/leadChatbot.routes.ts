import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  getGmailChatbotStatus,
  getLeadChat,
  sendLeadChatReply,
  triggerLeadOutreach,
  runInboundScanNow,
  runReplyScanNow,
  getLeadChatbotGlobalSettings,
  updateLeadChatbotGlobalSettings,
  reconnectGmail,
} from '../controllers/leadChatbot.controller';

const router = Router();

router.use(verifyToken);
router.use(requireRole(['super_admin', 'owner', 'bde']));

router.get('/gmail/status', getGmailChatbotStatus);
router.post('/gmail/reconnect', reconnectGmail);
router.get('/settings', getLeadChatbotGlobalSettings);
router.patch('/settings', requireRole(['super_admin', 'owner']), updateLeadChatbotGlobalSettings);
router.post('/inbound/scan', runInboundScanNow);
router.post('/replies/scan', runReplyScanNow);

router.get('/leads/:leadId/chat', getLeadChat);
router.post('/leads/:leadId/chat/reply', sendLeadChatReply);
router.post('/leads/:leadId/chat/outreach', triggerLeadOutreach);

export default router;
