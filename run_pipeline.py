import argparse
import subprocess
import sys
import time
from pathlib import Path

from src.config import (
    OUTPUT_DIR,
    POWERBI_WORKBOOK,
    RAW_FILES,
    ensure_directories,
)


STEPS = [
    ("1/6 Audit and clean source data", "src.01_audit_clean"),
    ("2/6 Rebuild PostgreSQL schema and load clean data", "src.03_load_postgresql"),
    ("3/6 Train models and write results to PostgreSQL", "src.02_train_models"),
    ("4/6 Create Power BI reporting views", "src.04_build_powerbi_views"),
    ("5/6 Export one centralized Power BI workbook", "src.05_export_powerbi_data"),
    ("6/6 Validate PostgreSQL and workbook outputs", "src.06_validate_outputs"),
]


def run_step(label: str, module: str) -> None:
    print(f"\n{'=' * 72}\n{label}\n{'=' * 72}")
    subprocess.run([sys.executable, "-m", module], check=True)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Run the only supported workflow: raw CSVs -> Python cleaning -> "
            "PostgreSQL/SQL -> modeling -> one Power BI workbook."
        )
    )
    parser.parse_args()

    project_root = Path(__file__).resolve().parent
    env_file = project_root / ".env"
    missing_raw = [str(path) for path in RAW_FILES.values() if not path.exists()]
    if missing_raw:
        raise FileNotFoundError(
            "Required raw datasets are missing. Extract all five source CSVs "
            "into data\\raw:\n- " + "\n- ".join(missing_raw)
        )
    if not env_file.exists():
        raise FileNotFoundError(
            f"Database configuration not found: {env_file}. "
            "Copy .env.example to .env and enter your PostgreSQL password."
        )

    # data/outputs is reserved for one final Power BI workbook. Remove stale
    # generated files so a failed run cannot leave an old result looking current.
    ensure_directories()
    for generated_file in OUTPUT_DIR.iterdir():
        if generated_file.is_file() and generated_file.name != ".gitkeep":
            generated_file.unlink()

    started = time.time()
    for label, module in STEPS:
        run_step(label, module)

    if not POWERBI_WORKBOOK.exists() or POWERBI_WORKBOOK.stat().st_size == 0:
        raise RuntimeError(
            f"Pipeline finished without a valid Power BI workbook: {POWERBI_WORKBOOK}"
        )
    print(f"\nPipeline completed in {time.time() - started:.1f} seconds.")
    print("Use this one file as the only Power BI source:")
    print(POWERBI_WORKBOOK)


if __name__ == "__main__":
    main()
