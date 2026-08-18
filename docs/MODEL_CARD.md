# Model Card — Contractual-Term Default Scoring

## Intended use

Rank unseen loan applications for manual underwriting review. The output must
not be used as a standalone rejection engine or represented as a 12-month
regulatory PD.

## Data and split

| Split | Origination period | Rows |
|---|---|---:|
| Train | 2015–2020 | 33,359 |
| Validation | 2021 | 5,564 |
| Test | 2022–2023 | 11,077 |

## Candidates

- Logistic Regression with class weighting;
- Calibrated Random Forest;
- XGBoost with class-imbalance weighting.

## Selection rule

1. Highest validation PR-AUC.
2. Validation ROC-AUC as secondary criterion.
3. Operating threshold selected only on validation data: highest precision
   while recall remains at least 70%.
4. Test period used only for final evaluation.

## Leakage controls

Post-outcome fields `default_date`, `survival_months`, `recovery_rate`, and
`loss_given_default` are excluded. Existing supplied risk outputs `pd_annual`,
`lgd`, `el`, `unexpected_loss`, and `rwa` are also excluded from model features.

## Final result

Populate this section only after the Windows PostgreSQL/XGBoost pipeline passes:

| Field | Actual result |
|---|---:|
| Selected model | Read from `tblFact_ModelMetrics` |
| Operating threshold | Read from `tblFact_Thresholds` |
| Test ROC-AUC | Read from `tblFact_ModelMetrics` |
| Test PR-AUC | Read from `tblFact_ModelMetrics` |
| Test Brier score | Read from `tblFact_ModelMetrics` |
| Test precision/recall/F1 | Read from the operating-threshold row |

Never reuse the previous Random-Forest-only result after XGBoost is installed.

## Known risks

- temporal prevalence and calibration drift;
- simulation-to-production gap;
- contractual-term target horizon;
- no protected-class fairness audit;
- policy feedback if scores affect approvals;
- illustrative cost-proxy assumptions.

## Monitoring recommendation

If productionized, monitor score distribution, calibration, PR-AUC,
precision/recall at the operating threshold, review capacity, approval rate,
realized loss by cohort, feature drift, and legally appropriate fairness
measures.

