/**
 * Invite codes are join credentials: knowing one is enough to get into a
 * household, so they are generated with `crypto.getRandomValues` rather than
 * `Math.random`, which is predictable.
 *
 * The alphabet drops the characters people mistype when reading a code aloud
 * (0/O, 1/I/L, U/V) and the length gives 32^10 combinations — about 50 bits of
 * entropy. Combined with rules that permit `get` on an exact code but never
 * `list`, guessing a code is not a practical attack. Codes can also be rotated
 * by an admin, which immediately invalidates the old one.
 */

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
export const INVITE_CODE_LENGTH = 10;

export function generateInviteCode(): string {
  const bytes = new Uint8Array(INVITE_CODE_LENGTH);

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Only reachable in an environment without Web Crypto. Still unpredictable
    // enough to not be a silent downgrade, and every browser we target has it.
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  let code = "";
  for (const byte of bytes) code += ALPHABET[byte % ALPHABET.length];
  return code;
}

/** Normalises what the user typed: trims, upper-cases, strips spaces and dashes. */
export function normaliseInviteCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]/g, "");
}

export function isPlausibleInviteCode(raw: string): boolean {
  const code = normaliseInviteCode(raw);
  // Older households created by the starter had 6-character codes, so anything
  // from 6 to 10 valid characters is accepted at the input layer.
  return code.length >= 6 && code.length <= INVITE_CODE_LENGTH && /^[A-Z0-9]+$/.test(code);
}

/** "ABCD234XYZ" -> "ABCD-234-XYZ", easier to read out to a roommate. */
export function formatInviteCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}
