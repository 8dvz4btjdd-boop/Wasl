// Which asker messages are a need worth a search. Ported from the contextual-recommendations
// branch (lib/recommendations/triggers.ts). Greetings, thanks and repeats never trigger a
// search; a correction (a different text) is a new need.

type Message = { id: string; body: string; sender_role: string; state?: string };

/** Comparable form: Unicode-normalized, lower case, no Arabic diacritics, alef forms unified, no punctuation. */
export function normalizeNeed(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const COURTESY =
  /^(?:شكرا(?: لك| جزيلا| اخي| اختي)?|جزاك الله (?:خيرا|خير)|بارك الله فيك|السلام عليكم(?: ورحمة الله(?: وبركاته)?)?|وعليكم السلام|مرحبا|اهلا|تمام|حسنا|نعم|لا|thanks?(?: you| a lot| brother| sister)?|thank you(?: very much| so much)?|hello|hi|ok(?:ay)?|yes|no|merci(?: beaucoup| infiniment)?|bonjour|(?:muchas )?gracias|hola|terima kasih(?: banyak)?|salamat(?: po)?|(?:بہت )?شکریہ)$/u;

/** A real need: not empty, not a courtesy, at least a short concept. */
export function isSubstantiveNeed(text: string): boolean {
  const normalized = normalizeNeed(text);
  if (!normalized || COURTESY.test(normalized)) return false;
  // A submitted short concept or a correction counts; punctuation is not the gate.
  return normalized.length >= 3 && normalized.length <= 8_000;
}

/**
 * The current need among the messages (oldest first): the latest substantive asker message.
 * Only stored asker rows count. Consecutive repetition or courtesy keeps the prior need;
 * returning to A after discussing B is a new current need.
 */
export function chooseNeed<T extends Message>(messages: readonly T[]): T | null {
  let latest: T | null = null;
  for (const message of messages) {
    if (message.sender_role !== "asker" || message.state || !isSubstantiveNeed(message.body)) continue;
    if (latest && normalizeNeed(latest.body) === normalizeNeed(message.body)) continue;
    latest = message;
  }
  return latest;
}
