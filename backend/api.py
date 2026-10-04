import asyncio
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from psycopg.errors import CheckViolation, UniqueViolation
from quart import Quart, jsonify, request

from db import MIGRATIONS, SCHEMA, connect
from rules import judge

SECRET = os.environ.get("JWT_SECRET", "yaw-align-dev-secret")
pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = {
    "technician": {
        "role": "writer",
        "password_hash": pwd.hash("tech123456"),
    },
    "observer": {
        "role": "reader",
        "password_hash": pwd.hash("obs123456"),
    },
}

app = Quart(__name__)


def _run_db(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def run_db(fn, *args, **kwargs):
    return await asyncio.to_thread(_run_db, fn, *args, **kwargs)


TURBINE_SEED = [
    ("W01", "一号机"),
    ("W07", "七号机"),
    ("W12", "十二号机"),
]


def seed_if_empty(conn):
    conn.execute(SCHEMA)
    for stmt in MIGRATIONS:
        conn.execute(stmt)
    for code, name in TURBINE_SEED:
        conn.execute(
            "INSERT INTO turbines (code, name) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (code, name),
        )
    count = conn.execute("SELECT COUNT(*) AS n FROM yaw_logs").fetchone()["n"]
    if count > 0:
        return
    now = datetime.now(timezone.utc)
    samples = [
        ("W01", 0.4, "合格"),
        ("W07", 3.2, "偏航超差"),
    ]
    for code, err, expected_verdict in samples:
        verdict, reason = judge(err)
        assert verdict == expected_verdict
        # 基线历史单据：台账机制上线前录入，方位快照记 0.0°。
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, azimuth_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 0.0, 'done', %s, %s, %s, %s, %s)""",
            (code, err, verdict, reason, "technician", now, now),
        )


@app.before_serving
async def startup():
    def init():
        with connect() as conn:
            seed_if_empty(conn)
            conn.commit()

    await run_db(init)


def parse_bearer():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return None


async def current_user():
    token = parse_bearer()
    if not token:
        return None
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except JWTError:
        return None
    sub = payload.get("sub")
    if sub not in USERS:
        return None
    return {"username": sub, "role": payload.get("role")}


def require_login(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        return await handler(user, *args, **kwargs)

    return wrapper


def require_writer(handler):
    @wraps(handler)
    async def wrapper(*args, **kwargs):
        user = await current_user()
        if user is None:
            return jsonify({"detail": "未登录"}), 401
        if user["role"] != "writer":
            return jsonify({"detail": "仅现场技师可操作"}), 403
        return await handler(user, *args, **kwargs)

    return wrapper


def parse_azimuth(raw):
    """方位角必须是 [0, 360) 的数字。"""
    try:
        value = float(raw)
    except (TypeError, ValueError):
        raise ValueError("方位角必须是数字")
    if value != value or value < 0 or value >= 360:
        raise ValueError("方位角必须在 0°（含）与 360°（不含）之间")
    return value


@app.get("/api/health")
async def health():
    return jsonify({"status": "ok", "service": "yaw-align-log"})


@app.post("/api/auth/login")
async def login():
    body = await request.get_json(force=True, silent=True) or {}
    username = (body.get("username") or "").strip()
    password = body.get("password") or ""
    user = USERS.get(username)
    if not user or not pwd.verify(password, user["password_hash"]):
        return jsonify({"detail": "用户名或密码错误"}), 401
    exp = datetime.now(timezone.utc) + timedelta(hours=8)
    token = jwt.encode(
        {"sub": username, "role": user["role"], "exp": exp},
        SECRET,
        algorithm="HS256",
    )
    return jsonify(
        {
            "access_token": token,
            "username": username,
            "role": user["role"],
        }
    )


@app.get("/api/turbines")
@require_login
async def list_turbines(user):
    """钉死台左区待钉机组 + 中区已钉档案，一次取齐。"""

    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT t.code, t.name,
                          p.azimuth_deg, p.pinned_by, p.pinned_at,
                          p.updated_by, p.updated_at,
                          (p.turbine_code IS NOT NULL) AS pinned
                   FROM turbines t
                   LEFT JOIN azimuth_pins p ON p.turbine_code = t.code
                   ORDER BY t.code"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/azimuth-pins")
@require_writer
async def pin_azimuth(user):
    """钉死机舱方位：仅未钉机组可钉，并发争抢只落一笔（主键拒收第二笔）。"""
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        azimuth_deg = parse_azimuth(body.get("azimuth_deg"))
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            try:
                # 单条语句原子插入：两个技师并发钉同一机组时，
                # 只有一笔能插入主键，另一笔当场 UniqueViolation 拒收。
                row = conn.execute(
                    """INSERT INTO azimuth_pins
                       (turbine_code, azimuth_deg, pinned_by, pinned_at)
                       SELECT t.code, %s, %s, %s
                       FROM turbines t
                       WHERE t.code = %s
                       RETURNING turbine_code, azimuth_deg, pinned_by, pinned_at,
                                 updated_by, updated_at""",
                    (azimuth_deg, user["username"], now, turbine_code),
                ).fetchone()
            except UniqueViolation:
                conn.rollback()
                return "conflict", None
            except CheckViolation:
                conn.rollback()
                return "bad_value", None
            if row is None:
                # SELECT 未命中任何名册机组 → 0 行插入，整单退回。
                conn.rollback()
                return "not_found", None
            conn.commit()
            return "ok", row

    status, row = await run_db(insert)
    if status == "conflict":
        return jsonify({"detail": f"机组 {turbine_code} 已钉死，并发钉死被拒收，请刷新档案"}), 409
    if status == "not_found":
        return jsonify({"detail": f"机组 {turbine_code} 不在机组名册"}), 404
    if status == "bad_value":
        return jsonify({"detail": "方位角必须在 0°（含）与 360°（不含）之间"}), 400
    return jsonify(row), 201


@app.put("/api/azimuth-pins/<turbine_code>")
@require_writer
async def update_pin(user, turbine_code):
    """改钉：只改台账现值，绝不回写历史单据的方位快照。"""
    body = await request.get_json(force=True, silent=True) or {}
    try:
        azimuth_deg = parse_azimuth(body.get("azimuth_deg"))
    except ValueError as exc:
        return jsonify({"detail": str(exc)}), 400

    now = datetime.now(timezone.utc)

    def update():
        with connect() as conn:
            try:
                row = conn.execute(
                    """UPDATE azimuth_pins
                       SET azimuth_deg = %s, updated_by = %s, updated_at = %s
                       WHERE turbine_code = %s
                       RETURNING turbine_code, azimuth_deg, pinned_by, pinned_at,
                                 updated_by, updated_at""",
                    (azimuth_deg, user["username"], now, turbine_code),
                ).fetchone()
            except CheckViolation:
                conn.rollback()
                return "bad_value", None
            if row is None:
                conn.rollback()
                return "not_found", None
            conn.commit()
            return "ok", row

    status, row = await run_db(update)
    if status == "not_found":
        return jsonify({"detail": f"机组 {turbine_code} 尚未钉死，不能改钉"}), 404
    if status == "bad_value":
        return jsonify({"detail": "方位角必须在 0°（含）与 360°（不含）之间"}), 400
    return jsonify(row)


@app.get("/api/logs")
@require_login
async def list_logs(user):
    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, yaw_err_deg, azimuth_deg, status,
                          verdict, reason, created_by, created_at, processed_at
                   FROM yaw_logs ORDER BY id DESC"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/logs")
@require_writer
async def create_log(user):
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    try:
        yaw_err_deg = float(body.get("yaw_err_deg"))
    except (TypeError, ValueError):
        return jsonify({"detail": "偏航误差必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        # 查钉、抄方位、入队必须同一库事务：任一步失败整单退回，
        # 不允许「入了队却没方位」或「有半笔写入」。
        with connect() as conn:
            with conn.transaction():
                pin = conn.execute(
                    """SELECT azimuth_deg
                       FROM azimuth_pins
                       WHERE turbine_code = %s
                       FOR UPDATE""",
                    (turbine_code,),
                ).fetchone()
                if pin is None:
                    if not conn.execute(
                        "SELECT 1 FROM turbines WHERE code = %s", (turbine_code,)
                    ).fetchone():
                        return "not_found", None
                    return "not_pinned", None
                row = conn.execute(
                    """INSERT INTO yaw_logs
                       (turbine_code, yaw_err_deg, azimuth_deg, status, verdict,
                        reason, created_by, created_at)
                       VALUES (%s, %s, %s, 'pending', NULL, NULL, %s, %s)
                       RETURNING id, turbine_code, yaw_err_deg, azimuth_deg, status,
                                 verdict, reason, created_by, created_at, processed_at""",
                    (
                        turbine_code,
                        yaw_err_deg,
                        pin["azimuth_deg"],
                        user["username"],
                        now,
                    ),
                ).fetchone()
            conn.commit()
            return "ok", row

    status, row = await run_db(insert)
    if status == "not_found":
        return jsonify({"detail": f"机组 {turbine_code} 不在机组名册"}), 400
    if status == "not_pinned":
        # 未钉机组提交：整单退回，不落任何记录。
        return jsonify({"detail": f"机组 {turbine_code} 机舱方位未钉，整单退回，请先到钉死台钉死后再报"}), 400
    return jsonify(row), 201
