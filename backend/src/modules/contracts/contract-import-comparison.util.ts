const MONEY_FIELDS = new Set([
  'monthlyRent', 'managementFee', 'deposit', 'keyMoney', 'guaranteeDeposit',
  'guaranteeFee', 'keyReplacementFee', 'renewalAdministrativeFee', 'insuranceFee',
]);
const DATE_FIELDS = new Set(['startDate', 'endDate', 'insuranceStartDate', 'insuranceEndDate']);

export function hasProvidedContractChanges(contract: Record<string, unknown>, data: Record<string, unknown>) {
  for (const field of Array.isArray(data._providedFields) ? data._providedFields : []) {
    if (typeof field !== 'string' || field === 'tenantId') continue;
    if (MONEY_FIELDS.has(field)) {
      if (moneyValue(contract[field]) !== moneyValue(data[field])) return true;
    } else if (DATE_FIELDS.has(field)) {
      if (dateValue(contract[field]) !== dateValue(data[field])) return true;
    } else if (textValue(contract[field]) !== textValue(data[field])) {
      return true;
    }
  }
  if (data._replaceCharges && !sameCharges(contract.charges, data.charges)) return true;
  return false;
}

function textValue(value: unknown) {
  return String(value ?? '').normalize('NFKC').replace(/[\s\u3000]+/g, ' ').trim();
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = textValue(value);
  if (!text) return null;
  const match = text.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})$/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function moneyValue(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  const normalized = text.replace(/[,￥¥]/g, '');
  return Number.isFinite(Number(normalized)) ? Number(normalized).toFixed(2) : null;
}

function sameCharges(left: unknown, right: unknown) {
  return JSON.stringify(normalizeCharges(left)) === JSON.stringify(normalizeCharges(right));
}

function normalizeCharges(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((charge) => {
    const item = charge && typeof charge === 'object' ? charge as Record<string, unknown> : {};
    return {
      chargeType: textValue(item.chargeType),
      itemName: textValue(item.itemName),
      amount: moneyValue(item.amount),
      monthCount: moneyValue(item.monthCount),
      sortOrder: Number(item.sortOrder ?? 0),
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || a.chargeType.localeCompare(b.chargeType) || a.itemName.localeCompare(b.itemName));
}
