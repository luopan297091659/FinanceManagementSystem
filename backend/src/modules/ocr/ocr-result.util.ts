type JsonRecord = Record<string, any>;

export function extractOcrResultRecords(payload: unknown): JsonRecord[] {
  const source = payload as JsonRecord | null;
  const candidates = [source?.records, source?.results, source?.data?.records, source?.data?.results, source?.data];
  const root = candidates.find(Array.isArray) ?? (source && typeof source === 'object' ? [source] : []);
  const flattened: JsonRecord[] = [];

  flattenValue(root, {}, flattened, 0);
  return flattened.map((record, index) => ({
    ...record,
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
    record.original_file_name ?? record.source_file_name ?? record.fileName ?? context.original_file_name,
  );
  const nextContext: JsonRecord = {
    ...context,
    ...(sourceFileName ? { original_file_name: sourceFileName } : {}),
    ...(record.total_pages !== undefined ? { source_total_pages: record.total_pages } : {}),
  };
  const nested = parseJson(record.records);
  if (Array.isArray(record.records) || nested !== undefined) {
    flattenValue(nested ?? record.records, nextContext, output, depth + 1);
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
    return undefined;
  }
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim();
}
