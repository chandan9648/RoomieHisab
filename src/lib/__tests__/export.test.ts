import { describe, expect, it } from "vitest";

import { buildReportPdf, buildReportWorkbook } from "../exportReport";
import { PdfDocument, textWidth, toWinAnsi, truncate, wrap } from "../pdf";
import { buildReport } from "../reports";
import type { Expense, Member } from "../types";
import { columnName, excelSerial } from "../xlsx";
import { crc32, zipSync } from "../zip";

const MEMBERS: Member[] = [
  {
    uid: "u1",
    displayName: "Asha",
    email: "a@flat.test",
    photoURL: null,
    joinedAt: 1,
    role: "admin",
    joinedVia: "",
  },
];

const EXPENSES: Expense[] = [
  {
    id: "a",
    description: "Rent",
    amountPaise: 2_500_00,
    date: "2026-10-01",
    paidBy: "u1",
    payerName: "Asha",
    notes: "Half the month",
    createdAt: 1,
  },
];

const META = { householdName: "Flat 301", generatedAt: new Date(2026, 9, 20, 10, 0, 0) };

const REPORT = buildReport(EXPENSES, MEMBERS, {
  startISO: "2026-10-01",
  endISO: "2026-10-31",
  payer: "all",
});

/** Chunked, because spreading a whole file into `fromCharCode` overflows. */
function ascii(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
}

describe("crc32", () => {
  it("matches the published check value for \"123456789\"", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("is zero for no bytes", () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("zipSync", () => {
  const archive = zipSync(
    [
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "dir/b.txt", data: new TextEncoder().encode("world!") },
    ],
    new Date(2026, 9, 20, 12, 0, 0),
  );
  const view = new DataView(archive.buffer);

  it("starts with a local file header and ends with the central directory", () => {
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(archive.length - 22, true)).toBe(0x06054b50);
  });

  it("records both entries in the trailer", () => {
    expect(view.getUint16(archive.length - 22 + 10, true)).toBe(2);
  });

  it("points the trailer at a central directory of exactly the right size", () => {
    const size = view.getUint32(archive.length - 22 + 12, true);
    const offset = view.getUint32(archive.length - 22 + 16, true);
    // The directory must run from its offset right up to the trailer: an
    // off-by-one here is what makes an unzipper call the archive corrupt.
    expect(offset + size).toBe(archive.length - 22);
    expect(view.getUint32(offset, true)).toBe(0x02014b50);
  });
});

describe("xlsx cell addressing", () => {
  it("names columns the way a spreadsheet does", () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(columnName)).toEqual([
      "A",
      "B",
      "Z",
      "AA",
      "AB",
      "AZ",
      "BA",
    ]);
  });

  it("converts a calendar day to the serial Excel reads back", () => {
    expect(excelSerial("2026-10-20")).toBe(46315);
    expect(excelSerial("2026-01-01")).toBe(46023);
    // The 1899-12-30 epoch is the standard compensation for Excel's phantom
    // 29 February 1900: it is exact from 1 March 1900 on, which is every date
    // an expense can carry.
    expect(excelSerial("1900-03-01")).toBe(61);
  });

  it("does not drift across a daylight-saving boundary", () => {
    expect(excelSerial("2026-03-30") - excelSerial("2026-03-29")).toBe(1);
    expect(excelSerial("2026-10-26") - excelSerial("2026-10-25")).toBe(1);
  });
});

describe("buildReportWorkbook", () => {
  const workbook = buildReportWorkbook(REPORT, META);
  const body = ascii(workbook);

  it("produces a ZIP holding the parts an .xlsx must have", () => {
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(body).toContain(part);
    }
  });

  it("writes rupees rather than paise, so Excel totals what it shows", () => {
    expect(body).toContain("<v>2500</v>");
  });

  it("escapes markup in a description instead of breaking the sheet", () => {
    const risky = buildReportWorkbook(
      buildReport(
        [{ ...EXPENSES[0], description: 'Tea & <b>"biscuits"</b>' }],
        MEMBERS,
        { startISO: "2026-10-01", endISO: "2026-10-31", payer: "all" },
      ),
      META,
    );
    const xml = ascii(risky);
    expect(xml).toContain("Tea &amp; &lt;b&gt;&quot;biscuits&quot;&lt;/b&gt;");
    expect(xml).not.toContain("<b>");
  });
});

describe("pdf text encoding", () => {
  it("spells out the rupee sign, which WinAnsi cannot hold", () => {
    expect(toWinAnsi("₹1,234.50")).toBe("Rs. 1,234.50");
  });

  it("keeps plain ASCII untouched", () => {
    expect(toWinAnsi("Wi-Fi recharge (October)")).toBe("Wi-Fi recharge (October)");
  });

  it("replaces a glyph no base font can draw rather than emitting a bad byte", () => {
    const encoded = toWinAnsi("दूध");
    expect(encoded).toBe("???");
    expect([...encoded].every((c) => (c.codePointAt(0) ?? 0) <= 255)).toBe(true);
  });

  it("measures a string so amounts can be right-aligned", () => {
    expect(textWidth("iii", 10)).toBeLessThan(textWidth("WWW", 10));
    expect(textWidth("Total", 10, true)).toBeGreaterThan(textWidth("Total", 10));
  });

  it("truncates to the column rather than overrunning it", () => {
    const cut = truncate("Cleaning supplies, mop, phenyl and two brushes", 60, 9);
    expect(cut.endsWith("...")).toBe(true);
    expect(textWidth(cut, 9)).toBeLessThanOrEqual(60);
  });

  it("leaves a string that already fits alone", () => {
    expect(truncate("Milk", 200, 9)).toBe("Milk");
  });

  it("wraps on words and never past the width", () => {
    const lines = wrap("one two three four five six seven", 50, 9);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(textWidth(line, 9)).toBeLessThanOrEqual(50);
  });
});

describe("PdfDocument", () => {
  it("escapes parentheses, which would otherwise end the string early", () => {
    const doc = new PdfDocument();
    doc.text("Electricity (October)", 10, 10);
    expect(ascii(doc.build())).toContain("(Electricity \\(October\\)) Tj");
  });

  it("writes a cross-reference entry per object, at its real byte offset", () => {
    const pdf = ascii(new PdfDocument("Test").build());
    const xrefAt = Number(pdf.slice(pdf.lastIndexOf("startxref")).split("\n")[1]);
    expect(pdf.slice(xrefAt, xrefAt + 4)).toBe("xref");

    // Every offset in the table must land on the object it claims to index.
    // Three lines are skipped: "xref", the subsection header, and the free
    // entry for object 0, so index 0 below is object 1.
    const rows = pdf.slice(xrefAt).split("\n").slice(3);
    const used = rows.filter((row) => /^\d{10} 00000 n $/.test(row));
    expect(used).toHaveLength(7);
    used.forEach((row, i) => {
      expect(pdf.slice(Number(row.slice(0, 10)))).toMatch(new RegExp(`^${i + 1} 0 obj`));
    });
  });
});

describe("buildReportPdf", () => {
  const pdf = ascii(buildReportPdf(REPORT, META));

  it("is a PDF a reader will open", () => {
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("declares a content stream length that matches the bytes written", () => {
    for (const match of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)) {
      expect(match[2].length).toBe(Number(match[1]));
    }
  });

  it("keeps the page tree and the page objects in agreement", () => {
    const kids = /\/Kids \[([^\]]*)\] \/Count (\d+)/.exec(pdf);
    expect(kids).not.toBeNull();
    expect(kids![1].trim().split(/\s+0 R\s*/).filter(Boolean)).toHaveLength(Number(kids![2]));
  });

  it("carries the report's own numbers", () => {
    expect(pdf).toContain("Rs. 2,500.00");
    expect(pdf).toContain("Flat 301");
  });

  it("numbers every page out of the true total, which needs the second pass", () => {
    const many = buildReport(
      Array.from({ length: 120 }, (_, i) => ({
        ...EXPENSES[0],
        id: `e${i}`,
        notes: "",
        date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
      })),
      MEMBERS,
      { startISO: "2026-10-01", endISO: "2026-10-31", payer: "all" },
    );
    const long = ascii(buildReportPdf(many, META));
    const pages = Number(/\/Count (\d+)/.exec(long)![1]);
    expect(pages).toBeGreaterThan(1);
    expect(long).toContain(`Page ${pages} of ${pages}`);
    expect(long).not.toContain("of 0");
  });
});
