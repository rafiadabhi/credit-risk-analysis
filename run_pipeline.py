import argparse
import subprocess
import sys
import time


def run_step(label, module, *arguments):
    print(f"\n{'=' * 72}\n{label}\n{'=' * 72}")
    command = [sys.executable, "-m", module, *arguments]
    subprocess.run(command, check=True)


def main():
    parser = argparse.ArgumentParser(description="Run the end-to-end credit risk pipeline.")
    parser.add_argument(
        "--mode",
        choices=["full", "csv-only"],
        default="full",
        help="full uses PostgreSQL; csv-only validates Python/model/dashboard files without a database.",
    )
    args = parser.parse_args()
    started = time.time()

    if args.mode == "full":
        run_step("1/6 Audit and clean source data", "src.01_audit_clean")
        run_step("2/6 Create PostgreSQL tables and load clean data", "src.03_load_postgresql")
        run_step("3/6 Train/evaluate models and write results to PostgreSQL", "src.02_train_models", "--source", "postgres")
        run_step("4/6 Create Power BI views", "src.04_build_powerbi_views")
        run_step("5/6 Export Power BI-ready data", "src.05_export_powerbi_data", "--source", "postgres")
        run_step("6/6 Validate outputs", "src.06_validate_outputs", "--source", "postgres")
    else:
        run_step("1/4 Audit and clean source data", "src.01_audit_clean")
        run_step("2/4 Train/evaluate models from CSV", "src.02_train_models", "--source", "csv")
        run_step("3/4 Export Power BI-ready CSVs", "src.05_export_powerbi_data", "--source", "csv")
        run_step("4/4 Validate file outputs", "src.06_validate_outputs", "--source", "csv")

    print(f"\nPipeline completed in {time.time() - started:.1f} seconds.")


if __name__ == "__main__":
    main()
