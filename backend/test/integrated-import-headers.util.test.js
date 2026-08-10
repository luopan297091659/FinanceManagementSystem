const assert = require('node:assert/strict');
const test = require('node:test');
const utilPath = process.env.CONTRACT_IMPORT_UTIL_PATH || '../dist/modules/contracts/integrated-import-headers.util.js';
const { extractIntegratedImportHeaders } = require(utilPath);

test('returns every uploaded header in its original order', () => {
  const source = {
    '签约人': '佐野 琢郎',
    '物件': 'グランドビュア90 / 503',
    '银行账单摘要': 'ｻﾉ ﾀｸﾛｳ',
  };

  assert.deepEqual(
    extractIntegratedImportHeaders(source, { contractorName: '签约人' }, ['契約者', '物件名']),
    ['签约人', '物件', '银行账单摘要'],
  );
});

test('uses the stored header array so database JSON key ordering cannot change the preview', () => {
  const sourceAfterDatabaseRoundTrip = {
    '物件': 'グランドビュア90 / 503',
    '签约人': '佐野 琢郎',
    '银行账单摘要': 'ｻﾉ ﾀｸﾛｳ',
  };

  assert.deepEqual(
    extractIntegratedImportHeaders(
      sourceAfterDatabaseRoundTrip,
      { __importHeaders: ['签约人', '物件', '银行账单摘要'] },
      [],
    ),
    ['签约人', '物件', '银行账单摘要'],
  );
});

test('removes internal aliases from old batches but keeps canonical headers supplied by the file', () => {
  const source = {
    '签约人': '佐野 琢郎',
    '未识别的附加表头': '保留',
    '契約者': '佐野 琢郎',
    '物件名': 'グランドビュア90',
  };

  assert.deepEqual(
    extractIntegratedImportHeaders(source, { contractorName: '签约人', propertyName: '物件名' }, ['契約者', '物件名']),
    ['签约人', '未识别的附加表头', '物件名'],
  );
});

test('returns an empty list for malformed source data', () => {
  assert.deepEqual(extractIntegratedImportHeaders(null, {}, []), []);
  assert.deepEqual(extractIntegratedImportHeaders([], {}, []), []);
});
