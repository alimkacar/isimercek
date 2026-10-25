// Tesise özel uygulama planı: yükümlülük ve destek durumu, kondens önlemi için karar eşikleri,
// finansman yolu ve izleme hedefleri. Tüm sayılar tesisin kendi girdilerinden hesaplanır; ağ veya AI çağrısı yoktur.

// Enerji Kaynaklarının ve Enerjinin Kullanımında Verimliliğin Artırılmasına Dair Yönetmelik, Ek-2 katsayıları
export const TEP_PER_KWH = 0.000086;     // 860 kcal/kWh
export const TEP_PER_SM3_GAS = 0.000825; // 8.250 kcal/Sm³
export const TEP_THRESHOLD = 1000;
export const REFERENCE_PAYBACK_MONTHS = 15; // Task 1: KOBİ'lerin çoğu ≤ 15 ay geri ödeme istiyor (Anderson ve Newell)
export const GAS_PRICE_HIKE_PCT = 18.61; // Nisan 2026 sanayi doğal gazı ortalama zammı (EPDK/BOTAŞ)
const WATER_CP = 4.186;

const known = value => typeof value === 'number' && Number.isFinite(value);
const fmt = (value, digits = 0) => known(value) ? value.toLocaleString('tr-TR', { maximumFractionDigits: digits }) : '—';
const ceilTo = (value, step) => Math.ceil(value / step) * step;

/** Yıllık TEP ve 1.000 TEP eşiğine göre yükümlülük / destek durumu. */
export function energyStatus(report) {
  const p = report?.profile || {};
  if (p.period?.kind !== 'year' || !known(p.electricityKWh) || !known(p.gasSm3))
    return { status: 'unknown', tep: null, title: 'Yükümlülük durumu için tam yıllık tüketim gerekli.',
      points: ['Aynı takvim yılının elektrik (kWh) ve doğal gaz (Sm³) tüketimi girildiğinde tesisin TEP değeri ve 1.000 TEP eşiğine göre destek yolu hesaplanır.'] };
  const tep = p.electricityKWh * TEP_PER_KWH + p.gasSm3 * TEP_PER_SM3_GAS;
  if (tep < TEP_THRESHOLD) return { status: 'below', tep,
    title: `Yıllık ≈ ${fmt(tep)} TEP: 1.000 TEP eşiğinin altında.`,
    points: [
      `Yönetmelik katsayılarıyla (elektrik 860 kcal/kWh, doğal gaz 8.250 kcal/Sm³) hesaplandı. Enerji yöneticisi, dört yılda bir etüt ve ISO 50001 yükümlülüğü son üç yılın ortalaması 1.000 TEP ve üzeri olan sanayi işletmelerinde var; bu tesiste zorunlu değil; zorunlu etüt olmadığı için kayıplar kendiliğinden ortaya çıkmıyor.`,
      'Verimlilik artırıcı proje (VAP) desteği enerji yöneticisi ve ISO 50001 istiyor. Bu tesis ancak ikisini gönüllü kurarsa başvurabilir.',
      'Uygun destek yolu TÜBİTAK 1831 Yeşil İnovasyon mentörlüğü: KOBİ’lere %90 hibeyle, çözüm ortağı üzerinden, 6 ayda ve proje başına en çok 280 bin TL.'
    ] };
  return { status: 'above', tep, title: `Yıllık ≈ ${fmt(tep)} TEP: 1.000 TEP eşiğinin üzerinde.`,
    points: ['Son üç yılın ortalaması da 1.000 TEP’in üzerindeyse enerji yöneticisi atama, dört yılda bir etüt ve ISO 50001 yükümlülüğü kapsamında.',
      'Enerji yöneticisi ve ISO 50001 şartları sağlanırsa verimlilik artırıcı proje (VAP) desteğine başvurabilir.'] };
}

/**
 * Kondens geri kazanımı için tesise özel karar eşikleri ve adımlar.
 * Eşikler, aynı hesap motorunun doğrusal ilişkilerinden çözülür; ek elektrik ve bakım gideri sabit kabul edilir.
 */
export function condensatePlan(report, { maxPaybackMonths = null } = {}) {
  const s = report?.scenario, input = report?.scenarioInput, p = report?.profile;
  if (!s || s.status !== 'calculated' || !input || !p) return null;
  const limit = known(maxPaybackMonths) && maxPaybackMonths > 0 ? maxPaybackMonths : REFERENCE_PAYBACK_MONTHS;
  const limitSource = known(maxPaybackMonths) && maxPaybackMonths > 0 ? 'owner' : 'reference';
  const dT = input.returnTemperatureC - input.makeupTemperatureC;
  const lhv = p.gasLhvKWhPerSm3, eff = input.boilerEfficiencyLhv;
  const gasPerFlow = WATER_CP * dT * input.operatingHours / 3600 / eff / lhv; // Sm³ / (kg/saat)
  const gasPerKelvin = WATER_CP * input.additionalLiquidFlowKgPerHour * input.operatingHours / 3600 / eff / lhv; // Sm³ / K
  const moneyReady = known(s.netSavingsTl) && known(input.gasPriceTlPerSm3) && known(input.electricityPriceTlPerKWh) && known(input.additionalOperatingCostTl) && known(input.additionalElectricityKWh);
  const annual = input.period?.kind === 'year';
  const fixedCost = moneyReady ? input.additionalElectricityKWh * input.electricityPriceTlPerKWh + input.additionalOperatingCostTl : null;
  const needed = moneyReady && annual && known(input.investmentTl) ? input.investmentTl * 12 / limit : null;
  const t = {
    breakEvenFlowKgH: moneyReady && input.gasPriceTlPerSm3 > 0 ? fixedCost / (input.gasPriceTlPerSm3 * gasPerFlow) : null,
    minFlowKgH: needed !== null && input.gasPriceTlPerSm3 > 0 ? (needed + fixedCost) / (input.gasPriceTlPerSm3 * gasPerFlow) : null,
    minReturnTempC: needed !== null && input.gasPriceTlPerSm3 > 0 ? input.makeupTemperatureC + (needed + fixedCost) / (input.gasPriceTlPerSm3 * gasPerKelvin) : null,
    maxInvestmentTl: moneyReady && annual && s.netSavingsTl > 0 ? s.netSavingsTl * limit / 12 : null,
    minGasPriceTl: needed !== null ? (needed + fixedCost) / s.gasSavingsSm3 : null
  };
  const payback = s.simplePaybackMonths;
  const hikePrice = moneyReady ? input.gasPriceTlPerSm3 * (1 + GAS_PRICE_HIKE_PCT / 100) : null;
  const paybackAtHike = hikePrice !== null && known(input.investmentTl) && annual ? input.investmentTl / (s.gasSavingsSm3 * hikePrice - fixedCost) * 12 : null;
  const decision = !known(payback) ? 'unknown' : payback <= limit ? 'self' : payback <= 36 ? 'support' : 'defer';
  const status = energyStatus(report);
  const limitText = limitSource === 'owner' ? `işletmenin kabul ettiği ${fmt(limit)} ay` : `${fmt(limit)} ay (Task 1: KOBİ’lerin çoğunun kabul ettiği süre)`;
  const steps = [];
  steps.push(input.reuseSuitable === true
    ? { id: 'reuse', done: true, title: 'Geri kullanım uygunluğu onaylandı', body: 'Kondensin kazana dönmesi uygun bulundu. Ürün veya yağ bulaşma riski olan hatlar ayrı tutulmalı; uygunluk kararı hat bazında kayda geçmeli.' }
    : { id: 'reuse', done: false, title: 'Önce geri kullanım uygunluğunu doğrulatın', body: 'Kondensin iletkenliğini ve pH değerini ölçtürün; ürünle temas eden veya yağ bulaşma riski olan hatları geri dönüşten ayırın.' });
  steps.push({ id: 'flow', done: false, title: known(t.minFlowKgH) ? `Ek debiyi ölçün: karar eşiği ≥ ${fmt(ceilTo(t.minFlowKgH, 5))} kg/saat` : 'Ek debiyi ölçün',
    body: `Hesap ${fmt(input.additionalLiquidFlowKgPerHour)} kg/saat varsayıyor. Tank girişinde ölçülen ortalama ${known(t.minFlowKgH) ? `${fmt(ceilTo(t.minFlowKgH, 5))} kg/saatin üzerindeyse yatırım ${limitText} içinde döner` : 'debi ile tasarruf doğru orantılıdır'}${known(t.breakEvenFlowKgH) ? `; ${fmt(Math.floor(t.breakEvenFlowKgH))} kg/saatin altında pompa elektriği ve bakım gideri tasarrufu siler` : ''}. Ölçümü sezonun yoğun ve sakin dönemini kapsayacak şekilde tekrarlayın.` });
  if (known(t.minReturnTempC)) steps.push({ id: 'temperature', done: false, title: `Dönüş sıcaklığını koruyun: en az ${fmt(t.minReturnTempC, 1)} °C`,
    body: `Taze su ${fmt(input.makeupTemperatureC)} °C iken dönüş sıcaklığı ${fmt(t.minReturnTempC, 1)} °C’nin altına düşerse ${fmt(limit)} ay sınırı aşılır. Varsayım ${fmt(input.returnTemperatureC)} °C; dönüş hattının yalıtımı bu farkı korur.` });
  if (known(t.maxInvestmentTl)) steps.push({ id: 'offer', done: false, title: `Teklif alın: tavan ${fmt(t.maxInvestmentTl)} TL`,
    body: `En az iki tedarikçiden pompa, tank bağlantısı ve hat dahil anahtar teslim teklif isteyin. ${fmt(limit)} ay sınırını korumak için teklif ${fmt(t.maxInvestmentTl)} TL’yi aşmamalı${known(input.investmentTl) ? `; mevcut teklif ${fmt(input.investmentTl)} TL (tavanın %${fmt(100 * input.investmentTl / t.maxInvestmentTl)} kadarı)` : ''}.` });
  const financing = decision === 'self'
    ? { title: 'Finansman: öz kaynakla uygulanabilir', body: `Geri ödeme ${fmt(payback, 1)} ay, ${limitText} sınırının içinde. Yatırım ilk yılın net tasarrufunun %${fmt(100 * input.investmentTl / s.netSavingsTl)} kadarı.${known(t.minGasPriceTl) ? ` Gaz birim fiyatı ${fmt(t.minGasPriceTl, 2)} TL/Sm³’ün altına düşmedikçe sınır korunur.` : ''}${known(paybackAtHike) ? ` Gaz fiyatı Nisan 2026’daki sanayi zammı kadar (%${fmt(GAS_PRICE_HIKE_PCT, 2)}) artarsa geri ödeme ${fmt(paybackAtHike, 1)} aya iner.` : ''}` }
    : decision === 'support'
      ? { title: 'Finansman: destekle uygulanmalı', body: `Geri ödeme ${fmt(payback, 1)} ay; ${limitText} sınırını aşıyor ama 3 yılın içinde. ${status.status === 'below' ? 'Tesis 1.000 TEP’in altında olduğu için TÜBİTAK 1831 mentörlüğüyle (%90 hibe) önlem paketi ve yatırım planı hazırlanabilir.' : 'Tesis yükümlülük kapsamında; enerji yöneticisi ve ISO 50001 ile VAP desteği değerlendirilebilir.'} Teklifi ${known(t.maxInvestmentTl) ? `${fmt(t.maxInvestmentTl)} TL tavanına indirmek` : 'düşürmek'} de sınırı sağlar.` }
      : decision === 'defer'
        ? { title: 'Finansman: bu koşullarda öncelikli değil', body: `Geri ödeme ${fmt(payback, 1)} ay. Önce ek debiyi ve dönüş sıcaklığını yeniden ölçün; değerler eşiklerin altında kalırsa buhar kapanı ve yalıtım gibi düşük maliyetli önlemlere öncelik verin.` }
        : { title: 'Finansman için yatırım tutarı gerekli', body: 'Yıllık dönemde yatırım tutarı ve pozitif net tasarruf olduğunda geri ödeme ve finansman yolu hesaplanır.' };
  steps.push({ id: 'financing', done: false, ...financing });
  const gasPerTonBefore = known(p.productionTon) && p.productionTon > 0 ? p.gasSm3 / p.productionTon : null;
  const gasPerTonAfter = gasPerTonBefore !== null ? (p.gasSm3 - s.gasSavingsSm3) / p.productionTon : null;
  const reductionPct = p.gasSm3 > 0 ? 100 * s.gasSavingsSm3 / p.gasSm3 : null;
  const waterM3 = input.additionalLiquidFlowKgPerHour * input.operatingHours / 1000;
  steps.push({ id: 'monitor', done: false, title: 'Uygulayın ve 12 ay izleyin',
    body: `${gasPerTonBefore !== null ? `Her ay doğal gaz tüketimini üretim tonuna bölün: ${fmt(gasPerTonBefore, 1)} → ${fmt(gasPerTonAfter, 1)} Sm³/ton bekleniyor (%${fmt(reductionPct, 1)} azalma). Üç ay üst üste azalma %${fmt(reductionPct / 2, 1)} eşiğinin altında kalırsa debiyi ve flash/hat kayıplarını yeniden ölçün.` : `Her ay doğal gaz tüketimini izleyin: aynı üretimde yılda ${fmt(s.gasSavingsSm3)} Sm³ (%${fmt(reductionPct, 1)}) azalma bekleniyor.`} Besleme suyu sayacında yılda ≈ ${fmt(waterM3)} m³ azalma görülmeli.${known(s.emissionsReductionTco2) ? ` Beklenen emisyon azalması ayda ≈ ${fmt(s.emissionsReductionTco2 / 12, 1)} tCO₂.` : ''}` });
  return { limitMonths: limit, limitSource, payback, decision, thresholds: t, paybackAtHike, waterM3, gasPerTonBefore, gasPerTonAfter, reductionPct, steps };
}

/** Önlem ailesi için tesisin durumuna göre sonraki adım metni. */
export function familyGuidance(family, report, plan = null) {
  const p = report?.profile || {}, input = report?.scenarioInput || {}, s = report?.scenario || {};
  const state = p.equipment?.[{ compressed_air: 'compressedAir', steam_traps: 'steam', steam_insulation: 'steam', condensate: 'steam', cooling: 'cooling' }[family]] || 'unknown';
  if (state === 'absent') return 'Sistem bulunmadığı için bu tesisin kapsamı dışında.';
  if (family === 'compressed_air') {
    if (state !== 'present') return 'Dolum, paketleme veya valf hatlarında pnömatik ekipman varsa kompresör de vardır; bakım sorumlusuna sorup formda işaretleyin.';
    const hours = p.annualHours, price = input.electricityPriceTlPerKWh;
    const test = 'Üretim yokken (ör. hafta sonu) kaçak testi yapın: kompresörün 10 dakikadaki yükte ve boşta sürelerini kaydedin; kaçak oranı = yükte süre ÷ toplam süre.';
    if (!known(hours)) return `${test} Dönem çalışma süresini girerseniz kaçağın yıllık maliyeti hesaplanır.`;
    return `${test} Yılda ${fmt(hours)} saat çalışan bu tesiste kaçak oranının her %10’u, kompresörün her kW’ı için yılda ≈ ${fmt(hours * 0.1)} kWh${known(price) ? ` ve ${fmt(hours * 0.1 * price)} TL` : ''} demek; sonucu kompresör gücüyle çarpın.`;
  }
  if (family === 'steam_traps') return state === 'present'
    ? 'Buhar kapanlarını hat hat listeleyin; her birini ultrasonik dinleme veya termal kamerayla kontrol edin. Açık kalan kapan canlı buhar kaçırır, tıkalı kapan kondensi hatta biriktirir ve geri dönen debiyi düşürür.'
    : 'Buhar sistemi teyit edilince kapan sayısı ve yerleri listelenmeli.';
  if (family === 'steam_insulation') {
    if (state !== 'present') return 'Buhar sistemi teyit edilince çıplak hat ve vanalar listelenmeli.';
    const minTemp = plan?.thresholds?.minReturnTempC;
    return `Çıplak vana, flanş ve hat bölümlerini uzunluk ve çapıyla listeleyin; yüzey sıcaklığı 50 °C’yi aşan bölümler yalıtım adayıdır.${known(minTemp) ? ` Kondens dönüş hattını yalıtmak bu tesiste karar eşiği olan ${fmt(minTemp, 1)} °C dönüş sıcaklığını korur.` : ' Kondens dönüş hattının yalıtımı geri kazanılan ısıyı korur.'}`;
  }
  if (family === 'condensate') {
    if (s.status === 'calculated' && known(s.netEnergySavingsKWh)) return `Hesaplandı: yılda ${fmt(s.netEnergySavingsKWh / 1000, 1)} MWh${known(s.netSavingsTl) ? ` ve ${fmt(s.netSavingsTl)} TL` : ''}${plan?.thresholds?.minFlowKgH ? `; karar eşiği ${fmt(ceilTo(plan.thresholds.minFlowKgH, 5))} kg/saat ek debi` : ''}. Ayrıntı Senaryo adımındaki uygulama planında.`;
    if (s.status === 'ineligible') return 'Bu koşulda kondens geri kazanımı uygun değil; nedeni Senaryo adımında.';
    return 'Hesap için tank girişindeki ek debi, dönüş ve taze su sıcaklıkları, çalışma süresi ve kazan verimi gerekli.';
  }
  if (family === 'cooling') return state === 'present'
    ? 'Soğuk oda ve chiller için kapı açık kalma süresini, oda sıcaklık ayarını ve kondenser yüzeylerinin temizliğini kaydedin; soğutma elektriği ayrı ölçülmüyorsa bir hafta boyunca geçici bir enerji analizörüyle ölçün.'
    : 'Belgede soğutma bilgisi yok. Soğuk depo, chiller veya şok dondurucu varsa formda “Var” seçin.';
  return '';
}
