const XLSX = require('xlsx');

const inputPath = 'D:/工作相关/房产财务软件/房间列表.xls';
const workbook = XLSX.readFile(inputPath, { cellDates: true, cellNF: true });

const result = { sheets: [] };
for (const name of workbook.SheetNames) {
  const sheet = workbook.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd',
    blankrows: false,
  });
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const nonEmptyByColumn = Array(width).fill(0);
  const nonZeroByColumn = Array(width).fill(0);
  const samplesByColumn = Array.from({ length: width }, () => []);
  for (const row of rows.slice(1)) {
    row.forEach((value, index) => {
      if (value !== null && String(value).trim() !== '') {
        nonEmptyByColumn[index] += 1;
        const numericText = String(value).replace(/[,￥¥\s]/g, '');
        if (!Number.isFinite(Number(numericText)) || Number(numericText) !== 0) nonZeroByColumn[index] += 1;
        if (samplesByColumn[index].length < 5 && !samplesByColumn[index].includes(String(value))) {
          samplesByColumn[index].push(String(value));
        }
      }
    });
  }
  result.sheets.push({
    name,
    ref: sheet['!ref'] ?? null,
    merges: sheet['!merges'] ?? [],
    rowCount: rows.length,
    columnCount: width,
    firstRows: rows.slice(0, 12),
    headers: rows[0] ?? [],
    nonEmptyByColumn,
    nonZeroByColumn,
    samplesByColumn,
  });
}

console.log(JSON.stringify(result, null, 2));
