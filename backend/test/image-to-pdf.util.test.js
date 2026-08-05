const assert = require('node:assert/strict');
const test = require('node:test');
const { createCanvas } = require('@napi-rs/canvas');
const { PDFDocument } = require('pdf-lib');
const {
  prepareFileForWebhook,
  preparePdfFilesForWebhook,
} = require('../dist/modules/ocr/image-to-pdf.util.js');

function createImage(mimeType, width = 120, height = 80) {
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  context.fillStyle = '#0f766e';
  context.fillRect(0, 0, width, height);
  return canvas.toBuffer(mimeType);
}

for (const scenario of [
  { mimeType: 'image/jpeg', fileName: 'receipt.JPG' },
  { mimeType: 'image/png', fileName: 'invoice.png' },
]) {
  test(`converts ${scenario.mimeType} to a valid single-page PDF`, async () => {
    const result = await prepareFileForWebhook(
      createImage(scenario.mimeType),
      scenario.fileName,
      scenario.mimeType,
    );

    assert.equal(result.fileName, `${scenario.fileName.replace(/\.[^.]+$/, '')}.pdf`);
    assert.equal(result.mimeType, 'application/pdf');
    assert.equal(result.convertedToPdf, true);
    assert.equal(result.buffer.subarray(0, 4).toString('ascii'), '%PDF');
    const document = await PDFDocument.load(result.buffer);
    assert.equal(document.getPageCount(), 1);
  });
}

test('keeps non-image files unchanged', async () => {
  const source = Buffer.from('%PDF-existing');
  const result = await prepareFileForWebhook(source, 'existing.pdf', 'application/pdf');

  assert.equal(result.buffer, source);
  assert.equal(result.fileName, 'existing.pdf');
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(result.convertedToPdf, false);
});

test('sends a converted image as a PDF multipart file', async () => {
  const result = await prepareFileForWebhook(
    createImage('image/png'),
    'scan.png',
    'image/png',
  );
  const form = new FormData();
  form.append('requestFile', new Blob([result.buffer], { type: result.mimeType }), result.fileName);
  const multipartBody = await new Response(form).text();

  assert.match(multipartBody, /name="requestFile"; filename="scan\.pdf"/);
  assert.match(multipartBody, /Content-Type: application\/pdf/);
});

test('rejects corrupt image data with the file name in the error', async () => {
  await assert.rejects(
    prepareFileForWebhook(Buffer.from('not-an-image'), 'broken.png', 'image/png'),
    /Failed to convert image "broken\.png" to PDF/,
  );
});

test('prepares mixed PDF and image input as PDF-only webhook files', async () => {
  const existingDocument = await PDFDocument.create();
  existingDocument.addPage();
  const existingPdf = Buffer.from(await existingDocument.save());
  const files = await preparePdfFilesForWebhook([
    { buffer: existingPdf, fileName: 'existing.pdf', mimeType: 'application/pdf' },
    { buffer: createImage('image/jpeg'), fileName: 'photo.jpg', mimeType: 'image/jpeg' },
    { buffer: createImage('image/png'), fileName: 'scan.png', mimeType: 'image/png' },
  ]);

  assert.deepEqual(files.map((file) => file.fileName), ['existing.pdf', 'photo.pdf', 'scan.pdf']);
  assert.deepEqual(files.map((file) => file.mimeType), [
    'application/pdf',
    'application/pdf',
    'application/pdf',
  ]);
  assert.equal(files.every((file) => file.buffer.includes(Buffer.from('%PDF-'))), true);
});

test('blocks non-PDF output before the webhook request', async () => {
  await assert.rejects(
    preparePdfFilesForWebhook([
      { buffer: Buffer.from('plain text'), fileName: 'notes.txt', mimeType: 'text/plain' },
    ]),
    /Webhook accepts PDF output only[\s\S]*notes\.txt/,
  );
});

test('blocks files mislabeled as PDF before the webhook request', async () => {
  await assert.rejects(
    preparePdfFilesForWebhook([
      { buffer: Buffer.from('not really a PDF'), fileName: 'fake.pdf', mimeType: 'application/pdf' },
    ]),
    /Webhook accepts PDF output only[\s\S]*fake\.pdf/,
  );
});
