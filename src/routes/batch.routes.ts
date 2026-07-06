import { Router } from 'express';
import { getBatches, createBatch, updateBatch, updateBatchStatus, updateBatchStudentRemarks, deleteBatch, getBatchById } from '../controllers/batch.controller';
import { verifyToken } from '../middleware/auth.middleware';

const router = Router();

router.use(verifyToken);

router.get('/', getBatches);
router.get('/:id', getBatchById);
router.post('/', createBatch);
router.put('/:id', updateBatch);
router.put('/:id/remarks', updateBatchStudentRemarks);
router.patch('/:id/status', updateBatchStatus);
router.delete('/:id', deleteBatch);


export default router;
