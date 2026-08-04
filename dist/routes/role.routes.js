"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const role_controller_1 = require("../controllers/role.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
router.use(auth_middleware_1.verifyToken);
router.use((0, auth_middleware_1.requireRole)(['super_admin']));
router.get('/features', role_controller_1.getRoleFeatures);
router.get('/', role_controller_1.getRoles);
router.get('/:id', role_controller_1.getRoleById);
router.post('/', role_controller_1.createRole);
router.post('/:id/duplicate', role_controller_1.duplicateRole);
router.put('/:id', role_controller_1.updateRole);
router.delete('/:id', role_controller_1.deleteRole);
exports.default = router;
