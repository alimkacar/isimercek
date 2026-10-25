import test from "node:test";
import assert from "node:assert/strict";
import { InputError, validateBaseline, calculateBaseline, calculateCondensate, buildOpportunities } from "../public/core.mjs";
import { turgutlu, menemen, akhisar, demoEmissionFactors, monthlyPeriod } from "../public/fixtures.mjs";

const clone = value => structuredClone(value);
const near = (actual, expected, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
const reference = (overrides = {}) => calculateCondensate(turgutlu.baseline,
  { ...turgutlu.condensate, ...overrides }, demoEmissionFactors);

test("01 annual baseline retains energy basis, production and factor provenance", () => {
  const actual = calculateBaseline(turgutlu.baseline, demoEmissionFactors);
  near(actual.gasEnergyKWh, 7815850);
  near(actual.totalFinalEnergyKWh, 9165850);
  near(actual.energyIntensityKWhPerTon, 996.2880434782609);
  assert.equal(actual.period.kind, "year");
  assert.equal(actual.emissionFactors.electricity.isDemoAssumption, true);
});

test("02 monthly data is never silently annualized", () => {
  const actual = calculateBaseline(menemen.baseline);
  assert.equal(actual.electricityKWh, 42000);
  assert.equal(actual.period.label, "Eylül 2025");
  near(actual.energyIntensityKWhPerTon, 233.33333333333334);
  assert.equal(actual.emissions.totalTco2, null);
});

test("03 unknown gas remains unknown while confirmed zero is zero", () => {
  assert.equal(calculateBaseline(akhisar.baseline).totalFinalEnergyKWh, null);
  assert.equal(calculateBaseline(menemen.baseline).gasEnergyKWh, 0);
  assert.equal(calculateBaseline({ ...menemen.baseline, gasSm3: null }).totalFinalEnergyKWh, null);
});

test("04 negative, nonfinite and unparsed string inputs are rejected", () => {
  for (const value of [-100, NaN, Infinity, "42.000", ""]) {
    assert.equal(validateBaseline({ ...menemen.baseline, electricityKWh: value }).valid, false);
    assert.throws(() => calculateBaseline({ ...menemen.baseline, electricityKWh: value }), InputError);
  }
  assert.throws(() => reference({ additionalElectricityKWh: -1 }), InputError);
  assert.throws(() => calculateBaseline(null), InputError);
  assert.throws(() => calculateBaseline({ ...turgutlu.baseline, gasSm3: Number.MAX_VALUE }), InputError);
  assert.throws(() => calculateBaseline({
    ...menemen.baseline, gasSm3: null, productionTon: Number.MIN_VALUE
  }), InputError);
});

test("05 Turgutlu reference includes auxiliary electricity and period-matched emissions", () => {
  const result = reference();
  assert.equal(result.status, "calculated");
  near(result.recoveredHeatKWh, 279066.6666666667);
  near(result.fuelSavingsKWhLhv, 310074.0740740741);
  near(result.gasSavingsSm3, 32333.062989997297);
  near(result.netSavingsTl, 554561.66531495, 1e-6);
  near(result.simplePaybackMonths, 9.73742026855246, 1e-6);
  near(result.netEnergySavingsKWh, 302074.0740740741);
  near(result.emissionsReductionTco2, 58.83056);
  near(result.after.electricityKWh, 1358000);
  assert.equal(result.before.productionTon, result.after.productionTon);
  assert.deepEqual(result.before.period, result.after.period);
  assert.equal(result.resultType, "scenario_not_measured");
});

test("06 monthly scenario uses explicit monthly hours and has no invented annual payback", () => {
  const baseline = { ...turgutlu.baseline, period: monthlyPeriod, gasSm3: 20000 };
  const result = calculateCondensate(baseline, {
    ...turgutlu.condensate, period: monthlyPeriod, operatingHours: 176,
    additionalElectricityKWh: 352, additionalOperatingCostTl: 440
  });
  assert.equal(result.status, "calculated");
  near(result.recoveredHeatKWh, 12278.933333333332);
  assert.equal(result.simplePaybackMonths, null);
  assert.match(result.paybackUnavailableReason, /yıllıklaştırma/);
  assert.equal(result.period.kind, "month");
});

test("07 missing prices preserve energy calculations and withhold money", () => {
  const result = reference({ gasPriceTlPerSm3: null });
  assert.equal(result.status, "calculated");
  near(result.netEnergySavingsKWh, 302074.0740740741);
  assert.equal(result.netSavingsTl, null);
  assert.equal(result.simplePaybackMonths, null);
  assert.deepEqual(result.missingMoneyInputs, ["gasPriceTlPerSm3"]);
});

test("08 missing auxiliary power or maintenance is never assumed zero", () => {
  const auxiliaryMissing = reference({ additionalElectricityKWh: null });
  assert.equal(auxiliaryMissing.netEnergySavingsKWh, null);
  assert.equal(auxiliaryMissing.netSavingsTl, null);
  assert.equal(auxiliaryMissing.after.totalFinalEnergyKWh, null);
  assert.equal(auxiliaryMissing.emissionsReductionTco2, null);
  const maintenanceMissing = reference({ additionalOperatingCostTl: null });
  assert.equal(maintenanceMissing.netSavingsTl, null);
  assert.ok(maintenanceMissing.netEnergySavingsKWh > 0);
  assert.ok(reference({ additionalElectricityKWh: 0, additionalOperatingCostTl: 0 }).netSavingsTl > 0);
});

test("09 steam and receiver flow eligibility are mandatory; no steam tasks when absent", () => {
  assert.equal(reference({ steamPresent: false }).status, "ineligible");
  assert.equal(reference({ steamPresent: null }).status, "blocked");
  assert.equal(reference({ reuseSuitable: false }).status, "ineligible");
  assert.equal(reference({ flowBasis: null }).status, "blocked");
  const candidates = buildOpportunities(akhisar.equipment);
  assert.ok(candidates.filter(item => item.system === "steam").every(item => item.tasks.length === 0));
  const unknown = buildOpportunities({ compressedAir: null }).find(item => item.id === "compressed_air");
  assert.equal(unknown.numericPotentialKWh, null);
  assert.equal(unknown.eligibility, "unknown");
  assert.throws(() => buildOpportunities(null), InputError);
  assert.throws(() => buildOpportunities([]), InputError);
});

test("10 temperature, efficiency and hours enforce physical and period limits", () => {
  for (const overrides of [
    { returnTemperatureC: 101 }, { makeupTemperatureC: -1 }, { returnTemperatureC: 20 },
    { boilerEfficiencyLhv: 0 }, { boilerEfficiencyLhv: 1.01 }, { operatingHours: 8761 }
  ]) assert.throws(() => reference(overrides), InputError);
  assert.throws(() => calculateCondensate(
    { ...turgutlu.baseline, period: monthlyPeriod },
    { ...turgutlu.condensate, period: monthlyPeriod, operatingHours: 721 }), InputError);
  assert.equal(reference({ returnTemperatureC: 100, makeupTemperatureC: 0, boilerEfficiencyLhv: 1 }).status, "calculated");
});

test("11 fuel savings exceeding the same-period baseline are blocked", () => {
  const result = calculateCondensate({ ...turgutlu.baseline, gasSm3: 100 }, turgutlu.condensate);
  assert.equal(result.status, "blocked");
  assert.equal(result.reasons[0].code, "baseline_exceeded");
  assert.equal(result.gasSavingsSm3, undefined);
  assert.equal(calculateCondensate({ ...turgutlu.baseline, gasSm3: 0 }, turgutlu.condensate).status, "blocked");
});

test("12 invalid dates and period mismatches are rejected", () => {
  assert.throws(() => calculateBaseline({
    ...menemen.baseline, period: { ...monthlyPeriod, end: "2025-09-31" }
  }), InputError);
  assert.throws(() => reference({ period: monthlyPeriod, operatingHours: 100 }), InputError);
  assert.throws(() => calculateBaseline({
    ...menemen.baseline, period: { ...monthlyPeriod, kind: "year" }
  }), InputError);
});

test("13 zero or missing production prevents unit-product claims", () => {
  for (const productionTon of [0, null, undefined]) {
    const result = calculateBaseline({ ...turgutlu.baseline, productionTon }, demoEmissionFactors);
    assert.equal(result.energyIntensityKWhPerTon, null);
    assert.equal(result.emissions.intensityTco2PerTon, null);
    assert.equal(result.totalFinalEnergyKWh, 9165850);
  }
});

test("14 investment affects payback only; inputs stay unchanged", () => {
  const original = clone(turgutlu);
  const one = reference(), two = reference({ investmentTl: 900000 });
  near(two.simplePaybackMonths, one.simplePaybackMonths * 2);
  assert.equal(two.fuelSavingsKWhLhv, one.fuelSavingsKWhLhv);
  assert.equal(two.netSavingsTl, one.netSavingsTl);
  assert.deepEqual(turgutlu, original);
  assert.equal(reference({ gasPriceTlPerSm3: 0 }).simplePaybackMonths, null);
});

test("15 CO2 needs supplied factors with provenance and matching energy basis", () => {
  assert.equal(calculateCondensate(turgutlu.baseline, turgutlu.condensate).emissionsReductionTco2, null);
  const bad = clone(demoEmissionFactors);
  bad.gas.energyBasis = "HHV";
  assert.throws(() => calculateBaseline(turgutlu.baseline, bad), InputError);
  const incomplete = clone(demoEmissionFactors);
  delete incomplete.gas.source;
  assert.throws(() => calculateBaseline(turgutlu.baseline, incomplete), InputError);
  // Energy intensity remains finite (1e300); a deliberately huge supplied factor
  // overflows only the CO2 intensity, which must also be rejected.
  const largeFactor = clone(demoEmissionFactors);
  largeFactor.electricity.value = 1e20;
  assert.throws(() => calculateBaseline({
    ...menemen.baseline, electricityKWh: 1, productionTon: 1e-300
  }, largeFactor), error => error instanceof InputError &&
    error.errors.some(item => item.field === "intensityTco2PerTon"));
});
