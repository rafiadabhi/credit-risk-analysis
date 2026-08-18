# Interview Guide

## 60-second explanation template

I built an end-to-end credit-risk portfolio project on 50,000 loans across 10
sectors. I audited five source files, excluded post-outcome leakage and existing
risk-engine outputs, and engineered application-time features in Python. I
loaded the clean datasets into PostgreSQL and created SQL reporting layers for
portfolio concentration, rating migration, vintage performance, stress
scenarios, and threshold analysis. Because risk changes over time, I used
2015–2020 for training, 2021 for validation, and 2022–2023 as an untouched test
period. I compared Logistic Regression, Calibrated Random Forest, and XGBoost,
selected the model using validation PR-AUC, and exported PostgreSQL outputs into
one multi-table Excel workbook for a four-page Power BI report. The score is a
manual-review triage tool, not an automatic rejection system.

After your run, append one sentence using the actual selected model, test
PR-AUC/ROC-AUC, threshold, recall, and manual-review rate.

## Core questions

### Why not use a random split?

Origination-year default rates change materially. A random split would mix past
and future regimes and give an optimistic estimate. A time split better mimics
future application scoring.

### Why prioritize PR-AUC?

Defaults are the minority class. Accuracy can look high while missing defaults;
PR-AUC directly evaluates positive-class ranking under imbalance.

### Why exclude annual PD, LGD, EL, RWA, and unexpected loss?

They are outputs of an existing risk process. Using them would make the new
classifier circular. They are retained only for separate portfolio reporting
and the review-priority proxy.

### Why exclude survival and recovery fields?

They are known after origination and partly after default, so they leak future
information.

### Why is the threshold not automatically 0.50?

A probability cutoff is a business decision parameter. It is selected on
validation data according to recall, precision, workload, and cost trade-offs;
0.50 has no universal operational meaning.

### Can this project claim reduced NPL?

No. There is no deployment or controlled before/after evaluation. The project
demonstrates a prioritization method, not measured causal impact.

### Why one Excel workbook instead of several CSVs?

Power BI needs separate fact tables because each source has a different grain.
A multi-sheet/table workbook keeps those grains separate while providing one
physical, portable source generated from PostgreSQL.

## Demo order

1. Show the audit report and leakage exclusions.
2. Show PostgreSQL tables and SQL reporting objects.
3. Show all three model candidates and the actual selected model.
4. Explain the validation-selected threshold and review trade-off.
5. Open the single Excel source and show its separate tables.
6. Demonstrate Executive, Model Performance, Underwriting, and Resilience pages.
7. End with limitations and next steps.
