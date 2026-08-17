# START HERE — One-Night Execution Guide

Use this page when you need the project running tonight. Do not skip validation.

## Fastest safe route

### 1. Install and open

Required on Windows:

- Python 3.11/3.12
- VS Code
- PostgreSQL + pgAdmin
- Power BI Desktop
- Git

Extract the project to:

```text
C:\portfolio\credit-risk-scoring-loan-default
```

Open that folder in VS Code.

### 2. VS Code Terminal — set up Python

```powershell
cd C:\portfolio\credit-risk-scoring-loan-default
py -3.12 -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
code .env
```

Put your PostgreSQL password into `.env`.

### 3. pgAdmin — create the database

Create a database named exactly:

```text
credit_risk_db
```

Test in pgAdmin Query Tool:

```sql
SELECT current_database(), current_user;
```

### 4. VS Code Terminal — run everything

```powershell
python run_pipeline.py --mode full
```

Expected final messages include:

```text
Power BI-ready data saved to: ...\dashboard\data
status: PASS
PostgreSQL validation: PASS
Pipeline completed
```

If PostgreSQL blocks you and time is critical, run the file-only route:

```powershell
python run_pipeline.py --mode csv-only
```

Then build Power BI from `dashboard\data\*.csv`. Return to the PostgreSQL route later; do not claim PostgreSQL was tested until it passes.

## 5. pgAdmin — capture SQL evidence

Open `sql\02_business_queries.sql`. Run these first:

1. sector risk ranking;
2. test risk-decile lift;
3. threshold trade-off;
4. top manual-review loans;
5. severe/COVID-like stress impact.

Take clean screenshots for GitHub. Run `sql\04_validation_queries.sql` and save the row-count result too.

## 6. Excel — inspect the ready workbook

Open:

```text
excel\credit_risk_underwriting_analysis.xlsx
```

Change the blue threshold cell in **Threshold Simulator** and confirm metrics update. Return it to `0.17` for screenshots.

## 7. Power BI — build in this order

Open `dashboard\POWER_BI_DASHBOARD_BLUEPRINT.md` side-by-side with Power BI Desktop.

1. Import `dashboard\credit_risk_theme.json`.
2. Connect to PostgreSQL; use CSV fallback if needed.
3. Build relationships and measures.
4. Build **Executive Overview**.
5. Build **Model Performance**.
6. Build **Underwriting Decision Simulator**.
7. Build **Portfolio Resilience**.
8. Reconcile every value in the blueprint checklist.
9. Save the PBIX and capture screenshots.

Reference images are in `dashboard\mockups`.

## 8. One-night schedule

| Time | Task | Exit check |
|---|---|---|
| 00:00–00:30 | Install/verify software and virtual environment | `python --version`, dependencies installed |
| 00:30–01:00 | Create DB, edit `.env`, run full pipeline | Pipeline PASS |
| 01:00–01:45 | Run SQL queries and capture evidence | Counts and business queries saved |
| 01:45–02:00 | Inspect Excel workbook | Threshold formulas update |
| 02:00–05:00 | Build four Power BI pages | Values match checklist |
| 05:00–05:30 | Polish filters, tooltips, actions, alt text | No clipped visuals |
| 05:30–06:00 | Publish and capture screenshots | Link/screenshots work |
| 06:00–06:30 | Upload GitHub and update CV | README renders; `.env` absent |

If time runs short, finish three substantive Power BI pages first: Executive Overview, Model Performance, and Underwriting Decision Simulator. Add Portfolio Resilience next; do not fill space with weak visuals.

## 9. Numbers that must match before publishing

```text
Loans                    50,000
Defaults                  6,950
Overall default rate      13.90%
Test loans               11,077
Selected local model      Calibrated Random Forest
Operating threshold       0.17
Test ROC-AUC               0.8675
Test PR-AUC                0.4247
Test recall                87.51%
Test precision             19.82%
Test manual-review rate    34.48%
TP / FP / FN / TN          757 / 3,062 / 108 / 7,150
```

If your local XGBoost run selects a different model, use the newly generated values in `data\outputs\model_metrics.csv` and update the dashboard/CV honestly.

## 10. Final manual work

- Build and save the PBIX.
- Run local PostgreSQL/pgAdmin validation.
- Let XGBoost run after installation.
- Publish Power BI and copy the report link.
- Create GitHub repository and replace `[GitHub Link]` in `docs\CV_BULLETS.md`.
- Never claim deployment, real time, causal impact, or measured cost reduction.

