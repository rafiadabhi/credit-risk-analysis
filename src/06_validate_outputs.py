import argparse
from importlib import import_module
import json

import pandas as pd

from src.config import POWERBI_WORKBOOK, PROCESSED_FILES
from src.db import get_engine


export_module = import_module("src.05_export_powerbi_data")
POWERBI_QUERIES = export_module.POWERBI_QUERIES
validate_workbook = export_module.validate_workbook


EXPECTED_PROCESSED_ROWS = {
    "loans": 50_000,
    "ratings": 17_939,
    "portfolio": 120,
    "stress": 60,
    "vintage": 2_160,
}


def validate_processed_files() -> dict[str, int]:
    actual = {
        name: sum(len(chunk) for chunk in pd.read_csv(path, chunksize=10_000))
        for name, path in PROCESSED_FILES.items()
    }
    for name, expected in EXPECTED_PROCESSED_ROWS.items():
        if actual[name] != expected:
            raise ValueError(
                f"{name}: expected {expected:,} processed rows, found {actual[name]:,}"
            )
    return actual


def validate_postgresql() -> tuple[dict[str, int], dict]:
    engine = get_engine()
    count_queries = {
        sheet_name: f"SELECT COUNT(*) FROM {details['object']}"
        for sheet_name, details in POWERBI_QUERIES.items()
    }
    # The exported threshold sheet deliberately keeps only the selected model's
    # test thresholds, so its validation query must match the export query.
    count_queries["Fact_Thresholds"] = (
        "SELECT COUNT(*) FROM credit_risk.vw_threshold_simulator "
        "WHERE model_name = ("
        "SELECT model_name FROM credit_risk.loan_predictions LIMIT 1"
        ")"
    )

    with engine.connect() as connection:
        counts = {
            name: int(connection.exec_driver_sql(query).scalar_one())
            for name, query in count_queries.items()
        }
        integrity = connection.exec_driver_sql(
            """
            SELECT
                COUNT(*) AS loan_rows,
                COUNT(DISTINCT loan_id) AS unique_loan_ids,
                COUNT(*) FILTER (
                    WHERE default_probability NOT BETWEEN 0 AND 1
                ) AS invalid_probabilities,
                COUNT(*) FILTER (
                    WHERE default_probability IS NULL
                       OR risk_band IS NULL
                       OR underwriting_action IS NULL
                       OR term_risk_loss_proxy IS NULL
                ) AS missing_analytical_outputs,
                MIN(default_probability) AS probability_min,
                MAX(default_probability) AS probability_max
            FROM credit_risk.mv_powerbi_loans
            """
        ).mappings().one()
        models = {
            row.model_name
            for row in connection.exec_driver_sql(
                "SELECT DISTINCT model_name FROM credit_risk.model_metrics"
            )
        }

    if counts["Fact_Loans"] != EXPECTED_PROCESSED_ROWS["loans"]:
        raise ValueError(f"PostgreSQL loan count is incorrect: {counts['Fact_Loans']}")
    if integrity["loan_rows"] != integrity["unique_loan_ids"]:
        raise ValueError("PostgreSQL scored loans contain duplicate loan_id values.")
    if integrity["invalid_probabilities"] != 0:
        raise ValueError("PostgreSQL contains probabilities outside [0, 1].")
    if integrity["missing_analytical_outputs"] != 0:
        raise ValueError("PostgreSQL contains missing analytical model outputs.")
    required_models = {"Logistic Regression", "Calibrated Random Forest", "XGBoost"}
    if not required_models.issubset(models):
        raise ValueError(f"Required model metrics are missing: {required_models - models}")
    return counts, dict(integrity)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate processed files, PostgreSQL objects, and Power BI workbook."
    )
    parser.parse_args()

    if not POWERBI_WORKBOOK.exists():
        raise FileNotFoundError(
            f"Power BI workbook not found: {POWERBI_WORKBOOK}. Run step 5 first."
        )
    processed_counts = validate_processed_files()
    postgres_counts, integrity = validate_postgresql()
    validate_workbook(POWERBI_WORKBOOK, postgres_counts)

    result = {
        "processed_rows": processed_counts,
        "powerbi_sheet_rows": postgres_counts,
        "probability_min": float(integrity["probability_min"]),
        "probability_max": float(integrity["probability_max"]),
        "invalid_probabilities": int(integrity["invalid_probabilities"]),
        "missing_analytical_outputs": int(integrity["missing_analytical_outputs"]),
        "status": "PASS",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
