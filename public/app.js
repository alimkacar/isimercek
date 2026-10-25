import { calculateBaseline, calculateCondensate } from './core.mjs';
import { turgutlu, menemen, demoEmissionFactors } from './fixtures.mjs';
import { rankOpportunities } from './ranker.mjs';
import { parseNumber, buildReportText } from './helpers.mjs';
import { preparationSteps, scenarioRoute } from './guidance.mjs';
import { SAMPLE_DOCUMENT, planActions, provenanceRecord } from './extraction.mjs';

const $ = id => document.getElementById(id);
const state = { model: null, report: null, dirty: true, demo: true, view: 'analiz', guided: false, provenance: null };
const extraction = { result: null, file: null, busy: false, sample: false };
const numericFields = {
  electricity: 'Elektrik tüketimi', gas: 'Doğal gaz tüketimi', lhv: 'Gaz alt ısıl değeri', production: 'Üretim miktarı', hours: 'Çalışma süresi', employees: 'Çalışan sayısı',
  flow: 'Ek sıvı kondens debisi', 'scenario-hours': 'Senaryo çalışma süresi', 'return-temp': 'Kondens dönüş sıcaklığı', 'makeup-temp': 'Taze su sıcaklığı', efficiency: 'Kazan verimi', 'aux-electricity': 'Ek elektrik tüketimi', 'gas-price': 'Gaz fiyatı', 'electricity-price': 'Elektrik fiyatı', 'operating-cost': 'İşletme maliyeti', investment: 'Yatırım tutarı'
};
const fieldTranslations = { electricityKWh: 'Elektrik tüketimi', gasSm3: 'Doğal gaz tüketimi', productionTon: 'Üretim miktarı', gasLhvKWhPerSm3: 'Gaz alt ısıl değeri', annualHours: 'Çalışma süresi', employees: 'Çalışan sayısı', period: 'Tesis dönemi', 'scenario.period': 'Senaryo dönemi', operatingHours: 'Senaryo çalışma süresi', additionalLiquidFlowKgPerHour: 'Ek sıvı kondens debisi', returnTemperatureC: 'Kondens dönüş sıcaklığı', makeupTemperatureC: 'Taze su sıcaklığı', boilerEfficiencyLhv: 'Kazan verimi', additionalElectricityKWh: 'Ek elektrik', additionalOperatingCostTl: 'İşletme maliyeti', gasPriceTlPerSm3: 'Gaz fiyatı', electricityPriceTlPerKWh: 'Elektrik fiyatı', investmentTl: 'Yatırım tutarı', 'baseline.gasSm3': 'Tesis doğal gaz tüketimi', 'baseline.gasLhvKWhPerSm3': 'Gaz alt ısıl değeri' };
const families = [
  {family:'compressed_air', name:'Basınçlı hava ve inert gaz kaçakları', equipment:'compressedAir', next:'Kaçak kontrolü için sistem varlığını ve üretim dışı tüketimi inceleyin.'},
  {family:'steam_traps', name:'Buhar kapanı ve kaçak kontrolü', equipment:'steam', next:'Kapanların çalışmasını ve buhar kaçaklarını sahada inceleyin.'},
  {family:'steam_insulation', name:'Buhar ve kondens hattı yalıtımı', equipment:'steam', next:'Yalıtım durumunu, hat uzunluğunu ve yüzey sıcaklıklarını ölçün.'},
  {family:'condensate', name:'Kondens geri kazanımı', equipment:'steam', next:'Ek geri döndürülebilir sıvı debisini ve sıcaklık farkını ölçün.'},
  {family:'cooling', name:'Soğutma sistemleri', equipment:'cooling', next:'Soğutma sıcaklığını, kapı açılma süresini ve cihaz yükünü inceleyin.'}
];
const number = (value, digits = 0) => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('tr-TR', {maximumFractionDigits: digits}) : '—';
const element = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const setValue = (id, value) => { $(id).value = typeof value === 'number' ? value.toLocaleString('tr-TR', {maximumFractionDigits: 10, useGrouping: true}) : value ?? ''; };
const numeric = id => parseNumber($(id).value, numericFields[id]);
const bool = value => value === 'present' ? true : value === 'absent' ? false : null;
const equipmentValue = value => value === true ? 'present' : value === false ? 'absent' : 'unknown';

function navigate(view) {
  state.view = view;
  const copy = {analiz:['Tesis analizi', 'Enerji fırsatlarını görün.', 'Tesisinizin enerjisini anlayın. İyileştirmeye nereden başlayacağınızı keşfedin.'], senaryo:['Geri kazanım senaryosu', 'Bu ısı yeniden işe yarayabilir.', 'Kondens geri dönüşünün enerjiye ve maliyete etkisini birlikte inceleyin.'], rapor:['Analiz raporu', 'Kararınızın dayanağı burada.', 'Sonucu, kullandığınız veriler ve varsayımlarla birlikte paylaşın.']};
  document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== `view-${view}`);
  document.querySelectorAll('.nav-item').forEach(button => { const active = button.dataset.view === view; button.classList.toggle('active', active); if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
  $('current-view-label').textContent = copy[view][0]; $('page-title').textContent = copy[view][1]; $('page-description').textContent = copy[view][2];
  renderTour();
}

function markDirty() {
  state.dirty = true;
  state.guided = false; renderTour();
  document.body.classList.add('report-dirty');
  if (!$('stale-report-warning')) {
    const warning = element('p','stale-report-warning notice error','GÜNCEL DEĞİL — Girdiler değişti. Bu rapor önceki hesaba aittir. Analizi güncellemeden çıktı kullanmayın.');
    warning.id = 'stale-report-warning';
    $('report-content').prepend(warning);
  }
  $('status').classList.add('dirty');
  $('status').textContent = 'Girdiler değişti. Görünen sonuçlar önceki hesaba aittir; rapor için analizi güncelleyin.';
  for (const id of ['analysis-results', 'scenario-results', 'report-content', 'preparation-plan', 'scenario-guidance']) $(id).classList.add('stale-output');
  for (const id of ['download-json', 'download-text', 'print-report']) $(id).disabled = true;
  $('error-box').hidden = true;
}

function getProfile() {
  const kind = $('period-kind').value, start = $('period-start').value, end = $('period-end').value;
  const period = {kind,start,end,label:kind === 'year' ? `${start.slice(0,4)} yılı` : kind === 'month' ? `${start.slice(0,7)} ayı` : `${start} – ${end}`};
  const profile = {name: $('facility-name').value.trim() || 'İsimsiz tesis',period,electricityKWh:numeric('electricity'),gasSm3:numeric('gas'),gasLhvKWhPerSm3:numeric('lhv'),productionTon:numeric('production'),annualHours:numeric('hours'),employees:numeric('employees'),naics:$('naics').value.trim(),equipment:{steam:$('steam').value,cooling:$('cooling').value,compressedAir:$('compressed-air').value},annualPeriodConfirmed:$('annual-confirmation').checked};
  for (const [key,label] of [['annualHours','Çalışma süresi'],['employees','Çalışan sayısı']]) if (profile[key] !== null && profile[key] < 0) throw new Error(`${label}: negatif olamaz.`);
  if (profile.employees !== null && !Number.isInteger(profile.employees)) throw new Error('Çalışan sayısı: tam sayı girin.');
  return profile;
}

function getScenario(profile) {
  const efficiency = numeric('efficiency');
  return {period:{...profile.period},steamPresent:bool(profile.equipment.steam),reuseSuitable:bool($('reuse-suitable').value),flowBasis:$('flow-confirmation').checked ? 'additional-liquid-at-receiver' : null,additionalLiquidFlowKgPerHour:numeric('flow'),operatingHours:numeric('scenario-hours'),returnTemperatureC:numeric('return-temp'),makeupTemperatureC:numeric('makeup-temp'),boilerEfficiencyLhv:efficiency === null ? null : efficiency/100,additionalElectricityKWh:numeric('aux-electricity'),additionalOperatingCostTl:numeric('operating-cost'),gasPriceTlPerSm3:numeric('gas-price'),electricityPriceTlPerKWh:numeric('electricity-price'),investmentTl:numeric('investment')};
}

function explainIssue(issue) {
  if (issue.code === 'missing_input') return `${fieldTranslations[issue.field] || issue.field} gerekli.`;
  if (issue.field === 'boilerEfficiencyLhv') return 'Kazan verimi: %0’dan büyük ve en fazla %100 olan bir değer girin.';
  const label = fieldTranslations[issue.field];
  const message = String(issue.message).replace(', en fazla Infinity', '');
  return label ? `${label}: ${message}` : message;
}

function calculate() {
  try {
    const profile = getProfile(), factors = $('demo-factors').checked ? structuredClone(demoEmissionFactors) : null;
    const baseline = calculateBaseline(profile, factors);
    let ranking = {status:'abstained',recommendations:[],needsConfirmation:[],excluded:[],warnings:[],reasons:[{code:'model_unavailable',message:'Model dosyası yüklenemedi; sıralama üretilmedi. Fizik hesapları bağımsız çalışır.'}]};
    if (state.model) {
      try { ranking = rankOpportunities(state.model, {...profile,gasPresent:profile.gasSm3 === null ? null : profile.gasSm3 > 0}, profile.equipment); }
      catch(error) { ranking.reasons = [{code:'model_invalid',message:`Model çalıştırılamadı: ${error.message} Fizik hesabı bağımsız olarak devam etti.`}]; }
    }
    let scenarioInput = null, scenario;
    try { scenarioInput = getScenario(profile); scenario = calculateCondensate(profile, scenarioInput, factors); }
    catch(error) { scenario = {status:'blocked',reasons:(error.errors || [{message:error.message}]).map(issue=>({code:'invalid_scenario_input',message:explainIssue(issue)}))}; }
    state.report = {generatedAt:new Date().toISOString(),profile,baseline,ranking,scenario,scenarioInput,demo:state.demo,modelVersion:state.model?.metadata?.version || null,provenance:state.sample === 'extracted' ? state.provenance : null};
    state.dirty = false;
    document.body.classList.remove('report-dirty');
    renderProfileSummary(profile); renderBaseline(baseline); renderRanking(ranking, profile); renderScenario(scenario); renderPreparation(state.report); renderReport(state.report); renderTour();
    $('status').classList.remove('dirty');
    $('status').textContent = `Son güncelleme ${new Date().toLocaleTimeString('tr-TR', {hour:'2-digit',minute:'2-digit'})}${ranking.status === 'abstained' ? ' · Model sıralaması üretilmedi' : ''}${scenario.status === 'calculated' ? '' : ' · Kondens hesabı hazır değil'}`;
    $('error-box').hidden = true;
    for (const id of ['analysis-results','scenario-results','report-content','preparation-plan','scenario-guidance']) $(id).classList.remove('stale-output');
    for (const id of ['download-json','download-text','print-report']) $(id).disabled = false;
  } catch (error) {
    markDirty();
    const box = $('error-box'); box.replaceChildren(element('strong', '', 'Hesabı güncellemek için girdileri kontrol edin.'));
    const list = element('ul');
    const messages = error.errors ? error.errors.map(explainIssue) : [error.message];
    messages.forEach(message => list.append(element('li','',message))); box.append(list); box.hidden = false;
    $('status').textContent = 'Hesap güncellenemedi. Önceki sonuçlar geçerli girdi olarak kullanılamaz.';
  }
}

function goTo(view) {
  navigate(view);
  $('page-title').setAttribute('tabindex', '-1');
  $('page-title').focus({preventScroll:true});
  $('main').scrollIntoView({block:'start'});
}

function revealField(id, view) {
  navigate(view);
  const input = $(id);
  for (let node = input.parentElement; node; node = node.parentElement) if (node.tagName === 'DETAILS') node.open = true;
  input.focus({preventScroll:true}); input.scrollIntoView({block:'center'});
}

function stepList(steps, interactive = true) {
  const list = element('ol', 'preparation-list');
  for (const step of steps) {
    const item = element('li'), copy = element('div');
    copy.append(element('h3','',step.title), element('p','',step.body)); item.append(copy);
    if (interactive) { const button = element('button','text-button','İlgili alana git →'); button.type='button'; button.setAttribute('aria-label',`${step.title} — ilgili alana git`); button.addEventListener('click',()=>revealField(step.target,step.view)); item.append(button); }
    list.append(item);
  }
  return list;
}

function renderPreparation(report) {
  const steps = preparationSteps(report), route = scenarioRoute(report);
  const root = $('preparation-plan'); root.replaceChildren(); root.hidden = steps.length === 0;
  if (steps.length) {
    root.append(element('p','eyebrow','SIRADAKİ ADIM'),element('h2','','Şimdi ne yapmalıyım?'),element('p','guide-copy','Son güncellenen girdilere göre aşağıdan başlayın. Bilmediğiniz değeri tahmin etmek yerine boş bırakın; bilgi geldikçe analizi güncelleyin.'), stepList(steps.slice(0,3)));
    if (steps.length > 3) { const rest=element('details','input-help'); rest.append(element('summary','',`Sonraki ${steps.length-3} hazırlık adımını göster`),stepList(steps.slice(3))); root.append(rest); }
  }
  const scenarioGuide = $('scenario-guidance'); scenarioGuide.replaceChildren(element('p','eyebrow','BU ADIMIN AMACI'),element('h2','',route.title),element('p','guide-copy',route.body));
  if (steps.length) { const details=element('details','input-help'); details.open=report.scenario.status !== 'calculated'; details.append(element('summary','',`Bilgi ve ölçüm rehberi · ${steps.length} adım`),stepList(steps)); scenarioGuide.append(details); }
  const copy=element('div'); copy.append(element('h3','',route.title),element('p','',route.body));
  const button=element('button','button primary',route.action+' →');button.type='button';button.addEventListener('click',()=>goTo(route.view));
  $('scenario-route').replaceChildren(copy,button);
}

function renderTour() {
  const root=$('tour'); root.hidden=!state.guided; $('start-card').hidden=state.guided || state.sample !== 'turgutlu';
  if(!state.guided)return;
  const index=['analiz','senaryo','rapor'].indexOf(state.view);
  const titles=['Önce tesisin hikâyesi.','Aynı sıcak su, daha az yakıt.','Bir sonuç ve doğrulanacaklar listesi.'];
  const descriptions=[
    'Turgutlu’daki temsili konserve tesisi buhar kullanıyor. Önce bir yılın tüketim ve üretimini bir araya getiriyoruz. Aşağıdaki not hazırlanmış bir örnektir; uygulama bir belgeyi okuyup çıkarmadı.',
    'Kondens, buharın yeniden suya dönüşmüş hâli. Bu örnekte tank girişine saatte 1.000 kg ek suyun 80 °C’de geri dönebildiğini, taze suyun 20 °C olduğunu ve sistemin yılda 4.000 saat çalıştığını varsayıyoruz.',
    'Rapordaki %3,3, örnek girdilerle hesaplanan toplam enerji azaltım potansiyelidir. Gerçek tasarruf iddiası değildir. Sahada uygunluk ve ölçümler doğrulanmadan yatırım kararı verilmez.'
  ];
  const top=element('div','tour-top'), exit=element('button','text-button','Rehberi kapat');exit.type='button';exit.addEventListener('click',()=>{state.guided=false;renderTour();});
  top.append(element('p','eyebrow',`AÇIKLAMALI ÖRNEK · ${index+1} / 3`),exit);
  root.replaceChildren(top,element('h2','',titles[index]),element('p','guide-copy',descriptions[index]));
  if(index===0){
    const source=element('details','input-help example-note');source.open=true;source.append(element('summary','','Örnek kaynak notu · temsili veri'));
    source.append(makeTable([['2023 elektrik toplamı','1.350.000 kWh · fatura toplamı yerine kullanılan örnek'],['2023 doğal gaz toplamı','815.000 Sm³ · fatura toplamı yerine kullanılan örnek'],['2023 üretim toplamı','9.200 ton · üretim kaydı yerine kullanılan örnek'],['Buhar sistemi','Var · örnek tesis kabulü']]));
    source.append(element('p','guide-copy','Bu girdilerle yıllık enerji 9.165,9 MWh, ton başına enerji 996,3 kWh bulunur. Gaz için 9,59 kWh/Sm³ alt ısıl değer varsayılmıştır.'));
    root.append(source);
  } else if(index===1){
    root.append(element('p','tour-takeaway','Okuyacağınız sonuç: yaklaşık 302,1 MWh/yıl net enerji azalması. Ek pompa elektriği hesaptan düşülür. Örnek fiyatlarla net tasarruf yaklaşık 554.562 TL/yıldır.'));
    const help=element('details','input-help');help.append(element('summary','','Debi veya uygunluğu bilmiyorsam?'),element('p','','“Bir örnekle dene → Ölçümler eksikse?” seçeneğini açın. Uygulama sayı uydurmak yerine hangi bilginin kimden veya nereden alınacağını gösterir.'));root.append(help);
  } else {
    root.append(element('p','tour-takeaway','Paylaşılacak üç şey: kullanılan girdiler, bunlara bağlı hesaplanan potansiyel ve saha doğrulaması için sonraki adımlar. PDF / Yazdır ile raporu alabilirsiniz.'));
  }
  const actions=element('div','tour-actions');
  if(index===0){const inspect=element('button','button secondary','Formdaki karşılığını gör');inspect.type='button';inspect.addEventListener('click',()=>revealField('electricity','analiz'));actions.append(inspect);}
  if(index>0){const back=element('button','button secondary','← Önceki adım');back.type='button';back.addEventListener('click',()=>goTo(['analiz','senaryo','rapor'][index-1]));actions.append(back);}
  const next=element('button','button primary',index===0?'2. Kondens örneğine geç →':index===1?'3. Raporu yorumla →':'Ölçümler eksikse ne olur? →');next.type='button';next.addEventListener('click',()=>{if(index<2)goTo(['senaryo','rapor'][index]);else{loadSample('eksik');goTo('analiz');}});actions.append(next);root.append(actions);
}

function metric(label, value, unit, note, primary = false, digits = 0) {
  const card = element('div',`metric-card${primary ? ' primary-metric' : ''}`);
  const valueNode = element('span','metric-value',number(value,digits));
  if (unit) valueNode.append(element('span','metric-unit',unit));
  card.append(element('span','metric-label',label),valueNode,element('span','metric-footnote',value === null ? 'Eksik girdi · hesaplanmadı' : note));
  return card;
}

function renderProfileSummary(profile) {
  $('profile-summary-name').textContent = profile.name === 'İsimsiz tesis' ? 'Tesisinizi tanımlayın' : profile.name;
  $('profile-summary-meta').textContent = [profile.period.label,profile.electricityKWh === null ? 'Elektrik bilgisi bekleniyor' : `${number(profile.electricityKWh/1000,1)} MWh elektrik`,profile.gasSm3 === null ? 'Gaz bilgisi bekleniyor' : `${number(profile.gasSm3)} Sm³ gaz`].join(' · ');
}

function renderBaseline(baseline) {
  $('baseline-period').textContent = baseline.period.label;
  const cards = [metric('Toplam enerji kullanımı',baseline.totalFinalEnergyKWh === null ? null : baseline.totalFinalEnergyKWh/1000,'MWh','Elektrik ve doğal gazın enerji karşılığı',true,1),metric('Bir ton üretim için',baseline.energyIntensityKWhPerTon,'kWh','Üretim başına enerji kullanımı',false,1)];
  $('baseline-metrics').replaceChildren(...cards);
}

function renderRanking(ranking, profile) {
  const messageBox = $('ranking-messages'); messageBox.replaceChildren();
  const alerts = $('ranking-alerts'); alerts.replaceChildren();
  for (const issue of ranking.reasons) alerts.append(element('p','ranking-message',explainIssue(issue)));
  for (const issue of ranking.warnings.filter(item=>item.code !== 'baseline_not_beaten')) messageBox.append(element('p','ranking-message',explainIssue(issue)));
  const entries = new Map();
  for (const [key,type] of [['recommendations','eligible'],['needsConfirmation','unknown'],['excluded','excluded']]) for (const entry of ranking[key]) entries.set(entry.family,{...entry,type});
  const all = families.map(family => entries.get(family.family) ? {...family,...entries.get(family.family)} : {...family,type:profile.equipment[family.equipment] === 'absent' ? 'excluded' : profile.equipment[family.equipment] === 'present' ? 'unranked' : 'unknown'});
  all.sort((a,b)=>(a.rank ?? 100)-(b.rank ?? 100));
  const nodes = all.map(entry => {
    const node = element('div',`opportunity ${entry.type}`), body = element('div','opportunity-body'), head = element('div','opportunity-head');
    const label = {eligible:'İnceleme adayı',unknown:'Ekipman teyidi',excluded:'Sistem yok',unranked:'Sıralama yok'}[entry.type];
    head.append(element('h3','',entry.name),element('span',`tag ${entry.type === 'eligible' ? 'green' : entry.type === 'unknown' ? 'amber' : 'neutral'}`,label));
    body.append(head,element('p','',entry.type === 'excluded' ? 'Sistem bulunmadığı için bu tesisin kapsamı dışında.' : entry.next));
    if (typeof entry.score === 'number') { const score = element('span','opportunity-score',`Benzerlik ${number(entry.score,3)}`); score.title = 'Geçmiş ITAC kayıtlarındaki benzerlik skoru (0–1); uygunluk veya tasarruf olasılığı değildir.'; body.append(score); }
    node.append(element('span','opportunity-number',entry.rank ? String(entry.rank).padStart(2,'0') : '—'),body); return node;
  });
  $('opportunities').replaceChildren(...nodes);
}

function makeTable(rows, className = 'report-table', header = null) {
  const table = element('table',className);
  if (header) {const thead=element('thead'),tr=element('tr'); header.forEach(text=>tr.append(element('th','',text)));thead.append(tr);table.append(thead);}
  const tbody = element('tbody'); for (const row of rows) {const tr=element('tr');row.forEach(text=>tr.append(element('td','',text)));tbody.append(tr);} table.append(tbody); return table;
}

function renderScenario(scenario) {
  $('scenario-badge').textContent=scenario.status === 'calculated' ? 'Hesaplanan potansiyel' : scenario.status === 'ineligible' ? 'Bu koşulda uygun değil' : 'Bilgi bekleniyor';
  $('scenario-badge').className=`tag ${scenario.status === 'calculated' ? 'green' : 'amber'}`;
  const status = $('scenario-status'),metrics = $('scenario-metrics'),comparison=$('comparison'); status.replaceChildren(); metrics.replaceChildren(); comparison.replaceChildren();
  if (scenario.status !== 'calculated') {
    const notice=element('div','notice subtle'),content=element('div'); content.append(element('strong','',scenario.status === 'ineligible' ? 'Bu tesis için kondens senaryosu uygun değil.' : 'Hesap için saha bilgileri gerekli.'));
    for(const issue of scenario.reasons) content.append(element('p','',explainIssue(issue)));notice.append(content);status.append(notice);comparison.append(element('p','muted',scenario.status === 'ineligible' ? 'Bu koşulda karşılaştırma üretilmez.' : 'Gerekli girdiler doğrulandığında karşılaştırma burada görünür.'));return;
  }
  status.append(element('p','muted','Bu bir tahmindir; gerçekleşmiş tasarruf değildir.'));
  metrics.append(metric('Net enerji azalması',scenario.netEnergySavingsKWh === null ? null : scenario.netEnergySavingsKWh/1000,'MWh',`%${number(scenario.finalEnergyReductionPercent,2)} · ek elektrik dahil`,true,1),metric('Net dönem tasarrufu',scenario.netSavingsTl,'TL','Ek elektrik ve işletme maliyeti düşüldü'),metric('Gaz tasarrufu',scenario.gasSavingsSm3,'Sm³','Aynı dönem için'),metric('Basit geri ödeme',scenario.simplePaybackMonths,'ay',scenario.paybackUnavailableReason || 'Finansman ve iskonto dahil değil',false,1));
  if (scenario.emissionsReductionTco2 !== null) metrics.append(metric('Demo emisyon azalması',scenario.emissionsReductionTco2,'tCO₂','Doğrulanmamış örnek katsayılarla',false,2));
  if (scenario.simplePaybackMonths === null && scenario.paybackUnavailableReason) status.append(element('p','ranking-message',scenario.paybackUnavailableReason));
  const rows = [['Nihai enerji (MWh)',number(scenario.before.totalFinalEnergyKWh === null ? null : scenario.before.totalFinalEnergyKWh/1000,1),number(scenario.after.totalFinalEnergyKWh === null ? null : scenario.after.totalFinalEnergyKWh/1000,1)],['Enerji yoğunluğu (kWh/ton)',number(scenario.before.energyIntensityKWhPerTon,1),number(scenario.after.energyIntensityKWhPerTon,1)],['Doğal gaz (Sm³)',number(scenario.before.gasSm3),number(scenario.after.gasSm3)]];
  if (scenario.before.emissions.totalTco2 !== null) rows.push(['Demo emisyon (tCO₂)',number(scenario.before.emissions.totalTco2,2),number(scenario.after.emissions.totalTco2,2)]);
  comparison.append(makeTable(rows,'comparison-table',['Gösterge','Mevcut','Senaryo']));
}

function renderReport(report) {
  const root=$('report-content'),p=report.profile,b=report.baseline,s=report.scenario;
  root.replaceChildren(element('p','eyebrow','ISIMERCEK / ENERJİ ÖN İNCELEME'),element('h2','',p.name),element('p','report-meta',`${p.period.label} · ${p.period.start} — ${p.period.end} · ${new Date(report.generatedAt).toLocaleString('tr-TR')}`));
  root.append(element('p','report-note',report.demo ? 'TEMSİLİ DEMO — Gerçek tesis ölçümü veya doğrulanmış saha tasarrufu değildir. Düzenlenen örnek veriler de demo olarak değerlendirilir.' : 'Kullanıcı girdileriyle oluşturulmuştur. Saha doğrulaması yapılmamıştır.'));
  const summary=element('section','report-summary');summary.append(element('h3','','Bu rapor ne söylüyor?'));
  summary.append(element('p','',s.status === 'calculated' ? (s.netEnergySavingsKWh !== null ? `Girilen koşullarda kondens geri kazanımı, dönem boyunca ${number(s.netEnergySavingsKWh/1000,1)} MWh net enerji azalması sağlayabilir. ${s.finalEnergyReductionPercent === null ? 'Toplam tüketimdeki payı için başlangıç verileri tamamlanmalı.' : `Bu, başlangıçtaki toplam enerjinin %${number(s.finalEnergyReductionPercent,2)} kadarıdır.`}` : 'Isı geri kazanımı hesaplandı. Ek elektrik tüketimi eksik olduğu için net enerji sonucu henüz tamamlanmadı.') : scenarioRoute(report).body));
  summary.append(element('p','report-note','Önlem sıralaması deneysel modelden, sayısal etki ayrı mühendislik hesabından gelir. Bu sonuç bir yatırım onayı değildir.'));root.append(summary);
  root.append(element('h3','','Mevcut durum'),makeTable([['Dönem elektrik tüketimi',`${number(p.electricityKWh)} kWh`],['Dönem doğal gaz tüketimi',`${number(p.gasSm3)} Sm³`],['Gaz alt ısıl değeri',`${number(p.gasLhvKWhPerSm3,3)} kWh/Sm³`],['Üretim miktarı',`${number(p.productionTon)} ton`],['Toplam nihai enerji',`${number(b.totalFinalEnergyKWh)} kWh`],['Enerji yoğunluğu',`${number(b.energyIntensityKWhPerTon,2)} kWh/ton`],['NAICS sektör kodu',p.naics || 'Bilinmiyor']]));
  root.append(element('h3','','Kondens senaryosunun hesaplanan etkisi'));
  if(s.status === 'calculated') root.append(makeTable([['Net enerji azalması',`${number(s.netEnergySavingsKWh)} kWh · %${number(s.finalEnergyReductionPercent,2)}`],['Net dönem maliyet azalması',`${number(s.netSavingsTl,2)} TL`],['Basit geri ödeme',s.simplePaybackMonths === null ? s.paybackUnavailableReason : `${number(s.simplePaybackMonths,2)} ay`],['Demo emisyon azalması',s.emissionsReductionTco2 === null ? 'Katsayı seçilmedi; hesaplanmadı' : `${number(s.emissionsReductionTco2,2)} tCO₂ — yalnız demo varsayımı`]]));
  else for(const issue of s.reasons) root.append(element('p','report-note',explainIssue(issue)));
  if(s.status === 'calculated') {
    const input=report.scenarioInput;
    root.append(element('h3','','Hangi koşullarla hesaplandı?'),makeTable([
      ['Ek sıvı kondens debisi',`${number(input.additionalLiquidFlowKgPerHour)} kg/saat · tank girişinde, kayıplar sonrası`],
      ['Dönüş suyu / taze su sıcaklığı',`${number(input.returnTemperatureC,1)} °C / ${number(input.makeupTemperatureC,1)} °C`],
      ['Dönem çalışma süresi / kazan verimi',`${number(input.operatingHours)} saat / %${number(input.boilerEfficiencyLhv*100,1)} (alt ısıl değer)`],
      ['Ek elektrik / ek işletme gideri',`${number(input.additionalElectricityKWh)} kWh / ${number(input.additionalOperatingCostTl)} TL`],
      ['Gaz / elektrik birim fiyatı',`${number(input.gasPriceTlPerSm3,2)} TL/Sm³ / ${number(input.electricityPriceTlPerKWh,2)} TL/kWh`],
      ['Yatırım tutarı',`${number(input.investmentTl)} TL`]
    ]),element('p','report-note','Buhar varlığı, geri kullanım uygunluğu ve debi koşulu girdilerde onaylıdır; uygulama bunları sahada doğrulamaz. “—” eksik bilgidir, sıfır değildir.'));
  }
  root.append(element('h3','','Veriler nereden geliyor?'));
  if(report.provenance){const src=report.provenance,verified=src.accepted.filter(item=>item.grounded===true).length;root.append(element('p','report-note',`${src.accepted.length} alan ${src.sample ? 'temsili örnek belgeden ' : 'kullanıcının belgesinden '}Gemini${src.model ? ` (${src.model})` : ''} ile okundu ve kullanıcı onayıyla forma aktarıldı. ${verified} alanın alıntısı kaynak metinde birebir doğrulandı. Aylık toplam ve birim dönüşümünü IsıMercek yaptı; Gemini hesap yapmadı.`),makeTable(src.accepted.map(item=>[item.label,`${item.display}${item.derivation ? ' · '+item.derivation : ''}`])));if(src.rejected.length)root.append(element('p','report-note',`Aktarılmayan öneriler: ${src.rejected.join(', ')}.`));root.append(element('p','report-note','Saha ölçümü yapılmadı; belge değerleri bağımsız olarak doğrulanmadı.'));}
  else root.append(element('p','report-note',report.demo ? 'Hazır örnekteki tüketim, üretim, ölçüm, fiyat ve katsayılar temsili kabullerdir. Otomatik belge okuma veya saha ölçümü yapılmadı.' : 'Tesis ve senaryo değerleri kullanıcı tarafından elle girildi. Kaynak belge okunmadı; değerler bağımsız olarak doğrulanmadı.'));
  root.append(element('h3','','Bundan sonra ne yapılmalı?'));
  const steps=preparationSteps(report);
  if(steps.length)root.append(stepList(steps,false));
  else root.append(element('p','report-note',s.status === 'ineligible' ? 'Kondens yerine tesiste mevcut diğer sistemler için bir uzmanla inceleme planlayın. Bu rapordan kondens tasarrufu sonucu çıkarılamaz.' : 'Bir enerji uzmanıyla geri kullanım uygunluğunu, ek debiyi, sıcaklıkları ve çalışma süresini sahada doğrulayın. Maliyetleri tekliflerle güncelleyin. Uygulama sonrasında aynı kapsamda tüketim ve üretim ölçerek etkiyi karşılaştırın.'));
  root.append(element('p','report-note','Model sınırı: deneysel sıralama basit sektör karşılaştırmasını geçmedi. Türkiye’de saha doğrulaması yoktur; sıralama teknik uygunluk veya tasarruf olasılığı değildir.'));
  const audit=element('details','input-help report-audit');audit.append(element('summary','','Ayrıntılı hesap ve model kaydı'),element('p','report-note','Girdiler, katsayılar ve model sınırları. “Bilinmiyor” sıfır anlamına gelmez. Veri dosyası (JSON) ayrıca indirilebilir.'),element('div','report-pre',buildReportText(report)));root.append(audit);
}

function loadSample(sample) {
  state.sample=sample; state.provenance=null;
  const fixture = sample === 'turgutlu' || sample === 'eksik' ? structuredClone(turgutlu) : sample === 'menemen' ? menemen : null;
  if(sample === 'eksik'){fixture.name='Turgutlu · ölçümleri eksik temsili tesis';for(const field of ['reuseSuitable','flowBasis','additionalLiquidFlowKgPerHour','returnTemperatureC','makeupTemperatureC','additionalElectricityKWh'])fixture.condensate[field]=null;}
  const annualDemo=sample === 'turgutlu' || sample === 'eksik';
  state.demo = fixture !== null;
  const completedYear = new Date().getFullYear() - 1;
  const period = sample === 'turgutlu' ? {kind:'year',start:'2023-01-01',end:'2023-12-31'} : fixture?.baseline.period || {kind:'year',start:`${completedYear}-01-01`,end:`${completedYear}-12-31`};
  const baseline=fixture?.baseline || {},scenario=fixture?.condensate || {},equipment=fixture?.equipment || {};
  setValue('facility-name',fixture?.name || '');setValue('period-kind',period.kind);setValue('period-start',period.start);setValue('period-end',period.end);
  for(const [id,key] of [['electricity','electricityKWh'],['gas','gasSm3'],['lhv','gasLhvKWhPerSm3'],['production','productionTon']])setValue(id,baseline[key]);
  setValue('hours',annualDemo ? 4000 : null);setValue('employees',null);setValue('naics',fixture ? '3114' : '');
  for(const [id,key] of [['steam','steam'],['cooling','cooling'],['compressed-air','compressedAir']])setValue(id,equipmentValue(equipment[key]));
  $('annual-confirmation').checked=annualDemo;$('demo-factors').checked=annualDemo;
  setValue('reuse-suitable',equipmentValue(scenario.reuseSuitable));$('flow-confirmation').checked=Boolean(scenario.flowBasis);
  for(const [id,key] of [['flow','additionalLiquidFlowKgPerHour'],['scenario-hours','operatingHours'],['return-temp','returnTemperatureC'],['makeup-temp','makeupTemperatureC'],['aux-electricity','additionalElectricityKWh'],['operating-cost','additionalOperatingCostTl'],['gas-price','gasPriceTlPerSm3'],['electricity-price','electricityPriceTlPerKWh'],['investment','investmentTl']])setValue(id,scenario[key]);
  setValue('efficiency',scenario.boilerEfficiencyLhv === undefined ? null : scenario.boilerEfficiencyLhv*100);
  $('demo-notice').hidden=!state.demo;$('data-badge').textContent=state.demo ? 'DEMO VERİ' : 'KULLANICI GİRDİSİ';$('data-badge').className=`tag ${state.demo ? 'amber' : 'neutral'}`;
  for(const name of ['turgutlu','menemen','eksik','blank'])$(`load-${name}`).classList.toggle('active',name === sample);
  $('sample-menu').open = false;
  $('profile-editor').open = false;
  $('scenario-editor').open = false;
  navigate('analiz');
  markDirty(); calculate();
}

function setExtractStatus(message, tone = '') {
  const node = $('extract-status'); node.textContent = message || ''; node.className = `extract-status${tone ? ' ' + tone : ''}`;
}

function clearExtraction() {
  extraction.result = null; $('extract-results').hidden = true; $('extract-results').replaceChildren();
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Dosya okunamadı.'));
    reader.readAsDataURL(file);
  });
}

async function runExtraction() {
  if (extraction.busy) return;
  const text = $('extract-text').value.trim();
  if (!text && !extraction.file) { setExtractStatus('Önce bir metin yapıştırın, temsili belgeyi yükleyin veya dosya ekleyin.', 'error'); return; }
  extraction.busy = true; clearExtraction();
  const button = $('extract-run'); button.disabled = true; button.textContent = 'Gemini belgeyi okuyor…';
  setExtractStatus('Belge Gemini’ye gönderildi. Değerler, birimler ve kaynak alıntıları çıkarılıyor…');
  try {
    const body = { text: text || null };
    if (extraction.file) body.file = { mimeType: extraction.file.type, name: extraction.file.name, data: await readFileAsBase64(extraction.file) };
    const response = await fetch('./api/extract', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    let data;
    try { data = await response.json(); }
    catch { data = { ok: false, error: response.status === 404 || response.status === 405 ? 'Bu yayında Gemini adımı yok. Alanları elle girebilir veya hazır örnekleri kullanabilirsiniz.' : `Sunucu yanıtı okunamadı (${response.status}).` }; }
    if (!response.ok || !data.ok) throw new Error(data.error || `İstek başarısız (${response.status}).`);
    extraction.result = data; extraction.sample = text === SAMPLE_DOCUMENT.trim() && !extraction.file;
    renderExtraction(data);
  } catch (error) {
    setExtractStatus(`${error.message} Hesaplar ve hazır örnekler bu durumdan etkilenmez.`, 'error');
  } finally {
    extraction.busy = false; button.disabled = false; button.textContent = 'Gemini ile alanları çıkar';
  }
}

function groundBadge(field) {
  if (field.kind === 'confirmation') return element('span', 'tag amber', 'Onay sizde');
  if (field.kind === 'suggestion') return element('span', 'tag amber', 'Öneri · doğrulayın');
  if (field.grounded === true) return element('span', 'tag green', '✓ Metinde bulundu');
  if (field.grounded === false) return element('span', 'tag amber', '⚠ Bulunamadı');
  return element('span', 'tag neutral', 'Belgeyle karşılaştırın');
}

function renderExtraction(data) {
  const root = $('extract-results'); root.replaceChildren(); root.hidden = false;
  const fields = data.fields || [];
  const verified = fields.filter(field => field.grounded === true).length;
  const confirmations = fields.filter(field => field.kind === 'confirmation' || field.kind === 'suggestion').length;
  setExtractStatus(`Gemini${data.model ? ` (${data.model})` : ''} ${fields.length} alan önerdi · ${verified} alanın alıntısı metinde doğrulandı · ${confirmations} onay sizde.`, 'ok');
  if (!fields.length) { root.append(element('p', 'muted', 'Belgede forma aktarılabilecek bir değer bulunamadı. Alanları elle girebilirsiniz.')); }
  else {
    const table = element('table', 'extract-table'), thead = element('thead'), head = element('tr');
    for (const title of ['Aktar', 'Alan', 'Önerilen değer', 'Kaynak alıntısı', 'Kontrol']) head.append(element('th', '', title));
    thead.append(head); table.append(thead);
    const tbody = element('tbody');
    for (const field of fields) {
      const row = element('tr', `extract-row ${field.kind}`), pick = element('td', 'extract-pick'), box = element('input');
      box.type = 'checkbox'; box.checked = Boolean(field.preselect); box.dataset.fieldId = field.id; box.setAttribute('aria-label', `${field.label} alanını forma aktar`);
      pick.append(box);
      const label = element('td', 'extract-label', field.label);
      const value = element('td', 'extract-value'); value.append(element('strong', '', field.display));
      if (field.derivation) value.append(element('small', '', field.derivation));
      const quote = element('td', 'extract-quote'); quote.append(field.quote ? element('q', '', field.quote) : element('span', 'muted', 'Belgeden değil; sizin onayınız'));
      if (field.warning) quote.append(element('small', '', field.warning));
      const check = element('td', 'extract-check'); check.append(groundBadge(field));
      row.append(pick, label, value, quote, check); tbody.append(row);
    }
    table.append(tbody);
    const wrap = element('div', 'extract-table-wrap'); wrap.append(table); root.append(wrap);
  }
  if (data.questions?.length) {
    const box = element('div', 'extract-notes'); box.append(element('h3', '', 'Gemini’nin eksik bilgi soruları'));
    const list = element('ul'); data.questions.forEach(question => list.append(element('li', '', question))); box.append(list); root.append(box);
  }
  const notes = [...(data.warnings || [])];
  if (notes.length || data.ignored?.length) {
    const box = element('details', 'input-help extract-ignored'); box.open = notes.length > 0;
    box.append(element('summary', '', `Uyarılar ve kullanılmayan satırlar (${notes.length + (data.ignored?.length || 0)})`));
    const list = element('ul'); notes.forEach(note => list.append(element('li', '', note)));
    (data.ignored || []).forEach(item => list.append(element('li', '', `${item.quote || item.statedValue || item.field} — ${item.reason}`)));
    box.append(list); root.append(box);
  }
  if (fields.length) {
    const bar = element('div', 'extract-apply');
    const factors = element('label', 'check-field'), factorBox = element('input'), copy = element('span', '', 'CO₂ için Task 1 emisyon katsayılarını kullan');
    factorBox.type = 'checkbox'; factorBox.id = 'extract-factors'; copy.append(element('small', '', 'Elektrik 0,474 tCO₂/MWh (ETKB 2022) · doğal gaz 56,1 tCO₂/TJ (IPCC 2006). Resmî raporlama için ayrıca doğrulanmalıdır.'));
    factors.append(factorBox, copy);
    const apply = element('button', 'button primary', 'Seçilen alanları forma aktar →'); apply.type = 'button'; apply.addEventListener('click', applyExtraction);
    bar.append(factors, apply); root.append(bar);
    root.append(element('p', 'field-help', 'İşaretli olmayan hiçbir öneri forma yazılmaz. Onay satırları mühendislik kararıdır; belgeyi okuyarak siz işaretleyin.'));
  }
}

function applyExtraction() {
  if (!extraction.result) return;
  const ids = [...document.querySelectorAll('#extract-results input[data-field-id]:checked')].map(input => input.dataset.fieldId);
  if (!ids.length) { setExtractStatus('Aktarmak için en az bir alan seçin.', 'error'); return; }
  const useFactors = $('extract-factors')?.checked === true;
  const resetFixture = ['turgutlu', 'eksik', 'menemen'].includes(state.sample);
  if (resetFixture) loadSample('blank');
  for (const action of planActions(extraction.result.fields, ids)) {
    if (action.type === 'checkbox') $(action.target).checked = action.value;
    else setValue(action.target, action.value);
  }
  if (useFactors) $('demo-factors').checked = true;
  state.sample = 'extracted'; state.demo = extraction.sample;
  state.provenance = provenanceRecord(extraction.result, ids, extraction.sample);
  for (const name of ['turgutlu', 'menemen', 'eksik', 'blank']) $(`load-${name}`).classList.toggle('active', false);
  $('demo-notice').hidden = !state.demo;
  $('data-badge').textContent = extraction.sample ? 'TEMSİLİ BELGE' : 'BELGEDEN · ONAYLI'; $('data-badge').className = `tag ${extraction.sample ? 'amber' : 'neutral'}`;
  markDirty(); calculate();
  setExtractStatus(`${ids.length} alan forma aktarıldı${resetFixture ? ' (hazır örnek temizlendi)' : ''}. Analiz güncellendi; sonuçlar ve kalan adımlar aşağıda.`, 'ok');
  $('analysis-results').scrollIntoView({ block: 'start', behavior: 'smooth' });
}

function download(kind) {
  if(state.dirty || !state.report)return;
  const data=kind === 'json' ? JSON.stringify(state.report,null,2) : buildReportText(state.report);
  const url=URL.createObjectURL(new Blob([data],{type:kind === 'json' ? 'application/json;charset=utf-8' : 'text/plain;charset=utf-8'}));
  const link=element('a');link.href=url;link.download=`isimercek-rapor-${state.report.profile.period.start}.${kind === 'json' ? 'json' : 'txt'}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>goTo(button.dataset.view)));
document.querySelector('.brand').addEventListener('click',event=>{event.preventDefault();navigate('analiz');});
for(const form of [$('profile-form'),$('scenario-form')]){form.addEventListener('input',markDirty);form.addEventListener('change',markDirty);form.addEventListener('submit',event=>{event.preventDefault();calculate();});}
$('calculate').addEventListener('click',calculate);
for(const name of ['turgutlu','menemen','eksik','blank'])$(`load-${name}`).addEventListener('click',()=>loadSample(name));
$('start-tour').addEventListener('click',()=>{loadSample('turgutlu');state.guided=true;goTo('analiz');});
$('start-own').addEventListener('click',()=>{loadSample('blank');goTo('analiz');});
$('start-extract').addEventListener('click',()=>{loadSample('blank');$('extract-text').value=SAMPLE_DOCUMENT;clearExtraction();$('extract-panel').scrollIntoView({block:'start'});$('extract-run').focus({preventScroll:true});setExtractStatus('Temsili enerji dosyası yüklendi. “Gemini ile alanları çıkar” düğmesine basın.');});
$('extract-sample').addEventListener('click',()=>{$('extract-text').value=SAMPLE_DOCUMENT;clearExtraction();setExtractStatus('Temsili enerji dosyası yüklendi. Gerçek bir işletmeye ait değildir.');});
$('extract-run').addEventListener('click',runExtraction);
$('extract-file').addEventListener('change',event=>{const file=event.target.files?.[0]||null;if(file&&file.size>3*1024*1024){event.target.value='';extraction.file=null;$('extract-file-name').textContent='';setExtractStatus('Dosya en fazla 3 MB olabilir.','error');return;}extraction.file=file;$('extract-file-name').textContent=file?file.name:'';clearExtraction();});
$('download-json').addEventListener('click',()=>download('json'));$('download-text').addEventListener('click',()=>download('text'));
$('print-report').addEventListener('click',()=>{if(!state.dirty && state.report){navigate('rapor');window.print();}});
loadSample('turgutlu');
$('calculate').disabled=true;$('status').textContent='Yerel model yükleniyor…';
try {
  const response=await fetch('./model.json'); if(!response.ok)throw new Error('Model dosyası yüklenemedi.');state.model=await response.json();$('calculate').disabled=false;calculate();
} catch(error) {$('calculate').disabled=false;calculate();$('status').textContent='Model yüklenemedi; fizik hesapları kullanılabilir. Sıralama için yerel model dosyasını kontrol edin.';}
