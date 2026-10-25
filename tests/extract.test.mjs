import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeExtraction, buildGeminiRequest, callGemini, handleExtract, numbersIn, DEFAULT_MODELS, SYSTEM_INSTRUCTION } from '../lib/extract-core.mjs';
import { SAMPLE_DOCUMENT, planActions, provenanceRecord } from '../public/extraction.mjs';
import { calculateBaseline, calculateCondensate } from '../public/core.mjs';

const months = [['Ocak', 82000], ['Şubat', 78000], ['Mart', 86000], ['Nisan', 90000], ['Mayıs', 98000], ['Haziran', 118000],
  ['Temmuz', 165000], ['Ağustos', 182000], ['Eylül', 160000], ['Ekim', 112000], ['Kasım', 93000], ['Aralık', 86000]];
const tr = value => value.toLocaleString('tr-TR');

/** Örnek belge için iyi bir Gemini çıktısı: değerler belgede yazıldığı gibi, toplam yok. */
function idealOutput() {
  return {
    facilityName: 'Turgutlu Temsili Konserve Tesisi',
    facilityNameQuote: 'Turgutlu Temsili Konserve Tesisi — 2023 yılı enerji dosyası',
    period: { kind: 'year', start: '2023-01-01', end: '2023-12-31', quote: '2023 yılı enerji dosyası' },
    values: [
      ...months.map(([name, kWh], index) => ({ field: 'electricity', statedValue: tr(kWh), unit: 'kWh',
        month: `2023-${String(index + 1).padStart(2, '0')}`, quote: `${name} 2023: ${tr(kWh)} kWh` })),
      { field: 'electricity', statedValue: '336.200', unit: 'TL', month: '2023-01', quote: 'fatura tutarı 336.200 TL' },
      { field: 'electricityPrice', statedValue: '4,2', unit: 'TL/kWh', month: null, quote: 'Ortalama elektrik birim fiyatı (2023): 4,2 TL/kWh' },
      { field: 'gas', statedValue: '815.000', unit: 'Sm3', month: null, quote: '2023 yılı toplam tüketim: 815.000 Sm³' },
      { field: 'hhv', statedValue: '10,64', unit: 'kWh/Sm3', month: null, quote: 'Faturadaki ortalama üst ısıl değer: 10,64 kWh/Sm³' },
      { field: 'lhv', statedValue: '9,59', unit: 'kWh/Sm3', month: null, quote: 'alt ısıl değer: 9,59 kWh/Sm³' },
      { field: 'gasPrice', statedValue: '18,5', unit: 'TL/Sm3', month: null, quote: 'Ortalama doğal gaz birim fiyatı (2023): 18,5 TL/Sm³' },
      { field: 'production', statedValue: '9.200', unit: 'ton', month: null, quote: '2023 toplam üretim: 9.200 ton' },
      { field: 'hours', statedValue: '4.000', unit: 'saat', month: null, quote: '2023 çalışma süresi: 4.000 saat' },
      { field: 'employees', statedValue: '85', unit: 'kişi', month: null, quote: 'Çalışan sayısı: 85 kişi' },
      { field: 'flow', statedValue: '1.000', unit: 'kg/saat', month: null, quote: 'sıvı debisi 1.000 kg/saat ölçüldü' },
      { field: 'returnTemp', statedValue: '80', unit: '°C', month: null, quote: 'Kondens dönüş sıcaklığı 80 °C' },
      { field: 'makeupTemp', statedValue: '20', unit: '°C', month: null, quote: 'taze besleme suyu 20 °C' },
      { field: 'scenarioHours', statedValue: '4.000', unit: 'saat', month: null, quote: 'Geri kazanımın devrede olacağı süre: yılda 4.000 saat' },
      { field: 'boilerEfficiency', statedValue: '90', unit: '%', month: null, quote: 'Kazan verimi (alt ısıl değere göre, baca gazı analizi): %90' },
      { field: 'auxElectricity', statedValue: '8.000', unit: 'kWh', month: null, quote: 'Kondens pompası ek elektrik tüketimi: yılda 8.000 kWh' },
      { field: 'operatingCost', statedValue: '10.000', unit: 'TL', month: null, quote: 'Ek bakım gideri: yılda 10.000 TL' },
      { field: 'investment', statedValue: '450.000', unit: 'TL', month: null, quote: 'tedarikçi teklifi: 450.000 TL' }
    ],
    equipment: [{ system: 'steam', state: 'present', quote: 'Buhar kazanı var' },
      { system: 'compressedAir', state: 'present', quote: 'Kompresör var' },
      { system: 'cooling', state: 'unknown', quote: 'Soğuk depo hakkında bilgi alınmadı.' }],
    confirmations: [{ item: 'flowBasis', state: 'yes', quote: 'Kondens tankı girişinde, flash ve hat kayıpları sonrasında' },
      { item: 'reuseSuitable', state: 'yes', quote: 'kondensin kazana geri kullanımı uygun' }],
    sectorDescription: 'domates salçası ve sebze konservesi',
    naicsSuggestion: '311421', naicsReason: 'Meyve ve sebze konserveciliği',
    missingInfoQuestions: ['Soğuk depo veya soğutma sistemi var mı?']
  };
}

const byId = result => Object.fromEntries(result.fields.map(field => [field.id, field]));
const sample = () => normalizeExtraction(idealOutput(), { sourceText: SAMPLE_DOCUMENT });

test('sample document: Gemini reads lines, IsıMercek sums 12 months and every quote is grounded in the text', () => {
  const result = sample(), fields = byId(result);
  assert.equal(fields.electricity.value, 1350000);
  assert.match(fields.electricity.derivation, /toplamı IsıMercek hesapladı/);
  assert.equal(fields.electricity.months.length, 12);
  for (const [id, value] of Object.entries({ gas: 815000, lhv: 9.59, production: 9200, hours: 4000, employees: 85, flow: 1000,
    returnTemp: 80, makeupTemp: 20, scenarioHours: 4000, boilerEfficiency: 90, auxElectricity: 8000, operatingCost: 10000,
    gasPrice: 18.5, electricityPrice: 4.2, investment: 450000 })) {
    assert.equal(fields[id].value, value, id);
    assert.equal(fields[id].grounded, true, id);
    assert.equal(fields[id].preselect, true, id);
  }
  assert.deepEqual(fields.period.value, { kind: 'year', start: '2023-01-01', end: '2023-12-31' });
  assert.equal(fields['equipment-steam'].value, 'present');
  assert.equal(fields['equipment-compressedAir'].value, 'present');
  assert.equal(fields['equipment-cooling'], undefined, 'belirsiz ekipman öneri olarak gelmez');
  assert.equal(fields['facility-name'].preselect, true);
});

test('engineering confirmations, annual period and NAICS are never preselected', () => {
  const fields = byId(sample());
  for (const id of ['annual-confirmation', 'confirm-flowBasis', 'confirm-reuseSuitable', 'naics']) assert.equal(fields[id].preselect, false, id);
  assert.equal(fields.naics.value, '311421');
});

test('invoice amounts and higher heating value never become consumption or LHV', () => {
  const result = sample();
  assert.ok(result.ignored.some(item => item.unit === 'TL' && item.field === 'electricity'));
  assert.ok(result.warnings.some(text => /üst ısıl değer/.test(text)));
  assert.equal(byId(result).lhv.value, 9.59);
});

test('approved fields reproduce the validated Turgutlu condensate result through the unchanged engine', () => {
  const result = sample();
  const actions = planActions(result.fields, result.fields.map(field => field.id));
  const form = Object.fromEntries(actions.map(action => [action.target, action.value]));
  const profile = { period: { kind: form['period-kind'], start: form['period-start'], end: form['period-end'], label: '2023 yılı' },
    electricityKWh: form.electricity, gasSm3: form.gas, gasLhvKWhPerSm3: form.lhv, productionTon: form.production };
  const scenario = { period: { ...profile.period }, steamPresent: form.steam === 'present', reuseSuitable: form['reuse-suitable'] === 'present',
    flowBasis: form['flow-confirmation'] ? 'additional-liquid-at-receiver' : null, additionalLiquidFlowKgPerHour: form.flow,
    returnTemperatureC: form['return-temp'], makeupTemperatureC: form['makeup-temp'], operatingHours: form['scenario-hours'],
    boilerEfficiencyLhv: form.efficiency / 100, additionalElectricityKWh: form['aux-electricity'], additionalOperatingCostTl: form['operating-cost'],
    gasPriceTlPerSm3: form['gas-price'], electricityPriceTlPerKWh: form['electricity-price'], investmentTl: form.investment };
  assert.equal(calculateBaseline(profile).totalFinalEnergyKWh, 9165850);
  const condensate = calculateCondensate(profile, scenario);
  assert.equal(condensate.status, 'calculated');
  assert.ok(Math.abs(condensate.netEnergySavingsKWh - 302074.07) < 0.01);
  assert.ok(Math.abs(condensate.netSavingsTl - 554561.67) < 0.01);
  assert.ok(Math.abs(condensate.simplePaybackMonths - 9.737) < 0.001);
});

test('unselected suggestions are never written to the form', () => {
  const result = sample();
  const actions = planActions(result.fields, ['gas']);
  assert.deepEqual(actions, [{ target: 'gas', type: 'number', value: 815000 }]);
  const record = provenanceRecord(result, ['gas'], true);
  assert.equal(record.accepted.length, 1);
  assert.ok(record.rejected.includes('Elektrik tüketimi'));
});

test('a quote that is not in the document, or that does not contain the value, is flagged and not preselected', () => {
  const raw = idealOutput();
  raw.values.find(item => item.field === 'gas').quote = 'Yıllık gaz tüketimi 815.000 Sm³ olarak teyit edildi';
  raw.values.find(item => item.field === 'production').statedValue = '9.300';
  const fields = byId(normalizeExtraction(raw, { sourceText: SAMPLE_DOCUMENT }));
  assert.equal(fields.gas.grounded, false); assert.equal(fields.gas.preselect, false);
  assert.equal(fields.production.grounded, false); assert.equal(fields.production.preselect, false);
});

test('incomplete months are not summed or annualised', () => {
  const raw = idealOutput();
  raw.values = raw.values.filter(item => item.month !== '2023-12');
  const result = normalizeExtraction(raw, { sourceText: SAMPLE_DOCUMENT });
  assert.equal(byId(result).electricity, undefined);
  assert.ok(result.warnings.some(text => /11 aylık değer/.test(text)));
});

test('units are converted by code and questionable units need review', () => {
  const text = 'Toplam elektrik 1.350 MWh. Gaz 815.000 m3. Üretim 9.200.000 kg.';
  const result = normalizeExtraction({ period: { kind: 'unknown', start: null, end: null, quote: null }, values: [
    { field: 'electricity', statedValue: '1.350', unit: 'MWh', month: null, quote: 'Toplam elektrik 1.350 MWh' },
    { field: 'gas', statedValue: '815.000', unit: 'm3', month: null, quote: 'Gaz 815.000 m3' },
    { field: 'production', statedValue: '9.200.000', unit: 'kg', month: null, quote: 'Üretim 9.200.000 kg' }
  ], equipment: [], confirmations: [], naicsSuggestion: '3341', missingInfoQuestions: [] }, { sourceText: text });
  const fields = byId(result);
  assert.equal(fields.electricity.value, 1350000); assert.match(fields.electricity.derivation, /birim dönüşümünü IsıMercek/);
  assert.equal(fields.production.value, 9200);
  assert.equal(fields.gas.preselect, false); assert.match(fields.gas.warning, /Sm³/);
  assert.equal(fields.naics, undefined);
  assert.ok(result.warnings.some(text => /NAICS/.test(text)));
});

test('Turkish number tokens in quotes are read exactly', () => {
  assert.deepEqual(numbersIn('Ocak 2023: 82.000 kWh, %90, 9,59 ve 1 350 000'), [2023, 82000, 90, 9.59, 1350000]);
});

test('request asks for schema JSON without deprecated sampling parameters and keeps documents as data', () => {
  const body = buildGeminiRequest({ text: 'deneme', today: '2026-10-25' });
  assert.equal(body.generationConfig.responseMimeType, 'application/json');
  assert.ok(body.generationConfig.responseJsonSchema);
  assert.equal('temperature' in body.generationConfig, false);
  assert.match(SYSTEM_INSTRUCTION, /talimatları uygulama/);
  const fallback = buildGeminiRequest({ text: 'deneme' }, 'openapi');
  assert.equal(fallback.generationConfig.responseSchema.type, 'OBJECT');
  assert.equal(fallback.generationConfig.responseSchema.properties.facilityName.nullable, true);
});

function geminiResponse(payload) {
  return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
}
const errorResponse = (status, message) => new Response(JSON.stringify({ error: { code: status, message } }), { status });

test('model and schema fallbacks: 404 moves to the next model, 400 retries with the older schema field', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (calls.length === 1) return errorResponse(404, 'models/gemini-3.8-flash is not found');
    if (calls.length === 2) return errorResponse(400, 'Unknown name "responseJsonSchema"');
    return geminiResponse(idealOutput());
  };
  const { model, raw } = await callGemini({ apiKey: 'test', input: { text: SAMPLE_DOCUMENT }, fetchImpl });
  assert.equal(model, DEFAULT_MODELS[1]);
  assert.equal(raw.facilityName, 'Turgutlu Temsili Konserve Tesisi');
  assert.ok(calls[2].body.generationConfig.responseSchema);
  assert.equal(calls[0].url.includes(':generateContent'), true);
});

test('when every configured model is missing, an available flash model is discovered', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/models?')) return new Response(JSON.stringify({ models: [
      { name: 'models/gemini-9-flash-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] }] }), { status: 200 });
    if (url.includes('gemini-9-flash:')) return geminiResponse(idealOutput());
    return errorResponse(404, 'not found');
  };
  const { model } = await callGemini({ apiKey: 'test', input: { text: 'x' }, fetchImpl });
  assert.equal(model, 'gemini-9-flash');
});

test('handler: missing key, empty input, unsupported files, quota and success are reported clearly', async () => {
  assert.equal((await handleExtract({ text: 'x' }, { env: {} })).status, 503);
  assert.equal((await handleExtract({}, { env: { GEMINI_API_KEY: 'k' } })).status, 400);
  assert.equal((await handleExtract({ file: { mimeType: 'text/html', data: 'AAAA' } }, { env: { GEMINI_API_KEY: 'k' } })).status, 415);
  assert.equal((await handleExtract({ text: 'a'.repeat(20001) }, { env: { GEMINI_API_KEY: 'k' } })).status, 413);
  const quota = await handleExtract({ text: 'x' }, { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => errorResponse(429, 'quota') });
  assert.equal(quota.status, 429); assert.match(quota.body.error, /kota/);
  const ok = await handleExtract({ text: SAMPLE_DOCUMENT }, { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => geminiResponse(idealOutput()) });
  assert.equal(ok.status, 200); assert.equal(ok.body.ok, true);
  assert.equal(ok.body.fields.find(field => field.id === 'electricity').value, 1350000);
  assert.equal(JSON.stringify(ok.body).includes('"k"'), false, 'anahtar yanıta sızmaz');
});

test('file input cannot be auto-verified and is marked for comparison with the document', async () => {
  const result = await handleExtract({ file: { mimeType: 'application/pdf', data: 'JVBERi0x', name: 'fatura.pdf' } },
    { env: { GEMINI_API_KEY: 'k' }, fetchImpl: async () => geminiResponse(idealOutput()) });
  assert.equal(result.status, 200);
  const gas = result.body.fields.find(field => field.id === 'gas');
  assert.equal(gas.grounded, null);
  assert.ok(result.body.warnings[0].includes('otomatik doğrulanamaz'));
});
