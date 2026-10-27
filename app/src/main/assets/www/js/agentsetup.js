'use strict';
/* Raphael/agent klasörünü ve şablonları hazırlar. Var olan dosyaların üzerine YAZMAZ (rehber hariç, isteğe bağlı). */
const P_URET = 'Sen Üretici\'sin. Verilen görev ve planlara göre kodu üret. Gerekli dosyalar bağlamda zaten var; okuma komutu kullanma. Tüm dosyaları komutlarla ver. Planlardaki en iyi fikirleri birleştir, gereksiz karmaşıklık ekleme.';
const P_GOZDEN = 'Sen Gözden Geçirici\'sin. Araç erişimin yok; yalnızca verilen değişiklikleri hızlıca incele: söz dizimi, eksik/yanlış dosya yolu, görevle uyuşmazlık, açık mantık hatası. Stil sorunlarını yazma.\nÇIKTI: Sorun yoksa yalnızca TEMİZ yaz. Varsa her satıra bir sorun yaz: "/yol/dosya.ext: kısa açıklama". Hatasız dosyayı asla yazma.';
const P_DUZELT = 'Sen Düzeltici\'sin. Yalnızca bulgularda adı geçen dosyaları, yalnızca hatalı yerlerden düzelt. KURALLAR: dosyayı baştan yazma; edit komutuyla (SEARCH/REPLACE) hatalı yeri değiştir, SEARCH metni dosyadakiyle birebir olsun; hatayla ilgisiz satıra ve bulgularda olmayan dosyaya dokunma.';
const P_MIMAR = 'Sen Mimar\'sın. ' + ARCH_NOTE.replace(/^\s*MİMAR MODU:\s*/, '').replace('Aşağıdaki PLANLAR', 'Girdideki PLANLAR');
const P_ISCI = 'Sen İşçi\'sin. Mimarın verdiği ortak sözleşmeye ve temele uy. YALNIZCA sana atanan dosyaları yaz (başka dosyaya dokunma). Önce 1-2 cümlelik not yaz (dışa açtığın arayüzler), sonra dosya komutlarını ver.';
const P_DOC_LINES = [
  '# Raphael Agent Sistemi',
  '',
  'Bu klasör senin kendi ajan sistemini kurduğun yerdir (CLAUDE.md mantığı). Kaç ajan olacağını, hangi modeli kullanacaklarını, kimin ne yapacağını, talimatlarını ve çalışma sırasını SEN belirlersin. Uygulama yalnızca motoru ve dosya komutlarını sağlar.',
  '',
  '## Klasör',
  '- `agent.json` — etkin akış (varsayılan: tek ajan). Başka dosyayı seçmek için: `/agent kullan <dosya>`',
  '- `prompts/` — ajan talimat dosyaları (isteğe bağlı; `talimatDosya` ile bağlanır)',
  '- `ornekler/` — hazır örnek akışlar (kopyalayıp kendin düzenle): `plan-uret-kontrol.json`, `mimar-isciler-test.json`',
  '- Projeler `Raphael/<proje>/` altında açılır; bu `agent` klasörüne ajanlar dokunmaz.',
  '',
  '## Uygulama komutları',
  '- `/agent` : kur, dogrula, kullan, doc, araclar seçenekleri',
  '- `/agent kur` : eksik şablonları oluşturur (var olanları silmez)',
  '- `/agent dogrula` : akışı kontrol eder; hata ve uyarıları, ajanların hangi modele bağlandığını gösterir',
  '- `/komutlar` : dosya oluşturma/düzenleme komut dilini gösterir',
  '- `/log` : bu sohbetin günlüğünü Download/RaphaelLog içine kaydeder',
  '',
  '## agent.json yapısı',
  '```json',
  '{',
  '  "ad": "Benim sistemim",',
  '  "butce": 20,',
  '  "bekleme": [10, 30, 60],',
  '  "ajanlar": { "...": { } },',
  '  "adimlar": [ { } ]',
  '}',
  '```',
  '- `ad` : akışın adı. `butce` : bir görevde en fazla kaç model isteği atılacağı (kota koruması). `bekleme` : yoğunlukta saniye cinsinden bekleme-tekrar listesi (son bekleme de başarısız olursa `yedek` modele geçilir).',
  '- Alanlar için `_` ile başlayan anahtarlar (örn. `_aciklama`) yok sayılır; not almak için kullan.',
  '',
  '## ajanlar',
  'Her ajan bir anahtarla tanımlanır (örn. `"planlayici": {...}`). Alanlar:',
  '- `ad` : ekranda ve günlükte görünen rol adı (modele göre değil, role göre adlandır).',
  '- `model` : model adı. Boş bırakırsan uygulamadaki varsayılan model kullanılır. Yazım: `gemini-3.5-flash-lite`, `nvidia/deepseek v4`, `gemini/gemini 3.8` (sağlayıcı/ad).',
  '- `yedek` : model listesi. Birincil model yoğunken/hata verirken sırayla denenir. Örn. `["gemma-4-31b-it"]`.',
  '- `dusunme` : `low`, `medium`, `high` veya `yok`.',
  '- `arac` : `yok` (sadece metin) · `yaz` (tek yanıtta dosya komutları; yazma komutları uygulanır) · `tam` (okuma+yazma; sonuçlar modele geri verilir, iş bitene kadar döngü).',
  '- `maxAdim` : `tam` modda en fazla kaç tur (varsayılan 6).',
  '- `yazincaBitir` : `tam` modda, yalnızca yazma komutları başarılıysa fazladan istek harcamadan bitir (varsayılan true).',
  '- `talimat` : sistem talimatı metni. `talimatDosya` : talimatı bu klasöre göre bir dosyadan oku (ikisi birlikte olursa birleştirilir).',
  '- `aracTalimati` : `false` yaparsan dosya komut dili otomatik eklenmez (varsayılan: `arac` yok değilse eklenir).',
  '- `maxCikti` : en fazla çıktı token sayısı (isteğe bağlı).',
  '',
  '## adimlar',
  'Adımlar sırayla çalışır. Ortak alanlar: `id` (benzersiz), `tur`, `eger`.',
  '### tur: "ajan" (varsayılan)',
  '- `ajan` : ajanlar içindeki anahtar.  `girdi` : ajana giden mesaj şablonu (varsayılan `{gorev}`).',
  '- `cikti` : ajanın cevabını bu adla sakla (varsayılan adımın `id`si). Sonraki adımlarda `{ad}` ile kullan.',
  '- `adet` : aynı ajandan kaç kopya paralel çalışsın (1-8). `roller` : her kopyaya `{rol}` olarak verilecek metinler (böylece aynı sonucu vermezler). `paralel: false` → sırayla.',
  '- `her` : bir önceki çıktıdaki etiketli bloklar kadar kopya çalıştırır. Örn. `"her": {"degisken": "mimar", "etiket": "task", "enFazla": 5}` → çıktıdaki her `<task files="a.js,b.js">...</task>` için bir ajan. Her kopyada `{oge}` (blok metni) ve `{oge.files}` gibi öznitelikler kullanılır.',
  '- `sahip` : `her` ile birlikte, hangi özniteliğin dosya listesi olduğunu söyler (örn. `"files"`). O kopya YALNIZCA bu dosyalara yazabilir; bir dosya iki kopyada geçerse ilkine verilir. Böylece ajanlar birbirinin işini ezmez.',
  '- `uygula` : `"yok"` yazarsan ajanın dosya komutları hemen uygulanmaz, çıktı değişkende bekler; ayrıca bir `uygula` adımıyla kaydedilir (kontrolden sonra kaydetmek için).',
  '- `gizle` : çıktıyı katlanır kutuda göster (adet/her ile birden fazla kopya varsa varsayılan true).',
  '### tur: "uygula"',
  '- `kaynak` : dosya komutları içeren bir değişkenin adı. İçindeki yazma komutlarını uygular. `sadece` : (isteğe bağlı) yalnızca bu dosyalara izin ver.',
  '### tur: "mesaj"',
  '- `metin` : sohbete bilgi satırı yazar (şablon değişkenleri kullanılabilir).',
  '### eger (koşul)',
  '- `"eger": {"degisken": "test", "icerir": "<fixgroup"}` · `"icermez": "TEMİZ"` · `"bos": true/false`. Koşul sağlanmazsa adım atlanır (istek harcanmaz).',
  '',
  '## Şablon değişkenleri',
  '- `{gorev}` kullanıcının mesajı · `{baglam}` çalışma klasörü + ağaç + dosya içerikleri · `{agac}` yalnızca klasör ağacı · `{klasor}` · `{gecmis}` önceki sohbet özeti',
  '- `{dosyalar}` bu görevde şimdiye kadar yazılan dosyalar · `{<cikti>}` önceki adımların çıktısı · `{<cikti>.2}` çoklu çıktının 2. kopyası',
  '- `{n}`, `{toplam}`, `{rol}` kopya bilgileri · `{oge}`, `{oge.<öznitelik>}` (`her` ile)',
  '- `{oku:dosyalar}` veya `{oku:oge.files}` : belirtilen dosyaların diskteki GÜNCEL içeriğini ekler',
  '- `{tag:contract:mimar}` : `mimar` çıktısındaki `<contract>...</contract>` içini ekler',
  '',
  '## Dosya komut dili (ajanlara otomatik verilir)',
  'Ajanların dosya oluşturma/düzenleme için yazdığı komutlar şunlardır. Talimatlarında bunlara atıf yapabilirsin:',
  '```',
] .concat(DEF_PROTO.split('\n')).concat([
  '```',
  'Not: Dosya içeriği komutun içine HAM yazılır (kod bloğu, CDATA veya ek kelime olmadan). Uygulama yine de bu tür sarmaları otomatik temizler.',
  '',
  '## Doğru ve ucuz çalışan sistem için ipuçları',
  '- Aynı işi yapan kopyalar yerine `roller` veya `her` ile FARKLI iş ver. Dosya sahipliği (`sahip`) çakışmayı önler.',
  '- Güçlü modeli pahalı/az kotalı adımlarda (mimari, üretim) kullan; ucuz modeli plan, kontrol ve işçilik için kullan.',
  '- Her kritik ajana `yedek` model yaz. Bütçeyi (`butce`) tahmini istek sayısına göre ayarla; `/agent dogrula` tahmini gösterir.',
  '- Hatayı düzelttirirken yalnızca hatalı dosyaları ver (`{oku:oge.files}` gibi); ajana "dosyayı baştan yazma, edit kullan" de.',
  '- Üretimi hemen kaydetmek yerine `uygula: "yok"` ile beklet, kontrolden sonra `uygula` adımıyla kaydet.',
  '- Sonsuz döngü yok: akış yalnızca yukarıdan aşağıya, bir kez çalışır; `tam` ajanlar `maxAdim` ve tekrar korumasıyla sınırlıdır.',
  ''
]);
const AGENT_DOC = P_DOC_LINES.join('\n');

const FLOW_DEFAULT = {
  _aciklama: 'Varsayılan tek ajanlı akış. Kendi sistemini kurmak için bu dosyayı düzenle; rehber: AGENT.md',
  ad: 'Tek ajan', butce: 20, bekleme: [10, 30, 60],
  ajanlar: { raphael: { ad: 'Raphael', model: '', yedek: [], dusunme: 'medium', arac: 'tam', maxAdim: 6, talimatDosya: 'prompts/raphael.md' } },
  adimlar: [{ id: 'is', ajan: 'raphael', girdi: '{baglam}\n\nGÖREV: {gorev}', cikti: 'sonuc' }]
};
const FLOW_PUK = {
  _aciklama: '3 farklı rolde plan → üretim (kaydetmeden) → kontrol → sorun varsa hedefli düzeltme → kaydet. Modelleri kendin yaz.',
  ad: 'Planla-Üret-Kontrol', butce: 16, bekleme: [10, 30, 60],
  ajanlar: {
    planlayici: { ad: 'Planlayıcı', model: '', dusunme: 'medium', arac: 'yok', talimatDosya: 'prompts/planlayici.md' },
    uretici: { ad: 'Üretici', model: '', dusunme: 'medium', arac: 'yaz', talimatDosya: 'prompts/uretici.md' },
    gozden: { ad: 'Gözden Geçirici', model: '', dusunme: 'yok', arac: 'yok', talimatDosya: 'prompts/gozden.md' },
    duzeltici: { ad: 'Düzeltici', model: '', dusunme: 'medium', arac: 'yaz', talimatDosya: 'prompts/duzeltici.md' }
  },
  adimlar: [
    { id: 'planlar', ajan: 'planlayici', adet: 3, roller: ['MİMAR: dosya/modül yapısı, arayüzler, veri akışı.', 'RİSK ANALİZCİ: hata ve kenar durumları, performans, nelerin bozulabileceği.', 'ÜRÜN/DENEYİM: kullanıcıya görünen özellikler, kapsam, eksikler.'], girdi: '{baglam}\n\nGÖREV: {gorev}\n\nROLÜN: {rol}\nBu görev için planını yaz.' },
    { id: 'uret', ajan: 'uretici', uygula: 'yok', cikti: 'uretim', girdi: '{baglam}\n\nGÖREV: {gorev}\n\nPLANLAR:\n{planlar}' },
    { id: 'kontrol', ajan: 'gozden', cikti: 'bulgu', girdi: 'GÖREV: {gorev}\n\nDEĞİŞİKLİKLER:\n{uretim}' },
    { id: 'duzelt', ajan: 'duzeltici', eger: { degisken: 'bulgu', icermez: 'TEMİZ' }, uygula: 'yok', cikti: 'duzeltme', girdi: 'GÖREV: {gorev}\n\nBULGULAR:\n{bulgu}\n\nDEĞİŞİKLİKLER (henüz kaydedilmedi):\n{uretim}\n\nYalnızca bulgulardaki dosyalar için edit komutları ver.' },
    { id: 'kaydet', tur: 'uygula', kaynak: 'uretim' },
    { id: 'kaydet2', tur: 'uygula', kaynak: 'duzeltme' }
  ]
};
const FLOW_MIT = {
  _aciklama: '3 uzman plan → Mimar (ortak sözleşme + temel + ≤5 görev, tek çıktı) → işçiler (her biri yalnızca kendi dosyaları) → Test → hatalı dosyalar için hedefli düzeltmeler → Onay.',
  ad: 'Mimar-İşçiler-Test', butce: 30, bekleme: [10, 30, 60],
  ajanlar: {
    uzman: { ad: 'Uzman', model: '', dusunme: 'medium', arac: 'yok', talimatDosya: 'prompts/planlayici.md' },
    mimar: { ad: 'Mimar', model: '', dusunme: 'high', arac: 'yaz', talimatDosya: 'prompts/mimar.md' },
    isci: { ad: 'İşçi', model: '', dusunme: 'low', arac: 'yaz', talimatDosya: 'prompts/isci.md' },
    test: { ad: 'Test', model: '', dusunme: 'medium', arac: 'yok', talimatDosya: 'prompts/test.md' },
    duzeltici: { ad: 'Düzeltici', model: '', dusunme: 'medium', arac: 'yaz', talimatDosya: 'prompts/duzeltici.md' },
    onay: { ad: 'Onay', model: '', dusunme: 'yok', arac: 'yok', talimatDosya: 'prompts/onay.md' }
  },
  adimlar: [
    { id: 'planlar', ajan: 'uzman', adet: 3, roller: ['MİMAR: dosya/modül yapısı, arayüzler, veri akışı.', 'RİSK ANALİZCİ: hata ve kenar durumları, performans, test senaryoları.', 'ÜRÜN/DENEYİM: kullanıcıya görünen özellikler ve kapsam.'], girdi: '{baglam}\n\nGÖREV: {gorev}\n\nROLÜN: {rol}\nPlanını yaz.' },
    { id: 'mimar', ajan: 'mimar', girdi: '{baglam}\n\nGÖREV: {gorev}\n\nUZMAN PLANLARI:\n{planlar}' },
    { id: 'isciler', ajan: 'isci', her: { degisken: 'mimar', etiket: 'task', enFazla: 5 }, sahip: 'files', girdi: 'GÖREV: {gorev}\n\nMİMARIN ÇIKTISI (sözleşme, temel ve tüm görevler):\n{mimar}\n\nSENİN GÖREVİN:\n{oge}\n\nSENİN DOSYALARIN (yalnızca bunları yaz): {oge.files}\n\nMevcut içerikler:\n{oku:oge.files}' },
    { id: 'test', ajan: 'test', girdi: 'GÖREV: {gorev}\n\nORTAK SÖZLEŞME:\n{tag:contract:mimar}\n\nKOD:\n{oku:dosyalar}' },
    { id: 'duzeltmeler', ajan: 'duzeltici', eger: { degisken: 'test', icerir: '<fixgroup' }, her: { degisken: 'test', etiket: 'fixgroup', enFazla: 3 }, sahip: 'files', girdi: 'ORTAK SÖZLEŞME:\n{tag:contract:mimar}\n\nSORUN / TALİMAT:\n{oge}\n\nDOSYALAR (yalnızca bunlara dokun): {oge.files}\n\nMEVCUT İÇERİK:\n{oku:oge.files}' },
    { id: 'onay', ajan: 'onay', eger: { degisken: 'test', icerir: '<fixgroup' }, girdi: 'GÖREV: {gorev}\n\nTEST BULGULARI:\n{test}\n\nDüzeltilen dosyalar: {dosyalar}' }
  ]
};
const SETUP_FILES = () => ({
  'AGENT.md': AGENT_DOC,
  'agent.json': JSON.stringify(FLOW_DEFAULT, null, 2) + '\n',
  'prompts/raphael.md': DEF_PERSONA + '\n',
  'ornekler/plan-uret-kontrol.json': JSON.stringify(FLOW_PUK, null, 2) + '\n',
  'ornekler/mimar-isciler-test.json': JSON.stringify(FLOW_MIT, null, 2) + '\n',
  'ornekler/prompts/planlayici.md': PLAN_SYS + '\n',
  'ornekler/prompts/uretici.md': P_URET + '\n',
  'ornekler/prompts/gozden.md': P_GOZDEN + '\n',
  'ornekler/prompts/duzeltici.md': P_DUZELT + '\n',
  'ornekler/prompts/mimar.md': P_MIMAR + '\n',
  'ornekler/prompts/isci.md': P_ISCI + '\n',
  'ornekler/prompts/test.md': TEST_SYS + '\n',
  'ornekler/prompts/onay.md': FINAL_SYS + '\n'
});
function setupAgentDir(forceDoc) {
  N.mkdir(AGENT_DIR); N.mkdir(AGENT_DIR + '/prompts'); N.mkdir(AGENT_DIR + '/ornekler/prompts'); const made = [];
  const F = SETUP_FILES();
  for (const k of Object.keys(F)) {
    const path = AGENT_DIR + '/' + k; const exists = N.read(path, 10).ok;
    if (exists && !(forceDoc && k === 'AGENT.md')) continue;
    if (N.write(path, F[k], false).ok) made.push(k);
  }
  // ornek akışlar prompts/ yolunu kendi klasörlerinden arar: ornekler/prompts/
  return made;
}
