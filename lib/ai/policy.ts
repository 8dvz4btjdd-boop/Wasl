import "server-only";

// Markers of a religious ruling or a quoted source. A model-authored output containing any
// of them is not shown: the run falls back with reason "policy" (fixed limits 2 and 10).
const MARKERS = [
  "يجوز",
  "لا يجوز",
  "حرام",
  "حلال",
  "قال تعالى",
  "عن النبي ﷺ",
  "عن النبي",
  "قال رسول الله",
  "is permissible",
  "is not permissible",
  "is forbidden",
  "is haram",
  "is halal",
  "allah says",
  "god says",
  "the prophet said",
  "narrated by",
  "fatwa:",
];

function strings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => strings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => strings(v, out));
  return out;
}

/** True when the output carries a ruling or citation marker. */
export function violatesPolicy(output: unknown): boolean {
  const text = strings(output).join("\n").toLowerCase();
  return MARKERS.some((m) => text.includes(m.toLowerCase()));
}
