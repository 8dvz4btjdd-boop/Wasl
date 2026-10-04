import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";

// No 0/O, 1/I/L: easy to read back and type.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const LENGTH = 10;

/** Strips separators and case so "abcd-efgh-jk" and "ABCDEFGHJK" match. */
export function normalizeReturnCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, "");
}

/** A new code formatted as XXXX-XXXX-XX (~49 bits). */
export function generateReturnCode(): string {
  const raw = Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
}

export function hashReturnCode(code: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${normalizeReturnCode(code)}`).digest("hex");
}

export function verifyReturnCode(code: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashReturnCode(code, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
