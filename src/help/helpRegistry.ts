export interface HelpEntry {
  id: string;
  title: string;
  summary: string;
  useWhen: string;
  effect: string;
  example?: string;
  caution?: string;
  shortcut?: string;
  related?: string[];
}

const help = (
  id: string,
  title: string,
  summary: string,
  useWhen: string,
  effect: string,
  options: Partial<Omit<HelpEntry, "id" | "title" | "summary" | "useWhen" | "effect">> = {}
): HelpEntry => ({ id, title, summary, useWhen, effect, ...options });

export const HELP_ENTRIES: HelpEntry[] = [
  help("app.brand", "Hints Reel Composer", "مساحة التجميع والمونتاج المحلية الخاصة بـHints.", "استخدمها بعد استلام اللقطات من Flow أو أي مصدر خارجي.", "تجمع اللقطات والنص والصوت وتنتج ملف التسليم دون تغيير المصادر الأصلية."),
  help("app.projectTitle", "اسم المشروع", "الاسم الداخلي للمشروع الحالي.", "غيّره عندما تبدأ Reel أو نسخة جديدة.", "يظهر في قائمة المشاريع وملفات الـRecipe والرندر.", { example: "Flooded Clockwork v03" }),
  help("app.sequence", "Sequence", "اختيار نسخة الكادر النشطة داخل المشروع.", "بدّل بين 9:16 و16:9 و1:1 و4:5 قبل التعديل أو التصدير.", "كل Sequence يحتفظ بترتيبه وأبعاده وتعديلاته المستقلة.", { caution: "تأكد من الـSequence النشطة قبل Generate." }),
  help("app.save", "Save", "يحفظ الحالة الحالية في project.json وينشئ autosave.", "استخدمه قبل الرندر أو بعد تعديل مهم.", "يثبت التعديلات على القرص دون تغيير ملفات الميديا.", { shortcut: "Ctrl + S" }),
  help("app.saveState", "حالة الحفظ", "توضح هل المشروع Saved أو Saving أو Unsaved.", "راقبها قبل إغلاق المتصفح.", "Saved تعني أن آخر تعديل وصل إلى project.json."),
  help("app.guide", "Guide Mode", "يظهر علامات المعلومات بجانب الأدوات القابلة للشرح.", "شغله أثناء التعلم وأغلقه عندما تريد واجهة نظيفة.", "لا يغير المشروع أو الرندر؛ هو طبقة تعليمية فقط.", { shortcut: "?" }),
  help("app.recipe", "HRC Recipe", "يفتح التمثيل البرمجي المتزامن للمشروع.", "استخدمه لاستيراد Recipe مني أو لإجراء تعديل دقيق قابل للمراجعة.", "بعد Validate & Apply يتحول السكربت إلى Timeline مرئي.", { caution: "الـRecipe الخاطئة لا تطبق حتى تمر من validation." }),
  help("app.generate", "Generate", "يفتح نافذة الرندر والتصدير.", "استخدمه بعد مراجعة الـSequence والـTimeline.", "يحفظ المشروع ثم يبني FFmpeg render graph ويشغل QA."),
  help("app.renderPreset", "Render Preset", "يحدد صيغة وجودة الناتج قبل فتح نافذة Generate.", "اختر Draft للمراجعات السريعة وDelivery للتسليم النهائي.", "يغير codec والجودة والحاوية، ولا يغير محتوى الـTimeline."),
  help("app.status.tools", "Render Stack", "حالة اتصال الاستديو بأدوات الرندر المحلية.", "يجب أن تكون Online قبل Generate.", "يتحقق من FFmpeg والستاك المحلي عند فتح التطبيق."),
  help("app.status.recipe", "Recipe Version", "إصدار عقد المشروع الذي يفهمه الاستديو.", "يفيد عند تبادل المشاريع أو تشخيص التوافق.", "HRC Recipe v1 هو مصدر الحقيقة الحالي."),
  help("app.status.assets", "Managed Assets", "عدد الملفات التي نسخها المشروع وأصبح يديرها.", "راقبه بعد الاستيراد للتأكد أن الملفات دخلت المشروع.", "كل asset يحصل على metadata وchecksum."),
  help("app.status.local", "Local-only", "تأكيد أن الاستديو لا ينشر تلقائيًا ولا يرسل المشروع لمنصة.", "استخدم الناتج للمراجعة قبل أي نشر يدوي.", "كل العمليات تبقى داخل جهازك ومجلد المشروع."),

  help("media.panel", "Media Bin", "مكتبة الفيديو والصوت والصور الخاصة بالمشروع.", "ابدأ منها لإدخال اللقطات ثم أضفها إلى الـTimeline.", "تعرض metadata وthumbnail أو waveform لكل مصدر."),
  help("media.safety", "حماية المصادر", "الميديا المستوردة تُنسخ وتُفحص بدل العمل على الأصل.", "راجعها عندما تريد التأكد أن Flow shots الأصلية لن تتغير.", "يُحسب SHA-256 ويُحفظ المصدر داخل media/."),
  help("media.import", "Import Media", "يستورد فيديو أو صوت أو صورة إلى المشروع.", "استخدمه مع اللقطات الخام والصوت والصور المرجعية.", "ينسخ الملف ويشغّل FFprobe ويولّد thumbnail وwaveform عند الحاجة."),
  help("media.addText", "Add Text", "ينشئ طبقة نص قابلة للتحرير عند الـplayhead.", "استخدمه للعناوين والاقتباسات والـend cards.", "يضيف clip على أول graphics track متاح."),
  help("media.addSignal", "Add Hints Signal", "ينشئ خط cyan هندسيًا كطبقة مستقلة.", "استخدمه للحركة الإشارية والـtracking line.", "يمكن تحريكه وتغيير موضعه وشفافيته بالـkeyframes."),
  help("media.filters", "Media Filters", "يعرض كل الميديا أو نوعًا واحدًا فقط.", "استخدمه عندما تصبح المكتبة كبيرة.", "لا يحذف ولا يغيّر الملفات؛ يغيّر العرض فقط."),
  help("media.search", "Search Media", "يبحث داخل أسماء assets المستوردة.", "اكتب جزءًا من اسم اللقطة أو الصوت.", "يقلص القائمة لحظيًا دون تغيير المشروع."),
  help("media.asset", "Managed Asset", "ملف مصدر جاهز للإضافة إلى الـTimeline.", "اضغط عليه لإضافته عند الـplayhead.", "الفيديو والصورة يذهبان لمسار video والصوت لمسار audio.", { caution: "الضغط يضيف نسخة clip جديدة؛ لا يغير المصدر." }),
  help("media.originals", "Originals Remain Unchanged", "تأكيد أن تعديلات الـTimeline غير مدمرة.", "اعتمد عليه عند التجربة بحرية.", "القص والسرعة والتحريك تحفظ كتعليمات داخل Recipe فقط."),

  help("preview.panel", "Preview", "المعاينة المباشرة للـSequence النشطة.", "استخدمها لفحص التكوين والحركة قبل الرندر.", "تقرأ نفس التوقيت والـkeyframes المستخدمة في التصدير."),
  help("preview.stage", "Composition Stage", "الكادر النهائي الذي يحتوي طبقات الفيديو والنص والإشارات.", "اسحب طبقة ظاهرة لتغيير Position X/Y مباشرة.", "الحركة هنا تكتب قيمة transform في Recipe."),
  help("preview.actionSafe", "Action Safe", "الدليل الخارجي لمساحة الأمان العامة.", "ضع العناصر المهمة داخله لتقليل خطر القص على المنصات.", "الدليل لا يظهر في الرندر النهائي."),
  help("preview.titleSafe", "Title Safe", "الدليل الداخلي الأكثر أمانًا للنص والعناوين.", "ضع النص الأساسي داخله خصوصًا في 9:16.", "الدليل لا يظهر في الرندر النهائي."),
  help("preview.centerGuides", "Center Guides", "خطوط تحدد المركز الأفقي والرأسي للكادر.", "استخدمها عند محاذاة النص أو اللقطة بصريًا.", "هي guides فقط ولا تدخل الرندر."),
  help("preview.layer", "Preview Layer", "طبقة مرئية حاليًا عند موضع الـplayhead.", "اضغط لتحديدها أو اسحبها لتغيير مكانها.", "اختيارها يفتح خصائصها في Inspector."),
  help("preview.autoFit", "Auto Fit Preview", "المعاينة تضبط الكادر تلقائيًا داخل المساحة المتاحة.", "استخدم المؤشر للتأكد أن العرض الحالي ليس crop من الواجهة.", "لا يغير Scale الحقيقي للطبقات ولا أبعاد التصدير."),
  help("preview.previousFrame", "Previous Frame", "يرجع الـplayhead فريمًا واحدًا.", "استخدمه لضبط لحظة ظهور أو keyframe بدقة.", "مقدار الحركة يساوي 1 / FPS."),
  help("preview.play", "Play / Pause", "يشغّل أو يوقف معاينة الـTimeline.", "استخدمه لمراجعة الإيقاع والتزامن.", "لا يبدأ render ولا يغير المشروع.", { shortcut: "Space" }),
  help("preview.nextFrame", "Next Frame", "يتقدم بالـplayhead فريمًا واحدًا.", "استخدمه لفحص القطع والحركة frame-by-frame.", "مقدار الحركة يساوي 1 / FPS."),
  help("preview.timecode", "Preview Timecode", "يعرض الزمن الحالي والمدة الكاملة.", "استخدمه لتحديد مكانك الدقيق داخل الـSequence.", "القراءة مرتبطة بالـFPS النشطة."),

  help("inspector.panel", "Inspector", "مركز تعديل خصائص الطبقة أو الـSequence.", "حدد clip ثم عدّل قيمه بدل إعادة بناء العنصر.", "كل تغيير يدخل Undo/Redo ويتزامن مع Recipe."),
  help("inspector.tabs", "Layer / Project", "Layer لخصائص العنصر المحدد وProject لإعدادات الـSequence والرندر.", "بدّل حسب نوع القرار الذي تريد اتخاذه.", "لا يغير شيئًا وحده؛ يغير مجموعة الأدوات المعروضة."),
  help("inspector.rename", "Layer Name", "اسم clip داخل المشروع.", "استخدم أسماء واضحة عند كثرة الطبقات.", "يغير التنظيم فقط ولا يظهر في الفيديو."),
  help("inspector.textContent", "Text Content", "المحتوى المكتوب داخل طبقة النص.", "اكتب العنوان أو الاقتباس كما سيظهر.", "يتحدث في المعاينة والرندر ويحترم اتجاه النص."),
  help("inspector.font", "Font Family", "اختيار خط النص من خطوط Hints المحلية المعتمدة.", "Bomstad للعناوين، Hakira للمعالجة التقديمية المنتقاة، وTajawal للنص العربي.", "يستخدم أصلًا محليًا من brand canon في المعاينة والرندر."),
  help("inspector.weight", "Font Weight", "درجة سماكة الخط.", "ارفعها للعناوين المهمة وخففها للنصوص الثانوية.", "تؤثر في القوة البصرية وعرض النص."),
  help("inspector.fontSize", "Font Size", "حجم النص داخل أبعاد الـSequence الحقيقية.", "اضبطه مع متابعة Title Safe.", "قيمة أكبر تعني نصًا أكبر في التصدير.", { example: "120px لعنوان رأسي واضح" }),
  help("inspector.tracking", "Tracking", "المسافة بين الحروف.", "استخدمه لضبط الإيقاع والتيبوغرافيا السينمائية.", "القيمة الموجبة توسع الحروف والسالبة تقربها."),
  help("inspector.textColor", "Text Color", "لون النص بصيغة HEX.", "استخدم الأبيض أو cyan وفق وظيفة النص.", "يتغير في المعاينة والرندر.", { caution: "راجع التباين فوق اللقطة." }),
  help("inspector.positionX", "Position X", "يحرك العنصر أفقيًا حول مركز الكادر.", "استخدم السالب لليسار والموجب لليمين.", "يمكن تحريكه مع الزمن عبر زر الـkeyframe.", { example: "-120 يحرك العنصر 120px لليسار." }),
  help("inspector.positionY", "Position Y", "يحرك العنصر رأسيًا حول مركز الكادر.", "استخدم السالب للأعلى والموجب للأسفل.", "يمكن تحريكه مع الزمن عبر زر الـkeyframe.", { example: "-310 يرفع النص إلى الثلث العلوي." }),
  help("inspector.scale", "Scale", "يكبر أو يصغر الطبقة كنسبة من حجمها.", "استخدمه لإعادة تكوين اللقطة دون تغيير الملف الأصلي.", "1 هو الحجم الطبيعي، و1.2 أكبر بنسبة 20%."),
  help("inspector.rotation", "Rotation", "يدير الطبقة بالدرجات حول مركزها.", "استخدمه للحركات المقيدة أو تصحيح الميل.", "القيمة تدخل المعاينة والرندر والـkeyframes."),
  help("inspector.opacity", "Opacity", "شفافية الطبقة من 0 إلى 1.", "استخدمها للظهور والاختفاء أو التراكب.", "0 مخفي و1 ظاهر بالكامل."),
  help("inspector.keyframe", "Add Keyframe", "يثبت قيمة الخاصية عند الفريم الحالي.", "أضف قيمتين أو أكثر لصناعة حركة مع الزمن.", "الرندر ينتقل بين القيم باستخدام easing.", { caution: "ضع الـplayhead داخل مدة clip قبل إضافة keyframe." }),
  help("inspector.fit", "Media Fit", "يحدد كيف تملأ الصورة أو الفيديو الكادر.", "Cover لملء الكادر وContain لإظهار الملف كاملًا.", "Cover قد يقص الحواف، وContain قد يترك فراغات."),
  help("inspector.timelineStart", "Timeline Start", "وقت بداية clip داخل الـSequence.", "استخدمه لوضع العنصر عند ثانية محددة.", "يغير مكان clip زمنيًا دون تغيير source-in."),
  help("inspector.duration", "Clip Duration", "مدة ظهور clip على الـTimeline.", "استخدمها لتحديد طول اللقطة أو النص.", "لا تتجاوز مدة الـSequence ويُحترم الحد الأدنى لفريم واحد."),
  help("inspector.sourceIn", "Source In", "النقطة التي يبدأ منها استخدام الملف الأصلي.", "استخدمها لتجاوز بداية غير مطلوبة من اللقطة.", "لا يقص المصدر؛ يحفظ offset فقط."),
  help("inspector.speed", "Playback Speed", "سرعة ثابتة لتشغيل media clip.", "استخدم أقل من 1 للحركة البطيئة وأكبر من 1 للتسريع.", "يغير استهلاك زمن المصدر داخل مدة clip.", { caution: "Speed ramps وreverse ليست متاحة في هذه النسخة." }),
  help("inspector.fadeIn", "Fade In", "مدة ظهور الطبقة تدريجيًا من الشفافية.", "استخدمها للدخول الهادئ.", "تبدأ عند أول clip وتصل إلى opacity المطلوبة."),
  help("inspector.fadeOut", "Fade Out", "مدة اختفاء الطبقة تدريجيًا.", "استخدمها للنهاية الهادئة أو الانتقال.", "تنتهي عند آخر clip."),
  help("inspector.audioGain", "Audio Gain", "مستوى صوت clip قبل الماستر.", "وازن الحوار والمؤثرات والموسيقى.", "1 هو المستوى الأصلي، و0 يكتم clip."),
  help("inspector.aspectRatio", "Aspect Ratio", "اختيار الـSequence التي تريد تعديلها.", "بدّل النسبة ثم اضبط تكوينها مستقلًا.", "ينقل Inspector إلى Sequence أخرى داخل نفس المشروع."),
  help("inspector.sequenceDuration", "Sequence Duration", "المدة الكاملة للنسخة الحالية.", "اضبطها وفق مدة الـReel النهائية.", "تحدد نهاية الـTimeline والرندر."),
  help("inspector.frameRate", "Frame Rate", "عدد الفريمات في الثانية.", "استخدم 30fps للريلز المعتادة ما لم يوجد سبب مختلف.", "يحدد دقة frame stepping وحساب keyframes والرندر.", { caution: "تغيير FPS بعد تحريك دقيق قد يغير إحساس التوقيت." }),
  help("inspector.background", "Background", "لون خلفية الـSequence عندما لا تغطيها طبقة.", "استخدم Omega Black كأساس Hints.", "يدخل الرندر النهائي.", { example: "#04080C" }),
  help("inspector.loudness", "Loudness Target", "الهدف العام لقوة الصوت بوحدة LUFS.", "استخدمه قبل Delivery لضبط مستوى متماسك.", "يمرره محرك الرندر إلى loudness normalization."),
  help("inspector.truePeak", "True Peak", "السقف الأقصى للذروة الصوتية.", "استخدمه لمنع clipping بعد الضغط والترميز.", "القيم السالبة تترك headroom أكثر."),

  help("timeline.panel", "Timeline", "الخريطة الزمنية لكل طبقات المشروع.", "رتب اللقطات والنص والصوت هنا.", "ما تراه على المسارات هو ما يقرأه الرندر بالترتيب والزمن."),
  help("timeline.undo", "Undo", "يرجع آخر عملية تحرير.", "استخدمه بعد حركة أو قص غير مقصود.", "لا يحذف autosaves السابقة.", { shortcut: "Ctrl + Z" }),
  help("timeline.redo", "Redo", "يعيد العملية التي رجعتها بـUndo.", "استخدمه إذا تراجعت ثم قررت استعادة التعديل.", "يعمل ما دامت سلسلة التاريخ متاحة.", { shortcut: "Ctrl + Shift + Z" }),
  help("timeline.split", "Split", "يقسم clip المحدد عند الـplayhead.", "استخدمه لفصل جزء أو صناعة cut.", "ينشئ clip ثانية ويحافظ على source timing.", { shortcut: "S" }),
  help("timeline.duplicate", "Duplicate", "ينشئ نسخة من clip المحدد.", "استخدمه لتكرار عنوان أو حركة ثم تعديل النسخة.", "النسخة مستقلة لكن تشير لنفس asset الآمن.", { shortcut: "Ctrl + D" }),
  help("timeline.delete", "Delete", "يحذف clip المحدد من الـTimeline.", "استخدمه لإزالة استخدام اللقطة من النسخة الحالية.", "لا يحذف asset أو الملف الأصلي.", { shortcut: "Delete" }),
  help("timeline.addText", "Timeline Text", "يضيف طبقة نص عند الـplayhead.", "استخدمه دون الرجوع إلى Media Bin.", "يضع clip جديدة على graphics track."),
  help("timeline.addSignal", "Timeline Signal", "يضيف Hints cyan signal عند الـplayhead.", "استخدمه كبداية لحركة إشارية.", "يمكن تعديل زمنه وkeyframes مثل أي طبقة."),
  help("timeline.zoom", "Timeline Zoom", "يكبر أو يصغر المسافة الزمنية بصريًا.", "كبّره للقص الدقيق وصغّره لرؤية المشروع كاملًا.", "لا يغير مدة أي clip أو الرندر."),
  help("timeline.readout", "Timeline Timecode", "الوقت الحالي للـplayhead.", "استخدمه لتأكيد موضع القطع أو keyframe.", "يعرض الزمن حسب FPS الحالية."),
  help("timeline.trackLock", "Track Lock", "يمنع تحريك أو قص clips على المسار.", "اقفل المسار بعد تثبيته.", "يحمي التحرير فقط ولا يغير ظهوره أو صوته."),
  help("timeline.trackVisibility", "Track Visibility", "يظهر أو يخفي المسار البصري.", "استخدمه لمقارنة التكوين بدون طبقة معينة.", "المسار المخفي لا يدخل المعاينة أو الرندر."),
  help("timeline.trackMute", "Track Mute", "يكتم صوت المسار.", "استخدمه لمراجعة الحوار أو المؤثرات منفصلة.", "يؤثر في المعاينة والرندر."),
  help("timeline.trackSolo", "Track Solo", "يعزل المسار ويوقف بقية المسارات مؤقتًا.", "استخدمه لفحص طبقة أو صوت بعينه.", "عند وجود Solo يعرض الاستديو المسارات المعزولة فقط."),
  help("timeline.ruler", "Time Ruler", "مسطرة الزمن أعلى المسارات.", "اضغط عند ثانية لنقل الـplayhead.", "لا يعدل clips؛ يغير موضع المعاينة فقط."),
  help("timeline.canvas", "Timeline Canvas", "مساحة المسارات التي تستقبل clips.", "اضغط في الفراغ لتغيير الزمن وإلغاء تحديد clip.", "Shift + Click محفوظ هنا للـmulti-select المستقبلي."),
  help("timeline.clip", "Timeline Clip", "استخدام زمني مستقل لملف أو نص أو إشارة.", "اسحبه لتغيير موضعه واضغط لتحديده.", "تعديل clip لا يغير asset الأصلية."),
  help("timeline.trimStart", "Trim Start", "يغير بداية clip مع الحفاظ على تزامن المصدر.", "اسحب الحافة اليسرى لإزالة جزء من البداية.", "يحدث timelineStart وduration وsourceIn معًا."),
  help("timeline.trimEnd", "Trim End", "يغير نهاية clip.", "اسحب الحافة اليمنى لتقصير أو إطالة الاستخدام.", "لا يتجاوز نهاية الـSequence."),
  help("timeline.playhead", "Playhead", "المؤشر الذي يحدد الفريم الحالي.", "حرّكه للمراجعة أو وضع split وkeyframes.", "لا يدخل الرندر النهائي."),

  help("recipe.panel", "HRC Recipe Drawer", "واجهة السكربت الآمنة والمتزامنة مع الـTimeline.", "استخدمها عندما أرسل لك Recipe أو عند تعديل قيم كثيرة بدقة.", "لا تقبل shell commands أو paths غير آمنة."),
  help("recipe.close", "Close Recipe", "يغلق الـdrawer دون حذف المشروع.", "استخدمه للعودة إلى التحرير المرئي.", "التعديلات غير المطبقة داخل النص تظل محلية للـdrawer."),
  help("recipe.status", "Recipe Status", "يلخص صلاحية السكربت وعدد assets وclips وsequences.", "راجعه قبل Apply.", "الأخطاء تمنع التطبيق وتحمي المشروع النشط."),
  help("recipe.editor", "Recipe Editor", "محرر JSON الكامل للمشروع.", "استخدمه للتعديلات المنظمة أو لصق Recipe جاهزة.", "يتحقق من schema قبل السماح بالتطبيق.", { caution: "لا تضف أوامر Shell؛ العقد لا يسمح بها." }),
  help("recipe.validation", "Validation Results", "يعرض أخطاء الـJSON أو الـschema.", "اقرأ الرسالة وعدّل السطر قبل Apply.", "Recipe غير الصالحة لا تفسد المشروع."),
  help("recipe.import", "Import Recipe", "يفتح ملف .json خارجيًا داخل المحرر.", "استخدمه لاستلام مشروع أو Timeline جاهز.", "لا يطبق الملف حتى تضغط Validate & Apply."),
  help("recipe.export", "Export Recipe", "ينزل نسخة قابلة للتبادل من المشروع الحالي.", "استخدمه للنسخ الاحتياطي أو لإرساله لي.", "لا ينسخ الميديا؛ يصدر تعليمات المشروع فقط."),
  help("recipe.reset", "Reset to Visual", "يعيد نص المحرر إلى حالة المشروع المرئية الحالية.", "استخدمه لإلغاء تعديلات سكربت لم تطبقها.", "لا يغير الـTimeline."),
  help("recipe.apply", "Validate & Apply", "يفحص السكربت ثم يستبدل الحالة المرئية بالنسخة الصالحة.", "استخدمه بعد مراجعة التغييرات وعدد clips.", "ينشئ تحديثًا محفوظًا ويمكن متابعة التحرير بصريًا."),

  help("render.panel", "Generate Reel", "نافذة تشغيل الرندر النهائي من نفس Recipe.", "راجع الملخص واختر preset ثم Start Render.", "تحفظ المشروع وتنفذ FFmpeg وتستخرج QA evidence."),
  help("render.close", "Close Render", "يغلق النافذة عندما لا توجد عملية نشطة.", "استخدمه للعودة إلى التعديل.", "لا يمكن إغلاق العملية النشطة بالخطأ."),
  help("render.summary", "Render Summary", "يعرض الـSequence والدقة وFPS والمدة التي ستصدر.", "راجعه قبل صرف الوقت على الرندر.", "هو انعكاس مباشر للإعدادات الحالية."),
  help("render.preset", "Output Preset", "يحدد codec والجودة وصيغة الناتج.", "Review للمشاركة الداخلية وDelivery للجودة العالية وArchive للحفظ.", "لا يغير الـTimeline؛ يغير طريقة الترميز فقط."),
  help("render.progress", "Render Progress", "يوضح مراحل Compiling وRendering وQA وComplete.", "اترك النافذة مفتوحة حتى Complete أو ألغ العملية.", "يعرض أحداث السيرفر المحلي مباشرة."),
  help("render.cancel", "Cancel Render", "يوقف عملية الرندر الحالية.", "استخدمه إذا اكتشفت خطأ قبل النهاية.", "يحاول إيقاف FFmpeg ويحافظ على المشروع."),
  help("render.start", "Start Render", "يبدأ الرندر بالـpreset المختارة.", "استخدمه بعد مراجعة الملخص والحفظ.", "ينشئ ملفًا جديدًا داخل renders/ مع logs وQA."),
  help("render.download", "Download Result", "يفتح أو ينزل artifact المكتملة من السيرفر المحلي.", "استخدمه بعد Complete.", "النسخة الأصلية تظل أيضًا داخل مجلد renders/."),
  help("render.another", "Render Another", "يعيد النافذة لحالة جاهزة لتصدير نسخة أخرى.", "استخدمه لإخراج preset أو ratio إضافية.", "لا يحذف الرندر السابق."),
  help("render.closeFooter", "Close", "يغلق نافذة Generate بعد انتهاء أو قبل بدء الرندر.", "استخدمه للعودة إلى التعديل.", "لا يغير المشروع."),
  help("error.toast", "Composer Error", "رسالة توضح مشكلة تحتاج انتباهك.", "اقرأها قبل إعادة العملية.", "لا تخفي الخطأ أو تعدل المشروع تلقائيًا."),
  help("error.dismiss", "Dismiss Error", "يغلق رسالة الخطأ بعد قراءتها.", "استخدمه لتنظيف الشاشة.", "لا يصلح السبب؛ يغلق الرسالة فقط.")
];

export const HELP_REGISTRY = new Map(HELP_ENTRIES.map((entry) => [entry.id, entry]));

export function getHelpEntry(id: string): HelpEntry | undefined {
  return HELP_REGISTRY.get(id);
}
