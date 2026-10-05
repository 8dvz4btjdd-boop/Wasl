# اختبارات الواجهتين محليًا — أساس جود e169

هذا التشغيل يستخدم التطبيق الحقيقي وSupabase Auth وPostgREST وRealtime وقاعدة PostgreSQL منفصلة، مع هويات ومحادثات اصطناعية فقط. لا يثبت إعداد الموقع المنشور أو حكمًا علميًا على النصوص. اختبارات `--mock-states` تختبر العرض فقط، وتضع `MOCK UI` في عنوان المادة وتستعمل نصًا غير ديني ورابطًا غير حقيقي.


الأساس الذي اختُبر هنا: `e169d0f978104926632597fdd4d5f3d56232c932`، في `/workspace/Wasl-contextual-joud`، فرع `feat/contextual-recommendations-joud-e169`. أرقام ولقطات النسخة السابقة تحت `evidence/prior-e4f57fb/` سجل سابق فقط؛ لا تثبت نجاح النقل إلى هذا الأساس.

قبل جميع أوامر هذا الملف، اضبط profile الاختبار الجديد في terminal نفسه:

```sh
export VERIFY_ISOLATED_TEST=1
export CONTEXTUAL_LOCAL_PREFIX=wasl-contextual-joud
export CONTEXTUAL_LOCAL_STATE=/workspace/wasl-contextual-joud-local
export CONTEXTUAL_LOCAL_GATEWAY_PORT=55631
export CONTEXTUAL_LOCAL_DATABASE_PORT=55632
export CONTEXTUAL_LOCAL_APP_PORT=3061
export VERIFY_BASE=http://127.0.0.1:3061
export WASL_TEST_SQL_CONTAINER=wasl-contextual-joud-db
export CONTEXTUAL_LOCAL_FONT_RESPONSES=/workspace/wasl-contextual-joud-local/fonts/mock-responses.cjs
```

في هذه البيئة توجد نسخة من هذه المتغيرات غير السرية مع إعدادات proxy والجلب العام في `/workspace/wasl-contextual-joud-local/runtime.sh`؛ يمكن استعمال `source` بدل تكرارها. الملف لا يحوي المفاتيح. Prefix والمنافذ تُتحقق داخل أدوات الاختبار، وحالة credentials مرتبطة بالـprefix والمنافذ؛ لا تُعد استخدام credentials من أساس سابق. Defaults القديمة `wasl-contextual` و`55621/55622/3060` محفوظة للتوافق، لذلك profile الجديد الصريح ضروري هنا.

## متطلبات التشغيل

- Node 24 وDocker وChromium وdependencies المشروع الحالية؛ لا يحتاج مفتاح Anthropic أو ElevenLabs.
- الصور: `postgres:17`، `supabase/gotrue:v2.197.0`، `postgrest/postgrest:v16.4`، `supabase/realtime:v2.140.3`، `kong:2.8.1`.
- حالتا اختبار منفصلتان: خدمة التطبيق الفعلية بلا استدعاءات مدفوعة؛ واستجابات HTTP مصطنعة اختيارية لحالات الواجهة. نجاح الثانية لا يثبت نجاح الأولى.
- مجلد الحالة الخاص لهذه النسخة `/workspace/wasl-contextual-joud-local`، بصلاحيات `0700`، والملفات الحساسة `0600`. لا تنسخه إلى Git أو إلى patch.

الصورة الأساسية `postgres:17` لا تضم `pg_cron` الذي يحتاجه migration `0008` ولا `wal2json` الذي يحتاجه Realtime. حزمة الاختبار تقبل النسختين الآتيتين فقط وتتحقق من SHA256؛ تم التحقق في هذه البيئة من فهرس Debian `trixie` عبر توقيعه بمفاتيح `/usr/share/keyrings/debian-archive-keyring.gpg`، ثم من hash الفهرس وحزمتيه. لا تُغيّر migrations المنتج لحذف هذه المتطلبات.

| الحزمة | النسخة | SHA256 |
|---|---|---|
| `postgresql-17-cron` | `1.6.5-1` | `e89f12020f9bd547120efb0a3bab333b117902449529205c0c69484bbd0bc9ff` |
| `postgresql-17-wal2json` | `2.6-2+b1` | `70371bb2072d904ad381d29df2c50f5f2fe8c12583bc0207336b2d5772a0ac36` |

توضع ملفات `.deb` في `<private-state>/packages/`، ويمكن تحديد مجلدها عبر `CONTEXTUAL_LOCAL_PACKAGES`. روابط التوزيعة الموثقة:

- `https://deb.debian.org/debian/pool/main/p/pg-cron/postgresql-17-cron_1.6.5-1_amd64.deb`
- `https://deb.debian.org/debian/pool/main/w/wal2json/postgresql-17-wal2json_2.6-2+b1_amd64.deb`

## الأوامر

تشغيل الحاويات الجديدة يرفض تضارب الأسماء أو إعادة توليد أسرار stack موجودة:

```sh
VERIFY_ISOLATED_TEST=1 node scripts/dev/contextual-local.mjs setup
VERIFY_ISOLATED_TEST=1 node scripts/dev/contextual-local.mjs migrate
```

تطبق الأداة كل migrations الحالية على قاعدة `wasl-contextual-joud-db` المملوكة فقط، وتسجل اسمها وhash. تغيير migration سبق تطبيقها يفشل ويستلزم قاعدة اختبار جديدة. لا تشغل `seed` أو `demo:reset` أو قاعدة خارجية.

```sh
VERIFY_ISOLATED_TEST=1 node scripts/dev/contextual-local.mjs start
```

للاختبار المستقر بالإصدار المبني بدل HMR، أوقف فقط عملية التطبيق التي بدأتَها، ثم:

```sh
VERIFY_ISOLATED_TEST=1 node scripts/dev/contextual-local.mjs build
VERIFY_ISOLATED_TEST=1 node scripts/dev/contextual-local.mjs start-production
```

التطبيق `http://127.0.0.1:3061`، والبوابة `http://127.0.0.1:55631`، ومنفذ القاعدة `127.0.0.1:55632`. Auth وREST وRealtime على شبكة `--internal`. DB وKong وحدهما ينضمان أيضًا لجسر وصول منفصل لأن Docker لا ينشر المنافذ على شبكة داخلية منفردة؛ كل المنافذ المنشورة مقيدة بـloopback. هذا لا يعادل تعطيل الشبكة لكل عمليات التطبيق: جلب المصادر العامة يجري من خدمة Next عند تفعيله صراحة.

الأسرار تنشأ داخل أداة الاختبار ولا تُطبع. أداة `start` تفرض غياب مفاتيح المزودين و`WASL_RECOMMENDATIONS_PAID_APPROVED=false` وميزانية اختبارات مدفوعة `0`، مهما كانت إعدادات shell. عند استخدام proxy عام مصرح في البيئة يمكن إضافة `NODE_USE_ENV_PROXY=1` إلى عملية Next. يمكن تفعيل الجلب المجاني المباشر فقط عبر `WASL_RECOMMENDATIONS_FREE_FETCH=true`؛ ليس بحث Claude، وليس جلبًا شاملًا للمواقع.

إذا حجبت البيئة Google Fonts، يتيح `CONTEXTUAL_LOCAL_FONT_RESPONSES=<private-response-file>` استجابات font محلية للاختبار بـwebpack. شواهد هذه البيئة استخدمت Fontsource cached لاستجابات IBM Plex Sans Arabic وInter، بلا تعديل `layout.tsx` أو TLS؛ ليست اختبار build بشبكة Google Fonts متاحة.

في هذه البيئة أُعد الملف `/workspace/wasl-contextual-joud-local/fonts/mock-responses.cjs` مع أصول الخطوط العامة من `@fontsource/ibm-plex-sans-arabic@5.3.0` و`@fontsource-variable/inter@5.3.0`. نُسخت الخطوط العامة من cache سابق بالقراءة فقط إلى حالة الاختبار الجديدة؛ لم تُنسخ بيانات التطبيق أو مفاتيح ذلك التشغيل. عند إعادة إنشاء البيئة يلزم تنزيل هاتين الحزمتين إلى مجلد خاص خارج المستودع، وإعداد خريطة CSS لهذين العنوانين، أو استخدام وصول Google Fonts الطبيعي مع حذف متغير الاختبار:

- `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap`
- `https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap`

التشغيل المستقر للشواهد النهائية:

```sh
VERIFY_ISOLATED_TEST=1 NODE_USE_ENV_PROXY=1 WASL_RECOMMENDATIONS_TRUST_PROXY_DNS=true WASL_RECOMMENDATIONS_FREE_FETCH=true CONTEXTUAL_LOCAL_FONT_RESPONSES=/workspace/wasl-contextual-joud-local/fonts/mock-responses.cjs node scripts/dev/contextual-local.mjs build
VERIFY_ISOLATED_TEST=1 NODE_USE_ENV_PROXY=1 WASL_RECOMMENDATIONS_TRUST_PROXY_DNS=true WASL_RECOMMENDATIONS_FREE_FETCH=true node scripts/dev/contextual-local.mjs start-production
```

`WASL_RECOMMENDATIONS_TRUST_PROXY_DNS` خاص بالـproxy العام المصرح في هذه البيئة، ويتطلب تفعيل proxy في عملية Node ووجود إعداده؛ لا يجيز جلب نطاقات خارج السجل أو روابط داخلية. لا تستخدمه في بيئة بلا proxy موثوق. لا يتضمن أي من الأوامر قيمة مفتاح أو عنوان قاعدة خارجية.

في terminal آخر:

```sh
VERIFY_ISOLATED_TEST=1 node tests/recommendations/browser-local.mjs
VERIFY_ISOLATED_TEST=1 node tests/recommendations/browser-local.mjs --mock-states
VERIFY_ISOLATED_TEST=1 node tests/recommendations/browser-local.mjs --require-source-proof
docker exec -i "$WASL_TEST_SQL_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < tests/recommendations/ledger.sql
docker exec -i "$WASL_TEST_SQL_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < tests/recommendations/budget-ledger.sql
docker exec -i "$WASL_TEST_SQL_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < tests/recommendations/receipts.sql
docker exec -i "$WASL_TEST_SQL_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 < tests/recommendations/assignment-clock.sql
```

الاختبار ينشئ ثم يحذف هوياته والمؤسسة الخاصة به بالـIDs المحددة، ويفرض loopback ووسم ملكية حاوية الاختبار. سجلات ledger تعمل داخل transaction تنتهي بـ`ROLLBACK`. النتائج ولقطات الواجهتين تحت `docs/recommendations/evidence/local-<run>/`، مع فصل `mock-ui-*` عن الصور الفعلية. الاستخدام المسجل أرقام وأسباب تشغيلية فقط، دون مضمون المستخدمين.

دخول السائل والدعاة وإرسال الرسائل والتوصيات يستخدم الواجهات وخدمات التطبيق الحقيقية. تعيين المحادثة للداعية في هذا الاختبار fixture محلي مباشر عبر service role معزول؛ لا يمثل اختبارًا لخوارزمية التوجيه أو للتحويل الكامل. حالات صلاحيات وحدود التحويل تُفحص منفصلة في اختبارات الخادم وSQL.

## ما تقيسه هذه الفحوص

- دخول السائل والداعية من الواجهتين الفعليتين، وإرسال سؤال محفوظ وإصدار سياق جديد.
- عدم طلب توصية أثناء الكتابة أو للشكر أو تكرار السؤال، والتعامل مع تصحيح المقصد بعد cooldown.
- نقل سؤال جديد بواسطة Realtime، وإيقاف مسار السائل عند الحوار البشري.
- إغلاق لوحة الداعية، ورفض غير المعين والمشرف، وتعطيل AI على الواجهة والخادم.
- العربية وRTL والجوال والحاسب، ومشاهدة المصدر النصي عندما يكون متاحًا؛ لا تُحسب عناوين المصادر على أنها مقاطع مكتسبة.
- مع الخيار `--mock-states` فقط: الانتظار والنجاح والجزئية والاستيضاح والإحالة والفشل وإعادة المحاولة. هذه ليست مواد علمية أو استدعاءات نماذج حية.

حالات التصحيح أثناء طلب جارٍ وحدود الإنفاق والأدوات تختبر أيضًا في unit/ledger؛ يلزم النظر إلى نتائجها منفصلة عن المتصفح. الجودة الدينية وصحة صلة المقطع تحتاج مختصًا. أُجيز للاختبارات سقف إجمالي 5 دولارات، و0.15 للطلب السريع و0.35 للتوسع؛ يلزم مفتاح اختبار وتسعير متحقق وإعدادات التشغيل، ولا يجيز المفتاح رفع هذه الحدود. حجز الكلفة المحافظ لأدوات Claude الأصلية يتجاوز حدود التوكنز الحالية، لذلك يبقى ذلك المسار ممنوعًا قبل الإرسال؛ انظر `HANDOFF.ar.md`.

## شواهد التشغيل على e169

أُنشئ stack جديد بأسرار اصطناعية جديدة، وطُبقت migrations `0001`–`0016` كاملة، بما فيها `0011_master_card` و`0012_master_card_visibility` من أساس جود، دون تعديل stack أو بيانات الاختبارات السابقة.

| الفحص | النتيجة الفعلية | السجل |
|---|---|---|
| `contextual-local.mjs build` | exit 0؛ Next `16.3.8` webpack، compilation `18.8s`، TypeScript `7.1s`، `98` صفحة static | [ملخص build](evidence/local-build-summary.json)؛ ملخص مشاهد وليس stdout كاملًا |
| `browser-local.mjs` | `27 PASS / 0 FAIL`، `7` طلبات API محلية، دون mocks أو طلبات مدفوعة | [نتائج فعلية](evidence/local-muvs2xgs/results.json)، [usage](evidence/local-muvs2xgs/usage.json) |
| `browser-local.mjs --mock-states` | `39 PASS / 0 FAIL` = `27` فعلية + `12` حالات عرض مصطنعة؛ `5` طلبات محلية و`14` استجابة HTTP mock | [النتائج المفصولة](evidence/local-muvs5flg/results.json) |
| `ledger.sql` و`budget-ledger.sql` و`receipts.sql` و`assignment-clock.sql` | أربعة exit 0 و`PASS`، وكل script انتهى بـ`ROLLBACK` على `wasl-contextual-joud-db` | [SQL log](evidence/local-sql-checks.log) |

من خدمة التطبيق الفعلية وصل طلب `d7c6a0f3-fc13-496f-bef9-209453101e3e` إلى مادة تعريف الإيمان في `https://islamic-content.com/dictionary/word/1952`، section «من موسوعة المصطلحات الإسلامية»: `1874` حرفًا، `fetches=1`، `elapsedMs=1987`، وجميع model/search/token/voice calls والتكلفة `0`. عُرض النص في لوحة الداعية مع المرجع و«يحتاج تقييمك»، وتحقق الاختبار أن hash النص المعروض يطابق النسخة الأصلية المكتسبة مستقلًا: `6684aea866f0083ebe9bdbb91a260460ea50f89d9e6ed66cbf342491e5a15a08`. [دليل الاكتساب](evidence/first-source-acquisition/acquisition.json) و[لقطة النص على الحاسب](evidence/first-source-acquisition/daee-desktop-first-actual-acquisition.png). هذا جلب عام مباشر بلا Claude، وليس اعتمادًا علميًا.

في التشغيل الثاني أُعيد استخدام المقطع المصدرّي العام الحقيقي من cache: `fetches=0` و`elapsedMs=1`. ليس ذلك قياس سرعة جلب جديد أو متوسط أداء، ولا cache لجواب شخصي. السائل حصل على [مرجع محدد بعد تصحيح المقصد](evidence/local-muvs2xgs/asker-corrected-faith-specific-source.png)؛ النص الجديد غير المعتمد لم يُكشف له. بقي عرض النصوص الجديدة للسائل محكومًا بسياسة اعتماد أ/ب البشرية.

شواهد الجوال وRTL منفصلة عن إثبات النص الأصلي: [نتيجة الداعية على الجوال](evidence/local-muvs2xgs/daee-ar-mobile-actual-result.png) تعرض المرجع الحالي للحديث دون مقتطف، و[انتظار التحديث](evidence/local-muvs2xgs/daee-ar-mobile-actual-queued.png) و[AI off](evidence/local-muvs2xgs/daee-ar-mobile-ai-off.png) و[السائل على الجوال](evidence/local-muvs2xgs/asker-ar-mobile-actual-empty-corpus.png). لقطات `mock-ui-*` في التشغيل الثاني تختبر العرض والانتظار والخطأ وإعادة المحاولة فقط، ومادتها اصطناعية غير دينية.

تحقق الاختبار أيضًا من عدم إنشاء رسالة باسم الداعية قبل رده البشري، ورفض المشرف وغير المعيّن بـ`403`، ومنع الطلبات بعد إغلاق اللوحة أو تعطيل AI. لا توجد browser errors في التشغيلين. حُذفت هويات ومؤسسات fixture الخاصة بهما؛ تحقق العد النهائي على قاعدة الاختبار من `0` مؤسسات و`0` مستخدمين. لم تُختبر جودة نموذج حي أو حكم علمي أو الموقع المنشور، ولم يُعتبر تعيين fixture دليلًا على رحلة التوجيه والتحويل الكاملة.
