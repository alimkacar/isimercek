// Belgeden doldurma adımının tarayıcı tarafı: temsili örnek belge ve onaylanan alanların forma aktarım planı.
// Gemini çağrısı sunucudaki /api/extract üzerinden yapılır; bu dosya ağ, hesap veya karar içermez.

export const SAMPLE_DOCUMENT = `TEMSİLİ ÖRNEK BELGE — gerçek bir işletmeye ait değildir; IsıMercek gösterimi için hazırlanmıştır.

Turgutlu Temsili Konserve Tesisi — 2023 yılı enerji dosyası (domates salçası ve sebze konservesi)

ELEKTRİK FATURALARI (OG abone, 2023)
Ocak 2023: 82.000 kWh — fatura tutarı 336.200 TL
Şubat 2023: 78.000 kWh
Mart 2023: 86.000 kWh
Nisan 2023: 90.000 kWh
Mayıs 2023: 98.000 kWh
Haziran 2023: 118.000 kWh
Temmuz 2023: 165.000 kWh
Ağustos 2023: 182.000 kWh — fatura tutarı 764.400 TL
Eylül 2023: 160.000 kWh
Ekim 2023: 112.000 kWh
Kasım 2023: 93.000 kWh
Aralık 2023: 86.000 kWh
Ortalama elektrik birim fiyatı (2023): 4,2 TL/kWh

DOĞAL GAZ (dağıtım şirketinin yıllık tüketim dökümü)
2023 yılı toplam tüketim: 815.000 Sm³
Faturadaki ortalama üst ısıl değer: 10,64 kWh/Sm³
Tedarikçinin teknik yazısına göre alt ısıl değer: 9,59 kWh/Sm³
Ortalama doğal gaz birim fiyatı (2023): 18,5 TL/Sm³

ÜRETİM KAYDI
2023 toplam üretim: 9.200 ton
2023 çalışma süresi: 4.000 saat
Çalışan sayısı: 85 kişi

KAZAN DAİRESİ VE SAHA NOTU (bakım şefi görüşmesi, Eylül 2023)
- Buhar kazanı var; sterilizasyon ve pişirme hatları buharla çalışıyor.
- Kompresör var; dolum hattındaki pnömatik ekipmanı besliyor.
- Soğuk depo hakkında bilgi alınmadı.
- Kondens tankı girişinde, flash ve hat kayıpları sonrasında ek olarak geri döndürülebilecek sıvı debisi 1.000 kg/saat ölçüldü.
- Kondens dönüş sıcaklığı 80 °C, taze besleme suyu 20 °C.
- Geri kazanımın devrede olacağı süre: yılda 4.000 saat.
- Kazan verimi (alt ısıl değere göre, baca gazı analizi): %90.
- Kondens pompası ek elektrik tüketimi: yılda 8.000 kWh. Ek bakım gideri: yılda 10.000 TL.
- Kondens geri dönüş hattı için tedarikçi teklifi: 450.000 TL.
- Enerji uzmanı değerlendirmesi: kondensin kazana geri kullanımı uygun; kirlenme riski görülmedi.`;

const NUMBER_KINDS = new Set(['number']);

/**
 * Onaylanan alanlar için forma uygulanacak işlemleri üretir.
 * Seçilmemiş alanlar hiçbir zaman forma yazılmaz.
 */
export function planActions(fields, selectedIds) {
  const selected = new Set(selectedIds);
  const actions = [];
  for (const field of fields || []) {
    if (!selected.has(field.id)) continue;
    if (field.kind === 'period') {
      actions.push({ target: 'period-kind', type: 'value', value: field.value.kind },
        { target: 'period-start', type: 'value', value: field.value.start },
        { target: 'period-end', type: 'value', value: field.value.end });
    } else if (NUMBER_KINDS.has(field.kind)) {
      if (typeof field.value === 'number' && Number.isFinite(field.value)) actions.push({ target: field.target, type: 'number', value: field.value });
    } else if (field.target === 'annual-confirmation' || field.target === 'flow-confirmation') {
      actions.push({ target: field.target, type: 'checkbox', value: field.value === true });
    } else if (typeof field.value === 'string') {
      actions.push({ target: field.target, type: 'value', value: field.value });
    }
  }
  return actions;
}

/** Rapor için kaynak kaydı: hangi alan Gemini'den geldi ve kullanıcı tarafından onaylandı. */
export function provenanceRecord(result, selectedIds, isSample) {
  const selected = new Set(selectedIds);
  return {
    method: 'Gemini belge okuma + kullanıcı onayı', model: result.model || null, sample: Boolean(isSample),
    at: new Date().toISOString(),
    accepted: (result.fields || []).filter(field => selected.has(field.id)).map(field => ({ id: field.id, label: field.label, display: field.display, grounded: field.grounded, derivation: field.derivation })),
    rejected: (result.fields || []).filter(field => !selected.has(field.id)).map(field => field.label)
  };
}
