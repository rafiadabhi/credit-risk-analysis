# CV Output

Do not publish model metrics until `python run_pipeline.py` finishes with
`status: PASS`. Read the selected model and test metrics from
`tblFact_ModelMetrics` in `data/outputs/credit_risk_powerbi_dataset.xlsx`.

Use this template after the run:

```text
Credit Risk Portfolio & Contractual-Term Default Scoring [GitHub Link] | [Month Year]

• Cleaned and validated 50,000 loans across 10 sectors using Python, engineered leakage-safe application features, and loaded five analytical tables into PostgreSQL for SQL-based stress, vintage, migration, and portfolio analysis.

• Benchmarked Logistic Regression, Calibrated Random Forest, and XGBoost using a temporal holdout; selected [MODEL] with [TEST PR-AUC] PR-AUC and [TEST ROC-AUC] ROC-AUC, then built a centralized Excel-to-Power BI underwriting dashboard.
```

Optional operating-decision version for the second bullet:

```text
• Selected [MODEL] using validation PR-AUC and a recall-constrained threshold, capturing [TEST RECALL]% of holdout defaults while routing [MANUAL REVIEW RATE]% of applications to manual review in Power BI.
```

Do not claim:

- automatic rejection;
- 12-month PD;
- production deployment;
- live scoring;
- reduced NPL;
- XGBoost performance copied from another run.

