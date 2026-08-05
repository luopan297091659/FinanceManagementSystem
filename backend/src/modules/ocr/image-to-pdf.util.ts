import { basename, extname } from 'node:path';
import { PDFDocument } from 'pdf-lib';

const PDF_MIME_TYPE = 'application/pdf';
const CONVERTIBLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);
const A4_PORTRAIT = { width: 595.28, height: 841.89 };
const PAGE_MARGIN = 24;

export type WebhookFile = {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  convertedToPdf: boolean;
};

export type SourceWebhookFile = Omit<WebhookFile, 'convertedToPdf'>;

export async function preparePdfFilesForWebhook(files: SourceWebhookFile[]): Promise<WebhookFile[]> {
  const preparedFiles = await Promise.all(files.map((file) => prepareFileForWebhook(
    file.buffer,
    file.fileName,
    file.mimeType,
  )));
  const invalidFiles = preparedFiles.filter((file) => (
    file.mimeType !== PDF_MIME_TYPE || !hasPdfSignature(file.buffer)
  ));

  if (invalidFiles.length) {
    const details = invalidFiles.map((file) => `${file.fileName} (${file.mimeType})`).join(', ');
    throw new Error(
      `Webhook accepts PDF output only. Unsupported or invalid file(s): ${details}. `
      + 'Upload PDF, JPG/JPEG or PNG files.',
    );
  }

  return preparedFiles;
}

export async function prepareFileForWebhook(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<WebhookFile> {
  if (!CONVERTIBLE_IMAGE_TYPES.has(mimeType)) {
    return { buffer, fileName, mimeType, convertedToPdf: false };
  }

  try {
    const document = await PDFDocument.create();
    const image = mimeType === 'image/png'
      ? await document.embedPng(buffer)
      : await document.embedJpg(buffer);
    const landscape = image.width > image.height;
    const pageWidth = landscape ? A4_PORTRAIT.height : A4_PORTRAIT.width;
    const pageHeight = landscape ? A4_PORTRAIT.width : A4_PORTRAIT.height;
    const availableWidth = pageWidth - PAGE_MARGIN * 2;
    const availableHeight = pageHeight - PAGE_MARGIN * 2;
    const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const page = document.addPage([pageWidth, pageHeight]);

    page.drawImage(image, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });

    const pdfBytes = await document.save();
    const extension = extname(fileName);
    const baseName = basename(fileName, extension) || 'image';
    return {
      buffer: Buffer.from(pdfBytes),
      fileName: `${baseName}.pdf`,
      mimeType: PDF_MIME_TYPE,
      convertedToPdf: true,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert image "${fileName}" to PDF: ${detail}`);
  }
}

function hasPdfSignature(buffer: Buffer): boolean {
  return buffer.subarray(0, Math.min(buffer.length, 1024)).includes(Buffer.from('%PDF-'));
}
