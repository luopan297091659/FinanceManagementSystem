const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
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
  assert.equal(records[1].sourceFileName, 'statement.pdf');
  assert.equal(records[1].statisticalAmount, 200);
  assert.equal(records[1].schemaVersion, 'finance-transaction-v1');
});

test('keeps an ordinary flat records array', () => {
  const records = extractOcrResultRecords({ records: [{ date: '2026-08-06', amount: 300 }] });
  assert.equal(records.length, 1);
  assert.equal(records[0].amount, 300);
});

test('normalizes bank-native transactions and maps displayed 番号 into sequenceNo', () => {
  const records = extractOcrResultRecords({
    documentType: 'japanese_bank_transaction_statement',
    transactions: [{
      sourceFileName: 'bank.pdf',
      sourcePageNumber: 2,
      transactionNumber: '004',
      transactionDate: '2026-04-07',
      category: '出金',
      withdrawalAmount: 660,
      depositAmount: null,
      transactionType: '振替支払',
      financialInstitutionName: null,
      branchName: null,
      description: 'フリコミテスウリヨウ',
      remarks: '',
    }],
  });

  assert.equal(records.length, 1);
  assert.equal(records[0].sequenceNo, 4);
  assert.equal(records[0].type, 'expense');
  assert.equal(records[0].fileAmount, 660);
  assert.equal(records[0].statisticalAmount, 660);
  assert.equal(records[0].transactionCategory, '振替支払');
  assert.equal(records[0].bankBranchName, null);
  assert.equal(records[0].contentSummary, 'フリコミテスウリヨウ');
  assert.equal(records[0].sourcePageStart, 2);
  assert.equal(records[0].sourcePageEnd, 2);
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

test('keeps finance-center fields and normalizes legacy OCR fields', () => {
  const [record] = extractOcrResultRecords({ records: [{
    record_no: 7,
    document_type: '送金明細',
    money_direction: '出金',
    outflow_party: 'Vendor A',
    summary: 'Repair payment',
    transaction_type: '修繕費',
    target_month: '2026-07',
    document_amount: 12000,
    additional_fee: 330,
    net_amount: 12330,
    date: '2026-08-06',
    date_basis: '支払日',
    start_page: 2,
    end_page: 3,
    statistical_treatment: '计入',
    review_status: '需人工确认',
    notes: 'check room',
  }] });
  assert.equal(record.sequenceNo, 7);
  assert.equal(record.fileType, '送金明細');
  assert.equal(record.type, 'expense');
  assert.equal(record.counterparty, 'Vendor A');
  assert.equal(record.contentSummary, 'Repair payment');
  assert.equal(record.transactionCategory, '修繕費');
  assert.equal(record.paymentMonth, '2026-07');
  assert.equal(record.fileAmount, 12000);
  assert.equal(record.transferFeeAmount, 330);
  assert.equal(record.statisticalAmount, 12330);
  assert.equal(record.evidenceDateType, '支払日');
  assert.equal(record.sourcePageStart, 2);
  assert.equal(record.sourcePageEnd, 3);
  assert.equal(record.processingStatus, 'INCLUDED');
  assert.equal(record.confirmationStatus, 'PENDING');
  assert.equal(record.note, 'check room');
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

test('finance OCR response schema is strict and complete for OpenAI Structured Outputs', () => {
  const schemaPath = path.resolve(__dirname, '../../docs/make-openai-finance-ocr-schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.type, 'object');
  validateStrictObjectSchemas(schema, '$');
});

test('bank reconciliation OCR response schema is strict and maps 番号 to sequenceNo', () => {
  const schemaPath = path.resolve(__dirname, '../../docs/make-openai-bank-reconciliation-schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.schemaVersion.enum[0], 'finance-transaction-v1');
  assert.match(schema.properties.records.items.properties.sequenceNo.description, /番号/);
  validateStrictObjectSchemas(schema, '$');
});

function validateStrictObjectSchemas(schema, location) {
  if (!schema || typeof schema !== 'object') return;
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes('object')) {
    assert.equal(schema.additionalProperties, false, `${location} must set additionalProperties=false`);
    const propertyNames = Object.keys(schema.properties || {}).sort();
    assert.deepEqual([...(schema.required || [])].sort(), propertyNames, `${location} must require every property`);
    for (const [key, property] of Object.entries(schema.properties || {})) validateStrictObjectSchemas(property, `${location}.${key}`);
  }
  if (schema.items) validateStrictObjectSchemas(schema.items, `${location}[]`);
}
