import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { requireCenterFeature } from '../middleware/centerPolicy.middleware';
import { lmsUpload } from '../middleware/lmsUpload.middleware';
import { uploadLmsMedia } from '../controllers/upload.controller';
import { generateLmsContent, resolveVideoMetadata } from '../controllers/lms.controller';

const router = Router();

router.use(verifyToken);

router.post('/generate', requireCenterFeature('enableLmsAiTutor'), generateLmsContent);
router.post('/video-metadata', resolveVideoMetadata);

router.post(
  '/batches/:batchId/upload',
  lmsUpload.single('file'),
  uploadLmsMedia
);

export default router;
