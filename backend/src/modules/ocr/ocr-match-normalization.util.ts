export function normalizeOcrMatchText(value: unknown) {
  if (value === undefined || value === null) return '';
  return String(value)
    .normalize('NFKC')
    .replace(/[\p{White_Space}\u200B-\u200D\u2060\uFEFF]+/gu, '')
    .toLocaleUpperCase('ja-JP');
}

export function normalizedOcrTextEquals(left: unknown, right: unknown) {
  const normalizedLeft = normalizeOcrMatchText(left);
  const normalizedRight = normalizeOcrMatchText(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export function normalizedOcrTextContains(container: unknown, value: unknown) {
  const normalizedContainer = normalizeOcrMatchText(container);
  const normalizedValue = normalizeOcrMatchText(value);
  return Boolean(normalizedContainer && normalizedValue && normalizedContainer.includes(normalizedValue));
}

export function normalizedOcrTextSimilarity(left: unknown, right: unknown) {
  return normalizedTextSimilarity(normalizeOcrMatchText(left), normalizeOcrMatchText(right));
}

export function normalizeOcrPartyName(value: unknown) {
  return normalizeOcrMatchText(value)
    .replace(/[ァィゥェォャュョッヮ]/gu, (character) => ({
      'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
      'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ッ': 'ツ', 'ヮ': 'ワ',
    })[character] || character)
    .replace(/^(?:株式会社|有限会社|合同会社|一般社団法人|公益社団法人)/u, '')
    .replace(/(?:株式会社|有限会社|合同会社)$/u, '')
    .replace(/^(?:カ|ユ|ド|ゴウドウ)[)）]+/u, '')
    .replace(/^[（(]+(?:カ|ユ|ド|ゴウドウ)/u, '')
    .replace(/[()（）［\]【】「」『』・･.,，。:：;；'"`]/gu, '');
}

export function normalizedOcrPartyNameSimilarity(left: unknown, right: unknown) {
  const ordinaryScore = normalizedOcrTextSimilarity(left, right);
  const normalizedLeft = normalizeOcrPartyName(left);
  const normalizedRight = normalizeOcrPartyName(right);
  const partyScore = normalizedTextSimilarity(normalizedLeft, normalizedRight);
  const shorterLength = Math.min(Array.from(normalizedLeft).length, Array.from(normalizedRight).length);
  const containmentScore = shorterLength >= 4
    && (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft))
    ? 96
    : 0;
  return Math.max(ordinaryScore, partyScore, containmentScore);
}

function normalizedTextSimilarity(left: string, right: string) {
  const normalizedLeft = Array.from(left);
  const normalizedRight = Array.from(right);
  if (!normalizedLeft.length || !normalizedRight.length) return 0;
  if (normalizedLeft.join('') === normalizedRight.join('')) return 100;
  const previous = Array.from({ length: normalizedRight.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= normalizedLeft.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= normalizedRight.length; rightIndex += 1) {
      const substitutionCost = normalizedLeft[leftIndex - 1] === normalizedRight[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  const distance = previous[normalizedRight.length];
  return Math.max(0, Math.round((1 - distance / Math.max(normalizedLeft.length, normalizedRight.length)) * 100));
}

export function ocrMatchSearchVariants(value: unknown) {
  if (value === undefined || value === null) return [];
  const raw = String(value).trim();
  if (!raw) return [];
  const nfkc = raw.normalize('NFKC');
  const withoutInvisibleCharacters = raw.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
  const values = [
    raw,
    nfkc,
    withoutInvisibleCharacters,
    ...raw.split(/[\p{White_Space}\u200B-\u200D\u2060\uFEFF]+/u),
    ...nfkc.split(/[\p{White_Space}\u200B-\u200D\u2060\uFEFF]+/u),
  ].map((item) => item.trim()).filter(Boolean);
  return [...new Set(values)].sort((left, right) => right.length - left.length);
}
