"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireCenterFeature = requireCenterFeature;
const centerPolicy_1 = require("../utils/centerPolicy");
function requireCenterFeature(flag) {
    return async (req, res, next) => {
        const result = await (0, centerPolicy_1.assertFeature)(req.user?.tenantId, flag, req.user?.role);
        if (!result.ok) {
            return res.status(403).json({
                message: result.message,
                code: 'FEATURE_DISABLED',
                feature: flag,
            });
        }
        next();
    };
}
