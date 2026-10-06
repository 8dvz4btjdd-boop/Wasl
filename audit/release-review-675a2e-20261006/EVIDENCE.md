# وصل — سجل الأدلة وإعادة التحقق

الأساس `675a2e0089ee1e4324a7b438c17d570989793bc1`؛ مرجع التقرير [RELEASE_REVIEW_AR.md](RELEASE_REVIEW_AR.md)، والاستخدام [AI_USAGE.json](AI_USAGE.json). كل الأدلة الجديدة بتاريخ 6 أكتوبر 2026. لا تحويل لشاهد قديم إلى إثبات النسخة الحالية.

## دليل الادعاء ودليله وحدوده

| السؤال/الادعاء | الدليل | الحدود |
|---|---|---|
| هل نراجع أحدث النسخة المتاحة؟ | [SNAPSHOT.json](evidence/SNAPSHOT.json)، [FINAL_STATE.json](evidence/FINAL_STATE.json)، [PUBLIC_REPOSITORIES.json](evidence/PUBLIC_REPOSITORIES.json) | تطابق main في اللحظات المسجلة فقط؛ لا مواكبة تلقائية بعد انتهاء الفحص |
| هل الرابط العام يعمل ويطابق النسخة؟ | [PUBLIC_DEPLOYMENT_HTTP.json](evidence/PUBLIC_DEPLOYMENT_HTTP.json) | alias200؛ النشر GitHub-linked لـ SHA محمي بدخول Vercel؛ مطابقة alias غير متحققة، لا جلسة حية |
| هل تعمل الرحلة اليدوية؟ | [results.json](evidence/ui/results.json)، [supplement-results.json](evidence/ui/supplement-results.json)، صور human-chat/card/resumed | تشغيل حقيقي محلي Auth/REST/Realtime و DB؛ fixtures اصطناعية؛ لا تشغيل نموذج حي |
| هل يحفظ التحويل الخصوصية؟ | [security-repro.log](analysis/security-repro.log) و result `previousUnselectedMessageVisibleToNext=true` | **لا** في الاختبار الحالي؛ لا اختبار إنتاج/استغلال بحساب حقيقي |
| هل يمنع admin/unassigned من كل المضمون؟ | SQLSEC01/02 | messages ممنوعة، guide_summary/intakes مقروءة؛ لا payloadRealtimeadmin حي |
| هل draft والتعديل بعد الاعتماد مخفيان؟ | SQL controls و SEC04companion | النص/اختيارات/مشاركة محمية و expiry يعمل؛ مفاتيح علاقة session card غير مكتملة |
| هل تأخذ خدمة AIcard المختارات فقط؟ | `/api/ai/card:20–48` و`submitCard:43–158` | تتبع خادمي مع تحقق الملكية وال IDs؛ لا طلب card حي ناجح ولا إثبات سلامة معنى المخرج |
| هل يعمل fallback؟ | supplement-results:missing-key/AIoff/skip/mic-denial | فقد key/off يتيح اليدوي؛ لا نجاح STT أو جودة صوت ElevenLabs |
| هل يحفظ الانقطاع العمل؟ | `card-save-offline-boundary-*.png` و offline result | **لا** لتحرير غير محفوظ في الحالات المحدودة؛ لا تعميم لكل state |
| هل نجح التثبيت والبناء؟ | [CHECKS.json](analysis/CHECKS.json) و logs | npmci فشل؛ cached type/lint/webpack نجحت، localfontfixture؛ لا defaultTurbopack |
| هل اجتازت الحالات العلمية؟ | [reference-materials.json](evidence/reference-materials.json)، [DELIVERY_CHECKLIST.json](evidence/DELIVERY_CHECKLIST.json) | الاثنتا عشرة غير متحققة end-to-end/بشريًا؛ قواعد mocks ليست اعتمادًا علميًا |
| هل نعرف تكلفة جلسة؟ | [AI_USAGE.json](AI_USAGE.json) و[AI_USAGE_MEASURED.json](analysis/AI_USAGE_MEASURED.json) |2pingattempts،0success،tokens/costnull؛ scenarios مفترضة، لافاتورة/P95 |
| هل قياس التصحيح الجوهري صحيح لكل تغير؟ | [METRIC_PROBE.json](evidence/METRIC_PROBE.json) | ملء undefined أعاد false؛ probe دالة فعلي، لا قياس أداء بشري |
| هل الفيديو والعرض جاهزان؟ | [DELIVERY.md](analysis/DELIVERY.md) | لم يعثر عليهما في الملفات المتاحة؛ لا يعني أن الفريق لا يملكهما |

الادعاءات غير المسموح بإطلاقها من هذه الأدلة: «آمن إنتاجيًا»، «المشرف لا يرى أي مضمون»، «المحاور التالي يرى البطاقة فقط»، «المراجعة العلمية مكتملة»، «التوصيات تتحدث تلقائيًا مع كل مقصد جديد»، «الذكاء أثبت تحسنًا مقابل اليدوي»، «تكلفة الرحلة X» أو«PMF مثبت». العرض/الفيديو المسجل يوسم بأنه مسجل، والمادة التي لا تحمل اعتماد مختص لا توصف بأنه اعتمدها.

## نتائج الأوامر الفعلية

المسار الحالي `/workspace/Wasl-audit-current-20261006`؛ Node24.19.0، npm11.9.0، Next16.3.8. استخدمنا أوامر قواعد مباشرة بعد إفراغ مفاتيح المزود وعدم تحميل `.env.local`، وليس suite قد تتصل أو تكتب قاعدة.

| الأمر | النتيجة | السجل |
|---|---|---|
| `git rev-parse HEAD`، `git status --porcelain`، `git ls-remote … refs/heads/main` |675a2e؛clean؛bothmain متطابقان |snapshot/finalstate |
| `npm ci --cache <isolated-audit-cache> --no-audit --no-fund` |exit1/EUSAGE |`evidence/commands/npm-ci.log` |
| `npm ci --legacy-peer-deps --cache <isolated-audit-cache> --no-audit --no-fund` |exit1/EUSAGE |`npm-ci-legacy-peer-deps.log` |
| `node node_modules/next/dist/bin/next typegen` |exit0 |`typegen.log` |
| `node node_modules/typescript/bin/tsc --noEmit` |exit0 |`typecheck.log` |
| `npm run lint` |exit0،0warnings،logicalRTLpass |`lint.log` |
| `node node_modules/tsx/dist/cli.mjs --conditions=react-server evals/sources-rules.ts` |exit0،16assertions |`sources-rules.log` |
| الأمر نفسه لـ`evals/assist-rules.ts` |exit0،24assertions و 1liveSKIP |`assist-rules.log`؛printed25/25 يشمل SKIP |
| `node <audit>/audit-local-runtime.mjs setup` |exit0،5containersfresh،0001–0018exact |`local-runtime-setup.log`،`applied-migrations.json` |
| `node <audit>/audit-local-runtime.mjs build` |exit0؛underlying`next build --webpack`،98pages |`build-webpack.log`؛fontsourcefixture/cacheddeps |
| `node <audit>/audit-local-runtime.mjs start-production` |ready3062،GET200 |`next-start.log`،`local-http-smoke.json`؛خادمنا أوقف لاحقًا |
| SQL المستقل تحت`docker exec … psql -v ON_ERROR_STOP=1` |exit0،BEGIN/ROLLBACK |`analysis/security-repro.sql` و`.log` |
| `node --import tsx --conditions=react-server --test <audit>/analysis/security-pure.test.ts` |6/6PASS |`security-pure.log`؛mockDNS/HTTP فقط |
| scientific-offline-probes |8probes للدوال،بلا API |`scientific-offline-probes.json`؛لا 8 أجوبةحية |
| metric-probe |4 حالات pure |`METRIC_PROBE.json` |
| browser-audit و browser-supplement |رحلة وفشل offline وحالات fallback/locales |السجلان واللقطات الحالية؛لااختبارإنتاج |
| `node <audit>/tools/usage-guard.test.mjs` |PASS |الحارس خارج المنتج؛جدول retry/reservations/null |
| collector المدفوعالمصرح |توقف:Nodetransport ثم proxy-aware401 |`AI_USAGE_MEASURED.json`؛2ping فقط،ordinarytaskcalls0 |

ملاحظتان عن نزاهة السجل: `results.json` يحتفظ بـ timeout لزر «رجوع» بعد إثبات العودة وربط الجلسة؛ لا يثبت عطل العودة، بل توقف بقية script عند locator. ومحاولة cleanup أولى حملت `user_not_found`؛ السجل الإضافي والتحقق النهائي أثبتا cleanup وعدد الصفوف 0. لم نحذف هاتين النتيجتين أو نحولهما إلى PASS. محاولات browser المتعثرة ليست أدلة نجاح، والعد النهائي لا يغطي جودة الاستئناف بعد أول رد جديد.

## صور حديثة مختارة

كل الصور هنا من تشغيل النسخة الحالية محليًا، مع حجب الحقول/المضمون/الأكواد. عرض 390 للجوال و 1440 للحاسب؛ لا overflow شوهد على الأسطح المصورة، وليس اختبارًا لكل الأحجام/الصفحات أو accessibilityaudit كامل.

- [landing-mobile.png](evidence/ui/landing-mobile.png): الهوية و RTL.
- [human-chat-mobile.png](evidence/ui/human-chat-mobile.png): محادثة السائل.
- [daee-chat-desktop.png](evidence/ui/daee-chat-desktop.png): واجهة الداعية والأداة الجانبية.
- [card-default-selection-mobile.png](evidence/ui/card-default-selection-mobile.png): الاختيار الافتراضي.
- [card-review-mobile.png](evidence/ui/card-review-mobile.png): معاينة المشاركة وأربعة الحقول.
- [transferred-daee-desktop.png](evidence/ui/transferred-daee-desktop.png): المحاور بعد التحويل؛ حقيقة وصول المقطع مستندة assertion لاقراءةالصورةالمحجوبة.
- [resumed-chat-mobile.png](evidence/ui/resumed-chat-mobile.png): جلسة العودة المرتبطة.
- [card-save-offline-boundary-mobile.png](evidence/ui/card-save-offline-boundary-mobile.png): خطأ الحفظ وفقدالتحرير.
- [guide-microphone-denied-mobile.png](evidence/ui/guide-microphone-denied-mobile.png): رفض الميكروفون ومسارالنص.
- [waiting-no-human-desktop.png](evidence/ui/waiting-no-human-desktop.png): الانتظار الحقيقي محليًا.
- [guide-final-session-page35.png](evidence/guide-final-session-page35.png): الدليل الرسمي للخمس دقائق والثلاث أسئلة، ليس واجهةوصل.

لا نستخدم 142 لقطة tracked أقدم بدل الشواهد الحالية. اللقطات المحجوبة تثبتواجهة/حالة، ولا تصلح فيديو منتج يظهر النص النافع؛ على الفريق تصوير المثال الاصطناعي النهائي بعد إصلاحه وفحصه.

## إعادة التحقق بأمان لدى جود

اختبارات SQL وأدوات المراجعة محفوظة هنا، وأُنشئت للمراجعة؛ لم تكن اختبارات موجودة أصلًا في المنتج. بعضها يثبت تجاوزًا متوقعًا حاليًا، لذا PASS يعني نجاح إعادة إظهار الخلل. بعد الإصلاح، اعكس assertions السلبية لتثبت رفض الوصول. لا تنقل fixtures إلى الإنتاج.

1. تحقق من SHA والوجهة قبل كل أمر متصل. أنشئ قاعدة محلية جديدة تطبق migrations النسخة المطلوبة، دون seed أو reset أو migrations على قاعدة خارجية. راجع ثوابت helper وأسماء الحاويات قبل استعماله.
2. نفذ الفحوص غير المتصلة بعد إزالة `ANTHROPIC_API_KEY` و`ELEVENLABS_API_KEY` من process فقط. لا تشغل `npm run evals` أو `ai-live.mjs` أو `ai-card.mjs` أو `sources.mjs` بلا قراءة وصلاحية: بعضها مدفوع وبعضها يعدل org/DB أو يختار الموقع الحي.
3. لإعادة SQL في البيئة المحلية الحالية، تحقق أن label يساوي `true`، ثم نفذ الأمر. لا تبدل اسم الحاوية بقاعدة مجهولة. ينتهي الاختبار بـ ROLLBACK:

```bash
docker inspect wasl-contextual-audit-20261006-db --format '{{index .Config.Labels "wasl.contextual.local"}}'
docker exec -i wasl-contextual-audit-20261006-db psql -U postgres -v ON_ERROR_STOP=1 < /workspace/wasl-release-audit-20261006/analysis/security-repro.sql
```

4. لنقل أدوات audit، عدّل prefix المسار في **نسخة الأداة الخارجية** إلى checkout جود، دون تغيير المنتج؛ بعض imports تستخدم المسار الفعلي لهذه البيئة. راجع scripts المتصفح قبل تشغيلها: تنشئ هويات اصطناعية في stack محلية وتحذفها. npm ci ما زال يمنع إعادة تثبيت نظيفة حتى تصلحه جود.
5. القياس الحي يحتاج credential يصادق و ledger ميزانية مشتركًا لا يصفّر عند retry. الحارس المرفق خارج كود الإصدار؛ cap1024 في أداة الاختبار فقط، ولم يصل إلى مهمة ناجحة. لا نموذج CARD مخمّن أو tools native داخل عينة الدولار الواحد.

إعداد helper المحلي المستخدم، دون أسرار، موثق في `tools/LOCAL_TEST_SETTINGS.env.example`. ملف state الحقيقي غير مشمول. راجع المصدر عند نقله: يحتاج Docker ونسخ الصور المسجلة وامتدادات PostgreSQL العامة ببصماتها؛ لا يوصف بأنه منصة إنتاج أو أمر تثبيت مستقل بنقرة واحدة.

## الوثائق الأصلية والحدود العلمية

قرأنا الحزمة العلمية ذات 8 صفحات ودليل المشارك ذي 44 صفحة المرفقين. أسماؤهما و SHA ومواضع البنود محفوظة في `reference-materials.json`. الحالات الاثنتا عشرة من الحزمة ص 6. الفيديو≤120 ثانية والعرض PDF/PPT والتشغيل والمصادر والتراخيص موثقة بصفحاتها في DELIVERY. لم نكرر الوثائق كاملة داخل ZIP؛ ملف تقديم وصل الأصلي لم يُعثر عليه، ولم نستبدله من الذاكرة.

مراجعة المعنى والنفي والاستثناء والحديث والآية والترجمة تحتاج مختصًا. صحة domain و JSON لا تكفي. الاختبارات الحالية تثبت قواعد برمجية؛ لا شاهد حي جديد يثبت مادة علمية نافعة، ولا مقارنة بشرية مضبوطة على المواد نفسها.

## الحالة النهائية وسلامة الحزمة

`evidence/FINAL_STATE.json` يسجل التوقيت و HEAD و remote SHA و clean status وبصمات manifest/lock وعدد fixtures صفرًا. الملفات المولدة داخل checkout ignored: رابط node_modules و.next و next-env.d.ts و tsconfig.tsbuildinfo؛ بقية المخرجات خارج المنتج. لم ننظف ملفات أو حاويات سابقة. أوقفنا Next الخاص بالمراجعة، والحاويات المحلية الجديدة باقية داخل بيئة العمل.

الحزمة تستخدم قائمة ملفات صريحة للتقارير و JSON/CSV والأدوات والأدلة المحجوبة. تستبعد local-state و.env و credentials و cookies و node_modules و raw provider payloads. بصمات الملفات في MANIFEST.json، وفحص ZIP يتحقق من CRC. لم يحدث تعديل منتج أو PR أو merge أو deploy. سجل FINAL_STATE مؤرخ قبل إذن الرفع، ويوثق شجرة المنتج والحالة وقت انتهاء الفحص.

**إذن التصدير اللاحق:** وافق المستخدم صراحة على نشر الأدلة في الفرع العام `audit/release-review-675a2e-20261006`، بعد إخباره أن الحزمة تتضمن تفاصيل تجاوزات الخصوصية. يخص الإذن commit/push لملفات audit فقط. سيُتحقق من رابط ZIP والفرع بعد الرفع؛ مسار /mnt/data رفض الكتابة ولا توجد أداة مرفقات مستقلة في هذه البيئة. لا يدعي هذا الإذن أن المنتج نُشر أو أُصلح.
