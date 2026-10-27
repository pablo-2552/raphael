# Raphael Code

Android 8+ için, API anahtarıyla çalışan terminal tarzı yapay zekâ sohbet + agent uygulaması.

## Raphael agent sistemi (kendin kurarsın)
Hazır modlar yok: ajanları, modellerini, talimatlarını ve çalışma sırasını **sen** `Raphael/agent/` klasöründeki dosyalarla tanımlarsın.
- `AGENT.md` rehberi (CLAUDE.md gibi), `agent.json` (etkin akış), `prompts/`, `ornekler/` uygulama tarafından otomatik hazırlanır.
- Ajan = ad + model (+ yedek modeller) + düşünme + araç izni (`yok`/`yaz`/`tam`) + talimat.
- Adım = ajan çalıştır (`adet`, `roller`, `her` + `sahip` ile paralel/dağıtımlı), `uygula` (kaydet), `mesaj`; koşullu (`eger`).
- Dosya komut dili uygulama içinde: `/komutlar` · Doğrulama: `/agent dogrula` · Akış seçimi: `/agent kullan`.
- Yoğunlukta model 10 → 30 → 60 sn beklenip 3 kez denenir; olmazsa `yedek` modele geçilir. İstek bütçesi ve döngü koruması vardır.
- Proje klasörü verilmezse dosyalar `/Raphael/<proje>/` altında açılır. İş sürerken arka planda çalışır, bitince bildirim gelir.
- Her sohbet için sıralı günlük `.txt` (`/log`): istek, düşünce, çıktı, araç sonuçları, hatalar.
- `/onar [yol]`: dosyalara sızan `<![CDATA[ ]]>` / ``` artıklarını temizler.

## API'ler ve model paneli
- Gemini, **NVIDIA (build.nvidia.com)**, OpenRouter ve OpenAI uyumlu özel API'ler. NVIDIA ve özel API istekleri tarayıcı CORS kısıtına takılmasın diye Kotlin üzerinden yapılır.
- Model seçimi yol gibi çalışır: `/model/` → sağlayıcılar, `/model/nvidia/deepseek`, `/model/gemini/gemini 3.8`. Yazım hatalarına toleranslıdır. ★ = favori/en iyi.

## Komutlar
`/model` `/api` `/think` `/raphael` `/sohbet` `/agent` `/komutlar` `/log` `/onar` `/cd` `/ls` `/tree` `/cat` `/mkdir` `/rm` `/mv` `/cp` `/zip` `/unzip` `/find` `/grep` `/stats` `/export` `/ayarlar` `/help`

## Derleme
GitHub → **Actions** → **APK Derle** → **Run workflow**. Bitince **Releases** bölümünden `RaphaelCode.apk` indirilir.
