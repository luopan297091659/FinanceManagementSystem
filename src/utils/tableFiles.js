const htmlEscapeMap = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => htmlEscapeMap[char]);

const downloadText = (filename, content, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const exportTableXls = (filename, columns, rows) => {
  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`)
    .join("");
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body><table>${header ? `<tr>${header}</tr>` : ""}${body}</table></body></html>`;
  downloadText(filename, html, "application/vnd.ms-excel;charset=utf-8");
};

export const exportTableTemplate = (filename, columns) => {
  exportTableXls(filename, columns, []);
};

export const exportTableXlsx = async (filename, columns, rows, sheetName = "文案配置") => {
  const XLSX = await import("xlsx");
  const data = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => row[column.key] ?? "")),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(data);
  sheet["!cols"] = columns.map((column) => ({
    wch: Math.min(80, Math.max(12, column.width || column.label.length + 4)),
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
};

const detectDelimiter = (line) => {
  const candidates = [",", "\t", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
};

const decodeTableText = async (file) => {
  const buffer = await file.arrayBuffer();
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (!utf8.includes("\uFFFD")) return utf8;

  try {
    return new TextDecoder("shift-jis", { fatal: false }).decode(buffer);
  } catch {
    return utf8;
  }
};

const parseDelimited = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const delimiter = detectDelimiter(text.split(/\r?\n/).find((line) => line.trim()) || "");

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
};

const parseWorkbookFile = async (file) => {
  let XLSX;
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new Error("XLSX parser dependency is missing. Run npm install in the project root, then rebuild the frontend.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    cellDates: true,
    dense: false,
  });

  const rows = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false,
    });
    for (const row of sheetRows) {
      const normalizedRow = row.map((cell) => String(cell ?? "").trim());
      if (normalizedRow.some(Boolean)) rows.push(normalizedRow);
    }
  }
  return rows;
};

export const parseTableFile = async (file) => {
  if (/\.(xlsx|xlsm|xls)$/i.test(file.name)) {
    return parseWorkbookFile(file);
  }

  const text = await decodeTableText(file);
  if (/<table[\s>]/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => cell.textContent.trim())).filter((row) => row.some(Boolean));
  }
  return parseDelimited(text);
};
