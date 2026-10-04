import os

import psycopg
from psycopg.rows import dict_row

DSN = os.environ.get(
    "DATABASE_URL",
    "postgresql://app:app@localhost:54399/yawalign",
)


def connect():
    return psycopg.connect(DSN, row_factory=dict_row)


SCHEMA = """
CREATE TABLE IF NOT EXISTS turbines (
    code text PRIMARY KEY,
    name text NOT NULL
);

CREATE TABLE IF NOT EXISTS azimuth_pins (
    turbine_code text PRIMARY KEY
        REFERENCES turbines(code),
    azimuth_deg double precision NOT NULL
        CHECK (azimuth_deg >= 0 AND azimuth_deg < 360),
    pinned_by text NOT NULL,
    pinned_at timestamptz NOT NULL,
    updated_by text,
    updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS yaw_logs (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    azimuth_deg double precision NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verdict text,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_yaw_logs_status ON yaw_logs(status);
"""

# 已存在库做平滑升级：补上方位快照列（新装库由 SCHEMA 直接建好）。
MIGRATIONS = (
    """ALTER TABLE yaw_logs
       ADD COLUMN IF NOT EXISTS azimuth_deg double precision""",
)
