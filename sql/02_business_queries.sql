-- Run this file in pgAdmin Query Tool after 01_schema.sql, data loading,
-- model training, and 03_powerbi_views.sql. Each query answers a business question.

-- Q1. Which sectors combine high default rates with large exposure?
WITH sector_risk AS (
    SELECT
        sector,
        COUNT(*) AS loans,
        SUM(ead) AS total_ead,
        AVG(defaulted::NUMERIC) AS default_rate
    FROM credit_risk.loans
    GROUP BY sector
)
SELECT
    sector,
    loans,
    ROUND(total_ead / 1000000000, 2) AS ead_billions,
    ROUND(100 * default_rate, 2) AS default_rate_pct,
    RANK() OVER (ORDER BY default_rate DESC) AS risk_rank,
    RANK() OVER (ORDER BY total_ead DESC) AS exposure_rank
FROM sector_risk
ORDER BY risk_rank, exposure_rank;

-- Q2. Does the selected model separate risk on the unseen 2022-2023 test period?
SELECT
    risk_decile,
    loan_count,
    defaults,
    ROUND(100 * default_rate, 2) AS default_rate_pct,
    ROUND(lift_vs_test_average, 2) AS lift_vs_test_average
FROM credit_risk.mv_risk_decile_lift
ORDER BY risk_decile;

-- Q3. What are the operating-threshold trade-offs around the chosen threshold?
WITH selected AS (
    SELECT operating_threshold
    FROM credit_risk.loan_predictions
    LIMIT 1
)
SELECT
    t.threshold,
    ROUND(t.precision, 4) AS precision,
    ROUND(t.recall, 4) AS recall,
    ROUND(t.approval_rate, 4) AS approval_rate,
    t.false_positive,
    t.false_negative,
    ROUND(t.total_cost_proxy / 1000000, 2) AS cost_proxy_millions
FROM credit_risk.threshold_analysis AS t
CROSS JOIN selected AS s
WHERE t.split = 'test'
  AND t.model_name = (SELECT model_name FROM credit_risk.loan_predictions LIMIT 1)
  AND t.threshold BETWEEN s.operating_threshold - 0.05 AND s.operating_threshold + 0.05
ORDER BY t.threshold;

-- Q4. Which individual applications should underwriting review first?
WITH ranked AS (
    SELECT
        loan_id,
        sector,
        initial_rating,
        credit_score,
        ead,
        default_probability,
        term_risk_loss_proxy,
        ROW_NUMBER() OVER (
            PARTITION BY sector
            ORDER BY term_risk_loss_proxy DESC, default_probability DESC
        ) AS sector_review_priority
    FROM credit_risk.mv_powerbi_loans
    WHERE underwriting_action = 'Manual Review'
      AND data_split = 'test'
)
SELECT *
FROM ranked
WHERE sector_review_priority <= 10
ORDER BY sector, sector_review_priority;

-- Q5. How did eventual default rates change by origination year?
WITH yearly AS (
    SELECT
        origination_year,
        COUNT(*) AS loans,
        AVG(defaulted::NUMERIC) AS default_rate
    FROM credit_risk.loans
    GROUP BY origination_year
)
SELECT
    origination_year,
    loans,
    ROUND(100 * default_rate, 2) AS default_rate_pct,
    ROUND(100 * (default_rate - LAG(default_rate) OVER (ORDER BY origination_year)), 2)
        AS yoy_change_percentage_points
FROM yearly
ORDER BY origination_year;

-- Q6. How does risk vary across EAD quartiles within each sector?
WITH exposure_buckets AS (
    SELECT
        sector,
        ead,
        defaulted,
        NTILE(4) OVER (PARTITION BY sector ORDER BY ead) AS sector_ead_quartile
    FROM credit_risk.loans
)
SELECT
    sector,
    sector_ead_quartile,
    COUNT(*) AS loans,
    ROUND(AVG(ead), 2) AS avg_ead,
    ROUND(100 * AVG(defaulted::NUMERIC), 2) AS default_rate_pct
FROM exposure_buckets
GROUP BY sector, sector_ead_quartile
ORDER BY sector, sector_ead_quartile;

-- Q7. Which scenarios and sectors generate the largest incremental expected loss?
SELECT
    scenario,
    sector,
    ROUND(incremental_expected_loss / 1000000, 2) AS incremental_el_millions,
    ROUND(el_increase_pct, 2) AS el_increase_pct,
    sector_impact_rank
FROM credit_risk.vw_stress_scenarios
WHERE scenario <> 'baseline'
ORDER BY scenario, sector_impact_rank;

-- Q8. Are rating downgrades accelerating by sector?
WITH migration AS (
    SELECT
        year,
        sector,
        downgrade_rate,
        LAG(downgrade_rate) OVER (PARTITION BY sector ORDER BY year) AS prior_year_rate
    FROM credit_risk.vw_rating_migration
)
SELECT
    year,
    sector,
    ROUND(100 * downgrade_rate, 2) AS downgrade_rate_pct,
    ROUND(100 * (downgrade_rate - prior_year_rate), 2) AS yoy_change_pp
FROM migration
ORDER BY sector, year;

-- Q9. Which vintages have the highest cumulative default rate at month 36?
SELECT
    vintage,
    n_loans_originated,
    n_defaulted_cumulative,
    ROUND(100 * cumulative_default_rate, 2) AS cumulative_default_rate_pct,
    RANK() OVER (ORDER BY cumulative_default_rate DESC) AS vintage_risk_rank
FROM credit_risk.vintage_analysis
WHERE months_on_books = 36
ORDER BY vintage_risk_rank;

-- Q10. What is the rolling 12-month portfolio risk trend?
SELECT
    date,
    n_active_loans,
    total_ead,
    avg_pd,
    AVG(avg_pd) OVER (
        ORDER BY date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
    ) AS avg_pd_12m,
    SUM(new_defaults) OVER (
        ORDER BY date ROWS BETWEEN 11 PRECEDING AND CURRENT ROW
    ) AS defaults_12m
FROM credit_risk.portfolio_metrics
ORDER BY date;
