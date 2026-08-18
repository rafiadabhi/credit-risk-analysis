# Validation Report

## Build-environment validation

Completed checks:

| Check | Result |
|---|---|
| Raw source audit | PASS |
| Loan rows / unique IDs | 50,000 / 50,000 |
| Defaults | 6,950 |
| Python syntax | PASS |
| Raw-to-processed cleaning | PASS |
| Centralized workbook writer | PASS |
| Workbook tables | 8 fact/analytical tables plus Manifest |
| Test workbook loan rows | 50,000 |
| Test workbook structure/opening | PASS |
| Source-only package exclusions | PASS — no raw/processed CSV, workbook, model binary, `.env`, or virtual environment |

The workbook writer was tested with validated existing table fixtures only to
verify physical Excel structure, table names, sheet counts, and row counts. That
temporary workbook is not a model-result deliverable and is not included in the
ZIP.

## Required Windows validation

The official completion criterion is:

```powershell
python run_pipeline.py
```

followed by:

```json
"status": "PASS"
```

This must validate:

- PostgreSQL schema rebuild and five-table load;
- Logistic Regression, Calibrated Random Forest, and XGBoost execution;
- selected-model predictions for all 50,000 loans;
- probabilities within `[0,1]`;
- no missing risk bands/actions/loss proxies;
- SQL reporting views;
- eight Power BI tables in the final workbook;
- workbook row counts matching PostgreSQL.

## Validation boundaries

- The build environment did not provide a live PostgreSQL server.
- XGBoost installation was unavailable in the build environment.
- Power BI Desktop and PBIX construction remain manual Windows steps.
- No final selected model or metric is claimed until the user's complete run
  passes.
