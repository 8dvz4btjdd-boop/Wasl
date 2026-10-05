import { normalizeNeed } from "./triggers";
/** Editorial search metadata, never religious answers or user belief classifications. */
export const CONCEPTS = {
  quran_translation: { query: "ترجمات معاني القرآن المعتمدة", sources: ["quran", "dictionary"], terms: /ترجم|translation|traduction|traduccion|terjemah|salin/ },
  quran_preservation: { query: "جمع القرآن ونقله", sources: ["quran", "bayyinat"], terms: /حفظ|تحريف|جمع القران|preserv|transmission|altered/ },
  quran: { query: "القرآن الكريم", sources: ["quran", "tafseer"], terms: /قران|قرآن|ايه|آية|quran|koran|verse/ },
  hadith: { query: "التحقق من الحديث وحكمه", sources: ["hadith"], terms: /حديث|احاديث|hadith/ },
  terms: { query: "المصطلحات الإسلامية ومعانيها", sources: ["dictionary"], terms: /مصطلح|معني|معنى|تعريف|ما هو|وش يعني|الشريعه|شريعة|sharia|termin|meaning|definition|what is/ },
  worship: { query: "العبادة والقبلة", sources: ["bayyinat", "aqeeda"], terms: /كعبه|الكعبة|عباد|kaaba|worship/ },
  women: { query: "المرأة في الإسلام", sources: ["bayyinat", "dawa_center"], terms: /مراه|المرأة|نساء|women|woman|femme|mujer/ },
  faith: { query: "الإيمان والتوحيد", sources: ["aqeeda", "bayyinat"], terms: /الله|توحيد|ايمان|faith|god|dieu|dios/ },
  history: { query: "السيرة والتاريخ الإسلامي", sources: ["history"], terms: /تاريخ|سيره|history|histor|biograph/ },
  fiqh: { query: "المراجع الفقهية المعتمدة", sources: ["fiqh"], terms: /فقه|صلاه|الصلاة|صيام|حكم|طلاق|fiqh|pray|fasting|divorce/ },
} as const;
export type ConceptId = keyof typeof CONCEPTS;
export type Intent = { concepts: ConceptId[]; query: string | null; sources: string[]; personal: boolean; ambiguous: boolean };
/** Private lexical extraction uses only authorized messages. External queries are fixed strings;
 * no substring from a user (names, addresses, beliefs, prompt injection) can become a web query.
 * For unrecognized/ambiguous intents, clarify instead of guessing.
 */
export function extractIntent(messages: readonly {body: string; sender_role: string}[]): Intent {
  const askerMessages = messages.filter(m => m.sender_role === "asker");
  const body = askerMessages.at(-1)?.body ?? "";
  const normalized = normalizeNeed(body);
  // Keep the requested side of explicit correction/negation; never simply strip "not".
  const corrected = normalized.split(/(?:لكن|بل|اقصد|i mean|instead|rather|je veux dire)/u).at(-1) ?? normalized;
  let concepts = (Object.keys(CONCEPTS) as ConceptId[]).filter(id => CONCEPTS[id].terms.test(corrected));
  // Inherit a subject only for an explicit follow-up, never merely because older text exists.
  if ((!concepts.length || concepts.every(id=>id==="terms")) && /(?:ذلك|هذا|فيه|عنها|معانيه|about that|about it|its meaning)/u.test(corrected)) {
    const prior = normalizeNeed(askerMessages.at(-2)?.body ?? "");
    concepts = [...new Set([...concepts, ...(Object.keys(CONCEPTS) as ConceptId[]).filter(id => CONCEPTS[id].terms.test(prior))])];
  }
  if (concepts.includes("quran_translation") || concepts.includes("quran_preservation")) concepts = concepts.filter(id => id !== "quran" && id !== "terms");
  const personal = /(?:هل.*(?:طلق|طلاقي|زواجي)|احكم.*(?:علي|عليه|فلان)|هل انا.*(?:كافر|اثم)|حكم.*حالتي|افتني|my (?:divorce|case)|am i (?:sinful|unbeliever)|تكفير|كافر|نزاع|ميراثي)/u.test(normalized);
  return { concepts, query: concepts.length ? concepts.slice(0, 2).map(id => CONCEPTS[id].query).join("؛ ") : null,
    sources: [...new Set(concepts.flatMap(id => [...CONCEPTS[id].sources]))].slice(0, 2), personal,
    ambiguous: !concepts.length || concepts.length > 2 };
}
