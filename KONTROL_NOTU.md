# Kabul kontrolü

## 25 Ekim 2026 — Gemini belge okuma adımı (sürüm 0.6.0)

Otomatik kontrol: `npm test` → **50 test, 50 başarılı, 0 başarısız** (önceki 35 + 15 yeni).

Yeni testlerin kapsamı:

- Örnek belgede 12 aylık elektrik satırı ayrı okunur; toplamı (1.350.000 kWh) kod hesaplar. Diğer 15 değer alıntısıyla birlikte metinde birebir doğrulanır.
- Onaylanan alanlar değiştirilmemiş motordan doğrulanmış sonucu yeniden üretir: 302.074,07 kWh; 554.561,67 TL; 9,74 ay.
- Fatura tutarı (TL) tüketim sayılmaz; üst ısıl değer alt ısıl değer yerine kullanılmaz; m³ birimi Sm³ teyidi ister; MWh→kWh ve kg→ton dönüşümünü kod yapar.
- Metinde bulunmayan veya değeri içermeyen alıntı “bulunamadı” işaretlenir ve önceden seçilmez. Eksik aylar toplanmaz ve yıllıklaştırılmaz.
- Yıllık dönem onayı, debi koşulu, geri kullanım uygunluğu ve NAICS önerisi hiçbir zaman önceden seçilmez; seçilmeyen öneri forma yazılmaz.
- Gemini isteği şemalı JSON ister, örnekleme parametresi göndermez, belge içindeki talimatları veri sayar. 404'te sonraki model, 400'de eski şema alanı denenir; tüm modeller yoksa erişilebilir Flash modeli bulunur. Anahtar yoksa 503, kota dolunca 429; anahtar yanıta sızmaz.
- Sunucuda tek yazma rotası `/api/extract`; `lib/` ve diğer sunucu dosyaları yayımlanmaz.

Tarayıcı kontrolü (Gemini yanıtı test verisiyle taklit edilerek): Belgeden doldurmayı dene → Gemini ile alanları çıkar → 24 öneri, 22'si metinde doğrulandı, 4 onay kullanıcıda → aktarım sonrası 9.165,9 MWh ve 996,3 kWh/ton; kondens 302,1 MWh, %3,3, 554.562 TL, 9,7 ay, 58,83 tCO₂; raporda veri kaynağı bölümü. Konsol hatası yok. 390 piksel genişlikte yatay taşma yok.

**Henüz yapılmadı:** gerçek Gemini çağrısıyla uçtan uca deneme (çalışma ortamından Google API'sine erişim kapalıydı). Vercel yayınından sonra gizli sekmede yapılmalı ve sonucu buraya eklenmeli.

## 23 Ekim 2026 — açıklamalı örnek ve hazırlık rehberi

Sürüm 0.5.0: **35 test, 35 başarılı, 0 başarısız**. Önceki 30 kontrole beş anlamlı yönlendirme kontrolü eklendi: tam örnek, buhar yok, buhar bilinmiyor, geri kullanım uygun değil ve eksik ölçüm/sıfır ayrımı.

Tarayıcıda doğrulananlar:

- Açıklamalı örnek 1 → 2 → 3: kaynak notu, gerçek hesap görünümü ve rapor yorumu.
- Örnek kaynak notu temsili olarak işaretli; otomatik belge okuma iddiası yok.
- Eksik ölçümlü Turgutlu'da dört hazırlık adımı. Uygunluk girilip hesap güncellendiğinde üç adım kalıyor.
- “İlgili alana git” gerekli bölümü açıp doğru girdiye odaklanıyor.
- Girdi değiştiğinde eski sonuç uyarısı ve rapor indirme kilidi korunuyor.
- Buharsız Menemen'de ana devam düğmesi rapora yönlendiriyor; kondens tasarrufu uydurulmuyor.
- Boş tesiste tüketim, enerji karşılığı, üretim ve sistem teyidi için hazırlık adımları; boş değerler sıfıra dönüşmüyor.
- Rapor; kısa sonuç, hesap koşulları, veri kökeni ve sonraki adımları öne çıkarıyor. Teknik kayıt kapalı ayrıntı bölümünde, metin/JSON çıktısında korunuyor.
- 390 piksel tarayıcı genişliğinde hazırlık listesi görsel kontrolü: sayfa genişliği 390 piksel, yatay taşma yok. Normal boyuta geri dönüldü.
- Son tarayıcı hata kaydı boş. Sunucu yalnız 127.0.0.1:4310 adresinde çalışıyor.

Ekranlar: proje kökündeki `evidence/yerel-aciklamali-ornek-2026-10-23.png` ve `evidence/yerel-rehber-mobil-2026-10-23.png`. Güncel masaüstü ekranı pakette `docs/Arayuz.png` olarak da bulunur. Fiziksel telefon ve gerçek PDF kaydetme işlemi bu kontrolde denenmedi. Model v1 ve hesap motoru değiştirilmedi; yeni Colab adayı bu sürüme entegre edilmedi.

## Önceki kayıt — 22 Ekim

22 Ekim 2026. Bu kayıt uygulama davranışını kapsar; saha etkisi doğrulaması değildir.

## Otomatik kontrol

Node.js ile `node --test tests/*.test.mjs`: **30 test, 30 başarılı, 0 başarısız**.

- 15 fizik hesabı, dönem, birim, eksik veri, emisyon ve senaryo sınırı testi.
- 11 model eşitliği, yıllık dönem, ekipman, eksik değer ve performans uyarısı testi.
- 3 Türkçe sayı ayrıştırma ve rapor sınırı testi.
- 1 yerel sunucu testi: yalnız public dosyaları; profil yükleme isteği kabul edilmez.

Eğitimden dışa aktarılan `model.json` ile yerel kopya aynıdır. SHA256:
`507c14e3999b7c0edbfaf2b3fd093c40317d9393a95fddf697348691b1332b9f`

## Tarayıcı kontrol sonuçları

| Akış | Beklenen davranış | Sonuç |
| --- | --- | --- |
| Turgutlu 2023 | Yıllık örnek; 5 aile uygunluk durumlarıyla erişilebilir | Doğrulandı |
| Kondens hesabı | Net 302.074,07 kWh; %3,30; 554.561,67 TL; 9,74 ay | Doğrulandı |
| Menemen aylık | 42.000 kWh; otomatik yıllıklaştırma ve model sırası yok | Doğrulandı |
| Buhar yok | Üç buhar ailesi sistem yok olarak ayrılır; kondens hesaplanmaz | Doğrulandı |
| Profil değişikliği | Eski sonuçlar güncel değil; rapor indirme kilitli | Doğrulandı |
| Geçersiz değer | Negatif tüketim için hata; eski hesap dışa aktarılmaz | Doğrulandı |
| Rapor | Son hesaplanan profil ve senaryo, model sınırları ve demo etiketi | Doğrulandı |
| Boş tesis | Bilinmeyen alanlar sıfır kabul edilmez; sahte sonuç yok | Doğrulandı |

Ek kontroller: model dosyası geçici olarak kullanılamaz hale getirildiğinde sıralama durdu, 302,1 MWh fizik sonucu çalışmaya devam etti. Dosya geri kondu ve model hash'i doğrulandı. Geçersiz kazan verimi yalnız senaryoyu durdurdu; geçerli tesis ve model güncellendi. Bu iki davranış tarayıcıdan doğrulandı.

JSON raporu gerçekten indirildi; dönem, model sürümü, beş aile ve sayısal sonuçları dosyadan kontrol edildi. Kanıt: `../gorev4-final-2026-10-22/evidence/yerel-demo-raporu.json`. Ekran: aynı klasörde `yerel-isimercek.png`.

Tarayıcıdan gerçek PDF yazdırma ve mobil boyut testi yapılmadı. Eski raporu yerel yazdırmada gizleyen CSS ve görünür güncellik uyarısı koddan denetlendi; uygulamanın indirme/yazdırma düğmelerinin kilitlenmesi tarayıcıda doğrulandı.

## Sade arayüz revizyonu

Kullanıcının tasarım geri bildirimi sonrasında yan menü kaldırıldı; üstte Tesis / Senaryo / Rapor adımları, özet kartı ve gerektiğinde açılan formlar kullanıldı. Yazılar, kontrol boyutları ve renk karşıtlığı iyileştirildi. Aylık örnek, boş tesis, negatif tüketim, rapor kilidi ve yıllık senaryo yeni tasarımda yeniden kontrol edildi. Beş inceleme alanı erişilebilir kaldı. Yeni ekran kanıtı: `../gorev4-final-2026-10-22/evidence/yerel-isimercek-sade-v2.png`.

## Değerlendirme sınırları

Model nDCG@3 0,8191; basit alt sektör karşılaştırması 0,8431. Bu yüzden sıralama deneysel gösterilir. Düşük sıra teknik eleme gerekçesi değildir. Türkiye saha doğrulaması yoktur.

Yerel sürüm Gemini çağrısı veya serbest metinden profil çıkarımı yapmaz. Önceki AI Studio kaynakları indirilmedi; arayüz mevcut yerel hesap ve model bileşenlerinin üzerine geliştirilmiştir. Çalışma adresi yalnız bu bilgisayara aittir; jüriye açık dağıtım ayrıca yapılmalıdır.
