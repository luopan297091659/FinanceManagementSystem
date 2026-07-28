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

const detectDelimiter = (line) => {
  const candidates = [",", "\t", ";"];
  return candidates
    .map((delimiter) => ({ delimiter, count: line.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ",";
};

const decodeTableText = async (file) => {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const startsWithZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (startsWithZip || /\.(xlsx|xlsm)$/i.test(file.name)) {
    throw new Error("Binary XLSX parsing requires the xlsx package; please export as CSV or Excel HTML for this build.");
  }

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

export const parseTableFile = async (file) => {
  const text = await decodeTableText(file);
  if (/<table[\s>]/i.test(text)) {
    const doc = new DOMParser().parseFromString(text, "text/html");
    return [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((cell) => cell.textContent.trim())).filter((row) => row.some(Boolean));
  }
  return parseDelimited(text);
};
