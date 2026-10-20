/**
 * A small PDF writer, built for one job: turning an expense report into a file
 * a roommate can keep, mail or print. It writes PDF 1.4 by hand rather than
 * shipping a rendering library to a phone, and supports exactly what a
 * statement needs — Helvetica text, rules, filled rectangles and pages.
 *
 * ## Coordinates
 * PDF measures from the bottom-left corner, which makes layout code read
 * upside down. Everything here takes `y` as a distance from the *top* of the
 * page and flips it on the way out, so a table can simply walk downwards.
 *
 * ## Text encoding
 * The base-14 fonts are single-byte and encoded as WinAnsi (CP1252), which has
 * no rupee sign — `₹` is therefore written as "Rs." rather than silently
 * dropped. Characters outside CP1252 (Devanagari, emoji) become "?", the same
 * compromise every non-embedded-font PDF makes.
 */

/** A4 in PostScript points. */
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;

export type Rgb = [number, number, number];

export const INK: Rgb = [0.06, 0.09, 0.16]; // slate-900
export const MUTED: Rgb = [0.39, 0.45, 0.55]; // slate-500
export const RULE: Rgb = [0.89, 0.91, 0.94]; // slate-200
export const ACCENT: Rgb = [0.31, 0.27, 0.9]; // indigo-600
export const ACCENT_TINT: Rgb = [0.93, 0.93, 1]; // indigo-50
export const WHITE: Rgb = [1, 1, 1];

/**
 * Adobe's published Helvetica advance widths, in 1/1000 em, for printable
 * ASCII. Right-aligned money and truncated descriptions both need to know how
 * wide a string will be before it is drawn.
 */
const WIDTHS_REGULAR =
  "278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584"
    .split(",")
    .map(Number);

const WIDTHS_BOLD =
  "278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584"
    .split(",")
    .map(Number);

/** Punctuation CP1252 places in 0x80–0x9F, where Latin-1 has control codes. */
const CP1252_EXTRAS: Record<string, number> = {
  "€": 0x80,
  "‚": 0x82,
  "ƒ": 0x83,
  "„": 0x84,
  "…": 0x85,
  "†": 0x86,
  "‡": 0x87,
  "‰": 0x89,
  "‹": 0x8b,
  "‘": 0x91,
  "’": 0x92,
  "“": 0x93,
  "”": 0x94,
  "•": 0x95,
  "–": 0x96,
  "—": 0x97,
  "›": 0x9b,
};

/** Rewrites what WinAnsi cannot hold into something a reader can still read. */
export function toWinAnsi(value: string): string {
  let out = "";
  // The rupee sign is the one substitution that carries meaning, so it is
  // spelled out rather than reduced to a question mark.
  for (const char of value.replace(/₹\s?/g, "Rs. ")) {
    const code = char.codePointAt(0) ?? 63;
    if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += char;
    else if (CP1252_EXTRAS[char] !== undefined) out += String.fromCharCode(CP1252_EXTRAS[char]);
    else if (char === "\t") out += " ";
    else out += "?";
  }
  return out;
}

/** Width of `value` once drawn, in points. Assumes `toWinAnsi` has run. */
export function textWidth(value: string, size: number, bold = false): number {
  const widths = bold ? WIDTHS_BOLD : WIDTHS_REGULAR;
  let units = 0;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    // Accented Latin-1 letters are close enough to their ASCII shapes, and
    // anything else that survived encoding is a letter-width glyph.
    units += code >= 32 && code <= 126 ? widths[code - 32] : 556;
  }
  return (units * size) / 1000;
}

/** Cuts a string to `maxWidth`, ending in an ellipsis when it had to. */
export function truncate(value: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(value, size, bold) <= maxWidth) return value;
  const ellipsis = "...";
  const room = maxWidth - textWidth(ellipsis, size, bold);
  let out = "";
  for (const char of value) {
    if (textWidth(out + char, size, bold) > room) break;
    out += char;
  }
  return `${out.trimEnd()}${ellipsis}`;
}

/** Greedy word wrap, used for notes that run past their column. */
export function wrap(value: string, maxWidth: number, size: number, bold = false): string[] {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(candidate, size, bold) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    // A single word wider than the column is cut rather than allowed to bleed.
    line = textWidth(word, size, bold) > maxWidth ? truncate(word, maxWidth, size, bold) : word;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The document information dictionary is read as PDFDocEncoding, not WinAnsi,
 * so the byte that draws an en-dash on the page decodes there as something
 * else entirely. Metadata is therefore flattened to plain ASCII.
 */
function toMetadataString(value: string): string {
  let out = "";
  for (const char of value.replace(/₹\s?/g, "Rs. ")) {
    const code = char.codePointAt(0) ?? 63;
    if (code >= 32 && code <= 126) out += char;
    else if ("–—−".includes(char)) out += "-";
    else if ("‘’".includes(char)) out += "'";
    else if ("“”".includes(char)) out += '"';
    else if (char === "·" || char === "•") out += "-";
    else out += " ";
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

const fixed = (n: number) => (Math.round(n * 100) / 100).toString();

export type TextOptions = {
  size?: number;
  bold?: boolean;
  color?: Rgb;
  align?: "left" | "right" | "center";
  /** Truncate with an ellipsis rather than overrun this width. */
  maxWidth?: number;
};

export class PdfDocument {
  private readonly pages: string[] = [];
  private current: string[] = [];

  constructor(private readonly title: string = "Report") {
    this.pages.push("");
    this.current = [];
  }

  /** Finishes the current page and starts a fresh one. */
  addPage(): void {
    this.flush();
    this.current = [];
    this.pages.push("");
  }

  private flush(): void {
    this.pages[this.pages.length - 1] = this.current.join("\n");
  }

  text(value: string, x: number, y: number, options: TextOptions = {}): void {
    const { size = 10, bold = false, color = INK, align = "left" } = options;
    let content = toWinAnsi(value);
    if (options.maxWidth !== undefined) content = truncate(content, options.maxWidth, size, bold);

    const width = textWidth(content, size, bold);
    const left = align === "right" ? x - width : align === "center" ? x - width / 2 : x;

    this.current.push(
      `BT /${bold ? "F2" : "F1"} ${fixed(size)} Tf ${color.map(fixed).join(" ")} rg ` +
        `1 0 0 1 ${fixed(left)} ${fixed(PAGE_HEIGHT - y)} Tm (${escapePdfText(content)}) Tj ET`,
    );
  }

  /** `y` is the top edge; the rectangle grows downwards. */
  rect(x: number, y: number, width: number, height: number, color: Rgb): void {
    this.current.push(
      `${color.map(fixed).join(" ")} rg ${fixed(x)} ${fixed(PAGE_HEIGHT - y - height)} ` +
        `${fixed(width)} ${fixed(height)} re f`,
    );
  }

  hairline(x1: number, y: number, x2: number, color: Rgb = RULE, thickness = 0.6): void {
    this.current.push(
      `${color.map(fixed).join(" ")} RG ${fixed(thickness)} w ` +
        `${fixed(x1)} ${fixed(PAGE_HEIGHT - y)} m ${fixed(x2)} ${fixed(PAGE_HEIGHT - y)} l S`,
    );
  }

  get pageCount(): number {
    return this.pages.length;
  }

  /**
   * Serialises the document. Every byte is Latin-1, so a string index is also
   * a byte offset — which is what lets the cross-reference table be built by
   * simply remembering where each object started.
   */
  build(now: Date = new Date()): Uint8Array {
    this.flush();

    const objects: string[] = [];
    const add = (body: string) => objects.push(body);

    const pageCount = this.pages.length;
    // 1 catalog, 2 pages, 3 regular font, 4 bold font, 5 info, then a page and
    // a content stream per page.
    const firstPageObject = 6;
    const pageIds = this.pages.map((_, i) => firstPageObject + i * 2);

    add(`<< /Type /Catalog /Pages 2 0 R >>`);
    add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`);
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    add(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    add(
      `<< /Title (${escapePdfText(toMetadataString(this.title))}) /Producer (RoomieHisab) /CreationDate (${pdfDate(now)}) >>`,
    );

    this.pages.forEach((content, i) => {
      const contentId = pageIds[i] + 1;
      add(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fixed(PAGE_WIDTH)} ${fixed(PAGE_HEIGHT)}] ` +
          `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    });

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];

    objects.forEach((body, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (const offset of offsets) {
      pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
    }
    pdf +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 5 0 R >>\n` +
      `startxref\n${xrefAt}\n%%EOF\n`;

    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i += 1) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return bytes;
  }
}

/** "D:20261020143000Z" — the only date syntax a PDF reader accepts. */
function pdfDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `D:${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  );
}

export const PDF_MIME = "application/pdf";
