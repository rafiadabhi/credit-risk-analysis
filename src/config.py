from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
PROCESSED_DIR = PROJECT_ROOT / "data" / "processed"
OUTPUT_DIR = PROJECT_ROOT / "data" / "outputs"
MODEL_DIR = PROJECT_ROOT / "models"
SQL_DIR = PROJECT_ROOT / "sql"
EXCEL_DIR = PROJECT_ROOT / "excel"
DASHBOARD_DIR = PROJECT_ROOT / "dashboard"
DASHBOARD_DATA_DIR = DASHBOARD_DIR / "data"


def _load_local_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_local_env(PROJECT_ROOT / ".env")


RAW_FILES = {
    "loans": RAW_DIR / "loan_portfolio.csv",
    "ratings": RAW_DIR / "credit_ratings.csv",
    "stress": RAW_DIR / "macro_stress_scenarios.csv",
    "portfolio": RAW_DIR / "portfolio_metrics.csv",
    "vintage": RAW_DIR / "vintage_analysis.csv",
}

PROCESSED_FILES = {
    "loans": PROCESSED_DIR / "loans_clean.csv",
    "ratings": PROCESSED_DIR / "credit_ratings_clean.csv",
    "stress": PROCESSED_DIR / "stress_scenarios_clean.csv",
    "portfolio": PROCESSED_DIR / "portfolio_metrics_clean.csv",
    "vintage": PROCESSED_DIR / "vintage_analysis_clean.csv",
}


def ensure_directories() -> None:
    for directory in (
        RAW_DIR,
        PROCESSED_DIR,
        OUTPUT_DIR,
        MODEL_DIR,
        EXCEL_DIR,
        DASHBOARD_DIR,
        DASHBOARD_DATA_DIR,
    ):
        directory.mkdir(parents=True, exist_ok=True)


def database_url():
    from sqlalchemy import URL

    return URL.create(
        drivername="postgresql+psycopg2",
        username=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", ""),
        host=os.getenv("PGHOST", "localhost"),
        port=int(os.getenv("PGPORT", "5432")),
        database=os.getenv("PGDATABASE", "credit_risk_db"),
    )


def psycopg2_params() -> dict:
    return {
        "host": os.getenv("PGHOST", "localhost"),
        "port": int(os.getenv("PGPORT", "5432")),
        "dbname": os.getenv("PGDATABASE", "credit_risk_db"),
        "user": os.getenv("PGUSER", "postgres"),
        "password": os.getenv("PGPASSWORD", ""),
    }
