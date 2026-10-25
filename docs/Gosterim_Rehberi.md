# IsıMercek — kısa gösterim rehberi

23 Ekim 2026, yerel sürüm 0.5.0.

## İlk gösterim

1. Uygulamayı açın ve **Açıklamalı örneği aç** düğmesine basın. Hazır örnek mevcut formu temsili verilerle yeniden doldurur.
2. **Önce tesisin hikâyesi:** Bir yıllık elektrik, doğal gaz ve üretim kayıtlarını aynı dönemde birleştirdiğimizi anlatın. Ekrandaki kaynak notunun gerçek fatura olmadığını belirtin. “Formdaki karşılığını gör” ile değerlerin girildiği alanı gösterebilirsiniz.
3. **Kondens örneğine geç:** Kondensin buhardan yeniden oluşan sıcak su olduğunu açıklayın. Tank girişindeki 1.000 kg/saat ek su, 80 °C dönüş, 20 °C taze su ve 4.000 saat, bu örneğin varsayımlarıdır. Net enerji sonucu yaklaşık 302,1 MWh/yıl; örnek fiyatlarla net dönem tasarrufu yaklaşık 554.562 TL/yıldır. Bunlar gerçekleşmiş saha sonuçları değildir.
4. **Raporu yorumla:** %3,3 değerinin başlangıçtaki toplam enerjinin hesaplanan azaltım payı olduğunu gösterin. Rapordaki koşulları ve saha doğrulaması için sonraki adımı görün.

## Karmaşık durumda ne oluyor?

- **Ölçümler eksikse ne olur?** düğmesi, aynı tesisin ölçümleri eksik örneğini açar. Uygunluk, debi, sıcaklık ve ek elektrik için yapılacaklar listesi gelir. “İlgili alana git” doğru formu açar. Bilgi girilip analiz güncellenince tamamlanan ihtiyaç listeden çıkar.
- **Bir örnekle dene → Buhar sistemi yoksa?**: Menemen örneğinde kondens hesabı yapılmaz. Devam düğmesi kapsamı açıklayan rapora götürür. Aylık veri yıllıklaştırılmaz.
- **Kendi tesisim:** Hazır sayılar kaldırılır. Önce aynı dönemin faturaları ve üretim kaydı hazırlanır. Alanlar bilinmiyorsa boş bırakılır; doğrulanmış sıfır ayrıca 0 olarak girilir.

## Gösterimde kullanılacak doğru anlatım

“IsıMercek, enerji ön incelemesi için hangi bilgiyi toplamamız gerektiğini gösteriyor. Eğitilmiş deneysel model inceleme alanlarını sıralıyor; kondens potansiyeli ayrı mühendislik hesabıyla bulunuyor. Hesabın girdileri, eksikleri ve doğrulanacak koşulları raporda bir araya getiriliyor.”

Bu sürüm belge yükleyip okumaz, kaynak belgeleri doğrulamaz veya serbest konuşmayla veri toplamaz. Hazır not ve yönlendirmeler bu eksikliği açıklayarak kullanım yolunu gösterir. Modelin basit sektör karşılaştırmasını geçemediği ve Türkiye'de saha doğrulaması olmadığı gizlenmez.

## Yeniden düzenlenen öncelikler

1. **Tamamlandı — anlaşılır kullanım:** Üç adımlı örnek, eksik ölçüm ve buharsız tesis örnekleri, ilgili alana yönlendirme, kısa sonuç ve sonraki adımlar raporu.
2. **Final için sırada — bağımsız gösterim:** Herkese açık bağlantı ve dışarıdan deneme; PDF kaydetme kontrolü; gerçek etkileşim videosu; final belgelerini son sürümle eşleştirme.
3. **İlk ürün vaadini tamamlamak için — belge iş akışı:** Desteklenen bir belge türünden değer çıkarma, kaynağı gösterme, uzman düzeltme/onayı ve eksik bilgi takibi. Rehber bu özelliğin yerine “yapılmış” sayılmaz.
4. **Araştırma — model geliştirme:** Yeni aday yalnız uygun karşılaştırma ve uygulama uyumluluğu kontrolünden sonra ele alınmalı. Daha fazla eğitim, kullanım akışındaki eksikleri tek başına çözmez.

Yerel adres yalnız bu bilgisayardan kullanılabilir; jüriye gönderilecek yayımlanmış ürün bağlantısı değildir.
