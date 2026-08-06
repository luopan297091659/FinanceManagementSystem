const assert = require('node:assert/strict');
const test = require('node:test');
const { extractOcrResultRecords, summarizeOcrRecords } = require('../dist/modules/ocr/ocr-result.util.js');

test('expands Make records stored as a nested JSON string', () => {
  const payload = {
    taskId: 'OCR-1',
    records: [{
      taskId: 'OCR-1',
      records: JSON.stringify({
        source_file_name: 'statement.pdf',
        total_pages: 2,
        records: [
          { record_no: 1, summary: 'A', net_amount: 100 },
          { record_no: 2, summary: 'B', net_amount: 200 },
        ],
      }),
    }],
  };

  const records = extractOcrResultRecords(payload);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.original_file_name), ['statement.pdf', 'statement.pdf']);
  assert.deepEqual(records.map((record) => record._recordId), ['ocr-record-1', 'ocr-record-2']);
  assert.equal(records[1].net_amount, 200);
});

test('keeps an ordinary flat records array', () => {
  const records = extractOcrResultRecords({ records: [{ date: '2026-08-06', amount: 300 }] });
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 300);
});

test('expands concatenated Make result objects for multiple uploaded files', () => {
  const first = {
    result: {
      source_file_name: 'first.pdf',
      total_pages: 1,
      records: [{ record_no: 1, summary: 'first row' }],
    },
  };
  const second = {
    result: {
      source_file_name: 'second.pdf',
      total_pages: 2,
      records: [
        { record_no: 1, summary: 'second row 1' },
        { record_no: 2, summary: 'second row 2' },
      ],
    },
  };
  const payload = { records: `${JSON.stringify(first)}, ${JSON.stringify(second)}` };

  const records = extractOcrResultRecords(payload);
  assert.equal(records.length, 3);
  assert.deepEqual(records.map((record) => record.original_file_name), ['first.pdf', 'second.pdf', 'second.pdf']);
  assert.deepEqual(records.map((record) => record.source_total_pages), [1, 2, 2]);
  assert.deepEqual(records.map((record) => record._recordId), ['ocr-record-1', 'ocr-record-2', 'ocr-record-3']);
});

test('expands a single Make result wrapper supplied as an object', () => {
  const records = extractOcrResultRecords({
    records: {
      result: {
        source_file_name: 'object.pdf',
        total_pages: 1,
        records: [{ record_no: 1, net_amount: 500 }],
      },
    },
  });
  assert.equal(records.length, 1);
  assert.equal(records[0].original_file_name, 'object.pdf');
  assert.equal(records[0].net_amount, 500);
});

test('summarizes automatic, manual, manual-sync and pending records', () => {
  const summary = summarizeOcrRecords([
    { systemMatch: { status: 'MATCHED', matchMode: 'AUTO' } },
    { systemMatch: { status: 'MATCHED', matchMode: 'MANUAL' } },
    { systemMatch: { status: 'MANUAL_SYNC' } },
    { systemMatch: { status: 'UNMATCHED' } },
  ]);
  assert.deepEqual(summary, {
    total: 4,
    matched: 2,
    autoMatched: 1,
    manualMatched: 1,
    manualSync: 1,
    unmatched: 1,
  });
});
