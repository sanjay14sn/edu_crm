"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const platform_controller_1 = require("../controllers/platform.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.get('/usage', (0, auth_middleware_1.requireRole)(['super_admin']), platform_controller_1.getPlatformUsage);
router.get('/institute-profile', (0, auth_middleware_1.requireRole)(['owner']), platform_controller_1.getInstituteProfile);
exports.default = router;
