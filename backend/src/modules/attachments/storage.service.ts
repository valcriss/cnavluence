import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { nanoid } from 'nanoid';
import { env } from '../../config/env.js';

export async function ensureUploadDir(): Promise<void> {
  if (env.UPLOAD_STORAGE === 'local') {
    await fs.mkdir(env.UPLOAD_LOCAL_PATH, { recursive: true });
  }
}

export async function saveLocalFile(file: Express.Multer.File): Promise<string> {
  await ensureUploadDir();
  const key = `${nanoid()}-${file.originalname}`;
  const target = path.join(env.UPLOAD_LOCAL_PATH, key);
  await fs.writeFile(target, file.buffer);
  return key;
}

export function getLocalFileStream(key: string) {
  return createReadStream(path.join(env.UPLOAD_LOCAL_PATH, key));
}
