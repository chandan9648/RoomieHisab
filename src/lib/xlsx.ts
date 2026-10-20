/**
 * A tiny OOXML spreadsheet writer: enough of the format to emit a genuine
 * `.xlsx` that Excel, LibreOffice, Numbers and Google Sheets all open without
 * the "the format does not match the extension" warning that a `.csv` renamed
 * to `.xlsx` would earn.
 *
 * What it supports is deliberately narrow: one or more sheets of text, number,
 * money and date cells, a styled header row and fixed column widths. Strings
 * are written inline rather than through a shared-string table, which costs a
 * few bytes and removes a whole part of the format.
 */

import { zipSync, type ZipEntry } from "./zip";

export type Cell =
  | { kind: "text"; value: string; bold?: boolean }
  | { kind: "number"; value: number; bold?: boolean }
  /** Rupees, not paise: Excel should hold the amount it displays. */
  | { kind: "money"; value: number; bold?: boolean }
  /** A "YYYY-MM-DD" calendar day. */
  | { kind: "date"; value: string }
  | { kind: "blank" };

export type Sheet = {
  name: string;
  /** Column widths in characters; an omitted list falls back to Excel's own. */
  columns?: number[];
  rows: Cell[][];
};

export const text = (value: string, bold = false): Cell => ({ kind: "text", value, bold });
export const money = (rupees: number, bold = false): Cell => ({ kind: "money", value: rupees, bold });
export const count = (value: number, bold = false): Cell => ({ kind: "number", value, bold });
export const day = (value: string): Cell => ({ kind: "date", value });
export const blank = (): Cell => ({ kind: "blank" });

/** Style indices, matching the `cellXfs` order written in `STYLES_XML`. */
const STYLE = {
  plain: 0,
  header: 1,
  money: 2,
  date: 3,
  bold: 4,
  boldMoney: 5,
} as const;

function escapeXml(value: string): string {
  return (
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      // Control characters are illegal in XML 1.0, and would make the file
      // unreadable rather than merely ugly.
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  );
}

/** Sheet names may not carry : \ / ? * [ ] and cap at 31 characters. */
function safeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA" */
export function columnName(index: number): string {
  let name = "";
  let n = index;
  while (n >= 0) {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  }
  return name;
}

/**
 * Excel counts days from 1899-12-30 — the offset that reproduces its
 * deliberate 1900 leap-year bug for every date this app can produce. UTC
 * arithmetic on both ends keeps a daylight-saving shift out of the division.
 */
export function excelSerial(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000);
}

function cellXml(cell: Cell, ref: string): string {
  switch (cell.kind) {
    case "blank":
      return "";
    case "text":
      return `<c r="${ref}" s="${cell.bold ? STYLE.bold : STYLE.plain}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
    case "number":
      return `<c r="${ref}" s="${cell.bold ? STYLE.bold : STYLE.plain}"><v>${cell.value}</v></c>`;
    case "money":
      return `<c r="${ref}" s="${cell.bold ? STYLE.boldMoney : STYLE.money}"><v>${cell.value}</v></c>`;
    case "date":
      return `<c r="${ref}" s="${STYLE.date}"><v>${excelSerial(cell.value)}</v></c>`;
  }
}

/** Row one is the header: it always takes the filled indigo treatment. */
function rowXml(cells: Cell[], rowNumber: number, isHeader: boolean): string {
  const body = cells
    .map((cell, column) => {
      const ref = `${columnName(column)}${rowNumber}`;
      if (!isHeader) return cellXml(cell, ref);
      const label = cell.kind === "text" ? cell.value : "";
      return `<c r="${ref}" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(label)}</t></is></c>`;
    })
    .join("");
  return `<row r="${rowNumber}">${body}</row>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns?.length
    ? `<cols>${sheet.columns
        .map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`)
        .join("")}</cols>`
    : "";

  const rows = sheet.rows.map((cells, i) => rowXml(cells, i + 1, i === 0)).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const RUPEE = "₹";

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;${RUPEE}&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd\\ mmm\\ yyyy"/></numFmts><fonts count="3"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="2" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const ROOT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

export function buildWorkbook(sheets: Sheet[]): Uint8Array {
  const named = sheets.map((sheet, i) => ({ ...sheet, name: safeSheetName(sheet.name, i) }));
  const encoder = new TextEncoder();
  const part = (name: string, xml: string): ZipEntry => ({ name, data: encoder.encode(xml) });

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${named
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}</Types>`;

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named
    .map(
      (sheet, i) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
    )
    .join("")}</sheets></workbook>`;

  // The styles part takes the relationship id after the last sheet.
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named
    .map(
      (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
    )
    .join("")}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return zipSync([
    part("[Content_Types].xml", contentTypes),
    part("_rels/.rels", ROOT_RELS_XML),
    part("xl/workbook.xml", workbook),
    part("xl/_rels/workbook.xml.rels", workbookRels),
    part("xl/styles.xml", STYLES_XML),
    ...named.map((sheet, i) => part(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet))),
  ]);
}

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
