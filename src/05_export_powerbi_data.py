import argparse
import json
import shutil

import numpy as np
import pandas as pd

from src.config import (
    DASHBOARD_DATA_DIR,
    OUTPUT_DIR,
    PROCESSED_FILES,
    ensure_directories,
)
from src.db import get_engine


PREDICTION_ONLY_COLUMNS = [
    "loan_id",
    "data_split",
    "model_name",
    "default_probability",
    "operating_threshold",
    "predicted_default",
    "risk_band",
    "risk_decile",
    "underwriting_action",
    "term_risk_loss_proxy",
]


def export_csv_mode() -> dict[str, int]:
    loans = pd.read_csv(PROCESSED_FILES["loans"], dtype={"loan_id": "string"})
    predictions = pd.read_csv(
        OUTPUT_DIR / "loan_predictions.csv", dtype={"loan_id": "string"}
    )
    scored = loans.merge(
        predictions[PREDICTION_ONLY_COLUMNS], on="loan_id", how="inner", validate="one_to_one"
    )
    if len(scored) != len(loans):
        raise ValueError("Not every cleaned loan has exactly one prediction.")

    tables = {
        "loans_scored.csv": scored,
        "model_metrics.csv": pd.read_csv(OUTPUT_DIR / "model_metrics.csv"),
        "threshold_analysis.csv": pd.read_csv(OUTPUT_DIR / "threshold_analysis.csv"),
        "feature_importance.csv": pd.read_csv(OUTPUT_DIR / "feature_importance.csv"),
        "portfolio_metrics.csv": pd.read_csv(PROCESSED_FILES["portfolio"]),
        "stress_scenarios.csv": pd.read_csv(PROCESSED_FILES["stress"]),
        "vintage_analysis.csv": pd.read_csv(PROCESSED_FILES["vintage"]),
        "credit_ratings.csv": pd.read_csv(PROCESSED_FILES["ratings"]),
    }
    selected_model_name = predictions["model_name"].iloc[0]
    tables["selected_model_test_thresholds.csv"] = tables[
        "threshold_analysis.csv"
    ].loc[
        (tables["threshold_analysis.csv"]["model_name"] == selected_model_name)
        & (tables["threshold_analysis.csv"]["split"] == "test")
    ].sort_values("threshold")

    executive = pd.DataFrame(
        [
            {
                "loans": scored["loan_id"].nunique(),
                "total_ead": scored["ead"].sum(),
                "defaults": scored["defaulted"].sum(),
                "observed_default_rate": scored["defaulted"].mean(),
                "existing_expected_loss": scored["el"].sum(),
                "term_risk_loss_proxy": scored["term_risk_loss_proxy"].sum(),
                "avg_credit_score": scored["credit_score"].mean(),
                "avg_model_probability": scored["default_probability"].mean(),
                "avg_existing_pd": scored["pd_annual"].mean(),
            }
        ]
    )
    tables["executive_kpis.csv"] = executive
    tables["validation_summary.csv"] = pd.DataFrame(
        [
            {
                "clean_loan_rows": len(loans),
                "prediction_rows": len(predictions),
                "test_rows": int((predictions["data_split"] == "test").sum()),
                "missing_probabilities": int(predictions["default_probability"].isna().sum()),
                "invalid_probabilities": int((~predictions["default_probability"].between(0, 1)).sum()),
                "invalid_target_values": int((~predictions["defaulted"].isin([0, 1])).sum()),
                "probability_min": predictions["default_probability"].min(),
                "probability_max": predictions["default_probability"].max(),
            }
        ]
    )

    sector = (
        scored.groupby("sector", as_index=False)
        .agg(
            loan_count=("loan_id", "nunique"),
            total_ead=("ead", "sum"),
            defaults=("defaulted", "sum"),
            observed_default_rate=("defaulted", "mean"),
            avg_model_probability=("default_probability", "mean"),
            term_risk_loss_proxy=("term_risk_loss_proxy", "sum"),
            existing_expected_loss=("el", "sum"),
            avg_credit_score=("credit_score", "mean"),
        )
        .sort_values("observed_default_rate", ascending=False)
    )
    sector["default_rate_rank"] = sector["observed_default_rate"].rank(
        method="min", ascending=False
    )
    sector["exposure_rank"] = sector["total_ead"].rank(method="min", ascending=False)
    sector["exposure_share"] = sector["total_ead"] / sector["total_ead"].sum()
    tables["sector_risk.csv"] = sector

    rating_sort = {"AAA": 1, "AA": 2, "A": 3, "BBB": 4, "BB": 5, "B": 6, "CCC": 7}
    rating = (
        scored.groupby("initial_rating", as_index=False)
        .agg(
            loan_count=("loan_id", "nunique"),
            total_ead=("ead", "sum"),
            defaults=("defaulted", "sum"),
            observed_default_rate=("defaulted", "mean"),
            avg_model_probability=("default_probability", "mean"),
            avg_existing_pd=("pd_annual", "mean"),
            avg_credit_score=("credit_score", "mean"),
        )
    )
    rating["rating_sort"] = rating["initial_rating"].map(rating_sort)
    tables["rating_risk.csv"] = rating.sort_values("rating_sort")

    monthly = (
        scored.assign(origination_month=pd.to_datetime(scored["origination_date"]).dt.to_period("M").astype(str))
        .groupby("origination_month", as_index=False)
        .agg(
            originated_loans=("loan_id", "nunique"),
            originated_ead=("ead", "sum"),
            eventual_defaults=("defaulted", "sum"),
            eventual_default_rate=("defaulted", "mean"),
            avg_model_probability=("default_probability", "mean"),
            avg_existing_pd=("pd_annual", "mean"),
            avg_credit_score=("credit_score", "mean"),
        )
    )
    tables["monthly_risk_trend.csv"] = monthly

    test = scored[scored["data_split"] == "test"]
    decile = (
        test.groupby("risk_decile", as_index=False)
        .agg(
            loan_count=("loan_id", "nunique"),
            defaults=("defaulted", "sum"),
            default_rate=("defaulted", "mean"),
            avg_probability=("default_probability", "mean"),
            total_ead=("ead", "sum"),
        )
        .sort_values("risk_decile")
    )
    decile["portfolio_default_rate"] = test["defaulted"].mean()
    decile["lift_vs_test_average"] = (
        decile["default_rate"] / decile["portfolio_default_rate"]
    )
    tables["risk_decile_lift.csv"] = decile

    high_risk_columns = [
        "loan_id",
        "origination_date",
        "sector",
        "loan_type",
        "collateral",
        "initial_rating",
        "credit_score",
        "ead",
        "lgd",
        "default_probability",
        "risk_band",
        "risk_decile",
        "underwriting_action",
        "term_risk_loss_proxy",
        "defaulted",
        "data_split",
    ]
    tables["high_risk_test_loans.csv"] = (
        test[test["underwriting_action"] == "Manual Review"].sort_values(
            ["term_risk_loss_proxy", "default_probability"], ascending=False
        )[high_risk_columns]
        .head(500)
    )

    stress = tables["stress_scenarios.csv"].copy()
    stress["incremental_expected_loss"] = (
        stress["expected_loss_stress"] - stress["expected_loss_base"]
    )
    stress["sector_impact_rank"] = stress.groupby("scenario")[
        "incremental_expected_loss"
    ].rank(method="min", ascending=False)
    tables["stress_scenarios.csv"] = stress

    counts = {}
    for filename, frame in tables.items():
        path = DASHBOARD_DATA_DIR / filename
        frame.to_csv(path, index=False)
        counts[filename] = len(frame)
    return counts


def export_postgres_mode() -> dict[str, int]:
    engine = get_engine()
    query_map = {
        "loans_scored.csv": "SELECT * FROM credit_risk.mv_powerbi_loans",
        "executive_kpis.csv": "SELECT * FROM credit_risk.vw_executive_kpis",
        "validation_summary.csv": (
            "SELECT COUNT(*) AS clean_loan_rows, COUNT(*) AS prediction_rows, "
            "COUNT(*) FILTER (WHERE data_split = 'test') AS test_rows, "
            "COUNT(*) FILTER (WHERE default_probability IS NULL) AS missing_probabilities, "
            "COUNT(*) FILTER (WHERE default_probability NOT BETWEEN 0 AND 1) AS invalid_probabilities, "
            "COUNT(*) FILTER (WHERE defaulted NOT IN (0,1)) AS invalid_target_values, "
            "MIN(default_probability) AS probability_min, MAX(default_probability) AS probability_max "
            "FROM credit_risk.mv_powerbi_loans"
        ),
        "sector_risk.csv": "SELECT * FROM credit_risk.mv_sector_risk",
        "rating_risk.csv": "SELECT * FROM credit_risk.mv_rating_risk",
        "monthly_risk_trend.csv": "SELECT * FROM credit_risk.mv_monthly_risk_trend",
        "risk_decile_lift.csv": "SELECT * FROM credit_risk.mv_risk_decile_lift",
        "model_metrics.csv": "SELECT * FROM credit_risk.model_metrics",
        "threshold_analysis.csv": "SELECT * FROM credit_risk.threshold_analysis",
        "selected_model_test_thresholds.csv": (
            "SELECT * FROM credit_risk.vw_threshold_simulator "
            "WHERE model_name = (SELECT model_name FROM credit_risk.loan_predictions LIMIT 1) "
            "ORDER BY threshold"
        ),
        "feature_importance.csv": "SELECT * FROM credit_risk.feature_importance",
        "portfolio_metrics.csv": "SELECT * FROM credit_risk.portfolio_metrics",
        "stress_scenarios.csv": "SELECT * FROM credit_risk.vw_stress_scenarios",
        "vintage_analysis.csv": "SELECT * FROM credit_risk.vintage_analysis",
        "credit_ratings.csv": "SELECT * FROM credit_risk.credit_ratings",
        "high_risk_test_loans.csv": (
            "SELECT loan_id, origination_date, sector, loan_type, collateral, "
            "initial_rating, credit_score, ead, lgd, default_probability, risk_band, "
            "risk_decile, underwriting_action, term_risk_loss_proxy, defaulted, data_split "
            "FROM credit_risk.mv_powerbi_loans WHERE data_split = 'test' "
            "AND underwriting_action = 'Manual Review' "
            "ORDER BY term_risk_loss_proxy DESC, default_probability DESC LIMIT 500"
        ),
    }
    counts = {}
    for filename, query in query_map.items():
        frame = pd.read_sql(query, engine)
        frame.to_csv(DASHBOARD_DATA_DIR / filename, index=False)
        counts[filename] = len(frame)
    return counts


def main():
    parser = argparse.ArgumentParser(description="Export Power BI-ready flat files.")
    parser.add_argument("--source", choices=["csv", "postgres"], default="postgres")
    args = parser.parse_args()
    ensure_directories()
    counts = export_csv_mode() if args.source == "csv" else export_postgres_mode()
    print(json.dumps(counts, indent=2))
    print(f"Power BI-ready data saved to: {DASHBOARD_DATA_DIR}")


if __name__ == "__main__":
    main()
