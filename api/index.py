import os, re, json, hashlib, secrets
from decimal import Decimal
from typing import Literal, Optional

import psycopg2
from psycopg2.extras import RealDictCursor, Json
from fastapi import FastAPI, Depends, Header, HTTPException
from pydantic import BaseModel
from langchain_core.tools import tool
from langchain_core.messages import SystemMessage, HumanMessage, ToolMessage

try:  # local development only: loads DATABASE_URL and GROQ_API_KEY from .env
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from langchain_groq import ChatGroq

app = FastAPI()
llm = ChatGroq(model="openai/gpt-oss-120b", temperature=0)  # reads GROQ_API_KEY

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, pw TEXT NOT NULL, token TEXT);
CREATE TABLE IF NOT EXISTS dbs (
  id SERIAL PRIMARY KEY, owner INT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, columns JSONB NOT NULL);
CREATE TABLE IF NOT EXISTS records (
  id SERIAL PRIMARY KEY, db_id INT NOT NULL REFERENCES dbs(id) ON DELETE CASCADE,
  data JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS records_db_idx ON records (db_id);
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY, owner INT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL, description TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT now());
ALTER TABLE dbs ADD COLUMN IF NOT EXISTS project_id INT REFERENCES projects(id) ON DELETE CASCADE;
ALTER TABLE dbs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
"""
_ready = False


def run(sql, params=(), fetch=True):
    global _ready
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    try:
        with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
            if not _ready:
                cur.execute(SCHEMA)
                _ready = True
            cur.execute(sql, params)
            return cur.fetchall() if fetch else None
    finally:
        conn.close()


@app.get("/api/health")
def health():
    run("SELECT 1")
    return {"ok": True}


# ---------------- auth ----------------
class Auth(BaseModel):
    email: str
    password: str


def hash_pw(password, salt):
    return salt + "$" + hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


@app.post("/api/signup")
def signup(a: Auth):
    if run("SELECT id FROM users WHERE email=%s", [a.email]):
        raise HTTPException(400, "Email already registered")
    token = secrets.token_hex(24)
    run("INSERT INTO users (email, pw, token) VALUES (%s,%s,%s)",
        [a.email, hash_pw(a.password, secrets.token_hex(8)), token], fetch=False)
    return {"token": token}


@app.post("/api/login")
def login(a: Auth):
    rows = run("SELECT id, pw FROM users WHERE email=%s", [a.email])
    if not rows or hash_pw(a.password, rows[0]["pw"].split("$")[0]) != rows[0]["pw"]:
        raise HTTPException(401, "Wrong email or password")
    token = secrets.token_hex(24)
    run("UPDATE users SET token=%s WHERE id=%s", [token, rows[0]["id"]], fetch=False)
    return {"token": token}


def current_user(authorization: str = Header(None)):
    rows = run("SELECT id FROM users WHERE token=%s", [authorization or ""])
    if not rows:
        raise HTTPException(401, "Please log in")
    return rows[0]["id"]


def get_db(uid, db_id):
    rows = run("SELECT * FROM dbs WHERE id=%s AND owner=%s", [db_id, uid])
    if not rows:
        raise HTTPException(404, "Database not found")
    return rows[0]


# ---------------- databases (the user defines the columns) ----------------
class Column(BaseModel):
    name: str
    type: Literal["text", "number"]


class NewDB(BaseModel):
    name: str
    columns: list[Column]
    project_id: Optional[int] = None


@app.post("/api/databases")
def create_database(body: NewDB, uid: int = Depends(current_user)):
    names = [c.name.strip() for c in body.columns]
    if not body.name.strip() or not names or "" in names or len(set(names)) != len(names):
        raise HTTPException(400, "Give the table a name and at least one uniquely named column")
    if body.project_id and not run("SELECT id FROM projects WHERE id=%s AND owner=%s", [body.project_id, uid]):
        raise HTTPException(404, "Database not found")
    cols = [{"name": c.name.strip(), "type": c.type} for c in body.columns]
    row = run("INSERT INTO dbs (owner, name, columns, project_id) VALUES (%s,%s,%s,%s) RETURNING id",
              [uid, body.name.strip(), Json(cols), body.project_id])[0]
    return {"id": row["id"]}


@app.get("/api/databases")
def list_databases(uid: int = Depends(current_user)):
    return run("""SELECT d.id, d.name, d.columns, d.project_id, d.created_at,
                  (SELECT COUNT(*) FROM records r WHERE r.db_id = d.id) AS row_count
                  FROM dbs d WHERE d.owner=%s ORDER BY d.id""", [uid])


class NewProject(BaseModel):
    name: str
    description: str = ""


@app.get("/api/projects")
def list_projects(uid: int = Depends(current_user)):
    return run("SELECT id, name, description, created_at FROM projects WHERE owner=%s ORDER BY id", [uid])


@app.post("/api/projects")
def create_project(body: NewProject, uid: int = Depends(current_user)):
    if not body.name.strip():
        raise HTTPException(400, "Give the database a name")
    row = run("INSERT INTO projects (owner, name, description) VALUES (%s,%s,%s) RETURNING id",
              [uid, body.name.strip(), body.description.strip()])[0]
    return {"id": row["id"]}


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, uid: int = Depends(current_user)):
    run("DELETE FROM projects WHERE id=%s AND owner=%s", [project_id, uid], fetch=False)
    return {"ok": True}


@app.delete("/api/databases/{db_id}")
def delete_database(db_id: int, uid: int = Depends(current_user)):
    get_db(uid, db_id)
    run("DELETE FROM dbs WHERE id=%s", [db_id], fetch=False)
    return {"ok": True}


# ---------------- records (the dashboard) ----------------
class Row(BaseModel):
    data: dict


def clean(db, data):
    out = {}
    for c in db["columns"]:
        v = data.get(c["name"])
        if v is None or v == "":
            out[c["name"]] = None
        elif c["type"] == "number":
            try:
                n = float(v)
            except (TypeError, ValueError):
                raise HTTPException(400, f"'{c['name']}' must be a number")
            out[c["name"]] = int(n) if n.is_integer() else n
        else:
            out[c["name"]] = str(v)
    return out


@app.get("/api/databases/{db_id}/records")
def list_records(db_id: int, uid: int = Depends(current_user)):
    get_db(uid, db_id)
    rows = run("SELECT id, data FROM records WHERE db_id=%s ORDER BY id DESC", [db_id])
    return [{"id": r["id"], **r["data"]} for r in rows]


@app.post("/api/databases/{db_id}/records")
def add_record(db_id: int, body: Row, uid: int = Depends(current_user)):
    db = get_db(uid, db_id)
    run("INSERT INTO records (db_id, data) VALUES (%s,%s)", [db_id, Json(clean(db, body.data))], fetch=False)
    return {"ok": True}


@app.put("/api/databases/{db_id}/records/{rec_id}")
def update_record(db_id: int, rec_id: int, body: Row, uid: int = Depends(current_user)):
    db = get_db(uid, db_id)
    run("UPDATE records SET data=%s WHERE id=%s AND db_id=%s", [Json(clean(db, body.data)), rec_id, db_id], fetch=False)
    return {"ok": True}


@app.delete("/api/databases/{db_id}/records/{rec_id}")
def delete_record(db_id: int, rec_id: int, uid: int = Depends(current_user)):
    get_db(uid, db_id)
    run("DELETE FROM records WHERE id=%s AND db_id=%s", [rec_id, db_id], fetch=False)
    return {"ok": True}


# ---------------- AI chat ----------------
# The AI never writes SQL. It fills in arguments for two tools; this code
# validates every column name against the user's schema and builds the query.
# The tools read the live table on every call, so new data is visible instantly.
class Filter(BaseModel):
    column: str
    op: Literal["=", "!=", ">", "<", ">=", "<=", "contains"]
    value: str


NUM_OPS = {"=": "=", "!=": "<>", ">": ">", "<": "<", ">=": ">=", "<=": "<="}


def build_where(db, types, filters):
    sql, params = "db_id=%s", [db["id"]]
    for f in filters or []:
        if isinstance(f, dict):
            f = Filter(**f)
        if f.column not in types:
            raise ValueError(f"Unknown column '{f.column}'. Valid columns: {list(types)}")
        if types[f.column] == "number":
            if f.op not in NUM_OPS:
                raise ValueError(f"Operator '{f.op}' is not valid for number column '{f.column}'")
            sql += f" AND (data->>%s)::numeric {NUM_OPS[f.op]} %s"
            params += [f.column, float(f.value)]
        elif f.op == "contains":
            sql += " AND data->>%s ILIKE %s"
            params += [f.column, f"%{f.value}%"]
        elif f.op in ("=", "!="):
            sql += f" AND LOWER(data->>%s) {NUM_OPS[f.op]} LOWER(%s)"
            params += [f.column, f.value]
        else:
            raise ValueError(f"Operator '{f.op}' is not valid for text column '{f.column}'")
    return sql, params


def show_sql(sql, params):
    it = iter(params)

    def fmt(p):
        return "'" + p.replace("'", "''") + "'" if isinstance(p, str) else str(p)
    return re.sub(r"%s", lambda m: fmt(next(it)), sql)


def dump(obj):
    return json.dumps(obj, default=lambda o: float(o) if isinstance(o, Decimal) else str(o))


def make_tools(db, trace):
    types = {c["name"]: c["type"] for c in db["columns"]}

    @tool
    def list_records(filters: list[Filter] = [], order_by: str = "", descending: bool = False, limit: int = 20) -> str:
        """Return rows that match ALL filters (empty list = all rows). Optionally sort by a column. Max 50 rows."""
        where, params = build_where(db, types, filters)
        sql = f"SELECT data FROM records WHERE {where}"
        if order_by:
            if order_by not in types:
                raise ValueError(f"Unknown column '{order_by}'. Valid columns: {list(types)}")
            sql += f" ORDER BY {'(data->>%s)::numeric' if types[order_by] == 'number' else 'data->>%s'}"
            sql += " DESC NULLS LAST" if descending else " ASC NULLS LAST"
            params.append(order_by)
        sql += " LIMIT %s"
        params.append(max(1, min(limit, 50)))
        rows = [r["data"] for r in run(sql, params)]
        trace.append({"sql": show_sql(sql, params), "columns": list(types), "rows": rows})
        return dump(rows)

    @tool
    def aggregate(metric: Literal["count", "sum", "avg", "min", "max"], column: str = "",
                  group_by: str = "", filters: list[Filter] = []) -> str:
        """Compute count, or sum/avg/min/max of a number column, optionally grouped by a column and filtered."""
        if metric != "count" and types.get(column) != "number":
            raise ValueError(f"'{column}' is not a number column. Number columns: {[k for k, v in types.items() if v == 'number']}")
        if group_by and group_by not in types:
            raise ValueError(f"Unknown group_by column '{group_by}'. Valid columns: {list(types)}")
        where, wparams = build_where(db, types, filters)
        params, select = [], ""
        if group_by:
            select += "data->>%s AS grp, "
            params.append(group_by)
        if metric == "count":
            select += "COUNT(*) AS result"
        else:
            select += f"{metric.upper()}((data->>%s)::numeric) AS result"
            params.append(column)
        sql = f"SELECT {select} FROM records WHERE {where}"
        params += wparams
        if group_by:
            sql += " GROUP BY data->>%s ORDER BY result DESC NULLS LAST"
            params.append(group_by)
        label = "count" if metric == "count" else f"{metric} of {column}"
        out = []
        for r in run(sql, params):
            d = {group_by: r["grp"]} if group_by else {}
            v = r["result"]
            d[label] = float(v) if isinstance(v, Decimal) else v
            out.append(d)
        trace.append({"sql": show_sql(sql, params), "columns": ([group_by] if group_by else []) + [label], "rows": out})
        return dump(out)

    return [list_records, aggregate]


class Chat(BaseModel):
    question: str


@app.post("/api/databases/{db_id}/chat")
def chat(db_id: int, body: Chat, uid: int = Depends(current_user)):
    db = get_db(uid, db_id)
    total = run("SELECT COUNT(*) AS n FROM records WHERE db_id=%s", [db_id])[0]["n"]
    schema = ", ".join(f"{c['name']} ({c['type']})" for c in db["columns"])
    system = (f"You answer questions about the user's table '{db['name']}'. Columns: {schema}. "
              f"It currently has {total} rows. Always use the tools to get facts and never guess numbers or names. "
              "For text columns use '=' for exact matches and 'contains' for partial matches. "
              "Answer briefly in plain text. If the data cannot answer the question, say so.")
    trace = []
    tools = make_tools(db, trace)
    by_name = {t.name: t for t in tools}
    model = llm.bind_tools(tools)
    msgs = [SystemMessage(content=system), HumanMessage(content=body.question)]
    for _ in range(6):
        ai = model.invoke(msgs)
        msgs.append(ai)
        if not ai.tool_calls:
            return {"answer": ai.content, **(trace[-1] if trace else {"sql": "", "columns": [], "rows": []})}
        for call in ai.tool_calls:
            try:
                out = by_name[call["name"]].invoke(call["args"])
            except Exception as err:  # the model sees the error and can retry
                out = f"Tool error: {err}"
            msgs.append(ToolMessage(content=str(out), tool_call_id=call["id"]))
    return {"answer": "I could not finish that. Please rephrase the question.", "sql": "", "columns": [], "rows": []}


# ---------------- frontend ----------------
# Locally this serves the public/ folder at http://localhost:8000
# (on Vercel the public/ folder is served automatically).
from fastapi.staticfiles import StaticFiles

_public = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
if os.path.isdir(_public):
    app.mount("/", StaticFiles(directory=_public, html=True), name="site")
