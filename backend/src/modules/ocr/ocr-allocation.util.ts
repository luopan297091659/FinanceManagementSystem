export type OcrAllocationCandidate<T = unknown> = {
  id: string;
  amount: number;
  identityScore: number;
  value: T;
};

export type OcrAllocationResult<T = unknown> = {
  candidates: OcrAllocationCandidate<T>[];
  identityScore: number;
  allocatedAmount: number;
  difference: number;
  ambiguous: boolean;
};

export function findExactOcrContractAllocation<T>(
  input: OcrAllocationCandidate<T>[],
  bankAmount: number,
  options: { maxItems?: number; maxCandidates?: number; maxVisited?: number } = {},
): OcrAllocationResult<T> | null {
  if (!Number.isFinite(bankAmount) || bankAmount <= 0) return null;
  const maxItems = Math.max(2, Math.min(5, options.maxItems ?? 5));
  const candidates = input
    .filter((candidate) => candidate.amount > 0 && candidate.amount <= bankAmount && candidate.identityScore > 0)
    .sort((left, right) => right.identityScore - left.identityScore || right.amount - left.amount || left.id.localeCompare(right.id))
    .slice(0, options.maxCandidates ?? 30);
  const solutions: OcrAllocationCandidate<T>[][] = [];
  let visited = 0;
  const maxVisited = options.maxVisited ?? 20_000;

  for (let targetSize = 2; targetSize <= Math.min(maxItems, candidates.length) && !solutions.length; targetSize += 1) {
    const search = (start: number, remaining: number, selected: OcrAllocationCandidate<T>[]) => {
      if (visited++ >= maxVisited || solutions.length >= 3) return;
      if (selected.length === targetSize) {
        if (Math.abs(remaining) < 0.005) solutions.push([...selected]);
        return;
      }
      const slots = targetSize - selected.length;
      for (let index = start; index <= candidates.length - slots; index += 1) {
        const candidate = candidates[index];
        if (candidate.amount - remaining > 0.005) continue;
        selected.push(candidate);
        search(index + 1, remaining - candidate.amount, selected);
        selected.pop();
      }
    };
    search(0, bankAmount, []);
  }
  if (!solutions.length) return null;

  const ranked = solutions.map((items) => ({
    items,
    identityScore: Math.round(items.reduce((sum, item) => sum + item.identityScore, 0) / items.length),
  })).sort((left, right) => right.identityScore - left.identityScore);
  const winner = ranked[0];
  const ambiguous = Boolean(ranked[1] && winner.identityScore - ranked[1].identityScore < 8);
  const allocatedAmount = winner.items.reduce((sum, item) => sum + item.amount, 0);
  return { candidates: winner.items, identityScore: winner.identityScore, allocatedAmount, difference: bankAmount - allocatedAmount, ambiguous };
}
