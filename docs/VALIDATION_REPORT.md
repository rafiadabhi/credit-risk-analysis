# Validation Report

## Final execution status

The complete file-based path was rerun on the supplied dataset with:

```powershell
python run_pipeline.py --mode csv-only
```

Final status: **PASS**. End-to-end elapsed time in the validation environment was 25.7 seconds; the modeling stage reported 19.92 seconds. Runtime will vary by hardware and will increase when XGBoost is installed.

## Verified outputs

| Check | Actual result | Status |
|---|---:|---|
| Clean loan rows | 50,000 | PASS |
| Unique prediction IDs | 50,000 | PASS |
| Power BI scored rows | 50,000 | PASS |
| Credit-rating rows | 17,939 | PASS |
| Stress rows | 60 | PASS |
| Portfolio-month rows | 120 | PASS |
| Vintage rows | 2,160 | PASS |
| Missing required prediction fields | 0 | PASS |
| Score range | 0.069799–0.488878 | PASS |
| Manual-review queue actions | 500/500 Manual Review | PASS |
| Python compilation | `run_pipeline.py` and all `src` modules | PASS |
| JSON parsing | Audit, metadata, notebook, and Power BI theme | PASS |
| Dashboard mockup dimensions | Four PNG files, each 1440×900 | PASS |
| Excel ZIP structure | No compressed-file errors | PASS |
| Excel formula/error scan | No matched Excel error values | PASS |

## Reconciled model result

The locally selected model is **Calibrated Random Forest**. On the untouched 2022–2023 test period at the validation-selected threshold of 0.17:

| Metric | Actual value |
|---|---:|
| ROC-AUC | 0.867541 |
| PR-AUC | 0.424745 |
| Brier score | 0.066879 |
| Precision | 0.198219 |
| Recall | 0.875145 |
| F1 | 0.323228 |
| Specificity | 0.700157 |
| TN / FP / FN / TP | 7,150 / 3,062 / 108 / 757 |

## Validation boundaries

- PostgreSQL/pgAdmin was not installed in the execution environment. DDL, loading code, table/CSV column alignment, rerunnable view ordering, and SQL syntax were checked statically, but a live PostgreSQL run must be completed on Windows.
- Power BI Desktop was not available. All source tables, DAX, theme, layout blueprint, mockups, and reconciliation values were prepared; the PBIX must be assembled and published manually.
- XGBoost code is included, but the package was unavailable in this environment. No XGBoost metric is reported. Installing `requirements.txt` on Windows enables the candidate and may change the selected model.
