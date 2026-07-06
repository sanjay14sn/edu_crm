import { Router } from 'express';
import { verifyToken } from '../middleware/auth.middleware';
import { fileUpload } from '../middleware/lmsUpload.middleware';
import { uploadFile } from '../controllers/upload.controller';

const router = Router();

router.use(verifyToken);

router.post('/', fileUpload.single('file'), uploadFile);

export default router;
