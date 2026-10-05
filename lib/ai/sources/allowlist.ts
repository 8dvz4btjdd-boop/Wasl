// The fence: the only domains readings may come from, and the rules per domain. Nothing
// else, ever. Used as the web search tool's allowed_domains and again on every citation.

export type Audience = "asker" | "daee";
export type Citation = { url: string; title: string; cited_text: string };

export const ALLOWED_DOMAINS = ["dawa.center", "islamic-content.com", "quranpedia.net", "dorar.net", "shamela.ws"] as const;

/** The registrable domain of a URL if it is on the list (subdomains count), else null. */
export function allowedDomain(url: string): (typeof ALLOWED_DOMAINS)[number] | null {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    host = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  return ALLOWED_DOMAINS.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;
}

// A Qur'anic verse in the passage: the ornate brackets around verse text, or a verse-quoting formula.
const VERSE = /[﴿﴾]|قال (الله )?تعالى|قوله تعالى/;
// A hadith in the passage, and a grading next to it.
// Narration formulas only: a biography that names the Prophet ﷺ is not a hadith.
const HADITH = /قال رسول الله|قال النبي|سمعت رسول الله|عن النبي ﷺ (قال|أنه قال)|أن (النبي|رسول الله) ﷺ قال|صلى الله عليه وسلم:? قال|صلى الله عليه وسلم يقول/;
const GRADING = /خلاصة حكم المحدث|حكم المحدث|إسناده (صحيح|حسن|ضعيف)|\b(صحيح|حسن|ضعيف|موضوع|منكر)\b|(صحيح|حسن|ضعيف)(\s|،|\.)/;

const DORAR_SECTIONS = ["hadith", "ahadith", "aqeeda", "tafseer", "history", "feqhia"] as const;

/** dorar.net's section, ignoring a language prefix (/en/tafseer/… is the tafseer section). */
function dorarSection(url: string) {
  const path = new URL(url).pathname.toLowerCase().replace(/^\/(ar|en|fr|es|ur|id|tl|tr|ru|de)(?=\/)/, "");
  const section = DORAR_SECTIONS.find((s) => path === `/${s}` || path.startsWith(`/${s}/`));
  return section === "ahadith" ? "hadith" : section;
}

/** Whether the asker may see an item from this URL (dorar feqhia never). */
export function askerAllowed(url: string): boolean {
  const domain = allowedDomain(url);
  if (domain !== "dorar.net") return domain !== null;
  return dorarSection(url) !== "feqhia";
}

/**
 * Applies the fence and the per-domain rules to one citation. Returns the reason it's
 * dropped, or null when it may be shown to this audience.
 */
export function rejectReason(c: Citation, audience: Audience): string | null {
  const domain = allowedDomain(c.url);
  if (!domain) return "domain";
  if (!c.cited_text.trim()) return "empty";
  const path = new URL(c.url).pathname.toLowerCase();

  // Verse text only from quranpedia.net.
  if (domain !== "quranpedia.net" && VERSE.test(c.cited_text)) return "verse_outside_quranpedia";

  if (domain === "dorar.net") {
    const section = dorarSection(c.url);
    if (!section) return "dorar_section";
    if (section === "feqhia" && audience === "asker") return "feqhia_asker";
    if (section === "hadith" && !GRADING.test(c.cited_text)) return "hadith_ungraded";
  }
  // A hadith anywhere needs its grading alongside it.
  if (HADITH.test(c.cited_text) && !GRADING.test(c.cited_text)) return "hadith_ungraded";
  return null;
}

/** dawa.center's بينات file (7937) comes first for doubts. */
export function preferFirst(c: Citation, topic: string): boolean {
  return topic === "doubts" && allowedDomain(c.url) === "dawa.center" && /7937/.test(c.url);
}
