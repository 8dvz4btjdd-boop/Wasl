# سجل التحقق — النسخة الحالية 675a2e

الفحص على `/workspace/Wasl-audit-current-20261006`، detached عند `675a2e0089ee1e4324a7b438c17d570989793bc1`، دون تعديل ملفات المنتج أو lockfiles. Node `24.19.0`، npm `11.9.0`، Next `16.3.8`. كانت working tree نظيفة وبقيت نظيفة.

## النتائج الفعلية

| الأمر | النتيجة | الدليل |
|---|---|---|
| `npm ci --cache <audit-cache> --no-audit --no-fund` | فشل exit1: `EUSAGE` و12 dependencies/peer entries ناقصة من lock؛ ليس فشل شبكة | `evidence/commands/npm-ci.log` |
| `npm ci --legacy-peer-deps --cache <audit-cache> --no-audit --no-fund` | فشل exit1 للسبب نفسه؛ لم يُصلح lock | `evidence/commands/npm-ci-legacy-peer-deps.log` |
| `next typegen` ثم `tsc --noEmit` | exit0 لكليهما | `typegen.log` و`typecheck.log` |
| `npm run lint` | exit0، لا warnings، فحص logical RTL ناجح | `lint.log` |
| `tsx --conditions=react-server evals/sources-rules.ts` | 16/16 assertions deterministic ناجحة | `sources-rules.log` |
| `tsx --conditions=react-server evals/assist-rules.ts` | 24 assertions فعلية ناجحة + 1 تخطٍ لاختبار planning الحي. عرض runner «25/25» يتضمن skip موسومًا PASS | `assist-rules.log` |
| أداة audit الخارجية `setup` | exit0؛ five-container stack جديدة؛ ALL migrations الحالية `0001`–`0018` unchanged | `local-runtime-setup.log` |
| `next build --webpack` عبر أداة audit | exit0؛ compile17.4s، TypeScript7.0s، 98static pages | `build-webpack.log` |
| `next start` محليًا | جاهز؛ GET `/ar` و`/en` و`/ar/enter` أعادت200؛ RTL للعربية وLTR للإنجليزية | `next-start.log` و`local-http-smoke.json` |

جميع logs أعلاه في `evidence/commands/`. النتائج المنظمة في `analysis/CHECKS.json`.

## أثر عائق التثبيت

التثبيت النظيف الافتراضي والمعدّل بالـflag فشلا قبل وجود dependencies لهذا checkout. استُعمل بعد ذلك symlink ignored إلى `/workspace/Wasl/node_modules` للقراءة بعد التحقق من التطابق التام لـdependencies/devDependencies/overrides، وتطابق lock byte-for-byte، وتطابق جميع إصدارات dependencies المباشرة المثبتة مع lock. الدليل `dependency-cache-verification.json`. **نجاح typecheck/build بهذا المسار لا يثبت نجاح fresh install.** أقل قبول لمعالجة العائق لاحقًا: `npm ci` على checkout نظيفة بالأداة نفسها ينجح دون تعديل القفل أثناء التنفيذ. لم أعدّل القفل أو scripts أو dependencies.

## العزل والقيود

أداة runtime الخارجية `audit-local-runtime.mjs` نسخة مراجعة من helper سابق، تغير فيها مسار repository فقط إلى النسخة الحالية. لا تعتمد شواهد سابقة لإثبات النسخة الحالية. prefix جديد `wasl-contextual-audit-20261006`، state خاص خارجGit، gateway `127.0.0.1:55641`، DB `127.0.0.1:55642`، app `127.0.0.1:3062`. مفاتيحJWT والاعتماديات الأمنية لهذا stack مولدة اصطناعيًا جديدًا ومحفوظة بملفات0600 داخل directory0700، ولم تُطبع. لم تُنسخ credentials أو بيانات stacks سابقة. المصدران المنسوخان هما Debian extensions العامة المثبتة بالـSHA وFontsource العامة فقط. توجد ledger دعم audit وحيدة `public.contextual_local_migrations` لتسجيل أسماء/بصمات migrations؛ ليست migration منتج.

كل فحص متصل بالتطبيق أو قاعدة الاختبار شُغّل عبر runtime profile الذي يفرغ `ANTHROPIC_API_KEY` و`ELEVENLABS_API_KEY` صراحة؛ أداة التشغيل تفرض LOCAL Supabase URL والمفاتيح الاصطناعية، وpaid approval=false وbudget=0. لم تجر استدعاءات مدفوعة أو استخدام بيانات أشخاص أو الاتصال بقاعدة خارجية. لم تشغّل `seed` أو`demo:reset` أو`db:types --linked` أو`ai-live.mjs` أو promptfoo/model evals. لا يوجد `npm test` في manifest؛ فحوص rule-only الحالية شُغّلت مباشرة دون `.env.local`.

الـbuild استعمل webpack وPUBLIC font response fixture خارجcheckout؛ لم يُختبر default Turbopack أو وصول Google Fonts. لا تمنح assertions المصادر اعتمادًا علميًا ولا تثبت أنها نُقلت من الموقع فعليًا: تلك حالات اختبار مكتوبة في المشروع. اختبارات النموذج والتخطيط والصوت الحية غير منفذة. تجربة المتصفح الحالية وSQL الأمنية يملك أدلتها الوكلاء المختصون، وتضم `analysis/security-repro.sql` و`.log` بـBEGIN/ROLLBACK، ولا تُحسب لقطات الإصدار السابق ضمن الحالي.

المخرجات الوحيدة داخل checkout ignored: `node_modules` symlink و`.next` و`next-env.d.ts` و`tsconfig.tsbuildinfo`. سائر helper/state/logs/analysis خارج ملفات المنتج. أُوقف خادم Next المملوك للمراجعة بعد انتهاء المتصفح؛ المنفذ3062 غير مستمع. الحاويات الجديدة باقية ولم تُحذف أي حاوية سابقة. أثبتت القراءة النهائية أن organizations/profiles/askers/conversations/cards/messages/events/ai_runs/authUsers كلها0، وأن شجرة النسخة الحالية والنسخ السابقة نظيفة، وmanifest/lock لم يتغيرا. الدليل `evidence/commands/final-preservation.json`.
