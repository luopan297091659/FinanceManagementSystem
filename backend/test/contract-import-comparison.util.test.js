const assert = require('node:assert/strict');
const test = require('node:test');
const utilPath = process.env.CONTRACT_COMPARISON_UTIL_PATH || '../dist/modules/contracts/contract-import-comparison.util.js';
const { hasProvidedContractChanges } = require(utilPath);

test('treats equivalent text, dates, and money as unchanged', () => {
  const contract = { contractorName: 'ｲｻﾞﾜ　ﾁｴｺ', startDate: new Date('2026-04-01T00:00:00Z'), monthlyRent: '49500.00' };
  const data = { _providedFields: ['contractorName', 'startDate', 'monthlyRent'], contractorName: 'ｲｻﾞﾜ ﾁｴｺ', startDate: '2026/4/1', monthlyRent: '￥49,500' };
  assert.equal(hasProvidedContractChanges(contract, data), false);
});

test('detects a real change in a provided field', () => {
  const contract = { bankStatementSummary: 'ｲｻﾞﾜ ﾁｴｺ' };
  const data = { _providedFields: ['bankStatementSummary'], bankStatementSummary: 'ﾊﾔｼ ﾐﾁﾋﾛ' };
  assert.equal(hasProvidedContractChanges(contract, data), true);
});

test('compares imported charge details before deciding to update', () => {
  const contract = { charges: [{ chargeType: 'MONTHLY_OTHER', itemName: '水道料', amount: '3000', monthCount: null, sortOrder: 1 }] };
  const same = { _providedFields: [], _replaceCharges: true, charges: [{ chargeType: 'MONTHLY_OTHER', itemName: '水道料', amount: '3,000.00', monthCount: null, sortOrder: 1 }] };
  const changed = { ...same, charges: [{ ...same.charges[0], amount: '3500' }] };
  assert.equal(hasProvidedContractChanges(contract, same), false);
  assert.equal(hasProvidedContractChanges(contract, changed), true);
});
