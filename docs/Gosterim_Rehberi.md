# IsıMercek — gösterim rehberi

25 Ekim 2026, sürüm 0.6.0.

## İki dakikalık canlı demo akışı

1. **Belgeden doldurmayı dene** düğmesine basın. Form temizlenir ve temsili 2023 enerji dosyası metin alanına gelir (12 aylık elektrik faturası, doğal gaz dökümü, üretim kaydı, kazan dairesi notu). Belgenin temsili olduğunu söyleyin.
2. **Gemini ile alanları çıkar** düğmesine basın. Beklerken anlatın: Gemini yalnız belgede yazanı okuyor; değer, birim ve kaynak satırı.
3. **Onay ekranı:** Elektriği Gemini 12 ayrı satır olarak okudu, toplamı (1.350.000 kWh) uygulama hesapladı. Yeşil “Metinde bulundu” etiketi, alıntının belgede birebir geçtiğini gösterir. Uyarılarda fatura tutarının tüketim sayılmadığını ve üst ısıl değerin kullanılmadığını gösterin.
4. Onay satırlarını işaretleyin: yıllık dönem, debi koşulu, geri kullanım uygunluğu, NAICS önerisi. **CO₂ için Task 1 emisyon katsayılarını kullan** kutusunu seçin. **Seçilen alanları forma aktar.**
5. **Tesis:** 9.165,9 MWh/yıl ve 996,3 kWh/ton. Beş inceleme alanının sırası deneyseldir; model basit karşılaştırmayı geçmedi. **Kondens hesabını incele.**
6. **Senaryo:** 302,1 MWh/yıl (%3,3), 554.562 TL/yıl, 9,7 ay geri ödeme, 58,83 tCO₂/yıl. Altındaki **uygulama planı** bu tesise özeldir: 15 ay sınırı için sahada en az 675 kg/saat ek debi ve 60,5 °C dönüş sıcaklığı gerekir, teklif 693.202 TL'yi aşmamalı; tesis ≈ 788 TEP ile yükümlülük dışında, uygun destek TÜBİTAK 1831.
7. **Rapor:** “Veriler nereden geliyor?” bölümünde hangi alanın Gemini’den geldiği ve kaç alıntının doğrulandığı görünür; sonraki saha adımları listelenir.

## Gemini’ye ulaşılamazsa

Uygulama çalışmaya devam eder. **Açıklamalı örneği aç** aynı temsili tesisi hazır verilerle üç adımda gösterir. **Ölçümler eksikse?** ve **Buhar sistemi yoksa?** örnekleri hesap sınırlarını gösterir.

## Doğru anlatım

“IsıMercek, enerji uzmanının ilk turdaki en uzun işini, yani belgelerden veriyi toplamayı hızlandırır. Gemini okur, kod doğrular ve hesaplar, uzman onaylar. Önlem sıralaması deneyseldir; sayısal etki test edilmiş mühendislik hesabından gelir.”

Söylenmemesi gerekenler: “Gemini tasarrufu hesaplıyor”, “model doğru önlemi seçiyor”, “sonuçlar sahada doğrulandı”. Örnek belge ve tesis temsilidir; Türkiye’de saha pilotu henüz yapılmadı.
