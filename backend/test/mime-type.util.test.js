const assert = require('node:assert/strict');
const test = require('node:test');
const { detectMimeType } = require('../dist/modules/ocr/mime-type.util.js');

test('detects PDF when the provided MIME is generic', () => {
  assert.equal(detectMimeType('statement.pdf', 'application/octet-stream'), 'application/pdf');
});

test('detects JPEG when the provided MIME is generic', () => {
  assert.equal(detectMimeType('photo.jpg', 'application/octet-stream'), 'image/jpeg');
});

test('detects PNG when no MIME is provided', () => {
  assert.equal(detectMimeType('image.png'), 'image/png');
});

test('handles uppercase extensions', () => {
  assert.deepEqual(
    ['DOCUMENT.PDF', 'PHOTO.JPG', 'IMAGE.PNG'].map((name) => detectMimeType(name, 'application/octet-stream')),
    ['application/pdf', 'image/jpeg', 'image/png'],
  );
});

test('preserves a valid provided MIME type', () => {
  assert.equal(detectMimeType('file.bin', 'application/custom'), 'application/custom');
});

test('removes parameters and normalizes a provided MIME type', () => {
  assert.equal(detectMimeType('photo.bin', ' Image/JPEG; charset=utf-8 '), 'image/jpeg');
});

test('falls back safely for unknown extensions', () => {
  assert.equal(detectMimeType('data.bin', 'application/octet-stream'), 'application/octet-stream');
});

test('falls back safely for names without extensions', () => {
  assert.equal(detectMimeType('README'), 'application/octet-stream');
});

test('falls back safely for empty and malformed inputs', () => {
  assert.equal(detectMimeType('', 'not-a-mime'), 'application/octet-stream');
  assert.equal(detectMimeType(undefined, undefined), 'application/octet-stream');
});

test('detects multiple files independently', () => {
  assert.deepEqual(
    ['a.pdf', 'b.csv', 'c.xlsx', 'd.docx'].map((name) => detectMimeType(name, 'application/octet-stream')),
    [
      'application/pdf',
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  );
});

test('serializes each repeated requestFile part with its detected MIME type', async () => {
  const form = new FormData();
  form.append('requestFile', new Blob(['pdf'], { type: detectMimeType('a.pdf') }), 'a.pdf');
  form.append('requestFile', new Blob(['png'], { type: detectMimeType('b.png') }), 'b.png');

  const multipartBody = await new Response(form).text();
  assert.match(multipartBody, /name="requestFile"; filename="a\.pdf"[\s\S]*?Content-Type: application\/pdf/);
  assert.match(multipartBody, /name="requestFile"; filename="b\.png"[\s\S]*?Content-Type: image\/png/);
});
