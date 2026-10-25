"""Train a small, exportable ranking model using recorded ITAC recommendation labels.

Run with Python + NumPy. The chronological test set is evaluated only after
hyperparameters have been selected on validation. No sklearn is required.
"""
from pathlib import Path
import hashlib
import json
import math
import collections
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
LABELS = ["compressed_air", "steam_traps", "steam_insulation", "condensate", "cooling"]
NUMERIC = [("electricityKWh", None), ("annualHours", 8784), ("employees", None)]
SEED = 271828


def read_number(record, name, maximum):
    value = record.get(name)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(value) or value < 0 or (maximum is not None and value > maximum):
        return None
    return float(value)


def naics(record):
    return str(record.get("naics") or "").split(".")[0][:4]


def fit_preprocessing(records):
    spec = {"numeric": [], "naicsPrefixLength": 4,
            "naicsCategories": sorted({naics(r) for r in records}), "featureNames": []}
    for name, maximum in NUMERIC:
        values = [math.log1p(v) for r in records if (v := read_number(r, name, maximum)) is not None]
        median = float(np.median(values))
        complete = [median if (v := read_number(r, name, maximum)) is None else math.log1p(v) for r in records]
        spec["numeric"].append({"name": name, "transform": "log1p", "impute": median,
                                "mean": float(np.mean(complete)), "scale": max(float(np.std(complete)), 1e-8),
                                "maximum": maximum, "observedMin": float(np.expm1(min(values))),
                                "observedMax": float(np.expm1(max(values)))})
        spec["featureNames"].extend([name + "_log1p_z", name + "_missing"])
    spec["featureNames"].extend(["gasPresent", "gasPresent_missing"])
    spec["featureNames"].extend(["naics_" + c for c in spec["naicsCategories"]])
    spec["featureNames"].append("naics_unknown")
    return spec


def transform(records, spec):
    result = []
    for record in records:
        row = []
        for field in spec["numeric"]:
            value = read_number(record, field["name"], field["maximum"])
            transformed = field["impute"] if value is None else math.log1p(value)
            row.extend([(transformed - field["mean"]) / field["scale"], float(value is None)])
        gas = record.get("gasPresent")
        row.extend([float(gas is True), float(not isinstance(gas, bool))])
        category = naics(record)
        row.extend([float(category == c) for c in spec["naicsCategories"]])
        row.append(float(category not in spec["naicsCategories"]))
        result.append(row)
    return np.asarray(result, dtype=float)


def sigmoid(values):
    return np.exp(-np.logaddexp(0, -values))


def labels(records):
    return np.asarray([[float(label in r["labels"]) for label in LABELS] for r in records])


def fit_logistic(x, y, l2):
    """Independent L2 logistic objectives; damped Newton optimization."""
    design = np.column_stack([np.ones(len(x)), x])
    coefficients = []
    diagnostics = []
    for column in range(y.shape[1]):
        target = y[:, column]
        p = float(np.mean(target))
        beta = np.zeros(design.shape[1])
        beta[0] = math.log(p / (1 - p))
        regularizer = np.diag([0.] + [l2] * x.shape[1])

        def objective(b):
            z = design @ b
            return float(np.mean(np.logaddexp(0, z) - target * z) + 0.5 * b @ regularizer @ b)

        converged = False
        for iteration in range(100):
            probability = sigmoid(design @ beta)
            gradient = design.T @ (probability - target) / len(x) + regularizer @ beta
            if np.max(np.abs(gradient)) < 1e-9:
                converged = True
                break
            curvature = probability * (1 - probability)
            hessian = (design.T * curvature) @ design / len(x) + regularizer + np.eye(len(beta)) * 1e-10
            delta = np.linalg.solve(hessian, gradient)
            step, current = 1., objective(beta)
            while step > 1e-9:
                proposal = beta - step * delta
                if objective(proposal) <= current - 1e-4 * step * float(gradient @ delta):
                    beta = proposal
                    break
                step *= .5
            if step <= 1e-9:
                break
        coefficients.append(beta)
        diagnostics.append({"label": LABELS[column], "iterations": iteration + 1,
                            "converged": converged, "max_abs_gradient": float(np.max(np.abs(gradient)))})
    coefficients = np.asarray(coefficients)
    return coefficients[:, 1:], coefficients[:, 0], diagnostics


def predict(x, weights, intercept):
    return sigmoid(x @ weights.T + intercept)


def rank_metrics(targets, scores, k=3):
    order = np.argsort(-scores, axis=1, kind="stable")[:, :k]
    hits = np.take_along_axis(targets, order, axis=1)
    denominator = np.sum(targets, axis=1)
    discounts = 1 / np.log2(np.arange(2, k + 2))
    dcg = hits @ discounts
    idcg = np.asarray([sum(discounts[:min(k, int(n))]) for n in denominator])
    recall = np.sum(hits, axis=1) / denominator
    ndcg = dcg / idcg
    predicted = np.zeros_like(targets)
    np.put_along_axis(predicted, order, 1., axis=1)
    families = {}
    for i, label in enumerate(LABELS):
        support = int(targets[:, i].sum())
        retrieved = int((targets[:, i] * predicted[:, i]).sum())
        selected = int(predicted[:, i].sum())
        families[label] = {"positive_records": support, "retrieved_at_3": retrieved,
                           "recall_at_3": retrieved / support if support else None,
                           "ranked_top3_records": selected,
                           "recorded_label_precision_at_3": retrieved / selected if selected else None}
    return {"recall_at_3": float(recall.mean()), "ndcg_at_3": float(ndcg.mean()),
            "precision_at_3": float(hits.mean()),
            "micro_recall_at_3": float(hits.sum() / targets.sum()),
            "per_family": families}, {"recall_at_3": recall, "ndcg_at_3": ndcg}


def baseline(records, training_records, training_labels, smoothing):
    prevalence = training_labels.mean(axis=0)
    groups = collections.defaultdict(list)
    for i, record in enumerate(training_records):
        groups[naics(record)].append(i)
    scores = []
    for record in records:
        indexes = groups.get(naics(record), [])
        scores.append((training_labels[indexes].sum(axis=0) + smoothing * prevalence) /
                      (len(indexes) + smoothing) if indexes else prevalence)
    return np.asarray(scores)


def bootstrap_ci(values, indices):
    means = values[indices].mean(axis=1)
    return [float(v) for v in np.percentile(means, [2.5, 97.5])]


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def main():
    data_path = ROOT / "ml/data/food_assessments.json"
    records = json.loads(data_path.read_text(encoding="utf-8"))
    assert len({r["id"] for r in records}) == len(records), "Duplicate assessment IDs"
    assert all(r["labels"] and r["electricityKWh"] > 0 and r["year"] >= 2000 for r in records)
    groups = {"train": [r for r in records if r["year"] <= 2018],
              "validation": [r for r in records if 2019 <= r["year"] <= 2022],
              "test": [r for r in records if r["year"] >= 2023]}
    assert set.union(*(set(r["id"] for r in values) for values in groups.values())) == {r["id"] for r in records}
    prep = fit_preprocessing(groups["train"])
    x_train, y_train = transform(groups["train"], prep), labels(groups["train"])
    x_val, y_val = transform(groups["validation"], prep), labels(groups["validation"])
    grid, candidates = [], []
    for l2 in [0.0001, 0.001, 0.01, 0.1, 1.0]:
        weights, intercept, diagnostics = fit_logistic(x_train, y_train, l2)
        metrics, _ = rank_metrics(y_val, predict(x_val, weights, intercept))
        grid.append({"l2": l2, "validation": metrics, "optimization": diagnostics})
        candidates.append((metrics["ndcg_at_3"], metrics["recall_at_3"], l2, weights, intercept, diagnostics))
    _, _, chosen_l2, weights, intercept, diagnostics = max(candidates, key=lambda c: c[:3])
    baseline_grid = []
    for smoothing in [0, 5, 20, 100]:
        metrics, _ = rank_metrics(y_val, baseline(groups["validation"], groups["train"], y_train, smoothing))
        baseline_grid.append({"smoothing": smoothing, "validation": metrics})
    chosen_smoothing = max(baseline_grid, key=lambda d: (d["validation"]["ndcg_at_3"], d["validation"]["recall_at_3"], d["smoothing"]))["smoothing"]
    # The test labels are used only after the model and baseline choices above are fixed.
    x_test, y_test = transform(groups["test"], prep), labels(groups["test"])
    methods = {"learned_logistic": predict(x_test, weights, intercept),
               "global_prevalence": np.tile(y_train.mean(axis=0), (len(y_test), 1)),
               "naics_frequency": baseline(groups["test"], groups["train"], y_train, chosen_smoothing)}
    test_results, per_record = {}, {}
    bootstrap = np.random.default_rng(SEED).integers(0, len(y_test), (4000, len(y_test)))
    for name, scores in methods.items():
        test_results[name], per_record[name] = rank_metrics(y_test, scores)
        test_results[name]["bootstrap_95_percent_ci"] = {metric: bootstrap_ci(values, bootstrap)
                                                       for metric, values in per_record[name].items()}
    differences = {}
    for baseline_name in ["global_prevalence", "naics_frequency"]:
        differences[baseline_name] = {}
        for metric in ["recall_at_3", "ndcg_at_3"]:
            values = per_record["learned_logistic"][metric] - per_record[baseline_name][metric]
            differences[baseline_name][metric] = {"mean_difference": float(values.mean()),
                                                  "paired_bootstrap_95_percent_ci": bootstrap_ci(values, bootstrap)}
    signature = lambda r: json.dumps([r.get(key) for key in ["naics", "electricityKWh", "annualHours", "employees", "gasPresent"]], sort_keys=True)
    signatures = {name: {signature(r) for r in rows} for name, rows in groups.items()}
    duplicates = {"train_validation_exact_feature_overlap": len(signatures["train"] & signatures["validation"]),
                  "train_test_exact_feature_overlap": len(signatures["train"] & signatures["test"]),
                  "validation_test_exact_feature_overlap": len(signatures["validation"] & signatures["test"])}
    split_summary = {name: {"count": len(rows), "years": [min(r["year"] for r in rows), max(r["year"] for r in rows)],
                            "label_counts": dict(collections.Counter(label for r in rows for label in r["labels"]))}
                     for name, rows in groups.items()}
    population = "US ITAC food/beverage assessments with positive annual electricity, FY>=2000, and at least one recorded recommendation in five selected families."
    metadata = {"name": "IsiMercek ITAC recorded-family ranker", "version": "1.0.0", "trainedAt": "2026-10-22",
                "population": population, "target": "Recorded recommendation-family affinity; not technical suitability, savings probability, or measured impact.",
                "datasetSha256": hashlib.sha256(data_path.read_bytes()).hexdigest(),
                "trainingRecords": len(x_train), "validationRecords": len(x_val), "testRecords": len(x_test),
                "selectedL2": chosen_l2, "featureCount": x_train.shape[1], "source": "https://itac.university/download",
                "trainYears": split_summary["train"]["years"], "validationYears": [2019, 2022], "testYears": [2023, 2026],
                "calibratedProbability": False, "fieldValidated": False, "turkeyValidated": False,
                "missingLabelMeaning": "Not recorded, not necessarily unsuitable.",
                "deploymentStatus": "research_prototype_requires_expert_review",
                "performanceGate": "did_not_beat_naics_baseline",
                "performanceNote": "The learned model underperformed the NAICS-frequency baseline on the held-out chronological test set; no superiority claim is supported.",
                "testComparison": {"learnedNdcgAt3": test_results["learned_logistic"]["ndcg_at_3"],
                                   "naicsBaselineNdcgAt3": test_results["naics_frequency"]["ndcg_at_3"],
                                   "learnedRecallAt3": test_results["learned_logistic"]["recall_at_3"],
                                   "naicsBaselineRecallAt3": test_results["naics_frequency"]["recall_at_3"]}}
    model = {"schemaVersion": 1, "modelType": "multilabel_logistic_regression", "labels": LABELS,
             "preprocessing": prep, "weights": weights.tolist(), "intercept": intercept.tolist(), "metadata": metadata}
    evaluation = {"schema_version": 1, "seed": SEED, "population": population,
                  "dataset_sha256": metadata["datasetSha256"], "split": split_summary,
                  "selection": {"primary": "validation nDCG@3", "tie_break": "validation recall@3, then stronger L2",
                                "selected_l2": chosen_l2, "logistic_candidates": grid,
                                "naics_baseline_candidates": baseline_grid, "naics_baseline_selected_smoothing": chosen_smoothing,
                                "refit_on_validation": False},
                  "test": test_results, "paired_test_differences_model_minus_baseline": differences,
                  "bootstrap": {"resamples": 4000, "unit": "assessment record", "paired": True,
                                "limitation": "Record-level intervals do not account for unknown repeat companies or assessment centers."},
                  "duplicate_audit": duplicates, "optimization": diagnostics,
                  "deployment_gate": {"status": "failed_stronger_baseline_comparison",
                                      "decision": "Research demonstration only; do not promote model rankings as validated engineering priorities or hide lower-ranked families.",
                                      "note": "The test set remains fixed; it must not become a tuning set after this result."},
                  "metric_note": "Binary relevance means a recommendation was recorded. Macro recall averages per-record recall; nDCG uses binary gains at ranks 1-3. Stable tie order follows labels.",
                  "limitations": ["Selection requires at least one target label; not evaluated on zero-target-label facilities.",
                                  "Absent labels are unrecorded, not verified negatives. Logistic loss uses observed/non-observed labels as a ranking surrogate.",
                                  "Assessment IDs are distinct; firm identity is unavailable, so repeat facilities cannot be grouped reliably.",
                                  "US historical practice and selected ARC families do not establish suitability or performance in Türkiye.",
                                  "Savings and costs, recommendation text, product text, ID and year are not input features.",
                                  "Only five families are modeled; a low rank does not rule out a useful measure.",
                                  "No independent human review, field savings, runtime LLM, or calibrated success probability is established."]}
    write_json(ROOT / "public/model.json", model)
    write_json(ROOT / "ml/evaluation.json", evaluation)
    write_json(ROOT / "ml/splits.json", {"seed": SEED, "strategy": "chronological; no random shuffling", "dataset_sha256": metadata["datasetSha256"],
                                         "splits": {name: [r["id"] for r in rows] for name, rows in groups.items()}})
    parity_inputs = [{key: record.get(key) for key in ["naics", "electricityKWh", "annualHours", "employees", "gasPresent"]}
                     for record in [groups["test"][0], groups["test"][30], groups["test"][-1]]]
    parity_inputs.extend([{"naics": "311511", "electricityKWh": 1200000, "annualHours": None, "employees": None, "gasPresent": None},
                          {"naics": "999999", "electricityKWh": 100000, "annualHours": 9000, "employees": -3, "gasPresent": False},
                          {"naics": "312111", "electricityKWh": 0, "annualHours": 0, "employees": 0, "gasPresent": True}])
    parity = []
    for index, record in enumerate(parity_inputs):
        features = transform([record], prep)
        scores = predict(features, weights, intercept)[0]
        parity.append({"name": f"parity_{index + 1}", "input": record, "features": features[0].tolist(),
                       "scores": dict(zip(LABELS, scores.tolist())),
                       "ranking": [LABELS[i] for i in np.argsort(-scores, kind="stable")]})
    write_json(ROOT / "ml/parity_cases.json", {"absoluteTolerance": 1e-10, "cases": parity,
                                               "note": "Preprocessing parity fixtures include invalid/OOD inputs; public application should gate them before presenting results."})
    def fmt(value):
        return f"{100 * value:.2f}%"
    rows = "\n".join(f"| {name} | {fmt(m['recall_at_3'])} | {m['ndcg_at_3']:.4f} |" for name, m in test_results.items())
    delta = differences["naics_frequency"]["ndcg_at_3"]
    ci = delta["paired_bootstrap_95_percent_ci"]
    conclusion = ("NAICS sıklık tabanına göre nDCG@3 farkının %95 bootstrap aralığı sıfırın üzerindedir."
                  if ci[0] > 0 else ("NAICS sıklık tabanı bu testte daha iyi sonuç vermiştir; model farkının %95 bootstrap aralığı bütünüyle sıfırın altındadır."
                                    if ci[1] < 0 else "NAICS sıklık tabanına göre nDCG@3 üstünlüğü bu testte güvenilir biçimde gösterilememiştir."))
    card = f"""# IsıMercek küçük model kartı

22 Ekim 2026 · Sürüm 1.0.0 · Araştırma prototipi

## Modelin yaptığı iş

Bu model, gerçek ITAC etütlerinden öğrenilmiş parametrelerle beş önlem ailesini geçmiş kayıtlardaki öneri benzerliği açısından sıralar. Çok etiketli, L2 düzenlemeli lojistik regresyon kullanır. Sıralama skoru, bir önlemin teknik uygunluk veya başarı olasılığı değildir; tasarruf hesabı yapmaz. Teknik uygunluk ve deterministik mühendislik hesabı ayrı katmanlardır.

**Performans değerlendirmesi:** İlk model, ayrılmış test kümesinde NAICS alt sektör sıklığı yönteminden daha zayıf kaldı. Bu nedenle model, başarısı doğrulanmış öneri ürünü olarak sunulamaz. Araştırma gösteriminde bütün aileler erişilebilir kalmalı; düşük sıradaki aileler gizlenmemeli veya elenmemelidir.

## Veri ve hedef

Kaynak: [ITAC resmî indirme](https://itac.university/download), ITAC_Database_20261007.xlsx. Arşiv parmak izleri ve aile seçme kuralı `data/provenance.json` / `prepare.py` içindedir. NAICS 311* ve 3121*, FY≥2000, pozitif yıllık elektrik tüketimi ve seçilen beş aileden en az birinin önerilmiş olması koşuluyla 1.081 etüt seçilmiştir. Dolayısıyla bu örneklem tüm gıda tesislerini temsil etmez; hedef ailelerin hiç önerilmediği tesislerde başarı ölçülmemiştir. Tavsiye edilmemiş bir önlem uygun değildir anlamına gelmez. Eğitim kaybı kayıtlı/kayıtlı değil ayrımını yalnız sıralama için bir vekil hedef olarak kullanır.

Birim dayanağı: [ITAC Database Manual v10.2](https://itac.university/file/technical/IAC_DatabaseManualv10.2.pdf), yıllık enerji/fatura tanımı s.17 ve enerji kodları s.22–23. EC saha elektrik kullanımı kWh, E2 doğal gaz kullanımı MMBtu, PRODHOURS yıllık üretim saatidir. Bu model E2 miktarını enerjiye çevirmeden yalnız gaz var/yok/bilinmiyor göstergesine dönüştürür. Aile kapsamı [ARC List v21.1](https://itac.university/file/technical/ARC%20List%20-%20V21.1.pdf) kodlarına dayanır.

Aileler: basınçlı hava ve inert gaz kaçakları (ARC 2.4236), buhar kapanı ve kaçak kontrolü (2.2113/2.2135), buhar ve kondens hattı yalıtımı (2.2136/2.2122), kondens geri kazanımı (2.2121), soğutma sistemleri (2.262* / 2.2694). Bu sınırlı ARC kapsamı tüm enerji önlemlerini kapsamaz. Uygulama durumu, ölçülmüş tasarruf etiketi olarak kullanılmamıştır.

## Girdiler ve sızıntı kontrolü

Yıllık elektrik (kWh), yıllık çalışma saati, çalışan sayısı, gaz tüketimi varlığı ve NAICS dört haneli alt sektör. İlk üç sayıya log1p, eğitim medyanıyla eksik doldurma ve eğitim ortalama/standart sapmasıyla ölçekleme uygulanır; eksiklik göstergeleri korunur. NAICS kategorileri yalnız eğitimden öğrenilir. Gaz bilinmiyorsa ayrı eksik göstergesi vardır. ID, yıl, ürün metni, öneri metni, maliyet ve tasarruf girdiye girmez. Toplam {x_train.shape[1]} özellik; {weights.size + intercept.size} öğrenilmiş katsayı.

Eğitim: FY 2002–2018 ({len(x_train)} etüt). Doğrulama: FY 2019–2022 ({len(x_val)} etüt). Test: FY 2023–2026 ({len(x_test)} etüt). FY, etüdün mali yılıdır; tam takvim yılı etiketi değildir. L2 seçenekleri 0.0001/0.001/0.01/0.1/1.0 arasından doğrulama nDCG@3 ile seçildi; seçilen L2={chosen_l2}. Eşitlikte recall@3, ardından daha güçlü düzenleme kullanıldı. Ön işleme ve model eğitim kümesine uyarlanmış halde bırakıldı; doğrulama ile yeniden eğitim yapılmadı. Test kümesi seçim tamamlandıktan sonra değerlendirildi; test sonucu yeni ayar seçmek için kullanılmadı. NAICS sıklık karşılaştırmasının yumuşatma katsayısı da yalnız doğrulamadan seçildi ({chosen_smoothing}).

## Zamansal test sonucu

| Yöntem | Recall@3 | nDCG@3 |
| --- | ---: | ---: |
{rows}

Recall@3 her etütte kayıtlı ailelerin ilk üçte yakalanan payının ortalamasıdır. nDCG@3 kayıtlı ailelerin sırasını da değerlendirir. Bunlar mühendislik uygunluğu veya saha etkisi ölçütleri değildir. Toplam beş aileden üçünü seçmek ve yaygın basınçlı hava etiketi, basit sıklık tabanlarının güçlü olmasını sağlar.

{conclusion} Model eksi NAICS nDCG@3 farkı {delta['mean_difference']:.4f}; 4.000 eşlenmiş bootstrap tekrarında %95 aralık [{ci[0]:.4f}, {ci[1]:.4f}]. Tam ölçütler, aile bazında destek/recall ve karşılaştırmalı aralıklar `evaluation.json` içindedir. Aralıklar etüt düzeyindedir; aynı firma veya merkez kümelenmesini hesaba katmaz.

Nadir etiketlerde zayıflık belirgindir: testteki 8 kondens kaydının hiçbiri ve 30 buhar kapanı/kaçak kaydının yalnız 1'i modelin ilk üçüne girmiştir. Bu yüzden genel recall değeri, bütün ailelerde başarı gibi okunmamalıdır. Mühendislik uygunluğu ayrı kontrol edilmeli ve kondens hesabı modelin ilk üçte seçmesine bağlanmamalıdır.

## Sınırlar ve doğru sunum

- ABD'deki tarihsel etüt önerileri Türkiye'ye aktarım başarısını kanıtlamaz. Türkiye'de uzman değerlendirmesi veya saha tasarrufu doğrulanmadı.
- Benzersiz etüt kimlikleriyle ayrım yapıldı. Kurum/tesis kimliği bulunmadığı için farklı yıllardaki aynı firmalar güvenle gruplanamaz. Tam özellik örtüşme sayıları: {json.dumps(duplicates, ensure_ascii=False)}. Sıfır örtüşme, farklı fiziksel tesisler garantisi değildir.
- Geçmiş öneriler uzman tercihleri, kayıt süreçleri, veri yaşı ve seçilim etkileri taşır. Eksik etiketler gerçek negatif değildir; düşük skor önlemi elemek için yeterli olmaz.
- Buhar yoksa ilgili aileler uygulamanın uygunluk kapısında elenir. Bilinmeyen ekipman için ölçüm/teyit istenir. Model tesisin ekipman varlığını veya güvenli kondens uygunluğunu belirlemez.
- Etütlerdeki yıllık elektrik girdisiyle eğitildi. Aylık veri yıllık diye girilmemeli. Kapsam dışı sektör, geçersiz/çok eksik veya eğitim aralığından uzak veri uygulamada açıkça işaretlenmeli.
- Skorlar kalibre edilmiş olasılık değildir; yüzde başarı ya da doğruluk diye gösterilmemeli. Ürün tanımı: “Açık etüt verisinden eğitilmiş, inceleme sırasına yardımcı küçük model.”
- Kanıtlanmış kullanıcı zaman kazancı, ödeme isteği ve enerji/emisyon azaltımı yoktur. Ön-etüt hazırlık süresinde %20 azalma hâlâ pilot hedefidir.

## Yeniden üretim ve entegrasyon

`python3 ml/train.py` (Python + NumPy) tüm çıktıları yeniden üretir. Rastgelelik yalnız bootstrap'tadır (seed={SEED}); eğitim deterministiktir. Veri SHA256: `{metadata['datasetSha256']}`.

`public/model.json` ön işleme ve öğrenilmiş ağırlıkları içerir; haricî model/API olmadan JavaScript ile çalıştırılabilir. Skor = sigmoid(intercept + ağırlık·özellik). Ön işleme sırası `preprocessing.featureNames` ile sabittir. `ml/parity_cases.json` Python–JavaScript eşitlik kontrolü için sayısal örnekler içerir. Bunların içinde geçersiz/kapsam dışı girdiler de vardır; yalnız dönüştürme tutarlılığı testidir, kullanıcıya öneri izni değildir.
"""
    (ROOT / "ml/model_card.md").write_text(card, encoding="utf-8")
    print(json.dumps({"selected_l2": chosen_l2, "split": split_summary, "test": test_results,
                      "differences": differences, "duplicates": duplicates, "model_bytes": (ROOT / "public/model.json").stat().st_size}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
