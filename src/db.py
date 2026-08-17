from pathlib import Path

from src.config import database_url


def get_engine():
    from sqlalchemy import create_engine

    return create_engine(database_url(), pool_pre_ping=True)


def test_connection() -> str:
    from sqlalchemy import text

    with get_engine().connect() as connection:
        return connection.execute(text("SELECT version()")).scalar_one()


def execute_sql_file(path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with get_engine().begin() as connection:
        connection.exec_driver_sql(sql)
