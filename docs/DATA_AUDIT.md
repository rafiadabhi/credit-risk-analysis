# Dataset Audit Summary

## Suitability conclusion

The supplied files support a portfolio project on credit-risk analytics, stress testing, vintage analysis, rating migration, and contractual-term default classification. The honest title is **Credit Risk Portfolio Analytics & Contractual-Term Default Scoring**, because the target is eventual default over the simulated loan term rather than a fixed 12-month outcome.

## File inventory

| File | Grain | Rows × columns | Main use |
|---|---|---:|---|
| loan_portfolio.csv | One loan | 50,000 × 24 | Classification and segmentation |
| credit_ratings.csv | One issuer-year | 17,939 × 9 | Migration analysis |
| macro_stress_scenarios.csv | One scenario-sector | 60 × 16 | Stress testing |
| portfolio_metrics.csv | One month | 120 × 16 | Trend and macro context |
| vintage_analysis.csv | One vintage-MOB | 2,160 × 9 | Cohort curves |

## Target

- Variable: `defaulted`.
- Positive values: 6,950.
- Negative values: 43,050.
- Positive rate: 13.90%.
- Negative-to-positive ratio: 6.19:1.

No target construction is required. There is no defensible fixed observation/prediction window in the files, so the supplied contractual-term label is used and explicitly documented.

## Missingness

Only post-outcome fields are missing, each for non-defaulted loans:

- default_date: 43,050.
- recovery_rate: 43,050.
- loss_given_default: 43,050.

These nulls are structurally expected and are not imputed.

## Validation anomalies and decisions

| Finding | Count | Decision |
|---|---:|---|
| Duplicate loan IDs | 0 | Pass |
| Invalid target | 0 | Pass |
| Default before origination | 0 | Pass |
| Survival beyond maturity months | 0 | Pass |
| Capped reported maturity date | 19,350 | Flag; model with maturity months |
| Defaults after capped maturity date | 662 | Do not use capped maturity date |
| Credit score outside 300–850 | 0 | Pass |
| EAD ≤ 0 | 0 | Pass |
| PD/LGD outside 0–1 | 0 | Pass |

## Outliers

IQR flags identify skewed exposures, risk outputs, and financial ratios. Deleting all flagged records would remove legitimate high-exposure loans and distort portfolio risk. The pipeline keeps valid values, uses `log1p(EAD)` for modeling, applies robust imputation inside the model pipeline, and reports exposure segmentation.

## Leakage

Excluded post-outcome variables: default date, survival months, recovery rate, observed default loss amount.

Excluded risk-engine variables: annual PD, LGD, EL, unexpected loss, RWA. Including them would make the classifier circular and less representative of an independent application-time model.

## Limitations

- Simulation-oriented data.
- Contractual-term rather than fixed-horizon target.
- Capped maturity date.
- Strong temporal prevalence shift.
- No protected attributes for fairness evaluation.
- Supplied baseline stress EL differs from supplied base EL due to sector LGD assumptions.
- Predictive and descriptive results do not establish causality.

