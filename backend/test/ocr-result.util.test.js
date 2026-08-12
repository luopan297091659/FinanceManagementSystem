const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ocrDistRoot = process.env.OCR_TEST_DIST_ROOT || path.resolve(__dirname, '../dist');
const { extractOcrResultRecords, summarizeOcrRecords } = require(path.join(ocrDistRoot, 'modules/ocr/ocr-result.util.js'));
const { normalizeOcrMatchText, normalizeOcrPartyName, normalizeOcrPartyNameVoicingInsensitive, normalizedOcrTextEquals, normalizedOcrTextSimilarity, normalizedOcrPartyNameSimilarity, ocrMatchSearchVariants } = require(path.join(ocrDistRoot, 'modules/ocr/ocr-match-normalization.util.js'));
const { OcrService } = require(path.join(ocrDistRoot, 'modules/ocr/ocr.service.js'));

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

test('normalizes Japanese bank summaries across spaces, Kana width, and invisible characters', () => {
  assert.equal(normalizeOcrMatchText('ｲｻﾞﾜ ﾁｴｺ'), 'イザワチエコ');
  assert.equal(normalizeOcrMatchText('イザワ　チエコ'), 'イザワチエコ');
  assert.equal(normalizeOcrMatchText('ｲｻﾞﾜ\u200B ﾁｴｺ'), 'イザワチエコ');
  assert.equal(normalizedOcrTextEquals('ｲｻﾞﾜ ﾁｴｺ', 'イザワ　チエコ'), true);
  assert.equal(normalizedOcrTextEquals('ｲｻﾞﾜ ﾁｴｺ', 'イザワ ケイコ'), false);
  assert.equal(normalizedOcrTextSimilarity('ｲｻﾞﾜ ﾁｴｺ', 'イザワ　チエコ'), 100);
  assert.ok(normalizedOcrTextSimilarity('ｲｻﾞﾜ ﾁｴｺ', 'イザワ ケイコ') < 100);
  assert.ok(ocrMatchSearchVariants('ｲｻﾞﾜ　ﾁｴｺ').includes('ｲｻﾞﾜ'));
  assert.ok(ocrMatchSearchVariants('ｲｻﾞﾜ　ﾁｴｺ').includes('イザワ'));
});

test('normalizes Japanese corporate bank abbreviations for party-name matching', () => {
  assert.equal(normalizeOcrPartyName('ﾄﾞ) ｺﾔﾏﾐｶ'), 'コヤマミカ');
  assert.equal(normalizedOcrPartyNameSimilarity('ﾄﾞ) ｺﾔﾏﾐｶ', 'コヤマ ミカ'), 100);
  assert.ok(normalizedOcrPartyNameSimilarity('ﾄﾞ) ｺﾔﾏﾐｶ', 'ヨシオカ コズミ') < 85);
  assert.equal(normalizedOcrPartyNameSimilarity('イザワ チェコ', 'ｲｻﾞﾜ ﾁｴｺ'), 100);
  assert.ok(normalizedOcrPartyNameSimilarity('イザワ チェコ', 'ｲｻﾞﾜ ｴｺ') >= 80);
});

test('tolerates OCR dakuten loss and one missing Kana without treating it as exact OCR', () => {
  assert.equal(normalizeOcrPartyNameVoicingInsensitive('キタノ シゲキ'), normalizeOcrPartyNameVoicingInsensitive('ｷﾀﾉ ｼｹｷ'));
  assert.equal(normalizedOcrPartyNameSimilarity('キタノ シゲキ', 'ｷﾀﾉ ｼｹｷ'), 94);
  assert.ok(normalizedOcrPartyNameSimilarity('イザワ チエコ', 'ｲｻﾞﾜ ｴｺ') >= 88);
  assert.ok(normalizedOcrPartyNameSimilarity('イザワ チエコ', 'タナカ ハナコ') < 80);
});

test('matches one bank payment to the exact total of multiple contracts for the same OCR payer', async () => {
  const makeContract = (id, amount, roomNumber) => ({
    id, contractNumber: `CTR-${id}`, tenantId: 'tenant-k', contractorName: '北野茂樹', contractorNameKana: 'キタノ シゲキ',
    payerName: '北野茂樹', payerNameKana: 'キタノ シゲキ', bankSummaryName: null, bankStatementSummary: null,
    startDate: new Date('2026-01-01'), endDate: null, monthlyRent: amount, managementFee: null,
    otherMonthlyFee1: null, otherMonthlyFee2: null, otherMonthlyFee3: null, paymentAliases: [],
    tenant: { id: 'tenant-k', name: '北野茂樹' }, propertyId: `property-${id}`, roomId: `room-${id}`,
    room: { id: `room-${id}`, roomNumber, property: { id: `property-${id}`, name: `北野物件${roomNumber}` } },
    property: { id: `property-${id}`, name: `北野物件${roomNumber}` },
  });
  const contracts = [makeContract('a', 85000, '101'), makeContract('b', 130000, '502')];
  const service = new OcrService({ contract: { findMany: async () => contracts } });
  const result = await service.matchSystemData(
    { type: 'income', statisticalAmount: 215000, counterpartyRaw: 'ｷﾀﾉ ｼｹｷ', date: '2026-08-05' },
    { version: 2, rules: [
      { id: 'amount', systemFields: ['contract.monthlyPaymentTotal'], sourceFields: ['statisticalAmount'], operator: 'equals', minScore: 100, required: true, logicalOperator: 'AND' },
      { id: 'kana', systemFields: ['contract.contractorNameKana'], sourceFields: ['counterpartyRaw'], operator: 'similar', minScore: 85, required: true, logicalOperator: 'AND' },
    ] },
  );

  assert.equal(result.systemMatch.status, 'MATCHED');
  assert.equal(result.systemMatch.matchType, 'COMBINATION');
  assert.equal(result.systemMatch.identityScore, 94);
  assert.equal(result.systemMatch.allocationScore, 100);
  assert.equal(result.systemMatch.allocations.length, 2);
  assert.equal(result.systemMatch.allocatedAmount, 215000);
  assert.equal(result.systemMatch.unallocatedAmount, 0);
});

test('rent matching requires exact amount and tolerant contractor Kana', async () => {
  const matchingContract = {
    id: 'contract-rent-match', contractNumber: 'CTR-RENT', tenantId: null,
    contractorName: '小山美香', contractorNameKana: 'コヤマ ミカ', payerName: '小山美香',
    bankSummaryName: null, bankStatementSummary: null,
    startDate: new Date('2026-01-01'), endDate: null, monthlyRent: 390000, managementFee: 4900,
    tenant: null,
    room: { id: 'room-rent', roomNumber: '201', property: { id: 'property-rent', name: 'テストビル' } },
    property: { id: 'property-rent', name: 'テストビル' },
  };
  const wrongAmountContract = { ...matchingContract, id: 'contract-wrong-amount', monthlyRent: 395000 };
  const service = new OcrService({ contract: { findMany: async () => [wrongAmountContract, matchingContract] } });
  const result = await service.matchSystemData(
    { type: 'income', statisticalAmount: 394900, counterpartyRaw: 'ﾄﾞ) ｺﾔﾏﾐｶ', date: '2026-04-03' },
    {
      version: 2,
      rules: [
        { id: 'amount', systemFields: ['contract.monthlyPaymentTotal'], sourceFields: ['statisticalAmount'], operator: 'equals', minScore: 100, required: true, logicalOperator: 'AND' },
        { id: 'kana', systemFields: ['contract.contractorNameKana'], sourceFields: ['counterpartyRaw'], operator: 'similar', minScore: 85, required: true, logicalOperator: 'AND' },
      ],
    },
  );

  assert.equal(result.systemMatch.status, 'MATCHED');
  assert.equal(result.systemMatch.contractId, 'contract-rent-match');
  assert.equal(result.systemMatch.matchScore, 100);
});

test('expense records are excluded from rent matching statistics', async () => {
  let queried = false;
  const service = new OcrService({ contract: { findMany: async () => { queried = true; return []; } } });
  const result = await service.matchSystemData(
    { type: 'expense', statisticalAmount: 5000, counterpartyRaw: 'SMBC' },
    {
      version: 2,
      rules: [
        { id: 'amount', systemFields: ['contract.monthlyRent'], sourceFields: ['statisticalAmount'], operator: 'equals', minScore: 100, required: true, logicalOperator: 'AND' },
        { id: 'kana', systemFields: ['contract.contractorNameKana'], sourceFields: ['counterpartyRaw'], operator: 'similar', minScore: 85, required: true, logicalOperator: 'AND' },
      ],
    },
  );

  assert.equal(result.systemMatch.status, 'NOT_APPLICABLE');
  assert.equal(queried, false);
  assert.deepEqual(summarizeOcrRecords([result]), {
    total: 1, matched: 0, autoMatched: 0, manualMatched: 0, manualSync: 0, notApplicable: 1, unmatched: 0,
  });
});

test('contract validity disambiguates equal amount and Kana candidates', async () => {
  const base = {
    contractNumber: null, tenantId: null, contractorName: '北野茂樹', contractorNameKana: 'キタノ シゲキ',
    payerName: '北野茂樹', bankSummaryName: null, bankStatementSummary: null,
    monthlyRent: 90000, managementFee: null,
    tenant: null, room: { id: 'room-valid', roomNumber: '1', property: { id: 'property-valid', name: '北野ビル' } },
    property: { id: 'property-valid', name: '北野ビル' },
  };
  const expired = { ...base, id: 'contract-expired', roomId: 'room-expired', startDate: new Date('2024-01-01'), endDate: new Date('2025-12-31') };
  const active = { ...base, id: 'contract-active', roomId: 'room-active', startDate: new Date('2026-01-01'), endDate: null };
  const service = new OcrService({ contract: { findMany: async () => [expired, active] } });
  const result = await service.matchSystemData(
    { type: 'income', statisticalAmount: 90000, counterpartyRaw: 'ｷﾀﾉ ｼｹﾞｷ', date: '2026-04-02' },
    { version: 2, rules: [
      { id: 'amount', systemFields: ['contract.monthlyPaymentTotal'], sourceFields: ['statisticalAmount'], operator: 'equals', minScore: 100, required: true, logicalOperator: 'AND' },
      { id: 'kana', systemFields: ['contract.contractorNameKana'], sourceFields: ['counterpartyRaw'], operator: 'similar', minScore: 85, required: true, logicalOperator: 'AND' },
    ] },
  );

  assert.equal(result.systemMatch.status, 'MATCHED');
  assert.equal(result.systemMatch.contractId, 'contract-active');
});

test('OCR matching falls back to normalized Japanese summary equality', async () => {
  const contract = {
    id: 'contract-1',
    contractNumber: 'CTR-1',
    tenantId: 'tenant-1',
    contractorName: '井沢千恵子',
    payerName: '井沢千恵子',
    bankSummaryName: null,
    bankStatementSummary: 'イザワ　チエコ',
    startDate: new Date('2026-01-01'),
    endDate: null,
    monthlyRent: 49500,
    tenant: { id: 'tenant-1', name: '井沢千恵子' },
    room: { id: 'room-1', roomNumber: '101', property: { id: 'property-1', name: 'Test Building' } },
    property: { id: 'property-1', name: 'Test Building' },
  };
  let queryCount = 0;
  const service = new OcrService({
    contract: {
      findMany: async () => (++queryCount === 1 ? [] : [contract]),
    },
  });
  const result = await service.matchSystemData(
    { contentSummary: 'ｲｻﾞﾜ ﾁｴｺ' },
    {
      logicalOperator: 'AND',
      rules: [{
        id: 'summary-rule',
        systemField: 'contract.bankStatementSummary',
        sourceField: 'contentSummary',
        operator: 'equals',
        required: true,
      }],
    },
  );

  assert.equal(queryCount, 2);
  assert.equal(result.systemMatch.status, 'MATCHED');
  assert.equal(result.systemMatch.contractId, 'contract-1');
  assert.equal(result.systemMatch.matchScore, 100);
  assert.match(result.systemMatch.reason, /Unicode/);
});

test('OCR matching reports a score below 100 without auto-matching', async () => {
  const contract = {
    id: 'contract-2', contractNumber: 'CTR-2', tenantId: 'tenant-2',
    contractorName: '井沢千恵子', payerName: '井沢千恵子', bankSummaryName: null,
    bankStatementSummary: 'イザワ チエコ', startDate: new Date('2026-01-01'), endDate: null, monthlyRent: 49500,
    tenant: { id: 'tenant-2', name: '井沢千恵子' },
    room: { id: 'room-2', roomNumber: '202', property: { id: 'property-2', name: 'Test Building' } },
    property: { id: 'property-2', name: 'Test Building' },
  };
  let queryCount = 0;
  const service = new OcrService({ contract: { findMany: async () => (++queryCount === 1 ? [] : [contract]) } });
  const result = await service.matchSystemData(
    { contentSummary: 'ｲｻﾞﾜ ｹｲｺ' },
    {
      logicalOperator: 'AND',
      rules: [{ id: 'summary-rule', systemField: 'contract.bankStatementSummary', sourceField: 'contentSummary', operator: 'equals', required: true }],
    },
  );

  assert.equal(result.systemMatch.status, 'UNMATCHED');
  assert.ok(result.systemMatch.matchScore > 0 && result.systemMatch.matchScore < 100);
});

test('OCR matching accepts any matching pair inside multi-select fields', async () => {
  const contract = {
    id: 'contract-multi', contractNumber: 'CTR-MULTI', tenantId: 'tenant-multi',
    contractorName: '山田太郎', payerName: 'ヤマダ タロウ', bankSummaryName: 'ヤマダ タロウ',
    bankStatementSummary: null, startDate: new Date('2026-01-01'), endDate: null, monthlyRent: 70000,
    tenant: { id: 'tenant-multi', name: '山田太郎' },
    room: { id: 'room-multi', roomNumber: '301', property: { id: 'property-multi', name: '山田ビル' } },
    property: { id: 'property-multi', name: '山田ビル' },
  };
  const queries = [];
  const service = new OcrService({ contract: { findMany: async (query) => { queries.push(query); return [contract]; } } });
  const result = await service.matchSystemData(
    { contentSummary: '一致しない摘要', counterparty: 'ﾔﾏﾀﾞ ﾀﾛｳ' },
    {
      version: 2,
      rules: [{
        id: 'multi-rule',
        systemFields: ['contract.bankStatementSummary', 'contract.payerName'],
        sourceFields: ['contentSummary', 'counterparty'],
        operator: 'equals', required: true, logicalOperator: 'AND',
      }],
    },
  );

  assert.equal(result.systemMatch.status, 'MATCHED');
  assert.equal(result.systemMatch.contractId, 'contract-multi');
  assert.equal(result.systemMatch.matchScore, 100);
  assert.equal(queries[0].where.AND[0].OR.length, 4);
});

test('OCR matching applies OR on an individual rule instead of a global switch', async () => {
  const contract = {
    id: 'contract-rule-or', contractNumber: 'CTR-OR', tenantId: null,
    contractorName: '佐藤花子', payerName: '佐藤花子', bankSummaryName: null,
    bankStatementSummary: null, startDate: new Date('2026-01-01'), endDate: null, monthlyRent: 80000,
    tenant: null,
    room: { id: 'room-or', roomNumber: '502', property: { id: 'property-or', name: 'さくらビル' } },
    property: { id: 'property-or', name: 'さくらビル' },
  };
  const queries = [];
  const service = new OcrService({ contract: { findMany: async (query) => { queries.push(query); return [contract]; } } });
  const result = await service.matchSystemData(
    { wrongAmount: 1, propertyName: 'さくらビル' },
    {
      version: 2,
      rules: [
        { id: 'amount-rule', systemFields: ['contract.monthlyRent'], sourceFields: ['wrongAmount'], operator: 'equals', required: true, logicalOperator: 'AND' },
        { id: 'property-rule', systemFields: ['property.name'], sourceFields: ['propertyName'], operator: 'equals', required: true, logicalOperator: 'OR' },
      ],
    },
  );

  assert.equal(result.systemMatch.status, 'MATCHED');
  assert.equal(result.systemMatch.matchScore, 100);
  assert.ok(queries[0].where.AND[0].OR);
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
    notApplicable: 0,
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
