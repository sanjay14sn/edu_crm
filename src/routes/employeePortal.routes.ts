import { Router } from 'express';
import { verifyToken, requireRole } from '../middleware/auth.middleware';
import {
  getSummary,
  clockIn,
  clockOut,
  getAttendance,
  requestCorrection,
  listTasks,
  createTask,
  updateTask,
  listDailyReports,
  submitDailyReport,
  getLeave,
  applyLeave,
  cancelLeave,
  listHolidays,
  listPayslips,
  listDocuments,
  adminListTasks,
  adminCreateTask,
  adminListDailyReports,
  adminListCorrections,
  adminReviewCorrection,
} from '../controllers/employeePortal.controller';

const router = Router();

router.use(verifyToken);

const admin = requireRole(['owner', 'super_admin']);
router.get('/admin/tasks', admin, adminListTasks);
router.post('/admin/tasks', admin, adminCreateTask);
router.get('/admin/daily-reports', admin, adminListDailyReports);
router.get('/admin/attendance/corrections', admin, adminListCorrections);
router.put('/admin/attendance/corrections/:id/review', admin, adminReviewCorrection);

router.use(requireRole(['employee']));

router.get('/summary', getSummary);

router.get('/attendance', getAttendance);
router.post('/attendance/clock-in', clockIn);
router.post('/attendance/clock-out', clockOut);
router.post('/attendance/corrections', requestCorrection);

router.get('/tasks', listTasks);
router.post('/tasks', createTask);
router.patch('/tasks/:id', updateTask);

router.get('/daily-reports', listDailyReports);
router.post('/daily-reports', submitDailyReport);

router.get('/leave', getLeave);
router.post('/leave', applyLeave);
router.patch('/leave/:id/cancel', cancelLeave);

router.get('/holidays', listHolidays);
router.get('/payslips', listPayslips);
router.get('/documents', listDocuments);

export default router;
