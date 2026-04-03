import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const bucket = process.env.S3_BUCKET;
const region = process.env.S3_REGION;
const endpoint = process.env.S3_ENDPOINT;
const accessKeyId = process.env.S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

const s3Enabled = Boolean(bucket && region && endpoint && accessKeyId && secretAccessKey);

const s3Client = s3Enabled
  ? new S3Client({
      region,
      endpoint,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
      forcePathStyle: false,
    })
  : null;

const sanitizeFileName = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]/g, '_');

export const getStorageMode = (): 's3' | 'local' => (s3Enabled ? 's3' : 'local');

export const storeAttachment = async ({
  attachmentId,
  originalName,
  contentType,
  buffer,
}: {
  attachmentId: string;
  originalName: string;
  contentType: string;
  buffer: Buffer;
}): Promise<{ storageKey: string }> => {
  const safeName = sanitizeFileName(originalName || 'attachment.bin');
  const storageKey = `attachments/${attachmentId}-${safeName}`;

  if (s3Client && bucket) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return { storageKey };
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, `${attachmentId}-${safeName}`), buffer);
  return { storageKey: `${attachmentId}-${safeName}` };
};

export const loadAttachment = async ({
  storageKey,
}: {
  storageKey: string;
}): Promise<Buffer> => {
  if (s3Client && bucket) {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
      }),
    );

    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) {
      throw new Error('Attachment body missing');
    }
    return Buffer.from(bytes);
  }

  return fs.readFile(path.join(UPLOAD_DIR, storageKey));
};
