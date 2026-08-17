from src.config import SQL_DIR
from src.db import execute_sql_file, test_connection


def main():
    print(f"Connected to: {test_connection()}")
    execute_sql_file(SQL_DIR / "03_powerbi_views.sql")
    print("Power BI views/materialized views created and refreshed.")


if __name__ == "__main__":
    main()

