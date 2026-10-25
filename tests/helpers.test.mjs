import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNumber, buildReportText } from '../public/helpers.mjs';

test('Turkish inputs retain grouped thousands, decimals, missing and confirmed zero', () => {
  const cases = [['1.350.000', 1350000], ['1350000', 1350000], ['9,59', 9.59],
    ['9.59', 9.59], ['1.234,50', 1234.5], ['0', 0], ['', null], ['   ', null], [null, null],
    ['0.900', 0.9], ['-1.234,50', -1234.5], [0, 0]];
  for (const [input, expected] of cases) assert.equal(parseNumber(input), expected, String(input));
});

test('partial numbers, invalid grouping, booleans and nonfinite values cannot silently become measurements', () => {
  for (const input of ['42kWh', '1,350,000', '1,234.5', '12.34.567', '1e4', 'NaN', Infinity, true, {}]) {
    assert.throws(() => parseNumber(input));
  }
});

test('report labels scenario as potential and retains missing payback and model limitations', () => {
  const text = buildReportText({ generatedAt: '2026-10-22', demo: true,
    profile: { name: 'Deneme', electricityKWh: 0, period: { kind: 'month', start: '2025-09-01', end: '2025-09-30' } },
    baseline: { totalFinalEnergyKWh: 42000 }, ranking: { reasons: [{ message: 'Yıllık dönem gerekli.' }] },
    scenario: { status: 'calculated', netSavingsTl: 0, simplePaybackMonths: null, finalEnergyReductionPercent: 0,
      paybackUnavailableReason: 'Aylık veriden yıllıklaştırma yapılmaz.' } });
  assert.match(text, /Elektrik \(kWh\): 0/);
  assert.match(text, /TEMSİLİ DEMO/);
  assert.match(text, /Model karşılaştırmayı geçmedi/);
  assert.match(text, /Gerçekleşmiş etki değildir/);
  assert.match(text, /Basit geri ödeme \(ay\): Bilinmiyor/);
  assert.match(text, /Yıllık dönem gerekli/);
  assert.match(text, /CO2 sonucu hesaplanmadı/);
});
