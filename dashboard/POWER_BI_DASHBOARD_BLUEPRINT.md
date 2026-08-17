# Power BI Dashboard Blueprint

## 1. Scope and honest interpretation

Report title: **Credit Risk Portfolio & Underwriting Analytics**

The report answers three decision questions:

1. Where are default risk and credit exposure concentrated?
2. How well does the selected model rank unseen loans, and what are its errors?
3. How does the manual-review workload change when the decision threshold changes?

The target is `defaulted` during the **simulated contractual term**. It is not a fixed 12-month PD target. Therefore:

- `default_probability` is a term-default risk score;
- `pd_annual` is kept as a separate dataset benchmark and must not be directly compared with the model score;
- `term_risk_loss_proxy = default_probability × ead × lgd` is only a review-priority proxy, not accounting expected loss;
- model output supports triage to **Manual Review**, not automatic rejection;
- all findings are descriptive or predictive, not causal.

## 2. Data sources

### Preferred route: PostgreSQL

In Power BI Desktop, choose **Home > Get data > PostgreSQL database**.

- Server: `localhost:5432`
- Database: `credit_risk_db`
- Data connectivity mode: **Import** for this portfolio project
- Authentication: Database; enter the PostgreSQL username and password from `.env`

Load these objects:

| Power BI table | PostgreSQL object | Grain |
|---|---|---|
| Fact Loans | `credit_risk.mv_powerbi_loans` | One originated loan |
| Fact Thresholds | `credit_risk.vw_threshold_simulator` | One model/split/threshold |
| Fact Model Metrics | `credit_risk.model_metrics` | One model/split/threshold type |
| Fact Monthly Portfolio | `credit_risk.portfolio_metrics` | One month |
| Fact Stress | `credit_risk.vw_stress_scenarios` | One scenario/sector |
| Fact Vintage | `credit_risk.vintage_analysis` | One vintage/month-on-books |
| Fact Migration | `credit_risk.vw_rating_migration` | One year/sector |
| Feature Importance | `credit_risk.feature_importance` | One selected-model feature |

### Fallback route: CSV

Use **Home > Get data > Text/CSV** and import the matching files from `dashboard/data/`:

- `loans_scored.csv`
- `selected_model_test_thresholds.csv`
- `model_metrics.csv`
- `portfolio_metrics.csv`
- `stress_scenarios.csv`
- `vintage_analysis.csv`
- `credit_ratings.csv`
- `feature_importance.csv`

The fallback is useful when PostgreSQL is not running or when publishing a portfolio report without a local database connection.

## 3. Power Query preparation

Rename queries exactly as listed above. In Power Query:

1. Set date columns to **Date**: `origination_date`, `maturity_date`, `default_date`, portfolio `date`.
2. Set IDs/categories to **Text**.
3. Set counts and flags to **Whole number**.
4. Set EAD, EL, RWA, losses, and proxies to **Fixed decimal number**.
5. Set probabilities/rates to **Decimal number**.
6. Disable load for any staging query used only to create a dimension.
7. Do not remove legitimate high EAD values merely because an IQR rule labels them as outliers.

Create these dimension tables by referencing Fact Loans:

```powerquery
// Dim Sector
let
    Source = #"Fact Loans",
    Keep = Table.SelectColumns(Source, {"sector"}),
    DistinctRows = Table.Distinct(Keep)
in
    DistinctRows
```

```powerquery
// Dim Rating
let
    Source = #table(
        {"initial_rating", "rating_sort"},
        {{"AAA",1},{"AA",2},{"A",3},{"BBB",4},{"BB",5},{"B",6},{"CCC",7}}
    )
in
    Source
```

Create a date dimension in DAX:

```DAX
Dim Date =
ADDCOLUMNS(
    CALENDAR(DATE(2015, 1, 1), DATE(2024, 12, 31)),
    "Year", YEAR([Date]),
    "Month Number", MONTH([Date]),
    "Month", FORMAT([Date], "MMM"),
    "Year Month", FORMAT([Date], "YYYY-MM"),
    "Quarter", "Q" & FORMAT([Date], "Q")
)
```

Sort `Dim Date[Month]` by `Month Number`; sort `Dim Rating[initial_rating]` by `rating_sort`.

## 4. Semantic model

Use one-way filters from dimensions to facts.

| From (1) | To (*) | Key | Active |
|---|---|---|---|
| Dim Date | Fact Loans | `Date` → `origination_date` | Yes |
| Dim Date | Fact Monthly Portfolio | `Date` → `date` | Yes |
| Dim Sector | Fact Loans | `sector` → `sector` | Yes |
| Dim Sector | Fact Stress | `sector` → `sector` | Yes |
| Dim Sector | Fact Migration | `sector` → `sector` | Yes |
| Dim Rating | Fact Loans | `initial_rating` → `initial_rating` | Yes |

Keep Fact Thresholds, Fact Model Metrics, Fact Vintage, and Feature Importance disconnected unless a specific relationship is required. This avoids ambiguous paths between fact tables.

## 5. What-if parameters

Create two parameters from **Modeling > New parameter > Numeric range**.

### Decision Threshold

- Data type: Decimal number
- Minimum: `0.01`
- Maximum: `0.50`
- Increment: `0.01`
- Default: `0.17`
- Add slicer to page: Yes

### Opportunity Cost Rate

- Data type: Decimal number
- Minimum: `0.00`
- Maximum: `0.10`
- Increment: `0.005`
- Default: `0.02`
- Add slicer to page: Yes

These assumptions must be visually marked as user-controlled. The 2% value is a scenario assumption, not a measured realized cost.

## 6. Core DAX measures

Create a dedicated table named `_Measures` and store measures there.

```DAX
Loan Count = DISTINCTCOUNT('Fact Loans'[loan_id])

Total EAD = SUM('Fact Loans'[ead])

Observed Defaults = SUM('Fact Loans'[defaulted])

Observed Default Rate = DIVIDE([Observed Defaults], [Loan Count])

Existing Expected Loss = SUM('Fact Loans'[el])

Average Credit Score = AVERAGE('Fact Loans'[credit_score])

Average Term Risk Score = AVERAGE('Fact Loans'[default_probability])

Manual Review Loans =
VAR ThresholdValue = [Decision Threshold Value]
RETURN
    CALCULATE(
        [Loan Count],
        KEEPFILTERS('Fact Loans'[data_split] = "test"),
        FILTER('Fact Loans', 'Fact Loans'[default_probability] >= ThresholdValue)
    )

Test Loans =
CALCULATE([Loan Count], KEEPFILTERS('Fact Loans'[data_split] = "test"))

Manual Review Rate = DIVIDE([Manual Review Loans], [Test Loans])

Approval Rate = 1 - [Manual Review Rate]
```

Dynamic confusion-matrix measures:

```DAX
True Positive =
VAR T = [Decision Threshold Value]
RETURN COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 1 &&
        'Fact Loans'[default_probability] >= T
    )
)

False Positive =
VAR T = [Decision Threshold Value]
RETURN COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 0 &&
        'Fact Loans'[default_probability] >= T
    )
)

False Negative =
VAR T = [Decision Threshold Value]
RETURN COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 1 &&
        'Fact Loans'[default_probability] < T
    )
)

True Negative =
VAR T = [Decision Threshold Value]
RETURN COUNTROWS(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 0 &&
        'Fact Loans'[default_probability] < T
    )
)

Precision = DIVIDE([True Positive], [True Positive] + [False Positive])

Recall = DIVIDE([True Positive], [True Positive] + [False Negative])

Specificity = DIVIDE([True Negative], [True Negative] + [False Positive])

F1 Score = DIVIDE(2 * [Precision] * [Recall], [Precision] + [Recall])
```

Threshold economics:

```DAX
Missed Default Loss Exposure =
VAR T = [Decision Threshold Value]
RETURN
SUMX(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 1 &&
        'Fact Loans'[default_probability] < T
    ),
    'Fact Loans'[ead] * 'Fact Loans'[lgd]
)

Rejected Good EAD =
VAR T = [Decision Threshold Value]
RETURN
SUMX(
    FILTER(
        'Fact Loans',
        'Fact Loans'[data_split] = "test" &&
        'Fact Loans'[defaulted] = 0 &&
        'Fact Loans'[default_probability] >= T
    ),
    'Fact Loans'[ead]
)

Dynamic Cost Proxy =
[Missed Default Loss Exposure] +
[Rejected Good EAD] * [Opportunity Cost Rate Value]
```

Model-result measures:

```DAX
Selected Model =
CALCULATE(
    SELECTEDVALUE('Fact Model Metrics'[model_name]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[threshold_type] = "operating_recall_constraint"
)

Test ROC-AUC =
CALCULATE(
    MAX('Fact Model Metrics'[roc_auc]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[model_name] = "Calibrated Random Forest"
)

Test PR-AUC =
CALCULATE(
    MAX('Fact Model Metrics'[pr_auc]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[model_name] = "Calibrated Random Forest"
)

Test Brier Score =
CALCULATE(
    MAX('Fact Model Metrics'[brier_score]),
    'Fact Model Metrics'[split] = "test",
    'Fact Model Metrics'[model_name] = "Calibrated Random Forest"
)
```

Stress measures:

```DAX
Stressed Expected Loss = SUM('Fact Stress'[expected_loss_stress])

Base Expected Loss (Stress Table) = SUM('Fact Stress'[expected_loss_base])

Incremental Expected Loss = SUM('Fact Stress'[incremental_expected_loss])

Stress EL Uplift =
DIVIDE([Incremental Expected Loss], [Base Expected Loss (Stress Table)])
```

## 7. Page 1 — Executive Overview

Business question: **Where are portfolio exposure and observed default risk concentrated?**

Page size: Custom `1440 × 900`. Background `#F5F7FA`.

Global slicers: Origination Year, Sector, Initial Rating, Loan Type. Sync Sector and Rating slicers across Pages 1–3.

| Visual | Type | Field wells | Tooltips | Purpose |
|---|---|---|---|---|
| Loan Count | Card | Callout: `[Loan Count]` | — | Portfolio scale |
| Total EAD | Card | Callout: `[Total EAD]` | — | Credit exposure |
| Observed Default Rate | Card | Callout: `[Observed Default Rate]` | Defaults, Loan Count | Outcome profile |
| Existing Expected Loss | Card | Callout: `[Existing Expected Loss]` | — | Dataset risk-system benchmark |
| Average Credit Score | Card | Callout: `[Average Credit Score]` | — | Borrower quality context |
| Origination Cohort Trend | Line chart | X-axis: Dim Date[Year]; Y-axis: `[Observed Default Rate]`; Color: navy | Loan Count, Total EAD | Detect temporal label shift |
| Sector Risk & Exposure | Scatter | X: `[Observed Default Rate]`; Y: `[Total EAD]`; Size: `[Loan Count]`; Details/Color: Dim Sector[sector] | Existing Expected Loss, Avg Credit Score | Combine risk and materiality |
| Rating Risk Ladder | Clustered bar | Y-axis: Dim Rating[initial_rating]; X-axis: `[Observed Default Rate]`; Color: rating risk gradient | Loan Count, Total EAD | Show monotonic risk pattern |
| Key Findings | Text box | Actual findings listed below | — | Executive interpretation |

Required findings to verify in the visual:

- 50,000 loans; total EAD `$164.93B`; 6,950 defaults; 13.9% observed default rate.
- Financials has the highest sector default rate (14.75%) and largest EAD (18.29% of portfolio).
- CCC loans show a 50.87% observed eventual-default rate.
- Origination-year default rates change materially, peaking at 21.54% for 2019 and falling to 7.54% for 2023; this is label/population drift, not proof that risk policy improved.

Actions:

- Review concentration limits where high exposure and high default rates overlap.
- Use rating and score bands to prioritize deeper underwriting, while retaining human judgment.
- Track model calibration and operating threshold by origination cohort.

## 8. Page 2 — Model Performance & Risk Segmentation

Business question: **Does the selected model rank unseen loans effectively, and where does it fail?**

Page-level filter: `data_split = test` for row-level visuals.

| Visual | Type | Field wells | Tooltips | Purpose |
|---|---|---|---|---|
| Selected Model | Card | `[Selected Model]` | — | Model identity |
| Test ROC-AUC | Card | `[Test ROC-AUC]` | — | Ranking across thresholds |
| Test PR-AUC | Card | `[Test PR-AUC]` | Test prevalence | Imbalance-aware performance |
| Test Brier Score | Card | `[Test Brier Score]` | — | Probability error |
| Model Comparison | Clustered bar | Axis: model_name; Values: PR-AUC; Small multiples or legend: split | ROC-AUC, Brier | Compare baseline and candidate |
| Risk Decile Lift | Column chart | X: risk_decile; Y: observed default rate; Color: decile risk scale | loan count, lift, total EAD | Validate ranking concentration |
| Feature Importance | Horizontal bar | Y: feature; X: importance_mean | importance_std | Explain ranking drivers |
| Confusion Matrix | Matrix | Rows: Actual Outcome; Columns: Review Decision; Values: TP/FP/FN/TN measures | Percentage of row total | Show operational errors |
| Limitation Banner | Text box | Fixed text | — | Prevent overclaiming |

Formatting:

- Color true positives/true negatives teal; false positives amber; false negatives red.
- Risk decile 1 should be red, decile 10 teal; do not use rainbow colors.
- Show XGBoost as `Not executed in validation environment` until it is rerun locally; never invent a metric.

Validated local results:

- Calibrated Random Forest: test ROC-AUC `0.8675`; PR-AUC `0.4247`; Brier `0.0669`.
- At threshold `0.17`: recall `87.51%`, precision `19.82%`, F1 `32.32%`, specificity `70.02%`.
- Confusion matrix: TN `7,150`; FP `3,062`; FN `108`; TP `757`.
- Top test risk decile default rate `44.05%`, or `5.64×` the 7.81% test default rate.

Limitations shown on page:

- Test default prevalence is lower than train prevalence, indicating temporal drift.
- A high-recall threshold produces many false positives; this is a triage system.
- No protected-class data is available, so a complete fairness audit is not possible.
- Feature importance is predictive association, not causality.

## 9. Page 3 — Underwriting Decision Simulator

Business question: **What review workload and missed-default trade-off results from a selected threshold?**

| Visual | Type | Field wells | Tooltips / details |
|---|---|---|---|
| Decision Threshold | What-if slicer | Decision Threshold[Decision Threshold] | Default 0.17 |
| Opportunity Cost Rate | What-if slicer | Opportunity Cost Rate[Opportunity Cost Rate] | Default 2%; label as assumption |
| Precision / Recall / Approval | Cards | `[Precision]`, `[Recall]`, `[Approval Rate]` | Dynamic |
| Review Workload | Cards | `[Manual Review Loans]`, `[Manual Review Rate]` | Dynamic |
| Threshold Trade-off | Line chart | X: Fact Thresholds[threshold]; Y: precision, recall, approval_rate | F1, FP, FN, cost proxy |
| Cost Bridge | Waterfall | Category: Missed Default Exposure / Rejected Good Opportunity Cost; Y: component measures | Dynamic Cost Proxy | Use component helper table if needed |
| Confusion Matrix | Matrix | Dynamic TP/FP/FN/TN | Row percentages |
| Review Queue | Table | loan_id, sector, rating, credit_score, EAD, default_probability, risk_band, term_risk_loss_proxy | Filter score ≥ parameter; sort proxy descending |
| Decision Guidance | Text box | Dynamic narrative or fixed interpretation | Avoid automatic reject language |

At the validated threshold 0.17, the page must show:

- 3,819 of 11,077 test loans routed to manual review (34.48%).
- Recall 87.51%, precision 19.82%, approval rate 65.52%.
- Missed-default loss exposure approximately `$177M`.
- Rejected-good EAD approximately `$9.818B`.
- Dynamic cost proxy approximately `$373M` at the illustrative 2% opportunity-cost assumption.

Recommended decision statement:

> Use 0.17 as a high-recall starting point for analyst review, then validate review capacity, calibration, and realized costs before adopting a production policy.

## 10. Page 4 — Portfolio Resilience

Business question: **How does the portfolio behave across stress scenarios, vintages, and rating migration?**

| Visual | Type | Field wells | Tooltips | Purpose |
|---|---|---|---|---|
| Scenario | Slicer | Fact Stress[scenario] | Default: severe | Select stress case |
| Stressed EL | Card | `[Stressed Expected Loss]` | Base EL | Scenario loss |
| Incremental EL | Card | `[Incremental Expected Loss]` | Stress EL uplift | Capital impact |
| Sector Stress Impact | Clustered bar | Y: sector; X: incremental_expected_loss; Color: scenario | stressed PD/LGD, total EAD | Identify scenario concentration |
| Vintage Curves | Line chart | X: months_on_books; Y: cumulative_default_rate; Color/Details: vintage | originated loans, avg PD | Compare cohort performance |
| Rating Migration | Line chart | X: year; Y: downgrade_rate; Color: sector or total | upgrades, defaults | Monitor deterioration |
| Monthly Macro Context | Combo chart | X: date; Columns: new_defaults; Line: unemployment or spread | avg PD, total EAD | Context only; no causal claim |

Validated stress insights:

- Severe scenario total stressed expected loss: `$3.894B`, incremental `$1.970B` (`+102.4%` vs stress-table base).
- COVID-like scenario is the largest supplied stress: `$5.122B`, incremental `$3.198B` (`+166.2%`).
- Under COVID-like stress, Financials has the largest incremental expected loss (`$608.9M`).
- The 2019Q4 vintage has the highest supplied month-36 cumulative default rate (`20.72%`).
- The supplied `baseline` scenario has stressed EL below `expected_loss_base` because the scenario table uses its own sector LGD assumptions; show this as a dataset limitation rather than “fixing” it silently.

## 11. Navigation and interactions

1. Add a left navigation rail with four page buttons.
2. Sync Year, Sector, and Rating slicers across Pages 1–3.
3. Turn on cross-highlighting from sector and rating visuals.
4. Add a drill-through page for a selected loan with application attributes, risk score, band, and review action.
5. Add a report-page tooltip for sector with EAD, default rate, average rating/score, and stress impact.
6. Add a **Reset filters** bookmark button on every page.
7. Do not let the threshold slicer filter historical descriptive visuals; it should affect only dynamic decision measures and review queue.

## 12. Layout and style specification

- Canvas: `1440 × 900` custom.
- Grid: 24 px outer margin; 16 px gutters; 8 px corner radius.
- Background: `#F5F7FA`; cards: white; headers/navigation: `#132238`.
- Primary: `#1F4E78`; highlight: `#20A4F3`; positive: `#2CB67D`; warning: `#F4B942`; adverse: `#D64550`.
- Font: Segoe UI. Page title 24–28 pt; visual titles 12–14 pt; labels 10–11 pt; KPI values 24–32 pt.
- Currency: `$0.0B` or `$0M`, with the dataset-units caveat in the report information tooltip.
- Rates: `0.0%`; model metrics: `0.000`; counts: `#,##0`.
- Add alt text to every meaningful visual and set a logical tab order.
- Avoid red/green as the only indicator; pair color with labels/icons.

Import `dashboard/credit_risk_theme.json` through **View > Themes > Browse for themes**.

## 13. Build order in Power BI Desktop

1. Connect to PostgreSQL or import CSV files.
2. Rename queries and set data types.
3. Build dimension tables and relationships.
4. Create the `_Measures` table and paste the DAX measures.
5. Create Decision Threshold and Opportunity Cost Rate parameters.
6. Import the JSON theme.
7. Build Page 1 from KPI cards to detailed visuals.
8. Build Page 2 and validate all test metrics against `model_metrics.csv`.
9. Build Page 3 and validate threshold 0.17 against `threshold_analysis.csv`.
10. Build Page 4 and validate severe/COVID-like totals against `stress_scenarios.csv`.
11. Configure slicer sync, visual interactions, drill-through, tooltips, bookmarks, alt text, and tab order.
12. Open **View > Performance analyzer**, start recording, interact with the report, and investigate slow visuals.
13. Save the PBIX, capture screenshots, and publish only after all reconciliations pass.

## 14. Reconciliation checklist

- Fact Loans rows: `50,000`.
- Unique loan IDs: `50,000`.
- Test rows: `11,077`.
- Score range: `0.069799` to `0.488878`.
- Threshold 0.17: TP `757`, FP `3,062`, FN `108`, TN `7,150`.
- Page 1 EAD: `$164.930B`.
- Page 4 severe stressed EL: `$3.894B`.
- No blank score, risk band, action, or term-risk loss proxy.

## 15. Professional references

Use these as design and implementation references, not as templates to copy:

- [Microsoft: Understand star schema and its importance for Power BI](https://learn.microsoft.com/en-us/power-bi/guidance/star-schema)
- [Microsoft: PostgreSQL connector for Power Query](https://learn.microsoft.com/en-us/power-query/connectors/postgresql)
- [Microsoft: Create and use what-if parameters](https://learn.microsoft.com/en-us/power-bi/transform-model/desktop-what-if)
- [Microsoft: Financial sample workbook](https://learn.microsoft.com/en-us/power-bi/create-reports/sample-financial-download)
- [Microsoft: Use report themes](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-report-themes)
- [Microsoft: Design accessible Power BI reports](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-creating-reports)
- [Microsoft: Performance Analyzer](https://learn.microsoft.com/en-us/power-bi/create-reports/performance-analyzer)
- [Microsoft: Publish from Power BI Desktop](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-upload-desktop-files)

