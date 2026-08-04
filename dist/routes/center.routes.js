"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const center_controller_1 = require("../controllers/center.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
router.get('/public/:tenant', center_controller_1.getPublicCenterPortal);
router.get('/policy/me', auth_middleware_1.verifyToken, center_controller_1.getCenterPolicy);
router.get('/', auth_middleware_1.optionalVerifyToken, center_controller_1.getCenters);
router.get('/:id', center_controller_1.getCenterById);
// Protected routes (we'll just expose them directly for now but in a real app these would use authMiddleware)
router.post('/', center_controller_1.createCenter);
router.put('/:id', center_controller_1.updateCenter);
router.delete('/:id', center_controller_1.deleteCenter);
exports.default = router;
