type JsonRecord = Record<string, any>;

export function extractOcrResultRecords(payload: unknown): JsonRecord[] {
  const source = payload as JsonRecord | null;
  const candidates = [source?.records, source?.results, source?.data?.records, source?.data?.results, source?.data];
  const root = candidates.find(Array.isArray) ?? (source && typeof source === 'object' ? [source] : []);
  const flattened: JsonRecord[] = [];

  flattenValue(root, {}, flattened, 0);
  return flattened.map((record, index) => ({
    ...normalizeFinanceRecord(record),
    _recordId: stringValue(record._recordId) || `ocr-record-${index + 1}`,
  }));
}

export function summarizeOcrRecords(records: JsonRecord[]) {
  const autoMatched = records.filter((record) => record.systemMatch?.status === 'MATCHED' && record.systemMatch?.matchMode !== 'MANUAL').length;
  const manualMatched = records.filter((record) => record.systemMatch?.status === 'MATCHED' && record.systemMatch?.matchMode === 'MANUAL').length;
  const manualSync = records.filter((record) => record.systemMatch?.status === 'MANUAL_SYNC').length;
  const matched = autoMatched + manualMatched;
  return {
    total: records.length,
    matched,
    autoMatched,
    manualMatched,
    manualSync,
    unmatched: records.length - matched - manualSync,
  };
}

function flattenValue(value: unknown, context: JsonRecord, output: JsonRecord[], depth: number) {
  if (depth > 8 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    const parsed = parseJson(value);
    if (parsed !== undefined) flattenValue(parsed, context, output, depth + 1);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenValue(item, context, output, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;

  const record = value as JsonRecord;
  const sourceFileName = stringValue(
    record.sourceFileName ?? record.original_file_name ?? record.source_file_name ?? record.fileName ?? context.original_file_name,
  );
  const nextContext: JsonRecord = {
    ...context,
    ...(sourceFileName ? { original_file_name: sourceFileName } : {}),
    ...(record.totalPages !== undefined || record.total_pages !== undefined
      ? { source_total_pages: record.totalPages ?? record.total_pages }
      : {}),
  };
  const wrappedResult = parseJson(record.result) ?? record.result;
  if (wrappedResult && typeof wrappedResult === 'object') {
    flattenValue(wrappedResult, nextContext, output, depth + 1);
    return;
  }
  const parsedRecords = parseJson(record.records);
  const nestedRecords = parsedRecords !== undefined
    ? parsedRecords
    : record.records && typeof record.records === 'object' ? record.records : undefined;
  if (nestedRecords !== undefined) {
    flattenValue(nestedRecords, nextContext, output, depth + 1);
    return;
  }

  output.push({ ...nextContext, ...record });
}

function parseJson(value: unknown): unknown | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!trimmed || !['{', '['].includes(trimmed[0])) return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Make aggregators may concatenate one structured output per uploaded file as
    // `{...}, {...}` instead of emitting a JSON array. Normalise that valid
    // sequence into an array before the callback reaches the web client.
    try {
      return JSON.parse(`[${trimmed}]`);
    } catch {
      return undefined;
    }
  }
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalizeFinanceRecord(record: JsonRecord): JsonRecord {
  const direction = stringValue(record.type ?? record.money_direction).toLowerCase();
  const type = direction === 'income' || ['入金', '收入', 'inflow', 'deposit'].includes(direction)
    ? 'income'
    : direction === 'expense' || ['出金', '支出', 'outflow', 'withdrawal'].includes(direction)
      ? 'expense'
      : null;
  const processingStatus = normalizeProcessingStatus(record.processingStatus ?? record.statistical_treatment);
  const confirmationStatus = normalizeConfirmationStatus(record.confirmationStatus ?? record.review_status);
  const canonical: JsonRecord = {
    schemaVersion: record.schemaVersion ?? 'finance-transaction-v1',
    sourceFileName: record.sourceFileName ?? record.original_file_name ?? record.source_file_name ?? null,
    sourceTotalPages: record.sourceTotalPages ?? record.source_total_pages ?? record.total_pages ?? null,
    sequenceNo: record.sequenceNo ?? record.record_no ?? null,
    fileType: record.fileType ?? record.document_type ?? null,
    type,
    date: record.date ?? record.transactionDate ?? null,
    counterparty: record.counterparty ?? record.counterpartyRaw ?? record.outflow_party ?? record.inflow_party ?? null,
    counterpartyRaw: record.counterpartyRaw ?? record.outflow_party ?? record.inflow_party ?? null,
    contentSummary: record.contentSummary ?? record.summary ?? null,
    transactionCategory: record.transactionCategory ?? record.transaction_type ?? null,
    financialInstitutionName: record.financialInstitutionName ?? record.financial_institution_name ?? null,
    bankBranchName: record.bankBranchName ?? record.bank_branch_name ?? record.branch_name ?? null,
    propertyName: record.propertyName ?? record.property_name ?? null,
    roomNumber: record.roomNumber ?? record.room_number ?? null,
    contractorName: record.contractorName ?? record.tenant_name ?? null,
    contractNumber: record.contractNumber ?? record.contract_number ?? null,
    paymentMonth: record.paymentMonth ?? record.target_month ?? null,
    actualMonth: record.actualMonth ?? record.actual_month ?? null,
    feeItemName: record.feeItemName ?? record.fee_type ?? record.transaction_type ?? null,
    fileAmount: record.fileAmount ?? record.document_amount ?? null,
    transferFeeAmount: record.transferFeeAmount ?? record.additional_fee ?? 0,
    statisticalAmount: record.statisticalAmount ?? record.net_amount ?? record.document_amount ?? null,
    evidenceDateType: record.evidenceDateType ?? record.date_basis ?? null,
    sourcePageStart: record.sourcePageStart ?? record.start_page ?? null,
    sourcePageEnd: record.sourcePageEnd ?? record.end_page ?? null,
    processingStatus,
    confirmationStatus,
    note: record.note ?? record.notes ?? null,
    financeDetails: normalizeFinanceDetails(record.financeDetails ?? record.details),
  };
  return { ...record, ...canonical };
}

function normalizeFinanceDetails(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((detail: JsonRecord, index: number) => ({
    ...detail,
    sequenceNo: detail.sequenceNo ?? detail.detail_no ?? index + 1,
    feeItemName: detail.feeItemName ?? detail.fee_item ?? detail.detail_type ?? null,
    valueMoney: detail.valueMoney ?? detail.detail_amount ?? null,
    valueNumber: detail.valueNumber ?? detail.quantity ?? null,
    valueText: detail.valueText ?? detail.description ?? null,
    valueDate: detail.valueDate ?? null,
    propertyName: detail.propertyName ?? detail.property_name ?? null,
    roomNumber: detail.roomNumber ?? detail.room_number ?? null,
    contractorName: detail.contractorName ?? detail.tenant_name ?? null,
    paymentMonth: detail.paymentMonth ?? detail.target_month ?? null,
    note: detail.note ?? detail.notes ?? null,
  }));
}

function normalizeProcessingStatus(value: unknown) {
  const text = stringValue(value).toUpperCase();
  if (['INCLUDED', 'DETAIL_ONLY', 'DUPLICATE_EXCLUDED'].includes(text)) return text;
  if (['明细不重复计入', '明細のみ', 'DETAIL'].includes(stringValue(value))) return 'DETAIL_ONLY';
  if (['重复件不计入', '重複除外', 'DUPLICATE'].includes(stringValue(value))) return 'DUPLICATE_EXCLUDED';
  return 'INCLUDED';
}

function normalizeConfirmationStatus(value: unknown) {
  const text = stringValue(value).toUpperCase();
  if (['PENDING', 'CONFIRMED', 'REJECTED'].includes(text)) return text;
  if (['自动通过', '自動通過', '已确认'].includes(stringValue(value))) return 'CONFIRMED';
  return 'PENDING';
}
