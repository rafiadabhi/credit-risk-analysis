CREATE SCHEMA IF NOT EXISTS credit_risk;

CREATE TABLE IF NOT EXISTS credit_risk.loans (
    loan_id VARCHAR(20) PRIMARY KEY,
    origination_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    maturity_months SMALLINT NOT NULL CHECK (maturity_months BETWEEN 1 AND 360),
    sector VARCHAR(50) NOT NULL,
    loan_type VARCHAR(50) NOT NULL,
    collateral VARCHAR(50) NOT NULL,
    initial_rating VARCHAR(5) NOT NULL,
    credit_score SMALLINT NOT NULL CHECK (credit_score BETWEEN 300 AND 850),
    ead NUMERIC(18,2) NOT NULL CHECK (ead > 0),
    coupon_rate NUMERIC(10,6) NOT NULL CHECK (coupon_rate BETWEEN 0 AND 100),
    leverage NUMERIC(10,6) NOT NULL CHECK (leverage >= 0),
    interest_coverage NUMERIC(10,6) NOT NULL CHECK (interest_coverage >= 0),
    debt_to_equity NUMERIC(10,6) NOT NULL CHECK (debt_to_equity >= 0),
    pd_annual NUMERIC(12,9) NOT NULL CHECK (pd_annual BETWEEN 0 AND 1),
    lgd NUMERIC(10,7) NOT NULL CHECK (lgd BETWEEN 0 AND 1),
    el NUMERIC(18,2) NOT NULL CHECK (el >= 0),
    unexpected_loss NUMERIC(18,2) NOT NULL CHECK (unexpected_loss >= 0),
    rwa NUMERIC(18,2) NOT NULL CHECK (rwa >= 0),
    defaulted SMALLINT NOT NULL CHECK (defaulted IN (0, 1)),
    default_date DATE,
    survival_months SMALLINT NOT NULL CHECK (survival_months >= 1),
    recovery_rate NUMERIC(10,7),
    loss_given_default NUMERIC(18,2),
    origination_gdp_growth NUMERIC(10,6) NOT NULL,
    origination_unemployment NUMERIC(10,6) NOT NULL,
    origination_policy_rate NUMERIC(10,6) NOT NULL,
    origination_credit_spread_bps NUMERIC(10,3) NOT NULL,
    origination_year SMALLINT NOT NULL,
    origination_month SMALLINT NOT NULL CHECK (origination_month BETWEEN 1 AND 12),
    origination_quarter VARCHAR(7) NOT NULL,
    default_loss_amount NUMERIC(18,2) NOT NULL CHECK (default_loss_amount >= 0),
    existing_expected_loss_rate NUMERIC(12,9) NOT NULL CHECK (existing_expected_loss_rate >= 0),
    credit_score_band VARCHAR(20) NOT NULL,
    ead_band VARCHAR(20) NOT NULL,
    reported_maturity_is_capped SMALLINT NOT NULL CHECK (reported_maturity_is_capped IN (0, 1)),
    CONSTRAINT default_fields_consistent CHECK (
        (defaulted = 1 AND default_date IS NOT NULL AND recovery_rate IS NOT NULL AND loss_given_default IS NOT NULL)
        OR
        (defaulted = 0 AND default_date IS NULL AND recovery_rate IS NULL AND loss_given_default IS NULL)
    )
);

CREATE TABLE IF NOT EXISTS credit_risk.credit_ratings (
    issuer_id VARCHAR(20) NOT NULL,
    sector VARCHAR(50) NOT NULL,
    year SMALLINT NOT NULL,
    from_rating VARCHAR(5) NOT NULL,
    to_rating VARCHAR(5) NOT NULL,
    upgraded SMALLINT NOT NULL CHECK (upgraded IN (0, 1)),
    downgraded SMALLINT NOT NULL CHECK (downgraded IN (0, 1)),
    defaulted SMALLINT NOT NULL CHECK (defaulted IN (0, 1)),
    notches_moved SMALLINT NOT NULL,
    PRIMARY KEY (issuer_id, year)
);

CREATE TABLE IF NOT EXISTS credit_risk.portfolio_metrics (
    date DATE PRIMARY KEY,
    n_active_loans INTEGER NOT NULL CHECK (n_active_loans >= 0),
    total_ead NUMERIC(20,2) NOT NULL CHECK (total_ead >= 0),
    total_el NUMERIC(20,2) NOT NULL CHECK (total_el >= 0),
    total_rwa NUMERIC(20,2) NOT NULL CHECK (total_rwa >= 0),
    el_rate NUMERIC(12,9) NOT NULL CHECK (el_rate >= 0),
    avg_pd NUMERIC(12,9) NOT NULL CHECK (avg_pd BETWEEN 0 AND 1),
    avg_lgd NUMERIC(10,7) NOT NULL CHECK (avg_lgd BETWEEN 0 AND 1),
    var_99 NUMERIC(20,2) NOT NULL CHECK (var_99 >= 0),
    cvar_995 NUMERIC(20,2) NOT NULL CHECK (cvar_995 >= 0),
    sector_hhi NUMERIC(10,7) NOT NULL CHECK (sector_hhi BETWEEN 0 AND 1),
    new_defaults INTEGER NOT NULL CHECK (new_defaults >= 0),
    gdp_growth NUMERIC(10,6) NOT NULL,
    unemployment NUMERIC(10,6) NOT NULL,
    policy_rate NUMERIC(10,6) NOT NULL,
    credit_spread_bps NUMERIC(10,3) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_risk.stress_scenarios (
    scenario VARCHAR(30) NOT NULL,
    gdp_shock_pp NUMERIC(10,6) NOT NULL,
    unemp_shock_pp NUMERIC(10,6) NOT NULL,
    rate_shock_pp NUMERIC(10,6) NOT NULL,
    credit_spread_bps INTEGER NOT NULL,
    sector VARCHAR(50) NOT NULL,
    base_pd NUMERIC(12,9) NOT NULL CHECK (base_pd BETWEEN 0 AND 1),
    stressed_pd NUMERIC(12,9) NOT NULL CHECK (stressed_pd BETWEEN 0 AND 1),
    pd_uplift_pp NUMERIC(10,6) NOT NULL,
    pd_multiplier NUMERIC(10,6) NOT NULL CHECK (pd_multiplier >= 0),
    base_lgd NUMERIC(10,7) NOT NULL CHECK (base_lgd BETWEEN 0 AND 1),
    stressed_lgd NUMERIC(10,7) NOT NULL CHECK (stressed_lgd BETWEEN 0 AND 1),
    total_ead NUMERIC(20,2) NOT NULL CHECK (total_ead >= 0),
    expected_loss_base NUMERIC(20,2) NOT NULL CHECK (expected_loss_base >= 0),
    expected_loss_stress NUMERIC(20,2) NOT NULL CHECK (expected_loss_stress >= 0),
    el_increase_pct NUMERIC(12,6) NOT NULL,
    PRIMARY KEY (scenario, sector)
);

CREATE TABLE IF NOT EXISTS credit_risk.vintage_analysis (
    vintage VARCHAR(7) NOT NULL,
    months_on_books SMALLINT NOT NULL CHECK (months_on_books BETWEEN 1 AND 360),
    n_loans_originated INTEGER NOT NULL CHECK (n_loans_originated >= 0),
    n_active INTEGER NOT NULL CHECK (n_active >= 0),
    n_defaulted_cumulative INTEGER NOT NULL CHECK (n_defaulted_cumulative >= 0),
    cumulative_default_rate NUMERIC(12,9) NOT NULL CHECK (cumulative_default_rate BETWEEN 0 AND 1),
    marginal_default_rate NUMERIC(12,9) NOT NULL CHECK (marginal_default_rate BETWEEN 0 AND 1),
    avg_pd_at_origination NUMERIC(12,9) NOT NULL CHECK (avg_pd_at_origination BETWEEN 0 AND 1),
    avg_credit_score NUMERIC(10,3) NOT NULL,
    PRIMARY KEY (vintage, months_on_books)
);

CREATE TABLE IF NOT EXISTS credit_risk.loan_predictions (
    loan_id VARCHAR(20) PRIMARY KEY REFERENCES credit_risk.loans(loan_id),
    origination_date DATE NOT NULL,
    sector VARCHAR(50) NOT NULL,
    initial_rating VARCHAR(5) NOT NULL,
    credit_score SMALLINT NOT NULL,
    ead NUMERIC(18,2) NOT NULL,
    lgd NUMERIC(10,7) NOT NULL,
    pd_annual NUMERIC(12,9) NOT NULL,
    defaulted SMALLINT NOT NULL CHECK (defaulted IN (0, 1)),
    data_split VARCHAR(15) NOT NULL,
    model_name VARCHAR(60) NOT NULL,
    default_probability NUMERIC(12,9) NOT NULL CHECK (default_probability BETWEEN 0 AND 1),
    operating_threshold NUMERIC(8,6) NOT NULL CHECK (operating_threshold BETWEEN 0 AND 1),
    predicted_default SMALLINT NOT NULL CHECK (predicted_default IN (0, 1)),
    risk_band VARCHAR(20) NOT NULL,
    risk_decile SMALLINT NOT NULL CHECK (risk_decile BETWEEN 1 AND 10),
    underwriting_action VARCHAR(20) NOT NULL,
    term_risk_loss_proxy NUMERIC(20,2) NOT NULL CHECK (term_risk_loss_proxy >= 0)
);

CREATE TABLE IF NOT EXISTS credit_risk.model_metrics (
    model_name VARCHAR(60) NOT NULL,
    split VARCHAR(15) NOT NULL,
    threshold_type VARCHAR(40) NOT NULL,
    threshold NUMERIC(8,6) NOT NULL,
    roc_auc NUMERIC(12,9) NOT NULL,
    pr_auc NUMERIC(12,9) NOT NULL,
    precision NUMERIC(12,9) NOT NULL,
    recall NUMERIC(12,9) NOT NULL,
    f1 NUMERIC(12,9) NOT NULL,
    specificity NUMERIC(12,9) NOT NULL,
    brier_score NUMERIC(12,9) NOT NULL,
    approval_rate NUMERIC(12,9) NOT NULL,
    true_negative INTEGER NOT NULL,
    false_positive INTEGER NOT NULL,
    false_negative INTEGER NOT NULL,
    true_positive INTEGER NOT NULL,
    PRIMARY KEY (model_name, split, threshold_type)
);

CREATE TABLE IF NOT EXISTS credit_risk.threshold_analysis (
    model_name VARCHAR(60) NOT NULL,
    split VARCHAR(15) NOT NULL,
    threshold NUMERIC(8,6) NOT NULL,
    precision NUMERIC(12,9) NOT NULL,
    recall NUMERIC(12,9) NOT NULL,
    f1 NUMERIC(12,9) NOT NULL,
    specificity NUMERIC(12,9) NOT NULL,
    approval_rate NUMERIC(12,9) NOT NULL,
    true_negative INTEGER NOT NULL,
    false_positive INTEGER NOT NULL,
    false_negative INTEGER NOT NULL,
    true_positive INTEGER NOT NULL,
    default_loss_exposure NUMERIC(22,2) NOT NULL,
    rejected_good_ead NUMERIC(22,2) NOT NULL,
    opportunity_cost_rate_assumption NUMERIC(10,7) NOT NULL,
    total_cost_proxy NUMERIC(22,2) NOT NULL,
    PRIMARY KEY (model_name, split, threshold)
);

CREATE TABLE IF NOT EXISTS credit_risk.feature_importance (
    model_name VARCHAR(60) NOT NULL,
    feature VARCHAR(80) NOT NULL,
    importance_mean DOUBLE PRECISION NOT NULL,
    importance_std DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (model_name, feature)
);

CREATE INDEX IF NOT EXISTS idx_loans_origination_date ON credit_risk.loans(origination_date);
CREATE INDEX IF NOT EXISTS idx_loans_sector ON credit_risk.loans(sector);
CREATE INDEX IF NOT EXISTS idx_loans_rating ON credit_risk.loans(initial_rating);
CREATE INDEX IF NOT EXISTS idx_loans_defaulted ON credit_risk.loans(defaulted);
CREATE INDEX IF NOT EXISTS idx_predictions_probability ON credit_risk.loan_predictions(default_probability DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_risk_band ON credit_risk.loan_predictions(risk_band);
CREATE INDEX IF NOT EXISTS idx_ratings_year_sector ON credit_risk.credit_ratings(year, sector);
