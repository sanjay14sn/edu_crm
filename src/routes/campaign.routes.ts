import { Router } from 'express';
import {
  getCampaigns,
  getCampaignStats,
  getCampaignById,
  getAudienceEstimate,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  duplicateCampaign,
  getCampaignTemplates,
  createCampaignTemplate,
} from '../controllers/campaign.controller';
import { verifyToken } from '../middleware/auth.middleware';
import { requireCenterFeature } from '../middleware/centerPolicy.middleware';

const router = Router();

router.use(verifyToken);
router.use(requireCenterFeature('enableCampaigns'));

router.get('/stats', getCampaignStats);
router.get('/audience-estimate', getAudienceEstimate);
router.get('/templates', getCampaignTemplates);
router.post('/templates', createCampaignTemplate);
router.get('/', getCampaigns);
router.get('/:id', getCampaignById);
router.post('/', createCampaign);
router.post('/:id/duplicate', duplicateCampaign);
router.put('/:id', updateCampaign);
router.delete('/:id', deleteCampaign);

export default router;
