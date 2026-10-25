# IsıMercek

IsıMercek, Manisa ve Ege'deki gıda-içecek KOBİ'lerinde enerji ön incelemesinin ilk turunu hızlandırmak için geliştirilen bir prototiptir. Faturadan ve saha notundan tesis profilini çıkarır, önlem ailelerini gerçek etüt verisiyle sıralar ve kondens geri kazanımı için enerji, maliyet, geri ödeme ve CO₂ etkisini hesaplar. Siemens × YGA × UP School Climathon, Görev 4 final ürünüdür.

## Ürün ne yapıyor?

1. **Belgeden doldur (Gemini):** Kullanıcı fatura satırlarını, tüketim dökümünü veya saha notunu yapıştırır ya da PDF/görsel ekler. Gemini yalnız belgede yazanı okur: değer, birim ve kaynak alıntısı.
2. **Kod doğrular:** IsıMercek sayıyı Türkçe biçimle ayrıştırır, birimi dönüştürür, 12 aylık satırı toplar, alıntının metinde birebir geçip geçmediğini kontrol eder. Fatura tutarı (TL) tüketim sayılmaz; üst ısıl değer alt ısıl değer yerine kullanılmaz.
3. **İnsan onaylar:** Hiçbir değer onaysız forma girmez. Yıllık dönem, debi koşulu, geri kullanım uygunluğu ve NAICS önerisi her zaman kullanıcı onayı ister.
4. **Deneysel sıralama:** ABD ITAC etütlerinden (751 eğitim / 151 doğrulama / 179 test) eğitilmiş küçük lojistik regresyon, beş önlem ailesine inceleme sırası verir. Model, basit alt sektör sıklığı karşılaştırmasını geçemediği için deneysel gösterilir (nDCG@3 0,8191 / 0,8431).
5. **Mühendislik hesabı:** Kondens geri kazanımı; enerji, TL, geri ödeme ve CO₂ sonuçları modelden bağımsız, test edilmiş fonksiyonlarla hesaplanır.
6. **Rapor:** Girdiler, varsayımlar, veri kaynağı (hangi alan Gemini'den geldi, hangisi doğrulandı) ve sonraki saha adımları tek raporda; JSON/metin indirilebilir.

Gemini hesap, sıralama veya karar üretmez. Bu ayrım bilinçlidir: dil modelleri enerji yatırımı kararlarında tutarsızdır (Shu ve Zhao, 2025); değeri, uzman emeğinin en çok gittiği veri toplama işini otomatikleştirmektir.

## Hızlı deneme (jüri için)

1. Ana sayfada **Belgeden doldurmayı dene** düğmesine basın. Temsili bir 2023 enerji dosyası yüklenir.
2. **Gemini ile alanları çıkar** düğmesine basın. Önerilen alanlar kaynak alıntıları ve “Metinde bulundu” kontrolüyle listelenir.
3. Onay satırlarını (yıllık dönem, debi koşulu, geri kullanım, NAICS) okuyup işaretleyin, isterseniz CO₂ kutusunu seçin ve **Seçilen alanları forma aktar** deyin.
4. Analiz, Senaryo ve Rapor adımlarında sonuçları görün. Temsili dosyayla beklenen sonuç: 9.165,9 MWh/yıl, 996,3 kWh/ton; kondens senaryosunda 302,1 MWh/yıl (%3,3), 554.562 TL/yıl, 9,7 ay geri ödeme, 58,83 tCO₂/yıl.

Gemini'ye ulaşılamazsa (kota, anahtar) uygulamanın geri kalanı çalışır: **Açıklamalı örneği aç** aynı temsili tesisi hazır verilerle gösterir.

Örnek belge ve tesis verileri temsilidir; gerçek işletme ölçümü veya gerçekleşmiş tasarruf değildir. Türkiye'de saha doğrulaması henüz yapılmadı.

## Yayın (Vercel + GitHub)

Statik arayüz `public/`, sunucu fonksiyonu `api/extract.js`, ortak çıkarım kodu `lib/extract-core.mjs` içindedir. Ek npm paketi yoktur.

1. Bu klasörü GitHub'a gönderin (ör. `gh repo create isimercek --public --source=. --push`).
2. Vercel → **Add New… → Project** → depoyu içe aktarın. Framework: **Other**. `vercel.json` çıktı klasörünü (`public`) ve fonksiyon süresini ayarlar.
3. **Settings → Environment Variables:** `GEMINI_API_KEY` (Google AI Studio anahtarı). İsteğe bağlı `GEMINI_MODEL`. Değişkenden sonra yeniden dağıtın.
4. Kontrol: `https://<proje>.vercel.app/api/extract` adresi `{"configured":true}` döndürmeli. Ardından gizli sekmede uçtan uca deneyin.

Anahtar yalnız sunucu ortam değişkenindedir; tarayıcıya ve GitHub'a gitmez. Maliyet koruması: `/api/extract` başka sitelerden gelen tarayıcı isteklerini reddeder (Origin kontrolü) ve IP başına 10 dakikada 20, sunucu örneği başına saatte 300 çıkarımla sınırlıdır. Ücretli API kullanılıyorsa asıl üst sınır Gemini tarafında küçük bir ön ödeme bakiyesidir. Varsayılan model sırası hız için `gemini-3.5-flash-lite → gemini-3.8-flash → gemini-flash-latest`; istekler düşük düşünme düzeyiyle (`thinkingLevel: low`) gönderilir, bir model 22 saniyede yanıt vermezse sıradakine geçilir; hiçbiri bulunamazsa hesapta erişilebilir bir Flash modeli otomatik seçilir. Başarılı yanıt, hangi modelin kaç saniyede yanıt verdiğini `diagnostics` alanında gösterir.

## Yerel çalıştırma

Node.js 20 veya üzeri gerekir. `npm start` → <http://127.0.0.1:4310>. Belgeden doldurma için `.env.example` dosyasını `.env` olarak kopyalayıp `GEMINI_API_KEY` girin; `.env` git'e girmez. Anahtar yoksa uygulama çalışır, yalnız belgeden doldurma kapalı kalır.

## Kontroller

`npm test`: 52 otomatik test (hesap motoru, model eşitliği, giriş kontrolleri, çıkarım doğrulaması, model/şema yedekleri, sunucu rotaları). Örnek belgeden onaylanan alanların, doğrulanmış Turgutlu sonucunu (302.074,07 kWh; 554.561,67 TL; 9,74 ay) değiştirilmemiş motordan yeniden ürettiği test edilir. Ayrıntı: `KONTROL_NOTU.md`.

Model ve veri: `ml/model_card.md`, `ml/evaluation.json`, `ml/data/provenance.json`; eğitim `python3 ml/train.py` (Python + NumPy) ile yeniden üretilebilir.

## Eşleşmeler

Ana: SDG 7.3 (enerji verimliliği). Destekleyici: SDG 13 ve SDG 9.4. Gösterim akışı: `docs/Gosterim_Rehberi.md`.
