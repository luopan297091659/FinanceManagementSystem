export function extractIntegratedImportHeaders(
  sourceDataJson: unknown,
  mappingJson: unknown,
  internalCanonicalHeaders: readonly string[],
): string[] {
  if (!sourceDataJson || typeof sourceDataJson !== 'object' || Array.isArray(sourceDataJson)) return [];
  const sourceHeaders = Object.keys(sourceDataJson);
  if (!mappingJson || typeof mappingJson !== 'object' || Array.isArray(mappingJson)) return sourceHeaders;

  const storedHeaders = (mappingJson as Record<string, unknown>).__importHeaders;
  if (Array.isArray(storedHeaders)) {
    return storedHeaders.filter((header): header is string => typeof header === 'string' && header.length > 0);
  }

  // Older batches stored both the original columns and internally mapped aliases in
  // sourceDataJson. Keep aliases only when that exact header existed in the file.
  const originalMappedHeaders = new Set(
    Object.values(mappingJson as Record<string, unknown>).filter((value): value is string => typeof value === 'string'),
  );
  const internalHeaders = new Set(internalCanonicalHeaders);
  return sourceHeaders.filter((header) => !internalHeaders.has(header) || originalMappedHeaders.has(header));
}
