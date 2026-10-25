import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBaseline, calculateCondensate } from '../public/core.mjs';
import { turgutlu, menemen, demoEmissionFactors } from '../public/fixtures.mjs';
import { energyStatus, condensatePlan, familyGuidance } from '../public/plan.mjs';
import { buildReportText } from '../public/helpers.mjs';
import { normalizeExtraction } from '../lib/extract-core.mjs';
import { SAMPLE_DOCUMENT } from '../public/extraction.mjs';

function report(fixture = turgutlu, overrides = {}) {
  const profile = { ...fixture.baseline, period: { ...fixture.baseline.period, label: '2023 yılı' }, productionTon: fixture.baseline.productionTon,
    annualHours: 4000, equipment: { steam: 'present', cooling: 'unknown', compressedAir: 'present' }, naics: '3114', annualPeriodConfirmed: true };
  const scenarioInput = { ...fixture.condensate, period: { ...fixture.condensate.period }, ...overrides };
  const baseline = calculateBaseline(profile, demoEmissionFactors);
  const scenario = calculateCondensate(profile, scenarioInput, demoEmissionFactors);
  return { profile, baseline, scenario, scenarioInput };
}

test('energy status: Turgutlu is ≈788 TEP, below the 1.000 TEP obligation, pointing to TÜBİTAK 1831 and not VAP', () => {
  const status = energyStatus(report());
  assert.equal(status.status, 'below');
  assert.ok(Math.abs(status.tep - 788.48) < 0.01, String(status.tep));
  assert.match(status.title, /788 TEP/);
  assert.ok(status.points.some(point => /TÜBİTAK 1831/.test(point)));
  assert.ok(status.points.some(point => /VAP/.test(point) && /gönüllü/.test(point)));
  const big = report(); big.profile = { ...big.profile, electricityKWh: 5e6, gasSm3: 1.2e6 };
  assert.equal(energyStatus(big).status, 'above');
  const monthly = { profile: { period: { kind: 'month' }, electricityKWh: 42000, gasSm3: 0 } };
  assert.equal(energyStatus(monthly).status, 'unknown');
});

test('condensate plan solves facility-specific thresholds from the same engine', () => {
  const plan = condensatePlan(report());
  assert.equal(plan.limitMonths, 15); assert.equal(plan.limitSource, 'reference'); assert.equal(plan.decision, 'self');
  assert.ok(Math.abs(plan.thresholds.minFlowKgH - 674.7) < 0.1);
  assert.ok(Math.abs(plan.thresholds.breakEvenFlowKgH - 72.9) < 0.1);
  assert.ok(Math.abs(plan.thresholds.minReturnTempC - 60.5) < 0.1);
  assert.ok(Math.abs(plan.thresholds.maxInvestmentTl - 693202) < 1);
  assert.ok(Math.abs(plan.thresholds.minGasPriceTl - 12.48) < 0.01);
  assert.ok(Math.abs(plan.paybackAtHike - 8.11) < 0.01);
  assert.equal(plan.waterM3, 4000);
  assert.ok(Math.abs(plan.gasPerTonBefore - 88.59) < 0.01 && Math.abs(plan.gasPerTonAfter - 85.07) < 0.01);
  const text = plan.steps.map(step => step.title + ' ' + step.body).join(' ');
  for (const fragment of ['675 kg/saat', '60,5 °C', '693.202 TL', '12,48 TL/Sm³', '8,1 aya', '88,6 → 85,1 Sm³/ton', '4.000 m³']) assert.ok(text.includes(fragment), fragment);
  assert.equal(plan.steps[0].done, true);
});

test('a re-check at the threshold flow lands exactly on the payback limit', () => {
  const plan = condensatePlan(report());
  const atThreshold = report(turgutlu, { additionalLiquidFlowKgPerHour: plan.thresholds.minFlowKgH }).scenario;
  assert.ok(Math.abs(atThreshold.simplePaybackMonths - 15) < 1e-9);
  const atTemp = report(turgutlu, { returnTemperatureC: plan.thresholds.minReturnTempC }).scenario;
  assert.ok(Math.abs(atTemp.simplePaybackMonths - 15) < 1e-9);
});

test("owner's stated payback limit replaces the reference and changes the thresholds", () => {
  const plan = condensatePlan(report(), { maxPaybackMonths: 18 });
  assert.equal(plan.limitSource, 'owner');
  assert.ok(Math.abs(plan.thresholds.minFlowKgH - 574.4) < 0.1);
  assert.ok(Math.abs(plan.thresholds.maxInvestmentTl - 831842) < 1);
  const tight = condensatePlan(report(), { maxPaybackMonths: 6 });
  assert.equal(tight.decision, 'support');
  assert.ok(tight.steps.some(step => /TÜBİTAK 1831/.test(step.body)));
  const slow = condensatePlan(report(turgutlu, { investmentTl: 2500000 }));
  assert.equal(slow.decision, 'defer');
});

test('no plan without a calculated scenario; family guidance uses this facility’s numbers', () => {
  assert.equal(condensatePlan({ scenario: { status: 'blocked' } }), null);
  const r = report(); const plan = condensatePlan(r);
  const air = familyGuidance('compressed_air', r, plan);
  assert.match(air, /4\.000 saat/); assert.match(air, /400 kWh/); assert.match(air, /1\.680 TL/);
  assert.match(familyGuidance('steam_insulation', r, plan), /60,5 °C/);
  assert.match(familyGuidance('condensate', r, plan), /675 kg\/saat/);
  assert.match(familyGuidance('cooling', r, plan), /“Var” seçin/);
  const noAir = { ...r, profile: { ...r.profile, equipment: { ...r.profile.equipment, compressedAir: 'absent' } } };
  assert.match(familyGuidance('compressed_air', noAir, plan), /kapsamı dışında/);
});

test('text report carries the obligation status and the numbered plan', () => {
  const r = report(); r.ranking = { reasons: [] }; r.energyStatus = energyStatus(r); r.plan = condensatePlan(r);
  const text = buildReportText(r);
  assert.match(text, /YÜKÜMLÜLÜK VE DESTEK DURUMU/);
  assert.match(text, /UYGULAMA PLANI — karar sınırı 15 ay/);
  assert.match(text, /Teklif alın: tavan 693\.202 TL/);
});

test('owner payback in the document is extracted and converted from years', () => {
  const text = 'Sahibi: en fazla 1,5 yıl içinde geri dönen yatırımları yapıyoruz.';
  const result = normalizeExtraction({ period: { kind: 'unknown', start: null, end: null, quote: null }, values: [
    { field: 'maxPayback', statedValue: '1,5', unit: 'yıl', month: null, quote: 'en fazla 1,5 yıl içinde geri dönen' }],
    equipment: [], confirmations: [], naicsSuggestion: null, missingInfoQuestions: [] }, { sourceText: text });
  const field = result.fields.find(item => item.id === 'maxPayback');
  assert.equal(field.value, 18); assert.equal(field.target, 'max-payback'); assert.equal(field.grounded, true);
  assert.ok(SAMPLE_DOCUMENT.includes('en fazla 15 ay'));
});
