// Temsili veriler; gerçek işletme ölçümü veya güncel fiyat/katsayı değildir.
export const demoNotice = "Temsili veri; gerçek işletme ölçümü değildir. Fiyatlar ve emisyon faktörleri yalnız örnek varsayımdır.";
export const annualPeriod = { kind: "year", start: "2023-01-01", end: "2023-12-31", label: "2023 yılı" };
export const monthlyPeriod = { kind: "month", start: "2025-09-01", end: "2025-09-30", label: "Eylül 2025" };
export const demoEmissionFactors = {
  electricity: { value: 0.474, unit: "tCO2/MWh", year: 2022, energyBasis: "electricity",
    source: "ETKB 2022 şebeke emisyon faktörü, dağıtıma bağlı tüketici (Task 1 kaynağı); demo varsayımı, güncelliği doğrulanmadı",
    isDemoAssumption: true },
  gas: { value: 0.20196, unit: "tCO2/MWh", year: 2006, energyBasis: "LHV",
    source: "IPCC 2006 doğal gaz varsayılan faktörü, 56,1 tCO₂/TJ (Task 1 kaynağı); demo varsayımı, güncelliği doğrulanmadı",
    isDemoAssumption: true }
};
export const turgutlu = {
  name: "Turgutlu temsili konserve tesisi",
  notice: demoNotice,
  equipment: { steam: true, hotWater: true, cooling: null, compressedAir: null },
  baseline: { period: { ...annualPeriod }, electricityKWh: 1350000, gasSm3: 815000,
    productionTon: 9200, gasLhvKWhPerSm3: 9.59 },
  condensate: {
    period: { ...annualPeriod }, steamPresent: true, reuseSuitable: true,
    flowBasis: "additional-liquid-at-receiver",
    additionalLiquidFlowKgPerHour: 1000, returnTemperatureC: 80, makeupTemperatureC: 20,
    operatingHours: 4000, boilerEfficiencyLhv: 0.9, additionalElectricityKWh: 8000,
    additionalOperatingCostTl: 10000, gasPriceTlPerSm3: 18.5,
    electricityPriceTlPerKWh: 4.2, investmentTl: 450000
  }
};
export const menemen = {
  name: "Menemen temsili soğuk oda tesisi",
  notice: demoNotice,
  equipment: { steam: false, hotWater: true, cooling: true, compressedAir: null },
  baseline: { period: { ...monthlyPeriod }, electricityKWh: 42000, gasSm3: 0,
    productionTon: 180, gasLhvKWhPerSm3: null }
};
export const akhisar = {
  name: "Akhisar temsili zeytin işleme tesisi",
  notice: demoNotice,
  equipment: { steam: false, hotWater: true, cooling: null, compressedAir: null },
  // Ölçüm olmayan alanlar için örnek sayı uydurulmaz.
  baseline: { period: { ...annualPeriod }, electricityKWh: null, gasSm3: null,
    productionTon: null, gasLhvKWhPerSm3: null }
};
