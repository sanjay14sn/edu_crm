"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadToCloudinary = uploadToCloudinary;
const stream_1 = require("stream");
const path_1 = __importDefault(require("path"));
const cloudinary_1 = require("../config/cloudinary");
function categorizeFile(mimetype, originalname) {
    const ext = path_1.default.extname(originalname).toLowerCase();
    if (mimetype.startsWith('video/') || ['.mp4', '.webm', '.mov', '.avi'].includes(ext)) {
        return 'video';
    }
    if (mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
        return 'image';
    }
    return 'document';
}
function buildPublicId(originalname, category) {
    const ext = path_1.default.extname(originalname).toLowerCase();
    const base = path_1.default.basename(originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
    const suffix = category === 'document' && ext ? ext : '';
    return `${Date.now()}-${base}${suffix}`;
}
async function uploadToCloudinary(buffer, originalname, mimetype, folder) {
    if (!(0, cloudinary_1.isCloudinaryConfigured)()) {
        throw new Error('Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
    }
    const category = categorizeFile(mimetype, originalname);
    const subfolder = category === 'video' ? 'videos' : category === 'image' ? 'images' : 'documents';
    const fullFolder = `${folder}/${subfolder}`;
    const resourceType = category === 'video' ? 'video' : category === 'image' ? 'image' : 'raw';
    const options = {
        folder: fullFolder,
        resource_type: resourceType,
        public_id: buildPublicId(originalname, category),
        use_filename: false,
        unique_filename: false,
        overwrite: false,
    };
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary_1.cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            if (!result) {
                reject(new Error('Cloudinary upload returned no result'));
                return;
            }
            resolve(result);
        });
        stream_1.Readable.from(buffer).pipe(uploadStream);
    });
}
