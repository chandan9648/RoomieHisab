/**
 * A minimal ZIP writer, which exists so the Excel export can produce a real
 * `.xlsx` — an OOXML workbook is a ZIP of XML parts — without pulling a
 * spreadsheet library into a phone-first bundle.
 *
 * Entries are *stored*, not deflated. The ZIP spec allows it, every unzipper
 * (Excel included) reads it, and it means no compressor has to ship to the
 * browser. A month of expenses is a few kilobytes of XML, so the file is small
 * either way.
 */

/** Reflected CRC-32 (IEEE 802.3), built once and reused. */
let CRC_TABLE: Uint32Array | null = null;

function crcTable(): Uint32Array {
  if (CRC_TABLE) return CRC_TABLE;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  CRC_TABLE = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = {
  /** Forward-slash path inside the archive, e.g. "xl/worksheets/sheet1.xml". */
  name: string;
  data: Uint8Array;
};

/** MS-DOS packed time and date, which is all a ZIP header can carry. */
function dosStamp(date: Date): { time: number; date: number } {
  // Seconds have two-second resolution in the DOS format, hence the halving.
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day =
    ((Math.max(1980, date.getFullYear()) - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: day };
}

const LOCAL_HEADER = 30;
const CENTRAL_HEADER = 46;
const END_OF_CENTRAL_DIRECTORY = 22;

export function zipSync(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const stamp = dosStamp(now);

  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    return { name, data: entry.data, crc: crc32(entry.data), offset: 0 };
  });

  const localSize = prepared.reduce((n, e) => n + LOCAL_HEADER + e.name.length + e.data.length, 0);
  const centralSize = prepared.reduce((n, e) => n + CENTRAL_HEADER + e.name.length, 0);

  const out = new Uint8Array(localSize + centralSize + END_OF_CENTRAL_DIRECTORY);
  const view = new DataView(out.buffer);
  let at = 0;

  const u16 = (value: number) => {
    view.setUint16(at, value, true);
    at += 2;
  };
  const u32 = (value: number) => {
    view.setUint32(at, value >>> 0, true);
    at += 4;
  };
  const bytes = (value: Uint8Array) => {
    out.set(value, at);
    at += value.length;
  };

  for (const entry of prepared) {
    entry.offset = at;
    u32(0x04034b50); // local file header signature
    u16(20); // version needed to extract
    u16(0x0800); // flags: names and comments are UTF-8
    u16(0); // method: stored
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.data.length); // compressed size — the same, since nothing is compressed
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra field length
    bytes(entry.name);
    bytes(entry.data);
  }

  const centralStart = at;

  for (const entry of prepared) {
    u32(0x02014b50); // central directory header signature
    u16(20); // version made by
    u16(20); // version needed to extract
    u16(0x0800);
    u16(0);
    u16(stamp.time);
    u16(stamp.date);
    u32(entry.crc);
    u32(entry.data.length);
    u32(entry.data.length);
    u16(entry.name.length);
    u16(0); // extra
    u16(0); // comment
    u16(0); // disk number start
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(entry.offset);
    bytes(entry.name);
  }

  // Captured before the trailer is written, because `at` keeps moving.
  const centralEnd = at;

  u32(0x06054b50); // end of central directory signature
  u16(0); // this disk
  u16(0); // disk with the central directory
  u16(prepared.length);
  u16(prepared.length);
  u32(centralEnd - centralStart);
  u32(centralStart);
  u16(0); // archive comment length

  return out;
}
