"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFile = exports.uploadLmsMedia = void 0;
const cloudinary_service_1 = require("../services/cloudinary.service");
const usageTracker_service_1 = require("../services/usageTracker.service");
function buildUploadResponse(req, result) {
    if (!req.file) {
        throw new Error('No file uploaded');
    }
    return {
        url: result.secure_url,
        fileName: req.file.originalname,
        storedName: result.public_id,
        mimeType: req.file.mimetype,
        size: req.file.size,
        cloudinaryId: result.public_id,
        resourceType: result.resource_type,
    };
}
const uploadLmsMedia = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const batchId = String(req.params.batchId || 'general').replace(/[^a-zA-Z0-9-_]/g, '');
        const tenantId = (req.user?.tenantId || 'erp').replace(/[^a-zA-Z0-9-_]/g, '');
        const folder = `edu-crm/${tenantId}/lms/${batchId}`;
        const result = await (0, cloudinary_service_1.uploadToCloudinary)(req.file.buffer, req.file.originalname, req.file.mimetype, folder);
        await (0, usageTracker_service_1.recordCloudinaryUpload)(tenantId, req.file.size);
        res.status(201).json(buildUploadResponse(req, result));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error uploading LMS media';
        console.error('LMS Cloudinary upload failed:', error);
        res.status(500).json({ message });
    }
};
exports.uploadLmsMedia = uploadLmsMedia;
const uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const scope = String(req.query.scope || 'documents')
            .replace(/[^a-zA-Z0-9-_]/g, '')
            .toLowerCase();
        const tenantId = (req.user?.tenantId || 'erp').replace(/[^a-zA-Z0-9-_]/g, '');
        const folder = `edu-crm/${tenantId}/${scope}`;
        const result = await (0, cloudinary_service_1.uploadToCloudinary)(req.file.buffer, req.file.originalname, req.file.mimetype, folder);
        await (0, usageTracker_service_1.recordCloudinaryUpload)(tenantId, req.file.size);
        res.status(201).json(buildUploadResponse(req, result));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : 'Error uploading file';
        console.error('Cloudinary upload failed:', error);
        res.status(500).json({ message });
    }
};
exports.uploadFile = uploadFile;
