import { Readable } from 'stream';
import type { UploadApiResponse } from 'cloudinary';
import path from 'path';
import { cloudinary, isCloudinaryConfigured } from '../config/cloudinary';

type UploadCategory = 'video' | 'image' | 'document';

function categorizeFile(mimetype: string, originalname: string): UploadCategory {
  const ext = path.extname(originalname).toLowerCase();

  if (mimetype.startsWith('video/') || ['.mp4', '.webm', '.mov', '.avi'].includes(ext)) {
    return 'video';
  }
  if (mimetype.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].includes(ext)) {
    return 'image';
  }
  return 'document';
}

function buildPublicId(originalname: string, category: UploadCategory) {
  const ext = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext).replace(/[^a-zA-Z0-9._-]/g, '_') || 'file';
  const suffix = category === 'document' && ext ? ext : '';
  return `${Date.now()}-${base}${suffix}`;
}

export async function uploadToCloudinary(
  buffer: Buffer,
  originalname: string,
  mimetype: string,
  folder: string
): Promise<UploadApiResponse> {
  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  const category = categorizeFile(mimetype, originalname);
  const subfolder = category === 'video' ? 'videos' : category === 'image' ? 'images' : 'documents';
  const fullFolder = `${folder}/${subfolder}`;
  const resourceType = category === 'video' ? 'video' : category === 'image' ? 'image' : 'raw';

  const options = {
    folder: fullFolder,
    resource_type: resourceType as 'video' | 'image' | 'raw',
    public_id: buildPublicId(originalname, category),
    use_filename: false,
    unique_filename: false,
    overwrite: false,
  };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
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

    Readable.from(buffer).pipe(uploadStream);
  });
}
