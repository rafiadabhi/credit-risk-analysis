import argparse
import json
import time
import warnings

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.inspection import permutation_importance
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from src.config import MODEL_DIR, ensure_directories
from src.db import get_engine


NUMERIC_FEATURES = [
    "maturity_months",
    "credit_score",
    "log_ead",
    "coupon_rate",
    "leverage",
    "interest_coverage",
    "debt_to_equity",
    "leverage_to_coverage",
    "debt_service_pressure",
    "origination_gdp_growth",
    "origination_unemployment",
    "origination_policy_rate",
    "origination_credit_spread_bps",
]

CATEGORICAL_FEATURES = [
    "sector",
    "loan_type",
    "collateral",
    "initial_rating",
    "origination_month",
]

MODEL_FEATURES = NUMERIC_FEATURES + CATEGORICAL_FEATURES
TARGET = "defaulted"
MINIMUM_VALIDATION_RECALL = 0.70
FALSE_POSITIVE_OPPORTUNITY_RATE = 0.02


def load_loans() -> pd.DataFrame:
    loans = pd.read_sql("SELECT * FROM credit_risk.loans", get_engine())

    loans["origination_date"] = pd.to_datetime(loans["origination_date"])
    loans["origination_month"] = loans["origination_month"].astype("string")
    loans["log_ead"] = np.log1p(loans["ead"])
    loans["leverage_to_coverage"] = loans["leverage"] / loans[
        "interest_coverage"
    ].clip(lower=0.1)
    loans["debt_service_pressure"] = (
        loans["coupon_rate"]
        * loans["leverage"]
        / loans["interest_coverage"].clip(lower=0.1)
    )
    return loans


def split_masks(loans: pd.DataFrame) -> dict[str, pd.Series]:
    return {
        "train": loans["origination_date"] < pd.Timestamp("2021-01-01"),
        "validation": (
            (loans["origination_date"] >= pd.Timestamp("2021-01-01"))
            & (loans["origination_date"] < pd.Timestamp("2022-01-01"))
        ),
        "test": loans["origination_date"] >= pd.Timestamp("2022-01-01"),
    }


def build_preprocessor() -> ColumnTransformer:
    numeric = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="median")),
            ("scaler", StandardScaler()),
        ]
    )
    categorical = Pipeline(
        [
            ("imputer", SimpleImputer(strategy="most_frequent")),
            (
                "one_hot",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
            ),
        ]
    )
    return ColumnTransformer(
        [("numeric", numeric, NUMERIC_FEATURES), ("categorical", categorical, CATEGORICAL_FEATURES)]
    )


def build_models(y_train: pd.Series) -> dict[str, Pipeline]:
    models = {
        "Logistic Regression": Pipeline(
            [
                ("preprocessor", build_preprocessor()),
                (
                    "model",
                    LogisticRegression(
                        C=0.5,
                        max_iter=3000,
                        class_weight="balanced",
                        random_state=42,
                    ),
                ),
            ]
        ),
        "Calibrated Random Forest": Pipeline(
            [
                ("preprocessor", build_preprocessor()),
                (
                    "model",
                    CalibratedClassifierCV(
                        estimator=RandomForestClassifier(
                            n_estimators=300,
                            max_depth=12,
                            min_samples_leaf=10,
                            max_features="sqrt",
                            class_weight="balanced_subsample",
                            n_jobs=-1,
                            random_state=42,
                        ),
                        method="sigmoid",
                        cv=3,
                        n_jobs=-1,
                    ),
                ),
            ]
        ),
    }
    try:
        from xgboost import XGBClassifier
    except ImportError as exc:
        raise RuntimeError(
            "XGBoost is required. Run: pip install -r requirements.txt"
        ) from exc

    negative, positive = np.bincount(y_train.astype(int))
    models["XGBoost"] = Pipeline(
        [
            ("preprocessor", build_preprocessor()),
            (
                "model",
                XGBClassifier(
                    n_estimators=350,
                    max_depth=4,
                    learning_rate=0.05,
                    subsample=0.85,
                    colsample_bytree=0.85,
                    min_child_weight=5,
                    reg_lambda=2.0,
                    scale_pos_weight=negative / positive,
                    eval_metric="logloss",
                    n_jobs=-1,
                    random_state=42,
                ),
            ),
        ]
    )
    return models


def safe_specificity(target: np.ndarray, prediction: np.ndarray) -> float:
    tn, fp, _, _ = confusion_matrix(target, prediction, labels=[0, 1]).ravel()
    return float(tn / (tn + fp)) if (tn + fp) else 0.0


def metric_row(
    model_name: str,
    split: str,
    target: np.ndarray,
    probability: np.ndarray,
    threshold: float,
    threshold_type: str,
) -> dict:
    prediction = probability >= threshold
    tn, fp, fn, tp = confusion_matrix(target, prediction, labels=[0, 1]).ravel()
    return {
        "model_name": model_name,
        "split": split,
        "threshold_type": threshold_type,
        "threshold": float(threshold),
        "roc_auc": float(roc_auc_score(target, probability)),
        "pr_auc": float(average_precision_score(target, probability)),
        "precision": float(precision_score(target, prediction, zero_division=0)),
        "recall": float(recall_score(target, prediction, zero_division=0)),
        "f1": float(f1_score(target, prediction, zero_division=0)),
        "specificity": safe_specificity(target, prediction),
        "brier_score": float(brier_score_loss(target, probability)),
        "approval_rate": float(1 - prediction.mean()),
        "true_negative": int(tn),
        "false_positive": int(fp),
        "false_negative": int(fn),
        "true_positive": int(tp),
    }


def threshold_table(
    model_name: str,
    split: str,
    target: pd.Series,
    probability: np.ndarray,
    ead: pd.Series,
    lgd: pd.Series,
) -> pd.DataFrame:
    y = target.to_numpy(dtype=int)
    ead_values = ead.to_numpy(dtype=float)
    lgd_values = lgd.to_numpy(dtype=float)
    rows = []
    for threshold in np.round(np.arange(0.01, 0.991, 0.01), 2):
        prediction = probability >= threshold
        tn, fp, fn, tp = confusion_matrix(y, prediction, labels=[0, 1]).ravel()
        default_loss_exposure = float((ead_values[(y == 1) & ~prediction] * lgd_values[(y == 1) & ~prediction]).sum())
        rejected_good_ead = float(ead_values[(y == 0) & prediction].sum())
        total_cost_proxy = default_loss_exposure + (
            FALSE_POSITIVE_OPPORTUNITY_RATE * rejected_good_ead
        )
        rows.append(
            {
                "model_name": model_name,
                "split": split,
                "threshold": float(threshold),
                "precision": float(precision_score(y, prediction, zero_division=0)),
                "recall": float(recall_score(y, prediction, zero_division=0)),
                "f1": float(f1_score(y, prediction, zero_division=0)),
                "specificity": safe_specificity(y, prediction),
                "approval_rate": float(1 - prediction.mean()),
                "true_negative": int(tn),
                "false_positive": int(fp),
                "false_negative": int(fn),
                "true_positive": int(tp),
                "default_loss_exposure": default_loss_exposure,
                "rejected_good_ead": rejected_good_ead,
                "opportunity_cost_rate_assumption": FALSE_POSITIVE_OPPORTUNITY_RATE,
                "total_cost_proxy": total_cost_proxy,
            }
        )
    return pd.DataFrame(rows)


def choose_operating_threshold(table: pd.DataFrame) -> float:
    eligible = table[table["recall"] >= MINIMUM_VALIDATION_RECALL]
    if eligible.empty:
        return float(table.loc[table["recall"].idxmax(), "threshold"])
    selected = eligible.sort_values(
        ["precision", "approval_rate", "threshold"], ascending=False
    ).iloc[0]
    return float(selected["threshold"])


def risk_band(probability: pd.Series, operating_threshold: float) -> pd.Series:
    lower = min(0.05, operating_threshold / 2)
    upper = max(0.30, operating_threshold * 1.75)
    return pd.cut(
        probability,
        bins=[-np.inf, lower, operating_threshold, upper, np.inf],
        labels=["Low", "Moderate", "High", "Very High"],
    ).astype("string")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Train Logistic Regression, Calibrated Random Forest, and XGBoost "
            "from PostgreSQL and write model outputs back to PostgreSQL."
        )
    )
    parser.parse_args()

    ensure_directories()
    started = time.time()
    loans = load_loans()
    masks = split_masks(loans)
    split_summary = {
        name: {
            "rows": int(mask.sum()),
            "default_rate": float(loans.loc[mask, TARGET].mean()),
            "date_min": loans.loc[mask, "origination_date"].min().date().isoformat(),
            "date_max": loans.loc[mask, "origination_date"].max().date().isoformat(),
        }
        for name, mask in masks.items()
    }

    x = loans[MODEL_FEATURES]
    y = loans[TARGET].astype(int)
    models = build_models(y[masks["train"]])
    fitted_models = {}
    probability_by_model = {}
    metrics = []
    threshold_frames = []

    for model_name, model in models.items():
        print(f"Training {model_name}...")
        model.fit(x[masks["train"]], y[masks["train"]])
        fitted_models[model_name] = model
        probability_by_model[model_name] = {}

        for split in ["validation", "test"]:
            mask = masks[split]
            probability = model.predict_proba(x[mask])[:, 1]
            probability_by_model[model_name][split] = probability
            metrics.append(
                metric_row(
                    model_name,
                    split,
                    y[mask].to_numpy(),
                    probability,
                    threshold=0.50,
                    threshold_type="standard_0.50",
                )
            )
            threshold_frames.append(
                threshold_table(
                    model_name,
                    split,
                    y[mask],
                    probability,
                    loans.loc[mask, "ead"],
                    loans.loc[mask, "lgd"],
                )
            )

    metrics_df = pd.DataFrame(metrics)
    validation_metrics = metrics_df[metrics_df["split"] == "validation"]
    selected_model_name = validation_metrics.sort_values(
        ["pr_auc", "roc_auc"], ascending=False
    ).iloc[0]["model_name"]
    selected_model = fitted_models[selected_model_name]

    thresholds = pd.concat(threshold_frames, ignore_index=True)
    selected_validation_thresholds = thresholds[
        (thresholds["model_name"] == selected_model_name)
        & (thresholds["split"] == "validation")
    ]
    operating_threshold = choose_operating_threshold(selected_validation_thresholds)

    for split in ["validation", "test"]:
        mask = masks[split]
        metrics.append(
            metric_row(
                selected_model_name,
                split,
                y[mask].to_numpy(),
                probability_by_model[selected_model_name][split],
                threshold=operating_threshold,
                threshold_type="operating_recall_constraint",
            )
        )
    metrics_df = pd.DataFrame(metrics)

    all_probability = selected_model.predict_proba(x)[:, 1]
    predictions = loans[
        [
            "loan_id",
            "origination_date",
            "sector",
            "initial_rating",
            "credit_score",
            "ead",
            "lgd",
            "pd_annual",
            "defaulted",
        ]
    ].copy()
    predictions["data_split"] = "train"
    predictions.loc[masks["validation"], "data_split"] = "validation"
    predictions.loc[masks["test"], "data_split"] = "test"
    predictions["model_name"] = selected_model_name
    predictions["default_probability"] = all_probability.round(6)
    predictions["operating_threshold"] = operating_threshold
    predictions["predicted_default"] = (
        predictions["default_probability"] >= operating_threshold
    ).astype("int8")
    predictions["risk_band"] = risk_band(
        predictions["default_probability"], operating_threshold
    )
    predictions["risk_decile"] = pd.qcut(
        predictions["default_probability"].rank(method="first", ascending=False),
        q=10,
        labels=range(1, 11),
    ).astype(int)
    predictions["underwriting_action"] = np.where(
        predictions["predicted_default"] == 1, "Manual Review", "Approve"
    )
    predictions["term_risk_loss_proxy"] = (
        predictions["default_probability"] * predictions["ead"] * predictions["lgd"]
    ).round(2)

    test_sample = loans.loc[masks["test"], MODEL_FEATURES + [TARGET]].sample(
        n=min(4000, int(masks["test"].sum())), random_state=42
    )
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        importance_result = permutation_importance(
            selected_model,
            test_sample[MODEL_FEATURES],
            test_sample[TARGET],
            scoring="average_precision",
            n_repeats=4,
            random_state=42,
            n_jobs=-1,
        )
    feature_importance = pd.DataFrame(
        {
            "feature": MODEL_FEATURES,
            "importance_mean": importance_result.importances_mean,
            "importance_std": importance_result.importances_std,
        }
    ).sort_values("importance_mean", ascending=False)
    feature_importance.insert(0, "model_name", selected_model_name)

    metadata = {
        "target_definition": "default during the simulated contractual term",
        "selected_model": selected_model_name,
        "selection_metric": "validation PR-AUC, then ROC-AUC",
        "operating_threshold": operating_threshold,
        "threshold_rule": (
            "highest validation precision while maintaining recall >= 0.70"
        ),
        "minimum_validation_recall": MINIMUM_VALIDATION_RECALL,
        "false_positive_opportunity_rate_assumption": FALSE_POSITIVE_OPPORTUNITY_RATE,
        "split_summary": split_summary,
        "model_features": MODEL_FEATURES,
        "excluded_existing_risk_outputs": [
            "pd_annual",
            "lgd",
            "el",
            "unexpected_loss",
            "rwa",
        ],
        "excluded_post_outcome_fields": [
            "default_date",
            "survival_months",
            "recovery_rate",
            "loss_given_default",
        ],
        "probability_horizon_note": (
            "The model score estimates default during the simulated contractual term; "
            "pd_annual is retained as a separate dataset benchmark and is not directly comparable."
        ),
        "term_risk_loss_proxy_definition": (
            "default_probability * EAD * dataset LGD; use only to prioritize review, "
            "not as an accounting expected-loss estimate."
        ),
        "elapsed_seconds": round(time.time() - started, 2),
    }

    (MODEL_DIR / "model_metadata.json").write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    joblib.dump(selected_model, MODEL_DIR / "selected_default_model.joblib")

    engine = get_engine()
    from sqlalchemy import text

    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE TABLE "
                "credit_risk.loan_predictions, "
                "credit_risk.model_metrics, "
                "credit_risk.threshold_analysis, "
                "credit_risk.feature_importance"
            )
        )
    predictions.to_sql(
        "loan_predictions",
        engine,
        schema="credit_risk",
        if_exists="append",
        index=False,
        chunksize=3000,
        method="multi",
    )
    metrics_df.to_sql(
        "model_metrics",
        engine,
        schema="credit_risk",
        if_exists="append",
        index=False,
    )
    thresholds.to_sql(
        "threshold_analysis",
        engine,
        schema="credit_risk",
        if_exists="append",
        index=False,
        chunksize=3000,
        method="multi",
    )
    feature_importance.to_sql(
        "feature_importance",
        engine,
        schema="credit_risk",
        if_exists="append",
        index=False,
    )

    print(json.dumps(metadata, indent=2))
    print(metrics_df.to_string(index=False))
    print("Model outputs written to PostgreSQL schema credit_risk.")
    print(f"Model files saved to: {MODEL_DIR}")


if __name__ == "__main__":
    main()
