# Modeli inceleme ve yeniden üretme

Bu klasörde gerçek ITAC etütlerinden seçilmiş 1.081 kayıt, kullanılan eğitim kodu ve değerlendirme belgeleri bulunur. Veriler ABD'deki tarihsel etütlere aittir; Türkiye saha verisi olarak sunulmaz.

- `data/food_assessments.json`: hazırlanmış kayıtlar ve kaydedilmiş öneri aileleri.
- `data/provenance.json`: veri kaynağı, seçim koşulları ve dosya özeti.
- `train.py`: NumPy ile eğitim ve değerlendirme.
- `splits.json`: eğitim/doğrulama/test dönem ayrımı.
- `evaluation.json`: model ve basit karşılaştırmaların sonuçları.
- `model_card.md`: kapsam ve sınırlamalar.
- `parity_cases.json`: Python çıktısını tarayıcıdaki JavaScript hesabıyla karşılaştırmak için örnekler.

Python ve NumPy kurulu bir ortamda proje klasöründen `python3 ml/train.py` çalıştırılabilir. Bu işlem `public/model.json` ile model değerlendirme dosyalarını yeniden yazar; farklı bir denemeye başlamadan önce klasörün kopyası üzerinde çalışın. Arayüzü açmak için eğitim yapmak gerekmez.

Bu pakette ham ITAC Excel arşivi ve ham veriyi seçme betiği yoktur. İlk veri hazırlığı, aynı çalışma alanındaki `../isimercek-app/ml/prepare.py` ile yapıldı. Seçilmiş kayıt dosyası ve veri kökeni kaydı, mevcut modelin nasıl eğitildiğinin incelenmesi için korunmuştur.

Test kümesi model seçimine dahil edilmedi. Model zamansal testte alt sektör sıklığı karşılaştırmasını geçemedi; yeni denemeleri bu ayrılmış test sonucuna göre tekrar tekrar seçmek doğrulama gücünü azaltır. Üründeki sürüm deneysel olarak tutulur ve bütün beş öneri ailesi erişilebilir kalır.
