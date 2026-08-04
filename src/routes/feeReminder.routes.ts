import { Router } from 'express';
import {
  callAllFeeReminders,
  callFeeReminders,
  getFeeReminderCalls,
  getFeeReminderTargets,
  handleExotelFeeReminderWebhook,
  getFeeReminderEmails,
  sendFeeReminderEmails,
  sendAllFeeReminderEmails,
} from '../controllers/feeReminder.controller';
import { verifyToken, requireRole } from '../middleware/auth.middleware';

const router = Router();

router.post('/webhooks/exotel/fee-reminder-status', handleExotelFeeReminderWebhook);

const protect = [verifyToken, requireRole(['owner', 'super_admin'])];

router.get('/fees/reminders/targets', ...protect, getFeeReminderTargets);
router.get('/fees/reminders/calls', ...protect, getFeeReminderCalls);
router.post('/fees/reminders/call', ...protect, callFeeReminders);
router.post('/fees/reminders/call-all', ...protect, callAllFeeReminders);

router.get('/fees/reminders/emails', ...protect, getFeeReminderEmails);
router.post('/fees/reminders/email', ...protect, sendFeeReminderEmails);
router.post('/fees/reminders/email-all', ...protect, sendAllFeeReminderEmails);

export default router;

