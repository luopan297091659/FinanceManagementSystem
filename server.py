import json
import mimetypes
import sqlite3
import sys
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DB_DIR = ROOT / "data"
DB_PATH = DB_DIR / "app.db"
SCHEMA_PATH = ROOT / "docs" / "schema.sql"


def new_id(prefix):
    return f"{prefix}-{uuid.uuid4()}"


def connect():
    DB_DIR.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def execute_schema(conn):
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
    ensure_column(conn, "building", "latitude", "REAL")
    ensure_column(conn, "building", "longitude", "REAL")
    ensure_column(conn, "room", "latitude", "REAL")
    ensure_column(conn, "room", "longitude", "REAL")


def ensure_column(conn, table, column, definition):
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def table_count(conn, table):
    return conn.execute(f"SELECT COUNT(*) AS count FROM {table}").fetchone()["count"]


def seed_database(conn):
    if table_count(conn, "project") > 0:
        return

    company_id = "mc-1"
    project_id = "project-1"
    building_id = "building-1"
    room_101 = "room-1"
    room_102 = "room-2"
    tenant_id = "tenant-1"
    owner_id = "owner-1"
    fee_items = [
        ("fee-1", "租金", "income", "Money", 10, 1),
        ("fee-2", "管理费", "income", "Money", 20, 1),
        ("fee-3", "停车费", "income", "Money", 30, 1),
        ("fee-4", "维修费", "expense", "Money", 10, 1),
        ("fee-5", "水费", "expense", "Money", 20, 1),
        ("fee-6", "备注", "both", "Text", 99, 1),
    ]

    conn.execute("INSERT INTO management_company (id, name) VALUES (?, ?)", (company_id, "ABC管理会社"))
    conn.execute("INSERT INTO project (id, name, address, note) VALUES (?, ?, ?, ?)", (project_id, "住之江区西住之江", "大阪府大阪市住之江区", "一期演示项目"))
    conn.execute(
        "INSERT INTO building (id, project_id, management_company_id, name, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)",
        (building_id, project_id, company_id, "T1", 34.6937378, 135.5021651),
    )
    conn.execute(
        "INSERT INTO room (id, building_id, management_company_id, room_number, area, floor, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (room_101, building_id, company_id, "101", 25.5, 1, "OCCUPIED", "示例房间"),
    )
    conn.execute(
        "INSERT INTO room (id, building_id, management_company_id, room_number, area, floor, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (room_102, building_id, company_id, "102", 23, 1, "VACANT", ""),
    )
    conn.execute(
        "INSERT INTO tenant (id, name, name_kana, nationality, phone, email, birth_date, occupation, annual_income, address1, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (tenant_id, "张三", "チョウ サン", "中国", "090-1111-2222", "zhang@example.com", "1995-04-12", "会社員", 4200000, "大阪府大阪市住之江区", "在留卡、合同"),
    )
    conn.execute(
        "INSERT INTO owner (id, owner_type, name, name_kana, phone, email, address1, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (owner_id, "PERSON", "山田 太郎", "ヤマダ タロウ", "090-3333-4444", "owner@example.com", "大阪府大阪市中央区", "身份证"),
    )
    conn.execute(
        "INSERT INTO room_tenant (id, room_id, tenant_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)",
        ("rt-1", room_101, tenant_id, "2026-07-01", None, "ACTIVE"),
    )
    conn.execute(
        "INSERT INTO room_owner (id, room_id, owner_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)",
        ("ro-1", room_101, owner_id, "2026-01-01", None, "ACTIVE"),
    )
    conn.executemany(
        "INSERT INTO fee_item (id, name, category, value_type, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?)",
        fee_items,
    )

    conn.execute(
        "INSERT INTO income (id, room_id, income_date, payer, total_amount, note) VALUES (?, ?, ?, ?, ?, ?)",
        ("income-1", room_101, "2026-07-01", "张三", 75000, "7月家租"),
    )
    conn.executemany(
        "INSERT INTO income_detail (id, income_id, fee_item_id, value_money) VALUES (?, ?, ?, ?)",
        [("income-detail-1", "income-1", "fee-1", 70000), ("income-detail-2", "income-1", "fee-2", 5000)],
    )
    conn.execute(
        "INSERT INTO expense (id, room_id, expense_date, payee, total_amount, note) VALUES (?, ?, ?, ?, ?, ?)",
        ("expense-1", room_101, "2026-07-04", "维修会社", 8000, "空调维修"),
    )
    conn.execute(
        "INSERT INTO expense_detail (id, expense_id, fee_item_id, value_money) VALUES (?, ?, ?, ?)",
        ("expense-detail-1", "expense-1", "fee-4", 8000),
    )
    conn.commit()


def init_database(reset=False):
    with connect() as conn:
        if reset:
            conn.execute("PRAGMA foreign_keys = OFF")
            tables = [
                row["name"]
                for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
                ).fetchall()
            ]
            for table in tables:
                conn.execute(f"DROP TABLE IF EXISTS {table}")
            conn.execute("PRAGMA foreign_keys = ON")
        execute_schema(conn)
        seed_database(conn)


def rows(conn, sql, params=()):
    return [dict(row) for row in conn.execute(sql, params).fetchall()]


def value_for_detail(row):
    for key in ("value_money", "value_number", "value_text", "value_date"):
        if row[key] is not None:
            return str(row[key]).rstrip("0").rstrip(".") if key in ("value_money", "value_number") else row[key]
    return ""


def bootstrap():
    with connect() as conn:
        projects = rows(conn, "SELECT id, name, address, note FROM project ORDER BY name")
        buildings = rows(conn, "SELECT id, project_id AS projectId, name, latitude, longitude FROM building ORDER BY name")
        rooms = rows(
            conn,
            """
            SELECT room.id, building.project_id AS projectId, room.building_id AS buildingId,
                   room.room_number AS number, room.area, room.floor,
                   room.latitude, room.longitude,
                   COALESCE(room.latitude, building.latitude) AS effectiveLatitude,
                   COALESCE(room.longitude, building.longitude) AS effectiveLongitude,
                   CASE
                     WHEN room.latitude IS NOT NULL AND room.longitude IS NOT NULL THEN 'room'
                     WHEN building.latitude IS NOT NULL AND building.longitude IS NOT NULL THEN 'building'
                     ELSE 'none'
                   END AS coordinateSource,
                   room.status, room.note
            FROM room
            JOIN building ON building.id = room.building_id
            ORDER BY building.name, room.room_number
            """,
        )
        tenants = rows(
            conn,
            """
            SELECT id, name, name_kana AS kana, nationality, phone, email, birth_date AS birthDate,
                   occupation, annual_income AS annualIncome, address1 AS address, note AS attachments
            FROM tenant ORDER BY name
            """,
        )
        owners = rows(
            conn,
            """
            SELECT id, owner_type AS ownerType, name, name_kana AS kana, phone, email,
                   address1 AS address, note AS attachments
            FROM owner ORDER BY name
            """,
        )
        room_tenants = rows(conn, "SELECT id, room_id AS roomId, tenant_id AS tenantId, start_date AS startDate, end_date AS endDate, status FROM room_tenant ORDER BY start_date DESC")
        room_owners = rows(conn, "SELECT id, room_id AS roomId, owner_id AS ownerId, start_date AS startDate, end_date AS endDate, status FROM room_owner ORDER BY start_date DESC")
        fee_items = rows(conn, "SELECT id, name, category, value_type AS valueType, sort_order AS sortOrder, enabled FROM fee_item ORDER BY sort_order, name")
        for item in fee_items:
            item["enabled"] = bool(item["enabled"])

        transactions = []
        for income in rows(conn, "SELECT id, room_id AS roomId, income_date AS date, payer AS counterparty, note FROM income ORDER BY income_date DESC, id DESC"):
            detail_rows = rows(conn, "SELECT fee_item_id AS feeItemId, value_money, value_number, value_text, value_date FROM income_detail WHERE income_id = ?", (income["id"],))
            transactions.append({**income, "type": "income", "details": [{"feeItemId": row["feeItemId"], "value": value_for_detail(row)} for row in detail_rows]})
        for expense in rows(conn, "SELECT id, room_id AS roomId, expense_date AS date, payee AS counterparty, note FROM expense ORDER BY expense_date DESC, id DESC"):
            detail_rows = rows(conn, "SELECT fee_item_id AS feeItemId, value_money, value_number, value_text, value_date FROM expense_detail WHERE expense_id = ?", (expense["id"],))
            transactions.append({**expense, "type": "expense", "details": [{"feeItemId": row["feeItemId"], "value": value_for_detail(row)} for row in detail_rows]})
        transactions.sort(key=lambda item: item["date"], reverse=True)

        documents = rows(conn, "SELECT id, room_id AS roomId, document_type AS documentType, file_name AS fileName, ocr_text AS extractedText FROM document ORDER BY created_at DESC")
        knowledge_documents = rows(conn, "SELECT id, room_id AS roomId, title, content, source_type AS sourceType FROM knowledge_document ORDER BY created_at DESC")

    return {
        "projects": projects,
        "buildings": buildings,
        "rooms": rooms,
        "tenants": tenants,
        "owners": owners,
        "roomTenants": room_tenants,
        "roomOwners": room_owners,
        "feeItems": fee_items,
        "transactions": transactions,
        "documents": documents,
        "knowledgeDocuments": knowledge_documents,
    }


def upsert_project(conn, name):
    row = conn.execute("SELECT id FROM project WHERE name = ?", (name,)).fetchone()
    if row:
        return row["id"]
    project_id = new_id("project")
    conn.execute("INSERT INTO project (id, name) VALUES (?, ?)", (project_id, name))
    return project_id


def upsert_building(conn, project_id, name):
    row = conn.execute("SELECT id FROM building WHERE project_id = ? AND name = ?", (project_id, name)).fetchone()
    if row:
        return row["id"]
    building_id = new_id("building")
    conn.execute("INSERT INTO building (id, project_id, name) VALUES (?, ?, ?)", (building_id, project_id, name))
    return building_id


def update_building_coordinates(conn, building_id, latitude, longitude):
    if latitude in (None, "") and longitude in (None, ""):
        return
    conn.execute(
        "UPDATE building SET latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude) WHERE id = ?",
        (latitude or None, longitude or None, building_id),
    )


def save_detail(conn, table, parent_column, parent_id, detail):
    fee_item = conn.execute("SELECT value_type FROM fee_item WHERE id = ?", (detail.get("feeItemId"),)).fetchone()
    value_type = fee_item["value_type"] if fee_item else "Text"
    columns = {"Money": "value_money", "Number": "value_number", "Text": "value_text", "Date": "value_date"}
    column = columns.get(value_type, "value_text")
    detail_id = new_id(table)
    conn.execute(
        f"INSERT INTO {table} (id, {parent_column}, fee_item_id, {column}) VALUES (?, ?, ?, ?)",
        (detail_id, parent_id, detail.get("feeItemId"), detail.get("value")),
    )


def handle_post(path, payload):
    if path == "/api/reset":
        init_database(reset=True)
        return {"ok": True}

    with connect() as conn:
        if path == "/api/rooms":
            project_id = upsert_project(conn, payload["projectName"])
            building_id = upsert_building(conn, project_id, payload["buildingName"])
            update_building_coordinates(conn, building_id, payload.get("buildingLatitude"), payload.get("buildingLongitude"))
            conn.execute(
                "INSERT INTO room (id, building_id, room_number, area, floor, latitude, longitude, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    new_id("room"),
                    building_id,
                    payload["roomNumber"],
                    payload.get("area") or None,
                    payload.get("floor") or None,
                    payload.get("roomLatitude") or None,
                    payload.get("roomLongitude") or None,
                    payload.get("status") or "VACANT",
                    payload.get("note"),
                ),
            )
        elif path == "/api/customers":
            if payload.get("kind") == "tenant":
                conn.execute(
                    "INSERT INTO tenant (id, name, name_kana, nationality, phone, email, birth_date, occupation, annual_income, address1, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (new_id("tenant"), payload["name"], payload.get("kana"), payload.get("nationality"), payload.get("phone"), payload.get("email"), payload.get("birthDate") or None, payload.get("occupation"), payload.get("annualIncome") or None, payload.get("address"), payload.get("attachments")),
                )
            else:
                conn.execute(
                    "INSERT INTO owner (id, owner_type, name, name_kana, phone, email, address1, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    (new_id("owner"), payload.get("ownerType") or "PERSON", payload["name"], payload.get("kana"), payload.get("phone"), payload.get("email"), payload.get("address"), payload.get("attachments")),
                )
        elif path == "/api/bindings":
            if not payload.get("roomId") or not payload.get("customerId"):
                raise ValueError("房间和客户不能为空")
            if payload.get("kind") == "tenant":
                conn.execute(
                    "INSERT INTO room_tenant (id, room_id, tenant_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)",
                    (new_id("rt"), payload["roomId"], payload["customerId"], payload.get("startDate") or None, payload.get("endDate") or None, payload.get("status") or "ACTIVE"),
                )
            else:
                conn.execute(
                    "INSERT INTO room_owner (id, room_id, owner_id, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)",
                    (new_id("ro"), payload["roomId"], payload["customerId"], payload.get("startDate") or None, payload.get("endDate") or None, payload.get("status") or "ACTIVE"),
                )
        elif path == "/api/transactions":
            tx_id = new_id(payload["type"])
            total = sum(float(item.get("value") or 0) for item in payload.get("details", []) if str(item.get("value") or "").replace(".", "", 1).isdigit())
            if payload.get("type") == "income":
                conn.execute(
                    "INSERT INTO income (id, room_id, income_date, payer, total_amount, note) VALUES (?, ?, ?, ?, ?, ?)",
                    (tx_id, payload.get("roomId") or None, payload["date"], payload.get("counterparty"), total, payload.get("note")),
                )
                for detail in payload.get("details", []):
                    save_detail(conn, "income_detail", "income_id", tx_id, detail)
            else:
                conn.execute(
                    "INSERT INTO expense (id, room_id, expense_date, payee, total_amount, note) VALUES (?, ?, ?, ?, ?, ?)",
                    (tx_id, payload.get("roomId") or None, payload["date"], payload.get("counterparty"), total, payload.get("note")),
                )
                for detail in payload.get("details", []):
                    save_detail(conn, "expense_detail", "expense_id", tx_id, detail)
        elif path == "/api/documents":
            doc_id = new_id("doc")
            conn.execute(
                "INSERT INTO document (id, room_id, document_type, file_name, ocr_text, status) VALUES (?, ?, ?, ?, ?, ?)",
                (doc_id, payload.get("roomId") or None, payload.get("documentType"), payload.get("fileName"), payload.get("extractedText"), "CONFIRMED"),
            )
            conn.execute(
                "INSERT INTO knowledge_document (id, room_id, document_id, title, content, source_type) VALUES (?, ?, ?, ?, ?, ?)",
                (new_id("kd"), payload.get("roomId") or None, doc_id, payload.get("fileName"), payload.get("extractedText"), payload.get("documentType")),
            )
        elif path == "/api/fee-items":
            conn.execute(
                "INSERT INTO fee_item (id, name, category, value_type, sort_order, enabled) VALUES (?, ?, ?, ?, ?, ?)",
                (new_id("fee"), payload["name"], payload.get("category") or "income", payload.get("valueType") or "Money", payload.get("sortOrder") or 0, 1 if payload.get("enabled", True) else 0),
            )
        else:
            raise ValueError("Unknown API path")
        conn.commit()
    return {"ok": True}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/bootstrap":
            self.send_json(200, bootstrap())
            return
        self.serve_static(path)

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            self.send_json(200, handle_post(path, payload))
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})

    def serve_static(self, path):
        if path == "/":
            path = "/index.html"
        target = (ROOT / path.lstrip("/")).resolve()
        if ROOT not in target.parents and target != ROOT:
            self.send_error(403)
            return
        if not target.exists() or not target.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format, *args):
        sys.stdout.write("%s - %s\n" % (self.address_string(), format % args))


def main():
    init_database()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"房产管理平台已启动：http://127.0.0.1:{port}/")
    print(f"SQLite 数据库：{DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
