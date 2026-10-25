import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { predictRaw, rankOpportunities } from '../public/ranker.mjs';

const model = JSON.parse(readFileSync(new URL('../public/model.json', import.meta.url), 'utf8'));
const parity = JSON.parse(readFileSync(new URL('./parity_cases.json', import.meta.url), 'utf8'));
const validInput = { naics: '311511', electricityKWh: 1200000, annualHours: 4000,
  employees: 50, gasPresent: true, annualPeriodConfirmed: true, period: { kind: 'year' } };
const allPresent = { steam: 'present', cooling: 'present', compressedAir: 'present' };

test('Python parity covers raw features, scores and ranking, including missing and invalid fixtures', () => {
  assert.ok(parity.cases.length >= 6);
  for (const fixture of parity.cases) {
    const actual = predictRaw(model, fixture.input);
    assert.equal(actual.features.length, fixture.features.length, fixture.name);
    actual.features.forEach((value, i) => assert.ok(Math.abs(value - fixture.features[i]) <= parity.absoluteTolerance,
      `${fixture.name} feature ${i}: ${value} != ${fixture.features[i]}`));
    for (const family of model.labels) assert.ok(Math.abs(actual.scores[family] - fixture.scores[family]) <= parity.absoluteTolerance,
      `${fixture.name} score ${family}`);
    assert.deepEqual(actual.ranking, fixture.ranking, fixture.name);
  }
});

test('public gate requires an annual period and refuses contradictory monthly data', () => {
  for (const input of [
    { ...validInput, annualPeriodConfirmed: false },
    { ...validInput, annualPeriodConfirmed: undefined },
    { ...validInput, period: { kind: 'month' }, electricityKWh: 42000 },
  ]) {
    const result = rankOpportunities(model, input, allPresent);
    assert.equal(result.status, 'abstained');
    assert.ok(result.reasons.some(item => item.code === 'annual_period_required'));
    assert.equal(result.recommendations.length, 0);
  }
});

test('absence of steam excludes all three steam families even when gas is present', () => {
  const result = rankOpportunities(model, validInput, { ...allPresent, steam: 'absent' });
  assert.equal(result.status, 'ranked');
  assert.deepEqual(new Set(result.excluded.map(item => item.family)), new Set(['condensate', 'steam_traps', 'steam_insulation']));
  assert.equal(result.recommendations.length, 2);
  assert.equal(result.needsConfirmation.length, 0);
});

test('unknown systems require confirmation and are never inferred from gas consumption', () => {
  const result = rankOpportunities(model, validInput, { cooling: 'present' });
  assert.equal(result.recommendations.length, 1);
  assert.equal(result.recommendations[0].family, 'cooling');
  assert.equal(result.needsConfirmation.length, 4);
  assert.equal(rankOpportunities(model, validInput).status, 'needs_confirmation');
});

test('model never hides low-ranking eligible families or assigns savings to them', () => {
  const result = rankOpportunities(model, validInput, allPresent);
  assert.equal(result.status, 'ranked');
  assert.equal(result.recommendations.length, 5);
  assert.ok(result.recommendations.some(item => item.family === 'condensate'));
  for (const item of result.recommendations) {
    assert.ok(item.score >= 0 && item.score <= 1);
    assert.equal('savings' in item, false);
    assert.equal('probability' in item, false);
  }
});

test('negative, nonfinite, string and over-limit numeric inputs are rejected before presenting ranks', () => {
  for (const [field, value] of [
    ['electricityKWh', -1], ['electricityKWh', '1200000'], ['electricityKWh', Infinity],
    ['annualHours', -1], ['annualHours', 8785], ['annualHours', NaN], ['employees', -3], ['employees', true],
  ]) {
    const result = rankOpportunities(model, { ...validInput, [field]: value }, allPresent);
    assert.equal(result.status, 'abstained', `${field}: ${value}`);
    assert.ok(result.reasons.some(item => item.field === field));
  }
});

test('known zero is distinct from missing and zero electricity is outside population', () => {
  const zeros = rankOpportunities(model, { ...validInput, annualHours: 0, employees: 0, gasPresent: false }, allPresent);
  assert.equal(zeros.status, 'ranked');
  assert.equal(zeros.warnings.some(item => item.code === 'imputed_value'), false);
  const missing = rankOpportunities(model, { ...validInput, annualHours: null, employees: null, gasPresent: null }, allPresent);
  assert.equal(missing.status, 'ranked');
  assert.equal(missing.warnings.filter(item => item.code === 'imputed_value').length, 2);
  const result = rankOpportunities(model, { ...validInput, electricityKWh: 0 }, allPresent);
  assert.equal(result.status, 'abstained');
  assert.ok(result.reasons.some(item => item.code === 'positive_electricity_required'));
});

test('missing electricity, unsupported sectors and malformed equipment states abstain', () => {
  assert.equal(rankOpportunities(model, { ...validInput, electricityKWh: null }, allPresent).status, 'abstained');
  for (const naics of ['999999', '312200', '', null, '311']) assert.equal(rankOpportunities(model, { ...validInput, naics }, allPresent).status, 'abstained');
  assert.equal(rankOpportunities(model, { ...validInput, gasPresent: 'yes' }, allPresent).status, 'abstained');
  assert.equal(rankOpportunities(model, validInput, { steam: true }).status, 'abstained');
  const none = rankOpportunities(model, validInput, { steam: 'absent', cooling: 'absent', compressedAir: 'absent' });
  assert.equal(none.status, 'abstained');
  assert.equal(none.excluded.length, 5);
});

test('input objects are not mutated by inference or gating', () => {
  const input = structuredClone(validInput);
  const equipment = structuredClone(allPresent);
  const before = JSON.stringify([input, equipment]);
  predictRaw(model, input);
  rankOpportunities(model, input, equipment);
  assert.equal(JSON.stringify([input, equipment]), before);
});

test('invalid model dimensions, coefficients or feature order fail explicitly', () => {
  const badDimensions = structuredClone(model);
  badDimensions.weights[0].pop();
  assert.throws(() => predictRaw(badDimensions, validInput), TypeError);
  const badCoefficient = structuredClone(model);
  badCoefficient.intercept[0] = NaN;
  assert.throws(() => rankOpportunities(badCoefficient, validInput, allPresent), TypeError);
  const badOrder = structuredClone(model);
  badOrder.preprocessing.featureNames.reverse();
  assert.throws(() => predictRaw(badOrder, validInput), TypeError);
  const badLabels = structuredClone(model);
  badLabels.labels[0] = badLabels.labels[1];
  assert.throws(() => predictRaw(badLabels, validInput), TypeError);
});

test('an unmet baseline performance gate is visible in the public result', () => {
  const researchModel = structuredClone(model);
  researchModel.metadata.performanceGate = 'did_not_beat_naics_baseline';
  const result = rankOpportunities(researchModel, validInput, allPresent);
  assert.ok(result.warnings.some(item => item.code === 'baseline_not_beaten'));
});
