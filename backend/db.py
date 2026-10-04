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
CREATE TABLE IF NOT EXISTS yaw_logs (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    yaw_err_deg double precision NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    verdict text,
    reason text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL,
    processed_at timestamptz
);

-- 机组主数据：待钉机组清单的来源
CREATE TABLE IF NOT EXISTS turbines (
    code text PRIMARY KEY
);

-- 机舱方位钉死台账：一台机组同一时刻只有一笔钉死
CREATE TABLE IF NOT EXISTS nacelle_pins (
    turbine_code text PRIMARY KEY,
    azimuth_deg double precision NOT NULL,
    pinned_by text NOT NULL,
    pinned_at timestamptz NOT NULL,
    updated_by text,
    updated_at timestamptz
);

-- 整单退回台账：未钉机组强行报送的退回说明
CREATE TABLE IF NOT EXISTS submission_rejections (
    id serial PRIMARY KEY,
    turbine_code text NOT NULL,
    yaw_err_deg double precision,
    reason text NOT NULL,
    attempted_by text NOT NULL,
    attempted_at timestamptz NOT NULL
);

-- 单据上的方位是钉死那一刻的快照，事后改钉不回流旧单
ALTER TABLE yaw_logs ADD COLUMN IF NOT EXISTS azimuth_deg double precision;
"""
