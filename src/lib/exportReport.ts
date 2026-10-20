/**
 * Turns a `Report` into something a roommate can keep: a laid-out PDF
 * statement or an Excel workbook. Both read from the same `Report`, so the
 * two downloads and the screen can never disagree about a number.
 *
 * Neither writer pulls a dependency — see `pdf.ts` and `xlsx.ts` for why.
 */

import { formatDateISO } from "./dates";
import { formatPaise } from "./money";
import {
  ACCENT,
  ACCENT_TINT,
  INK,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  PdfDocument,
  RULE,
  WHITE,
  PDF_MIME,
} from "./pdf";
import { describeRange, type Report } from "./reports";
import { buildWorkbook, count, day, money, text, XLSX_MIME, type Sheet } from "./xlsx";

export type ExportFormat = "pdf" | "xlsx";

export type ReportMeta = {
  householdName: string;
  /** When the export was taken, for the "Generated on" line. */
  generatedAt: Date;
};

const rupees = (paise: number) => Math.round(paise) / 100;

/* ------------------------------------------------------------------ PDF -- */

const MARGIN = 42;
const RIGHT = PAGE_WIDTH - MARGIN;
/** Rows stop here so the footer always has its own strip of page. */
const BOTTOM = PAGE_HEIGHT - 54;

const COL_DATE = MARGIN;
const COL_DESCRIPTION = MARGIN + 78;
const COL_PAYER = MARGIN + 300;
const DESCRIPTION_WIDTH = 210;
const PAYER_WIDTH = 118;

function drawBanner(doc: PdfDocument, report: Report, meta: ReportMeta): number {
  doc.rect(0, 0, PAGE_WIDTH, 92, ACCENT);
  doc.text("RoomieHisab", MARGIN, 38, { size: 19, bold: true, color: WHITE });
  doc.text(meta.householdName, MARGIN, 56, { size: 10, color: WHITE, maxWidth: 300 });
  doc.text("Expense report", RIGHT, 38, { size: 12, bold: true, color: WHITE, align: "right" });
  doc.text(describeRange(report.range), RIGHT, 56, { size: 10, color: WHITE, align: "right" });
  doc.text(report.scope, RIGHT, 72, { size: 10, color: WHITE, align: "right" });
  return 92;
}

function drawSummary(doc: PdfDocument, report: Report, top: number): number {
  const height = 54;
  const width = (RIGHT - MARGIN - 16) / 3;

  const tiles = [
    { label: "Total spent", value: formatPaise(report.totalPaise) },
    { label: "Entries", value: String(report.count) },
    { label: "Roommates", value: String(report.breakdown.filter((p) => p.active).length) },
  ];

  tiles.forEach((tile, i) => {
    const x = MARGIN + i * (width + 8);
    doc.rect(x, top, width, height, ACCENT_TINT);
    doc.text(tile.label.toUpperCase(), x + 12, top + 20, { size: 7.5, color: MUTED });
    doc.text(tile.value, x + 12, top + 40, { size: 14, bold: true, color: INK });
  });

  return top + height;
}

function drawBreakdownHead(doc: PdfDocument, y: number): number {
  doc.text("ROOMMATE", MARGIN, y, { size: 7.5, color: MUTED });
  doc.text("ENTRIES", MARGIN + 300, y, { size: 7.5, color: MUTED, align: "right" });
  doc.text("SHARE", MARGIN + 380, y, { size: 7.5, color: MUTED, align: "right" });
  doc.text("PAID", RIGHT, y, { size: 7.5, color: MUTED, align: "right" });
  doc.hairline(MARGIN, y + 6, RIGHT);
  return y + 6;
}

function drawTableHead(doc: PdfDocument, y: number): number {
  doc.text("DATE", COL_DATE, y, { size: 7.5, color: MUTED });
  doc.text("DESCRIPTION", COL_DESCRIPTION, y, { size: 7.5, color: MUTED });
  doc.text("PAID BY", COL_PAYER, y, { size: 7.5, color: MUTED });
  doc.text("AMOUNT", RIGHT, y, { size: 7.5, color: MUTED, align: "right" });
  doc.hairline(MARGIN, y + 6, RIGHT, RULE, 1);
  return y + 6;
}

function drawFooter(doc: PdfDocument, meta: ReportMeta, page: number, pages: number): void {
  const y = PAGE_HEIGHT - 28;
  doc.hairline(MARGIN, y - 14, RIGHT);
  doc.text(`Generated on ${formatDateISO(isoDay(meta.generatedAt))} · RoomieHisab`, MARGIN, y, {
    size: 8,
    color: MUTED,
  });
  doc.text(pages > 0 ? `Page ${page} of ${pages}` : `Page ${page}`, RIGHT, y, {
    size: 8,
    color: MUTED,
    align: "right",
  });
}

function isoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * One rendering pass. `pages` is the page total for the footer, which is only
 * known after a pass has run — see `buildReportPdf`.
 */
function renderPdf(report: Report, meta: ReportMeta, pages: number): PdfDocument {
  const doc = new PdfDocument(`RoomieHisab expenses · ${describeRange(report.range)}`);
  let page = 1;

  /**
   * Starts a new page when `height` would not fit on this one, re-drawing the
   * column headings through `repeatHead` so a continued table is still
   * readable. Returns the cursor to carry on from.
   */
  function fit(y: number, height: number, repeatHead: (at: number) => number): number {
    if (y + height <= BOTTOM) return y;
    drawFooter(doc, meta, page, pages);
    doc.addPage();
    page += 1;
    return repeatHead(MARGIN + 14);
  }

  let y = drawBanner(doc, report, meta);
  y = drawSummary(doc, report, y + 22);

  if (report.breakdown.length > 0) {
    y += 30;
    doc.text("Who spent what", MARGIN, y, { size: 12, bold: true });
    y += 8;
    doc.hairline(MARGIN, y, RIGHT);
    y = drawBreakdownHead(doc, y + 16);

    for (const person of report.breakdown) {
      // A flat with a long roster must not run its roommates off the page.
      y = fit(y, 21, (at) => drawBreakdownHead(doc, at));
      y += 16;
      const name = person.active ? person.name : `${person.name} (left the flat)`;
      doc.text(name, MARGIN, y, { size: 9.5, maxWidth: 230 });
      doc.text(String(person.count), MARGIN + 300, y, { size: 9.5, color: MUTED, align: "right" });
      doc.text(`${person.percent.toFixed(1)}%`, MARGIN + 380, y, {
        size: 9.5,
        color: MUTED,
        align: "right",
      });
      doc.text(formatPaise(person.paidPaise), RIGHT, y, { size: 9.5, bold: true, align: "right" });
      y += 5;
      doc.hairline(MARGIN, y, RIGHT);
    }
  }

  // The "Expenses" heading is worthless at the very foot of a page.
  y = fit(y, 76, (at) => at - 16);
  y += 30;
  doc.text(`Expenses (${report.count})`, MARGIN, y, { size: 12, bold: true });
  y += 8;
  doc.hairline(MARGIN, y, RIGHT);
  y = drawTableHead(doc, y + 20);

  if (report.rows.length === 0) {
    doc.text("No expenses were logged in this period.", MARGIN, y + 22, {
      size: 10,
      color: MUTED,
    });
  }

  for (const row of report.rows) {
    y = fit(y, row.notes ? 28 : 18, (at) => drawTableHead(doc, at));
    y += 15;
    doc.text(formatDateISO(row.dateISO), COL_DATE, y, { size: 9, color: MUTED });
    doc.text(row.description, COL_DESCRIPTION, y, { size: 9.5, maxWidth: DESCRIPTION_WIDTH });
    doc.text(row.payerName, COL_PAYER, y, { size: 9.5, maxWidth: PAYER_WIDTH });
    doc.text(formatPaise(row.amountPaise), RIGHT, y, { size: 9.5, bold: true, align: "right" });

    if (row.notes) {
      y += 11;
      doc.text(row.notes, COL_DESCRIPTION, y, { size: 8, color: MUTED, maxWidth: 330 });
    }

    y += 4;
    doc.hairline(MARGIN, y, RIGHT);
  }

  if (report.rows.length > 0) {
    y = fit(y, 34, (at) => at);
    y += 22;
    doc.text("Total", COL_PAYER, y, { size: 11, bold: true });
    doc.text(formatPaise(report.totalPaise), RIGHT, y, { size: 12, bold: true, align: "right" });
  }

  drawFooter(doc, meta, page, pages);
  return doc;
}

export function buildReportPdf(report: Report, meta: ReportMeta): Uint8Array {
  // Two passes: the first only to learn how many pages the footers must claim.
  const counted = renderPdf(report, meta, 0).pageCount;
  return renderPdf(report, meta, counted).build(meta.generatedAt);
}

/* ---------------------------------------------------------------- Excel -- */

export function buildReportWorkbook(report: Report, meta: ReportMeta): Uint8Array {
  const expenses: Sheet = {
    name: "Expenses",
    columns: [14, 38, 20, 34, 14],
    rows: [
      [
        text("Date"),
        text("Description"),
        text("Paid by"),
        text("Notes"),
        text("Amount (INR)"),
      ],
      ...report.rows.map((row) => [
        day(row.dateISO),
        text(row.description),
        text(row.payerName),
        text(row.notes),
        money(rupees(row.amountPaise)),
      ]),
      [],
      [text("", true), text("", true), text("", true), text("Total", true), money(rupees(report.totalPaise), true)],
    ],
  };

  const breakdown: Sheet = {
    name: "By roommate",
    columns: [28, 12, 16, 14],
    rows: [
      [text("Roommate"), text("Entries"), text("Paid (INR)"), text("Share of total")],
      ...report.breakdown.map((person) => [
        text(person.active ? person.name : `${person.name} (left the flat)`),
        count(person.count),
        money(rupees(person.paidPaise)),
        text(`${person.percent.toFixed(1)}%`),
      ]),
    ],
  };

  const about: Sheet = {
    name: "Report",
    columns: [22, 42],
    rows: [
      [text("Field"), text("Value")],
      [text("Flat"), text(meta.householdName)],
      [text("Period"), text(describeRange(report.range))],
      [text("Scope"), text(report.scope)],
      [text("Entries"), count(report.count)],
      [text("Total (INR)"), money(rupees(report.totalPaise))],
      [text("Generated on"), day(isoDay(meta.generatedAt))],
    ],
  };

  return buildWorkbook([expenses, breakdown, about]);
}

/* ------------------------------------------------------------- Download -- */

export function buildReportFile(
  format: ExportFormat,
  report: Report,
  meta: ReportMeta,
): { bytes: Uint8Array; mime: string } {
  return format === "pdf"
    ? { bytes: buildReportPdf(report, meta), mime: PDF_MIME }
    : { bytes: buildReportWorkbook(report, meta), mime: XLSX_MIME };
}

/** Hands the bytes to the browser as a download. No-op outside the browser. */
export function saveFile(bytes: Uint8Array, filename: string, mime: string): void {
  if (typeof document === "undefined") return;

  // Copied into a plain ArrayBuffer so the Blob never aliases a view that
  // something else might still be writing into.
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);

  const url = URL.createObjectURL(new Blob([buffer], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.append(link);
  link.click();
  link.remove();
  // Safari needs the URL to outlive the click, so it is released a tick later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
