import { CARD_FIELDS, UNDEFINED_FIELD, type CardField } from "./types";

/** Character-level edit distance (Levenshtein), two rows. */
export function editDistance(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    const row = [i];
    for (let j = 1; j <= y.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[y.length];
}

/**
 * docs/kpis.md, card accuracy: a major edit is any field where the asker changed more than
 * 30% of the characters (edit distance ÷ length of the generated text > 0.30), or replaced
 * generated content with "غير محدد".
 */
export function isMajorEdit(draft: Record<CardField, string>, final: Record<CardField, string>): boolean {
  return CARD_FIELDS.some((field) => {
    const before = draft[field].trim();
    const after = final[field].trim();
    if (before === after) return false;
    if (before !== UNDEFINED_FIELD && after === UNDEFINED_FIELD) return true;
    if (before === UNDEFINED_FIELD) return false;
    return editDistance(before, after) / Math.max(1, Array.from(before).length) > 0.3;
  });
}
