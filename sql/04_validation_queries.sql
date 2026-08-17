-- Run in pgAdmin after the full pipeline. Expected counts are from the supplied dataset.
SELECT 'loans' AS table_name, COUNT(*) AS rows FROM credit_risk.loans
UNION ALL SELECT 'credit_ratings', COUNT(*) FROM credit_risk.credit_ratings
UNION ALL SELECT 'portfolio_metrics', COUNT(*) FROM credit_risk.portfolio_metrics
UNION ALL SELECT 'stress_scenarios', COUNT(*) FROM credit_risk.stress_scenarios
UNION ALL SELECT 'vintage_analysis', COUNT(*) FROM credit_risk.vintage_analysis
UNION ALL SELECT 'loan_predictions', COUNT(*) FROM credit_risk.loan_predictions;

SELECT
    COUNT(*) FILTER (WHERE default_probability NOT BETWEEN 0 AND 1) AS invalid_probabilities,
    COUNT(*) FILTER (WHERE loan_id IS NULL) AS missing_loan_ids,
    COUNT(*) FILTER (WHERE underwriting_action IS NULL) AS missing_actions,
    MIN(default_probability) AS min_probability,
    MAX(default_probability) AS max_probability
FROM credit_risk.loan_predictions;

SELECT
    data_split,
    COUNT(*) AS rows,
    SUM(defaulted) AS defaults,
    ROUND(AVG(defaulted::NUMERIC), 6) AS default_rate
FROM credit_risk.loan_predictions
GROUP BY data_split
ORDER BY data_split;

SELECT COUNT(*) AS powerbi_rows FROM credit_risk.mv_powerbi_loans;
SELECT * FROM credit_risk.vw_model_test_metrics ORDER BY model_name, threshold_type;

