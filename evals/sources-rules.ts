// Deterministic checks of the approved-sources fence (no model call). Part of npm run evals.
import { keepApproved } from "@/lib/ai/tasks/find-sources";

type C = { url: string; title: string; cited_text: string };
const asker = { audience: "asker" as const, topic: "general", level: "a" as const };
const daee = { ...asker, audience: "daee" as const };
const kept = (items: C[], who: { audience: "asker" | "daee"; topic: string; level: "a" } = asker) => keepApproved(items, who).map((c) => c.url);

const cases: [string, boolean][] = [];
const check = (name: string, ok: boolean) => cases.push([name, ok]);

const feqhia = { url: "https://dorar.net/feqhia/1234", title: "الموسوعة الفقهية", cited_text: "مسألة في أحكام الصلاة عند الفقهاء." };
check("feqhia never reaches an asker", kept([feqhia]).length === 0);
check("feqhia may reach a daee", kept([feqhia], daee).length === 1);

const ungraded = { url: "https://dorar.net/hadith/sharh/1", title: "حديث", cited_text: "قال رسول الله ﷺ: إنما الأعمال بالنيات." };
const graded = { ...ungraded, url: "https://dorar.net/hadith/sharh/2", cited_text: "قال رسول الله ﷺ: إنما الأعمال بالنيات. خلاصة حكم المحدث: صحيح" };
check("a hadith without a grading is dropped", kept([ungraded], daee).length === 0);
check("a hadith with its grading is kept", kept([graded], daee).length === 1);

const other = { url: "https://example.com/islam", title: "Other", cited_text: "Some text." };
const lookalike = { url: "https://dorar.net.example.com/aqeeda/1", title: "Look-alike", cited_text: "Text." };
const http = { url: "javascript:alert(1)", title: "x", cited_text: "x" };
check("a citation from any other domain is dropped", kept([other, lookalike, http], daee).length === 0);

const verseElsewhere = { url: "https://islamic-content.com/article/1", title: "Article", cited_text: "قال تعالى ﴿قل هو الله أحد﴾" };
const verseQuranpedia = { url: "https://quranpedia.net/surah/1/112", title: "سورة الإخلاص", cited_text: "﴿قل هو الله أحد﴾" };
check("verse text from outside quranpedia.net is dropped", kept([verseElsewhere]).length === 0);
check("verse text from quranpedia.net is kept", kept([verseQuranpedia]).length === 1);

const dorarOther = { url: "https://dorar.net/article/5", title: "مقال", cited_text: "نص." };
check("dorar.net outside aqeeda, tafseer, history, hadith, feqhia is dropped", kept([dorarOther], daee).length === 0);
check("dorar.net aqeeda is kept", kept([{ url: "https://dorar.net/aqeeda/12", title: "عقيدة", cited_text: "نص في العقيدة." }]).length === 1);

check("level c or d returns nothing for askers", keepApproved([verseQuranpedia], { ...asker, level: "d" }).length === 0);
check("at most 3 results", keepApproved(Array.from({ length: 5 }, (_, i) => ({ ...verseQuranpedia, url: `https://quranpedia.net/surah/${i}` })), asker).length === 3);

const bayyinat = { url: "https://dawa.center/file/7937", title: "بينات", cited_text: "نص." };
const otherDoubt = { url: "https://islamic-content.com/a", title: "a", cited_text: "نص آخر." };
check("بينات (dawa.center 7937) first for doubts", keepApproved([otherDoubt, bayyinat], { ...asker, topic: "doubts" })[0].url === bayyinat.url);

let failed = 0;
for (const [name, ok] of cases) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
console.log(`${cases.length - failed}/${cases.length} fence rules pass`);
process.exit(failed ? 1 : 0);
