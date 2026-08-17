import argparse
import json

import pandas as pd

from src.config import DASHBOARD_DATA_DIR, OUTPUT_DIR, PROCESSED_FILES


EXPECTED_ROWS = {
    "loans": 50000,
    "ratings": 17939,
    "portfolio": 120,
    "stress": 60,
    "vintage": 2160,
}


def validate_files():
    actual = {
        name: len(pd.read_csv(path)) for name, path in PROCESSED_FILES.items()
    }
    for name, expected in EXPECTED_ROWS.items():
        if actual[name] != expected:
            raise AssertionError(f"{name}: expected {expected} rows, found {actual[name]}")

    predictions = pd.read_csv(OUTPUT_DIR / "loan_predictions.csv")
    metrics = pd.read_csv(OUTPUT_DIR / "model_metrics.csv")
    scored = pd.read_csv(DASHBOARD_DATA_DIR / "loans_scored.csv")
    if len(predictions) != EXPECTED_ROWS["loans"] or len(scored) != EXPECTED_ROWS["loans"]:
        raise AssertionError("Predictions or Power BI scored data do not contain 50,000 loans.")
    if predictions["loan_id"].duplicated().any():
        raise AssertionError("Duplicate loan_id values in predictions.")
    if not predictions["default_probability"].between(0, 1).all():
        raise AssertionError("Model probabilities fall outside [0, 1].")
    required_prediction_fields = [
        "default_probability", "risk_band", "underwriting_action", "term_risk_loss_proxy"
    ]
    if predictions[required_prediction_fields].isna().any().any():
        raise AssertionError("Required prediction outputs contain missing values.")
    if not {"validation", "test"}.issubset(set(metrics["split"])):
        raise AssertionError("Validation/test metrics are missing.")

    result = {
        "processed_rows": actual,
        "prediction_rows": len(predictions),
        "powerbi_scored_rows": len(scored),
        "probability_min": float(predictions["default_probability"].min()),
        "probability_max": float(predictions["default_probability"].max()),
        "missing_required_predictions": 0,
        "status": "PASS",
    }
    print(json.dumps(result, indent=2))


def validate_postgres():
    from sqlalchemy import text
    from src.db import get_engine

    with get_engine().connect() as connection:
        rows = connection.execute(
            text("SELECT COUNT(*) FROM credit_risk.mv_powerbi_loans")
        ).scalar_one()
        if rows != EXPECTED_ROWS["loans"]:
            raise AssertionError(f"PostgreSQL view has {rows} rows; expected 50000.")
        invalid = connection.execute(
            text(
                "SELECT COUNT(*) FROM credit_risk.loan_predictions "
                "WHERE default_probability NOT BETWEEN 0 AND 1"
            )
        ).scalar_one()
        if invalid:
            raise AssertionError(f"PostgreSQL contains {invalid} invalid probabilities.")
    print("PostgreSQL validation: PASS")


def main():
    parser = argparse.ArgumentParser(description="Validate generated outputs.")
    parser.add_argument("--source", choices=["csv", "postgres"], default="csv")
    args = parser.parse_args()
    validate_files()
    if args.source == "postgres":
        validate_postgres()


if __name__ == "__main__":
    main()
