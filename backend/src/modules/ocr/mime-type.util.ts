import { extname } from 'node:path';

export const MIME_TYPE_MAP: Readonly<Record<string, string>> = Object.freeze({
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
});

const VALID_MIME_TYPE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;

export function detectMimeType(fileName: string | null | undefined, providedMimeType?: string | null): string {
  const normalizedMime = typeof providedMimeType === 'string'
    ? providedMimeType.split(';')[0]?.trim().toLowerCase()
    : '';

  if (
    normalizedMime
    && normalizedMime !== 'application/octet-stream'
    && VALID_MIME_TYPE.test(normalizedMime)
  ) {
    return normalizedMime;
  }

  const safeName = typeof fileName === 'string' ? fileName : '';
  const extension = extname(safeName).toLowerCase();
  return MIME_TYPE_MAP[extension] || 'application/octet-stream';
}
