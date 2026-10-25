# IsıMercek küçük model kartı

22 Ekim 2026 · Sürüm 1.0.0 · Araştırma prototipi

## Modelin yaptığı iş

Bu model, gerçek ITAC etütlerinden öğrenilmiş parametrelerle beş önlem ailesini geçmiş kayıtlardaki öneri benzerliği açısından sıralar. Çok etiketli, L2 düzenlemeli lojistik regresyon kullanır. Sıralama skoru, bir önlemin teknik uygunluk veya başarı olasılığı değildir; tasarruf hesabı yapmaz. Teknik uygunluk ve deterministik mühendislik hesabı ayrı katmanlardır.

**Performans değerlendirmesi:** İlk model, ayrılmış test kümesinde NAICS alt sektör sıklığı yönteminden daha zayıf kaldı. Bu nedenle model, başarısı doğrulanmış öneri ürünü olarak sunulamaz. Araştırma gösteriminde bütün aileler erişilebilir kalmalı; düşük sıradaki aileler gizlenmemeli veya elenmemelidir.

## Veri ve hedef

Kaynak: [ITAC resmî indirme](https://itac.university/download), ITAC_Database_20261007.xlsx. Arşiv parmak izleri ve aile seçme kuralı `data/provenance.json` / `prepare.py` içindedir. NAICS 311* ve 3121*, FY≥2000, pozitif yıllık elektrik tüketimi ve seçilen beş aileden en az birinin önerilmiş olması koşuluyla 1.081 etüt seçilmiştir. Dolayısıyla bu örneklem tüm gıda tesislerini temsil etmez; hedef ailelerin hiç önerilmediği tesislerde başarı ölçülmemiştir. Tavsiye edilmemiş bir önlem uygun değildir anlamına gelmez. Eğitim kaybı kayıtlı/kayıtlı değil ayrımını yalnız sıralama için bir vekil hedef olarak kullanır.

Birim dayanağı: [ITAC Database Manual v10.2](https://itac.university/file/technical/IAC_DatabaseManualv10.2.pdf), yıllık enerji/fatura tanımı s.17 ve enerji kodları s.22–23. EC saha elektrik kullanımı kWh, E2 doğal gaz kullanımı MMBtu, PRODHOURS yıllık üretim saatidir. Bu model E2 miktarını enerjiye çevirmeden yalnız gaz var/yok/bilinmiyor göstergesine dönüştürür. Aile kapsamı [ARC List v21.1](https://itac.university/file/technical/ARC%20List%20-%20V21.1.pdf) kodlarına dayanır.

Aileler: basınçlı hava ve inert gaz kaçakları (ARC 2.4236), buhar kapanı ve kaçak kontrolü (2.2113/2.2135), buhar ve kondens hattı yalıtımı (2.2136/2.2122), kondens geri kazanımı (2.2121), soğutma sistemleri (2.262* / 2.2694). Bu sınırlı ARC kapsamı tüm enerji önlemlerini kapsamaz. Uygulama durumu, ölçülmüş tasarruf etiketi olarak kullanılmamıştır.

## Girdiler ve sızıntı kontrolü

Yıllık elektrik (kWh), yıllık çalışma saati, çalışan sayısı, gaz tüketimi varlığı ve NAICS dört haneli alt sektör. İlk üç sayıya log1p, eğitim medyanıyla eksik doldurma ve eğitim ortalama/standart sapmasıyla ölçekleme uygulanır; eksiklik göstergeleri korunur. NAICS kategorileri yalnız eğitimden öğrenilir. Gaz bilinmiyorsa ayrı eksik göstergesi vardır. ID, yıl, ürün metni, öneri metni, maliyet ve tasarruf girdiye girmez. Toplam 19 özellik; 100 öğrenilmiş katsayı.

Eğitim: FY 2002–2018 (751 etüt). Doğrulama: FY 2019–2022 (151 etüt). Test: FY 2023–2026 (179 etüt). FY, etüdün mali yılıdır; tam takvim yılı etiketi değildir. L2 seçenekleri 0.0001/0.001/0.01/0.1/1.0 arasından doğrulama nDCG@3 ile seçildi; seçilen L2=1.0. Eşitlikte recall@3, ardından daha güçlü düzenleme kullanıldı. Ön işleme ve model eğitim kümesine uyarlanmış halde bırakıldı; doğrulama ile yeniden eğitim yapılmadı. Test kümesi seçim tamamlandıktan sonra değerlendirildi; test sonucu yeni ayar seçmek için kullanılmadı. NAICS sıklık karşılaştırmasının yumuşatma katsayısı da yalnız doğrulamadan seçildi (100).

## Zamansal test sonucu

| Yöntem | Recall@3 | nDCG@3 |
| --- | ---: | ---: |
| learned_logistic | 87.43% | 0.8191 |
| global_prevalence | 87.15% | 0.8177 |
| naics_frequency | 91.53% | 0.8431 |

Recall@3 her etütte kayıtlı ailelerin ilk üçte yakalanan payının ortalamasıdır. nDCG@3 kayıtlı ailelerin sırasını da değerlendirir. Bunlar mühendislik uygunluğu veya saha etkisi ölçütleri değildir. Toplam beş aileden üçünü seçmek ve yaygın basınçlı hava etiketi, basit sıklık tabanlarının güçlü olmasını sağlar.

NAICS sıklık tabanı bu testte daha iyi sonuç vermiştir; model farkının %95 bootstrap aralığı bütünüyle sıfırın altındadır. Model eksi NAICS nDCG@3 farkı -0.0240; 4.000 eşlenmiş bootstrap tekrarında %95 aralık [-0.0461, -0.0028]. Tam ölçütler, aile bazında destek/recall ve karşılaştırmalı aralıklar `evaluation.json` içindedir. Aralıklar etüt düzeyindedir; aynı firma veya merkez kümelenmesini hesaba katmaz.

Nadir etiketlerde zayıflık belirgindir: testteki 8 kondens kaydının hiçbiri ve 30 buhar kapanı/kaçak kaydının yalnız 1'i modelin ilk üçüne girmiştir. Bu yüzden genel recall değeri, bütün ailelerde başarı gibi okunmamalıdır. Mühendislik uygunluğu ayrı kontrol edilmeli ve kondens hesabı modelin ilk üçte seçmesine bağlanmamalıdır.

## Sınırlar ve doğru sunum

- ABD'deki tarihsel etüt önerileri Türkiye'ye aktarım başarısını kanıtlamaz. Türkiye'de uzman değerlendirmesi veya saha tasarrufu doğrulanmadı.
- Benzersiz etüt kimlikleriyle ayrım yapıldı. Kurum/tesis kimliği bulunmadığı için farklı yıllardaki aynı firmalar güvenle gruplanamaz. Tam özellik örtüşme sayıları: {"train_validation_exact_feature_overlap": 0, "train_test_exact_feature_overlap": 0, "validation_test_exact_feature_overlap": 0}. Sıfır örtüşme, farklı fiziksel tesisler garantisi değildir.
- Geçmiş öneriler uzman tercihleri, kayıt süreçleri, veri yaşı ve seçilim etkileri taşır. Eksik etiketler gerçek negatif değildir; düşük skor önlemi elemek için yeterli olmaz.
- Buhar yoksa ilgili aileler uygulamanın uygunluk kapısında elenir. Bilinmeyen ekipman için ölçüm/teyit istenir. Model tesisin ekipman varlığını veya güvenli kondens uygunluğunu belirlemez.
- Etütlerdeki yıllık elektrik girdisiyle eğitildi. Aylık veri yıllık diye girilmemeli. Kapsam dışı sektör, geçersiz/çok eksik veya eğitim aralığından uzak veri uygulamada açıkça işaretlenmeli.
- Skorlar kalibre edilmiş olasılık değildir; yüzde başarı ya da doğruluk diye gösterilmemeli. Ürün tanımı: “Açık etüt verisinden eğitilmiş, inceleme sırasına yardımcı küçük model.”
- Kanıtlanmış kullanıcı zaman kazancı, ödeme isteği ve enerji/emisyon azaltımı yoktur. Ön-etüt hazırlık süresinde %20 azalma hâlâ pilot hedefidir.

## Yeniden üretim ve entegrasyon

`python3 ml/train.py` (Python + NumPy) tüm çıktıları yeniden üretir. Rastgelelik yalnız bootstrap'tadır (seed=271828); eğitim deterministiktir. Veri SHA256: `067921c711d068f7f0ea9f0a2dac4e3de4d11f73e952acfbb28393334dad8cc2`.

`public/model.json` ön işleme ve öğrenilmiş ağırlıkları içerir; haricî model/API olmadan JavaScript ile çalıştırılabilir. Skor = sigmoid(intercept + ağırlık·özellik). Ön işleme sırası `preprocessing.featureNames` ile sabittir. `ml/parity_cases.json` Python–JavaScript eşitlik kontrolü için sayısal örnekler içerir. Bunların içinde geçersiz/kapsam dışı girdiler de vardır; yalnız dönüştürme tutarlılığı testidir, kullanıcıya öneri izni değildir.
