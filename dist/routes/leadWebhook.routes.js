"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../middleware/auth.middleware");
const leadWebhook_controller_1 = require("../controllers/leadWebhook.controller");
const router = (0, express_1.Router)();
/** Public unified lead webhook — auth via X-API-Key */
router.post('/webhooks/leads', leadWebhook_controller_1.receiveLeadWebhook);
/** Owner management */
const manage = [auth_middleware_1.verifyToken, (0, auth_middleware_1.requireRole)(['super_admin', 'owner'])];
router.get('/lead-integrations', ...manage, leadWebhook_controller_1.listLeadIntegrations);
router.post('/lead-integrations', ...manage, leadWebhook_controller_1.createLeadIntegration);
router.patch('/lead-integrations/:id', ...manage, leadWebhook_controller_1.updateLeadIntegration);
router.post('/lead-integrations/:id/rotate-key', ...manage, leadWebhook_controller_1.rotateLeadIntegrationKey);
router.get('/lead-integrations/:id/reveal-key', ...manage, leadWebhook_controller_1.revealLeadIntegrationKey);
router.delete('/lead-integrations/:id', ...manage, leadWebhook_controller_1.deleteLeadIntegration);
exports.default = router;
