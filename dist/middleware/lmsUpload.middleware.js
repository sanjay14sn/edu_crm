"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.lmsUpload = exports.fileUpload = void 0;
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const allowedMimeTypes = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/octet-stream',
]);
const allowedExtensions = new Set([
    '.mp4',
    '.webm',
    '.mov',
    '.avi',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.txt',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
]);
const fileFilter = (_req, file, cb) => {
    const ext = path_1.default.extname(file.originalname).toLowerCase();
    if (allowedMimeTypes.has(file.mimetype) || allowedExtensions.has(ext)) {
        cb(null, true);
        return;
    }
    cb(new Error('Unsupported file type. Upload videos, PDFs, images, or common document formats (DOC, DOCX, XLS, PPT, TXT).'));
};
exports.fileUpload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    fileFilter,
    limits: { fileSize: 250 * 1024 * 1024 },
});
/** @deprecated Use fileUpload — kept for existing LMS route imports */
exports.lmsUpload = exports.fileUpload;
