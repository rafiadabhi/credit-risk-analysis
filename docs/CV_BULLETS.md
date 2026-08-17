# CV Output

Use this version now; it does not claim that the local PostgreSQL load or PBIX build has already been completed:

```text
Credit Risk Portfolio Analytics & Contractual-Term Default Scoring [GitHub Link] | August 2026

• Cleaned and validated 50,000 multi-sector loans using Python, engineered leakage-safe application features, and designed a PostgreSQL schema with SQL-based sector, vintage, migration, and stress analyses.

• Benchmarked Logistic Regression and a calibrated Random Forest with time-based validation, achieving 0.868 ROC-AUC and 0.425 PR-AUC on 11,077 holdout loans; produced an Excel simulator and Power BI-ready dashboard package.
```

After the full PostgreSQL pipeline passes locally and the PBIX is built and reconciled, you may use this stronger final wording:

```text
Credit Risk Portfolio Analytics & Contractual-Term Default Scoring [GitHub Link] | August 2026

• Cleaned and validated 50,000 multi-sector loans using Python, engineered leakage-safe application features, and loaded five tables into PostgreSQL for SQL-based sector, vintage, migration, and stress analysis.

• Benchmarked Logistic Regression and a calibrated Random Forest with time-based validation, achieving 0.868 ROC-AUC and 0.425 PR-AUC on 11,077 holdout loans; built Excel and Power BI underwriting dashboards.
```

Alternative second bullet emphasizing the operating decision:

```text
• Selected a calibrated Random Forest using time-based validation, capturing 87.5% of holdout defaults at a 34.5% manual-review rate, and visualized threshold trade-offs in Excel and Power BI.
```

Do not add XGBoost performance until it has run locally. If XGBoost becomes the selected model, regenerate metrics and update the model name and numbers from `data/outputs/model_metrics.csv`.
