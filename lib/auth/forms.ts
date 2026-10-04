import { z } from "zod";
import { routing } from "@/i18n/routing";

// Shared by server actions and their client forms.

export type FormError =
  | "invalidInput"
  | "credentials"
  | "notStaff"
  | "pseudonymInvalid"
  | "pseudonymTaken"
  | "backgroundTooLong"
  | "returnFailed"
  | "locked"
  | "generic";

export type FormState = { error?: FormError; minutes?: number };

export const LocaleField = z.enum(routing.locales);

export const PSEUDONYM_MAX = 24;
export const BACKGROUND_MAX = 280;

/** Trims and collapses inner whitespace: the stored form of a pseudonym. */
export function cleanPseudonym(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export const Pseudonym = z
  .string()
  .transform(cleanPseudonym)
  .pipe(z.string().regex(new RegExp(`^[\\p{L}\\p{N}_\\- ]{2,${PSEUDONYM_MAX}}$`, "u")));
