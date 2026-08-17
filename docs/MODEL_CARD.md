# Model Card — Contractual-Term Default Scoring

## Intended use

Rank unseen loan applications for manual underwriting review. The model must not be used as a standalone rejection engine or treated as 12-month regulatory PD.

## Data and split

| Split | Origination period | Rows | Default rate |
|---|---|---:|---:|
| Train | 2015–2020 | 33,359 | 16.87% |
| Validation | 2021 | 5,564 | 8.21% |
| Test | 2022–2023 | 11,077 | 7.81% |

## Candidates

- Logistic Regression baseline with class weighting.
- Calibrated Random Forest.
- XGBoost when the package is available.

No XGBoost metric was generated in the current validation environment. The code and dependency are included for the Windows rerun.

## Selection rule

1. Highest validation PR-AUC.
2. ROC-AUC as tie-breaker.
3. Operating threshold chosen on validation data: highest precision while recall remains at least 70%.
4. Test data used once for final reporting.

## Locally validated selected model

Calibrated Random Forest.

| Metric | Validation | Test |
|---|---:|---:|
| ROC-AUC | 0.8648 | 0.8675 |
| PR-AUC | 0.4347 | 0.4247 |
| Brier score | 0.0647 | 0.0669 |

At threshold 0.17:

| Metric | Validation | Test |
|---|---:|---:|
| Precision | 34.33% | 19.82% |
| Recall | 70.02% | 87.51% |
| F1 | 46.08% | 32.32% |
| Specificity | 88.02% | 70.02% |
| Approval rate | 83.25% | 65.52% |

Test confusion matrix: TN 7,150; FP 3,062; FN 108; TP 757.

## Interpretation

Top permutation features are initial rating, maturity months, credit score, origination credit spread, and coupon rate. Importance is a predictive association and does not demonstrate a causal relationship.

The lower test precision despite high recall reflects threshold trade-offs and temporal shift. Review capacity and false-positive cost must be validated before adoption.

## Known risks

- Temporal prevalence and calibration drift.
- Simulation-to-production gap.
- Contractual-term target horizon.
- Lack of protected-class fairness audit.
- Potential policy feedback if scores change approvals.
- Cost proxy assumptions are illustrative, not realized economics.

## Monitoring recommendation

If this were productionized, monitor monthly population stability, score distribution, calibration, PR-AUC, recall/precision at the operating threshold, review capacity, approval rate, realized loss by cohort, and fairness measures once appropriate protected/assessment variables are legally available.

