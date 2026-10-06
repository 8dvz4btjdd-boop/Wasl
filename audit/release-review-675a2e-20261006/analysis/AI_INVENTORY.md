# جرد استدعاءات الذكاء والصوت وقياس استهلاكها — نسخة 675a2e

هذا جرد قراءة للكود للمستودع `/workspace/Wasl-audit-current-20261006` عند commit `675a2e0089ee1e4324a7b438c17d570989793bc1` في `detached HEAD`. أكد وكيل المراجعة الرئيسي أن `main` لدى أحمد وجود يتطابقان مع هذا SHA. قرأت `AGENTS.md` و`CLAUDE.md` و`README.md` أولًا. في مرحلة الجرد لم أشغّل طلب نموذج أو صوت أو script يكتب إلى قاعدة خارجية. بعده ورد إذن صريح بسقف1USD، وأجريت محاولة القياس المعزولة الموضحة أدناه. حالة Git بعد checkout، وبعد الفحص، نظيفة. ملفات الجرد وأدوات القياس ومخرجاته كلها تحت `/workspace/wasl-release-audit-20261006` خارج المستودع.

**النتيجة:** توجد سبع مهام نصية حقيقية، ومسار بحث Messages API مباشر، وجلب صفحات من خادم التطبيق، وElevenLabs، وWeb Speech API. لكن `ai_runs` لا يصلح حاليًا لقياس عدد الاستدعاءات أو فاتورتها: يصف نهاية مهمة منطقية، ويهمل محاولاتها وusage وأدواتها. لا يوجد في هذه النسخة سقف مالي مشترك، ولا ضبط الأدوات عبر الاستكمالات. لا يجوز تفسير غياب usage بوصفه صفرًا، أو اسم النموذج المسجل بوصفه النموذج الذي أثبته رد المزود.

## 1. سلسلة التشغيل الفعلية

| الميزة | الحدث والخطوات | العدد البنيوي قبل قياس التشغيل |
|---|---|---|
| مرشد الدخول | إرسال السؤال، ثم كل جواب استيضاح → `guideStep` → `intake`؛ عند الملخص → `classify` | حتى 3 أسئلة استيضاح، أي حتى 4 مهام intake ومهمة classify في الرحلة العادية. كل مهمة تسمح بمحاولتين عند خطأ schema. هناك أيضًا ping جانبي أول مرة لكل نموذج/process. |
| دخول مباشر | `startConversation` دون تصنيف سابق من المرشد → `classify`؛ المطابقة نفسها RPC بقواعد | مهمة واحدة، حتى محاولتين. الحوار المفتوح الموجود يمنع إعادة إنشاء الرحلة مبكرًا. |
| بطاقة الجلسة | الانتقال من خطوة الاختيار إلى الحقول عندما AI مفعّل → `/api/ai/card` → `card` | مهمة واحدة، حتى محاولتين؛ لا cache. «الكتابة من الصفر» تهمل النتيجة المرئية ولا تلغي الخادم. |
| بطاقة master | فتح الصفحة عندما AI مفعّل → `/api/ai/master` → `merge_master` | تبدأ تلقائيًا على mount؛ refresh/remount يمكن أن يبدأ مهمة جديدة. لا cache. |
| قراءات السؤال الأول | mount لـ`Readings` → `/api/ai/sources` → cache للمادة، وإلا `plan_queries` ثم `find_sources` ثم تمديد الاقتباسات | على cache miss: حتى محاولتين للـplan، ثم حتى 3 طلبات Messages API، ثم حتى 3 عمليات جلب أصلية متوازية من التطبيق. |
| مساعد الداعية | sparkle لرسالة، أو اختيار رسائل ثم بحث، أو submit لاستعلام مكتوب → `assistSearch` → المسار نفسه | البحث يدوي في هذه النسخة. الكتابة وحدها لا تستدعي النموذج. زر tone مستقل ويستدعي `assist_tone`. |
| صوت المرشد | سؤال جديد بعد gesture يتيح الصوت → `/api/tts` → ElevenLabs؛ عند الفشل صوت المتصفح | حتى محاولتين للمزود عند 402 لصوت مخصص؛ مهلة 15 ثانية لكل محاولة. STT عبر المتصفح ثم تأكيد/إرسال النص. |

الأدلة: `lib/guide/actions.ts:53,66`، `lib/ai/tasks/intake.ts:6`، `app/[locale]/(asker)/wait/actions.ts:43,55,60,156`، `app/[locale]/(asker)/card/[id]/card-builder.tsx:110`، `app/[locale]/(asker)/card/master/master-builder.tsx:58`، `lib/sources/readings.ts:76`، `components/inbox/conversation-pane.tsx:213`، `components/inbox/assistant.tsx:47,73,85`، `app/api/tts/route.ts:43`.

**حد الوظيفة السياقية:** `chooseNeed` موجود في `lib/ai/sources/needs.ts:35` لكنه لا يُستعمل في أي مسار منتج؛ المراجع الوحيدة الأخرى في `evals/assist-rules.ts`. `Readings` يطلب مرة عند mount (`components/ai/readings.tsx:34`) ويأخذ `guide_summary` أو سؤال الاستقبال الأول، مع `recent: []` (`app/api/ai/sources/route.ts:33,45`). لذلك لا يعني وجود اختبار اختيار آخر حاجة أن توصيات الداعية تتحدث تلقائيًا مع تغير مقصد الحوار. تبديل لوحات السياق قد يعيد mount/البحث عند cache miss.

## 2. حدود كل مهمة وما يصل إلى المزود

كل مهام fast تطلب النموذج من `ANTHROPIC_MODEL_FAST`، وcard/master من `ANTHROPIC_MODEL_CARD` (`lib/ai/runAI.ts:19,80`). النتيجة الفعلية للمزود لا تُسجل. نموذج المثال في `.env.example:8` هو `claude-haiku-4-5-20251001`، وفي `:9` هو `claude-sonnet-5-5`؛ هذه أمثلة إعداد وليست إثبات توافر أو استعمال حي.

| task | حد task/actor في الساعة | المدخل ونموه | قيد المخرج قبل الاستدعاء |
|---|---:|---|---|
| `intake` | 40 | أول سؤال ≤2,000 حرف، وكل turn ≤2,000، حتى 10 turns: حد payload المستخدم 22,000 حرف قبل envelope. كل خطوة تعيد أول سؤال والتاريخ السابق. | schema؛ لا `maxOutputTokens`. سؤال المرشد يُرفض إن بلغ 20 كلمة. `summary.question` بلا maxLength. |
| `classify` | 30 | سؤال أولي ≤2,000 في الدخول المباشر؛ لا حد في task نفسها، وملخص المرشد الذي يصل إليها غير محدد الطول بالـschema. لا ترسل background. | enum/confidence؛ لا `maxOutputTokens`. |
| `card` | 5 | API يقبل حتى 500 ID ويبعث آخر 60 مقطعًا مختارًا فقط. حد رسالة التطبيق 4,000 حرف: قد يبلغ مجموع bodies 240,000 حرف قبل الأسماء/IDs/envelope. | schema يترك text بلا maxLength؛ 300 حرف تطبق بعد التوليد، وليست حدًا للتكلفة. |
| `merge_master` | 5 | آخر 20 بطاقة جلسة معتمدة؛ 4 حقول ×300 حرف في مدخلات التطبيق الصحيحة، أي 24,000 حرف للحقول قبل IDs والتواريخ. | نفس schema البطاقة والتحقق اللاحق؛ لا `maxOutputTokens`. |
| `assist_tone` | 60 | آخر 6 رسائل سائل؛ يمكن أن تبلغ 24,000 حرف من رسائل التطبيق. تحميل transcript كامل من DB يسبق أخذ الستة. | enum؛ النص القصير جدًا يُحوّل إلى undefined بعد الاتصال، لا قبله. `persistOutput=false`. |
| `plan_queries` | 60 | الحاجة المختارة أو query≤500 حرف، مع آخر 6 رسائل للسياق. بوابة الحاجة تسمح حتى 8,000 حرف normalized. | schema يسمح 1–4 queries، ثم dedup/≤8 كلمات/حتى3؛ لا حد توكنز. |
| `find_sources` | 20 | السؤال الخام وsearch_plan يصلان إلى المزود معًا. كل pause يضيف كامل content السابق إلى history. | `max_tokens=1024` لكل Messages request؛ حتى3 اقتباسات≤600 حرف بعد الفلترة. |

الأدلة: `lib/guide/actions.ts:13`، `lib/ai/tasks/intake.ts:9,46,68`، `lib/ai/tasks/classify.ts:17,27`، `app/api/ai/card/route.ts:11,47`، `lib/chat/types.ts:44`، `lib/ai/tasks/card.ts:7,35,71`، `app/api/ai/master/route.ts:30`، `lib/cards/types.ts:16,19`، `lib/cards/actions.ts:12`، `lib/ai/tasks/assist.ts:23,27,34`، `lib/ai/tasks/plan-queries.ts:29,36,43`، `lib/ai/tasks/find-sources.ts:48,75,81`.

حدود 240,000/24,000 أعلاه حسابات محتملة من حدود التطبيق، لا قياسات طلبات فعلية ولا توكنز؛ لم أتحقق من طول بيانات DB القديمة أو المباشرة. `runAI` لا يفرض سقف input tokens، ولا سقف output tokens للمهام SDK العادية (`runAI.ts:141,150,154`). طول الملخص الذي ينتجه intake قد يوسّع طلب classify التالي.

قياس قراءة حرفي لنصوص system الثابتة: assist=714، card=2161، classify=1053، intake=1817، master=1685، plan_queries=1046، sources=969 حرفًا قبل استبدال locale. التفاصيل وUTF-8 bytes في JSON. هذه لا تشمل DATA_RULE، instruction، tags، schema/tools التي يضيفها المزود، ولا تقيس التوكنز. SDK المثبت `ai7.0.127/@ai-sdk/anthropic4.0.71` يختار افتراضيًا64K output tokens لـHaiku عند غياب حد صريح (`node_modules/@ai-sdk/anthropic/dist/index.js:5230,3701`)؛ schema الصغيرة لا تضمن حدًا محاسبيًا صغيرًا. SDK structured output يضيف schema؛ حجمه وتوكنزه الفعليان غير متحققين هنا.

## 3. محاولات API والأدوات ليست عدد `ai_runs`

`runAI.ts:145` يسمح بمحاولتين عند أسماء أخطاء schema محددة، مع `maxRetries:0` وإشارة timeout مشتركة للمحاولتين (`:140–141,159`). فشل post-validation أو safeParse اللاحق لا يُعاد (`:165–175`). المهلة الافتراضية12 ثانية، ومهمة find_sources30 ثانية، مع override من `AI_TEST_TIMEOUT_MS` (`:15–17`، `find-sources.ts:76`).

`verifyModel` ينفذ `generateText("ping")` جانبيًا قبل المهمة (`runAI.ts:24–31,136`)، مرة لكل اسم نموذج/process. له output≤1 وSDKretry=0، ولكنه بلا deadline أو سجل usage/ai_runs. علامة verified تثبت قبل نجاحه. لا يدخل هذا الطلب في عدد المهام أو rate limit؛ cold starts تعيده. وجوده ليس اختبار جودة للنموذج.

البحث الحالي يستخدم `web_search_20250305` فقط، لا native `web_fetch`. `MAX_CONTINUATIONS=2` يسمح حتى3 طلبات Messages API (`find-sources.ts:9,37`). كل جسم طلب يعيد `max_uses:3` (`:51`)، ولا يوجد عداد بحث مشترك. إذا كان الحد scoped لكل HTTP request، فالتركيب يسمح حتى9 عمليات بحث؛ هذا حد محافظ مشروط، وليس usage مقاسًا ولا تأكيدًا لسلوك المزود عبر pause. مجرد وصف المسار بأنه «طلب المستخدم» لا يحوله إلى استدعاء نموذج واحد. لا يحدث إنهاء مبكر لمجرد جمع مادة كافية: الحلقة تنتهي فقط عند stop_reason مختلف عن pause أو نفاد عدد الاستكمالات (`:61–62`). الخطأ HTTP العادي لا يطابق schema retry، بينما إعادة custom execute عند خطأ مطابق نظريًا قد تضيف استدعاءات أخرى؛ لم تختبر حيًا.

بعد البحث، `extendCitation` يجلب حتى3 صفحات بنفسه؛ كل صفحة ≤800,000 byte، حتى3 تحويلات/4 HTTP hops، ومهلة10 ثوانٍ، ونص parsed≤300,000 حرف ومقطع عرض≤1500 (`lib/ai/sources/fetch.ts:12–15,223–277,312`). هذا جلب خادم التطبيق، فلا يسمى استخدام أداة Claude web_fetch. لا تُعاد الصفحة الكاملة للنموذج في هذا المسار. الزمن الكلي ليس30 ثانية: plan ثم search ثم source-fetch ثم التخزين/logging، ومهلاتهم غير مشتركة (`readings.ts:76–110`). حد route البالغ60 ثانية ليس ميزانية أدوات أو فاتورة (`app/api/ai/sources/route.ts:7`).

## 4. القياس الحالي والفجوات

`ai_runs` يملك task/model/input_hash/output/latency/fallback/reason، ثم أضيف actor_id؛ لا tokens أو cache أو tool usage أو attempt/request IDs أو cost (`0001_init.sql:171`، `0009_card_hardening_ai.sql:11`). `finish` يكتب صفًا واحدًا لكل نهاية مهمة، حتى fallback disabled/not_configured، ويُهمل cache hits وping (`runAI.ts:82–118`). اسم model هو قيمة env المطلوبة، وليس model من response. latency يشمل DB/التحقق قبل provider والتسجيل غير متساوٍ بين الرد والصف؛ ليس provider latency أو زمن الوصول لمادة نافعة (`:78,83,106`).

ردود `generateText/streamText` لا تقرأ usage، ورد Messages API يُحوّل فقط إلى content/stop_reason (`runAI.ts:150–155`، `find-sources.ts:55`). لا يمكن استرداد actual usage من input_hash أو النص المختصر لاحقًا. `sources_found` يسجل count/live/tier فقط (`readings.ts:142`). قيمة `live:true` قد تنتج حتى عند fallback `not_configured`/rate limit، لأن شرطها `plan.ok || plan.reason !== "disabled"` (`:128`). هي علامة لمسار محاولة، وليست إثبات إجراء بحث ناجح أو دفع رسوم.

لوحة المدير تعرض task/model/latency/fallback/reason فقط (`lib/admin/queries.ts:80`)، و`admin_ai_health` يحسب كل صفوف ai_runs (`0004_admin.sql:258`). `scripts/dev/admin-synthetic.mjs:51–62` يدرج12 صفًا اصطناعيًا، منها task `rank_library` غير موجود بين المهام الفعلية؛ marker فقط input_hash='synthetic'. لا فلتر له في المؤشر. عينة `evals/samples/ai-run.json:35` تاريخية بتاريخ2026-10-05 وزمن5095ms، وليست تشغيلًا جديدًا أو usage في هذا التدقيق.

الحفاظ المطلوب: لا مخزون نص tone، ونص البطاقة يُحجب في ai_runs، وcolumns للمشرف صريحة بلا output (`assist.ts:22`، `card.ts:34`، `0004_admin.sql:13–14`). لا داعي لتسجيل مضمون خاص كي نقيس الكلفة.

## 5. cache وinflight وحدود التنفيذ

- cache `runAI` في الذاكرة لـclassify/plan فقط، لمدة60 دقيقة؛ task+input_hash دون org/actor/model/prompt version. hit بعد قراءة AI switch وقبل rate limit، بلا صف أو hit metric (`runAI.ts:114–131`). ليست provider prompt caching؛ لا `cache_control` معلن في الطلبات. لا يمكن افتراض cache tokens صفرًا أو خصم مالي.
- cache library بحسب org+need_hash+language، مع audience filters؛ لا recent context ولا معنى المقصد/نسخة مصدر/expiry في المفتاح (`readings.ts:58–71`). نفس «وماذا عن هذا؟» في سياق مختلف قد يعيد مادة قديمة قبل plan. توفير الطلب هنا ليس برهان جودة التوصية.
- لا atomic reservation أو in-flight dedup؛ طلبان متزامنان على cache miss يمكن أن يرسلا كليهما ويعبرا count-before-insert. rate limit يقيس نهايات مهام، لا attempts/tools/voice، ولا يمنع إجمالي إنفاق المنظمات/هويات مجهولة جديدة.
- مهلة العميل10 ثوانٍ وتخطي المرشد لا يلغيان server action؛ Promise.race يهمل الانتظار فقط (`use-guide.ts:13–20,89`). وقد يكمل intake ثم classify بعد fallback المرئي. retry exception مرة بلا idempotency (`:46`). `Readings` يغير alive فقط عند unmount (`readings.tsx:44`). AbortController في useAITask لا يُمرر request.signal إلى runAI بالroutes (`useAITask.ts:22–39`، `card/route.ts:54–59`، `master/route.ts:40–45`).

## 6. الصوت خارج عداد النص

المفاتيح الصوتية خادمية، التفريغ قابل للتحرير، gesture لازم للصوت، والكتابة وspeechSynthesis بديلان. STT في `voice.ts:30–91` هو Web Speech API؛ الكود لا يثبت مكان معالجة المتصفح ولا رسوم خدمته. لا طلب Anthropic/ElevenLabs للتفريغ من التطبيق.

`/api/tts` يتحقق من هوية السائل وtext≤400 فقط، ولا يقرأ org.ai_enabled أو يفرض budget/rate/cache/dedup (`route.ts:24–39`). لذلك AI off في الواجهة لا يكفي لوقف TTS خادميًا. لا usage characters/audio duration أو فاتورة persisted؛ console الزمن عند استلام response لا عند اكتمال الصوت (`:55`). متغير ElevenLabs النموذج أو الافتراضي `eleven_multilingual_v2` يختار model؛ الرد الفعلي للمزود غير محفوظ.

mute/stop/unmount توقف الصوت الموجود؛ لا تلغي fetch. `speak` يفحص flags قبل await فقط ثم يشغل audio بلا مراجعة version/mute (`voice.ts:109–131,150`). النتيجة القديمة قد تصل وتعمل بعد mute/طلب جديد. الإلغاء المستقبلي لا يمحو رسوم ما نُفذ.

## 7. scripts/evals وحدود الدليل

`npm run evals` يستخدم --no-cache لثلاث suites ثم assist (`package.json:15–20`). تمريرة الحزمة الكاملة تحتوي33 task execution مؤهلة nominal:3card +23classify +3sources، مع case sources رابع يُرفض قبل API، +4plan. هذا ليس33 API call مضمونًا؛ SDK retries الافتراضية غير مقيدة صراحة في المباشرة، وsources له continuations. لا ledger مالي مشترك.

`evals/run-card.ts:13` و`run-classify.ts:14` و`assist-rules.ts:66` تستدعي SDK مباشرة، و`run-sources.ts:15` يستدعي task.execute مباشرة؛ لا org switch/rate/runAI logging، ولا usage في provider output. اختبارات assist تتحول إلى skip يُطبع PASS عند غياب المفتاح (`:79–80`)؛ لا يعني جودة model ناجحة.

**وجود الإعداد لا يعني إذن تشغيل:** فحصت names/presence فقط: ANTHROPIC_API_KEY وANTHROPIC_MODEL_FAST موجودان في process؛ ANTHROPIC_MODEL_CARD وELEVENLABS_API_KEY غائبان؛ `.env.local` غير موجودة في هذه النسخة. WASL_AI_TEST_SCOPE موجود لكنه لا يُقرأ في الكود الحالي، وكذلك لا توجد budget/provider/private-intent المدمجة من فرع التوصيات السابق. لا تشغّل evals:assist باعتباره offline ما دام المفتاح موجودًا؛ اشطب/أفرغ مفاتيح المزود صراحة في process أمر offline دون طباعتها.

لم أشغّل scripts المتصلة: ai-live افتراضيه الموقع الحي ويكتب/يحذف DB (`scripts/dev/ai-live.mjs:8,17–33,57–60`)، ai-card يفعّلAI لكل المنظمات غيرUUIDالصفري ولا يعيد الحالة الأصلية (`:91,246`)، sources يغير التوفر ويحذف cache (`sources.mjs:51–55`). التطبيق المحلي لا يثبت DB محلية. قبول204 في test الصوت يثبت fallback فقط (`guide.mjs:139–142`)، وقبول صفر مواد في assist لا يثبت نفع مادة (`assist.mjs:83,100,106`).

## 8. أقل قياس صحيح مقترح — لم ينفذ

أضف سلسلة IDs: feature_run → logical_step → physical_attempt، مع context_version وdataset_version وsynthetic marker. لكل استدعاء فعلي تحفظ requested/returned model، usage_known، input/output/cache tokens، counts للأدوات المبلغ عنها، مدة، status، price_version وتكلفة تقديرية nullable. voice منفصل بحروفه ومدته وتقارير المزود. لا prompts/نصوص/أجوبة خاصة في telemetry.

اجمع كل retry وpause وping إن بقي مرة واحدة، dedup بـprovider request ID أو attempt ID؛ cache hit صفر **استدعاءات جديدة** ولا يعيد إضافة usage القديمة. timeout/cancel الذي لا يعيد usage يظل unknown، لا zero. فصل own-server HTTP fetch عن أدوات المزود، والاستدعاء المخطط عن المنفذ، و«cache مادة» عن «provider token cache». تعرض تغطية usage والتقييم، وتظل الفشل/الرفض/النقص ضمن المقام. حد مالي atomic قبل API يشمل feature كاملًا، واختبار concurrent+retry يثبت عدم تجاوزه؛ لا ترفع سقفًا معتمدًا بصمت.

الأولويات: (1) تصريح/حجز مالي وقياس كل attempt قبل أي اختبار مدفوع؛ (2) إلغاء/نسخ السياق وعدم التكرار والمهلات المشتركة؛ (3) cache يتبع المقصد وإصدار المادة؛ (4) ربط trigger الحاجة الجديدة فعلًا ثم مقارنة الوقت للنص النافع وجودة الصلة والمصدر مع baseline بنفس المواد والوصول. الحكم العلمي يحتاج مختصًا؛ هذا جرد كود لا تحقق علمي أو فاتورة أو نجاح حي.

## 9. سجل الفحص

شغّلت فقط `git show HEAD:AGENTS.md/CLAUDE.md/README.md`، `git rev-parse HEAD`، `git branch --show-current`، `git status --porcelain`، `rg` لجرد callers/usage/cache، و`nl -ba` لقراءة الأدلة. Python قرأ presence للأسماء المحددة وحساب أحرف/UTF-8 لنصوص system الثابتة دون importing product/provider. في مرحلة الجرد وحدها لم أستعمل API/DB. بعد الإذن حاول collector طلبي provider (ping)، الأول دونHTTP response، والبديلالمصرحرد401؛ usage والكلفة الفعلية **null/غير متحققين**. أنشأ القياس وحذف منظمتَه الاصطناعية في DB محلية55641 فقط. لم أستعمل ElevenLabs أو قاعدة خارجية. لم أشغّل الاختبارات التي قد تدفع رسومًا أو تكتب DB، ولا أدّعي نجاحها أو فشلها. لم أجرِ دراسة أسعار سوقية في هذا المسار.

الأدلة JSON تصنف الملاحظات proved_by_code أو code_inference، وتحتفظ بالحدود المحتملة منفصلة عن القيم المرصودة. السكربتات القديمة والشواهد التاريخية لا تستبدل إعادة القياس على هذه النسخة. لا تغييرات منتج/commit/push من هذا الجرد.

## 10. قياس مصرح به لاحقًا — توقف قبل استدعاء المهام العادية

اعتمد المستخدم حتى1USD من الميزانية السابقة للقياس الاصطناعي. أدواته في `tools/usage-guard.mjs` و`tools/usage-measurement.mts` خارج المنتج. الحارس يصف الطلبات على خط واحد، يحتسب ping والمحاولات، يمنع models أخرى وأدوات native الغامضة، ويحجز أسوأ سعر قبل fetch. لا يحرر الحجز إلا عند رد كامل وusage معروفة. حدود مشتركة بين الجلستين:6 مهام منطقية/10 HTTP و1USD. service_tier=standard كتعديل transport صريح للقياس فقط، لا إعداد إنتاج. اختبارات الحارس المستقلة نجحت (`node tools/usage-guard.test.mjs`): التسلسل، shared reservation، null، منع native/نموذج غير معتمد، وحد1USD، وvariant1024.

GET رسمي للأسعار بتاريخ2026-10-06 رد200؛ جدول Haiku يؤكد1$/MTok input،5$/MTok output،1.25/2$ cache-write،0.1$ cache-read. المصدر/hash/date في `analysis/usage-pricing-verified.json`. حجز regular request المحافظ=.72USD (200K input بأعلىcache-write +64Koutput)، وping=.400005USD. هذه حجوزات محافظة وأسعار لتقدير الكلفة، وليست فاتورة أو توكنز مستهلكة.

الجلسة الأولى: `verifyModel` الجانبي قبل classify فشل Nodefetch بـTypeError قبل HTTP response. الحارس احتفظ.400005 وأوقف classify قبل الشبكة. التشخيص بGET عام غير مدفوع: Node24fetch الافتراضي أعاد EAI_AGAIN، ونفس GET مع `NODE_USE_ENV_PROXY=1` رد200. curl يعمل عبرproxy أيضًا. cause code لمحاولة ping الأصلية لم يُحفظ، لذلك لا نحول كلفتها إلى صفر بالاستنتاج.

بعد اعتماد البديل الواحد المحدد، جُرب proxy-aware Node مع حجز الجلسة القديمة محفوظًا. ولإمكان القياس ضمن1USD اعتمد cap1024 داخل collector فقط للمهام العادية، مع حفظ original_requested_max_tokens64000/effective1024/stop_reason لو وصلت. هذا bounded probe يختلف عن حد إخراج الإنتاج، ولا يصلح ادعاء أداء إنتاج unchanged. المنتج لم يُعدّل، والمدخل/schema/pipeline لم تتغير. الحجز الجديد للمهام العادية=.40512USD.

**النتيجة النهائية:** أول طلب في البديل كان ping أيضًا، ووصل المزود وردHTTP401 `authentication_error`. توقف الحارس، ولم يرسل classify ولا بقية الحالات ولا native search. الجلستان معًا:2 verification attempts،0 ordinary task API calls،0 successful provider responses، و2 blocked classify requests. actual model/tokens/الفاتورة=null؛ المبلغ المحافظ الذي بقي محجوزًا=.80001USD، والمتبقي للحجز=.19999USD. لا retry للـ401 أو reset للميزانية. لا نعرف من هذا الرد أن أي توكنز دُفعت. تنظيف المنظمة والصفوف الاصطناعية المحلية الخاصة بكل جلسة نجح، وGit نظيف.

الشواهد في `AI_USAGE_MEASURED.json`؛ لا مضمون أو prompt أو قيمة مفتاح في artifact. ميزنا فشل Node proxy الأول عن فشل authentication التالي. endpoint قابل للوصول عبرproxy، لكن الـbinding الفعّال لم يصادق هذا الطلب. لا يمكن تقديم اختبارات الجودة/الصلة/الكلفة الفعلية بوصفها منفذة. أدنى متطلب لاستكمالها: تصحيح الـsecret binding أو إعداد authentication في البيئة الآمنة ثم اعتماد استئناف ledger الحالي دون إسقاطunknown الحجوزات، وإعادة الحالات. scripts ترفض overwrite/retry تلقائيًا بعد البديل المصروف. لا تعديل لقاعدة خارجية أو main أو push أو commit.

القياس المنعزل يستدعي `runAI`/task مباشرة مع actorId=null وفق fixture محلي؛ لا يختبر HTTP route authentication أو حد actor أو رحلة واجهة كاملة. لم يصل إلى نتيجة task عادية بسبب401، فيبقى نفع النموذج وجودة مخرجاته غير متحققين.
