/**
 * IsıMercek calculation kernel. No network, AI, persistence or implicit defaults.
 * All energy, costs and auxiliary inputs refer to the explicitly supplied period.
 */
export class InputError extends Error {
  constructor(errors) {
    super(errors.map(({ field, message }) => `${field}: ${message}`).join("; "));
    this.name = "InputError";
    this.errors = errors;
  }
}

const missing = value => value === null || value === undefined;
const issue = (errors, field, message) => errors.push({ field, message });
const numeric = (value, field, errors, { min = 0, max = Infinity, positive = false } = {}) => {
  if (missing(value)) return;
  if (typeof value !== "number" || !Number.isFinite(value) ||
      value < min || value > max || (positive && value <= 0)) {
    issue(errors, field, `Sonlu sayı olmalı; ${positive ? "0'dan büyük" : `en az ${min}`}, en fazla ${max}.`);
  }
};
const triState = (value, field, errors) => {
  if (!missing(value) && typeof value !== "boolean")
    issue(errors, field, "true, false veya null olmalı.");
};
const perTon = (value, tonnes) => !missing(value) && tonnes > 0 ? value / tonnes : null;
const sumKnown = (...values) => values.every(value => !missing(value))
  ? values.reduce((sum, value) => sum + value, 0) : null;
function finiteResults(values) {
  const errors = Object.entries(values).filter(([, value]) => !missing(value) && !Number.isFinite(value))
    .map(([field]) => ({ field, message: "Hesap sayısal sınırı aşıyor; girdileri kontrol edin." }));
  if (errors.length) throw new InputError(errors);
}

function dateMillis(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms : null;
}

function checkPeriod(period, errors, prefix = "period") {
  if (!period || typeof period !== "object") {
    issue(errors, prefix, "Başlangıç ve bitiş tarihli dönem gerekli.");
    return null;
  }
  const start = dateMillis(period.start), end = dateMillis(period.end);
  if (start === null || end === null || end < start) {
    issue(errors, prefix, "Geçerli ve sıralı YYYY-MM-DD tarihleri gerekli.");
    return null;
  }
  if (!["month", "year", "custom"].includes(period.kind))
    issue(errors, `${prefix}.kind`, "month, year veya custom olmalı.");
  if (typeof period.label !== "string" || !period.label.trim())
    issue(errors, `${prefix}.label`, "Dönemi açıklayan etiket gerekli.");
  if (period.kind === "year" &&
      (period.start.slice(5) !== "01-01" || period.end !== `${period.start.slice(0, 4)}-12-31`))
    issue(errors, prefix, "Yıllık dönem tam takvim yılı olmalı; diğer aralıklar custom olmalı.");
  if (period.kind === "month" &&
      (period.start.slice(8) !== "01" || period.start.slice(0, 7) !== period.end.slice(0, 7) ||
       new Date(end + 86400000).getUTCDate() !== 1))
    issue(errors, prefix, "Aylık dönem tam takvim ayı olmalı; diğer aralıklar custom olmalı.");
  const calendarHours = (end - start) / 3600000 + 24;
  return period.kind === "year" ? Math.min(calendarHours, 8760) : calendarHours;
}

export function validateBaseline(input = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input))
    return { valid: false, errors: [{ field: "baseline", message: "Tesis verisi nesne olmalı." }] };
  checkPeriod(input.period, errors);
  for (const key of ["electricityKWh", "gasSm3", "productionTon"])
    numeric(input[key], key, errors);
  numeric(input.gasLhvKWhPerSm3, "gasLhvKWhPerSm3", errors, { positive: true });
  return { valid: errors.length === 0, errors };
}

function requireValid(result) {
  if (!result.valid) throw new InputError(result.errors);
}

function validateFactors(factors) {
  if (missing(factors)) return;
  if (typeof factors !== "object" || Array.isArray(factors))
    throw new InputError([{ field: "factors", message: "Katsayılar nesne olmalı." }]);
  const errors = [];
  for (const [key, basis] of [["electricity", "electricity"], ["gas", "LHV"]]) {
    const factor = factors[key];
    if (missing(factor)) continue;
    if (missing(factor.value)) issue(errors, `factors.${key}.value`, "Katsayı gerekli.");
    numeric(factor.value, `factors.${key}.value`, errors);
    if (factor.unit !== "tCO2/MWh" || factor.energyBasis !== basis)
      issue(errors, `factors.${key}`, `Birim tCO2/MWh ve enerji bazı ${basis} olmalı.`);
    if (!Number.isInteger(factor.year) || factor.year < 1900 ||
        typeof factor.source !== "string" || !factor.source.trim() ||
        typeof factor.isDemoAssumption !== "boolean")
      issue(errors, `factors.${key}`, "Yıl, kaynak ve isDemoAssumption bilgileri gerekli.");
  }
  if (errors.length) throw new InputError(errors);
}

function emissions(electricityKWh, gasEnergyKWh, productionTon, factors) {
  const electricityTco2 = !missing(electricityKWh) && !missing(factors?.electricity)
    ? electricityKWh / 1000 * factors.electricity.value : null;
  const gasTco2 = !missing(gasEnergyKWh) && !missing(factors?.gas)
    ? gasEnergyKWh / 1000 * factors.gas.value : null;
  const totalTco2 = sumKnown(electricityTco2, gasTco2);
  const intensityTco2PerTon = perTon(totalTco2, productionTon);
  finiteResults({ electricityTco2, gasTco2, totalTco2, intensityTco2PerTon });
  return { electricityTco2, gasTco2, totalTco2, intensityTco2PerTon };
}

export function calculateBaseline(input, factors = null) {
  requireValid(validateBaseline(input));
  validateFactors(factors);
  const electricityKWh = input.electricityKWh ?? null;
  const gasSm3 = input.gasSm3 ?? null;
  const productionTon = input.productionTon ?? null;
  // Confirmed zero fuel does not require a calorific conversion assumption.
  const gasEnergyKWh = gasSm3 === 0 ? 0 :
    !missing(gasSm3) && !missing(input.gasLhvKWhPerSm3)
      ? gasSm3 * input.gasLhvKWhPerSm3 : null;
  const totalFinalEnergyKWh = sumKnown(electricityKWh, gasEnergyKWh);
  finiteResults({ gasEnergyKWh, totalFinalEnergyKWh,
    energyIntensityKWhPerTon: perTon(totalFinalEnergyKWh, productionTon),
    electricityIntensityKWhPerTon: perTon(electricityKWh, productionTon) });
  return {
    period: { ...input.period }, electricityKWh, gasSm3, gasEnergyKWh, productionTon,
    gasLhvKWhPerSm3: input.gasLhvKWhPerSm3 ?? null,
    totalFinalEnergyKWh,
    energyIntensityKWhPerTon: perTon(totalFinalEnergyKWh, productionTon),
    electricityIntensityKWhPerTon: perTon(electricityKWh, productionTon),
    emissions: emissions(electricityKWh, gasEnergyKWh, productionTon, factors),
    emissionFactors: factors ? Object.fromEntries(Object.entries(factors)
      .map(([key, value]) => [key, value ? { ...value } : null])) : null
  };
}

const stopped = (status, code, message) => ({ status, reasons: [{ code, message }] });

export function calculateCondensate(baseline, scenario = {}, factors = null) {
  requireValid(validateBaseline(baseline));
  validateFactors(factors);
  if (!scenario || typeof scenario !== "object" || Array.isArray(scenario))
    throw new InputError([{ field: "scenario", message: "Senaryo nesne olmalı." }]);
  const errors = [];
  const maximumHours = checkPeriod(scenario.period, errors, "scenario.period");
  triState(scenario.steamPresent, "steamPresent", errors);
  triState(scenario.reuseSuitable, "reuseSuitable", errors);
  for (const key of ["additionalLiquidFlowKgPerHour", "operatingHours", "additionalElectricityKWh",
    "additionalOperatingCostTl", "gasPriceTlPerSm3", "electricityPriceTlPerKWh", "investmentTl"])
    numeric(scenario[key], key, errors);
  for (const key of ["returnTemperatureC", "makeupTemperatureC"])
    numeric(scenario[key], key, errors, { max: 100 });
  numeric(scenario.boilerEfficiencyLhv, "boilerEfficiencyLhv", errors, { positive: true, max: 1 });
  if (!missing(scenario.operatingHours) && maximumHours !== null &&
      scenario.operatingHours > maximumHours)
    issue(errors, "operatingHours", `Bu dönem için ${maximumHours} saati aşamaz.`);
  if (errors.length) throw new InputError(errors);
  for (const key of ["kind", "start", "end"])
    if (scenario.period[key] !== baseline.period[key])
      throw new InputError([{ field: "scenario.period", message: "Başlangıç ile senaryo dönemi aynı olmalı." }]);
  if (scenario.steamPresent === false)
    return stopped("ineligible", "no_steam", "Buhar sistemi bulunmuyor.");
  if (scenario.reuseSuitable === false)
    return stopped("ineligible", "reuse_unsuitable", "Kondens geri kullanımı uygun değil.");
  if (scenario.steamPresent !== true || scenario.reuseSuitable !== true)
    return stopped("blocked", "eligibility_unknown", "Buhar varlığı ve geri kullanım uygunluğu doğrulanmalı.");
  if (scenario.flowBasis !== "additional-liquid-at-receiver")
    return stopped("blocked", "flow_basis_unconfirmed", "Tank girişindeki ek sıvı debisi, flash ve hat kayıpları sonrası doğrulanmalı.");
  const required = ["additionalLiquidFlowKgPerHour", "returnTemperatureC",
    "makeupTemperatureC", "operatingHours", "boilerEfficiencyLhv"];
  const absent = required.filter(key => missing(scenario[key]));
  if (missing(baseline.gasSm3)) absent.push("baseline.gasSm3");
  if (missing(baseline.gasLhvKWhPerSm3)) absent.push("baseline.gasLhvKWhPerSm3");
  if (absent.length)
    return { status: "blocked", reasons: absent.map(field => ({ code: "missing_input", field, message: `${field} gerekli.` })) };
  if (scenario.returnTemperatureC <= scenario.makeupTemperatureC)
    throw new InputError([{ field: "returnTemperatureC", message: "Dönüş sıcaklığı taze sudan yüksek olmalı." }]);
  const recoveredHeatKWh = scenario.additionalLiquidFlowKgPerHour * 4.186 *
    (scenario.returnTemperatureC - scenario.makeupTemperatureC) * scenario.operatingHours / 3600;
  const fuelSavingsKWhLhv = recoveredHeatKWh / scenario.boilerEfficiencyLhv;
  const gasSavingsSm3 = fuelSavingsKWhLhv / baseline.gasLhvKWhPerSm3;
  finiteResults({ recoveredHeatKWh, fuelSavingsKWhLhv, gasSavingsSm3 });
  if (gasSavingsSm3 > baseline.gasSm3)
    return stopped("blocked", "baseline_exceeded", "Hesaplanan gaz tasarrufu aynı dönemdeki tesis gazını aşıyor; girdiler çelişkili.");
  const auxiliary = scenario.additionalElectricityKWh;
  const netEnergySavingsKWh = missing(auxiliary) ? null : fuelSavingsKWhLhv - auxiliary;
  const moneyInputs = ["additionalElectricityKWh", "additionalOperatingCostTl",
    "gasPriceTlPerSm3", "electricityPriceTlPerKWh"];
  const missingMoneyInputs = moneyInputs.filter(key => missing(scenario[key]));
  const netSavingsTl = missingMoneyInputs.length ? null :
    gasSavingsSm3 * scenario.gasPriceTlPerSm3 -
    auxiliary * scenario.electricityPriceTlPerKWh - scenario.additionalOperatingCostTl;
  const simplePaybackMonths = scenario.period.kind === "year" &&
    !missing(scenario.investmentTl) && netSavingsTl > 0
      ? scenario.investmentTl / netSavingsTl * 12 : null;
  finiteResults({ netEnergySavingsKWh, netSavingsTl, simplePaybackMonths });
  const before = calculateBaseline(baseline, factors);
  const after = calculateBaseline({
    ...baseline,
    electricityKWh: missing(baseline.electricityKWh) || missing(auxiliary) ? null : baseline.electricityKWh + auxiliary,
    gasSm3: baseline.gasSm3 - gasSavingsSm3
  }, factors);
  const emissionsReductionTco2 = !missing(before.emissions.totalTco2) && !missing(after.emissions.totalTco2)
    ? before.emissions.totalTco2 - after.emissions.totalTco2 : null;
  return {
    status: "calculated", resultType: "scenario_not_measured", period: { ...baseline.period },
    recoveredHeatKWh, fuelSavingsKWhLhv, gasSavingsSm3,
    additionalElectricityKWh: auxiliary ?? null, netEnergySavingsKWh,
    netSavingsTl, missingMoneyInputs, simplePaybackMonths,
    paybackUnavailableReason: simplePaybackMonths !== null ? null :
      scenario.period.kind !== "year" ? "Aylık veya özel dönemden otomatik yıllıklaştırma yapılmaz." :
      "Yatırım ve pozitif net yıllık tasarruf gerekli.",
    before, after, emissionsReductionTco2,
    finalEnergyReductionPercent: !missing(netEnergySavingsKWh) && before.totalFinalEnergyKWh > 0
      ? 100 * netEnergySavingsKWh / before.totalFinalEnergyKWh : null,
    model: {
      waterSpecificHeatKjPerKgK: 4.186,
      formula: "Q_kWh = additionalLiquidFlowKgPerHour * 4.186 * (returnTemperatureC - makeupTemperatureC) * operatingHours / 3600",
      scope: "Tek fazlı sıvı kondens; proses ısı talebindeki azalma olarak yorumlanamaz.",
      inputs: { ...scenario, period: { ...scenario.period }, gasLhvKWhPerSm3: baseline.gasLhvKWhPerSm3 }
    }
  };
}

export function buildOpportunities(equipment = {}) {
  if (!equipment || typeof equipment !== "object" || Array.isArray(equipment))
    throw new InputError([{ field: "equipment", message: "Ekipman bilgisi nesne olmalı." }]);
  const errors = [];
  for (const key of ["steam", "hotWater", "cooling", "compressedAir"])
    triState(equipment[key], key, errors);
  if (errors.length) throw new InputError(errors);
  const candidates = [
    ["condensate", "steam", "Kondens geri kazanımı", "Ek geri döndürülebilir sıvı debisi ve sıcaklıklarını ölçün."],
    ["steam_insulation", "steam", "Buhar hattı yalıtımı", "Yalıtım durumunu ve ilgili hat sıcaklıklarını inceleyin."],
    ["steam_traps", "steam", "Buhar kapanları", "Kapan ve kaçak kontrolünü planlayın."],
    ["hot_water", "hotWater", "Sıcak su devresi", "Isı kaynağı, sıcaklık ve kullanım süresini belirleyin."],
    ["cooling", "cooling", "Soğutma işletimi", "Oda sıcaklığı, kapı süresi ve cihaz tüketimini belirleyin."],
    ["compressed_air", "compressedAir", "Basınçlı hava kaçakları", "Kompresör tüketimini ve üretim dışı yükü ölçün."]
  ];
  return candidates.map(([id, system, title, measurement]) => ({
    id, system, title,
    eligibility: equipment[system] === true ? "eligible" :
      equipment[system] === false ? "ineligible" : "unknown",
    numericPotentialKWh: null,
    tasks: equipment[system] === true ? [measurement] : [],
    nextQuestion: missing(equipment[system]) ? `${title} için ilgili sistemin varlığını doğrulayın.` : null
  }));
}
