import csv
from io import StringIO
import json

from src.config import PROCESSED_FILES, SQL_DIR, psycopg2_params


TABLE_FILES = {
    "loans": PROCESSED_FILES["loans"],
    "credit_ratings": PROCESSED_FILES["ratings"],
    "portfolio_metrics": PROCESSED_FILES["portfolio"],
    "stress_scenarios": PROCESSED_FILES["stress"],
    "vintage_analysis": PROCESSED_FILES["vintage"],
}


def copy_csv(cursor, table_name, csv_path):
    with csv_path.open("r", encoding="utf-8", newline="") as source:
        header = next(csv.reader([source.readline()]))
        source.seek(0)
        columns = ", ".join(f'"{column}"' for column in header)
        sql = (
            f"COPY credit_risk.{table_name} ({columns}) "
            "FROM STDIN WITH (FORMAT CSV, HEADER TRUE, NULL '')"
        )
        cursor.copy_expert(sql, source)


def main():
    try:
        import psycopg2
    except ImportError as exc:
        raise RuntimeError(
            "psycopg2 is not installed. Run: pip install -r requirements.txt"
        ) from exc

    missing = [str(path) for path in TABLE_FILES.values() if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "Processed files are missing. Run python -m src.01_audit_clean first: "
            + ", ".join(missing)
        )

    connection = psycopg2.connect(**psycopg2_params())
    try:
        with connection:
            with connection.cursor() as cursor:
                cursor.execute((SQL_DIR / "01_schema.sql").read_text(encoding="utf-8"))
                cursor.execute(
                    "TRUNCATE TABLE "
                    "credit_risk.loan_predictions, credit_risk.model_metrics, "
                    "credit_risk.threshold_analysis, credit_risk.feature_importance, "
                    "credit_risk.credit_ratings, credit_risk.portfolio_metrics, "
                    "credit_risk.stress_scenarios, credit_risk.vintage_analysis, "
                    "credit_risk.loans RESTART IDENTITY CASCADE"
                )
                for table_name, csv_path in TABLE_FILES.items():
                    print(f"Loading {csv_path.name} -> credit_risk.{table_name}")
                    copy_csv(cursor, table_name, csv_path)
                cursor.execute("ANALYZE credit_risk.loans")

                counts = {}
                for table_name in TABLE_FILES:
                    cursor.execute(f"SELECT COUNT(*) FROM credit_risk.{table_name}")
                    counts[table_name] = cursor.fetchone()[0]
        print(json.dumps(counts, indent=2))
        print("PostgreSQL load completed successfully.")
    finally:
        connection.close()


if __name__ == "__main__":
    main()

