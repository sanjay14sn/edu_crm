"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInstituteProfile = exports.getPlatformUsage = void 0;
const cloudinary_1 = require("../config/cloudinary");
const formatBytes_1 = require("../utils/formatBytes");
const usageTracker_service_1 = require("../services/usageTracker.service");
const instituteProfile_service_1 = require("../services/instituteProfile.service");
const getPlatformUsage = async (_req, res) => {
    try {
        const snapshot = await (0, usageTracker_service_1.getTenantUsageSnapshot)();
        let cloudinaryAccount = { configured: (0, cloudinary_1.isCloudinaryConfigured)() };
        if ((0, cloudinary_1.isCloudinaryConfigured)()) {
            try {
                const usage = await cloudinary_1.cloudinary.api.usage();
                const storageBytes = Number(usage?.storage?.usage || usage?.resources?.usage || 0);
                const bandwidthBytes = Number(usage?.bandwidth?.usage || 0);
                cloudinaryAccount = {
                    configured: true,
                    storageBytes,
                    storageLabel: (0, formatBytes_1.formatBytes)(storageBytes),
                    bandwidthBytes,
                    bandwidthLabel: (0, formatBytes_1.formatBytes)(bandwidthBytes),
                    resources: Number(usage?.resources?.usage || 0),
                    derivedResources: Number(usage?.derived_resources?.usage || 0),
                };
            }
            catch (error) {
                console.warn('Cloudinary account usage fetch failed:', error);
            }
        }
        res.status(200).json({
            ...snapshot,
            cloudinaryAccount,
            generatedAt: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching platform usage', error });
    }
};
exports.getPlatformUsage = getPlatformUsage;
const getInstituteProfile = async (req, res) => {
    try {
        const tenantId = req.user?.tenantId;
        if (!tenantId) {
            return res.status(400).json({ message: 'Tenant context is required for institute profile' });
        }
        const profile = await (0, instituteProfile_service_1.getInstituteProfileSnapshot)(tenantId);
        res.status(200).json(profile);
    }
    catch (error) {
        res.status(500).json({ message: 'Error fetching institute profile', error });
    }
};
exports.getInstituteProfile = getInstituteProfile;
