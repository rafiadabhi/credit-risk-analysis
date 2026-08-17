# Interview Guide

## 60-second project explanation

I built an end-to-end credit-risk portfolio project on 50,000 loans across 10 sectors. I audited five source files, separated post-outcome leakage and existing risk-engine outputs, engineered application-time features in Python, loaded clean tables into PostgreSQL, and wrote SQL for concentration, vintage, migration, stress, and threshold analysis. Because default rates changed sharply over time, I used 2015–2020 for training, 2021 for validation, and 2022–2023 as an unseen test set. A calibrated Random Forest achieved 0.868 ROC-AUC and 0.425 PR-AUC on 11,077 test loans. At the validation-selected 0.17 threshold, it captured 87.5% of test defaults while routing 34.5% to manual review. I then prepared an Excel simulator and a four-page Power BI design. I present it as a triage model, not an automatic rejection system.

## Questions and concise answers

### Why not use a random split?

Origination-year default rates shift materially. A random split would mix earlier and later regimes and give an overly optimistic estimate. The time split better approximates scoring future originations.

### Why PR-AUC instead of accuracy?

Defaults are the minority class, and accuracy can look high by predicting non-default. PR-AUC focuses on positive-class ranking and is more informative for review prioritization.

### Why exclude annual PD, LGD, EL, RWA, and unexpected loss?

They are outputs of an existing risk process. Using them would make the new classifier circular. I retain them only for separate portfolio benchmarking and loss-proxy construction.

### Why exclude survival months and recovery fields?

They are only known after origination and partly after default, so they leak the outcome.

### Why does threshold 0.50 predict no positives?

The calibrated model's scores max below 0.50. A classifier threshold is a decision parameter, not a universal rule. I choose it on validation data based on recall and precision trade-offs.

### Is 19.8% precision bad?

It means about one in five review flags defaulted. Whether that is acceptable depends on manual-review capacity and default cost. The threshold intentionally prioritizes recall; it is unsuitable for automatic rejection.

### Can you claim the model reduces NPL?

No. The project has no controlled deployment or measured before/after outcome. It can support a retention/underwriting hypothesis, not prove impact.

### What is the largest business insight?

Risk ranking is concentrated: the top test decile has a 44.1% default rate, 5.64 times the test average. This supports prioritizing limited analyst capacity.

### What would you improve next?

Run XGBoost locally, add probability calibration diagnostics by cohort, tune with nested or rolling validation, evaluate fairness with legally appropriate variables, track review costs, and validate on truly external lender data.

### Why is the title “contractual-term” scoring?

The supplied target is eventual default during each simulated loan term. Calling it 12-month PD or generic production default prediction would overstate what the label supports.

## Demo order

1. Show audit report and leakage decision.
2. Show PostgreSQL tables and one window-function query.
3. Show model metrics and top risk-decile lift.
4. Change the Excel/Power BI threshold from 0.17 to 0.25 and explain the workload/recall trade-off.
5. Show severe/COVID-like stress and vintage pages.
6. End with limitations and next steps.

