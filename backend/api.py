import asyncio
import math
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

from jose import JWTError, jwt
from passlib.context import CryptContext
from quart import Quart, jsonify, request

from db import SCHEMA, connect
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

SEED_TURBINES = [f"W{i:02d}" for i in range(1, 9)]

app = Quart(__name__)


def _run_db(fn, *args, **kwargs):
    return fn(*args, **kwargs)


async def run_db(fn, *args, **kwargs):
    return await asyncio.to_thread(_run_db, fn, *args, **kwargs)


def seed_if_empty(conn):
    conn.execute(SCHEMA)
    if conn.execute("SELECT COUNT(*) AS n FROM turbines").fetchone()["n"] == 0:
        for code in SEED_TURBINES:
            conn.execute("INSERT INTO turbines (code) VALUES (%s)", (code,))
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
        # 历史单：钉死台账上线前办结，无方位快照
        conn.execute(
            """INSERT INTO yaw_logs
               (turbine_code, yaw_err_deg, status, verdict, reason,
                created_by, created_at, processed_at)
               VALUES (%s, %s, 'done', %s, %s, %s, %s, %s)""",
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
            return jsonify({"detail": "观察员只读，仅现场技师可执行写操作"}), 403
        return await handler(user, *args, **kwargs)

    return wrapper


def _parse_deg(value):
    """把请求里的角度字段解析成有限浮点数，失败返回 None。"""
    try:
        deg = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(deg):
        return None
    return deg


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


@app.get("/api/turbines")
@require_login
async def list_turbines(user):
    """机组清单及钉死状态：左区待钉 = pinned 为 false 的机组。"""

    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT t.code, (p.turbine_code IS NOT NULL) AS pinned
                   FROM turbines t
                   LEFT JOIN nacelle_pins p ON p.turbine_code = t.code
                   ORDER BY t.code"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.get("/api/pins")
@require_login
async def list_pins(user):
    """已钉档案：观察员也可翻阅。"""

    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT turbine_code, azimuth_deg, pinned_by, pinned_at,
                          updated_by, updated_at
                   FROM nacelle_pins ORDER BY turbine_code"""
            ).fetchall()

    rows = await run_db(query)
    return jsonify(rows)


@app.post("/api/pins")
@require_writer
async def create_pin(user):
    """钉死：同事务补录机组并原子落钉；并发争抢同一机组只有一笔能落库。"""
    body = await request.get_json(force=True, silent=True) or {}
    turbine_code = (body.get("turbine_code") or "").strip()
    if not turbine_code:
        return jsonify({"detail": "机组编号不能为空"}), 400
    azimuth_deg = _parse_deg(body.get("azimuth_deg"), "方位角")
    if azimuth_deg is None:
        return jsonify({"detail": "方位角必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            with conn.transaction():
                conn.execute(
                    "INSERT INTO turbines (code) VALUES (%s) ON CONFLICT (code) DO NOTHING",
                    (turbine_code,),
                )
                return conn.execute(
                    """INSERT INTO nacelle_pins
                       (turbine_code, azimuth_deg, pinned_by, pinned_at)
                       VALUES (%s, %s, %s, %s)
                       ON CONFLICT (turbine_code) DO NOTHING
                       RETURNING turbine_code, azimuth_deg, pinned_by, pinned_at,
                                 updated_by, updated_at""",
                    (turbine_code, azimuth_deg, user["username"], now),
                ).fetchone()

    row = await run_db(insert)
    if row is None:
        return (
            jsonify({"detail": f"机组 {turbine_code} 已钉死，如需调整请使用改数"}),
            409,
        )
    return jsonify(row), 201


@app.put("/api/pins/<turbine_code>")
@require_writer
async def update_pin(user, turbine_code):
    """改数：只更新台账当前值，不牵动已抄进旧单的方位快照。"""
    body = await request.get_json(force=True, silent=True) or {}
    azimuth_deg = _parse_deg(body.get("azimuth_deg"), "方位角")
    if azimuth_deg is None:
        return jsonify({"detail": "方位角必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def update():
        with connect() as conn:
            with conn.transaction():
                return conn.execute(
                    """UPDATE nacelle_pins
                       SET azimuth_deg = %s, updated_by = %s, updated_at = %s
                       WHERE turbine_code = %s
                       RETURNING turbine_code, azimuth_deg, pinned_by, pinned_at,
                                 updated_by, updated_at""",
                    (azimuth_deg, user["username"], now, turbine_code),
                ).fetchone()

    row = await run_db(update)
    if row is None:
        return jsonify({"detail": f"机组 {turbine_code} 尚未钉死，无法改数"}), 404
    return jsonify(row)


@app.get("/api/rejections")
@require_login
async def list_rejections(user):
    """退回说明：未钉机组强行报送被整单退回的记录。"""

    def query():
        with connect() as conn:
            return conn.execute(
                """SELECT id, turbine_code, yaw_err_deg, reason,
                          attempted_by, attempted_at
                   FROM submission_rejections
                   ORDER BY id DESC LIMIT 50"""
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
    yaw_err_deg = _parse_deg(body.get("yaw_err_deg"), "偏航误差")
    if yaw_err_deg is None:
        return jsonify({"detail": "偏航误差必须是数字"}), 400

    now = datetime.now(timezone.utc)

    def insert():
        with connect() as conn:
            # 钉死校验、抄方位、入队在同一库事务：要么整笔落库，要么整笔退回
            with conn.transaction():
                pin = conn.execute(
                    "SELECT azimuth_deg FROM nacelle_pins WHERE turbine_code = %s",
                    (turbine_code,),
                ).fetchone()
                if pin is None:
                    conn.execute(
                        """INSERT INTO submission_rejections
                           (turbine_code, yaw_err_deg, reason, attempted_by, attempted_at)
                           VALUES (%s, %s, %s, %s, %s)""",
                        (
                            turbine_code,
                            yaw_err_deg,
                            "方位未钉，整单退回",
                            user["username"],
                            now,
                        ),
                    )
                    return None
                return conn.execute(
                    """INSERT INTO yaw_logs
                       (turbine_code, yaw_err_deg, azimuth_deg, status, verdict,
                        reason, created_by, created_at)
                       VALUES (%s, %s, %s, 'pending', NULL, NULL, %s, %s)
                       RETURNING id, turbine_code, yaw_err_deg, azimuth_deg, status,
                                 verdict, reason, created_by, created_at, processed_at""",
                    (turbine_code, yaw_err_deg, pin["azimuth_deg"], user["username"], now),
                ).fetchone()

    row = await run_db(insert)
    if row is None:
        return (
            jsonify({"detail": f"机组 {turbine_code} 方位未钉，已整单退回"}),
            409,
        )
    return jsonify(row), 201
