/**
 * Browser/Node inference for the exported ITAC recorded-family ranker.
 * Scores describe historical recorded-label affinity, never suitability or savings.
 * The public rankOpportunities gate is separate from preprocessing parity.
 */
const FAMILIES = Object.freeze({
  compressed_air: { name: 'Basınçlı hava ve inert gaz kaçakları', equipment: 'compressedAir' },
  steam_traps: { name: 'Buhar kapanı ve kaçak kontrolü', equipment: 'steam' },
  steam_insulation: { name: 'Buhar ve kondens hattı yalıtımı', equipment: 'steam' },
  condensate: { name: 'Kondens geri kazanımı', equipment: 'steam' },
  cooling: { name: 'Soğutma sistemleri', equipment: 'cooling' },
});
const NUMERIC_NAMES = ['electricityKWh', 'annualHours', 'employees'];
const EQUIPMENT_STATES = new Set(['present', 'absent', 'unknown']);
const SCORE_MEANING = 'Geçmiş ABD ITAC kayıtlarındaki öneri ailesi benzerlik skoru; teknik uygunluk, başarı veya tasarruf olasılığı değildir.';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const missing = value => value === null || value === undefined;
const issue = (code, field, message) => ({ code, field, message });

function validateModel(model) {
  if (!model || model.schemaVersion !== 1 || model.modelType !== 'multilabel_logistic_regression') {
    throw new TypeError('Desteklenmeyen model şeması.');
  }
  if (!Array.isArray(model.labels) || model.labels.length !== 5 ||
      new Set(model.labels).size !== 5 || model.labels.some(label => !Object.hasOwn(FAMILIES, label))) {
    throw new TypeError('Modelin beş öneri ailesi eksiksiz ve benzersiz olmalı.');
  }
  const prep = model.preprocessing;
  if (!prep || prep.naicsPrefixLength !== 4 || !Array.isArray(prep.numeric) || prep.numeric.length !== 3 ||
      !Array.isArray(prep.naicsCategories) || new Set(prep.naicsCategories).size !== prep.naicsCategories.length ||
      prep.naicsCategories.some(category => typeof category !== 'string' || !/^\d{4}$/.test(category))) {
    throw new TypeError('Model ön işleme tanımı geçersiz.');
  }
  const expectedFeatures = [];
  prep.numeric.forEach((field, index) => {
    if (!field || field.name !== NUMERIC_NAMES[index] || field.transform !== 'log1p' ||
        !finite(field.impute) || !finite(field.mean) || !finite(field.scale) || field.scale <= 0 ||
        (field.maximum !== null && (!finite(field.maximum) || field.maximum < 0))) {
      throw new TypeError('Model sayısal dönüşümü geçersiz.');
    }
    if (field.name === 'annualHours' && field.maximum !== 8784) {
      throw new TypeError('Model yıllık saat sınırı geçersiz.');
    }
    expectedFeatures.push(`${field.name}_log1p_z`, `${field.name}_missing`);
  });
  expectedFeatures.push('gasPresent', 'gasPresent_missing');
  expectedFeatures.push(...prep.naicsCategories.map(category => `naics_${category}`), 'naics_unknown');
  if (!Array.isArray(prep.featureNames) || prep.featureNames.length !== expectedFeatures.length ||
      prep.featureNames.some((name, index) => name !== expectedFeatures[index])) {
    throw new TypeError('Model özellik sırası veya boyutu geçersiz.');
  }
  if (!Array.isArray(model.intercept) || model.intercept.length !== model.labels.length ||
      model.intercept.some(value => !finite(value)) || !Array.isArray(model.weights) ||
      model.weights.length !== model.labels.length || model.weights.some(row =>
        !Array.isArray(row) || row.length !== expectedFeatures.length || row.some(value => !finite(value)))) {
    throw new TypeError('Model katsayıları veya boyutları geçersiz.');
  }
  return prep;
}

function transform(input, prep) {
  const features = [];
  for (const field of prep.numeric) {
    const value = input[field.name];
    // Raw conversion mirrors Python training; presentation must use the public gate below.
    const isMissing = !finite(value) || value < 0 || (field.maximum !== null && value > field.maximum);
    const transformed = isMissing ? field.impute : Math.log1p(value);
    features.push((transformed - field.mean) / field.scale, Number(isMissing));
  }
  features.push(Number(input.gasPresent === true), Number(typeof input.gasPresent !== 'boolean'));
  const category = String(input.naics || '').split('.')[0].slice(0, prep.naicsPrefixLength);
  features.push(...prep.naicsCategories.map(item => Number(item === category)));
  features.push(Number(!prep.naicsCategories.includes(category)));
  return features;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

/** Low-level parity API. Do not display its output without rankOpportunities validation. */
export function predictRaw(model, input) {
  const prep = validateModel(model);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Model girdisi nesne olmalı.');
  const features = transform(input, prep);
  const scores = {};
  for (let index = 0; index < model.labels.length; index++) {
    const logit = model.weights[index].reduce((total, weight, j) => total + weight * features[j], model.intercept[index]);
    if (!finite(logit)) throw new TypeError('Model hesaplaması sonlu sonuç üretmedi.');
    scores[model.labels[index]] = sigmoid(logit);
  }
  const ranking = [...model.labels].sort((left, right) =>
    scores[right] - scores[left] || model.labels.indexOf(left) - model.labels.indexOf(right));
  return { features, scores, ranking };
}

/**
 * Research ranking for an explicitly annual food/beverage profile.
 * All eligible families remain visible. Low rank never rules a measure out.
 * compressedAir refers to compressed-air OR inert-gas systems (ARC 2.4236).
 */
export function rankOpportunities(model, input, equipment = {}) {
  const prep = validateModel(model);
  const result = { status: 'abstained', recommendations: [], needsConfirmation: [], excluded: [],
    reasons: [], warnings: [], scoreMeaning: SCORE_MEANING };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    result.reasons.push(issue('invalid_input', null, 'Yapılandırılmış tesis bilgisi gerekli.'));
    return result;
  }
  const periodKind = input.period?.kind;
  if (input.annualPeriodConfirmed !== true || (periodKind !== undefined && periodKind !== 'year')) {
    result.reasons.push(issue('annual_period_required', 'annualPeriodConfirmed',
      'Model için doğrulanmış bir yıllık elektrik ve çalışma dönemi gerekli. Aylık veriler otomatik yıllıklaştırılmaz.'));
  }
  for (const field of prep.numeric) {
    const value = input[field.name];
    if (missing(value)) {
      if (field.name === 'electricityKWh') result.reasons.push(issue('annual_electricity_required', field.name, 'Pozitif yıllık elektrik tüketimi gerekli.'));
      continue;
    }
    if (!finite(value) || value < 0 || (field.maximum !== null && value > field.maximum)) {
      result.reasons.push(issue('invalid_numeric', field.name,
        field.name === 'annualHours' ? 'Yıllık çalışma saati 0 ile 8784 arasında sayısal değer olmalı.' : 'Değer sonlu ve negatif olmayan bir sayı olmalı.'));
    } else if (field.name === 'electricityKWh' && value === 0) {
      result.reasons.push(issue('positive_electricity_required', field.name, 'Model pozitif yıllık elektrik tüketimi gerektirir; doğrulanmış sıfır bu modelin kapsamı dışındadır.'));
    }
  }
  if (!missing(input.gasPresent) && typeof input.gasPresent !== 'boolean') {
    result.reasons.push(issue('invalid_gas_state', 'gasPresent', 'Gaz kullanımı var, yok veya bilinmiyor olarak doğrulanmalı.'));
  }
  const naics = String(input.naics ?? '').trim();
  if (!/^\d{4,6}$/.test(naics) || !(naics.startsWith('311') || naics.startsWith('3121'))) {
    result.reasons.push(issue('unsupported_naics', 'naics', 'Gıda ve içecek kapsamındaki 311 veya 3121 ile başlayan 4-6 haneli NAICS kodu gerekli.'));
  }
  if (!equipment || typeof equipment !== 'object' || Array.isArray(equipment)) {
    result.reasons.push(issue('invalid_equipment', 'equipment', 'Ekipman durumları yapılandırılmış olarak gerekli.'));
  } else {
    for (const key of ['steam', 'cooling', 'compressedAir']) {
      if (!missing(equipment[key]) && !EQUIPMENT_STATES.has(equipment[key])) {
        result.reasons.push(issue('invalid_equipment_state', key, 'Ekipman durumu present, absent veya unknown olmalı.'));
      }
    }
  }
  if (result.reasons.length) return result;
  const normalizedInput = { ...input, naics };
  for (const field of prep.numeric) {
    const value = input[field.name];
    if (missing(value)) {
      result.warnings.push(issue('imputed_value', field.name, 'Eksik alan modelin eğitim medyanıyla işleniyor; saha değeri olarak kaydedilmez.'));
    } else if ((finite(field.observedMin) && value < field.observedMin) ||
               (finite(field.observedMax) && value > field.observedMax)) {
      result.warnings.push(issue('outside_training_range', field.name, 'Değer eğitimde gözlenen aralığın dışında; sıralama uzman incelemesi gerektirir.'));
    }
  }
  if (missing(input.gasPresent)) result.warnings.push(issue('missing_gas_state', 'gasPresent', 'Gaz kullanımı bilinmiyor; buhar varlığı çıkarımı yapılmaz.'));
  if (!prep.naicsCategories.includes(naics.slice(0, 4))) {
    result.warnings.push(issue('unseen_naics', 'naics', 'Alt sektör eğitim örnekleminde görülmedi; sonuç yalnız araştırma sıralamasıdır.'));
  }
  if (model.metadata?.performanceGate === 'did_not_beat_naics_baseline') {
    result.warnings.push(issue('baseline_not_beaten', null, 'Bu model zamansal testte alt sektör sıklık karşılaştırmasını geçmedi; öneri sırası deneysel olarak gösteriliyor.'));
  }
  const { scores, ranking } = predictRaw(model, normalizedInput);
  ranking.forEach((family, index) => {
    const definition = FAMILIES[family];
    const state = equipment[definition.equipment] ?? 'unknown';
    const entry = { family, name: definition.name, rank: index + 1, score: scores[family], equipment: definition.equipment };
    if (state === 'absent') {
      result.excluded.push({ family, name: definition.name, equipment: definition.equipment,
        reason: 'İlgili sistemin bulunmadığı doğrulandı; model skoru bu uygunluk elemesini değiştiremez.' });
    } else if (state === 'unknown') {
      result.needsConfirmation.push({ ...entry, reason: 'İlgili ekipmanın varlığı doğrulanmadan uygulanabilir öneri sayılmaz.' });
    } else result.recommendations.push(entry);
  });
  result.status = result.recommendations.length ? 'ranked' : result.needsConfirmation.length ? 'needs_confirmation' : 'abstained';
  if (!result.recommendations.length && !result.needsConfirmation.length) {
    result.reasons.push(issue('no_eligible_family', 'equipment', 'Modellenen ailelerin ilgili sistemleri bu tesiste bulunmuyor.'));
  }
  return result;
}
