"""End-to-end test. Usage:
    python test_flow.py                      # tests http://localhost:8000
    python test_flow.py https://your-app.vercel.app
"""
import sys, random, requests

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/") + "/api"
passed = failed = 0


def check(name, ok, detail=""):
    global passed, failed
    passed, failed = (passed + 1, failed) if ok else (passed, failed + 1)
    print(("PASS  " if ok else "FAIL  ") + name + ("" if ok else f"   -> {detail}"))


def call(method, path, token=None, **kw):
    return requests.request(method, BASE + path, headers={"Authorization": token or ""}, timeout=90, **kw)


def answer_has(ans, *options):
    text = ans.replace(",", "").lower()
    return any(o.lower() in text for o in options)


def ask(token, db_id, question):
    r = call("POST", f"/databases/{db_id}/chat", token, json={"question": question})
    return r.json().get("answer", "") if r.ok else f"HTTP {r.status_code}: {r.text}"


# 1. server and Neon connection
r = call("GET", "/health")
check("server and database connection", r.ok and r.json().get("ok"), r.text)
if not r.ok:
    sys.exit("Cannot continue: fix DATABASE_URL and make sure the server is running.")

# 2. signup and login
email, pw = f"test{random.randint(10**6, 10**7)}@example.com", "secret123"
r = call("POST", "/signup", json={"email": email, "password": pw})
check("signup returns a token", r.ok and "token" in r.json(), r.text)
r = call("POST", "/login", json={"email": email, "password": pw})
check("login returns a token", r.ok and "token" in r.json(), r.text)
token = r.json()["token"]
check("wrong password is rejected", call("POST", "/login", json={"email": email, "password": "nope"}).status_code == 401)
check("request without token is rejected", call("GET", "/databases").status_code == 401)

# 3. create a database with custom columns
cols = [{"name": "name", "type": "text"}, {"name": "department", "type": "text"},
        {"name": "role", "type": "text"}, {"name": "salary", "type": "number"}]
r = call("POST", "/databases", token, json={"name": "Staff", "columns": cols})
check("create database", r.ok and "id" in r.json(), r.text)
db_id = r.json()["id"]

# 4. add data (this is what the dashboard does)
people = [("Ali", "Engineering", "Developer", 5000), ("Sara", "Engineering", "Lead", 7000),
          ("Omar", "Sales", "Rep", 4000), ("Hina", "Sales", "Manager", 6000), ("Zoya", "HR", "Officer", 4500)]
for n, d, ro, s in people:
    call("POST", f"/databases/{db_id}/records", token, json={"data": {"name": n, "department": d, "role": ro, "salary": s}})
rows = call("GET", f"/databases/{db_id}/records", token).json()
check("5 records saved", len(rows) == 5, f"got {len(rows)}")
bad = call("POST", f"/databases/{db_id}/records", token, json={"data": {"name": "X", "salary": "abc"}})
check("non-numeric salary is rejected", bad.status_code == 400, bad.text)

# 5. the AI reads the data
a = ask(token, db_id, "How many employees are there?")
check("AI: count is 5", answer_has(a, "5", "five"), a)
a = ask(token, db_id, "What is the average salary in the Engineering department?")
check("AI: Engineering average is 6000", answer_has(a, "6000"), a)
a = ask(token, db_id, "Who earns the most?")
check("AI: top earner is Sara", answer_has(a, "sara"), a)
a = ask(token, db_id, "What is the total salary of the Sales department?")
check("AI: Sales total is 10000", answer_has(a, "10000"), a)
a = ask(token, db_id, "List everyone earning more than 4500 in Sales")
check("AI: Hina matches, Omar does not", answer_has(a, "hina") and not answer_has(a, "omar"), a)

# 6. real-time sync: add a row, ask again, no refresh or re-indexing
call("POST", f"/databases/{db_id}/records", token, json={"data": {"name": "Bilal", "department": "Engineering", "role": "Developer", "salary": 8000}})
a = ask(token, db_id, "Who earns the most?")
check("SYNC: new record is the top earner", answer_has(a, "bilal"), a)
a = ask(token, db_id, "How many employees are there?")
check("SYNC: count is now 6", answer_has(a, "6", "six"), a)

# 7. edit and delete flow through to the AI too
rows = call("GET", f"/databases/{db_id}/records", token).json()
omar = next(x for x in rows if x["name"] == "Omar")
call("PUT", f"/databases/{db_id}/records/{omar['id']}", token,
     json={"data": {"name": "Omar", "department": "Sales", "role": "Rep", "salary": 9000}})
a = ask(token, db_id, "Who earns the most?")
check("SYNC: edited salary is picked up", answer_has(a, "omar"), a)
call("DELETE", f"/databases/{db_id}/records/{omar['id']}", token)
a = ask(token, db_id, "How many employees are there?")
check("SYNC: deleted record is gone (count 5)", answer_has(a, "5", "five"), a)

# 8. data isolation between users
r = call("POST", "/signup", json={"email": "other" + email, "password": pw})
other = r.json()["token"]
check("other user sees no databases", call("GET", "/databases", other).json() == [])
check("other user cannot read the records", call("GET", f"/databases/{db_id}/records", other).status_code == 404)
check("other user cannot chat with it", call("POST", f"/databases/{db_id}/chat", other, json={"question": "hi"}).status_code == 404)

# cleanup
call("DELETE", f"/databases/{db_id}", token)
print(f"\n{passed} passed, {failed} failed")
sys.exit(1 if failed else 0)
