-- Drop dependants before their source objects so this script is safely rerunnable.
DROP VIEW IF EXISTS credit_risk.vw_executive_kpis;
DROP VIEW IF EXISTS credit_risk.vw_model_test_metrics;
DROP VIEW IF EXISTS credit_risk.vw_threshold_simulator;
DROP VIEW IF EXISTS credit_risk.vw_stress_scenarios;
DROP VIEW IF EXISTS credit_risk.vw_rating_migration;
DROP VIEW IF EXISTS credit_risk.vw_vintage_curves;

DROP MATERIALIZED VIEW IF EXISTS credit_risk.mv_sector_risk;
DROP MATERIALIZED VIEW IF EXISTS credit_risk.mv_rating_risk;
DROP MATERIALIZED VIEW IF EXISTS credit_risk.mv_monthly_risk_trend;
DROP MATERIALIZED VIEW IF EXISTS credit_risk.mv_risk_decile_lift;
DROP MATERIALIZED VIEW IF EXISTS credit_risk.mv_powerbi_loans;

CREATE MATERIALIZED VIEW credit_risk.mv_powerbi_loans AS
SELECT
    l.*,
    p.data_split,
    p.model_name,
    p.default_probability,
    p.operating_threshold,
    p.predicted_default,
    p.risk_band,
    p.risk_decile,
    p.underwriting_action,
    p.term_risk_loss_proxy
FROM credit_risk.loans AS l
JOIN credit_risk.loan_predictions AS p USING (loan_id);

CREATE UNIQUE INDEX ux_mv_powerbi_loans_loan_id
    ON credit_risk.mv_powerbi_loans(loan_id);
CREATE INDEX ix_mv_powerbi_loans_sector
    ON credit_risk.mv_powerbi_loans(sector);
CREATE INDEX ix_mv_powerbi_loans_split
    ON credit_risk.mv_powerbi_loans(data_split);

CREATE MATERIALIZED VIEW credit_risk.mv_sector_risk AS
WITH sector_base AS (
    SELECT
        sector,
        COUNT(*) AS loan_count,
        SUM(ead) AS total_ead,
        SUM(defaulted) AS defaults,
        AVG(defaulted::NUMERIC) AS observed_default_rate,
        AVG(default_probability) AS avg_model_probability,
        SUM(term_risk_loss_proxy) AS term_risk_loss_proxy,
        SUM(el) AS existing_expected_loss,
        AVG(credit_score) AS avg_credit_score
    FROM credit_risk.mv_powerbi_loans
    GROUP BY sector
)
SELECT
    sector_base.*,
    RANK() OVER (ORDER BY observed_default_rate DESC) AS default_rate_rank,
    RANK() OVER (ORDER BY total_ead DESC) AS exposure_rank,
    total_ead / SUM(total_ead) OVER () AS exposure_share
FROM sector_base;

CREATE MATERIALIZED VIEW credit_risk.mv_rating_risk AS
WITH rating_order AS (
    SELECT * FROM (VALUES
        ('AAA', 1), ('AA', 2), ('A', 3), ('BBB', 4),
        ('BB', 5), ('B', 6), ('CCC', 7)
    ) AS r(initial_rating, rating_sort)
)
SELECT
    l.initial_rating,
    r.rating_sort,
    COUNT(*) AS loan_count,
    SUM(l.ead) AS total_ead,
    SUM(l.defaulted) AS defaults,
    AVG(l.defaulted::NUMERIC) AS observed_default_rate,
    AVG(l.default_probability) AS avg_model_probability,
    AVG(l.pd_annual) AS avg_existing_pd,
    AVG(l.credit_score) AS avg_credit_score
FROM credit_risk.mv_powerbi_loans AS l
JOIN rating_order AS r USING (initial_rating)
GROUP BY l.initial_rating, r.rating_sort;

CREATE MATERIALIZED VIEW credit_risk.mv_monthly_risk_trend AS
SELECT
    DATE_TRUNC('month', origination_date)::DATE AS origination_month,
    COUNT(*) AS originated_loans,
    SUM(ead) AS originated_ead,
    SUM(defaulted) AS eventual_defaults,
    AVG(defaulted::NUMERIC) AS eventual_default_rate,
    AVG(default_probability) AS avg_model_probability,
    AVG(pd_annual) AS avg_existing_pd,
    AVG(credit_score) AS avg_credit_score
FROM credit_risk.mv_powerbi_loans
GROUP BY DATE_TRUNC('month', origination_date)::DATE;

CREATE MATERIALIZED VIEW credit_risk.mv_risk_decile_lift AS
WITH test_deciles AS (
    SELECT
        risk_decile,
        COUNT(*) AS loan_count,
        SUM(defaulted) AS defaults,
        AVG(defaulted::NUMERIC) AS default_rate,
        AVG(default_probability) AS avg_probability,
        SUM(ead) AS total_ead
    FROM credit_risk.mv_powerbi_loans
    WHERE data_split = 'test'
    GROUP BY risk_decile
), test_average AS (
    SELECT AVG(defaulted::NUMERIC) AS portfolio_default_rate
    FROM credit_risk.mv_powerbi_loans
    WHERE data_split = 'test'
)
SELECT
    d.*,
    a.portfolio_default_rate,
    d.default_rate / NULLIF(a.portfolio_default_rate, 0) AS lift_vs_test_average
FROM test_deciles AS d
CROSS JOIN test_average AS a;

CREATE OR REPLACE VIEW credit_risk.vw_executive_kpis AS
SELECT
    COUNT(*) AS loans,
    SUM(ead) AS total_ead,
    SUM(defaulted) AS defaults,
    AVG(defaulted::NUMERIC) AS observed_default_rate,
    SUM(el) AS existing_expected_loss,
    SUM(term_risk_loss_proxy) AS term_risk_loss_proxy,
    AVG(credit_score) AS avg_credit_score,
    AVG(default_probability) AS avg_model_probability,
    AVG(pd_annual) AS avg_existing_pd
FROM credit_risk.mv_powerbi_loans;

CREATE OR REPLACE VIEW credit_risk.vw_model_test_metrics AS
SELECT *
FROM credit_risk.model_metrics
WHERE split = 'test';

CREATE OR REPLACE VIEW credit_risk.vw_threshold_simulator AS
SELECT *
FROM credit_risk.threshold_analysis
WHERE split = 'test';

CREATE OR REPLACE VIEW credit_risk.vw_stress_scenarios AS
SELECT
    scenario,
    sector,
    stressed_pd,
    stressed_lgd,
    total_ead,
    expected_loss_base,
    expected_loss_stress,
    expected_loss_stress - expected_loss_base AS incremental_expected_loss,
    el_increase_pct,
    RANK() OVER (
        PARTITION BY scenario ORDER BY expected_loss_stress - expected_loss_base DESC
    ) AS sector_impact_rank
FROM credit_risk.stress_scenarios;

CREATE OR REPLACE VIEW credit_risk.vw_rating_migration AS
SELECT
    year,
    sector,
    COUNT(*) AS issuer_observations,
    SUM(upgraded) AS upgrades,
    SUM(downgraded) AS downgrades,
    SUM(defaulted) AS defaults,
    AVG(notches_moved::NUMERIC) AS avg_notches_moved,
    SUM(downgraded)::NUMERIC / NULLIF(COUNT(*), 0) AS downgrade_rate
FROM credit_risk.credit_ratings
GROUP BY year, sector;

CREATE OR REPLACE VIEW credit_risk.vw_vintage_curves AS
SELECT * FROM credit_risk.vintage_analysis;
