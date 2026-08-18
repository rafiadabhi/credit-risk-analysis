# Start Here — Credit Risk Analysis

Project path:

```text
D:\Project\credit-risk-analysis
```

This package contains source code only. The final Power BI workbook does not
exist until the complete PostgreSQL-backed pipeline finishes.

## 1. Add all five raw files

Copy these files into `data\raw`:

```text
loan_portfolio.csv
credit_ratings.csv
macro_stress_scenarios.csv
portfolio_metrics.csv
vintage_analysis.csv
```

## 2. Set up Python

Run in the VS Code PowerShell terminal:

```powershell
cd "D:\Project\credit-risk-analysis"
py -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Confirm:

```powershell
python -c "import pandas, sklearn, xgboost, sqlalchemy, psycopg2, openpyxl; print('Environment ready')"
```

## 3. Create PostgreSQL database

In pgAdmin create:

```text
credit_risk_db
```

The pipeline rebuilds only schema `credit_risk`.

## 4. Create `.env`

```powershell
Copy-Item ".env.example" ".env"
code ".env"
```

Enter your real PostgreSQL password:

```dotenv
PGHOST=localhost
PGPORT=5432
PGDATABASE=credit_risk_db
PGUSER=postgres
PGPASSWORD=YOUR_ACTUAL_POSTGRES_PASSWORD
```

## 5. Run everything

```powershell
python run_pipeline.py
```

The command runs:

```text
Python audit/cleaning
→ PostgreSQL loading
→ three-model training
→ SQL reporting views
→ centralized Excel export
→ validation
```

Successful output:

```text
D:\Project\credit-risk-analysis\data\outputs\credit_risk_powerbi_dataset.xlsx
```

`data\outputs` must contain only this one generated data file.

## 6. Open in Power BI

1. Open Power BI Desktop.
2. Select `Home > Get data > Excel workbook`.
3. Open `credit_risk_powerbi_dataset.xlsx`.
4. Select the seven tables beginning with `tblFact_` and also select
   `tblFeature_Importance` (eight analytical tables in total).
5. Ignore `tblManifest` for analytics.
6. Follow `dashboard\POWER_BI_DASHBOARD_BLUEPRINT.md`.

There is no CSV fallback. If PostgreSQL or XGBoost fails, fix the error instead
of bypassing the technology and later claiming it was used.
