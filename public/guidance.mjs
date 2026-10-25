// Deterministic preparation guidance; no generated measurements or suitability claims.
const missing = value => value === null || value === undefined;

export function preparationSteps(report) {
  const p = report.profile || {}, s = report.scenarioInput || {}, result = report.scenario || {};
  const steps = [];
  const add = (id, title, body, target, view = 'analiz') => steps.push({id, title, body, target, view});
  if (missing(p.electricityKWh) || missing(p.gasSm3)) add('bills', 'Aynı dönemin tüketimlerini toplayın', 'Elektrik faturalarındaki kWh ve doğal gaz faturalarındaki Sm³ değerlerini aynı dönem için toplayın. Fatura tutarını tüketim yerine yazmayın. Gaz kullanılmadığını biliyorsanız 0 girin.', missing(p.electricityKWh) ? 'electricity' : 'gas');
  if (p.gasSm3 !== 0 && missing(p.gasLhvKWhPerSm3)) add('lhv', 'Gazın enerji karşılığını doğrulayın', 'Alt ısıl değeri kWh/Sm³ birimiyle, tedarikçi bilgisinden veya enerji uzmanından alın. Üst ve alt ısıl değeri birbirinin yerine kullanmayın.', 'lhv');
  if (missing(p.productionTon) || p.productionTon === 0) add('production', 'Dönemin üretim miktarını bulun', 'Üretim kayıtlarındaki toplam tonu, tüketimle aynı tarih aralığı için girin. Üretim bilinmiyorsa veya sıfırsa ton başına enerji hesaplanmaz.', 'production');
  if (!p.equipment || p.equipment.steam === 'unknown') {
    add('steam', 'Tesiste buhar sistemi var mı?', 'Bakım sorumlusundan veya ekipman listesinden öğrenin. Doğal gaz kullanılması tek başına buhar sistemi bulunduğu anlamına gelmez.', 'steam');
    return steps;
  }
  if (p.equipment.steam === 'absent' || s.reuseSuitable === false) return steps;
  if (s.reuseSuitable !== true) add('reuse', 'Sıcak suyun geri kullanılabilirliğini doğrulatın', 'Kondens, buharın yoğuşmasıyla oluşan sıcak sudur. Bakım veya enerji uzmanı; su kalitesini, kirlenme riskini ve dönüş hattını kontrol ederek geri kullanım uygunluğunu belirlemeli.', 'reuse-suitable', 'senaryo');
  if (missing(s.additionalLiquidFlowKgPerHour) || s.flowBasis !== 'additional-liquid-at-receiver') add('flow', 'Geri dönebilecek ek su miktarını ölçtürün', 'Tank girişine ulaşan, bugün geri kazanılmayan sıvı miktarı gerekir (kg/saat). Toplam buhar üretimini yazmayın. Ölçümü ve hat kayıplarını bakım/enerji uzmanıyla doğrulayın; bilmiyorsanız boş bırakın.', 'flow', 'senaryo');
  if (missing(s.returnTemperatureC) || missing(s.makeupTemperatureC)) add('temperature', 'İki su sıcaklığını kaydedin', 'Aynı çalışma koşulunda tank girişindeki kondens ile taze besleme suyunun sıcaklığını ölçtürün. Dönüş suyu daha sıcak değilse bu senaryo ısı kazancı sağlayamaz.', missing(s.returnTemperatureC) ? 'return-temp' : 'makeup-temp', 'senaryo');
  if (missing(s.operatingHours) || missing(s.boilerEfficiencyLhv)) add('operation', 'Çalışma süresi ve kazan verimini bulun', 'Geri kazanımın gerçekten devrede olacağı dönem saatini işletme kayıtlarından alın. Kazanın alt ısıl değere göre verimini ölçüm veya teknik raporla doğrulayın.', missing(s.operatingHours) ? 'scenario-hours' : 'efficiency', 'senaryo');
  if (missing(s.additionalElectricityKWh)) add('electricity', 'Ek pompa tüketimini belirleyin', 'Yeni pompa ve yardımcı cihazların aynı dönemdeki ek elektrik tüketimi gerekir. Bilinmeyen tüketimi 0 saymayın; net enerji sonucu bu bilgiyle tamamlanır.', 'aux-electricity', 'senaryo');
  if (missing(s.gasPriceTlPerSm3) || missing(s.electricityPriceTlPerKWh) || missing(s.additionalOperatingCostTl) || missing(s.investmentTl)) add('cost', 'Maliyet hesabını teklif ve faturayla tamamlayın', 'Gaz/elektrik birim fiyatlarını, ek işletme giderini ve yatırım teklifini girin. Bu bilgiler eksikken parasal tasarruf veya geri ödeme sonucu tamamlanamaz.', missing(s.gasPriceTlPerSm3) ? 'gas-price' : missing(s.electricityPriceTlPerKWh) ? 'electricity-price' : missing(s.additionalOperatingCostTl) ? 'operating-cost' : 'investment', 'senaryo');
  if (result.status === 'blocked' && steps.length === 0) add('check', 'Senaryodaki çelişkiyi giderin', 'Senaryo ekranındaki açıklamayı kontrol edin. Sıcaklık, dönem veya debi bilgileri birbiriyle uyuşmadığında hesap tamamlanmaz.', 'flow', 'senaryo');
  return steps;
}

export function scenarioRoute(report) {
  const p = report.profile || {}, s = report.scenario || {};
  if (p.equipment?.steam === 'absent') return {title:'Bu tesiste kondens hesabı yapılmaz.', body:'Buhar sistemi yok. Soğutma ve diğer inceleme alanlarını değerlendirin; raporda bu sınırı ve mevcut enerji özetini paylaşabilirsiniz.', action:'Sınırı ve raporu gör', view:'rapor'};
  if (report.scenarioInput?.reuseSuitable === false) return {title:'Geri kullanım uygun bulunmadı.', body:'Bu koşulda kondens tasarrufu hesaplanmaz. Uygunluk nedenini uzmanla değerlendirin ve diğer inceleme alanlarına bakın.', action:'Ön inceleme raporuna geç', view:'rapor'};
  if (s.status !== 'calculated') return {title:'Önce kondens için gerekli bilgileri tamamlayın.', body:'Bu sürümde ayrıntılı hesap kondens geri kazanımı için var. Model sırası ayrı bir inceleme ipucudur; hesap için buhar, geri kullanım ve ölçüm koşulları gerekir.', action:'Eksik bilgileri incele', view:'senaryo'};
  return {title:'Neden kondens senaryosuna geçiyoruz?', body:'Bu sürümün ayrıntılı hesabı kondens geri kazanımı için hazır ve girilen koşullar hesap yapmaya izin veriyor. Modelde ilk sırada olması gerekmiyor; en iyi yatırım olduğu da söylenmiyor.', action:'Kondens hesabını incele', view:'senaryo'};
}
