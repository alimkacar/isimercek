import test from 'node:test';
import assert from 'node:assert/strict';
import { preparationSteps, scenarioRoute } from '../public/guidance.mjs';
import { turgutlu, menemen } from '../public/fixtures.mjs';
import { calculateCondensate } from '../public/core.mjs';

function report(fixture) {
  const profile={...fixture.baseline,equipment:{steam:fixture.equipment.steam ? 'present':'absent'}};
  const scenarioInput={...fixture.condensate,period:profile.period,steamPresent:fixture.equipment.steam};
  return {profile,scenarioInput,scenario:calculateCondensate(profile,scenarioInput)};
}

test('complete example goes to conditional calculation without calling it the best investment',()=>{
  const r=report(turgutlu);
  assert.equal(preparationSteps(r).length,0);
  assert.equal(scenarioRoute(r).view,'senaryo');
  assert.match(scenarioRoute(r).body,/en iyi yatırım olduğu da söylenmiyor/);
});
test('known absent steam never asks for condensate measurements, even with missing baseline data',()=>{
  const r=report(menemen);
  assert.equal(scenarioRoute(r).view,'rapor');
  assert.equal(preparationSteps(r).length,0);
  r.profile.electricityKWh=null;
  assert.deepEqual(preparationSteps(r).map(x=>x.id),['bills']);
});
test('unknown equipment asks for confirmation before offering technical measurements',()=>{
  const r=report(turgutlu);r.profile.equipment.steam='unknown';r.scenarioInput={};
  assert.deepEqual(preparationSteps(r).map(x=>x.id),['steam']);
});
test('unsuitable reuse cannot become a request to enter enough numbers for a calculation',()=>{
  const r=report(turgutlu);r.scenarioInput.reuseSuitable=false;r.scenarioInput.additionalLiquidFlowKgPerHour=null;
  assert.equal(preparationSteps(r).length,0);
  assert.equal(scenarioRoute(r).view,'rapor');
});
test('missing measurements generate distinct tasks; confirmed zeros are not missing',()=>{
  const r=report(turgutlu);Object.assign(r.scenarioInput,{reuseSuitable:null,flowBasis:null,additionalLiquidFlowKgPerHour:null,returnTemperatureC:null,makeupTemperatureC:null,additionalElectricityKWh:null});
  r.scenario=calculateCondensate(r.profile,r.scenarioInput);
  assert.deepEqual(preparationSteps(r).map(x=>x.id),['reuse','flow','temperature','electricity']);
  r.scenarioInput.additionalElectricityKWh=0;r.scenarioInput.additionalOperatingCostTl=0;r.scenarioInput.investmentTl=0;
  assert.deepEqual(preparationSteps(r).map(x=>x.id),['reuse','flow','temperature']);
  assert.equal(scenarioRoute(r).action,'Eksik bilgileri incele');
});
