import { preparationSteps } from './guidance.mjs';

/** Turkish form parsing. Blank stays unknown; malformed numbers never become zero. */
export function parseNumber(value, label = 'Değer') {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') throw new Error(`${label}: geçerli bir sayı girin.`);
  let text = value.trim();
  const sign = text.startsWith('-') ? '-' : '';
  if (sign) text = text.slice(1);
  let normalized;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(text) && !/^0\./.test(text)) {
    normalized = text.replaceAll('.', '').replace(',', '.');
  } else if (/^\d+(,\d+)?$/.test(text)) {
    normalized = text.replace(',', '.');
  } else if (/^\d+\.\d+$/.test(text)) {
    normalized = text;
  } else {
    throw new Error(`${label}: 1350000 veya 1.350.000; ondalık için 9,59 biçimini kullanın.`);
  }
  const number = Number(sign + normalized);
  if (!Number.isFinite(number)) throw new Error(`${label}: sayı çok büyük.`);
  return number;
}

const format = (value, digits = 2) => typeof value === 'number' && Number.isFinite(value)
  ? value.toLocaleString('tr-TR', { maximumFractionDigits: digits }) : 'Bilinmiyor / hesaplanmadı';
const fieldNames = {
  electricityKWh: 'Elektrik (kWh)', gasSm3: 'Doğal gaz (Sm³)', productionTon: 'Üretim (ton)',
  gasLhvKWhPerSm3: 'Gaz alt ısıl değeri (kWh/Sm³)', annualHours: 'Dönem çalışma saati', employees: 'Çalışan sayısı',
};

export function buildReportText(report) {
  const p = report.profile || {};
  const b = report.baseline || {};
  const r = report.ranking || {};
  const s = report.scenario || {};
  const period = p.period || b.period || {};
  const lines = ['ISIMERCEK — ENERJI ON INCELEME RAPORU', '',
    `Tesis: ${p.name || 'İsimsiz tesis'}`, `Oluşturma: ${report.generatedAt || ''}`,
    `Dönem: ${period.start || '?'} — ${period.end || '?'} (${period.kind === 'year' ? 'yıllık' : period.kind === 'month' ? 'aylık' : 'belirtilmedi'})`,
    report.demo ? 'TEMSİLİ DEMO: Gerçek tesis ölçümü veya doğrulanmış saha tasarrufu değildir.' : 'Kullanıcı girdileri; saha doğrulaması yapılmadı.', '', 'GİRDİLER'];
  for (const [key, name] of Object.entries(fieldNames)) lines.push(`${name}: ${format(p[key] ?? b[key])}`);
  lines.push(`NAICS: ${p.naics || 'Bilinmiyor'}`,
    `Yıllık dönem teyidi: ${p.annualPeriodConfirmed === true ? 'Evet' : 'Hayır'}`);
  const equipmentNames = { steam: 'Buhar sistemi', cooling: 'Soğutma', compressedAir: 'Basınçlı hava veya inert gaz' };
  const states = { present: 'Var', absent: 'Yok', unknown: 'Bilinmiyor' };
  for (const [key, name] of Object.entries(equipmentNames)) lines.push(`${name}: ${states[p.equipment?.[key]] || 'Bilinmiyor'}`);
  lines.push('', 'MEVCUT DURUM',
    `Toplam nihai enerji (kWh): ${format(b.totalFinalEnergyKWh)}`,
    `Enerji yoğunluğu (kWh/ton): ${format(b.energyIntensityKWhPerTon)}`, '', 'DENEYSEL MODEL');
  lines.push('Eğitim: 751 etüt; doğrulama: 151; zamansal test: 179. Kaynak: ABD ITAC gerçek etüt kayıtları.',
    'nDCG@3: model 0,8191; alt sektör sıklığı karşılaştırması 0,8431. Model karşılaştırmayı geçmedi.',
    'Benzerlik skoru teknik uygunluk, başarı veya tasarruf olasılığı değildir. Türkiye saha doğrulaması yoktur.');
  for (const [key, label] of [['recommendations', 'İnceleme adayı'], ['needsConfirmation', 'Ekipman teyidi gerekli'], ['excluded', 'Sistem yok']]) {
    for (const entry of r[key] || []) lines.push(`${label}: ${entry.name} ${typeof entry.score === 'number' ? `(skor ${format(entry.score, 3)})` : ''}${entry.reason ? ' — ' + entry.reason : ''}`);
  }
  for (const entry of [...(r.reasons || []), ...(r.warnings || [])]) lines.push(`Model notu: ${entry.message}`);
  lines.push('', 'KONDENS SENARYOSU — HESAPLANAN POTANSİYEL');
  if (s.status === 'calculated') {
    lines.push(`Geri kazanılan ısı (kWh): ${format(s.recoveredHeatKWh)}`,
      `Gaz tasarrufu (Sm³): ${format(s.gasSavingsSm3)}`,
      `Ek elektrik (kWh): ${format(s.additionalElectricityKWh)}`,
      `Net enerji azalması (kWh): ${format(s.netEnergySavingsKWh)}`,
      `Net enerji azalması (%): ${format(s.finalEnergyReductionPercent)}`,
      `Net dönem tasarrufu (TL): ${format(s.netSavingsTl)}`,
      `Basit geri ödeme (ay): ${format(s.simplePaybackMonths)}`,
      `Emisyon azalması (tCO2): ${format(s.emissionsReductionTco2)}`,
      'Gerçekleşmiş etki değildir. Debi, sıcaklık, çalışma saati, teknik uygunluk ve fiyatlar saha teyidi gerektirir.',
      `Hesap: ${s.model?.formula || ''}`, `Kapsam: ${s.model?.scope || ''}`,
      'Senaryo girdileri: ' + JSON.stringify(s.model?.inputs || {}, null, 2));
    if (s.paybackUnavailableReason) lines.push(s.paybackUnavailableReason);
  } else for (const entry of s.reasons || [{ message: 'Senaryo hesaplanmadı.' }]) lines.push(entry.message);
  if (report.energyStatus) lines.push('', 'YÜKÜMLÜLÜK VE DESTEK DURUMU', report.energyStatus.title, ...report.energyStatus.points.map(point => `- ${point}`));
  lines.push('', 'SONRAKİ ADIMLAR');
  const steps = preparationSteps(report);
  if (steps.length) steps.forEach((step,index)=>lines.push(`${index+1}. ${step.title}: ${step.body}`));
  if (report.plan) {
    lines.push(`UYGULAMA PLANI — karar sınırı ${report.plan.limitMonths} ay geri ödeme (${report.plan.limitSource === 'owner' ? 'işletmenin beyanı' : 'Task 1 referansı'})`);
    report.plan.steps.forEach((step, index) => lines.push(`${index + 1}. ${step.done ? '[tamam] ' : ''}${step.title}: ${step.body}`));
  } else if (!steps.length) lines.push(s.status === 'ineligible' ? 'Kondens hesabı bu koşulda uygun değildir; tesisteki diğer sistemler için uzman incelemesi planlayın.' : 'Teknik uygunluğu ve ölçümleri sahada doğrulatın. Tekliflerle maliyetleri güncelleyin. Uygulama sonrası aynı kapsamda tüketim ve üretim ölçerek etkiyi karşılaştırın.');
  const factors = s.before?.emissionFactors || b.emissionFactors;
  lines.push('', factors ? 'Emisyon katsayıları (kaynak ve varsayımlar):\n' + JSON.stringify(factors, null, 2)
    : 'Emisyon katsayısı seçilmedi; CO2 sonucu hesaplanmadı.', '',
    'SDG 7.3; destekleyici: SDG 13 ve SDG 9.4.',
    'Model ve tüm hesaplar tarayıcıda çalışır. Gemini yalnız kullanıcının gönderdiği belgeden alan önerisi çıkarmak için çağrılır; hesap, sıralama veya karar üretmez.');
  const source = report.provenance;
  if (source) {
    lines.push('', 'VERİ KAYNAĞI',
      `${source.method}${source.model ? ` (${source.model})` : ''}${source.sample ? ' · temsili örnek belge' : ''}`,
      `Kullanıcının onayladığı alanlar (${source.accepted.length}): ${source.accepted.map(item => `${item.label} = ${item.display}${item.grounded === true ? ' [alıntı metinde doğrulandı]' : item.grounded === false ? ' [alıntı doğrulanamadı]' : ''}`).join('; ')}`);
    if (source.rejected.length) lines.push(`Aktarılmayan öneriler: ${source.rejected.join(', ')}`);
  }
  return lines.join('\n');
}
