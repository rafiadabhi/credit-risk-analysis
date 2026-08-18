import json
from pathlib import Path
import time

import numpy as np
import pandas as pd

from src.config import (
    AUDIT_REPORT,
    PROCESSED_FILES,
    RAW_FILES,
    ensure_directories,
)


DATE_COLUMNS = {
    "loans": ["origination_date", "maturity_date", "default_date"],
    "portfolio": ["date"],
}

POST_OUTCOME_COLUMNS = [
    "default_date",
    "survival_months",
    "recovery_rate",
    "loss_given_default",
]

EXISTING_RISK_MODEL_COLUMNS = [
    "pd_annual",
    "lgd",
    "el",
    "unexpected_loss",
    "rwa",
]


def read_sources() -> dict[str, pd.DataFrame]:
    frames = {}
    for name, path in RAW_FILES.items():
        if not path.exists():
            raise FileNotFoundError(f"Required raw file not found: {path}")
        frames[name] = pd.read_csv(path, parse_dates=DATE_COLUMNS.get(name))
    return frames


def audit_frame(name: str, frame: pd.DataFrame) -> dict:
    numeric = frame.select_dtypes(include="number")
    numeric_ranges = {}
    iqr_outlier_counts = {}
    for column in numeric.columns:
        series = numeric[column].dropna()
        if series.empty:
            continue
        numeric_ranges[column] = {
            "min": float(series.min()),
            "max": float(series.max()),
            "mean": float(series.mean()),
            "median": float(series.median()),
        }
        q1, q3 = series.quantile([0.25, 0.75])
        iqr = q3 - q1
        if iqr == 0:
            count = int((series != q1).sum())
        else:
            count = int(((series < q1 - 1.5 * iqr) | (series > q3 + 1.5 * iqr)).sum())
        iqr_outlier_counts[column] = count

    date_ranges = {}
    for column in frame.select_dtypes(include=["datetime", "datetimetz"]).columns:
        series = frame[column].dropna()
        if not series.empty:
            date_ranges[column] = {
                "min": series.min().date().isoformat(),
                "max": series.max().date().isoformat(),
            }

    return {
        "rows": int(len(frame)),
        "columns": int(len(frame.columns)),
        "duplicate_rows": int(frame.duplicated().sum()),
        "missing_values": {
            column: int(count)
            for column, count in frame.isna().sum().items()
            if count > 0
        },
        "data_types": {column: str(dtype) for column, dtype in frame.dtypes.items()},
        "numeric_ranges": numeric_ranges,
        "iqr_outlier_counts_descriptive_only": iqr_outlier_counts,
        "date_ranges": date_ranges,
        "unique_values": {
            column: int(frame[column].nunique(dropna=True))
            for column in frame.select_dtypes(include=["object", "string", "category"]).columns
        },
    }


def validate_loans(loans: pd.DataFrame) -> dict:
    defaults = loans[loans["defaulted"] == 1]
    checks = {
        "duplicate_loan_ids": int(loans["loan_id"].duplicated().sum()),
        "invalid_target_values": int((~loans["defaulted"].isin([0, 1])).sum()),
        "default_without_default_date": int(
            ((loans["defaulted"] == 1) & loans["default_date"].isna()).sum()
        ),
        "nondefault_with_default_date": int(
            ((loans["defaulted"] == 0) & loans["default_date"].notna()).sum()
        ),
        "default_before_origination": int(
            (
                loans["default_date"].notna()
                & (loans["default_date"] < loans["origination_date"])
            ).sum()
        ),
        "survival_exceeds_contractual_maturity": int(
            (loans["survival_months"] > loans["maturity_months"]).sum()
        ),
        "nondefault_not_observed_to_contractual_maturity": int(
            (
                (loans["defaulted"] == 0)
                & (loans["survival_months"] != loans["maturity_months"])
            ).sum()
        ),
        "credit_score_outside_300_850": int(
            ((loans["credit_score"] < 300) | (loans["credit_score"] > 850)).sum()
        ),
        "nonpositive_ead": int((loans["ead"] <= 0).sum()),
        "pd_outside_0_1": int(
            ((loans["pd_annual"] < 0) | (loans["pd_annual"] > 1)).sum()
        ),
        "lgd_outside_0_1": int(((loans["lgd"] < 0) | (loans["lgd"] > 1)).sum()),
        "defaults_after_reported_maturity_date": int(
            (defaults["default_date"] > defaults["maturity_date"]).sum()
        ),
        "defaults_after_2024_12_31": int(
            (defaults["default_date"] > pd.Timestamp("2024-12-31")).sum()
        ),
    }
    return checks


def clean_sources(frames: dict[str, pd.DataFrame]) -> dict[str, pd.DataFrame]:
    loans = frames["loans"].copy()
    portfolio = frames["portfolio"].copy()

    loans["loan_id"] = loans["loan_id"].astype("string").str.strip()
    for column in ["sector", "loan_type", "collateral", "initial_rating"]:
        loans[column] = loans[column].astype("string").str.strip()

    macro_at_origination = portfolio[
        ["date", "gdp_growth", "unemployment", "policy_rate", "credit_spread_bps"]
    ].rename(
        columns={
            "date": "origination_date",
            "gdp_growth": "origination_gdp_growth",
            "unemployment": "origination_unemployment",
            "policy_rate": "origination_policy_rate",
            "credit_spread_bps": "origination_credit_spread_bps",
        }
    )
    loans = loans.merge(macro_at_origination, on="origination_date", how="left")
    if loans[
        [
            "origination_gdp_growth",
            "origination_unemployment",
            "origination_policy_rate",
            "origination_credit_spread_bps",
        ]
    ].isna().any().any():
        raise ValueError("Macro variables could not be matched to every origination month.")

    loans["origination_year"] = loans["origination_date"].dt.year
    loans["origination_month"] = loans["origination_date"].dt.month
    loans["origination_quarter"] = loans["origination_date"].dt.to_period("Q").astype(str)
    loans["default_loss_amount"] = np.where(
        loans["defaulted"] == 1, loans["loss_given_default"].fillna(0), 0
    )
    loans["existing_expected_loss_rate"] = loans["el"] / loans["ead"]
    loans["credit_score_band"] = pd.cut(
        loans["credit_score"],
        bins=[299, 579, 669, 739, 799, 850],
        labels=["Poor", "Fair", "Good", "Very Good", "Exceptional"],
    ).astype("string")
    loans["ead_band"] = pd.qcut(
        loans["ead"].rank(method="first"),
        q=4,
        labels=["Q1 Small", "Q2 Medium", "Q3 Large", "Q4 Very Large"],
    ).astype("string")
    loans["reported_maturity_is_capped"] = (
        loans["maturity_date"] == pd.Timestamp("2024-12-31")
    ).astype("int8")

    cleaned = {
        "loans": loans.sort_values(["origination_date", "loan_id"]),
        "ratings": frames["ratings"].sort_values(["year", "issuer_id"]),
        "stress": frames["stress"].sort_values(["scenario", "sector"]),
        "portfolio": portfolio.sort_values("date"),
        "vintage": frames["vintage"].sort_values(["vintage", "months_on_books"]),
    }
    return cleaned


def build_report(raw: dict[str, pd.DataFrame], cleaned: dict[str, pd.DataFrame]) -> dict:
    loans = cleaned["loans"]
    target_counts = loans["defaulted"].value_counts().sort_index()
    report = {
        "source_audit": {name: audit_frame(name, frame) for name, frame in raw.items()},
        "loan_validation": validate_loans(raw["loans"]),
        "modeling_scope": {
            "unit_of_analysis": "one originated loan",
            "target": "defaulted during the simulated contractual term",
            "positive_class": 1,
            "application_time_features": [
                "maturity_months",
                "sector",
                "loan_type",
                "collateral",
                "initial_rating",
                "credit_score",
                "ead",
                "coupon_rate",
                "leverage",
                "interest_coverage",
                "debt_to_equity",
                "origination macroeconomic variables",
            ],
            "excluded_post_outcome_columns": POST_OUTCOME_COLUMNS,
            "excluded_existing_risk_outputs": EXISTING_RISK_MODEL_COLUMNS,
            "reported_maturity_date_warning": (
                "maturity_date is capped at 2024-12-31 for many loans; use "
                "maturity_months for modeling."
            ),
        },
        "clean_loan_rows": int(len(loans)),
        "unique_loans": int(loans["loan_id"].nunique()),
        "sectors": int(loans["sector"].nunique()),
        "default_counts": {str(index): int(value) for index, value in target_counts.items()},
        "default_rate": float(loans["defaulted"].mean()),
        "class_imbalance": {
            "positive_rate": float(loans["defaulted"].mean()),
            "negative_to_positive_ratio": float(
                (loans["defaulted"] == 0).sum() / (loans["defaulted"] == 1).sum()
            ),
        },
        "total_ead": float(loans["ead"].sum()),
        "total_existing_expected_loss": float(loans["el"].sum()),
        "origination_date_min": loans["origination_date"].min().date().isoformat(),
        "origination_date_max": loans["origination_date"].max().date().isoformat(),
        "limitations": [
            "The files appear simulation-oriented and are suitable for portfolio methodology demonstration, not direct production underwriting.",
            "The label is eventual default during each simulated contractual term; it is not a fixed 12-month default label.",
            "Reported maturity_date is capped at 2024-12-31 for many loans, so maturity_months is used instead.",
            "Origination-year default rates shift materially; time-based validation is required.",
            "No protected-class fields are supplied, so a complete fairness audit cannot be performed.",
            "The analysis is descriptive and predictive; it does not establish causal effects.",
        ],
    }
    return report


def main() -> None:
    ensure_directories()
    started = time.time()
    raw = read_sources()
    cleaned = clean_sources(raw)
    report = build_report(raw, cleaned)

    for name, frame in cleaned.items():
        path = PROCESSED_FILES[name]
        frame.to_csv(path, index=False, date_format="%Y-%m-%d")

    report_path = AUDIT_REPORT
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Saved audit report: {report_path}")
    print(f"Elapsed seconds: {time.time() - started:.1f}")


if __name__ == "__main__":
    main()
